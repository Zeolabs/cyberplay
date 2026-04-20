import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import ZAI from 'z-ai-web-dev-sdk';

// Helper: sleep for rate limiting
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Helper: extract slug from CrazyGames URL
function extractSlug(gameUrl: string): string {
  try {
    const url = new URL(gameUrl);
    const parts = url.pathname.split('/').filter(Boolean);
    // CrazyGames URLs look like: /game/slug-name
    // The slug is typically the last segment
    if (parts.length > 0) {
      return parts[parts.length - 1];
    }
    return '';
  } catch {
    return '';
  }
}

// Helper: try to extract og:image from HTML
function extractOgImage(html: string): string | null {
  const match = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
  if (match && match[1]) {
    return decodeHtmlEntities(match[1]);
  }
  // Also try content before property
  const altMatch = html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i);
  if (altMatch && altMatch[1]) {
    return decodeHtmlEntities(altMatch[1]);
  }
  return null;
}

// Helper: decode HTML entities in URLs
function decodeHtmlEntities(str: string): string {
  return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}

// Helper: try to fetch a URL and check if it returns an image (status 200)
async function tryImageUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.startsWith('image/')) {
        return url;
      }
      // Some CDNs don't return content-type on HEAD, try GET
      const getRes = await fetch(url, { method: 'GET', redirect: 'follow' });
      if (getRes.ok) {
        const getContentType = getRes.headers.get('content-type') || '';
        if (getContentType.startsWith('image/')) {
          return url;
        }
      }
    }
  } catch {
    // URL not reachable
  }
  return null;
}

// Process a single game to find its thumbnail
async function processGame(
  game: { id: string; gameUrl: string; thumbnailUrl: string },
  zai: Awaited<ReturnType<typeof ZAI.create>>,
): Promise<{ id: string; fixed: boolean; url: string; method: string }> {
  const slug = extractSlug(game.gameUrl);

  // Strategy 1: Use page_reader to extract og:image
  try {
    const result = await zai.functions.invoke('page_reader', { url: game.gameUrl });
    if (result?.data?.html) {
      let ogImage = extractOgImage(result.data.html);
      if (ogImage) {
        // Ensure URL params are optimized for thumbnail display
        try {
          const urlObj = new URL(ogImage);
          urlObj.searchParams.set('metadata', 'none');
          urlObj.searchParams.set('quality', '85');
          urlObj.searchParams.set('width', '480');
          urlObj.searchParams.set('fit', 'crop');
          ogImage = urlObj.toString();
        } catch {
          // URL construction failed, use as-is
        }
        return { id: game.id, fixed: true, url: ogImage, method: 'page_reader' };
      }
    }
  } catch {
    // page_reader failed, continue to fallbacks
  }

  // Strategy 2: Construct CDN URLs from slug
  if (slug) {
    const patterns = [
      `https://imgs.crazygames.com/${slug}_16x9/${slug}_16x9-cover?metadata=none&quality=85&width=480&fit=crop`,
      `https://imgs.crazygames.com/games/${slug}/cover_16x9.png?metadata=none&quality=85&width=480&fit=crop`,
      `https://imgs.crazygames.com/${slug}.png?metadata=none&quality=85&width=480&fit=crop`,
    ];

    for (const url of patterns) {
      const validUrl = await tryImageUrl(url);
      if (validUrl) {
        return { id: game.id, fixed: true, url: validUrl, method: `cdn_pattern` };
      }
    }
  }

  return { id: game.id, fixed: false, url: '', method: 'none' };
}

export async function POST() {
  try {
    // Find all games with empty thumbnailUrl
    const games = await db.game.findMany({
      where: {
        OR: [
          { thumbnailUrl: '' },
          { thumbnailUrl: { not: { startsWith: 'http' } } },
        ],
      },
      select: {
        id: true,
        gameUrl: true,
        thumbnailUrl: true,
      },
    });

    if (games.length === 0) {
      return NextResponse.json({
        total: 0,
        fixed: 0,
        failed: 0,
        details: [],
        message: 'No games with missing thumbnails found.',
      });
    }

    const zai = await ZAI.create();
    const results: Array<{ id: string; fixed: boolean; url: string; method: string; title?: string }> = [];
    const BATCH_SIZE = 3;
    const DELAY_MS = 1000;

    // Process in batches of 3 concurrent
    for (let i = 0; i < games.length; i += BATCH_SIZE) {
      const batch = games.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map((game) => processGame(game, zai)),
      );

      // Update games that got a thumbnail
      for (const result of batchResults) {
        if (result.fixed) {
          await db.game.update({
            where: { id: result.id },
            data: { thumbnailUrl: result.url },
          });
        }
        results.push(result);
      }

      // Delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < games.length) {
        await sleep(DELAY_MS);
      }
    }

    const fixedCount = results.filter((r) => r.fixed).length;
    const failedCount = results.filter((r) => !r.fixed).length;

    return NextResponse.json({
      total: games.length,
      fixed: fixedCount,
      failed: failedCount,
      details: results,
      message: `Processed ${games.length} games. Fixed ${fixedCount} thumbnails, ${failedCount} failed.`,
    });
  } catch (error) {
    console.error('Failed to fix thumbnails:', error);
    return NextResponse.json(
      { error: 'Failed to fix thumbnails', details: String(error) },
      { status: 500 },
    );
  }
}

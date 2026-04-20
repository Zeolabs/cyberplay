import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Browser-like headers for direct fetch (no SDK needed!)
const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Extract slug from CrazyGames embed URL
function extractSlug(gameUrl: string): string {
  try {
    const url = new URL(gameUrl);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  } catch {}
  return '';
}

// Extract og:image from HTML meta tags
function extractOgImage(html: string): string | null {
  const match = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
  if (match?.[1]) return decodeHtmlEntities(match[1]);
  const altMatch = html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i);
  if (altMatch?.[1]) return decodeHtmlEntities(altMatch[1]);
  return null;
}

function decodeHtmlEntities(str: string): string {
  return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}

// Extract image from __NEXT_DATA__
function extractImageFromNextData(html: string): string | null {
  const match = html.match(/<script\s+id="__NEXT_DATA__"\s+type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) return null;
  try {
    const jsonStr = match[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
    const data = JSON.parse(jsonStr);

    // Navigate to game data in props.pageProps.game
    const props = (data as Record<string, unknown>)?.props as Record<string, unknown> | undefined;
    const game = props?.game as Record<string, unknown> | undefined;
    if (!game) return null;

    // Try various image fields
    const fields = ['imageCover', 'thumbnailUrl', 'image', 'coverImage', 'cover'];
    for (const field of fields) {
      const val = game[field];
      if (val && typeof val === 'string') {
        let url = val;
        if (url.startsWith('//')) url = `https:${url}`;
        if (!url.includes('?')) url += '?metadata=none&quality=85&width=480&fit=crop';
        return url;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Check if URL returns a valid image
async function tryImageUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const ct = res.headers.get('content-type') || '';
      if (ct.startsWith('image/')) return url;
    }
  } catch {}
  return null;
}

// Fetch CrazyGames game page directly (no SDK!)
async function fetchGamePage(pageUrl: string): Promise<string> {
  try {
    const res = await fetch(pageUrl, {
      headers: FETCH_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) return await res.text();
  } catch {}
  return '';
}

// Process a single game to find its thumbnail
async function processGame(game: { id: string; gameUrl: string; thumbnailUrl: string }): Promise<{
  id: string;
  fixed: boolean;
  url: string;
  method: string;
}> {
  const slug = extractSlug(game.gameUrl);

  // Strategy 1: Fetch the CrazyGames page and extract from __NEXT_DATA__ + og:image
  const gamePageUrl = `https://www.crazygames.com/game/${slug}`;
  const html = await fetchGamePage(gamePageUrl);

  if (html) {
    // Try __NEXT_DATA__ first
    const nextDataImage = extractImageFromNextData(html);
    if (nextDataImage) {
      return { id: game.id, fixed: true, url: nextDataImage, method: 'next_data' };
    }

    // Try og:image
    const ogImage = extractOgImage(html);
    if (ogImage) {
      let url = ogImage;
      try {
        const urlObj = new URL(url);
        urlObj.searchParams.set('metadata', 'none');
        urlObj.searchParams.set('quality', '85');
        urlObj.searchParams.set('width', '480');
        urlObj.searchParams.set('fit', 'crop');
        url = urlObj.toString();
      } catch {}
      return { id: game.id, fixed: true, url, method: 'og_image' };
    }
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
        return { id: game.id, fixed: true, url: validUrl, method: 'cdn_pattern' };
      }
    }
  }

  return { id: game.id, fixed: false, url: '', method: 'none' };
}

export async function POST() {
  try {
    // Find all games with empty or missing thumbnailUrl
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
        message: 'No games with missing thumbnails found.',
      });
    }

    const results: Array<{ id: string; fixed: boolean; url: string; method: string }> = [];

    // Process all games (no SDK = no rate limit concerns, but be polite with small delay)
    for (let i = 0; i < games.length; i++) {
      const result = await processGame(games[i]);
      results.push(result);

      if (result.fixed) {
        await db.game.update({
          where: { id: result.id },
          data: { thumbnailUrl: result.url },
        });
      }

      // Small delay between each game (be polite to CrazyGames)
      if (i < games.length - 1) {
        await sleep(300);
      }
    }

    const fixedCount = results.filter((r) => r.fixed).length;
    const failedCount = results.filter((r) => !r.fixed).length;

    return NextResponse.json({
      total: games.length,
      fixed: fixedCount,
      failed: failedCount,
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

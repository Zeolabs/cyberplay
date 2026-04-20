import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// Browser-like headers for direct fetch (no SDK needed!)
const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

interface VideoSize {
  width: number;
  height: number;
  location: string;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fetch CrazyGames game page directly (no SDK!)
async function fetchGamePage(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) return await res.text();
    console.error(`[fix-urls] HTTP ${res.status} for ${url}`);
  } catch (err) {
    console.error(`[fix-urls] Failed to fetch ${url}:`, err);
  }
  return '';
}

// Extract slug from CrazyGames URL
function extractSlugFromUrl(gameUrl: string): string {
  try {
    const url = new URL(gameUrl);
    const parts = url.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || '';
  } catch {
    return '';
  }
}

async function processGame(game: { id: string; gameUrl: string }) {
  const slug = extractSlugFromUrl(game.gameUrl);
  const pageUrl = `https://www.crazygames.com/game/${slug}`;
  console.log(`[fix-urls] Fetching: ${pageUrl}`);

  // Fetch the page directly — no SDK!
  const html = await fetchGamePage(pageUrl);

  if (!html) {
    return { id: game.id, success: false, error: 'fetch_failed' };
  }

  // Extract __NEXT_DATA__ JSON
  const nextDataMatch = html.match(/<script[^>]*id=['"]__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!nextDataMatch?.[1]) {
    return { id: game.id, success: false, error: 'no_next_data' };
  }

  let nextData: Record<string, unknown>;
  try {
    nextData = JSON.parse(
      nextDataMatch[1]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
    );
  } catch {
    return { id: game.id, success: false, error: 'parse_error' };
  }

  const pageProps = nextData.props as Record<string, unknown> | undefined;
  const gameData = pageProps?.game as Record<string, unknown> | undefined;
  if (!gameData) {
    return { id: game.id, success: false, error: 'no_game_data' };
  }

  const allowEmbed = gameData.allowEmbed as boolean | undefined;
  const desktopUrl = gameData.desktopUrl as string | undefined;

  // Extract video URL
  let videoUrl = '';
  const videos = gameData.videos as Record<string, unknown> | undefined;
  if (videos) {
    const sizes = videos.sizes as VideoSize[] | undefined;
    const original = videos.original as string | undefined;

    if (sizes && Array.isArray(sizes) && sizes.length > 0) {
      const hoverSize = sizes.find(s => s.width >= 364 && s.width <= 494) ||
        sizes.find(s => s.width >= 300 && s.width <= 600) ||
        sizes[0];
      if (hoverSize?.location) {
        videoUrl = `https://videos.crazygames.com/${hoverSize.location}`;
      }
    }
    if (!videoUrl && original) {
      videoUrl = `https://videos.crazygames.com/${original}`;
    }
  }

  // Build update data
  const updateData: Record<string, string> = {};
  let fixedUrl = false;
  let fixedVideo = false;

  if (allowEmbed && desktopUrl) {
    updateData.gameUrl = desktopUrl;
    fixedUrl = true;
  }
  if (videoUrl) {
    updateData.videoUrl = videoUrl;
    fixedVideo = true;
  }

  if (Object.keys(updateData).length > 0) {
    try {
      await db.game.update({
        where: { id: game.id },
        data: updateData,
      });
    } catch {
      return { id: game.id, success: false, error: 'db_update_failed' };
    }
  }

  return { id: game.id, success: true, fixedUrl, fixedVideo };
}

export async function POST(request: Request) {
  try {
    // Find all games with broken CrazyGames page URLs
    const games = await db.game.findMany({
      where: {
        gameUrl: { contains: 'crazygames.com/game/' },
      },
      select: { id: true, gameUrl: true },
    });

    if (games.length === 0) {
      return NextResponse.json({
        total: 0,
        message: 'No games with broken CrazyGames URLs found.',
      });
    }

    console.log(`[fix-urls] Found ${games.length} games to process`);

    const results = {
      total: games.length,
      fixedUrls: 0,
      fixedVideos: 0,
      failed: 0,
    };

    // Process games (no SDK = no rate limits! Just be polite with small delays)
    const batchSize = 3;
    for (let i = 0; i < games.length; i += batchSize) {
      const batch = games.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(game => processGame(game)));

      for (const result of batchResults) {
        if (result.success) {
          if (result.fixedUrl) results.fixedUrls++;
          if (result.fixedVideo) results.fixedVideos++;
        } else {
          results.failed++;
        }
      }

      // Small delay between batches
      if (i + batchSize < games.length) {
        await sleep(500);
      }
    }

    console.log(`[fix-urls] Complete: ${JSON.stringify(results)}`);
    return NextResponse.json(results);
  } catch (error) {
    console.error('[fix-urls] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fix game URLs', details: String(error) },
      { status: 500 },
    );
  }
}

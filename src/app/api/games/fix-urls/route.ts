import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null;

async function getZai() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

interface VideoSize {
  width: number;
  height: number;
  location: string;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processGame(game: { id: string; gameUrl: string }) {
  const url = game.gameUrl;
  console.log(`[fix-urls] Fetching page: ${url}`);

  let html: string;
  try {
    const zai = await getZai();
    const result = await zai.functions.invoke('page_reader', { url });
    html = String(result?.data?.html || result?.html || '');
  } catch (err) {
    console.error(`[fix-urls] Failed to fetch ${url}:`, err);
    return { id: game.id, success: false, error: 'fetch_failed' };
  }

  if (!html) {
    return { id: game.id, success: false, error: 'empty_html' };
  }

  // Extract __NEXT_DATA__ JSON
  const nextDataMatch = html.match(/<script[^>]*id=['"]__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!nextDataMatch || !nextDataMatch[1]) {
    console.error(`[fix-urls] No __NEXT_DATA__ found for ${url}`);
    return { id: game.id, success: false, error: 'no_next_data' };
  }

  let nextData: Record<string, unknown>;
  try {
    nextData = JSON.parse(nextDataMatch[1]);
  } catch (err) {
    console.error(`[fix-urls] Failed to parse __NEXT_DATA__ for ${url}:`, err);
    return { id: game.id, success: false, error: 'parse_error' };
  }

  // Navigate to game data
  const pageProps = nextData.props as Record<string, unknown> | undefined;
  if (!pageProps) {
    return { id: game.id, success: false, error: 'no_page_props' };
  }

  const gameData = pageProps.game as Record<string, unknown> | undefined;
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
      // Find best size for card hover (width ~364-494px)
      const hoverSize = sizes.find(
        (s) => s.width >= 364 && s.width <= 494
      ) || sizes.find(
        (s) => s.width >= 300 && s.width <= 600
      ) || sizes.reduce((best, s) =>
        (s.width >= 300 && (!best || Math.abs(s.width - 420) < Math.abs(best.width - 420))) ? s : best,
        sizes[0]
      );

      if (hoverSize?.location) {
        videoUrl = `https://videos.crazygames.com/${hoverSize.location}`;
      }
    }

    // Fallback to original if no suitable size found
    if (!videoUrl && original) {
      videoUrl = `https://videos.crazygames.com/${original}`;
    }
  }

  // Build update data
  const updateData: Record<string, string> = {};
  let fixedUrl = false;
  let fixedVideo = false;

  // Only update gameUrl if allowEmbed is true and we have a desktopUrl
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
      console.log(`[fix-urls] Updated game ${game.id}: url=${fixedUrl}, video=${fixedVideo}`);
    } catch (err) {
      console.error(`[fix-urls] DB update failed for ${game.id}:`, err);
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

    // Process in batches of 2 concurrent with 1.5s delay between batches
    const batchSize = 2;
    for (let i = 0; i < games.length; i += batchSize) {
      const batch = games.slice(i, i + batchSize);

      const batchResults = await Promise.all(
        batch.map((game) => processGame(game))
      );

      for (const result of batchResults) {
        if (result.success) {
          if (result.fixedUrl) results.fixedUrls++;
          if (result.fixedVideo) results.fixedVideos++;
        } else {
          results.failed++;
        }
      }

      // Delay between batches (except after the last batch)
      if (i + batchSize < games.length) {
        await sleep(1500);
      }
    }

    console.log(`[fix-urls] Complete: ${JSON.stringify(results)}`);
    return NextResponse.json(results);
  } catch (error) {
    console.error('[fix-urls] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fix game URLs', details: String(error) },
      { status: 500 }
    );
  }
}

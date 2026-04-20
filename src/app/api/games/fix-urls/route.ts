import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { sleep, extractSlug, decodeHtmlEntities, fetchPage } from '@/lib/fetch-utils';

interface VideoSize {
  width: number;
  height: number;
  location: string;
}

async function processGame(game: { id: string; gameUrl: string }) {
  const slug = extractSlug(game.gameUrl);
  const pageUrl = `https://www.crazygames.com/game/${slug}`;
  console.log(`[fix-urls] Fetching: ${pageUrl}`);

  const html = await fetchPage(pageUrl);

  if (!html) {
    return { id: game.id, success: false, error: 'fetch_failed' };
  }

  const nextDataMatch = html.match(/<script[^>]*id=['"]__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!nextDataMatch?.[1]) {
    return { id: game.id, success: false, error: 'no_next_data' };
  }

  let nextData: Record<string, unknown>;
  try {
    nextData = JSON.parse(decodeHtmlEntities(nextDataMatch[1]));
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

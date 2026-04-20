import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { FETCH_HEADERS, HEAD_TIMEOUT, FETCH_TIMEOUT, sleep, extractSlug, extractOgImage, decodeHtmlEntities, fetchPage } from '@/lib/fetch-utils';

// Check if URL returns a valid image
async function tryImageUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(HEAD_TIMEOUT) });
    if (res.ok) {
      const ct = res.headers.get('content-type') || '';
      if (ct.startsWith('image/')) return url;
    }
  } catch {}
  return null;
}

// Extract image from __NEXT_DATA__
function extractImageFromNextData(html: string): string | null {
  const match = html.match(/<script\s+id="__NEXT_DATA__"\s+type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) return null;
  try {
    const jsonStr = decodeHtmlEntities(match[1]);
    const data = JSON.parse(jsonStr);

    const props = (data as Record<string, unknown>)?.props as Record<string, unknown> | undefined;
    const game = props?.game as Record<string, unknown> | undefined;
    if (!game) return null;

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

// Process a single game to find its thumbnail
async function processGame(game: { id: string; gameUrl: string; thumbnailUrl: string }): Promise<{
  id: string;
  fixed: boolean;
  url: string;
  method: string;
}> {
  const slug = extractSlug(game.gameUrl);

  const gamePageUrl = `https://www.crazygames.com/game/${slug}`;
  const html = await fetchPage(gamePageUrl, FETCH_TIMEOUT);

  if (html) {
    const nextDataImage = extractImageFromNextData(html);
    if (nextDataImage) {
      return { id: game.id, fixed: true, url: nextDataImage, method: 'next_data' };
    }

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

    for (let i = 0; i < games.length; i++) {
      const result = await processGame(games[i]);
      results.push(result);

      if (result.fixed) {
        await db.game.update({
          where: { id: result.id },
          data: { thumbnailUrl: result.url },
        });
      }

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

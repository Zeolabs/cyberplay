import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

// CrazyGames genre categories with their page slugs
const CRAZYGAMES_GENRES = [
  { name: 'Action', slug: 'action', icon: '⚔️' },
  { name: 'Shooting', slug: 'shooting', icon: '🔫' },
  { name: 'Racing', slug: 'racing', icon: '🏎️' },
  { name: 'Puzzle', slug: 'puzzle', icon: '🧩' },
  { name: 'Arcade', slug: 'arcade', icon: '👾' },
  { name: 'Adventure', slug: 'adventure', icon: '🗺️' },
  { name: 'Sports', slug: 'sports', icon: '⚽' },
  { name: 'Multiplayer', slug: 'multiplayer', icon: '👥' },
  { name: '2 Player', slug: '2-player', icon: '🤝' },
  { name: 'Stickman', slug: 'stickman', icon: '🧍' },
  { name: 'Idle', slug: 'idle', icon: '⏳' },
  { name: 'Simulation', slug: 'simulation', icon: '🏗️' },
  { name: 'Strategy', slug: 'strategy', icon: '♟️' },
  { name: 'Girls', slug: 'girls', icon: '👗' },
  { name: 'Skill', slug: 'skill', icon: '🎯' },
  { name: 'Platformer', slug: 'platformer', icon: '🦘' },
  { name: 'Driving', slug: 'driving', icon: '🚗' },
  { name: 'Escape', slug: 'escape', icon: '🚪' },
  { name: 'Sniper', slug: 'sniper', icon: '🎯' },
  { name: 'Clicker', slug: 'clicker', icon: '🖱️' },
] as const;

type FetchStatus = {
  status: 'idle' | 'fetching' | 'done' | 'error' | 'rate-limited';
  genre: string;
  message: string;
  total: number;
  current: number;
  gamesFound: number;
  genresDone: number;
  genresTotal: number;
  retries: number;
  rateLimitWaits: number;
};

const fetchStatus: FetchStatus = {
  status: 'idle',
  genre: '',
  message: '',
  total: 0,
  current: 0,
  gamesFound: 0,
  genresDone: 0,
  genresTotal: CRAZYGAMES_GENRES.length,
  retries: 0,
  rateLimitWaits: 0,
};

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Retry with exponential backoff for 429 rate limits
async function invokeWithRetry(
  zai: Awaited<ReturnType<typeof ZAI.create>>,
  fn: 'page_reader' | 'web_search',
  params: Record<string, unknown>,
  maxRetries = 3,
  baseDelayMs = 8000,
  statusRef: typeof fetchStatus,
): Promise<unknown> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await zai.functions.invoke(fn, params);
      return result;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const isRateLimit = errMsg.includes('429') || errMsg.includes('Too many requests');

      if (isRateLimit && attempt < maxRetries) {
        const waitTime = baseDelayMs * Math.pow(2, attempt) + Math.random() * 2000;
        statusRef.rateLimitWaits++;
        statusRef.message = `Rate limited. Waiting ${Math.round(waitTime / 1000)}s before retry (${attempt + 1}/${maxRetries})...`;
        console.log(`[fetch-categories] Rate limited, waiting ${Math.round(waitTime / 1000)}s (attempt ${attempt + 1}/${maxRetries})`);
        await delay(waitTime);
        statusRef.retries++;
        continue;
      }

      if (isRateLimit) {
        statusRef.status = 'rate-limited';
        statusRef.message = `Rate limited after ${maxRetries} retries. Pausing 30s...`;
        console.log(`[fetch-categories] Rate limited, pausing 30s`);
        await delay(30000);
        statusRef.status = 'fetching';
        // Try one more time after the long pause
        try {
          const result = await zai.functions.invoke(fn, params);
          statusRef.rateLimitWaits++;
          return result;
        } catch {
          throw new Error(`Rate limited even after 30s pause: ${errMsg}`);
        }
      }

      throw err;
    }
  }
  throw new Error('Max retries exceeded');
}

// Parse __NEXT_DATA__ from CrazyGames HTML to extract game list
function parseNextData(html: string): Array<{
  slug: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  gameUrl: string;
}> {
  const games: Array<{
    slug: string;
    title: string;
    description: string;
    thumbnailUrl: string;
    gameUrl: string;
  }> = [];

  // Strategy 1: Extract __NEXT_DATA__ JSON (most reliable)
  const nextDataMatch = html.match(/<script\s+id="__NEXT_DATA__"\s+type="application\/json">([\s\S]*?)<\/script>/);
  if (nextDataMatch) {
    try {
      const jsonStr = nextDataMatch[1]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"');
      const data = JSON.parse(jsonStr);

      // Navigate the Next.js data structure to find games
      // The game list is typically in props.pageProps.games or similar
      const extractGames = (obj: unknown, depth = 0): void => {
        if (depth > 8 || !obj || typeof obj !== 'object') return;

        if (Array.isArray(obj)) {
          for (const item of obj) {
            if (item && typeof item === 'object' && !Array.isArray(item)) {
              const rec = item as Record<string, unknown>;
              // Check if this looks like a game object
              if (rec.slug && (rec.title || rec.name || rec.gameTitle)) {
                const slug = String(rec.slug);
                const title = String(rec.title || rec.name || rec.gameTitle || '');
                const desc = String(rec.description || rec.teaser || '');
                const thumb = String(rec.imageCover || rec.thumbnailUrl || rec.image || rec.coverImage || '');
                const allowEmbed = rec.allowEmbed !== false && rec.isEmbeddable !== false;
                const desktopUrl = String(rec.desktopUrl || rec.gameUrl || '');

                if (slug && title && slug.length > 1) {
                  // Build embed URL
                  let gameUrl = '';
                  if (desktopUrl && allowEmbed) {
                    gameUrl = desktopUrl.startsWith('http') ? desktopUrl : `https://games.crazygames.com/en_US/${slug}/index.html`;
                  } else {
                    gameUrl = `https://games.crazygames.com/en_US/${slug}/index.html`;
                  }

                  // Build thumbnail URL
                  let thumbnailUrl = '';
                  if (thumb) {
                    if (thumb.startsWith('//')) thumbnailUrl = `https:${thumb}`;
                    else if (thumb.startsWith('http')) thumbnailUrl = thumb;
                    else thumbnailUrl = thumb;
                    // Add size params if no query params
                    if (!thumbnailUrl.includes('?')) {
                      thumbnailUrl += '?metadata=none&quality=85&width=480&fit=crop';
                    }
                  } else {
                    // Fallback: construct from slug
                    thumbnailUrl = `https://images.crazygames.com/${slug}/202x128?v=1&q=80&format=webp`;
                  }

                  games.push({
                    slug,
                    title,
                    description: desc || `${title} — Play free on CYBERPLAY!`,
                    thumbnailUrl,
                    gameUrl,
                  });
                }
              }
              extractGames(item, depth + 1);
            }
          }
        } else if (typeof obj === 'object' && obj !== null) {
          const rec = obj as Record<string, unknown>;
          for (const key of Object.keys(rec)) {
            extractGames(rec[key], depth + 1);
          }
        }
      };

      extractGames(data);
      return games;
    } catch (e) {
      console.error('[fetch-categories] Failed to parse __NEXT_DATA__:', e);
    }
  }

  // Strategy 2: Fallback - extract game links from HTML
  const seenSlugs = new Set<string>();
  const linkRegex = /crazygames\.com\/game\/([^/?"]+)/g;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const slug = match[1];
    if (seenSlugs.has(slug) || slug.length < 2) continue;
    seenSlugs.add(slug);

    const titleSlug = slug.replace(/-/g, ' ');
    games.push({
      slug,
      title: titleSlug.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      description: `${titleSlug} — Play free on CYBERPLAY!`,
      thumbnailUrl: `https://images.crazygames.com/${slug}/202x128?v=1&q=80&format=webp`,
      gameUrl: `https://games.crazygames.com/en_US/${slug}/index.html`,
    });
  }

  return games;
}

// ─── GET: returns current fetch status or list of genres ───────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode');

  if (mode === 'status') {
    return NextResponse.json(fetchStatus);
  }

  if (mode === 'genres') {
    const genresWithCounts = await Promise.all(
      CRAZYGAMES_GENRES.map(async (g) => {
        const count = await db.game.count({ where: { genre: g.name } });
        return { ...g, count };
      })
    );
    const noGenreCount = await db.game.count({ where: { genre: '' } });
    const totalCount = await db.game.count();
    return NextResponse.json([
      { name: 'All', slug: 'all', icon: '🎮', count: totalCount },
      { name: 'Uncategorized', slug: 'uncategorized', icon: '📦', count: noGenreCount },
      ...genresWithCounts,
    ]);
  }

  return NextResponse.json(CRAZYGAMES_GENRES);
}

// ─── POST: start bulk category fetch ──────────────────────────────────
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { genres: selectedGenres } = body;

  if (fetchStatus.status === 'fetching' || fetchStatus.status === 'rate-limited') {
    return NextResponse.json({ ...fetchStatus, message: 'Fetch already in progress' });
  }

  const genresToFetch = selectedGenres?.length
    ? CRAZYGAMES_GENRES.filter((g) => selectedGenres.includes(g.name))
    : CRAZYGAMES_GENRES;

  if (genresToFetch.length === 0) {
    return NextResponse.json({ error: 'No genres selected' }, { status: 400 });
  }

  // Start fetching in background
  fetchBulkGenres(genresToFetch).catch(console.error);

  return NextResponse.json({
    message: `Started fetching ${genresToFetch.length} genres`,
    genresTotal: genresToFetch.length,
  });
}

// ─── Core: fetch games from each genre page ────────────────────────────
async function fetchBulkGenres(genres: readonly typeof CRAZYGAMES_GENRES) {
  const zai = await ZAI.create();
  let totalGamesFound = 0;

  fetchStatus.status = 'fetching';
  fetchStatus.genresTotal = genres.length;
  fetchStatus.genresDone = 0;
  fetchStatus.gamesFound = 0;
  fetchStatus.retries = 0;
  fetchStatus.rateLimitWaits = 0;

  for (const genre of genres) {
    fetchStatus.genre = genre.name;
    fetchStatus.message = `Reading ${genre.name} page...`;

    try {
      // Read the CrazyGames tag/genre page
      const genreUrl = `https://www.crazygames.com/t/${genre.slug}`;
      console.log(`[fetch-categories] Fetching: ${genreUrl}`);

      const pageResult = await invokeWithRetry(
        zai,
        'page_reader',
        { url: genreUrl },
        3,
        8000,
        fetchStatus,
      );

      const html = String((pageResult as Record<string, unknown>)?.data?.html || '');
      const parsedGames = parseNextData(html);

      console.log(`[fetch-categories] ${genre.name}: parsed ${parsedGames.length} games from page`);

      fetchStatus.total = parsedGames.length;
      fetchStatus.current = 0;

      let savedInGenre = 0;
      for (const game of parsedGames) {
        fetchStatus.current++;

        const existing = await db.game.findFirst({
          where: { externalId: game.slug },
        });

        if (existing) {
          // Update genre if missing
          if (!existing.genre) {
            await db.game.update({
              where: { id: existing.id },
              data: { genre: genre.name },
            });
          } else {
            const genres = existing.genre.split(', ').filter(Boolean);
            if (!genres.includes(genre.name)) {
              genres.push(genre.name);
              await db.game.update({
                where: { id: existing.id },
                data: { genre: genres.slice(0, 3).join(', ') },
              });
            }
          }
          // Update thumbnail if empty
          if (!existing.thumbnailUrl && game.thumbnailUrl) {
            await db.game.update({
              where: { id: existing.id },
              data: { thumbnailUrl: game.thumbnailUrl },
            });
          }
        } else {
          await db.game.create({
            data: {
              title: game.title,
              description: game.description,
              category: 'HTML5',
              genre: genre.name,
              thumbnailUrl: game.thumbnailUrl,
              videoUrl: '',
              gameUrl: game.gameUrl,
              tags: game.title.toLowerCase().split(/\s+/).filter((w) => w.length > 2).slice(0, 5).join(', '),
              externalId: game.slug,
              rating: 3.5 + Math.random() * 1.5,
            },
          });
          savedInGenre++;
        }
      }

      totalGamesFound += savedInGenre;
      fetchStatus.gamesFound = totalGamesFound;
      fetchStatus.genresDone++;
      fetchStatus.message = `${genre.name}: ${savedInGenre} new, ${parsedGames.length} total`;
      console.log(`[fetch-categories] ${genre.name}: ${savedInGenre} new games saved`);

      // Longer delay between genres to avoid rate limits (8-12 seconds)
      await delay(8000 + Math.random() * 4000);
    } catch (err) {
      console.error(`[fetch-categories] Error fetching ${genre.name}:`, err);
      fetchStatus.message = `${genre.name}: Error - ${err instanceof Error ? err.message : 'Unknown'}`;
      fetchStatus.genresDone++;

      // If we got a hard rate limit, wait longer before trying next genre
      const errMsg = err instanceof Error ? err.message : '';
      if (errMsg.includes('429') || errMsg.includes('rate limit')) {
        console.log('[fetch-categories] Hard rate limit detected, pausing 30s before next genre');
        fetchStatus.message = `${genre.name}: Rate limited. Waiting 30s...`;
        await delay(30000);
      } else {
        await delay(3000);
      }
    }
  }

  fetchStatus.status = 'done';
  fetchStatus.message = `Done! ${totalGamesFound} new games across ${genres.length} genres (${fetchStatus.rateLimitWaits} rate limit waits, ${fetchStatus.retries} retries)`;
  console.log(`[fetch-categories] Complete: ${fetchStatus.message}`);
}

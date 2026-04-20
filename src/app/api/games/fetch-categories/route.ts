import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// CrazyGames tags — fetched dynamically from sidebar, with icon mapping
const CRAZYGAMES_TAGS = [
  { name: 'Action', slug: 'action', icon: '⚔️' },
  { name: 'Adventure', slug: 'adventure', icon: '🗺️' },
  { name: 'Basketball', slug: 'basketball', icon: '🏀' },
  { name: 'Bike', slug: 'bike', icon: '🚲' },
  { name: 'Car', slug: 'car', icon: '🚗' },
  { name: 'Card', slug: 'card', icon: '🃏' },
  { name: 'Casual', slug: 'casual', icon: '😎' },
  { name: 'Clicker', slug: 'clicker', icon: '🖱️' },
  { name: 'Controller', slug: 'controller', icon: '🎮' },
  { name: 'Driving', slug: 'driving', icon: '🚕' },
  { name: 'Escape', slug: 'escape', icon: '🚪' },
  { name: 'Flash', slug: 'flash', icon: '⚡' },
  { name: 'FPS', slug: 'first-person-shooter', icon: '🔫' },
  { name: 'Horror', slug: 'horror', icon: '👻' },
  { name: '.io', slug: 'io', icon: '🌐' },
  { name: 'Mahjong', slug: 'mahjong', icon: '🀄' },
  { name: 'Minecraft', slug: 'minecraft', icon: '⛏️' },
  { name: 'Multiplayer', slug: 'multiplayer', icon: '👥' },
  { name: 'Pool', slug: 'pool', icon: '🎱' },
  { name: 'Puzzle', slug: 'puzzle', icon: '🧩' },
  { name: 'Shooting', slug: 'shooting', icon: '🎯' },
  { name: 'Soccer', slug: 'soccer', icon: '⚽' },
  { name: 'Sports', slug: 'sports', icon: '🏆' },
  { name: 'Stickman', slug: 'stick', icon: '🧍' },
  { name: 'Thinky', slug: 'thinky', icon: '🧠' },
  { name: 'Tower Defense', slug: 'tower-defense', icon: '🏰' },
] as const;

type FetchStatus = {
  status: 'idle' | 'fetching' | 'done' | 'error';
  genre: string;
  message: string;
  total: number;
  current: number;
  gamesFound: number;
  genresDone: number;
  genresTotal: number;
};

const fetchStatus: FetchStatus = {
  status: 'idle',
  genre: '',
  message: '',
  total: 0,
  current: 0,
  gamesFound: 0,
  genresDone: 0,
  genresTotal: CRAZYGAMES_TAGS.length,
};

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Native HTTP fetch with browser-like headers (NO SDK!) ────────────
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchPage(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(30000),
    });
    if (res.ok) return await res.text();
    console.error(`[fetch] HTTP ${res.status} for ${url}`);
  } catch (err) {
    console.error(`[fetch] Failed: ${url}:`, err);
  }
  return '';
}

// ─── Parse CrazyGames tag page → extract games ─────────────────────────
interface CrazyGame {
  name: string;
  slug: string;
  cover: string;
  categoryName: string;
  videos: {
    sizes: Array<{ width: number; height: number; location: string }>;
  } | null;
}

function parseTagPage(html: string): CrazyGame[] {
  // Flexible regex: handles crossorigin and other attributes on script tag
  const match = html.match(/<script[^>]*id=['"]__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/);
  if (!match) return [];

  try {
    const jsonStr = match[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
    const data = JSON.parse(jsonStr);

    // Direct path: props.pageProps.games.items
    const raw = (data as Record<string, unknown>)?.props;
    const pp = raw as Record<string, unknown> | undefined;
    const gameContainer = pp?.pageProps as Record<string, unknown> | undefined;
    const gamesData = gameContainer?.games as Record<string, unknown> | undefined;
    const games = gamesData?.items as CrazyGame[] | undefined;

    if (Array.isArray(games)) return games;

    return [];
  } catch (e) {
    console.error('[parse] JSON parse error:', e);
    return [];
  }
}

// ─── Build URLs from game data ────────────────────────────────────────
function buildThumbnailUrl(cover: string): string {
  if (!cover) return '';
  return `https://images.crazygames.com/${cover}?metadata=none&quality=85&width=480&fit=crop`;
}

function buildVideoUrl(videos: CrazyGame['videos']): string {
  if (!videos?.sizes?.length) return '';
  // Find the 494px width (perfect for card hover) or closest
  const ideal = videos.sizes.find(s => s.width >= 364 && s.width <= 600);
  const size = ideal || videos.sizes[videos.sizes.length - 1];
  return size ? `https://videos.crazygames.com/${size.location}` : '';
}

function buildGameUrl(slug: string): string {
  return `https://games.crazygames.com/en_US/${slug}/index.html`;
}

// ─── GET: status, genres, or tag list ─────────────────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode');

  if (mode === 'status') {
    return NextResponse.json(fetchStatus);
  }

  if (mode === 'genres') {
    const genresWithCounts = await Promise.all(
      CRAZYGAMES_TAGS.map(async (g) => {
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

  return NextResponse.json(CRAZYGAMES_TAGS);
}

// ─── POST: start bulk tag fetch ───────────────────────────────────────
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { genres: selectedGenres } = body;

  if (fetchStatus.status === 'fetching') {
    return NextResponse.json({ ...fetchStatus, message: 'Fetch already in progress' });
  }

  const genresToFetch = selectedGenres?.length
    ? CRAZYGAMES_TAGS.filter((g) => selectedGenres.includes(g.name))
    : CRAZYGAMES_TAGS;

  if (genresToFetch.length === 0) {
    return NextResponse.json({ error: 'No genres selected' }, { status: 400 });
  }

  fetchBulkTags(genresToFetch).catch(console.error);

  return NextResponse.json({
    message: `Started fetching ${genresToFetch.length} tags (direct HTTP, no SDK)`,
    genresTotal: genresToFetch.length,
  });
}

// ─── Core: fetch games from each CrazyGames tag page ───────────────────
async function fetchBulkTags(tags: readonly typeof CRAZYGAMES_TAGS) {
  let totalNew = 0;

  fetchStatus.status = 'fetching';
  fetchStatus.genresTotal = tags.length;
  fetchStatus.genresDone = 0;
  fetchStatus.gamesFound = 0;

  for (const tag of tags) {
    fetchStatus.genre = tag.name;
    fetchStatus.message = `Fetching ${tag.name}...`;

    try {
      const url = `https://www.crazygames.com/t/${tag.slug}`;
      console.log(`[fetch] ${tag.name}: ${url}`);

      const html = await fetchPage(url);
      if (!html) {
        fetchStatus.genresDone++;
        fetchStatus.message = `${tag.name}: Empty response`;
        await delay(500);
        continue;
      }

      const games = parseTagPage(html);
      console.log(`[fetch] ${tag.name}: ${games.length} games`);

      fetchStatus.total = games.length;
      fetchStatus.current = 0;

      let savedInTag = 0;
      for (const game of games) {
        fetchStatus.current++;

        const existing = await db.game.findFirst({
          where: { externalId: game.slug },
        });

        const thumbnailUrl = buildThumbnailUrl(game.cover);
        const videoUrl = buildVideoUrl(game.videos);
        const gameUrl = buildGameUrl(game.slug);
        const description = `${game.name} — Play free on CYBERPLAY!`;
        const tagsText = game.name.toLowerCase().split(/\s+/).filter(w => w.length > 2).slice(0, 5).join(', ');

        if (existing) {
          // Update genre
          if (!existing.genre) {
            await db.game.update({ where: { id: existing.id }, data: { genre: tag.name } });
          } else {
            const genres = existing.genre.split(', ').filter(Boolean);
            if (!genres.includes(tag.name)) {
              genres.push(tag.name);
              await db.game.update({ where: { id: existing.id }, data: { genre: genres.slice(0, 3).join(', ') } });
            }
          }
          // Update missing fields
          const updates: Record<string, string> = {};
          if (!existing.thumbnailUrl && thumbnailUrl) updates.thumbnailUrl = thumbnailUrl;
          if (!existing.videoUrl && videoUrl) updates.videoUrl = videoUrl;
          if (Object.keys(updates).length > 0) {
            await db.game.update({ where: { id: existing.id }, data: updates });
          }
        } else {
          await db.game.create({
            data: {
              title: game.name,
              description,
              category: 'HTML5',
              genre: tag.name,
              thumbnailUrl,
              videoUrl,
              gameUrl,
              tags: tagsText,
              externalId: game.slug,
              rating: 3.5 + Math.random() * 1.5,
            },
          });
          savedInTag++;
        }
      }

      totalNew += savedInTag;
      fetchStatus.gamesFound = totalNew;
      fetchStatus.genresDone++;
      fetchStatus.message = `${tag.name}: +${savedInTag} new (${games.length} total)`;
      console.log(`[fetch] ${tag.name}: +${savedInTag} new`);

      // Polite delay (1s between tags — no SDK rate limit!)
      await delay(1000);
    } catch (err) {
      console.error(`[fetch] ${tag.name} error:`, err);
      fetchStatus.message = `${tag.name}: Error`;
      fetchStatus.genresDone++;
      await delay(500);
    }
  }

  fetchStatus.status = 'done';
  fetchStatus.message = `Done! ${totalNew} new games across ${tags.length} tags`;
  console.log(`[fetch] Complete: ${fetchStatus.message}`);
}

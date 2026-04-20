import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { PAGE_FETCH_TIMEOUT, sleep, decodeHtmlEntities, fetchPage, POLITE_DELAY } from '@/lib/fetch-utils';
import { CRAZYGAMES_BASE, CRAZYGAMES_GAMES, CRAZYGAMES_IMAGES, CRAZYGAMES_VIDEOS, FALLBACK_DESCRIPTION } from '@/lib/constants';

// CrazyGames tags — fetched dynamically from sidebar, with icon mapping
const CRAZYGAMES_TAGS = [
  { name: 'Action',        slug: 'action',               icon: 'Swords',         prefix: '/c' },
  { name: 'Adventure',     slug: 'adventure',            icon: 'Compass',        prefix: '/c' },
  { name: 'Basketball',    slug: 'basketball',           icon: 'CircleDot',      prefix: '/t' },
  { name: 'Bike',          slug: 'bike',                 icon: 'Bike',           prefix: '/t' },
  { name: 'Car',           slug: 'car',                  icon: 'Car',            prefix: '/t' },
  { name: 'Card',          slug: 'card',                 icon: 'Layers',         prefix: '/c' },
  { name: 'Casual',        slug: 'casual',               icon: 'Smile',          prefix: '/t' },
  { name: 'Clicker',       slug: 'clicker',              icon: 'MousePointerClick', prefix: '/c' },
  { name: 'Controller',    slug: 'controller',           icon: 'Gamepad2',       prefix: '/t' },
  { name: 'Driving',       slug: 'driving',              icon: 'Truck',          prefix: '/c' },
  { name: 'Escape',        slug: 'escape',               icon: 'DoorOpen',       prefix: '/t' },
  { name: 'Flash',         slug: 'flash',                icon: 'Zap',            prefix: '/t' },
  { name: 'FPS',           slug: 'first-person-shooter', icon: 'Crosshair',      prefix: '/t' },
  { name: 'Horror',        slug: 'horror',               icon: 'Skull',          prefix: '/t' },
  { name: '.io',           slug: 'io',                   icon: 'Globe',          prefix: '/c' },
  { name: 'Mahjong',       slug: 'mahjong',              icon: 'Grid3X3',        prefix: '/t' },
  { name: 'Minecraft',     slug: 'minecraft',            icon: 'Pickaxe',        prefix: '/t' },
  { name: 'Multiplayer',   slug: 'multiplayer',          icon: 'Users',          prefix: '' },
  { name: 'Pool',          slug: 'pool',                 icon: 'Dices',          prefix: '/t' },
  { name: 'Puzzle',        slug: 'puzzle',               icon: 'Puzzle',         prefix: '/c' },
  { name: 'Shooting',      slug: 'shooting',             icon: 'Target',         prefix: '/c' },
  { name: 'Soccer',        slug: 'soccer',               icon: 'Goal',           prefix: '/t' },
  { name: 'Sports',        slug: 'sports',               icon: 'Trophy',         prefix: '/c' },
  { name: 'Stickman',      slug: 'stick',                icon: 'PersonStanding', prefix: '/t' },
  { name: 'Thinky',        slug: 'thinky',               icon: 'Brain',          prefix: '/t' },
  { name: 'Tower Defense', slug: 'tower-defense',        icon: 'Castle',         prefix: '/t' },
];

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
  const match = html.match(/<script[^>]*id=['"]__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/);
  if (!match) return [];

  try {
    const jsonStr = decodeHtmlEntities(match[1]);
    const data = JSON.parse(jsonStr);

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
  return `${CRAZYGAMES_IMAGES}/${cover}?metadata=none&quality=85&width=480&fit=crop`;
}

function buildVideoUrl(videos: CrazyGame['videos']): string {
  if (!videos?.sizes?.length) return '';
  const ideal = videos.sizes.find(s => s.width >= 364 && s.width <= 600);
  const size = ideal || videos.sizes[videos.sizes.length - 1];
  return size ? `${CRAZYGAMES_VIDEOS}/${size.location}` : '';
}

function buildGameUrl(slug: string): string {
  return `${CRAZYGAMES_GAMES}/en_US/${slug}/index.html`;
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
      { name: 'All', slug: 'all', icon: 'LayoutGrid', count: totalCount },
      { name: 'Uncategorized', slug: 'uncategorized', icon: 'Package', count: noGenreCount },
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
async function fetchBulkTags(tags: typeof CRAZYGAMES_TAGS) {
  let totalNew = 0;

  fetchStatus.status = 'fetching';
  fetchStatus.genresTotal = tags.length;
  fetchStatus.genresDone = 0;
  fetchStatus.gamesFound = 0;

  for (const tag of tags) {
    fetchStatus.genre = tag.name;
    fetchStatus.message = `Fetching ${tag.name}...`;

    try {
      const url = `${CRAZYGAMES_BASE}${tag.prefix}/${tag.slug}`;
      console.log(`[fetch] ${tag.name}: ${url}`);

      const html = await fetchPage(url, PAGE_FETCH_TIMEOUT);
      if (!html) {
        fetchStatus.genresDone++;
        fetchStatus.message = `${tag.name}: Empty response`;
        await sleep(POLITE_DELAY);
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
        const description = `${game.name} — ${FALLBACK_DESCRIPTION}`;
        const tagsText = game.name.toLowerCase().split(/\s+/).filter(w => w.length > 2).slice(0, 5).join(', ');

        if (existing) {
          if (!existing.genre) {
            await db.game.update({ where: { id: existing.id }, data: { genre: tag.name } });
          } else {
            const genres = existing.genre.split(', ').filter(Boolean);
            if (!genres.includes(tag.name)) {
              genres.push(tag.name);
              await db.game.update({ where: { id: existing.id }, data: { genre: genres.slice(0, 3).join(', ') } });
            }
          }
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

      await sleep(1000);
    } catch (err) {
      console.error(`[fetch] ${tag.name} error:`, err);
      fetchStatus.message = `${tag.name}: Error`;
      fetchStatus.genresDone++;
      await sleep(POLITE_DELAY);
    }
  }

  fetchStatus.status = 'done';
  fetchStatus.message = `Done! ${totalNew} new games across ${tags.length} tags`;
  console.log(`[fetch] Complete: ${fetchStatus.message}`);
}

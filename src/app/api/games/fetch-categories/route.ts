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
  { name: 'Mouse', slug: 'mouse', icon: '🖱️' },
  { name: 'Sniper', slug: 'sniper', icon: '🎯' },
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
  genresTotal: CRAZYGAMES_GENRES.length,
};

function extractSlugFromUrl(url: string): string | null {
  const match = url.match(/crazygames\.com\/game\/([^/?]+)/);
  return match ? match[1] : null;
}

function extractGameTitle(raw: string): string {
  return raw
    .replace(/[🕹️🎮🕹\s]+Play on CrazyGames.*$/i, '')
    .replace(/[\s]*- Play Online.*$/i, '')
    .replace(/[\s]*- CrazyGames.*$/i, '')
    .replace(/[\s]*Free Online Game.*$/i, '')
    .trim();
}

function buildThumbnailUrl(slug: string): string {
  return `https://images.crazygames.com/${slug}/202x128?v=1&q=80&format=webp`;
}

async function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// GET: returns current fetch status or list of available genres
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

// POST: start bulk category fetch
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { genres: selectedGenres } = body;

  if (fetchStatus.status === 'fetching') {
    return NextResponse.json({ ...fetchStatus, message: 'Fetch already in progress' });
  }

  const genresToFetch = selectedGenres?.length
    ? CRAZYGAMES_GENRES.filter((g) => selectedGenres.includes(g.name))
    : CRAZYGAMES_GENRES;

  if (genresToFetch.length === 0) {
    return NextResponse.json({ error: 'No genres selected' }, { status: 400 });
  }

  fetchBulkGenres(genresToFetch).catch(console.error);

  return NextResponse.json({ message: `Started fetching ${genresToFetch.length} genres`, genresTotal: genresToFetch.length });
}

async function fetchBulkGenres(genres: typeof CRAZYGAMES_GENRES) {
  const zai = await ZAI.create();
  let totalGamesFound = 0;

  fetchStatus.status = 'fetching';
  fetchStatus.genresTotal = genres.length;
  fetchStatus.genresDone = 0;
  fetchStatus.gamesFound = 0;

  for (const genre of genres) {
    fetchStatus.genre = genre.name;
    fetchStatus.message = `Fetching ${genre.name} games...`;

    try {
      const games = await fetchGamesForGenre(zai, genre);
      fetchStatus.current = games.length;
      fetchStatus.total = games.length;

      let savedInGenre = 0;
      for (const game of games) {
        const existing = await db.game.findFirst({
          where: { externalId: game.slug },
        });

        if (existing) {
          if (!existing.genre) {
            await db.game.update({
              where: { id: existing.id },
              data: { genre: genre.name },
            });
            savedInGenre++;
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
        } else {
          const thumbUrl = game.thumbnailUrl || buildThumbnailUrl(game.slug);
          await db.game.create({
            data: {
              title: game.title,
              description: game.description,
              category: 'HTML5',
              genre: genre.name,
              thumbnailUrl: thumbUrl,
              videoUrl: '',
              gameUrl: `https://games.crazygames.com/en_US/${game.slug}/index.html`,
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
      fetchStatus.message = `${genre.name}: ${savedInGenre} games saved (${games.length} found)`;
    } catch (err) {
      console.error(`Error fetching ${genre.name}:`, err);
      fetchStatus.message = `${genre.name}: Error - ${err instanceof Error ? err.message : 'Unknown'}`;
      fetchStatus.genresDone++;
    }

    await delay(800);
  }

  fetchStatus.status = 'done';
  fetchStatus.message = `Done! Fetched ${totalGamesFound} total games across ${genres.length} genres`;
}

async function fetchGamesForGenre(zai: ZAI, genre: { name: string; slug: string }): Promise<
  { slug: string; title: string; description: string; thumbnailUrl: string }[]
> {
  const allGames: { slug: string; title: string; description: string; thumbnailUrl: string }[] = [];
  const seenSlugs = new Set<string>();

  const searchQueries = [
    `site:crazygames.com/game ${genre.slug} games`,
    `crazygames.com ${genre.name.toLowerCase()} games play online`,
    `best ${genre.name.toLowerCase()} games crazygames`,
  ];

  for (const query of searchQueries) {
    try {
      const results = await zai.functions.invoke('web_search', {
        query,
        num: 15,
      });
      if (!Array.isArray(results)) continue;

      for (const result of results) {
        const url = result.url || '';
        const slug = extractSlugFromUrl(url);
        if (!slug || seenSlugs.has(slug)) continue;

        seenSlugs.add(slug);
        const title = extractGameTitle(result.name || '');
        if (!title || title.length < 2) continue;

        const description = (result.snippet || '').replace(/^Free\s*·\s*Game\s*/i, '').trim();

        allGames.push({
          slug,
          title,
          description: description || `${title} — Play free on CYBERPLAY!`,
          thumbnailUrl: '',
        });
      }
      await delay(300);
    } catch {
      // Continue
    }
  }

  // Read the CrazyGames genre page
  try {
    const genreUrl = `https://www.crazygames.com/t/${genre.slug}`;
    const pageResult = await zai.functions.invoke('page_reader', { url: genreUrl });
    const html = String(pageResult?.data?.html || '');

    const linkRegex = /crazygames\.com\/game\/([^/?"]+)/g;
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      const slug = match[1];
      if (seenSlugs.has(slug) || slug.length < 2) continue;
      seenSlugs.add(slug);

      const titleSlug = slug.replace(/-/g, ' ');
      allGames.push({
        slug,
        title: titleSlug
          .split(' ')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' '),
        description: `${titleSlug} — Play free on CYBERPLAY!`,
        thumbnailUrl: '',
      });
    }

    // Match og:images to games
    const ogImages: string[] = [];
    const ogImgRegex = /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/gi;
    while ((match = ogImgRegex.exec(html)) !== null) {
      ogImages.push(match[1].replace(/&amp;/g, '&'));
    }

    for (let i = 0; i < Math.min(allGames.length, ogImages.length); i++) {
      if (!allGames[i].thumbnailUrl) {
        allGames[i].thumbnailUrl = ogImages[i].replace(/\?.*$/, '') + '?metadata=none&quality=85&width=480&fit=crop';
      }
    }

    await delay(500);
  } catch {
    // Continue
  }

  return allGames;
}

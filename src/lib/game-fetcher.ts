import ZAI from 'z-ai-web-dev-sdk';
import { db } from '@/lib/db';

// ─── Types ───────────────────────────────────────────────────────────
export interface FetchedGame {
  title: string;
  description: string;
  category: 'HTML5' | 'UNITY_WEBGL' | 'FLASH';
  thumbnailUrl: string;
  gameUrl: string;
  tags: string;
  externalId: string;
  sourceUrl: string;
}

export interface FetchProgress {
  status: 'idle' | 'searching' | 'fetching_thumbs' | 'saving' | 'done' | 'error';
  message: string;
  total: number;
  current: number;
  games: FetchedGame[];
}

// ─── In-Memory Progress Tracker ─────────────────────────────────────
const progressMap = new Map<string, FetchProgress>();

export function getProgress(sourceId: string): FetchProgress {
  return progressMap.get(sourceId) || {
    status: 'idle',
    message: 'Not started',
    total: 0,
    current: 0,
    games: [],
  };
}

export function updateProgress(sourceId: string, update: Partial<FetchProgress>) {
  const prev = getProgress(sourceId);
  progressMap.set(sourceId, { ...prev, ...update });
}

// ─── Utility: Extract og:image from HTML ───────────────────────────
function extractOgImage(html: string): string {
  // Try og:image first
  const ogMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
  if (ogMatch) {
    let url = ogMatch[1]
      .replace(/&amp;/g, '&')
      .replace(/\?.*$/, '');  // strip query params for clean URL
    // Re-add essential params for a decent thumbnail
    url += '?metadata=none&quality=85&width=480&fit=crop';
    return url;
  }
  return '';
}

// ─── Utility: Extract thumbnail from page_reader ───────────────────
async function fetchThumbnailFromPage(zai: ZAI, pageUrl: string): Promise<string> {
  try {
    const result = await zai.functions.invoke('page_reader', { url: pageUrl });
    const html = String(result?.data?.html || '');
    return extractOgImage(html);
  } catch {
    return '';
  }
}

// ─── Source Fetcher Base ────────────────────────────────────────────
interface SourceFetcher {
  type: string;
  search(query: string, num?: number): Promise<FetchedGame[]>;
  fetchThumbnail(zai: ZAI, gameUrl: string): Promise<string>;
}

// ─── CrazyGames Fetcher ─────────────────────────────────────────────
class CrazyGamesFetcher implements SourceFetcher {
  type = 'CRAZYGAMES';
  private zai: ZAI | null = null;

  async getZai(): Promise<ZAI> {
    if (!this.zai) {
      this.zai = await ZAI.create();
    }
    return this.zai;
  }

  async search(query: string, num = 10): Promise<FetchedGame[]> {
    const zai = await this.getZai();

    const searchQueries = [
      `site:crazygames.com/game ${query}`,
      `crazygames.com ${query} free online play`,
      `crazygames ${query} game 2024`,
    ];

    const allGames = new Map<string, FetchedGame>();
    const seenUrls = new Set<string>();

    for (let qi = 0; qi < searchQueries.length; qi++) {
      try {
        const results = await zai.functions.invoke('web_search', {
          query: searchQueries[qi],
          num,
        });
        if (!Array.isArray(results)) continue;

        for (const result of results) {
          const url = result.url || '';
          const slugMatch = url.match(/crazygames\.com\/game\/([^/?]+)/);
          if (!slugMatch || seenUrls.has(slugMatch[1])) continue;

          seenUrls.add(slugMatch[1]);
          const slug = slugMatch[1];

          const rawTitle = result.name || '';
          const title = rawTitle
            .replace(/[🕹️🎮🕹\s]+Play on CrazyGames.*$/i, '')
            .replace(/[\s]*- Play Online.*$/i, '')
            .trim();
          if (!title || title.length < 2) continue;

          const description = (result.snippet || '')
            .replace(/^Free\s*·\s*Game\s*/i, '')
            .trim();

          const fullText = `${title} ${url} ${description}`.toLowerCase();
          let category: 'HTML5' | 'UNITY_WEBGL' | 'FLASH' = 'HTML5';
          if (fullText.includes('webgl') || fullText.includes('unity')) category = 'UNITY_WEBGL';
          if (fullText.includes('flash') || fullText.includes('.swf')) category = 'FLASH';

          allGames.set(slug, {
            title,
            description: description || `${title} — Play free on CYBERPLAY!`,
            category,
            thumbnailUrl: '', // Will be fetched separately
            gameUrl: `https://www.crazygames.com/game/${slug}`,
            tags: this.extractTagsFromTitle(title),
            externalId: slug,
            sourceUrl: url,
          });
        }
      } catch (err) {
        console.error(`Search query ${qi} failed:`, err);
      }
    }

    return Array.from(allGames.values());
  }

  async fetchThumbnail(zai: ZAI, gameUrl: string): Promise<string> {
    return fetchThumbnailFromPage(zai, gameUrl);
  }

  private extractTagsFromTitle(title: string): string {
    const stopWords = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'or', 'online', 'game', 'play', 'free', 'new', 'york', 'super', 'mini']);
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w))
      .slice(0, 5)
      .join(', ');
  }
}

// ─── Poki Fetcher ───────────────────────────────────────────────────
class PokiFetcher implements SourceFetcher {
  type = 'POKI';
  private zai: ZAI | null = null;

  async getZai(): Promise<ZAI> {
    if (!this.zai) {
      this.zai = await ZAI.create();
    }
    return this.zai;
  }

  async search(query: string, num = 10): Promise<FetchedGame[]> {
    const zai = await this.getZai();

    const searchQueries = [
      `site:poki.com ${query} game`,
      `poki.com ${query} free play`,
    ];

    const allGames = new Map<string, FetchedGame>();
    const seenSlugs = new Set<string>();

    for (const sq of searchQueries) {
      try {
        const results = await zai.functions.invoke('web_search', {
          query: sq,
          num,
        });
        if (!Array.isArray(results)) continue;

        for (const result of results) {
          const url = result.url || '';
          const slugMatch = url.match(/poki\.com\/(?:en\/)?g\/([^/?]+)/);
          if (!slugMatch || seenSlugs.has(slugMatch[1])) continue;

          seenSlugs.add(slugMatch[1]);
          const slug = slugMatch[1];

          const rawTitle = result.name || '';
          const title = rawTitle.replace(/\s*-\s*Play.*$/i, '').replace(/\s*on Poki.*$/i, '').trim();
          if (!title || title.length < 2) continue;

          const description = (result.snippet || '').trim();
          const fullText = `${title} ${url} ${description}`.toLowerCase();
          let category: 'HTML5' | 'UNITY_WEBGL' | 'FLASH' = 'HTML5';
          if (fullText.includes('webgl') || fullText.includes('unity')) category = 'UNITY_WEBGL';
          if (fullText.includes('flash') || fullText.includes('.swf')) category = 'FLASH';

          allGames.set(slug, {
            title,
            description: description || `${title} — Play free on CYBERPLAY!`,
            category,
            thumbnailUrl: '',
            gameUrl: `https://poki.com/en/g/${slug}`,
            tags: '',
            externalId: slug,
            sourceUrl: url,
          });
        }
      } catch (err) {
        console.error('Poki search failed:', err);
      }
    }

    return Array.from(allGames.values());
  }

  async fetchThumbnail(zai: ZAI, gameUrl: string): Promise<string> {
    return fetchThumbnailFromPage(zai, gameUrl);
  }
}

// ─── Fetcher Registry ───────────────────────────────────────────────
const fetchers: Record<string, SourceFetcher> = {
  CRAZYGAMES: new CrazyGamesFetcher(),
  POKI: new PokiFetcher(),
};

export function getFetcher(type: string): SourceFetcher | null {
  return fetchers[type] || null;
}

export function getAvailableSourceTypes(): { type: string; label: string; icon: string }[] {
  return [
    { type: 'CRAZYGAMES', label: 'CrazyGames', icon: '🎮' },
    { type: 'POKI', label: 'Poki', icon: '🕹️' },
  ];
}

// ─── Main Fetch and Save Logic ────────────────────────────────────────
export async function fetchGamesFromSource(sourceId: string): Promise<FetchProgress> {
  const source = await db.gameSource.findUnique({ where: { id: sourceId } });
  if (!source) throw new Error('Source not found');

  const fetcher = getFetcher(source.type);
  if (!fetcher) throw new Error(`No fetcher for type: ${source.type}`);
  const zai = await ZAI.create();

  // Multi-query search
  const baseQuery = source.searchQuery || 'popular';
  const searchQueries = [
    baseQuery,
    `${baseQuery} action`,
    `${baseQuery} puzzle`,
    `${baseQuery} racing`,
    `${baseQuery} shooter`,
  ];

  const allGames: FetchedGame[] = [];
  const seenIds = new Set<string>();

  // ── Phase 1: Search ──────────────────────────────────────────────
  updateProgress(sourceId, {
    status: 'searching',
    message: `Searching ${source.name}...`,
    total: searchQueries.length,
    current: 0,
    games: [],
  });

  try {
    for (let qi = 0; qi < searchQueries.length; qi++) {
      const query = searchQueries[qi];
      updateProgress(sourceId, {
        status: 'searching',
        message: `Searching "${query}" (${qi + 1}/${searchQueries.length})...`,
        total: searchQueries.length,
        current: qi,
        games: allGames,
      });

      const games = await fetcher.search(query, 10);

      for (const game of games) {
        if (!seenIds.has(game.externalId)) {
          seenIds.add(game.externalId);
          allGames.push(game);
        }
      }

      if (qi < searchQueries.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // ── Phase 2: Fetch Thumbnails ───────────────────────────────────
    updateProgress(sourceId, {
      status: 'fetching_thumbs',
      message: `Fetching thumbnails (0/${allGames.length})...`,
      total: allGames.length,
      current: 0,
      games: allGames,
    });

    // Fetch thumbnails in batches of 3 concurrent
    const BATCH_SIZE = 3;
    for (let i = 0; i < allGames.length; i += BATCH_SIZE) {
      const batch = allGames.slice(i, i + BATCH_SIZE);
      const thumbPromises = batch.map(async (game) => {
        const thumb = await fetcher.fetchThumbnail(zai, game.gameUrl);
        if (thumb) game.thumbnailUrl = thumb;
        return game;
      });
      await Promise.all(thumbPromises);

      updateProgress(sourceId, {
        status: 'fetching_thumbs',
        message: `Fetching thumbnails (${Math.min(i + BATCH_SIZE, allGames.length)}/${allGames.length})...`,
        total: allGames.length,
        current: Math.min(i + BATCH_SIZE, allGames.length),
        games: allGames,
      });

      // Small delay between batches
      await new Promise(r => setTimeout(r, 300));
    }

    // ── Phase 3: Save to Database ────────────────────────────────────
    updateProgress(sourceId, {
      status: 'saving',
      message: `Saving ${allGames.length} games to database...`,
      total: allGames.length,
      current: 0,
      games: allGames,
    });

    let savedCount = 0;
    let newCount = 0;
    let thumbUpdated = 0;
    for (let i = 0; i < allGames.length; i++) {
      const game = allGames[i];

      const existing = game.externalId
        ? await db.game.findFirst({
            where: { externalId: game.externalId, sourceId },
          })
        : null;

      if (existing) {
        // Check if we're updating the thumbnail
        const needsThumbUpdate = game.thumbnailUrl && !existing.thumbnailUrl?.includes('imgs.crazygames.com') && !existing.thumbnailUrl?.includes('imgs.poki.com');

        await db.game.update({
          where: { id: existing.id },
          data: {
            title: game.title,
            description: game.description,
            category: game.category,
            ...(game.thumbnailUrl ? { thumbnailUrl: game.thumbnailUrl } : {}),
            gameUrl: game.gameUrl,
            tags: game.tags,
          },
        });
        if (needsThumbUpdate) thumbUpdated++;
      } else {
        await db.game.create({
          data: {
            title: game.title,
            description: game.description,
            category: game.category,
            thumbnailUrl: game.thumbnailUrl,
            gameUrl: game.gameUrl,
            tags: game.tags,
            sourceId,
            externalId: game.externalId,
            rating: 3.5 + Math.random() * 1.5,
          },
        });
        newCount++;
      }

      savedCount++;
      updateProgress(sourceId, {
        status: 'saving',
        message: `Saving ${savedCount}/${allGames.length}: ${game.title}`,
        total: allGames.length,
        current: savedCount,
        games: allGames,
      });
    }

    // Update source stats
    await db.gameSource.update({
      where: { id: sourceId },
      data: {
        gamesFetched: { increment: newCount },
        lastFetched: new Date(),
      },
    });

    const thumbsWith = allGames.filter(g => g.thumbnailUrl).length;
    const finalMsg = `Done! ${newCount} new + ${savedCount - newCount} updated = ${savedCount} games. ${thumbsWith} with thumbnails.`;

    updateProgress(sourceId, {
      status: 'done',
      message: finalMsg,
      total: allGames.length,
      current: allGames.length,
      games: allGames,
    });

    return getProgress(sourceId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    updateProgress(sourceId, {
      status: 'error',
      message: `Error: ${message}`,
    });
    throw error;
  }
}

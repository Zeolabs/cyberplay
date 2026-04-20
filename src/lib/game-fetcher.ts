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
  status: 'idle' | 'searching' | 'fetching' | 'saving' | 'done' | 'error';
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

// ─── Source Fetcher Base ────────────────────────────────────────────
interface SourceFetcher {
  type: string;
  search(query: string, num?: number): Promise<FetchedGame[]>;
  fetchGamePage(url: string): Promise<FetchedGame | null>;
}

// ─── CrazyGames Fetcher ─────────────────────────────────────────────
class CrazyGamesFetcher implements SourceFetcher {
  type = 'CRAZYGAMES';
  private zai: ZAI | null = null;

  private async getZai(): Promise<ZAI> {
    if (!this.zai) {
      this.zai = await ZAI.create();
    }
    return this.zai;
  }

  async search(query: string, num = 10): Promise<FetchedGame[]> {
    const zai = await this.getZai();
    const searchQuery = `site:crazygames.com ${query}`;

    const results = await zai.functions.invoke('web_search', {
      query: searchQuery,
      num,
    });

    const games: FetchedGame[] = [];

    for (const result of results) {
      if (result.url && result.url.includes('crazygames.com/game/')) {
        const game = await this.fetchGamePage(result.url);
        if (game) {
          games.push(game);
        }
      }
    }

    return games;
  }

  async fetchGamePage(url: string): Promise<FetchedGame | null> {
    try {
      const zai = await this.getZai();
      const result = await zai.functions.invoke('page_reader', { url });

      if (!result?.data?.html) return null;

      const html = result.data.html as string;
      const pageUrl = result.data.url as string;

      // Extract title
      const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/s) ||
                         html.match(/<title[^>]*>(.*?)<\/title>/s);
      const title = titleMatch
        ? (titleMatch[1] || '').replace(/<[^>]*>/g, '').trim()
        : '';

      if (!title) return null;

      // Extract description / og:description
      const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/is) ||
                        html.match(/<meta\s+property=["']og:description["']\s+content=["'](.*?)["']/is) ||
                        html.match(/<p[^>]*class=["'][^"']*description[^"']*["'][^>]*>(.*?)<\/p>/is);
      const description = descMatch
        ? (descMatch[1] || '').trim().substring(0, 500)
        : `${title} - Play now on CYBERPLAY!`;

      // Extract thumbnail / og:image
      const thumbMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["'](.*?)["']/is) ||
                        html.match(/<img[^>]*(?:class|data-src|src)=["'](?:[^"']*?)*(?:thumbnail|cover|poster|icon)[^"']*["'][^>]*src=["'](.*?)["']/is) ||
                        html.match(/https:\/\/images\.crazygames\.com\/[^"'\s]+/);
      const thumbnailUrl = thumbMatch ? (thumbMatch[1] || thumbMatch[0] || '') : '';

      // Extract game URL - look for iframe or embed
      const iframeMatch = html.match(/src=["'](https:\/\/html5\.gamedistribution\.com\/[^"']+)["']/) ||
                         html.match(/src=["'](https:\/\/play\.crazygames\.com\/[^"']+)["']/) ||
                         html.match(/data-game-url=["'](.*?)["']/) ||
                         html.match(/["'](https?:\/\/[^"']*?(?:embed|game|play)[^"']*)["']/);

      // Build game URL - try the page itself as iframe fallback
      let gameUrl = '';
      if (iframeMatch) {
        gameUrl = iframeMatch[1] || '';
      } else {
        // CrazyGames allows direct iframe embedding of game pages
        gameUrl = pageUrl;
      }

      // Determine category
      const category = this.categorizeGame(html, url, title);

      // Extract tags from meta keywords or page content
      const tagsMatch = html.match(/<meta\s+name=["']keywords["']\s+content=["'](.*?)["']/is);
      const tags = tagsMatch
        ? (tagsMatch[1] || '').trim()
        : this.extractTagsFromTitle(title);

      // Extract slug as external ID
      const slugMatch = url.match(/crazygames\.com\/game\/([^/?]+)/);
      const externalId = slugMatch ? slugMatch[1] : '';

      return {
        title,
        description,
        category,
        thumbnailUrl,
        gameUrl,
        tags,
        externalId,
        sourceUrl: pageUrl,
      };
    } catch (error) {
      console.error(`Failed to fetch game from ${url}:`, error);
      return null;
    }
  }

  private categorizeGame(html: string, url: string, title: string): 'HTML5' | 'UNITY_WEBGL' | 'FLASH' {
    const lower = (html + ' ' + url + ' ' + title).toLowerCase();

    if (lower.includes('webgl') || lower.includes('unity')) return 'UNITY_WEBGL';
    if (lower.includes('flash') || lower.includes('swf') || lower.includes('.flv')) return 'FLASH';
    return 'HTML5';
  }

  private extractTagsFromTitle(title: string): string {
    const stopWords = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'or', 'online', 'game', 'play', 'free']);
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w))
      .slice(0, 5)
      .join(', ');
  }
}

// ─── Poki Fetcher (extensible) ──────────────────────────────────────
class PokiFetcher implements SourceFetcher {
  type = 'POKI';

  private async getZai(): Promise<ZAI> {
    return ZAI.create();
  }

  async search(query: string, num = 10): Promise<FetchedGame[]> {
    const zai = await this.getZai();
    const searchQuery = `site:poki.com ${query} game`;

    const results = await zai.functions.invoke('web_search', {
      query: searchQuery,
      num,
    });

    const games: FetchedGame[] = [];

    for (const result of results) {
      if (result.url && result.url.includes('poki.com/')) {
        try {
          const pageData = await zai.functions.invoke('page_reader', { url: result.url });
          const html = pageData?.data?.html as string || '';
          const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/s) || html.match(/<title[^>]*>(.*?)<\/title>/s);
          const title = titleMatch ? (titleMatch[1] || '').replace(/<[^>]*>/g, '').trim() : '';

          if (!title) continue;

          const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/is);
          const thumbMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["'](.*?)["']/is);
          const slugMatch = result.url.match(/poki\.com\/(?:en\/)?g\/([^/?]+)/);

          games.push({
            title,
            description: descMatch ? (descMatch[1] || '').trim() : `${title} - Play on CYBERPLAY!`,
            category: 'HTML5',
            thumbnailUrl: thumbMatch ? (thumbMatch[1] || '') : '',
            gameUrl: result.url,
            tags: '',
            externalId: slugMatch ? slugMatch[1] : '',
            sourceUrl: result.url,
          });
        } catch {
          // Skip failed pages
        }
      }
    }

    return games;
  }

  async fetchGamePage(url: string): Promise<FetchedGame | null> {
    return null;
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

// ─── Main Fetch & Save Logic ────────────────────────────────────────
export async function fetchGamesFromSource(sourceId: string): Promise<FetchProgress> {
  const source = await db.gameSource.findUnique({ where: { id: sourceId } });
  if (!source) throw new Error('Source not found');

  const fetcher = getFetcher(source.type);
  if (!fetcher) throw new Error(`No fetcher for type: ${source.type}`);

  const query = source.searchQuery || `${source.type === 'CRAZYGAMES' ? 'popular free online' : 'popular'} html5 games`;
  const numGames = 20;

  updateProgress(sourceId, {
    status: 'searching',
    message: `Searching ${source.name} for "${query}"...`,
    total: numGames,
    current: 0,
    games: [],
  });

  try {
    const games = await fetcher.search(query, numGames);

    updateProgress(sourceId, {
      status: 'fetching',
      message: `Found ${games.length} games. Fetching details...`,
      total: games.length,
      current: 0,
      games,
    });

    // Save games to database
    let savedCount = 0;
    for (let i = 0; i < games.length; i++) {
      const game = games[i];

      // Check if game already exists by externalId+sourceId
      const existing = game.externalId
        ? await db.game.findFirst({
            where: { externalId: game.externalId, sourceId },
          })
        : null;

      if (existing) {
        // Update existing game
        await db.game.update({
          where: { id: existing.id },
          data: {
            title: game.title,
            description: game.description,
            category: game.category,
            thumbnailUrl: game.thumbnailUrl,
            gameUrl: game.gameUrl,
            tags: game.tags,
          },
        });
      } else {
        // Create new game
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
      }

      savedCount++;
      updateProgress(sourceId, {
        status: 'saving',
        message: `Saving game ${savedCount}/${games.length}: ${game.title}`,
        total: games.length,
        current: i + 1,
        games,
      });
    }

    // Update source stats
    await db.gameSource.update({
      where: { id: sourceId },
      data: {
        gamesFetched: { increment: savedCount },
        lastFetched: new Date(),
      },
    });

    updateProgress(sourceId, {
      status: 'done',
      message: `Done! Saved ${savedCount} games from ${source.name}.`,
      total: games.length,
      current: games.length,
      games,
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

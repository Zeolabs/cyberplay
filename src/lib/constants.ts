// ─── Brand ────────────────────────────────────────────────────────
export const BRAND_NAME = 'CYBERPLAY';
export const BRAND_NAME_LOWER = 'cyberplay';

// ─── CrazyGames ───────────────────────────────────────────────────
export const CRAZYGAMES_BASE = 'https://www.crazygames.com';
export const CRAZYGAMES_GAMES = 'https://games.crazygames.com';
export const CRAZYGAMES_IMAGES = 'https://images.crazygames.com';
export const CRAZYGAMES_VIDEOS = 'https://videos.crazygames.com';

// ─── Polling intervals (ms) ───────────────────────────────────────
export const SOURCE_POLL_INTERVAL = 1500;
export const CATEGORY_POLL_INTERVAL = 2000;

// ─── UI timeouts (ms) ─────────────────────────────────────────────
export const PROGRESS_CLEAR_DELAY = 3000;
export const CATEGORY_PROGRESS_CLEAR_DELAY = 5000;

// ─── Fallback description ─────────────────────────────────────────
export const FALLBACK_DESCRIPTION = 'Play free on CYBERPLAY!';

// ─── Error messages ───────────────────────────────────────────────
export const ERRORS = {
  FETCH_START: 'Failed to start fetch',
  DELETE_SOURCE: 'Failed to delete source',
  CREATE_SOURCE: 'Failed to create source',
  UPLOAD_GAME: 'Failed to upload game',
  UPDATE_GAME: 'Failed to update game',
  DELETE_GAME: 'Failed to delete game',
  UPDATE_SETTINGS: 'Failed to update settings',
  CLEAR_CACHE: 'Failed to clear cache',
} as const;

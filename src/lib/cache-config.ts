import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// ─── Paths ────────────────────────────────────────────────────────
export const CACHE_DIR = join(process.cwd(), '.cache/images');
export const SETTINGS_FILE = join(process.cwd(), '.cache/settings.json');

// ─── Types ────────────────────────────────────────────────────────
export interface CacheSettings {
  enabled: boolean;
  imageTTL: number;  // hours
  videoTTL: number;  // hours
}

// ─── Defaults ─────────────────────────────────────────────────────
export const DEFAULT_SETTINGS: CacheSettings = {
  enabled: true,
  imageTTL: 720,
  videoTTL: 168,
};

export const MAX_CACHE_SIZE = 500 * 1024 * 1024; // 500MB max cache

// ─── Helpers ──────────────────────────────────────────────────────
export function readSettings(): CacheSettings {
  try {
    if (existsSync(SETTINGS_FILE)) {
      const raw = readFileSync(SETTINGS_FILE, 'utf-8');
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch {
    // corrupted settings, use defaults
  }
  // Create default settings file if missing
  if (!existsSync(SETTINGS_FILE)) {
    try {
      mkdirSync(join(process.cwd(), '.cache'), { recursive: true });
      writeFileSync(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2));
    } catch {
      // ignore write errors
    }
  }
  return DEFAULT_SETTINGS;
}

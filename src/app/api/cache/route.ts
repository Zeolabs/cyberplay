import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';

// ─── Config ────────────────────────────────────────────────────────
const CACHE_DIR = join(process.cwd(), '.cache/images');
const SETTINGS_FILE = join(process.cwd(), '.cache/settings.json');

interface CacheSettings {
  enabled: boolean;
  imageTTL: number;  // hours
  videoTTL: number;  // hours
}

const DEFAULT_SETTINGS: CacheSettings = {
  enabled: true,
  imageTTL: 720,
  videoTTL: 168,
};

// ─── Helpers ───────────────────────────────────────────────────────
function readSettings(): CacheSettings {
  try {
    if (existsSync(SETTINGS_FILE)) {
      const raw = readFileSync(SETTINGS_FILE, 'utf-8');
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch {
    // corrupted settings, use defaults
  }
  // Create default settings file
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

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getCacheStats() {
  let totalFiles = 0;
  let totalSize = 0;

  if (existsSync(CACHE_DIR)) {
    try {
      const files = readdirSync(CACHE_DIR);
      for (const file of files) {
        try {
          const filePath = join(CACHE_DIR, file);
          const stat = statSync(filePath);
          if (stat.isFile()) {
            totalFiles++;
            totalSize += stat.size;
          }
        } catch {
          // skip unreadable files
        }
      }
    } catch {
      // skip directory read errors
    }
  }

  return { totalFiles, totalSize, totalSizeFormatted: formatSize(totalSize) };
}

// ─── GET: Return cache stats and settings ─────────────────────────
export async function GET() {
  const settings = readSettings();
  const stats = getCacheStats();

  return NextResponse.json({
    enabled: settings.enabled,
    imageTTL: settings.imageTTL,
    videoTTL: settings.videoTTL,
    totalFiles: stats.totalFiles,
    totalSize: stats.totalSize,
    totalSizeFormatted: stats.totalSizeFormatted,
  });
}

// ─── PUT: Update cache settings ───────────────────────────────────
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const current = readSettings();

    const updated: CacheSettings = {
      enabled: body.enabled !== undefined ? body.enabled : current.enabled,
      imageTTL: body.imageTTL !== undefined ? body.imageTTL : current.imageTTL,
      videoTTL: body.videoTTL !== undefined ? body.videoTTL : current.videoTTL,
    };

    mkdirSync(join(process.cwd(), '.cache'), { recursive: true });
    writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2));

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}

// ─── DELETE: Clear cache files ────────────────────────────────────
export async function DELETE() {
  try {
    if (existsSync(CACHE_DIR)) {
      const files = readdirSync(CACHE_DIR);
      for (const file of files) {
        try {
          rmSync(join(CACHE_DIR, file), { force: true });
        } catch {
          // skip errors
        }
      }
    }

    return NextResponse.json({
      cleared: true,
      message: 'Cache cleared successfully',
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to clear cache' },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readdirSync, statSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  CACHE_DIR, SETTINGS_FILE, DEFAULT_SETTINGS,
  readSettings, type CacheSettings,
} from '@/lib/cache-config';

// ─── Helpers ───────────────────────────────────────────────────────
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

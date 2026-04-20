import { NextRequest, NextResponse } from 'next/server';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';
import { readFile } from 'fs/promises';
import { hash } from 'crypto';
import {
  CACHE_DIR, readSettings,
} from '@/lib/cache-config';

// ─── Helpers ───────────────────────────────────────────────────────
function hashUrl(url: string): string {
  return hash('sha256', url).toString('hex').slice(0, 16);
}

function getExt(url: string, contentType: string): string {
  const urlExt = url.split('?')[0].split('.').pop()?.toLowerCase();
  if (urlExt && ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'mp4', 'webm'].includes(urlExt)) {
    return urlExt;
  }
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  if (contentType.includes('svg')) return 'svg';
  if (contentType.includes('mp4')) return 'mp4';
  if (contentType.includes('webm')) return 'webm';
  return 'bin';
}

function isVideo(url: string): boolean {
  return /\.(mp4|webm|ogg)(\?|$)/i.test(url);
}

function getCachedPath(urlHash: string, ext: string): string {
  return join(CACHE_DIR, `${urlHash}.${ext}`);
}

function getMaxAge(url: string): number {
  const settings = readSettings();
  const ttlHours = isVideo(url) ? settings.videoTTL : settings.imageTTL;
  return ttlHours * 60 * 60;
}

function getContentType(ext: string): string {
  const map: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml',
    mp4: 'video/mp4', webm: 'video/webm', bin: 'application/octet-stream',
  };
  return map[ext] || 'application/octet-stream';
}

// ─── Ensure cache dir exists ───────────────────────────────────────
if (!existsSync(CACHE_DIR)) {
  mkdirSync(CACHE_DIR, { recursive: true });
}

// ─── GET: proxy with disk cache ─────────────────────────────────────
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'Missing ?url= parameter' }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  const allowedHosts = [
    'images.crazygames.com',
    'imgs.crazygames.com',
    'videos.crazygames.com',
    'image.tmdb.org',
    'cdn.crazygames.com',
  ];
  if (!allowedHosts.includes(parsedUrl.hostname)) {
    return NextResponse.json({ error: 'Domain not allowed' }, { status: 403 });
  }

  const settings = readSettings();

  if (!settings.enabled) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': isVideo(url)
            ? 'video/mp4,video/webm,*/*;q=0.8'
            : 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        },
      });

      if (!res.ok) {
        return NextResponse.json(
          { error: `Upstream returned ${res.status}` },
          { status: res.status }
        );
      }

      const contentType = res.headers.get('content-type') || '';
      const buffer = Buffer.from(await res.arrayBuffer());

      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(buffer.length),
          'Cache-Control': 'no-cache',
          'X-Cache': 'BYPASS',
        },
      });
    } catch (err) {
      console.error(`[proxy] Failed to fetch ${url}:`, err);
      return NextResponse.json(
        { error: 'Failed to fetch remote resource' },
        { status: 502 }
      );
    }
  }

  const urlHash = hashUrl(url);
  const maxAge = getMaxAge(url);

  const possibleExts = isVideo(url)
    ? ['mp4', 'webm']
    : ['webp', 'jpg', 'png', 'gif', 'svg', 'bin'];

  for (const ext of possibleExts) {
    const cachedPath = getCachedPath(urlHash, ext);
    if (existsSync(cachedPath)) {
      try {
        const stat = statSync(cachedPath);
        const ageSec = (Date.now() - stat.mtimeMs) / 1000;
        if (ageSec < maxAge) {
          const data = readFileSync(cachedPath);
          return new NextResponse(data, {
            status: 200,
            headers: {
              'Content-Type': getContentType(ext),
              'Content-Length': String(data.length),
              'Cache-Control': `public, max-age=${maxAge}, immutable`,
              'X-Cache': 'HIT',
            },
          });
        }
      } catch {
        // Corrupted cache file, continue to fetch
      }
    }
  }

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': isVideo(url)
          ? 'video/mp4,video/webm,*/*;q=0.8'
          : 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream returned ${res.status}` },
        { status: res.status }
      );
    }

    const contentType = res.headers.get('content-type') || '';
    const ext = getExt(url, contentType);
    const buffer = Buffer.from(await res.arrayBuffer());

    if (buffer.length < 50 * 1024 * 1024) {
      const cachedPath = getCachedPath(urlHash, ext);
      setImmediate(() => {
        try {
          writeFileSync(cachedPath, buffer);
        } catch {
          // Disk full or permission error
        }
      });
    }

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType || getContentType(ext),
        'Content-Length': String(buffer.length),
        'Cache-Control': `public, max-age=${maxAge}`,
        'X-Cache': 'MISS',
      },
    });
  } catch (err) {
    console.error(`[proxy] Failed to fetch ${url}:`, err);
    return NextResponse.json(
      { error: 'Failed to fetch remote resource' },
      { status: 502 }
    );
  }
}

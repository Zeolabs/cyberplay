import { NextRequest, NextResponse } from 'next/server';

function isVideo(url: string): boolean {
  return /\.(mp4|webm|ogg)(\?|$)/i.test(url);
}

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

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': isVideo(url)
          ? 'video/mp4,video/webm,*/*;q=0.8'
          : 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Referer': 'https://www.crazygames.com/',
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
        'Cache-Control': 'public, max-age=86400',
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

// ─── Browser-like headers for direct fetch (NO SDK!) ──────────────
export const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

// ─── Timeout constants (ms) ──────────────────────────────────────
export const FETCH_TIMEOUT = 15000;
export const HEAD_TIMEOUT = 5000;
export const PAGE_FETCH_TIMEOUT = 30000;
export const POLITE_DELAY = 500;
export const TAG_DELAY = 1000;

// ─── Helpers ──────────────────────────────────────────────────────
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function decodeHtmlEntities(str: string): string {
  return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}

// Extract slug from CrazyGames embed URL
export function extractSlug(gameUrl: string): string {
  try {
    const url = new URL(gameUrl);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  } catch {}
  return '';
}

// Extract og:image from HTML meta tags
export function extractOgImage(html: string): string | null {
  const match = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
  if (match?.[1]) return decodeHtmlEntities(match[1]);
  const altMatch = html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i);
  if (altMatch?.[1]) return decodeHtmlEntities(altMatch[1]);
  return null;
}

// Fetch a page with browser-like headers
export async function fetchPage(url: string, timeoutMs: number = FETCH_TIMEOUT): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) return await res.text();
  } catch (err) {
    console.error(`[fetch] Failed: ${url}:`, err);
  }
  return '';
}

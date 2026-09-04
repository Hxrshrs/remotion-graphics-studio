import {isIP} from 'node:net';
import type {ApiRequest, ApiResponse, JsonRecord} from '../../server/http.js';
import {errorStatus, httpError, readJsonBody, routeParam, sendJson} from '../../server/http.js';

const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
const IMAGE_FETCH_TIMEOUT_MS = 12_000;
const IMAGE_FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  Accept: 'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8',
};

const isPrivateIpv4 = (hostname: string) => {
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
};

const safeImageUrl = (raw: string) => {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw httpError('That image URL is invalid.', 400);
  }
  const hostname = parsed.hostname.toLowerCase();
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    (parsed.port && parsed.port !== '443') ||
    hostname === 'localhost' ||
    hostname.endsWith('.local') ||
    isPrivateIpv4(hostname) ||
    (isIP(hostname) === 6 && (hostname === '::1' || hostname.startsWith('fc') || hostname.startsWith('fd')))
  ) {
    throw httpError('Only public HTTPS image URLs are allowed.', 400);
  }
  return parsed;
};

const fetchImage = async (rawUrl: string) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
  try {
    let current = safeImageUrl(rawUrl);
    let upstream: Response | null = null;
    for (let redirect = 0; redirect <= 3; redirect += 1) {
      upstream = await fetch(current, {
        headers: IMAGE_FETCH_HEADERS,
        signal: controller.signal,
        redirect: 'manual',
      });
      if (![301, 302, 303, 307, 308].includes(upstream.status)) break;
      const location = upstream.headers.get('location');
      if (!location || redirect === 3) throw httpError('The image redirected too many times.', 502);
      current = safeImageUrl(new URL(location, current).toString());
    }
    if (!upstream) throw httpError('The image could not be fetched.', 502);
    if (!upstream.ok) throw httpError(`The image host returned ${upstream.status}.`, 502);
    const type = (upstream.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!type.startsWith('image/')) throw httpError('That URL did not return an image.', 415);
    const declaredSize = Number(upstream.headers.get('content-length'));
    if (Number.isFinite(declaredSize) && declaredSize > MAX_PHOTO_BYTES) {
      throw httpError('That image is too large.', 413);
    }
    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (!buffer.length) throw httpError('The image host returned an empty file.', 502);
    if (buffer.length > MAX_PHOTO_BYTES) throw httpError('That image is too large.', 413);
    return {buffer, type};
  } finally {
    clearTimeout(timer);
  }
};

const search = async (payload: JsonRecord) => {
  const apiKey = typeof payload.apiKey === 'string' ? payload.apiKey.trim() : '';
  const query = typeof payload.query === 'string' ? payload.query.trim() : '';
  const count = Math.max(1, Math.min(100, Number(payload.count) || 48));
  if (!apiKey) throw httpError('No serper.dev key was sent.', 400);
  if (!query) throw httpError('No image search query was sent.', 400);
  const upstream = await fetch('https://google.serper.dev/images', {
    method: 'POST',
    headers: {'X-API-KEY': apiKey, 'Content-Type': 'application/json'},
    body: JSON.stringify({q: query, num: count}),
  });
  if (!upstream.ok) {
    throw httpError(`serper.dev returned ${upstream.status}: ${(await upstream.text()).slice(0, 200)}`, upstream.status);
  }
  const data = (await upstream.json()) as {
    images?: Array<{
      title?: string;
      imageUrl?: string;
      imageWidth?: number;
      imageHeight?: number;
      source?: string;
      link?: string;
    }>;
  };
  return {
    query,
    images: (data.images ?? []).flatMap((item) => {
      const imageUrl = typeof item.imageUrl === 'string' ? item.imageUrl.trim() : '';
      if (!imageUrl.startsWith('https://')) return [];
      return [{
        imageUrl,
        title: (item.title ?? '').trim().slice(0, 160),
        source: (item.source ?? '').trim().slice(0, 80),
        pageUrl: typeof item.link === 'string' ? item.link : '',
        width: Number(item.imageWidth) || 0,
        height: Number(item.imageHeight) || 0,
      }];
    }),
  };
};

const candidates = (payload: JsonRecord) => {
  const urls = Array.isArray(payload.urls)
    ? payload.urls.filter((url): url is string => typeof url === 'string').slice(0, 60)
    : [];
  if (!urls.length) throw httpError('No image URLs were sent.', 400);
  return {
    images: urls.map((url) => {
      try {
        safeImageUrl(url);
        return {url, dataUrl: `/api/images/file?url=${encodeURIComponent(url)}`};
      } catch {
        return {url, dataUrl: ''};
      }
    }),
  };
};

export default async function handler(request: ApiRequest, response: ApiResponse) {
  const action = routeParam(request, 'action');
  try {
    if (action === 'file' && request.method === 'GET') {
      const rawUrl = routeParam(request, 'url');
      const {buffer, type} = await fetchImage(rawUrl);
      response.statusCode = 200;
      response.setHeader('Content-Type', type);
      response.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800');
      for (let offset = 0; offset < buffer.length; offset += 64 * 1024) {
        response.write(buffer.subarray(offset, offset + 64 * 1024));
      }
      response.end();
      return;
    }
    if (request.method !== 'POST') throw httpError('Use POST for image requests.', 405);
    const payload = await readJsonBody(request);
    if (action === 'search') {
      sendJson(response, 200, await search(payload));
      return;
    }
    if (action === 'candidates') {
      sendJson(response, 200, await candidates(payload));
      return;
    }
    if (action === 'save') {
      const url = typeof payload.url === 'string' ? payload.url.trim() : '';
      if (!url) throw httpError('No image URL was sent.', 400);
      await fetchImage(url);
      sendJson(response, 200, {file: `/api/images/file?url=${encodeURIComponent(url)}`});
      return;
    }
    throw httpError('Unknown image route.', 404);
  } catch (error) {
    sendJson(response, errorStatus(error, 502), {
      detail: error instanceof Error ? error.message : 'The image request failed.',
    });
  }
}

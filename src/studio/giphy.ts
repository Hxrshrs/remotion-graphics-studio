export type GiphyAsset = {
  id: string;
  title: string;
  mp4Url: string;
  pageUrl: string;
  width: number;
  height: number;
};

type GiphyImage = {
  mp4?: string;
  width?: string;
  height?: string;
};

type GiphyItem = {
  id?: string;
  type?: string;
  title?: string;
  url?: string;
  images?: Record<string, GiphyImage | undefined>;
};

type TrendingResponse = {
  data?: GiphyItem[];
  meta?: {status?: number; msg?: string};
};

const CACHE_MS = 5 * 60 * 1000;
let cachedKey = '';
let cachedAt = 0;
let cachedRequest: Promise<GiphyAsset[]> | null = null;

const isGiphyUrl = (value: string, page = false) => {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    return page
      ? host === 'giphy.com' || host.endsWith('.giphy.com')
      : host === 'giphy.com' || host.endsWith('.giphy.com');
  } catch {
    return false;
  }
};

const numberOr = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const renditionFor = (item: GiphyItem) => {
  const images = item.images ?? {};
  return (
    images.original ??
    images.downsized_medium ??
    images.downsized_small ??
    images.fixed_height ??
    images.fixed_width
  );
};

const fetchTrending = async (apiKey: string): Promise<GiphyAsset[]> => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12_000);
  try {
    const query = new URLSearchParams({
      api_key: apiKey,
      limit: '40',
      rating: 'pg',
      bundle: 'messaging_non_clips',
    });
    const response = await fetch(`https://api.giphy.com/v1/gifs/trending?${query}`, {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`GIPHY Trending returned HTTP ${response.status}.`);
    const payload = (await response.json()) as TrendingResponse;
    if (payload.meta?.status && payload.meta.status >= 400) {
      throw new Error(`GIPHY Trending returned ${payload.meta.status}.`);
    }

    return (payload.data ?? []).flatMap((item): GiphyAsset[] => {
      const rendition = renditionFor(item);
      const id = item.id?.trim() ?? '';
      const mp4Url = rendition?.mp4?.trim() ?? '';
      const pageUrl = item.url?.trim() ?? '';
      if (item.type !== 'gif' || !id || !isGiphyUrl(mp4Url) || !isGiphyUrl(pageUrl, true)) {
        return [];
      }
      return [
        {
          id,
          title: item.title?.trim() || 'Trending GIPHY GIF',
          mp4Url,
          pageUrl,
          width: numberOr(rendition?.width, 480),
          height: numberOr(rendition?.height, 270),
        },
      ];
    });
  } finally {
    window.clearTimeout(timeout);
  }
};

const hashText = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

/**
 * Returns a deterministic window of the live Trending feed. The scene model
 * may choose among these exact assets, but cannot invent or search for a URL.
 */
export const currentTrendingGiphyAssets = async (
  apiKey: string,
  context: string,
  limit = 10,
) => {
  const key = apiKey.trim();
  if (!key) return [];
  const now = Date.now();
  if (!cachedRequest || cachedKey !== key || now - cachedAt > CACHE_MS) {
    cachedKey = key;
    cachedAt = now;
    cachedRequest = fetchTrending(key).catch((error) => {
      cachedRequest = null;
      throw error;
    });
  }
  const assets = await cachedRequest;
  if (assets.length <= limit) return assets;
  const start = hashText(context) % (assets.length - limit + 1);
  return assets.slice(start, start + limit);
};

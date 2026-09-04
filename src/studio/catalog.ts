/**
 * OpenRouter's public model catalog. It populates the model picker with every
 * model OpenRouter serves, and tells us which of them accept images.
 *
 * No API key required. Cached in localStorage for a day so the picker does not
 * refetch on every mount.
 */

import {useEffect, useState} from 'react';
import {GOOGLE_MODELS, providerForModel} from './models';

const CACHE_KEY = 'motion-studio.openrouter-catalog.v2';
const CACHE_TTL = 24 * 60 * 60 * 1000;

export type ModelCapabilities = {
  /** OpenRouter's display name, e.g. "Anthropic: Claude Sonnet 4.5". */
  name: string;
  supportsImages: boolean;
  /** USD per input token, as published. */
  promptPrice: number | null;
  /** USD per output token. */
  completionPrice: number | null;
};

type CatalogMap = Record<string, ModelCapabilities>;

type CachedCatalog = {fetchedAt: number; models: CatalogMap};

let memoryCache: CatalogMap | null = null;
let inFlight: Promise<CatalogMap> | null = null;

const readCache = (): CatalogMap | null => {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedCatalog;
    if (!parsed?.models || Date.now() - parsed.fetchedAt > CACHE_TTL) return null;
    return parsed.models;
  } catch {
    return null;
  }
};

const writeCache = (models: CatalogMap) => {
  try {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({fetchedAt: Date.now(), models} satisfies CachedCatalog),
    );
  } catch {
    // A stale or unavailable cache only costs us a refetch.
  }
};

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const fetchOpenRouterCatalog = async (): Promise<CatalogMap> => {
  if (memoryCache) return memoryCache;
  const cached = readCache();
  if (cached) {
    memoryCache = cached;
    return cached;
  }
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      // Use the local bridge so a browser CORS policy cannot make the model
      // picker report a misleading empty catalog.
      const response = await fetch('/api/llm/catalog/openrouter');
      if (!response.ok) throw new Error(String(response.status));
      const payload = (await response.json()) as {
        data?: Array<{
          id?: string;
          name?: string;
          architecture?: {input_modalities?: string[]};
          pricing?: {prompt?: string; completion?: string};
        }>;
      };
      const models: CatalogMap = {};
      for (const entry of payload.data ?? []) {
        if (!entry.id) continue;
        models[entry.id] = {
          name: entry.name || entry.id,
          supportsImages: Boolean(entry.architecture?.input_modalities?.includes('image')),
          promptPrice: toNumber(entry.pricing?.prompt),
          completionPrice: toNumber(entry.pricing?.completion),
        };
      }
      memoryCache = models;
      writeCache(models);
      return models;
    } catch {
      // Offline or blocked: treat the catalog as empty rather than breaking the
      // picker. Unknown models fall back to "no image support".
      memoryCache = {};
      return memoryCache;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
};

/** Loads the catalog only when needed; an empty map until it arrives. */
export const useOpenRouterCatalog = (enabled = true) => {
  const [catalog, setCatalog] = useState<CatalogMap>(() => memoryCache ?? {});

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    fetchOpenRouterCatalog().then((models) => {
      if (live) setCatalog(models);
    });
    return () => {
      live = false;
    };
  }, [enabled]);

  return catalog;
};

/**
 * Google's Flash Lite models are known multimodal; OpenRouter slugs are only
 * treated as vision-capable when the catalog says so, so an unreachable
 * catalog fails closed rather than sending images a model will reject.
 */
export const modelSupportsImages = (catalog: CatalogMap, model: string) => {
  const provider = providerForModel(model);
  if (provider === 'google') {
    return GOOGLE_MODELS.find((option) => option.id === model)?.supportsImages ?? false;
  }
  // OpenLux exposes the OpenAI-compatible multimodal chat shape. Its model
  // catalog does not consistently publish modality metadata, so allow image
  // attachments and let the selected upstream model return a precise error if
  // it is one of the rare text-only entries.
  if (provider === 'openlux') return true;
  if (provider === 'codex') return true;
  return Boolean(catalog[model]?.supportsImages);
};

/**
 * Every OpenRouter model, with any slug the user pinned in Settings kept even
 * when the catalog is unreachable. Sorted by display name; pinned slugs first
 * so a short working set stays at the top of a list of hundreds.
 */
export const openRouterModelList = (catalog: CatalogMap, pinned: string[] = []) => {
  const pinnedSet = new Set(pinned.filter(Boolean));
  const ids = Array.from(new Set([...pinnedSet, ...Object.keys(catalog)]));
  return ids
    .map((id) => ({
      id,
      label: catalog[id]?.name ?? id,
      pinned: pinnedSet.has(id),
      supportsImages: Boolean(catalog[id]?.supportsImages),
      promptPrice: catalog[id]?.promptPrice ?? null,
      completionPrice: catalog[id]?.completionPrice ?? null,
    }))
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return a.label.localeCompare(b.label);
    });
};

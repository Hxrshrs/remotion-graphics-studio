import {useEffect, useState} from 'react';
import {DEFAULT_OPENLUX_MODEL, OPENLUX_MODEL_PREFIX, sanitizeApiKey} from './models';

export type OpenLuxModel = {id: string; label: string; supportsImages: boolean};

let memoryCache: OpenLuxModel[] | null = null;
let inFlight: Promise<OpenLuxModel[]> | null = null;

const fallback: OpenLuxModel[] = [
  {id: DEFAULT_OPENLUX_MODEL, label: 'Gemini 3.7 Flash', supportsImages: true},
];

const fetchCatalog = async (apiKey: string) => {
  if (memoryCache) return memoryCache;
  if (inFlight) return inFlight;
  const key = sanitizeApiKey(apiKey);
  if (!key) return fallback;

  inFlight = (async () => {
    try {
      // Keep catalog discovery on the same local bridge as completions. A
      // direct browser request can be blocked by CORS and look like a missing
      // catalog even when the key is valid.
      const response = await fetch('/api/llm/catalog/openlux', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({apiKey: key}),
      });
      if (!response.ok) return fallback;
      const payload = (await response.json()) as {data?: Array<{id?: string; name?: string}>};
      const models = (payload.data ?? [])
        .filter((model): model is {id: string; name?: string} => Boolean(model.id))
        .map((model) => ({
          id: `${OPENLUX_MODEL_PREFIX}${model.id}`,
          label: model.name || model.id,
          supportsImages: true,
        }));
      memoryCache = models.length ? models : fallback;
      return memoryCache;
    } catch {
      return fallback;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
};

export const useOpenLuxCatalog = (apiKey: string, enabled: boolean) => {
  const [models, setModels] = useState<OpenLuxModel[]>(memoryCache ?? fallback);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    fetchCatalog(apiKey).then((next) => {
      if (live) setModels(next);
    });
    return () => {
      live = false;
    };
  }, [apiKey, enabled]);
  return models;
};

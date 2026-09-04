import {DEFAULT_OPENLUX_MODEL, providerForModel, sanitizeApiKey} from './models';
import {Cut} from './cut';
import type {RiveProject} from './rive';
import {StudioProject, StudioSettings} from './types';

const PROJECTS_KEY = 'motion-studio.projects.v1';
const ACTIVE_PROJECT_KEY = 'motion-studio.active-project.v1';
const SETTINGS_KEY = 'motion-studio.openrouter.v1';
const CUTS_KEY = 'motion-studio.cuts.v1';
const ACTIVE_CUT_KEY = 'motion-studio.active-cut.v1';
const RIVE_PROJECTS_KEY = 'motion-studio.rive-projects.v1';
const ACTIVE_RIVE_KEY = 'motion-studio.active-rive.v1';
// Keys persist in localStorage so they survive a reload or a reopened tab.
// The sessionStorage names are the previous home, read once for migration.
const OPENROUTER_KEY = 'motion-studio.openrouter-key.v1';
const CARTESIA_KEY = 'motion-studio.cartesia-key.v1';
const GOOGLE_KEY = 'motion-studio.google-key.v1';
const OPENLUX_KEY = 'motion-studio.openlux-key.v1';
const GIPHY_KEY = 'motion-studio.giphy-key.v1';
const SERPER_KEY = 'motion-studio.serper-key.v1';
// The chosen model lives in its own key so a quota failure on the larger
// settings blob can never reset the selection.
const MODEL_KEY = 'motion-studio.selected-model.v1';

export const makeId = (prefix: string) => {
  const random = Math.random().toString(36).slice(2, 9);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
};

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
};

/** localStorage first, then the old sessionStorage copy for a one-time carry-over. */
const readStoredKey = (key: string) => {
  try {
    return sanitizeApiKey(
      window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key) ?? '',
    );
  } catch {
    return '';
  }
};

export const loadProjects = () => readJson<StudioProject[]>(PROJECTS_KEY, []);

/** The durable copy of the projects, preferred over the localStorage mirror. */
export const loadProjectsDurable = () => idb.get<StudioProject[]>(PROJECTS_KEY);

export const saveProjects = (projects: StudioProject[]) => {
  // Scene code is large; IndexedDB is the durable home and localStorage a
  // best-effort mirror for the very small collections.
  void idb.set(PROJECTS_KEY, projects).catch(() => {});
  try {
    window.localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  } catch {
    // The live project still works if browser storage is unavailable or full.
  }
};

export const loadActiveProjectId = () =>
  window.localStorage.getItem(ACTIVE_PROJECT_KEY);

export const saveActiveProjectId = (projectId: string) => {
  try {
    window.localStorage.setItem(ACTIVE_PROJECT_KEY, projectId);
  } catch {
    // Keep the in-memory selection.
  }
};

export const defaultSettings: StudioSettings = {
  apiKey: '',
  cartesiaApiKey: '',
  googleApiKey: '',
  openluxApiKey: '',
  giphyApiKey: '',
  serperApiKey: '',
  modelSlugs: ['openrouter/auto'],
  selectedModel: DEFAULT_OPENLUX_MODEL,
};

export const loadSettings = () => {
  const loaded = readJson<StudioSettings>(SETTINGS_KEY, defaultSettings);
  // Google model ids are supplied by the fixed registry, so keep them out of
  // the user's OpenRouter slug list even if an older save captured one.
  const modelSlugs = Array.from(
    new Set(
      [...(loaded.modelSlugs ?? []), loaded.selectedModel]
        .filter(Boolean)
        .filter((model) => providerForModel(model) === 'openrouter'),
    ),
  );
  // The dedicated model key wins over the settings blob, so the last choice
  // survives even if the blob write ever fails. Old defaults and the retired
  // Luna model are migrated so a fresh save never sits on a model the studio
  // no longer uses.
  let savedModel: string | null = null;
  try {
    savedModel = window.localStorage.getItem(MODEL_KEY);
  } catch {
    // Storage unavailable — fall back to the settings blob below.
  }
  const rawSelected = savedModel || loaded.selectedModel || '';
  // Only genuinely retired ids migrate: gemini-3.1-flash-lite is live again
  // (the quick-fix model) and Luna was removed. Live models like
  // gemini-3.5-flash-lite are a valid deliberate choice and must never be
  // force-reverted to the default.
  const selectedModel =
    !rawSelected ||
    rawSelected === 'openlux:gpt-5.6-luna' ||
    rawSelected === 'codex:gpt-5.6-luna'
      ? DEFAULT_OPENLUX_MODEL
      : rawSelected;
  return {
    ...defaultSettings,
    ...loaded,
    apiKey: readStoredKey(OPENROUTER_KEY),
    cartesiaApiKey: readStoredKey(CARTESIA_KEY),
    googleApiKey: readStoredKey(GOOGLE_KEY),
    openluxApiKey: readStoredKey(OPENLUX_KEY),
    giphyApiKey: readStoredKey(GIPHY_KEY),
    serperApiKey: readStoredKey(SERPER_KEY),
    modelSlugs: modelSlugs.length ? modelSlugs : defaultSettings.modelSlugs,
    selectedModel,
  };
};

export const saveSettings = (settings: StudioSettings) => {
  try {
    // The model and keys are stored separately from the settings blob so a
    // quota failure on the larger blob cannot take them down with it.
    window.localStorage.setItem(MODEL_KEY, settings.selectedModel);
    window.localStorage.setItem(OPENROUTER_KEY, sanitizeApiKey(settings.apiKey));
    window.localStorage.setItem(CARTESIA_KEY, sanitizeApiKey(settings.cartesiaApiKey));
    window.localStorage.setItem(GOOGLE_KEY, sanitizeApiKey(settings.googleApiKey));
    window.localStorage.setItem(OPENLUX_KEY, sanitizeApiKey(settings.openluxApiKey));
    window.localStorage.setItem(GIPHY_KEY, sanitizeApiKey(settings.giphyApiKey));
    window.localStorage.setItem(SERPER_KEY, sanitizeApiKey(settings.serperApiKey));
    window.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        ...settings,
        apiKey: '',
        cartesiaApiKey: '',
        googleApiKey: '',
        openluxApiKey: '',
        giphyApiKey: '',
        serperApiKey: '',
      }),
    );
  } catch {
    // Keep settings in memory when browser storage is unavailable.
  }
  // Durable backup: the model also lives in IndexedDB, so a storage reset or
  // a quota-full localStorage never loses the last choice.
  void idb.set(MODEL_KEY, settings.selectedModel).catch(() => {});
};

/** The durable copy of the selected model, used as a backup on load. */
export const loadSettingsDurable = () => idb.get<string>(MODEL_KEY);

/* ─────────────── IndexedDB store ─────────────── */

/**
 * Cuts and projects hold generated scene code that can outgrow localStorage's
 * quota, so IndexedDB is their durable home and localStorage stays as a
 * best-effort mirror for very small collections.
 */
const idb = (() => {
  let database: IDBDatabase | null = null;

  const open = (): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
      if (database) {
        resolve(database);
        return;
      }
      const request = indexedDB.open('motion-studio', 1);
      request.onupgradeneeded = () => {
        const created = request.result;
        if (!created.objectStoreNames.contains('kv')) created.createObjectStore('kv');
      };
      request.onsuccess = () => {
        database = request.result;
        resolve(database);
      };
      request.onerror = () => reject(request.error ?? new Error('IndexedDB is unavailable.'));
    });

  return {
    get: async <T,>(key: string): Promise<T | null> => {
      try {
        const db = await open();
        return await new Promise<T | null>((resolve) => {
          const transaction = db.transaction('kv', 'readonly');
          const request = transaction.objectStore('kv').get(key);
          request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
          request.onerror = () => resolve(null);
        });
      } catch {
        return null;
      }
    },
    set: async (key: string, value: unknown): Promise<void> => {
      const db = await open();
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('kv', 'readwrite');
        transaction.objectStore('kv').put(value, key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () =>
          reject(transaction.error ?? new Error('IndexedDB write failed.'));
      });
    },
  };
})();

/* ─────────────── Editor page: transcript-driven cuts ─────────────── */

export const loadCuts = () => readJson<Cut[]>(CUTS_KEY, []);

/** The durable copy of the cuts, preferred over the localStorage mirror. */
export const loadCutsDurable = () => idb.get<Cut[]>(CUTS_KEY);

export const saveCuts = (cuts: Cut[]) => {
  // Scene code is large; IndexedDB is the durable home and localStorage a
  // best-effort mirror for the very small collections.
  void idb.set(CUTS_KEY, cuts).catch(() => {});
  try {
    window.localStorage.setItem(CUTS_KEY, JSON.stringify(cuts));
  } catch {
    // Full or unavailable — the IndexedDB copy has it.
  }
};

export const loadActiveCutId = () => window.localStorage.getItem(ACTIVE_CUT_KEY);

export const saveActiveCutId = (cutId: string) => {
  try {
    window.localStorage.setItem(ACTIVE_CUT_KEY, cutId);
  } catch {
    // Keep the in-memory selection.
  }
};

/* ─────────────── Rive interactive projects ─────────────── */

export const loadRiveProjects = () => readJson<RiveProject[]>(RIVE_PROJECTS_KEY, []);

export const loadRiveProjectsDurable = () => idb.get<RiveProject[]>(RIVE_PROJECTS_KEY);

export const saveRiveProjects = (projects: RiveProject[]) => {
  // Uploaded .riv files can exceed localStorage's quota, so IndexedDB is the
  // durable copy. URLs and small files still get a fast localStorage mirror.
  void idb.set(RIVE_PROJECTS_KEY, projects).catch(() => {});
  try {
    window.localStorage.setItem(RIVE_PROJECTS_KEY, JSON.stringify(projects));
  } catch {
    // The IndexedDB copy remains available after reload.
  }
};

export const loadActiveRiveId = () => window.localStorage.getItem(ACTIVE_RIVE_KEY);

export const saveActiveRiveId = (projectId: string) => {
  try {
    window.localStorage.setItem(ACTIVE_RIVE_KEY, projectId);
  } catch {
    // Keep the in-memory selection.
  }
};

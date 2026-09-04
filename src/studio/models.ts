export type Provider = 'openrouter' | 'google' | 'openlux' | 'codex';

/**
 * Keys are pasted, and a paste can carry a newline, a stray space, or a
 * zero-width character from a web page. Any of those either break the
 * Authorization header outright or get the key rejected as invalid, so strip
 * every non-printing character before the key is stored or sent.
 */
export const sanitizeApiKey = (value: string) =>
  (value ?? '').replace(/[\s\u00a0\u200b-\u200d\ufeff]/g, '');

export type ModelOption = {
  id: string;
  label: string;
  provider: Provider;
  supportsImages: boolean;
};

/**
 * Google AI Studio models, called directly against the Gemini API rather than
 * routed through OpenRouter. Fixed list — these are not user-editable slugs.
 * Keep this list to text-generation models that accept the image attachments
 * used by the assistant. Image-generation, audio, embedding, and Live models
 * do not return the JSX scene response this app expects.
 */
export const GOOGLE_MODELS: ModelOption[] = [
  {
    id: 'gemini-3.5-flash-lite',
    label: 'Gemini 3.5 Flash Lite',
    provider: 'google',
    supportsImages: true,
  },
  {
    id: 'gemini-3.7-flash',
    label: 'Gemini 3.7 Flash',
    provider: 'google',
    supportsImages: true,
  },
  {
    id: 'gemini-3.6-flash',
    label: 'Gemini 3.6 Flash',
    provider: 'google',
    supportsImages: true,
  },
  {
    id: 'gemini-3.5-flash',
    label: 'Gemini 3.5 Flash',
    provider: 'google',
    supportsImages: true,
  },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash Lite',
    provider: 'google',
    supportsImages: true,
  },
  {
    id: 'gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro Preview',
    provider: 'google',
    supportsImages: true,
  },
  {
    id: 'gemini-3-flash-preview',
    label: 'Gemini 3 Flash Preview',
    provider: 'google',
    supportsImages: true,
  },
  {
    id: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    provider: 'google',
    supportsImages: true,
  },
  {
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    provider: 'google',
    supportsImages: true,
  },
  {
    id: 'gemini-2.5-flash-lite',
    label: 'Gemini 2.5 Flash Lite',
    provider: 'google',
    supportsImages: true,
  },
];

const GOOGLE_MODEL_IDS = new Set(GOOGLE_MODELS.map((model) => model.id));

export const OPENLUX_MODEL_PREFIX = 'openlux:';
export const DEFAULT_OPENLUX_MODEL = `${OPENLUX_MODEL_PREFIX}gemini-3.7-flash`;
export const CODEX_MODEL_PREFIX = 'codex:';
export const DEFAULT_CODEX_MODEL = `${CODEX_MODEL_PREFIX}default`;

/**
 * Legacy planner default retained for saved integrations. The editor now
 * plans with the selected model so one provider's rate limit cannot block the
 * whole pipeline.
 */
export const PLANNER_MODEL = DEFAULT_OPENLUX_MODEL;

/**
 * The visual-QA quick fix model: free-tier Gemini on AI Studio. Small
 * surgical fixes are routed here so the main generation model is never spent
 * on them.
 */
export const QUICK_FIX_MODEL = 'gemini-3.5-flash-lite';

/**
 * The photo picker: it reads a contact sheet and names one cell. A small
 * vision model is the right tool — the judgement is "is this the thing", and
 * it runs once or twice per shot, so latency and price matter more than depth.
 */
export const IMAGE_PICKER_MODEL = 'gemini-3.1-flash-lite';

/** Models exposed by the local Codex CLI. `default` follows the user's Codex setting. */
export const CODEX_MODELS: ModelOption[] = [
  {
    id: DEFAULT_CODEX_MODEL,
    label: 'Codex default (your subscription)',
    provider: 'codex',
    supportsImages: true,
  },
  {
    id: `${CODEX_MODEL_PREFIX}gpt-5.6-terra`,
    label: 'GPT-5.6 Terra',
    provider: 'codex',
    supportsImages: true,
  },
  {
    id: `${CODEX_MODEL_PREFIX}gpt-5.6-sol`,
    label: 'GPT-5.6 Sol',
    provider: 'codex',
    supportsImages: true,
  },
  {
    id: `${CODEX_MODEL_PREFIX}gpt-5.5`,
    label: 'GPT-5.5',
    provider: 'codex',
    supportsImages: true,
  },
  {
    id: `${CODEX_MODEL_PREFIX}gpt-5.4`,
    label: 'GPT-5.4',
    provider: 'codex',
    supportsImages: true,
  },
  {
    id: `${CODEX_MODEL_PREFIX}codex-mini-latest`,
    label: 'Codex mini latest',
    provider: 'codex',
    supportsImages: true,
  },
];

export const apiModelId = (model: string) =>
  model.startsWith(OPENLUX_MODEL_PREFIX)
    ? model.slice(OPENLUX_MODEL_PREFIX.length)
    : model.startsWith(CODEX_MODEL_PREFIX)
      ? model.slice(CODEX_MODEL_PREFIX.length)
      : model;

export const providerForModel = (model: string): Provider =>
  GOOGLE_MODEL_IDS.has(model)
    ? 'google'
    : model.startsWith(OPENLUX_MODEL_PREFIX)
      ? 'openlux'
      : model.startsWith(CODEX_MODEL_PREFIX)
        ? 'codex'
        : 'openrouter';

/** Human-readable model name for transcript attribution. */
export const modelLabel = (model: string) => {
  const known = [...GOOGLE_MODELS, ...CODEX_MODELS].find((option) => option.id === model);
  if (known) return known.label;
  if (model.startsWith(OPENLUX_MODEL_PREFIX)) return `OpenLux · ${apiModelId(model)}`;
  return model;
};

export const PROVIDER_LABEL: Record<Provider, string> = {
  google: 'Google AI Studio',
  openrouter: 'OpenRouter',
  openlux: 'OpenLux',
  codex: 'OpenAI Codex · OAuth',
};

/** Which settings field holds the key a given model needs. */
export const keyFieldForProvider: Record<
  Provider,
  'apiKey' | 'googleApiKey' | 'openluxApiKey' | null
> = {
  openrouter: 'apiKey',
  google: 'googleApiKey',
  openlux: 'openluxApiKey',
  codex: null,
};

/** AI Studio keys are free tier, so those models never accrue cost. */
export const isFreeProvider = (provider: Provider) => provider === 'google';

/** Codex usage is charged to the signed-in ChatGPT/Codex plan, not an API key. */
export const isSubscriptionProvider = (provider: Provider) => provider === 'codex';

export type StudioRole = 'user' | 'assistant';

/** A reference image attached to a direction, held as a data URL. */
export type Attachment = {
  id: string;
  name: string;
  /** Full-size `data:image/…;base64,…`, sent to the model. */
  dataUrl: string;
  /**
   * Small preview kept in the persisted transcript. Transcripts go to
   * localStorage, where full images would exhaust the quota.
   */
  thumbUrl?: string;
};

export type StudioMessage = {
  id: string;
  role: StudioRole;
  content: string;
  createdAt: number;
  /** Model selected for this assistant response, when it came from a provider. */
  model?: string;
  /** Set on assistant turns that put a scene on the canvas. */
  code?: string;
  durationInFrames?: number;
  isError?: boolean;
  /** Reference images sent with a user turn. */
  images?: Attachment[];
  /** USD charged for an assistant turn. 0 for the free Google models. */
  costUsd?: number;
};

export type SavedGraphic = {
  id: string;
  name: string;
  code: string;
  durationInFrames: number;
  savedAt: number;
};

export type StudioProject = {
  id: string;
  name: string;
  /** The JSX source for the scene currently on the canvas. */
  code: string;
  durationInFrames: number;
  messages: StudioMessage[];
  savedGraphics: SavedGraphic[];
  createdAt: number;
  updatedAt: number;
};

export type StudioSettings = {
  /** OpenRouter key. */
  apiKey: string;
  /** Cartesia key, sent through the same-origin voiceover API. */
  cartesiaApiKey: string;
  /** Google AI Studio key, used by the Gemini models. */
  googleApiKey: string;
  /** OpenLux key, used by namespaced OpenLux models. */
  openluxApiKey: string;
  /** GIPHY public API key, used client-side to load the current trending feed. */
  giphyApiKey: string;
  /** serper.dev key, for real photograph search. */
  serperApiKey: string;
  /** User-managed OpenRouter slugs. Google models are a fixed separate list. */
  modelSlugs: string[];
  selectedModel: string;
};

import {sanitizeApiKey} from './models';
import {buildSystemPrompt, buildUserMessage, HouseStyle} from './prompt';
import {Attachment} from './types';

type OpenRouterRequestArgs = {
  apiKey: string;
  model: string;
  instruction: string;
  currentCode?: string;
  currentDurationInFrames?: number;
  repairError?: string;
  forceFullRewrite?: boolean;
  history?: Array<{role: 'user' | 'assistant'; content: string}>;
  images?: Attachment[];
  houseStyle?: HouseStyle;
};

export type CompletionResult = {
  text: string;
  /** USD charged, when the provider reports it. */
  cost: number | null;
};

/** Returns raw reply text; parsing is shared with the Google path. */
export const requestOpenRouterCompletion = async ({
  apiKey,
  model,
  instruction,
  currentCode,
  currentDurationInFrames,
  repairError,
  forceFullRewrite,
  history = [],
  images = [],
  houseStyle,
}: OpenRouterRequestArgs): Promise<CompletionResult> => {
  const prompt = buildUserMessage({
    instruction,
    currentCode,
    currentDurationInFrames,
    repairError,
    forceFullRewrite,
    history,
    imageCount: images.length,
    houseStyle,
  });
  const systemPrompt = buildSystemPrompt({
    instruction,
    history,
    imageCount: images.length,
    houseStyle,
  });

  // OpenAI-shaped multimodal content; a plain string when there is nothing to
  // attach, which every model accepts.
  const userContent = images.length
    ? [
        {type: 'text', text: prompt},
        ...images.map((image) => ({
          type: 'image_url',
          image_url: {url: image.dataUrl},
        })),
      ]
    : prompt;

  // Strip again at the edge: a key restored from an older save may still carry
  // whitespace, which produces a header OpenRouter reads as absent.
  const key = sanitizeApiKey(apiKey);
  if (!key) {
    throw new Error('No OpenRouter key was sent. Add your key in Settings and try again.');
  }

  // Provider calls go through the local bridge. Calling OpenRouter directly
  // from the browser is rejected by some network/CORS configurations as the
  // opaque `Failed to fetch` error, hiding the provider's real response.
  const response = await fetch('/api/llm/openrouter', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      apiKey: key,
      requestBody: {
        model,
        temperature: 0.45,
        max_tokens: 8000,
        // OpenRouter only prices a call when usage accounting is asked for.
        // Without this the response carries token counts and no `usage.cost`,
        // so every generation recorded as $0 and the history panel had nothing
        // to show — which is not the same as a run being free.
        usage: {include: true},
        messages: [
          {role: 'system', content: systemPrompt},
          ...history,
          {role: 'user', content: userContent},
        ],
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    if (response.status === 401) {
      throw new Error(
        'OpenRouter rejected the key (401). Open Settings and paste your OpenRouter key again — the saved one is missing or no longer valid.',
      );
    }
    throw new Error(`OpenRouter returned ${response.status}: ${detail.slice(0, 220)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{message?: {content?: string | Array<{type?: string; text?: string}>}}>;
    usage?: {cost?: number};
  };
  const raw = data.choices?.[0]?.message?.content;
  const content = Array.isArray(raw) ? raw.map((part) => part.text ?? '').join('') : raw;

  if (!content) throw new Error('The model returned an empty response.');

  return {
    text: content,
    cost: typeof data.usage?.cost === 'number' ? data.usage.cost : null,
  };
};

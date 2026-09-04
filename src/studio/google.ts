import {sanitizeApiKey} from './models';
import {CompletionResult} from './openrouter';
import {buildSystemPrompt, buildUserMessage, HouseStyle} from './prompt';
import {Attachment} from './types';

type GoogleRequestArgs = {
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

const sceneResponseSchema = (allowEdits: boolean) => ({
  type: 'object',
  additionalProperties: false,
  properties: {
    title: {
      type: 'string',
      description: 'A short 2-5 word project title on a new scene, or an empty string for an edit.',
    },
    message: {
      type: 'string',
      description: 'One plain sentence describing what was made or changed.',
    },
    durationInFrames: {
      type: 'integer',
      minimum: 30,
      maximum: 3600,
      description: 'Composition duration at 60 frames per second.',
    },
    mode: {
      type: 'string',
      enum: allowEdits ? ['edit', 'full'] : ['full'],
      description: allowEdits
        ? 'Use "edit" for any change to the existing scene. Use "full" only when the graphic is being replaced outright.'
        : 'Always "full": there is no existing scene to edit.',
    },
    code: {
      type: 'string',
      description:
        'For mode "full", the complete JSX source defining const Scene, with no Markdown fences. Empty string for mode "edit".',
    },
    edits: {
      type: 'array',
      description:
        'For mode "edit", the changes to make. Empty for mode "full". Each find section must be copied verbatim from the current scene and must match exactly one place in it.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          find: {type: 'string', description: 'Lines copied verbatim from the current scene.'},
          replace: {type: 'string', description: 'What those lines become. Empty string deletes them.'},
        },
        required: ['find', 'replace'],
      },
    },
  },
  required: ['title', 'message', 'durationInFrames', 'mode', 'code', 'edits'],
});

/** `data:image/png;base64,AAAA` -> `{mimeType, data}` for Gemini's inlineData. */
const toInlineData = (dataUrl: string) => {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.*)$/);
  if (!match) return null;
  return {mimeType: match[1], data: match[2]};
};

/**
 * Calls the Gemini API (AI Studio keys) and returns the raw reply text in the
 * same prose + fenced-code shape the OpenRouter path produces, so the caller
 * parses both identically.
 *
 * The key goes in the `x-goog-api-key` header rather than the `?key=` query
 * parameter the docs also allow — a URL would leak it into any logging.
 */
export const requestGoogleCompletion = async ({
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
}: GoogleRequestArgs): Promise<CompletionResult> => {
  const allowEdits = Boolean(currentCode?.trim()) && !forceFullRewrite;
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

  const inlineParts = images
    .map((image) => toInlineData(image.dataUrl))
    .filter((part): part is {mimeType: string; data: string} => part !== null)
    .map((inlineData) => ({inlineData}));

  const thinkingConfig = model.startsWith('gemini-2.5')
    ? {thinkingBudget: 1024}
    : {thinkingLevel: 'medium'};
  const schema = sceneResponseSchema(allowEdits);
  const structuredOutput = model.startsWith('gemini-2.5')
    ? {responseMimeType: 'application/json', responseJsonSchema: schema}
    : {
        responseFormat: {
          text: {mimeType: 'APPLICATION_JSON', schema},
        },
      };

  // Gemini is also routed through the local bridge so all providers behave the
  // same way when browser CORS or a VPN blocks direct cross-origin requests.
  const response = await fetch('/api/llm/google', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      apiKey: sanitizeApiKey(apiKey),
      model,
      requestBody: {
        systemInstruction: {parts: [{text: systemPrompt}]},
        contents: [
          ...history.map((message) => ({
            // Gemini names the assistant turn "model".
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: [{text: message.content}],
          })),
          {role: 'user', parts: [{text: prompt}, ...inlineParts]},
        ],
        generationConfig: {
          maxOutputTokens: 16000,
          thinkingConfig,
          ...structuredOutput,
        },
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Google AI Studio returned ${response.status}: ${detail.slice(0, 220)}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: {parts?: Array<{text?: string}>};
      finishReason?: string;
    }>;
    promptFeedback?: {blockReason?: string};
  };

  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';

  if (!text) {
    const blocked = data.promptFeedback?.blockReason;
    if (blocked) throw new Error(`Google AI Studio blocked the request (${blocked}).`);
    if (candidate?.finishReason === 'MAX_TOKENS') {
      throw new Error('The scene was cut off before it finished. Try a simpler direction.');
    }
    throw new Error('The model returned an empty response.');
  }

  let structured: {
    title?: string;
    message?: string;
    durationInFrames?: number;
    mode?: string;
    code?: string;
    edits?: Array<{find?: string; replace?: string}>;
  };
  try {
    structured = JSON.parse(text) as typeof structured;
  } catch {
    // Older endpoints can ignore structured-output configuration. Keep the
    // legacy prose + fence parser available instead of turning that into a
    // hard transport failure.
    return {text, cost: 0};
  }

  const title = structured.title?.trim();
  const message = structured.message?.trim() || 'Updated the graphic on the canvas.';
  const duration = Math.round(Number(structured.durationInFrames) || 240);
  const header = `${title ? `TITLE: ${title}\n` : ''}${message}\nDURATION: ${duration}\n\n`;

  const usableEdits = (structured.edits ?? []).filter((edit) => edit.find?.trim());
  if (allowEdits && structured.mode === 'edit' && usableEdits.length) {
    // Rebuild the provider-neutral patch text so both transports go through
    // exactly the same parser and the same patch application.
    const blocks = usableEdits
      .map((edit) => `<<<<<<< FIND\n${edit.find}\n=======\n${edit.replace ?? ''}\n>>>>>>> REPLACE`)
      .join('\n\n');
    return {text: `${header}${blocks}`, cost: 0};
  }

  if (!structured.code?.trim()) {
    throw new Error(
      structured.mode === 'edit'
        ? 'The model asked for an edit but sent no usable find/replace blocks.'
        : 'The model returned structured output without scene code.',
    );
  }
  const code = structured.code
    .replace(/^```(?:jsx|tsx|js|javascript|react)?\s*\n/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  // Convert to the provider-neutral shape consumed by parseSceneReply().
  return {text: `${header}\`\`\`jsx\n${code}\n\`\`\``, cost: 0};
};

/**
 * One structured JSON answer from a Gemini model, with optional images.
 *
 * The scene path above is shaped entirely around scene source; the image
 * pipeline needs the same transport for two much smaller questions (what to
 * search for, and which candidate to use) and gets the answer back as parsed
 * JSON rather than as a fenced reply. Everything still goes through the local
 * bridge so a browser CORS block or a VPN behaves identically everywhere.
 */
export const requestGeminiJson = async <T>({
  apiKey,
  model,
  systemPrompt,
  prompt,
  images = [],
  schema,
  maxOutputTokens = 900,
}: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  prompt: string;
  /** Data URLs, sent as inline image parts after the prompt. */
  images?: string[];
  schema: Record<string, unknown>;
  maxOutputTokens?: number;
}): Promise<T> => {
  const inlineParts = images
    .map((image) => toInlineData(image))
    .filter((part): part is {mimeType: string; data: string} => part !== null)
    .map((inlineData) => ({inlineData}));

  const response = await fetch('/api/llm/google', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      apiKey: sanitizeApiKey(apiKey),
      model,
      requestBody: {
        systemInstruction: {parts: [{text: systemPrompt}]},
        contents: [{role: 'user', parts: [{text: prompt}, ...inlineParts]}],
        generationConfig: {
          maxOutputTokens,
          // These are small classification calls; thinking buys nothing and
          // costs the whole latency budget of a per-shot lookup.
          thinkingConfig: model.startsWith('gemini-2.5')
            ? {thinkingBudget: 0}
            : {thinkingLevel: 'low'},
          ...(model.startsWith('gemini-2.5')
            ? {responseMimeType: 'application/json', responseJsonSchema: schema}
            : {responseFormat: {text: {mimeType: 'APPLICATION_JSON', schema}}}),
        },
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Google AI Studio returned ${response.status}: ${detail.slice(0, 220)}`);
  }
  const data = (await response.json()) as {
    candidates?: Array<{content?: {parts?: Array<{text?: string}>}}>;
    promptFeedback?: {blockReason?: string};
  };
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
  if (!text.trim()) {
    const blocked = data.promptFeedback?.blockReason;
    throw new Error(blocked ? `Google AI Studio blocked the request (${blocked}).` : 'The model returned an empty response.');
  }
  // A model can still wrap JSON in a fence when structured output is ignored.
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  return JSON.parse(cleaned) as T;
};

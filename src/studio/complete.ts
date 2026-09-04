/**
 * A plain completion, for the calls that are not scene generation.
 *
 * The scene transports each hardwire `buildSystemPrompt`/`buildUserMessage`,
 * which is right for them and useless for the shot planner: that call wants
 * its own system prompt and a JSON answer. This is the same four providers
 * behind one function that takes the prompt it is given.
 */
import {
  apiModelId,
  keyFieldForProvider,
  providerForModel,
  sanitizeApiKey,
} from './models';
import {MissingKeyError} from './assistant';
import {CompletionResult} from './openrouter';
import {StudioSettings} from './types';

type CompletionArgs = {
  settings: StudioSettings;
  model: string;
  system: string;
  user: string;
  /** Gemini gets this as a response schema; the others are asked in prose. */
  jsonSchema?: Record<string, unknown>;
  maxTokens?: number;
};

const MAX_CHAT_ATTEMPTS = 3;
const RETRYABLE_CHAT_STATUSES = new Set([429, 500, 502, 503, 529]);

const waitFor = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const responseDetail = async (response: Response) => {
  const raw = await response.text();
  let detail = '';
  try {
    const payload = JSON.parse(raw) as {
      error?: unknown;
      message?: unknown;
      detail?: unknown;
    };
    const nested = payload.error;
    if (typeof nested === 'string') detail = nested;
    else if (nested && typeof nested === 'object') {
      const nestedRecord = nested as Record<string, unknown>;
      if (typeof nestedRecord.message === 'string') detail = nestedRecord.message;
      else if (typeof nestedRecord.detail === 'string') detail = nestedRecord.detail;
    }
    if (!detail && typeof payload.message === 'string') detail = payload.message;
    if (!detail && typeof payload.detail === 'string') detail = payload.detail;
  } catch {
    // Some gateways return plain text. Keep that text for the actionable error.
  }
  return (detail || raw || response.statusText || 'No provider details returned.')
    .replace(/\s+/g, ' ')
    .slice(0, 220);
};

const retryDelay = (response: Response, attempt: number) => {
  const retryAfter = Number(response.headers.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter >= 0) {
    return Math.min(10_000, Math.round(retryAfter * 1000));
  }
  return Math.min(8_000, 800 * 2 ** attempt);
};

const requestGoogle = async ({
  apiKey,
  model,
  system,
  user,
  jsonSchema,
  maxTokens,
}: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  jsonSchema?: Record<string, unknown>;
  maxTokens: number;
}): Promise<CompletionResult> => {
  // Same split as google.ts: the 2.5 family takes the older field names.
  const legacy = model.startsWith('gemini-2.5');
  const structured = jsonSchema
    ? legacy
      ? {responseMimeType: 'application/json', responseJsonSchema: jsonSchema}
      : {responseFormat: {text: {mimeType: 'APPLICATION_JSON', schema: jsonSchema}}}
    : {};

  const response = await fetch('/api/llm/google', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      apiKey: sanitizeApiKey(apiKey),
      model,
      requestBody: {
        systemInstruction: {parts: [{text: system}]},
        contents: [{role: 'user', parts: [{text: user}]}],
        generationConfig: {maxOutputTokens: maxTokens, ...structured},
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Google AI Studio returned ${response.status}: ${detail.slice(0, 220)}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{content?: {parts?: Array<{text?: string}>}; finishReason?: string}>;
    promptFeedback?: {blockReason?: string};
  };
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
  if (!text) {
    const blocked = data.promptFeedback?.blockReason;
    if (blocked) throw new Error(`Google AI Studio blocked the request (${blocked}).`);
    if (candidate?.finishReason === 'MAX_TOKENS') {
      throw new Error('The reply was cut off before it finished.');
    }
    throw new Error('The model returned an empty response.');
  }
  return {text, cost: 0};
};

const requestChatCompletions = async ({
  bridgePath,
  apiKey,
  model,
  system,
  user,
  maxTokens,
  label,
}: {
  bridgePath: '/api/llm/openrouter' | '/api/llm/openlux';
  apiKey: string;
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  label: string;
}): Promise<CompletionResult> => {
  const key = sanitizeApiKey(apiKey);
  if (!key) throw new Error(`No ${label} key was sent. Add your key in Settings and try again.`);

  const requestBody = JSON.stringify({
    model,
    temperature: 0.3,
    max_tokens: maxTokens,
    messages: [
      {role: 'system', content: system},
      {role: 'user', content: user},
    ],
    // See openrouter.ts: `usage.cost` comes back only when accounting is
    // requested. Sent only to OpenRouter — another OpenAI-compatible endpoint
    // may reject a body field it does not know.
    ...(bridgePath === '/api/llm/openrouter' ? {usage: {include: true}} : {}),
  });

  let lastStatus = 502;
  let lastDetail = 'No provider details returned.';
  for (let attempt = 0; attempt < MAX_CHAT_ATTEMPTS; attempt += 1) {
    const response = await fetch(bridgePath, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({apiKey: key, requestBody: JSON.parse(requestBody)}),
    });

    if (response.ok) {
      const data = (await response.json()) as {
        choices?: Array<{message?: {content?: string | Array<{type?: string; text?: string}>}}>;
        usage?: {cost?: number};
      };
      const raw = data.choices?.[0]?.message?.content;
      const content = Array.isArray(raw) ? raw.map((part) => part.text ?? '').join('') : raw;
      if (!content) throw new Error('The model returned an empty response.');
      return {text: content, cost: typeof data.usage?.cost === 'number' ? data.usage.cost : null};
    }

    lastStatus = response.status;
    lastDetail = await responseDetail(response);
    if (response.status === 401) {
      throw new Error(`${label} rejected the key (401). Paste it again in Settings.`);
    }

    const canRetry =
      RETRYABLE_CHAT_STATUSES.has(response.status) && attempt + 1 < MAX_CHAT_ATTEMPTS;
    if (!canRetry) break;
    await waitFor(retryDelay(response, attempt));
  }

  if (lastStatus === 429) {
    throw new Error(
      `${label} is rate-limiting requests (429) after ${MAX_CHAT_ATTEMPTS} attempts: ${lastDetail}`,
    );
  }
  throw new Error(`${label} returned ${lastStatus}: ${lastDetail}`);
};

export const requestCompletion = async ({
  settings,
  model,
  system,
  user,
  jsonSchema,
  maxTokens = 4000,
}: CompletionArgs): Promise<CompletionResult> => {
  const provider = providerForModel(model);

  if (provider === 'codex') {
    // The local bridge takes one flat prompt, so the system half is prefixed.
    const response = await fetch('/api/codex/completions', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({model: apiModelId(model), prompt: `${system}\n\n${user}`, images: []}),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      text?: string;
      detail?: string;
    };
    if (!response.ok) throw new Error(payload.detail ?? `Codex bridge returned ${response.status}.`);
    if (!payload.text?.trim()) throw new Error('Codex returned an empty response.');
    return {text: payload.text, cost: null};
  }

  const keyField = keyFieldForProvider[provider];
  const apiKey = keyField ? sanitizeApiKey(settings[keyField] ?? '') : '';
  if (!apiKey) throw new MissingKeyError(provider);

  if (provider === 'google') {
    return requestGoogle({apiKey, model, system, user, jsonSchema, maxTokens});
  }
  if (provider === 'openlux') {
    return requestChatCompletions({
      bridgePath: '/api/llm/openlux',
      apiKey,
      model: apiModelId(model),
      system,
      user,
      maxTokens,
      label: 'OpenLux',
    });
  }
  return requestChatCompletions({
    bridgePath: '/api/llm/openrouter',
    apiKey,
    model,
    system,
    user,
    maxTokens,
    label: 'OpenRouter',
  });
};

/** The reply stopped before its JSON was closed. A retry with the cut-off
    pointed out recovers most of these; the shot list is too big to guess. */
export class TruncatedJsonError extends Error {
  constructor() {
    super('The planner returned truncated JSON.');
    this.name = 'TruncatedJsonError';
  }
}

/**
 * Models wrap JSON in prose or a fence however firmly they are asked not to.
 * Scan every `[` or `{` in the reply in order and take the first one that
 * balances and parses. A stray brace in a sentence ("we group {0,1}") is
 * skipped, and a reply cut off before its JSON closed is reported as
 * truncated so the caller can retry once.
 */
export const extractJson = <T,>(raw: string): T => {
  const unfenced = raw.replace(/```(?:json)?\s*([\s\S]*?)```/i, '$1').trim();
  let sawCandidate = false;
  for (let start = 0; start < unfenced.length; start += 1) {
    const open = unfenced[start];
    if (open !== '[' && open !== '{') continue;
    sawCandidate = true;

    const close = open === '[' ? ']' : '}';
    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;
    for (let i = start; i < unfenced.length; i += 1) {
      const character = unfenced[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === '\\') {
        escaped = true;
        continue;
      }
      if (character === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (character === open) depth += 1;
      else if (character === close) {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    // The reply ran out before this candidate closed. It cannot be followed
    // by a later, complete JSON, so this is truncation, not a false start.
    if (end === -1) throw new TruncatedJsonError();
    try {
      return JSON.parse(unfenced.slice(start, end + 1)) as T;
    } catch {
      // Not JSON, or JSON in the wrong shape: a prose fragment like a brace
      // in a sentence. Keep scanning for a candidate that actually parses.
    }
  }
  if (!sawCandidate) throw new Error('The planner did not return JSON.');
  // Every candidate balanced but none parsed: the reply carried no JSON.
  throw new Error('The planner did not return valid JSON.');
};

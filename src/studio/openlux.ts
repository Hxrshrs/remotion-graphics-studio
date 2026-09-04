import {apiModelId, sanitizeApiKey} from './models';
import {CompletionResult} from './openrouter';
import {buildSystemPrompt, buildUserMessage, HouseStyle} from './prompt';
import {Attachment} from './types';

type OpenLuxRequestArgs = {
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

const MAX_REQUEST_ATTEMPTS = 3;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 529]);

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

const openLuxOutputContract = (allowEdits: boolean) =>
  allowEdits
    ? `For this OpenLux request, return only a JSON object with these fields: title (string, usually empty), message (string), durationInFrames (integer, usually unchanged), mode (the string "edit"), code (an empty string), and edits (an array of objects with exact find and replace strings). Copy every find string character-for-character from CURRENT SCENE. Make the smallest complete edit; if the requested change spans multiple components, include every affected block. Never return the complete scene source for an edit. Do not wrap the JSON in Markdown.`
    : `For this OpenLux request, return only a JSON object with these fields: title (string), message (string), durationInFrames (integer), mode (the string "full"), code (string containing the complete JSX source beginning with const Scene), and edits (an empty array). Do not wrap the JSON in Markdown and do not omit code.`;

type OpenLuxEnvelope = {
  title?: string;
  message?: string;
  durationInFrames?: number;
  mode?: string;
  code?: string;
  edits?: Array<{find?: string; replace?: string}>;
};

/**
 * Models occasionally add a short preamble or wrap the JSON contract in a
 * markdown fence. Extracting the object before parsing keeps that formatting
 * noise from turning a valid edit into an unusable reply.
 */
const parseJsonEnvelope = (content: string): OpenLuxEnvelope | null => {
  const trimmed = content.trim();
  const candidates = [
    trimmed.replace(/^```(?:json)?[ \t]*\r?\n?/i, '').replace(/\r?\n?```\s*$/i, '').trim(),
  ];
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) candidates.push(trimmed.slice(start, end + 1));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as OpenLuxEnvelope;
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // Try the next normalization candidate. The caller will preserve the
      // original response when none of them is valid JSON.
    }
  }
  return null;
};

const normalizeReply = (content: string, allowEdits: boolean) => {
  const parsed = parseJsonEnvelope(content);
  if (parsed) {
    const usableEdits = (Array.isArray(parsed.edits) ? parsed.edits : []).filter(
      (edit) => edit && typeof edit.find === 'string' && edit.find.trim(),
    );
    if (allowEdits && usableEdits.length) {
      const message = parsed.message?.trim() || 'Updated the graphic on the canvas.';
      const duration = Number.isFinite(parsed.durationInFrames)
        ? `\nDURATION: ${Math.round(parsed.durationInFrames as number)}`
        : '';
      const blocks = usableEdits
        .map((edit) => `<<<<<<< FIND\n${edit.find}\n=======\n${edit.replace ?? ''}\n>>>>>>> REPLACE`)
        .join('\n\n');
      return `${message}${duration}\n\n${blocks}`;
    }

    if (typeof parsed.code !== 'string' || !parsed.code.trim()) return content;
    const title = parsed.title?.trim() ? `TITLE: ${parsed.title.trim()}\n` : '';
    const message = parsed.message?.trim() || 'Updated the graphic on the canvas.';
    const duration = Number.isFinite(parsed.durationInFrames)
      ? `\nDURATION: ${Math.round(parsed.durationInFrames as number)}`
      : '';
    return `${title}${message}${duration}\n\n\`\`\`jsx\n${parsed.code.trim()}\n\`\`\``;
  }
  return content;
};

/** OpenLux uses the OpenAI-compatible chat completion contract. */
export const requestOpenLuxCompletion = async ({
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
}: OpenLuxRequestArgs): Promise<CompletionResult> => {
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
  const allowEdits = Boolean(currentCode?.trim()) && !forceFullRewrite;
  const systemPrompt = `${buildSystemPrompt({instruction, history, imageCount: images.length, houseStyle})}\n\n${openLuxOutputContract(allowEdits)}`;
  const userContent = images.length
    ? [
        {type: 'text', text: prompt},
        ...images.map((image) => ({type: 'image_url', image_url: {url: image.dataUrl}})),
      ]
    : prompt;
  const key = sanitizeApiKey(apiKey);
  if (!key) throw new Error('Add your OpenLux API key in Settings and try again.');

  const requestBody = JSON.stringify({
    model: apiModelId(model),
    temperature: 0.45,
    max_tokens: 16000,
    messages: [
      {role: 'system', content: systemPrompt},
      ...history,
      {role: 'user', content: userContent},
    ],
  });

  let lastStatus = 502;
  let lastDetail = 'No provider details returned.';
  for (let attempt = 0; attempt < MAX_REQUEST_ATTEMPTS; attempt += 1) {
    // Keep provider traffic on the local bridge. Direct browser requests can be
    // blocked by CORS or a network privacy layer and surface only `Failed to
    // fetch`, while the bridge can preserve OpenLux's status and error body.
    const response = await fetch('/api/llm/openlux', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({apiKey: key, requestBody: JSON.parse(requestBody)}),
    });

    if (response.ok) {
      const data = (await response.json()) as {
        choices?: Array<{
          message?: {content?: string | Array<{text?: string; content?: string}>};
        }>;
        usage?: {cost?: number};
      };
      const raw = data.choices?.[0]?.message?.content;
      const content = Array.isArray(raw)
        ? raw.map((part) => part.text ?? part.content ?? '').join('')
        : raw;
      if (!content) throw new Error('OpenLux returned an empty response.');
      return {
        text: normalizeReply(content, allowEdits),
        cost: typeof data.usage?.cost === 'number' ? data.usage.cost : null,
      };
    }

    lastStatus = response.status;
    lastDetail = await responseDetail(response);
    if (response.status === 401) {
      throw new Error('OpenLux rejected the saved key (401). Paste a valid key in Settings.');
    }

    const canRetry =
      RETRYABLE_STATUSES.has(response.status) && attempt + 1 < MAX_REQUEST_ATTEMPTS;
    if (!canRetry) break;
    await waitFor(retryDelay(response, attempt));
  }

  if (lastStatus === 429) {
    throw new Error(
      `OpenLux is rate-limiting requests (429) after ${MAX_REQUEST_ATTEMPTS} attempts: ${lastDetail}`,
    );
  }
  throw new Error(`OpenLux returned ${lastStatus}: ${lastDetail}`);
};

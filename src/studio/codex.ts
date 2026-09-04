import {useCallback, useEffect, useState} from 'react';
import {apiModelId} from './models';
import {CompletionResult} from './openrouter';
import {buildSystemPrompt, buildUserMessage, HouseStyle} from './prompt';
import {Attachment} from './types';

type CodexRequestArgs = {
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

export type CodexAuth = {
  status: 'checking' | 'authenticated' | 'signed_out' | 'unavailable';
  detail?: string;
};

const initialAuth: CodexAuth = {status: 'checking'};
let authCache: CodexAuth | null = null;
let authInFlight: Promise<CodexAuth> | null = null;

const fetchAuth = async (): Promise<CodexAuth> => {
  try {
    const response = await fetch('/api/codex/status', {cache: 'no-store'});
    if (!response.ok) return {status: 'unavailable', detail: 'Local Codex bridge is unavailable.'};
    const payload = (await response.json()) as {
      status?: CodexAuth['status'];
      detail?: string;
    };
    if (
      payload.status === 'authenticated' ||
      payload.status === 'signed_out' ||
      payload.status === 'unavailable'
    ) {
      return {status: payload.status, detail: payload.detail};
    }
    return {status: 'unavailable', detail: 'The Codex bridge returned an unknown status.'};
  } catch {
    return {status: 'unavailable', detail: 'Run the studio through its local Vite server to use Codex OAuth.'};
  }
};

const readAuth = (force = false) => {
  if (!force && authCache) return Promise.resolve(authCache);
  if (authInFlight) return authInFlight;
  authInFlight = fetchAuth()
    .then((next) => {
      authCache = next;
      return next;
    })
    .finally(() => {
      authInFlight = null;
    });
  return authInFlight;
};

export const useCodexAuth = () => {
  const [auth, setAuth] = useState<CodexAuth>(authCache ?? initialAuth);
  const refresh = useCallback(async () => {
    setAuth((current) => ({...current, status: 'checking'}));
    setAuth(await readAuth(true));
  }, []);

  useEffect(() => {
    let live = true;
    readAuth().then((next) => {
      if (live) setAuth(next);
    });
    return () => {
      live = false;
    };
  }, []);

  return {auth, refresh};
};

export const startCodexLogin = async () => {
  try {
    const response = await fetch('/api/codex/login', {method: 'POST'});
    const payload = (await response.json().catch(() => ({}))) as {detail?: string};
    return {ok: response.ok, detail: payload.detail};
  } catch {
    return {ok: false, detail: 'The local Codex bridge is unavailable. Start the studio with npm run dev.'};
  }
};

/**
 * Sends the request to the local Codex CLI bridge. The browser never receives
 * the OAuth token; the already signed-in CLI owns authentication and billing.
 */
export const requestCodexCompletion = async ({
  model,
  instruction,
  currentCode,
  currentDurationInFrames,
  repairError,
  forceFullRewrite,
  history = [],
  images = [],
  houseStyle,
}: CodexRequestArgs): Promise<CompletionResult> => {
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
  const recentConversation = history.length
    ? `RECENT CONVERSATION\n${history.map((turn) => `${turn.role.toUpperCase()}: ${turn.content}`).join('\n\n')}`
    : '';

  const response = await fetch('/api/codex/completions', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      model: apiModelId(model),
      prompt: [systemPrompt, recentConversation, prompt].filter(Boolean).join('\n\n'),
      images: images.map((image) => ({dataUrl: image.dataUrl, name: image.name})),
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    text?: string;
    detail?: string;
  };
  if (!response.ok) {
    throw new Error(
      payload.detail ??
        (response.status === 401
          ? 'Codex is not signed in. Open Settings and choose Sign in with ChatGPT.'
          : `Codex bridge returned ${response.status}.`),
    );
  }
  if (!payload.text?.trim()) throw new Error('Codex returned an empty response.');
  return {text: payload.text, cost: null};
};

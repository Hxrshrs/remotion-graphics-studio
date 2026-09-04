import { spawn } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { access, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const __filename = new URL(import.meta.url).pathname;
const __dirname = path.dirname(__filename);
const MAX_BODY_BYTES = 30 * 1024 * 1024;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const PROCESS_OUTPUT_LIMIT = 24 * 1024;

type JsonRecord = Record<string, unknown>;

const codexCandidates = () =>
  [
    process.env.CODEX_CLI_PATH,
    process.platform === 'darwin'
      ? '/Applications/ChatGPT.app/Contents/Resources/codex'
      : null,
    process.platform === 'win32' ? 'codex.exe' : 'codex',
  ].filter((candidate): candidate is string => Boolean(candidate));

const isLocalRequest = (request: IncomingMessage) => {
  const host = request.headers.host ?? '';
  const hostname = host.startsWith('[')
    ? host.slice(1, host.indexOf(']'))
    : host.split(':')[0];
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
};

const sendJson = (response: ServerResponse, status: number, payload: JsonRecord) => {
  const body = JSON.stringify(payload);
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(body);
};

const readBody = async (request: IncomingMessage): Promise<JsonRecord> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error('The Codex request is too large.');
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('The Codex request must be a JSON object.');
    }
    return parsed as JsonRecord;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('The Codex request')) throw error;
    throw new Error('The Codex request body is not valid JSON.');
  }
};

const appendLimited = (current: string, chunk: Buffer | string) => {
  const next = current + chunk.toString();
  return next.length > PROCESS_OUTPUT_LIMIT ? next.slice(-PROCESS_OUTPUT_LIMIT) : next;
};

type ProcessResult = { code: number | null; stdout: string; stderr: string };

const runProcess = (
  command: string,
  args: string[],
  input = '',
  timeoutMs = 20_000,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<ProcessResult> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: environment,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      reject(new Error('The Codex CLI timed out.'));
    }, timeoutMs);
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    child.stdout.on('data', (chunk: Buffer) => {
      stdout = appendLimited(stdout, chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = appendLimited(stderr, chunk);
    });
    child.once('error', (error) => finish(() => reject(error)));
    child.once('close', (code) =>
      finish(() => resolve({ code, stdout, stderr })),
    );
    child.stdin.end(input);
  });

const findCodexBinary = async () => {
  for (const candidate of codexCandidates()) {
    if (!path.isAbsolute(candidate)) return candidate;
    try {
      await access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      // Try the next install location.
    }
  }
  return null;
};

const codexStatus = async () => {
  const binary = await findCodexBinary();
  if (!binary) {
    return {
      status: 'unavailable',
      detail: 'Install the Codex CLI or ChatGPT desktop app on this computer.',
    } as const;
  }
  try {
    const result = await runProcess(binary, ['login', 'status']);
    const output = `${result.stdout}\n${result.stderr}`;
    if (result.code === 0 && /logged in|authenticated/i.test(output)) {
      return { status: 'authenticated', detail: 'Logged in using ChatGPT.' } as const;
    }
    if (/not logged|not authenticated|signed out|logged out/i.test(output)) {
      return { status: 'signed_out', detail: 'Sign in with ChatGPT through Codex.' } as const;
    }
    return { status: 'unavailable', detail: 'Codex could not report its sign-in status.' } as const;
  } catch {
    return { status: 'unavailable', detail: 'The Codex CLI could not be started.' } as const;
  }
};

const startCodexLoginProcess = async () => {
  const binary = await findCodexBinary();
  if (!binary) throw new Error('Install the Codex CLI or ChatGPT desktop app first.');
  await new Promise<void>((resolve, reject) => {
    const child = spawn(binary, ['login'], {
      cwd: process.cwd(),
      env: process.env,
      shell: false,
      detached: true,
      stdio: 'ignore',
    });
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve();
    };
    child.once('error', finish);
    child.once('spawn', () => {
      child.unref();
      finish();
    });
    setTimeout(() => finish(), 1_500);
  });
};

const materializeImages = async (body: JsonRecord, directory: string) => {
  const images = Array.isArray(body.images) ? body.images : [];
  if (images.length > 4) throw new Error('Attach up to four reference images per direction.');
  const extensions: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  const paths: string[] = [];
  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    const dataUrl =
      image && typeof image === 'object' && 'dataUrl' in image && typeof image.dataUrl === 'string'
        ? image.dataUrl
        : '';
    const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/i);
    if (!match) throw new Error('One attached image is not a supported data URL.');
    const bytes = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) {
      throw new Error('Each Codex reference image must be 4 MB or smaller.');
    }
    const filePath = path.join(directory, `reference-${index}.${extensions[match[1].toLowerCase()]}`);
    await writeFile(filePath, bytes, { flag: 'wx' });
    paths.push(filePath);
  }
  return paths;
};

/**
 * Keep ephemeral completions from touching the user's rollout/state database.
 * The OAuth file and normal Codex config are linked read-only into a temporary
 * CODEX_HOME, so the CLI can authenticate without exposing the token to the
 * browser or persisting another session on disk.
 */
const makeEphemeralCodexHome = async (directory: string) => {
  const sourceHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const home = path.join(directory, 'codex-home');
  await mkdir(home);
  for (const filename of ['auth.json', 'config.toml', 'models_cache.json', 'version.json']) {
    const source = path.join(sourceHome, filename);
    try {
      await access(source);
      await symlink(source, path.join(home, filename));
    } catch {
      // The CLI can use defaults when an optional file is absent.
    }
  }
  return home;
};

const runCodexCompletion = async (body: JsonRecord) => {
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) throw new Error('The Codex direction is empty.');
  if (prompt.length > 500_000) throw new Error('The Codex direction is too long.');
  const requestedModel = typeof body.model === 'string' ? body.model : 'default';
  if (requestedModel !== 'default' && !/^[A-Za-z0-9._-]+$/.test(requestedModel)) {
    throw new Error('That Codex model name is not valid.');
  }
  const binary = await findCodexBinary();
  if (!binary) throw new Error('Install the Codex CLI or ChatGPT desktop app first.');

  const directory = await mkdtemp(path.join(os.tmpdir(), 'motion-studio-codex-'));
  const outputPath = path.join(directory, 'last-message.txt');
  try {
    const imagePaths = await materializeImages(body, directory);
    const codexHome = await makeEphemeralCodexHome(directory);
    const args = [
      'exec',
      '--ephemeral',
      '--skip-git-repo-check',
      '--sandbox',
      'read-only',
      '--color',
      'never',
      '--output-last-message',
      outputPath,
    ];
    if (requestedModel !== 'default') args.push('--model', requestedModel);
    for (const imagePath of imagePaths) args.push('--image', imagePath);
    args.push('-');

    const result = await runProcess(
      binary,
      args,
      prompt,
      300_000,
      { ...process.env, CODEX_HOME: codexHome },
    );
    const output = `${result.stderr}\n${result.stdout}`;
    if (result.code !== 0) {
      if (/not logged|authentication|chatgpt backend auth|login/i.test(output)) {
        const error = new Error('Codex is not signed in. Open Settings and choose Sign in with ChatGPT.');
        (error as Error & { status?: number }).status = 401;
        throw error;
      }
      throw new Error(`Codex CLI failed${result.stderr.trim() ? `: ${result.stderr.trim().slice(-360)}` : '.'}`);
    }
    const text = (await readFile(outputPath, 'utf8').catch(() => result.stdout)).trim();
    if (!text) throw new Error('Codex returned an empty response.');
    return { text };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

/* ───────────────────────── LLM provider bridge ───────────────────────── */

/**
 * Provider APIs are deliberately called from the local Vite server rather than
 * from the browser. OpenLux, OpenRouter, and Gemini do not all expose a stable
 * CORS policy, so a direct browser request can collapse into the unhelpful
 * `TypeError: Failed to fetch` before the provider ever sees the key. The
 * bridge keeps the key on the loopback hop and forwards the provider response
 * unchanged, including its status and useful error body.
 */
type LlmProvider = 'openrouter' | 'openlux' | 'google';

const LLM_LABELS: Record<LlmProvider, string> = {
  openrouter: 'OpenRouter',
  openlux: 'OpenLux',
  google: 'Google AI Studio',
};

const LLM_ENDPOINTS: Record<LlmProvider, string> = {
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  openlux: 'https://api.openlux.ai/v1/chat/completions',
  google: 'https://generativelanguage.googleapis.com/v1beta/models',
};

const isJsonRecord = (value: unknown): value is JsonRecord =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const proxyUpstreamResponse = async (response: ServerResponse, upstream: Response) => {
  const body = await upstream.text();
  response.statusCode = upstream.status;
  response.setHeader(
    'Content-Type',
    upstream.headers.get('content-type') ?? 'application/json; charset=utf-8',
  );
  response.setHeader('Cache-Control', 'no-store');
  response.end(body);
};

const requestLlmProvider = async (provider: LlmProvider, payload: JsonRecord) => {
  const label = LLM_LABELS[provider];
  const apiKey = typeof payload.apiKey === 'string' ? payload.apiKey.trim() : '';
  if (!apiKey) {
    const error = new Error(`No ${label} key was sent. Add your key in Settings and try again.`) as Error & {
      status?: number;
    };
    error.status = 400;
    throw error;
  }
  if (!isJsonRecord(payload.requestBody)) {
    const error = new Error(`The ${label} request body was missing or invalid.`) as Error & {
      status?: number;
    };
    error.status = 400;
    throw error;
  }

  const headers: Record<string, string> = {'Content-Type': 'application/json'};
  if (provider === 'google') headers['x-goog-api-key'] = apiKey;
  else {
    headers.Authorization = `Bearer ${apiKey}`;
    if (provider === 'openrouter') headers['X-Title'] = 'Motion Studio';
  }

  const endpoint =
    provider === 'google'
      ? `${LLM_ENDPOINTS.google}/${encodeURIComponent(String(payload.model ?? ''))}:generateContent`
      : LLM_ENDPOINTS[provider];
  if (provider === 'google' && !payload.model) {
    const error = new Error('The Google AI Studio model id was missing.') as Error & {status?: number};
    error.status = 400;
    throw error;
  }

  try {
    return await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload.requestBody),
    });
  } catch (cause) {
    const reason = cause instanceof Error && cause.message ? ` (${cause.message})` : '';
    const error = new Error(
      `${label} could not be reached from the local bridge. Check the internet connection, VPN/firewall, and provider availability${reason}.`,
    ) as Error & {status?: number};
    error.status = 502;
    throw error;
  }
};

const requestOpenRouterCatalog = async () => {
  try {
    return await fetch('https://openrouter.ai/api/v1/models');
  } catch (cause) {
    const reason = cause instanceof Error && cause.message ? ` (${cause.message})` : '';
    const error = new Error(
      `OpenRouter's model catalog could not be reached from the local bridge. Check the internet connection, VPN/firewall, and provider availability${reason}.`,
    ) as Error & {status?: number};
    error.status = 502;
    throw error;
  }
};

const requestOpenLuxCatalog = async (payload: JsonRecord) => {
  const apiKey = typeof payload.apiKey === 'string' ? payload.apiKey.trim() : '';
  if (!apiKey) {
    const error = new Error('No OpenLux key was sent. Add your key in Settings and try again.') as Error & {
      status?: number;
    };
    error.status = 400;
    throw error;
  }
  try {
    return await fetch('https://api.openlux.ai/v1/models', {
      headers: {Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json'},
    });
  } catch (cause) {
    const reason = cause instanceof Error && cause.message ? ` (${cause.message})` : '';
    const error = new Error(
      `OpenLux's model catalog could not be reached from the local bridge. Check the internet connection, VPN/firewall, and provider availability${reason}.`,
    ) as Error & {status?: number};
    error.status = 502;
    throw error;
  }
};

const installLlmBridge = (middlewares: MiddlewareServer) => {
  middlewares.use(async (request, response, next) => {
    const pathname = (request.url ?? '').split('?')[0];
    if (!pathname.startsWith('/api/llm/')) {
      next();
      return;
    }
    if (!isLocalRequest(request)) {
      sendJson(response, 403, {detail: 'The LLM bridge only accepts loopback requests.'});
      return;
    }
    try {
      if (pathname === '/api/llm/catalog/openrouter' && request.method === 'GET') {
        await proxyUpstreamResponse(response, await requestOpenRouterCatalog());
        return;
      }
      if (pathname === '/api/llm/catalog/openlux' && request.method === 'POST') {
        await proxyUpstreamResponse(response, await requestOpenLuxCatalog(await readBody(request)));
        return;
      }

      const provider =
        pathname === '/api/llm/openrouter'
          ? ('openrouter' as const)
          : pathname === '/api/llm/openlux'
            ? ('openlux' as const)
            : pathname === '/api/llm/google'
              ? ('google' as const)
              : null;
      if (provider && request.method === 'POST') {
        const payload = await readBody(request);
        await proxyUpstreamResponse(response, await requestLlmProvider(provider, payload));
        return;
      }
      sendJson(response, 404, {detail: 'Unknown LLM bridge route.'});
    } catch (error) {
      const status =
        error && typeof error === 'object' && 'status' in error && typeof error.status === 'number'
          ? error.status
          : 502;
      sendJson(response, status, {
        detail: error instanceof Error ? error.message : 'The LLM provider bridge failed.',
      });
    }
  });
};

/* ───────────────────────── Cartesia text-to-speech ───────────────────────── */

/**
 * Cartesia's SSE endpoint emits raw PCM audio and word timestamps from one
 * generation. Keeping those two artifacts together is the timing contract:
 * scene reveals are scheduled against the exact voice performance that plays.
 * Files live under public/voice so Remotion can address them with staticFile().
 */
const VOICE_DIR = path.resolve(__dirname, 'public', 'voice');
const MAX_SPEECH_CHARS = 8000;
const CARTESIA_MODEL = 'sonic-3.6';
const CARTESIA_API_VERSION = '2026-08-14';
const CARTESIA_TTS_ENDPOINT = 'https://api.cartesia.ai/tts/sse';
const CARTESIA_DEFAULT_VOICE_ID = '630ed21c-2c5c-41cf-9d82-10a7fd668370';
const LEGACY_CARTESIA_VOICE_ID = '5ee9feff-1265-424a-9d7f-8e4d431a12c7';
const CARTESIA_SAMPLE_RATE = 44100;
const CARTESIA_SPEECH_CONCURRENCY = 2;

const hashVoiceRequest = async (parts: string[]) => {
  const { createHash } = await import('node:crypto');
  return createHash('sha1').update(parts.join('\u0000')).digest('hex').slice(0, 20);
};

/** Seconds of audio, read back from the encoded file rather than estimated. */
const probeDuration = async (file: string) => {
  const probe = await runProcess(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file],
    '',
    15_000,
  );
  const seconds = Number(probe.stdout.trim());
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
};

/** Add a standard WAV header without re-encoding the timestamped PCM. */
const pcmS16leToWav = (pcm: Buffer, sampleRate: number) => {
  const channels = 1;
  const bytesPerSample = 2;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  header.writeUInt16LE(channels * bytesPerSample, 32);
  header.writeUInt16LE(bytesPerSample * 8, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
};

const listSpeechVoices = async () => ({
  engine: `cartesia-${CARTESIA_MODEL}`,
  voices: [{ id: CARTESIA_DEFAULT_VOICE_ID, label: 'Cartesia voice', locale: 'English' }],
});

const speechInFlight = new Map<string, Promise<JsonRecord>>();

const waitFor = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/** Run provider work in a small ordered pool instead of bursting every part. */
const mapWithConcurrency = async <T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
) => {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const worker = async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= values.length) return;
      // eslint-disable-next-line no-await-in-loop
      results[index] = await mapper(values[index], index);
    }
  };
  const workers = Math.min(Math.max(1, concurrency), values.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
};

class SpeechProviderError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'SpeechProviderError';
    this.status = status;
  }
}

type AlignedWord = { word: string; start: number; end: number; confidence?: number };

const cleanAlignedWords = (value: unknown): AlignedWord[] =>
  Array.isArray(value)
    ? value
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const word = typeof (entry as JsonRecord).word === 'string'
          ? String((entry as JsonRecord).word).trim()
          : '';
        const start = Number((entry as JsonRecord).start);
        const end = Number((entry as JsonRecord).end);
        if (!word || !Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
        return { word, start: Math.max(0, start), end: Math.max(0, end) };
      })
      .filter((word): word is AlignedWord => Boolean(word))
    : [];

const wordsFromTimestampEvent = (event: JsonRecord): AlignedWord[] => {
  const timestamps = event.word_timestamps;
  if (!timestamps || typeof timestamps !== 'object') return [];
  const record = timestamps as JsonRecord;
  const words = Array.isArray(record.words) ? record.words : [];
  const starts = Array.isArray(record.start) ? record.start : [];
  const ends = Array.isArray(record.end) ? record.end : [];
  return cleanAlignedWords(
    words.map((word, index) => ({ word, start: starts[index], end: ends[index] })),
  );
};

const parseCartesiaStream = (raw: string) => {
  const audio: Buffer[] = [];
  const words: AlignedWord[] = [];
  let generationId: string | undefined;
  let providerError = '';
  for (const frame of raw.split(/\r?\n\r?\n/)) {
    const data = frame
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('\n');
    if (!data || data === '[DONE]') continue;
    let event: JsonRecord;
    try {
      event = JSON.parse(data) as JsonRecord;
    } catch {
      continue;
    }
    if (typeof event.context_id === 'string') generationId = event.context_id;
    if (event.type === 'chunk' && typeof event.data === 'string') {
      audio.push(Buffer.from(event.data, 'base64'));
    } else if (event.type === 'timestamps') {
      words.push(...wordsFromTimestampEvent(event));
    } else if (event.type === 'error') {
      providerError = String(event.error ?? event.message ?? 'Cartesia reported a stream error.');
    }
  }
  if (providerError) throw new Error(providerError);
  return { audio: Buffer.concat(audio), words, generationId };
};

const requestCartesiaSpeech = async (
  cartesiaApiKey: string,
  text: string,
  voice: string,
  rate: number,
) => {
  let lastDetail = '';
  let lastStatus = 502;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    const response = await fetch(CARTESIA_TTS_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cartesiaApiKey}`,
        'Cartesia-Version': CARTESIA_API_VERSION,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model_id: CARTESIA_MODEL,
        transcript: text,
        voice,
        output_format: {
          container: 'raw',
          encoding: 'pcm_s16le',
          sample_rate: CARTESIA_SAMPLE_RATE,
        },
        language: 'en',
        normalization: 'auto',
        add_timestamps: true,
        use_normalized_timestamps: true,
        generation_config: {
          volume: 1,
          speed: Math.max(0.6, Math.min(1.5, rate / 175)),
        },
      }),
    });
    if (response.ok) {
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('text/event-stream')) {
        throw new Error(`Cartesia returned ${contentType || 'an unknown format'} instead of an event stream.`);
      }
      // eslint-disable-next-line no-await-in-loop
      const result = parseCartesiaStream(await response.text());
      if (!result.audio.length) throw new Error('Cartesia returned empty audio.');
      if (!result.words.length) throw new Error('Cartesia returned no word timestamps.');
      return result;
    }
    // eslint-disable-next-line no-await-in-loop
    const rawDetail = await response.text();
    lastStatus = response.status;
    let parsedDetail = '';
    try {
      const payload = JSON.parse(rawDetail) as JsonRecord;
      const nested = payload.error;
      parsedDetail = typeof nested === 'string'
        ? nested
        : nested && typeof nested === 'object'
          ? String((nested as JsonRecord).message ?? '')
          : String(payload.message ?? '');
    } catch {
      // Some gateway errors are plain text rather than JSON.
    }
    lastDetail = (parsedDetail || rawDetail).slice(0, 320);
    if (![429, 500, 502, 503, 529].includes(response.status) || attempt === 2) {
      throw new SpeechProviderError(
        response.status,
        `Cartesia TTS returned ${response.status}. ${lastDetail}`.trim(),
      );
    }
    const retryAfter = Number(response.headers.get('retry-after'));
    const delay = Number.isFinite(retryAfter) && retryAfter >= 0
      ? Math.min(10_000, retryAfter * 1000)
      : Math.min(8_000, 700 * 2 ** attempt);
    // eslint-disable-next-line no-await-in-loop
    await waitFor(delay);
  }
  throw new SpeechProviderError(lastStatus, `Cartesia TTS failed. ${lastDetail}`.trim());
};

/** One part of the voiceover, cached by its exact inputs. */
const synthesizeOne = async ({
  text,
  voice,
  rate,
  cartesiaApiKey,
}: {
  text: string;
  voice: string;
  rate: number;
  cartesiaApiKey: string;
}): Promise<JsonRecord> => {
  const engine = `cartesia-${CARTESIA_MODEL}`;
  const key = await hashVoiceRequest([engine, voice, String(rate), text]);
  const name = `${key}.wav`;
  const outputPath = path.join(VOICE_DIR, name);
  const alignmentPath = path.join(VOICE_DIR, `${key}.words.json`);
  await mkdir(VOICE_DIR, { recursive: true });

  // Same text and settings produce the same file, so re-voicing a cut whose
  // narration has not changed costs nothing.
  const [hasAudio, cachedWords] = await Promise.all([
    access(outputPath, fsConstants.R_OK).then(() => true, () => false),
    readFile(alignmentPath, 'utf8')
      .then((raw) => cleanAlignedWords(JSON.parse(raw).words))
      .catch(() => [] as AlignedWord[]),
  ]);
  const cached = hasAudio && cachedWords.length > 0;
  if (!cached) {
    const active = speechInFlight.get(key);
    if (active) return active;

    const task = (async (): Promise<JsonRecord> => {
      const { audio, words, generationId } = await requestCartesiaSpeech(
        cartesiaApiKey,
        text,
        voice,
        rate,
      );
      const temporaryPath = path.join(
        VOICE_DIR,
        `.${key}-${process.pid}-${Math.random().toString(36).slice(2)}.wav`,
      );
      const temporaryAlignmentPath = `${temporaryPath}.words.json`;
      try {
        await writeFile(temporaryPath, pcmS16leToWav(audio, CARTESIA_SAMPLE_RATE));
        await writeFile(temporaryAlignmentPath, JSON.stringify({ words }), 'utf8');
        await rename(temporaryPath, outputPath);
        await rename(temporaryAlignmentPath, alignmentPath);
      } finally {
        await rm(temporaryPath, { force: true });
        await rm(temporaryAlignmentPath, { force: true });
      }
      const durationSeconds = await probeDuration(outputPath);
      if (!durationSeconds) throw new Error('The generated audio had no readable duration.');
      return {
        file: `voice/${name}`,
        durationSeconds,
        engine,
        voice,
        sourceText: text,
        rate,
        cached: false,
        generationId,
        words,
      };
    })();
    speechInFlight.set(key, task);
    try {
      return await task;
    } finally {
      speechInFlight.delete(key);
    }
  }

  const durationSeconds = await probeDuration(outputPath);
  if (!durationSeconds) throw new Error('The generated audio had no readable duration.');
  return { file: `voice/${name}`, durationSeconds, engine, voice, sourceText: text, rate, cached, words: cachedWords };
};

const synthesizeSpeech = async (payload: JsonRecord) => {
  const text = typeof payload.text === 'string' ? payload.text.trim() : '';
  if (!text) throw new Error('No text was supplied to speak.');
  if (text.length > MAX_SPEECH_CHARS) {
    throw new Error(`That passage is ${text.length} characters; the limit is ${MAX_SPEECH_CHARS}.`);
  }
  const cartesiaApiKey = typeof payload.cartesiaApiKey === 'string'
    ? payload.cartesiaApiKey.trim()
    : '';
  if (!cartesiaApiKey) throw new Error('Add a Cartesia API key in Model settings.');
  const requestedVoice = typeof payload.voice === 'string' ? payload.voice : '';
  const voice = requestedVoice && !requestedVoice.startsWith('flux-') && requestedVoice !== LEGACY_CARTESIA_VOICE_ID
    ? requestedVoice
    : CARTESIA_DEFAULT_VOICE_ID;
  const rate = Number.isFinite(Number(payload.rate)) ? Math.round(Number(payload.rate)) : 228;

  return synthesizeOne({ text, voice, rate, cartesiaApiKey });
};

/**
 * The whole-cut voiceover: every shot's narration synthesized once each and
 * concatenated into ONE continuous file, with the requested tail of silence
 * between parts. The cut plays this single track, and each shot's length
 * comes from its part of the file — nothing is cut in pieces for segments.
 */
const synthesizeVoiceover = async (payload: JsonRecord) => {
  const cartesiaApiKey = typeof payload.cartesiaApiKey === 'string'
    ? payload.cartesiaApiKey.trim()
    : '';
  if (!cartesiaApiKey) throw new Error('Add a Cartesia API key in Model settings.');
  const requestedVoice = typeof payload.voice === 'string' ? payload.voice : '';
  const voice = requestedVoice && !requestedVoice.startsWith('flux-') && requestedVoice !== LEGACY_CARTESIA_VOICE_ID
    ? requestedVoice
    : CARTESIA_DEFAULT_VOICE_ID;
  const rate = Number.isFinite(Number(payload.rate)) ? Math.round(Number(payload.rate)) : 228;
  const tailSeconds = Math.max(0, Math.min(2, Number(payload.tailSeconds) || 0.2));

  const rawParts = Array.isArray(payload.parts) ? payload.parts : [];
  const texts: string[] = [];
  for (const part of rawParts) {
    const text = part && typeof part.text === 'string' ? part.text.trim() : '';
    if (!text) throw new Error('One narration part is empty.');
    if (text.length > MAX_SPEECH_CHARS) {
      throw new Error(`One narration part is ${text.length} characters; the limit is ${MAX_SPEECH_CHARS}.`);
    }
    texts.push(text);
  }
  if (!texts.length) throw new Error('No narration parts were supplied.');

  const joinKey = await hashVoiceRequest([
    `voiceover-${CARTESIA_MODEL}`,
    voice,
    String(rate),
    String(tailSeconds),
    ...texts,
  ]);
  const joinedName = `${joinKey}.wav`;
  const joinedPath = path.join(VOICE_DIR, joinedName);
  const joinedExists = await access(joinedPath, fsConstants.R_OK).then(() => true, () => false);
  const partArtifactsReady = await Promise.all(
    texts.map(async (text) => {
      const key = await hashVoiceRequest([`cartesia-${CARTESIA_MODEL}`, voice, String(rate), text]);
      const [hasAudio, hasWords] = await Promise.all([
        access(path.join(VOICE_DIR, `${key}.wav`)).then(() => true, () => false),
        readFile(path.join(VOICE_DIR, `${key}.words.json`), 'utf8')
          .then((raw) => cleanAlignedWords(JSON.parse(raw).words).length > 0)
          .catch(() => false),
      ]);
      return hasAudio && hasWords;
    }),
  );
  const cached = joinedExists && partArtifactsReady.every(Boolean);

  if (!cached) {
    const synthesized = await mapWithConcurrency(
      texts,
      CARTESIA_SPEECH_CONCURRENCY,
      (text) => synthesizeOne({ text, voice, rate, cartesiaApiKey }),
    );

    const temporaryPath = path.join(
      VOICE_DIR,
      `.${joinKey}-${process.pid}-${Math.random().toString(36).slice(2)}.wav`,
    );
    try {
      const args = ['-v', 'error', '-y'];
      const concatInputs: string[] = [];
      for (let index = 0; index < synthesized.length; index += 1) {
        const partFile = path.join(VOICE_DIR, String(synthesized[index].file).replace('voice/', ''));
        args.push('-i', partFile);
        concatInputs.push(`[${index}:a]`);
        if (index < synthesized.length - 1 && tailSeconds > 0) {
          // Cartesia's pcm_s16le stream is wrapped as mono WAV; keep the
          // inserted tail mono too so ffmpeg's concat filter sees one layout.
          args.push(
            '-f',
            'lavfi',
            '-i',
            `anullsrc=r=${CARTESIA_SAMPLE_RATE}:cl=mono:d=${tailSeconds}`,
          );
          concatInputs.push(`[${synthesized.length + index}:a]`);
        }
      }
      args.push('-filter_complex', `${concatInputs.join('')}concat=n=${concatInputs.length}:v=0:a=1[out]`);
      args.push('-map', '[out]', '-c:a', 'pcm_s16le', temporaryPath);
      const encode = await runProcess('ffmpeg', args, '', 180_000);
      if (encode.code !== 0) {
        throw new Error(`The voiceover join failed: ${encode.stderr.trim().slice(-200)}`);
      }
      await rename(temporaryPath, joinedPath);
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }

  const durationSeconds = await probeDuration(joinedPath);
  if (!durationSeconds) throw new Error('The joined voiceover had no readable duration.');
  // Re-probe each part so the timeline matches the file exactly, and read the
  // cached per-part word timings (relative to each part) so scene generation
  // still gets measured cues.
  const partDurations: number[] = [];
  const partWords: SpokenWord[][] = [];
  for (let index = 0; index < texts.length; index += 1) {
    const text = texts[index];
    const key = await hashVoiceRequest([`cartesia-${CARTESIA_MODEL}`, voice, String(rate), text]);
    const partDuration = await probeDuration(path.join(VOICE_DIR, `${key}.wav`));
    // The join inserts silence only between parts; do not extend the final
    // shot past the end of the actual track with a phantom trailing tail.
    partDurations.push((partDuration ?? 0) + (index < texts.length - 1 ? tailSeconds : 0));
    const words = await readFile(path.join(VOICE_DIR, `${key}.words.json`), 'utf8')
      .then((raw) => cleanAlignedWords(JSON.parse(raw).words))
      .catch(() => [] as SpokenWord[]);
    partWords.push(words);
  }
  if (
    partDurations.length !== texts.length ||
    partWords.length !== texts.length ||
    partDurations.some((duration) => !Number.isFinite(duration) || duration <= 0) ||
    partWords.some((words) => !words.length)
  ) {
    throw new Error(
      'The cached voiceover is missing per-part word timings. Retry voiceover to rebuild its alignment.',
    );
  }
  return {
    file: `voice/${joinedName}`,
    durationSeconds,
    partDurations,
    partWords,
    engine: `cartesia-${CARTESIA_MODEL}`,
    voice,
    rate,
    cached,
  };
};

const installVoiceBridge = (middlewares: MiddlewareServer) => {
  middlewares.use(async (request, response, next) => {
    const pathname = (request.url ?? '').split('?')[0];
    if (!pathname.startsWith('/api/tts/')) {
      next();
      return;
    }
    if (!isLocalRequest(request)) {
      sendJson(response, 403, { detail: 'The speech bridge only accepts loopback requests.' });
      return;
    }
    try {
      if (pathname === '/api/tts/voices' && request.method === 'GET') {
        sendJson(response, 200, await listSpeechVoices());
        return;
      }
      if (pathname === '/api/tts/speak' && request.method === 'POST') {
        sendJson(response, 200, await synthesizeSpeech(await readBody(request)));
        return;
      }
      if (pathname === '/api/tts/voiceover' && request.method === 'POST') {
        sendJson(response, 200, await synthesizeVoiceover(await readBody(request)));
        return;
      }
      sendJson(response, 404, { detail: 'Unknown speech bridge route.' });
    } catch (error) {
      sendJson(response, error instanceof SpeechProviderError ? error.status : 500, {
        detail: error instanceof Error ? error.message : 'Speech synthesis failed.',
      });
    }
  });
};

const voiceBridgePlugin = (): Plugin => ({
  name: 'motion-studio-cartesia-tts-bridge',
  configureServer(server) {
    installVoiceBridge(server.middlewares);
  },
  configurePreviewServer(server) {
    installVoiceBridge(server.middlewares);
  },
});

const llmBridgePlugin = (): Plugin => ({
  name: 'motion-studio-llm-provider-bridge',
  configureServer(server) {
    installLlmBridge(server.middlewares);
  },
  configurePreviewServer(server) {
    installLlmBridge(server.middlewares);
  },
});

type MiddlewareServer = {
  use: (handler: (request: IncomingMessage, response: ServerResponse, next: () => void) => void) => void;
};

const installCodexBridge = (middlewares: MiddlewareServer) => {
  middlewares.use(async (request, response, next) => {
    const pathname = (request.url ?? '').split('?')[0];
    if (!pathname.startsWith('/api/codex/')) {
      next();
      return;
    }
    if (!isLocalRequest(request)) {
      sendJson(response, 403, { detail: 'The Codex bridge only accepts loopback requests.' });
      return;
    }
    try {
      if (pathname === '/api/codex/status' && request.method === 'GET') {
        sendJson(response, 200, await codexStatus());
        return;
      }
      if (pathname === '/api/codex/login' && request.method === 'POST') {
        await startCodexLoginProcess();
        sendJson(response, 202, { detail: 'Codex sign-in opened.' });
        return;
      }
      if (pathname === '/api/codex/completions' && request.method === 'POST') {
        const result = await runCodexCompletion(await readBody(request));
        sendJson(response, 200, result);
        return;
      }
      sendJson(response, 404, { detail: 'Unknown Codex bridge route.' });
    } catch (error) {
      const status =
        error && typeof error === 'object' && 'status' in error && error.status === 401 ? 401 : 500;
      sendJson(response, status, {
        detail: error instanceof Error ? error.message : 'The Codex bridge failed.',
      });
    }
  });
};

const codexBridgePlugin = (): Plugin => ({
  name: 'motion-studio-codex-oauth-bridge',
  configureServer(server) {
    installCodexBridge(server.middlewares);
  },
  configurePreviewServer(server) {
    installCodexBridge(server.middlewares);
  },
});

/* ────────────────────────── Serper image search ─────────────────────────── */

/**
 * Real photographs, fetched and stored locally.
 *
 * Three routes, and the split is deliberate. `search` keeps the serper.dev key
 * out of the browser and off any URL. `fetch` returns candidate bytes as data
 * URLs because the picker composites 48 of them onto one canvas, and a canvas
 * that has drawn a cross-origin image cannot be read back — `toDataURL` throws
 * on a tainted canvas, so the contact sheet could never be built from remote
 * <img> tags. `save` writes the chosen photo under public/images so the scene
 * addresses it with staticFile(): a render must not depend on a stranger's
 * server still serving a hotlinked file, and many of them refuse the render
 * browser's request anyway.
 */
const IMAGE_DIR = path.resolve(__dirname, 'public', 'images');
const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
const IMAGE_FETCH_TIMEOUT_MS = 12_000;
/** A browser UA: a plain fetch is refused outright by a good number of hosts. */
const IMAGE_FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  Accept: 'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8',
};

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

const httpError = (message: string, status: number) => {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
};

const fetchImageBytes = async (url: string) => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw httpError('That image URL is not a URL.', 400);
  }
  if (parsed.protocol !== 'https:') throw httpError('Only https image URLs are fetched.', 400);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
  try {
    const upstream = await fetch(parsed.toString(), {
      headers: IMAGE_FETCH_HEADERS,
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!upstream.ok) throw httpError(`The image host returned ${upstream.status}.`, 502);
    const type = (upstream.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!type.startsWith('image/')) throw httpError(`That URL served ${type || 'no image'}.`, 415);
    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (!buffer.length) throw httpError('The image host served an empty file.', 502);
    if (buffer.length > MAX_PHOTO_BYTES) throw httpError('That image is too large.', 413);
    return { buffer, type };
  } finally {
    clearTimeout(timer);
  }
};

const searchSerperImages = async (payload: JsonRecord) => {
  const apiKey = typeof payload.apiKey === 'string' ? payload.apiKey.trim() : '';
  const query = typeof payload.query === 'string' ? payload.query.trim() : '';
  const count = Math.max(1, Math.min(100, Number(payload.count) || 48));
  if (!apiKey) throw httpError('No serper.dev key was sent. Add your key in Settings.', 400);
  if (!query) throw httpError('No image search query was sent.', 400);
  let upstream: Response;
  try {
    upstream = await fetch('https://google.serper.dev/images', {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, num: count }),
    });
  } catch (cause) {
    const reason = cause instanceof Error && cause.message ? ` (${cause.message})` : '';
    throw httpError(`serper.dev could not be reached from the local bridge${reason}.`, 502);
  }
  if (!upstream.ok) {
    const detail = (await upstream.text()).slice(0, 200);
    throw httpError(`serper.dev returned ${upstream.status}: ${detail}`, upstream.status);
  }
  const data = (await upstream.json()) as {
    images?: Array<{
      title?: string;
      imageUrl?: string;
      imageWidth?: number;
      imageHeight?: number;
      source?: string;
      link?: string;
    }>;
  };
  const images = (data.images ?? []).flatMap((item) => {
    const imageUrl = typeof item.imageUrl === 'string' ? item.imageUrl.trim() : '';
    if (!imageUrl.startsWith('https://')) return [];
    return [
      {
        imageUrl,
        title: (item.title ?? '').trim().slice(0, 160),
        source: (item.source ?? '').trim().slice(0, 80),
        pageUrl: typeof item.link === 'string' ? item.link : '',
        width: Number(item.imageWidth) || 0,
        height: Number(item.imageHeight) || 0,
      },
    ];
  });
  return { query, images };
};

/** Candidate bytes for the contact sheet. Failures are skipped, never fatal. */
const fetchImageCandidates = async (payload: JsonRecord) => {
  const urls = Array.isArray(payload.urls)
    ? payload.urls.filter((url): url is string => typeof url === 'string').slice(0, 60)
    : [];
  if (!urls.length) throw httpError('No image URLs were sent.', 400);
  const results = await Promise.all(
    urls.map(async (url) => {
      try {
        const { buffer, type } = await fetchImageBytes(url);
        return { url, dataUrl: `data:${type};base64,${buffer.toString('base64')}` };
      } catch {
        return { url, dataUrl: '' };
      }
    }),
  );
  return { images: results };
};

/** The chosen photo, written into public/images for staticFile(). */
const saveImageFile = async (payload: JsonRecord) => {
  const url = typeof payload.url === 'string' ? payload.url.trim() : '';
  if (!url) throw httpError('No image URL was sent to save.', 400);
  const { buffer, type } = await fetchImageBytes(url);
  const extension = IMAGE_EXTENSIONS[type] ?? 'jpg';
  const { createHash } = await import('node:crypto');
  const digest = createHash('sha1').update(url).digest('hex').slice(0, 16);
  const name = `${digest}.${extension}`;
  await mkdir(IMAGE_DIR, { recursive: true });
  await writeFile(path.join(IMAGE_DIR, name), buffer);
  return { file: `images/${name}`, bytes: buffer.length, contentType: type };
};

const installImageBridge = (middlewares: MiddlewareServer) => {
  middlewares.use(async (request, response, next) => {
    const pathname = (request.url ?? '').split('?')[0];
    if (!pathname.startsWith('/api/images/')) {
      next();
      return;
    }
    if (!isLocalRequest(request)) {
      sendJson(response, 403, { detail: 'The image bridge only accepts loopback requests.' });
      return;
    }
    try {
      if (request.method === 'POST' && pathname === '/api/images/search') {
        sendJson(response, 200, await searchSerperImages(await readBody(request)));
        return;
      }
      if (request.method === 'POST' && pathname === '/api/images/candidates') {
        sendJson(response, 200, await fetchImageCandidates(await readBody(request)));
        return;
      }
      if (request.method === 'POST' && pathname === '/api/images/save') {
        sendJson(response, 200, await saveImageFile(await readBody(request)));
        return;
      }
      sendJson(response, 404, { detail: 'Unknown image bridge route.' });
    } catch (error) {
      const status =
        error && typeof error === 'object' && 'status' in error && typeof error.status === 'number'
          ? error.status
          : 502;
      sendJson(response, status, {
        detail: error instanceof Error ? error.message : 'The image bridge failed.',
      });
    }
  });
};

const imageBridgePlugin = (): Plugin => ({
  name: 'motion-studio-image-bridge',
  configureServer(server) {
    installImageBridge(server.middlewares);
  },
  configurePreviewServer(server) {
    installImageBridge(server.middlewares);
  },
});

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    codexBridgePlugin(),
    voiceBridgePlugin(),
    llmBridgePlugin(),
    imageBridgePlugin(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: true,
  },
});

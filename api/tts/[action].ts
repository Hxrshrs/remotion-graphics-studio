import type {ApiRequest, ApiResponse, JsonRecord} from '../../server/http.js';
import {errorStatus, httpError, readJsonBody, routeParam, sendJson, sendStreamingJson} from '../../server/http.js';

export const maxDuration = 300;

const MODEL = 'sonic-3.6';
const API_VERSION = '2026-08-14';
const ENDPOINT = 'https://api.cartesia.ai/tts/sse';
const DEFAULT_VOICE_ID = '630ed21c-2c5c-41cf-9d82-10a7fd668370';
const LEGACY_VOICE_ID = '5ee9feff-1265-424a-9d7f-8e4d431a12c7';
const SAMPLE_RATE = 44100;
const MAX_SPEECH_CHARS = 8000;
const MAX_PCM_BYTES = 12 * 1024 * 1024;

type AlignedWord = {word: string; start: number; end: number; confidence?: number};

const cleanWords = (value: unknown): AlignedWord[] =>
  Array.isArray(value)
    ? value.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return [];
        const record = entry as JsonRecord;
        const word = typeof record.word === 'string' ? record.word.trim() : '';
        const start = Number(record.start);
        const end = Number(record.end);
        return word && Number.isFinite(start) && Number.isFinite(end) && end >= start
          ? [{word, start: Math.max(0, start), end: Math.max(0, end)}]
          : [];
      })
    : [];

const wordsFromEvent = (event: JsonRecord) => {
  if (!event.word_timestamps || typeof event.word_timestamps !== 'object') return [];
  const timestamps = event.word_timestamps as JsonRecord;
  const words = Array.isArray(timestamps.words) ? timestamps.words : [];
  const starts = Array.isArray(timestamps.start) ? timestamps.start : [];
  const ends = Array.isArray(timestamps.end) ? timestamps.end : [];
  return cleanWords(words.map((word, index) => ({word, start: starts[index], end: ends[index]})));
};

const parseStream = (raw: string) => {
  const audio: Buffer[] = [];
  const words: AlignedWord[] = [];
  let generationId: string | undefined;
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
      words.push(...wordsFromEvent(event));
    } else if (event.type === 'error') {
      throw httpError(String(event.error ?? event.message ?? 'Cartesia returned an error.'), 502);
    }
  }
  const pcm = Buffer.concat(audio);
  if (!pcm.length) throw httpError('Cartesia returned empty audio.', 502);
  if (!words.length) throw httpError('Cartesia returned no word timestamps.', 502);
  return {pcm, words, generationId};
};

const wavFromPcm = (pcm: Buffer) => {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
};

const dataUrl = (pcm: Buffer) => `data:audio/wav;base64,${wavFromPcm(pcm).toString('base64')}`;
const durationOf = (pcm: Buffer) => pcm.length / 2 / SAMPLE_RATE;

const assertExportLength = (pcm: Buffer) => {
  if (pcm.length > MAX_PCM_BYTES) {
    throw httpError('The voiceover exceeds the two-minute browser export limit. Shorten the script.', 413);
  }
};

const requestSpeech = async (apiKey: string, text: string, voice: string, rate: number) => {
  let lastStatus = 502;
  let lastDetail = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const upstream = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Cartesia-Version': API_VERSION,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model_id: MODEL,
        transcript: text,
        voice,
        output_format: {container: 'raw', encoding: 'pcm_s16le', sample_rate: SAMPLE_RATE},
        language: 'en',
        normalization: 'auto',
        add_timestamps: true,
        use_normalized_timestamps: true,
        generation_config: {volume: 1, speed: Math.max(0.6, Math.min(1.5, rate / 175))},
      }),
    });
    if (upstream.ok) return parseStream(await upstream.text());
    lastStatus = upstream.status;
    lastDetail = (await upstream.text()).slice(0, 320);
    if (![429, 500, 502, 503, 529].includes(lastStatus) || attempt === 2) break;
    const retryAfter = Number(upstream.headers.get('retry-after'));
    const delay = Number.isFinite(retryAfter)
      ? Math.min(10_000, retryAfter * 1000)
      : Math.min(8_000, 700 * 2 ** attempt);
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
  }
  throw httpError(`Cartesia TTS returned ${lastStatus}. ${lastDetail}`.trim(), lastStatus);
};

const settings = (payload: JsonRecord) => {
  const apiKey = typeof payload.cartesiaApiKey === 'string' ? payload.cartesiaApiKey.trim() : '';
  if (!apiKey) throw httpError('Add a Cartesia API key in Settings.', 400);
  const requestedVoice = typeof payload.voice === 'string' ? payload.voice : '';
  const voice = requestedVoice && !requestedVoice.startsWith('flux-') && requestedVoice !== LEGACY_VOICE_ID
    ? requestedVoice
    : DEFAULT_VOICE_ID;
  const rate = Number.isFinite(Number(payload.rate)) ? Math.round(Number(payload.rate)) : 228;
  return {apiKey, voice, rate};
};

const checkedText = (raw: unknown) => {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) throw httpError('No text was supplied to speak.', 400);
  if (text.length > MAX_SPEECH_CHARS) throw httpError(`The speech limit is ${MAX_SPEECH_CHARS} characters.`, 400);
  return text;
};

export default async function handler(request: ApiRequest, response: ApiResponse) {
  const action = routeParam(request, 'action');
  try {
    if (action === 'voices' && request.method === 'GET') {
      sendStreamingJson(response, 200, {
        engine: `cartesia-${MODEL}`,
        voices: [{id: DEFAULT_VOICE_ID, label: 'Cartesia voice', locale: 'English'}],
      });
      return;
    }
    if (request.method !== 'POST') throw httpError('Use POST for speech requests.', 405);
    const payload = await readJsonBody(request);
    const {apiKey, voice, rate} = settings(payload);

    if (action === 'speak') {
      const text = checkedText(payload.text);
      const result = await requestSpeech(apiKey, text, voice, rate);
      assertExportLength(result.pcm);
      sendJson(response, 200, {
        file: dataUrl(result.pcm),
        durationSeconds: durationOf(result.pcm),
        engine: `cartesia-${MODEL}`,
        voice,
        sourceText: text,
        rate,
        cached: false,
        generationId: result.generationId,
        words: result.words,
      });
      return;
    }

    if (action === 'voiceover') {
      const rawParts = Array.isArray(payload.parts) ? payload.parts : [];
      const texts = rawParts.map((part) =>
        checkedText(part && typeof part === 'object' ? (part as JsonRecord).text : ''),
      );
      if (!texts.length) throw httpError('No narration parts were supplied.', 400);
      const tailSeconds = Math.max(0, Math.min(2, Number(payload.tailSeconds) || 0.2));
      const rendered = new Array<Awaited<ReturnType<typeof requestSpeech>>>(texts.length);
      let cursor = 0;
      const worker = async () => {
        while (cursor < texts.length) {
          const index = cursor++;
          rendered[index] = await requestSpeech(apiKey, texts[index], voice, rate);
        }
      };
      await Promise.all(Array.from({length: Math.min(2, texts.length)}, () => worker()));
      const silence = Buffer.alloc(Math.round(tailSeconds * SAMPLE_RATE) * 2);
      const chunks: Buffer[] = [];
      const partDurations: number[] = [];
      for (let index = 0; index < rendered.length; index += 1) {
        chunks.push(rendered[index].pcm);
        const hasTail = index < rendered.length - 1 && tailSeconds > 0;
        if (hasTail) chunks.push(silence);
        partDurations.push(durationOf(rendered[index].pcm) + (hasTail ? tailSeconds : 0));
      }
      const joined = Buffer.concat(chunks);
      assertExportLength(joined);
      sendStreamingJson(response, 200, {
        file: dataUrl(joined),
        durationSeconds: durationOf(joined),
        partDurations,
        partWords: rendered.map((part) => part.words),
        engine: `cartesia-${MODEL}`,
        voice,
        rate,
        cached: false,
      });
      return;
    }
    throw httpError('Unknown speech route.', 404);
  } catch (error) {
    sendJson(response, errorStatus(error), {
      detail: error instanceof Error ? error.message : 'Speech synthesis failed.',
    });
  }
}

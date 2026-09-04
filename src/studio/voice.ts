/** Cartesia voiceover with native word timing, cached by the local bridge. */

export type SpeechVoice = {
  id: string;
  label: string;
  locale: string;
};

export type SpokenWord = {
  word: string;
  /** Seconds from the first audible sample in the file being played. */
  start: number;
  end: number;
  confidence?: number;
};

export type SpokenLine = {
  /** Path under `public/`, e.g. `voice/ab12….wav`. */
  file: string;
  durationSeconds: number;
  /** Whole-cut parts already include the silence inserted before the next part. */
  durationIncludesTail?: boolean;
  engine: string;
  voice: string;
  /** Inputs that produced this file, used to avoid even making a cache request. */
  sourceText?: string;
  rate?: number;
  cached?: boolean;
  generationId?: string;
  /** Word timing emitted alongside this exact audio generation. */
  words?: SpokenWord[];
};

export type VoiceSettings = {
  enabled: boolean;
  voice: string;
  /** Words per minute passed to the engine. */
  rate: number;
  /**
   * Seconds of silence held after a line before the next shot starts, so a
   * cut does not land on the decay of the last word.
   */
  tailSeconds: number;
};

export const CARTESIA_DEFAULT_VOICE_ID = '630ed21c-2c5c-41cf-9d82-10a7fd668370';
/** Retired default voices, migrated to the current one on load. */
const LEGACY_CARTESIA_VOICE_IDS = [
  '5ee9feff-1265-424a-9d7f-8e4d431a12c7',
  '86e30c1d-714b-4074-a1f2-1cb6b552fb49',
];

export const defaultVoiceSettings = (): VoiceSettings => ({
  enabled: true,
  voice: CARTESIA_DEFAULT_VOICE_ID,
  // 1.3x the base 175 wpm reading pace (increased by 0.1 from 1.2x).
  rate: 228,
  // Short: the boundary envelope already covers the handoff, so a long held
  // silence between lines reads as a dead gap.
  tailSeconds: 0.2,
});

export const withCartesiaVoiceDefaults = (settings?: Partial<VoiceSettings>): VoiceSettings => {
  const merged = { ...defaultVoiceSettings(), ...(settings ?? {}) };
  return {
    ...merged,
    rate: !merged.rate || merged.rate === 210 ? 228 : merged.rate,
    // Preserve custom Cartesia UUIDs while migrating retired default voices.
    voice:
      /^flux-/.test(merged.voice) ||
        LEGACY_CARTESIA_VOICE_IDS.includes(merged.voice) ||
        !merged.voice.trim()
        ? CARTESIA_DEFAULT_VOICE_ID
        : merged.voice.trim(),
  };
};

const request = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  // A provider/network stall must unwind the Confirm pipeline; otherwise the
  // progress rail sits at 0/total forever with no actionable error.
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 180_000);
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('The speech bridge timed out before returning aligned audio. Retry voiceover.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
  const payload = (await response.json().catch(() => ({}))) as T & { detail?: string };
  if (!response.ok) {
    throw new Error(
      payload.detail ??
      (response.status === 404
        ? 'The speech bridge is not running. Start the dev server and try again.'
        : `The speech bridge returned ${response.status}.`),
    );
  }
  return payload;
};

export const listVoices = () =>
  request<{ engine: string; voices: SpeechVoice[] }>('/api/tts/voices');

export const speak = ({
  text,
  voice,
  rate,
  cartesiaApiKey,
}: {
  text: string;
  voice: string;
  rate: number;
  cartesiaApiKey: string;
}) =>
  request<SpokenLine>('/api/tts/speak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice, rate, cartesiaApiKey }),
  });

export type WholeVoiceover = {
  /** Local public/ path or inline audio covering the whole cut. */
  file: string;
  durationSeconds: number;
  /** Seconds each shot's narration (plus tail) occupies in the file. */
  partDurations: number[];
  /** Per-part word timings (relative to each part) for scene generation. */
  partWords: SpokenWord[][];
  engine: string;
  voice: string;
  rate: number;
  cached?: boolean;
};

/**
 * The whole-cut voiceover: every narration part synthesized and joined into
 * ONE continuous audio file (with the tail of silence between parts). Shots
 * are never voiced in pieces — the cut plays this single track and each
 * segment's length comes from its part of the file.
 */
export const speakVoiceover = ({
  parts,
  voice,
  rate,
  tailSeconds,
  cartesiaApiKey,
}: {
  parts: Array<{ text: string; voice: string; rate: number }>;
  voice: string;
  rate: number;
  tailSeconds: number;
  cartesiaApiKey: string;
}) =>
  request<WholeVoiceover>('/api/tts/voiceover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parts, voice, rate, tailSeconds, cartesiaApiKey }),
  });

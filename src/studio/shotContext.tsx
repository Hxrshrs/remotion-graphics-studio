/**
 * How long the shot a scene is running inside lasts.
 *
 * A scene needs its own length to animate out — an exit has to start a fixed
 * distance from the end, and `useVideoConfig()` cannot supply that: inside a
 * <Sequence> it still reports the whole composition's duration, not the
 * sequence's. So the cut publishes each shot's length here and scenes read it
 * through `shotDuration()`.
 *
 * On the studio page there is no cut and no provider, so it falls back to the
 * composition duration, which for a single-scene project is the same thing.
 */
import React from 'react';
import {useRemotionEnvironment, useVideoConfig} from 'remotion';
import {SETTLE_FRAMES, TYPICAL_REVEAL_FRAMES} from './motion';
import {SpokenWord} from './voice';

export const ShotDurationContext = React.createContext<number | null>(null);
export const ShotWordsContext = React.createContext<SpokenWord[]>([]);

export const ShotDurationProvider: React.FC<{
  durationInFrames: number;
  wordTimings?: SpokenWord[];
  children: React.ReactNode;
}> = ({durationInFrames, wordTimings = [], children}) => (
  <ShotDurationContext.Provider value={durationInFrames}>
    <ShotWordsContext.Provider value={wordTimings}>{children}</ShotWordsContext.Provider>
  </ShotDurationContext.Provider>
);

/** Frames this scene has on screen. Safe to call from any scene. */
export const shotDuration = () => {
  const fromCut = React.useContext(ShotDurationContext);
  const {durationInFrames} = useVideoConfig();
  return fromCut ?? durationInFrames;
};

const cueToken = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * How far the heard word trails the composition clock in the live player.
 * A browser starts an audio element a few frames after it is asked to, and
 * the Web Audio output path adds a little more, so a reveal scheduled on the
 * measured word lands visibly before the sound reaches the ear. The rendered
 * file has no such latency — ffmpeg lays the audio exactly on the timeline —
 * so this offset is applied only in the Player.
 */
const VOICE_LATENCY_FRAMES = 8;

const voiceLatencyFrames = () => {
  const env = useRemotionEnvironment();
  return env.isPlayer ? VOICE_LATENCY_FRAMES : 0;
};

/**
 * Resolve a spoken phrase to its measured start frame. Generated scenes use
 * this instead of baking a delay into their source, so changing the voice or
 * reading rate keeps the animation locked without another code rewrite.
 */
export const voiceCue = (phrase: string, occurrence = 0, fallbackFrame = 0) => {
  const words = React.useContext(ShotWordsContext);
  const duration = shotDuration();
  const latency = voiceLatencyFrames();
  /**
   * No reveal may still be moving in the shot's settled tail, so a cue that
   * would land there is pulled back to the last frame that lets an ordinary
   * reveal finish on the line.
   *
   * This is a real trade-off, taken deliberately. A shot is cut to its audio
   * plus a short tail, so a cue on the final phrase naturally falls inside
   * that window; clamping means the last beat leads its word slightly instead
   * of the frame still moving as the shot cuts. A graphic that is already
   * settled when the edit arrives is worth more than perfect lip-sync on the
   * last reveal, and it is the only way the rule holds without the model's
   * cooperation.
   */
  const latest = Math.max(0, duration - SETTLE_FRAMES - TYPICAL_REVEAL_FRAMES);
  const settle = (frame: number) => Math.max(0, Math.min(Math.round(frame), latest));
  const wanted = String(phrase).split(/\s+/).map(cueToken).filter(Boolean);
  if (!wanted.length || !words.length) {
    return settle(Math.round(fallbackFrame) + latency);
  }
  const spoken = words.map((entry) => cueToken(entry.word));
  let seen = 0;
  for (let index = 0; index <= spoken.length - wanted.length; index += 1) {
    if (!wanted.every((token, offset) => spoken[index + offset] === token)) continue;
    if (seen === Math.max(0, Math.round(occurrence))) {
      return settle(Math.round(words[index].start * 60) + latency);
    }
    seen += 1;
  }
  return settle(Math.round(fallbackFrame) + latency);
};

/**
 * Shot-relative frames for a run of spoken phrases, matched in spoken order.
 *
 * `voiceCue` is built for semantic reveals, so it pulls any cue that would
 * land in the shot's settled tail back to `duration - SETTLE_FRAMES -
 * TYPICAL_REVEAL_FRAMES`. That is right for an icon or a chart mark, and
 * wrong for a kinetic line whose words *are* the narration: on a shot cut to
 * its own audio, every cue in the last 1.8s collapses onto the same clamped
 * frame, and the closing words fire together, seconds before they are heard.
 *
 * These cues are therefore clamped only far enough to keep the last entrance
 * inside the shot. Matching walks forward through the spoken words instead of
 * taking an occurrence index, so a phrase repeated in the same shot resolves
 * to the repeat that follows the previous word rather than always the first.
 */
export const useSpokenCues = (phrases: string[], fallbacks: number[] = []) => {
  const words = React.useContext(ShotWordsContext);
  const {fps} = useVideoConfig();
  const latency = voiceLatencyFrames();
  const spoken = words.map((entry) => cueToken(entry.word));
  let cursor = 0;
  return phrases.map((phrase, item) => {
    const fallback = Math.round(fallbacks[item] ?? 0);
    const wanted = String(phrase).split(/\s+/).map(cueToken).filter(Boolean);
    if (!wanted.length || !spoken.length) return fallback;
    for (let index = cursor; index <= spoken.length - wanted.length; index += 1) {
      if (!wanted.every((token, offset) => spoken[index + offset] === token)) continue;
      cursor = index + wanted.length;
      return Math.round(words[index].start * fps) + latency;
    }
    return fallback;
  });
};

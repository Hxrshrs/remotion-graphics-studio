/**
 * A cut is the editor page's document: one transcript, the beats it was split
 * into, and the ordered shots generated against them.
 *
 * Shots are contiguous — the cut is one continuous timeline, so a shot's
 * `startFrame` is always the sum of the durations before it rather than a
 * value anyone edits directly. `resequence` is the single place that holds
 * true, and every mutation of the shot list runs through it.
 */
import {CANVAS} from './prompt';
import type {ShotPhoto} from './photos';
import {Beat} from './transcript';
import {CutStyle} from './editorStyle';
import {SpokenLine, VoiceSettings, defaultVoiceSettings, withCartesiaVoiceDefaults} from './voice';

/**
 * Per shot, because a cut can alternate between graphics that sit over footage
 * and graphics that own the frame. Solid is the default; editor-generated
 * shots use the warm paper ground from the cut style.
 */
export type ShotBackground = {
  mode: 'transparent' | 'solid';
  /** Ignored when the mode is transparent. */
  color: string;
};

export type ShotStatus = 'planned' | 'generating' | 'ready' | 'error';

export type CutShot = {
  id: string;
  /** Beats this shot covers, in order. */
  beatIds: string[];
  /** The narration those beats carry, kept denormalised for the prompt. */
  narration: string;
  /** Inclusive/exclusive indexes in the cleaned source script. */
  scriptWordStart?: number;
  scriptWordEnd?: number;
  /** Absolute source-track window, when this shot is aligned to one track. */
  sourceStartSeconds?: number;
  sourceEndSeconds?: number;
  /** One line saying what the graphic is. The planner writes it; the user edits it. */
  brief: string;
  background: ShotBackground;
  /** JSX source, empty until the shot has been generated. */
  code: string;
  /** Derived by resequence(); never assigned by hand. */
  startFrame: number;
  durationInFrames: number;
  status: ShotStatus;
  error?: string;
  model?: string;
  costUsd?: number;
  /** The narration read aloud, once this shot has been voiced. */
  audio?: SpokenLine;
  /**
   * The real photograph resolved for this shot, if it earned one. Stored on
   * the shot (not recomputed) so a regeneration reuses the same downloaded
   * file, the budget can see what a cut has already spent, and a saved cut
   * still renders after the search key is gone.
   */
  photo?: ShotPhoto;
  /**
   * Set when generation failed and the shot is showing the plain fallback
   * scene instead. The cut still plays; the inspector explains why this one
   * is not what was asked for.
   */
  fallbackReason?: string;
  /**
   * Shots sharing a group render one continuous scene: each is generated
   * after the one before it and continues its composition instead of starting
   * from scratch. Omitted on standalone shots.
   */
  group?: number;
  /** False skips the player's outer transition. Grouped joins use this because
      their generated scene owns a seamless shared-element handoff. */
  transitionBefore?: boolean;
};

export type Cut = {
  id: string;
  name: string;
  /** The pasted source text, kept so the cut can be re-split. */
  transcript: string;
  wpm: number;
  beats: Beat[];
  shots: CutShot[];
  /** Free-text direction applied to every shot in this cut. */
  styleNote: string;
  /** Which house style the cut is built in. */
  style: CutStyle;
  /**
   * 'separate': each shot is its own graphic with AI-chosen transitions.
   * 'continuous': one flowing video — every shot is generated one at a time,
   * building from the scene before it, joining with hard cuts while the AI
   * evolves the composition inside the scenes.
   */
  mode: 'separate' | 'continuous';
  /** One continuous voiceover file covering the whole cut, when voiced as a
      whole rather than per-shot clips. */
  voiceover?: {
    file: string;
    durationSeconds: number;
    partDurations: number[];
    /** Fingerprint of the exact script this track was voiced from, so an
        unchanged script reuses the cached voiceover without a rebuild. */
    scriptKey?: string;
  };
  voice: VoiceSettings;
  createdAt: number;
  updatedAt: number;
};

/** Kept in step with CUT_PALETTE.ground in editorStyle.ts. */
export const DEFAULT_GROUND = '#ebeae6';
/** Kept in step with CUT_PALETTE_DARK.ground in editorStyle.ts. */
export const DEFAULT_GROUND_DARK = '#15151a';
/** Kept in step with CUT_PALETTE_DEV.ground in editorStyle.ts. */
export const DEFAULT_GROUND_DEV = '#000000';
/** Every dev ground this project has shipped. A saved shot holds its own
    background colour, so without these an existing cut keeps the old field
    while the palette around it moves on. */
const LEGACY_DEFAULT_GROUNDS_DEV = ['#0d1117', '#0e0e0e'];
/** Kept in step with CUT_PALETTE_SIGNAL.ground in editorStyle.ts. */
export const DEFAULT_GROUND_SIGNAL = '#060410';
const LEGACY_DEFAULT_GROUND_SIGNAL = '#050911';

export const defaultBackground = (color = DEFAULT_GROUND): ShotBackground => ({
  mode: 'solid',
  color,
});

export const msToFrames = (ms: number) => Math.max(1, Math.round((ms / 1000) * CANVAS.fps));
export const framesToMs = (frames: number) => (frames / CANVAS.fps) * 1000;
export const framesToSeconds = (frames: number) => frames / CANVAS.fps;

/**
 * A shot must hold long enough to be understood. Narration alone can run well
 * under five seconds, and a reveal cascade crammed into that reads as a blur
 * rather than an explanation. Every pipeline that sets a shot's length — the
 * plan, the voiceover retime, and the load migration — floors it at this.
 * Voice-aligned whole-script shots intentionally bypass this floor so their
 * frame windows stay exact; unvoiced and legacy shots are allowed to run
 * longer, but never shorter.
 */
export const MIN_SHOT_FRAMES = Math.max(1, msToFrames(3500));
/** Editorial hard ceiling: every scene must cut by eight seconds. */
export const MAX_SHOT_FRAMES = Math.max(1, msToFrames(8000));

/** Lay shots end to end. The only writer of `startFrame`. */
export const resequence = (shots: CutShot[]): CutShot[] => {
  let cursor = 0;
  return shots.map((shot) => {
    // When a shot is aligned to a continuous whole-track voiceover, its startFrame
    // and durationInFrames lock directly to its measured speech timestamps so the
    // audio plays unbroken without artificial gaps and graphics match the voiceover.
    if (
      Number.isFinite(shot.sourceStartSeconds) &&
      Number.isFinite(shot.sourceEndSeconds) &&
      shot.sourceEndSeconds! > shot.sourceStartSeconds!
    ) {
      const startFrame = Math.round(shot.sourceStartSeconds! * CANVAS.fps);
      const endFrame = Math.round(shot.sourceEndSeconds! * CANVAS.fps);
      const durationInFrames = Math.max(1, endFrame - startFrame);
      cursor = startFrame + durationInFrames;
      return {...shot, startFrame, durationInFrames};
    }
    // Script planning performs the natural-language split. This clamp is the
    // final guard for legacy saves, restored versions, and imported data.
    const durationInFrames = Math.min(
      MAX_SHOT_FRAMES,
      Math.max(1, Math.round(shot.durationInFrames)),
    );
    const placed = {...shot, startFrame: cursor, durationInFrames};
    cursor += durationInFrames;
    return placed;
  });
};

export const cutDurationInFrames = (shots: CutShot[]) =>
  shots.reduce((total, shot) => total + Math.max(1, shot.durationInFrames), 0);

/** Which shot covers a playhead frame, for the timeline's selection sync. */
export const shotAtFrame = (shots: CutShot[], frame: number) =>
  shots.find(
    (shot) => frame >= shot.startFrame && frame < shot.startFrame + shot.durationInFrames,
  ) ?? null;

/**
 * How long a shot must hold to cover its own narration.
 *
 * This is what makes unvoiced/legacy cuts land on readable boundaries: a shot
 * already covers whole beats, so its edges sit at sentence ends. Once a full
 * script track has been aligned, the measured source window is authoritative
 * and this floor is deliberately bypassed. The tail keeps older per-line
 * clips off the decay of the last word.
 */
const AUDIO_END_GUARD_SECONDS = 0.15;

export const shotFramesForAudio = (audio: SpokenLine, tailSeconds: number) => {
  // Whole-track part durations already contain the inter-part tail. Adding it
  // again on reload would stretch every segment and move word-aligned cuts.
  const extraSeconds = audio.durationIncludesTail
    ? 0
    : Math.max(0, tailSeconds) + AUDIO_END_GUARD_SECONDS;
  return Math.max(1, Math.ceil((audio.durationSeconds + extraSeconds) * CANVAS.fps));
};

/** Older cuts were saved before voiceover and styles existed. */
export const withVoiceDefaults = (cut: Cut): Cut => ({
  ...cut,
  style:
    cut.style === 'dark' || cut.style === 'dev' || cut.style === 'signal'
      ? cut.style
      : 'paper',
  mode: cut.mode === 'continuous' ? 'continuous' : 'separate',
  voice: withCartesiaVoiceDefaults(cut.voice),
  shots: resequence(
    cut.shots.map((shot) => {
      const background =
        cut.style === 'signal' &&
        shot.background.mode === 'solid' &&
        shot.background.color === LEGACY_DEFAULT_GROUND_SIGNAL
          ? {...shot.background, color: DEFAULT_GROUND_SIGNAL}
          : cut.style === 'dev' &&
              shot.background.mode === 'solid' &&
              LEGACY_DEFAULT_GROUNDS_DEV.includes(shot.background.color.toLowerCase())
            ? {...shot.background, color: DEFAULT_GROUND_DEV}
            : shot.background;
      return shot.audio
        ? {
            ...shot,
            background,
            durationInFrames: shot.audio.durationIncludesTail
              ? shotFramesForAudio(
                  shot.audio,
                  withCartesiaVoiceDefaults(cut.voice).tailSeconds,
                )
              : Math.max(
                  shot.durationInFrames,
                  shotFramesForAudio(shot.audio, withCartesiaVoiceDefaults(cut.voice).tailSeconds),
                  MIN_SHOT_FRAMES,
                ),
          }
        : {
            ...shot,
            background,
            // The pacing floor applies before voicing too: a planned shot
            // shorter than it could ever be understood is a mistimed preview.
            durationInFrames: Math.max(shot.durationInFrames, MIN_SHOT_FRAMES),
          };
    }),
  ),
});

export const beatsForShot = (beats: Beat[], shot: CutShot) =>
  shot.beatIds
    .map((id) => beats.find((beat) => beat.id === id))
    .filter((beat): beat is Beat => Boolean(beat));

export const newCut = (name: string): Cut => {
  const now = Date.now();
  return {
    id: `cut-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
    name,
    transcript: '',
    wpm: 150,
    beats: [],
    shots: [],
    styleNote: '',
    // Dev is the house register: a new cut starts there rather than on paper.
    style: 'dev',
    mode: 'separate',
    voice: defaultVoiceSettings(),
    createdAt: now,
    updatedAt: now,
  };
};

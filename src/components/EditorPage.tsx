import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  SendIcon,
  AttachmentIcon,
  CheckIcon,
  ChecklistIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  ColorSwatchIcon,
  CopyIcon,
  EditPenIcon,
  ExclamationTriangleIcon,
  MicrophoneIcon,
  MultiplyIcon,
  StackIcon,
  ZapIcon,
} from './MageIcon';
import {CutTimeline, TimelineLog} from './CutTimeline';
import {CustomSelect} from './CustomSelect';
import {GenerateIcon, PanelCollapseIcon, PanelExpandIcon, Spinner} from './AppIcons';
import {ModelPicker} from './ModelPicker';
import {COMPOSER_CHIP, PromptComposer} from './PromptComposer';
import {
  PageHeader,
  HeaderTitle,
  HeaderMeta,
  HeaderRenderButton,
  headerActionButton,
} from './PageHeader';
import {PlayerView} from './PlayerView';
import {ShotInspector} from './ShotInspector';
import {Sparkle} from './Sparkle';
import {QuickActions, QUICK_PROMPT_SHORTCUTS} from './QuickActions';
import {ChatEmptyState} from './ChatEmptyState';
import {GhostIconButton, ThinkingIndicator} from './ChatChrome';
import {prepareImage} from '../studio/images';
import {Attachment, StudioSettings} from '../studio/types';
import {CutStore, createCutStore, makeLiveCutComponent} from '../remotion/CutHost';
import {InvalidSceneReplyError, MissingKeyError, hasKeyForModel, requestScene} from '../studio/assistant';
import {useCodexAuth} from '../studio/codex';
import {compileScene} from '../studio/compile';
import {
  Cut,
  CutShot,
  DEFAULT_GROUND,
  DEFAULT_GROUND_DARK,
  DEFAULT_GROUND_DEV,
  DEFAULT_GROUND_SIGNAL,
  MAX_SHOT_FRAMES,
  MIN_SHOT_FRAMES,
  beatsForShot,
  cutDurationInFrames,
  msToFrames,
  resequence,
  shotAtFrame,
  withVoiceDefaults,
} from '../studio/cut';
import {cutInstruction, CutStyle, paletteFor} from '../studio/editorStyle';
import {fallbackScene} from '../studio/fallbackScene';
import {currentTrendingGiphyAssets} from '../studio/giphy';
import type {GiphyAsset} from '../studio/giphy';
import {photoBudget, resolveShotPhoto} from '../studio/photos';
import type {ShotPhoto} from '../studio/photos';
import {Provider, QUICK_FIX_MODEL, providerForModel} from '../studio/models';
import {
  SpokenLine,
  SpeechVoice,
  listVoices,
  speak,
  speakVoiceover,
} from '../studio/voice';
import {CANVAS} from '../studio/prompt';
import {ScriptShotPlan, planScriptShotList} from '../studio/shotlist';
import {
  loadCutsDurable,
  makeId,
  saveActiveCutId,
  saveCuts,
} from '../studio/storage';
import {SpendMap, formatUsd, parseCutSpend} from '../studio/spend';
import {runRenderWithLogs, RenderProgress} from '../studio/renderClient';
import {
  RenderResult,
  cutRenderSignature,
  downloadRenderedFile,
  releaseRenderedFile,
  renderButtonState,
} from '../studio/renderState';
import {
  Beat,
  alignScriptWords,
  beatsText,
  cleanTranscript,
  parseTranscript,
  scriptWords,
} from '../studio/transcript';
import {formatValidationError, validateSceneSource} from '../studio/validation';

/**
 * The editor page: a transcript in, a cut out.
 *
 * The pipeline is script -> one aligned voice track -> script word spans ->
 * scenes. The beat list remains a lightweight context map for the inspector,
 * but it never decides audio boundaries. The shot planner groups the pasted
 * words, and every scene receives the measured word window it owns.
 *
 * Four workers keeps the fill visibly moving for most providers. OpenLux has
 * a tighter burst limit, so it gets a smaller pool and lets its request layer
 * honor Retry-After before giving up.
 */







/** One-row error header pinned above the cut chrome. The message truncates to
    a single line; the whole row is the copy target, because the raw error —
    the provider's full reply or the exception text — is what makes the failure
    reportable. */
const ErrorBanner: React.FC<{message: string}> = ({message}) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard can be unavailable in insecure or embedded previews.
    }
  };

  return (
    <button
      onClick={copy}
      title="Click to copy the full error"
      aria-label="Copy the full error"
      className="flex h-8 w-full shrink-0 cursor-pointer items-center gap-2 border-b border-[#ff6b6b]/25 bg-[#ff6b6b]/10 px-3 text-left transition-colors hover:bg-[#ff6b6b]/15"
    >
      <ExclamationTriangleIcon className="h-3.5 w-3.5 shrink-0 text-[#ff9c9c]" />
      <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-[#ff9c9c]">
        {message}
      </span>
      {copied ? (
        <span className="flex shrink-0 items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-[#ffcf4a]">
          <CheckIcon className="h-3 w-3" /> Copied
        </span>
      ) : (
        <CopyIcon className="h-3 w-3 shrink-0 text-[#ff9c9c]/70" />
      )}
    </button>
  );
};

/**
 * Attempts per shot before it falls back. Three, because the two cheap
 * failures — a reply in the wrong shape and a scene that does not compile —
 * are both usually fixed by handing the error back once.
 */
const MAX_SHOT_ATTEMPTS = 3;
/** Scenes generated at the same time. */
const SHOT_CONCURRENCY = 10;
const OPENLUX_SHOT_CONCURRENCY = 10;
/**
 * Concurrency per provider. OpenLux concurrency is set to 10.
 */
const SHOT_CONCURRENCY_FOR = (provider: Provider) =>
  provider === 'openlux' ? OPENLUX_SHOT_CONCURRENCY : SHOT_CONCURRENCY;
const MAX_LOG_ENTRIES = 80;

const scriptToken = (value: string) =>
  value
    .toLocaleLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9]+/g, '');

const groundForCutStyle = (style: CutStyle) =>
  style === 'dark'
    ? DEFAULT_GROUND_DARK
    : style === 'dev'
      ? DEFAULT_GROUND_DEV
      : style === 'signal'
        ? DEFAULT_GROUND_SIGNAL
      : DEFAULT_GROUND;

export const THEMES: Array<{style: CutStyle; label: string; tag: string}> = [
  {style: 'dev', label: 'Dev', tag: 'Modular technical & charcoal'},
  {style: 'dark', label: 'Dark', tag: 'Deep violet & cards'},
  {style: 'signal', label: 'Signal', tag: 'High-contrast & crimson'},
  {style: 'paper', label: 'Paper', tag: 'Warm editorial & orange'},
];

export const ThemeThumbnail: React.FC<{style: CutStyle}> = ({style}) => {
  if (style === 'dev') {
    return (
      <div className="relative flex h-full w-full flex-col justify-between bg-[#000000] p-2.5 text-zinc-200">
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-1">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#38bdf8]" />
            <span className="font-mono text-[8.5px] text-zinc-300">ARCHITECTURE</span>
          </div>
          <span className="bg-[#38bdf8]/20 text-[#38bdf8] px-1 font-mono text-[7.5px] uppercase">
            Dev
          </span>
        </div>
        <div className="my-auto flex items-center gap-2">
          <div className="h-8 w-8 flex-shrink-0 bg-[#141418] border border-white/[0.08] rounded-md flex items-center justify-center font-bold text-xs text-[#38bdf8]">
            ⚡
          </div>
          <div className="space-y-0.5">
            <div className="text-[11px] font-bold text-white tracking-tight">MODULAR DEV</div>
            <div className="text-[8.5px] font-mono text-zinc-400">Charcoal · Flat Matte</div>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-white/[0.06] pt-1 text-[8.5px] font-mono text-zinc-500">
          <span>DM Sans · Mono</span>
          <span className="text-[#38bdf8]">Active</span>
        </div>
      </div>
    );
  }

  if (style === 'dark') {
    return (
      <div className="relative flex h-full w-full flex-col justify-between bg-[#121316] p-2.5 text-zinc-200">
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-1">
          <span className="font-mono text-[8.5px] text-zinc-400">Analytics</span>
          <span className="bg-[#a29bf5]/20 text-[#a29bf5] px-1 font-mono text-[7.5px] uppercase">
            Dark
          </span>
        </div>
        <div className="my-auto flex items-center justify-between gap-2">
          <div className="border border-white/10 bg-[#1b1b22] px-2 py-1">
            <div className="text-[7.5px] font-mono uppercase text-zinc-500">Speed</div>
            <div className="text-xs font-semibold text-[#a29bf5]">99.8%</div>
          </div>
          <div className="border border-white/10 bg-[#1b1b22] px-2 py-1">
            <div className="text-[7.5px] font-mono uppercase text-zinc-500">Latency</div>
            <div className="text-xs font-semibold text-white">12ms</div>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-white/[0.06] pt-1 text-[8.5px] font-mono text-zinc-500">
          <span>Violet accent</span>
          <span>Deep UI</span>
        </div>
      </div>
    );
  }

  if (style === 'signal') {
    return (
      <div className="relative flex h-full w-full flex-col justify-between bg-[#121211] p-2.5 text-zinc-200">
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-1">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#ff3b30]" />
            <span className="font-mono text-[8.5px] text-zinc-300">SYSTEM STATUS</span>
          </div>
          <span className="bg-[#ff3b30]/20 text-[#ff3b30] px-1 font-mono text-[7.5px] uppercase">
            Signal
          </span>
        </div>
        <div className="my-auto flex items-center gap-2">
          <div className="h-8 w-8 flex-shrink-0 bg-[#191a1f] flex items-center justify-center font-bold text-xs text-[#ff3b30]">
            ⚡
          </div>
          <div className="space-y-0.5">
            <div className="text-[11px] font-bold text-white tracking-tight">HIGH IMPACT</div>
            <div className="text-[8.5px] font-mono text-zinc-400">Crimson · Matte flat</div>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-white/[0.06] pt-1 text-[8.5px] font-mono text-zinc-500">
          <span>Bricolage Grotesque</span>
          <span className="text-[#ff3b30]">Active</span>
        </div>
      </div>
    );
  }

  // Paper theme
  return (
    <div className="relative flex h-full w-full flex-col justify-between bg-[#f5f4ef] p-2.5 text-zinc-900">
      <div className="flex items-center justify-between border-b border-stone-300 pb-1">
        <span className="font-serif text-[9.5px] font-semibold text-stone-800">The Editorial</span>
        <span className="bg-[#e58527] text-white px-1 font-mono text-[7.5px] uppercase font-bold">
          Paper
        </span>
      </div>
      <div className="my-auto space-y-1">
        <div className="border border-stone-800 bg-[#e58527] px-2 py-0.5 text-white shadow-[2px_2px_0_#292524]">
          <span className="text-[11px] font-bold tracking-tight">HAND-DRAWN WARMTH</span>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-stone-300 pt-1 text-[8.5px] font-mono text-stone-600">
        <span>Cream canvas</span>
        <span>Orange ink</span>
      </div>
    </div>
  );
};

export const MODE_OPTIONS: Array<{value: 'separate' | 'continuous'; label: string}> = [
  {value: 'separate', label: 'Separate Scenes'},
  {value: 'continuous', label: 'Continuous Motion'},
];



/** One restorable snapshot of a cut's scenes. Stored per cut so each timeline
 * keeps its own history; the shots carry their timing, so a restore is exact.
 */
type CutVersion = {
  id: string;
  createdAt: number;
  label: string;
  shotCount: number;
  fingerprint: string;
  shots: CutShot[];
  /**
   * What was spent getting from the previous version to this one — planning,
   * every scene generation, and every quick fix in that window.
   *
   * It is the spend *since* the last snapshot rather than the total cost of
   * the shots in it. Summing each version's shot costs would re-count every
   * scene that did not change, so a cut where one shot was regenerated five
   * times would report five times its true price.
   */
  costUsd?: number;
};

const MAX_CUT_VERSIONS = 12;
const CUT_VERSIONS_KEY = 'motion-studio.cut-versions.v1';
/**
 * Lifetime spend per cut, kept separately from the versions.
 *
 * Not derived by summing them: history is capped at MAX_CUT_VERSIONS and can
 * be cleared, and spend that never reached a snapshot (a generation that
 * produced identical code, a failed run that still billed) belongs in the
 * total too. What a cut cost should not fall when its snapshots are tidied.
 */
const CUT_SPEND_KEY = 'motion-studio.cut-spend.v1';
const VERSION_SNAPSHOT_DELAY_MS = 2000;

const fingerprintShots = (shots: CutShot[]) => {
  const raw = shots.map((shot) => `${shot.id}:${shot.code}`).join('');
  let hash = 5381;
  for (let i = 0; i < raw.length; i += 1) {
    hash = ((hash << 5) + hash + raw.charCodeAt(i)) | 0;
  }
  return `${shots.length}:${(hash >>> 0).toString(36)}`;
};

const loadCutSpend = (): Record<string, number> => {
  try {
    return parseCutSpend(window.localStorage.getItem(CUT_SPEND_KEY));
  } catch {
    return {};
  }
};

const loadCutHistories = (): Record<string, CutVersion[]> => {
  try {
    const raw = window.localStorage.getItem(CUT_VERSIONS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, CutVersion[]>;
    if (!parsed || typeof parsed !== 'object') return {};
    const cleaned: Record<string, CutVersion[]> = {};
    for (const [cutId, versions] of Object.entries(parsed)) {
      if (!Array.isArray(versions)) continue;
      const valid = versions.filter(
        (version) =>
          version &&
          typeof version.id === 'string' &&
          Array.isArray(version.shots) &&
          version.shots.length > 0,
      );
      if (valid.length) cleaned[cutId] = valid.slice(-MAX_CUT_VERSIONS);
    }
    return cleaned;
  } catch {
    return {};
  }
};

const formatVersionTime = (createdAt: number) => {
  try {
    return new Date(createdAt).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
};

/** Keep long pastes inside Cartesia's per-request limit without changing the
 * source timeline: the bridge joins these voice pieces into one file, while
 * their word cues are offset back onto the continuous track below. */
const splitScriptForSpeech = (script: string, maxCharacters = 7600) => {
  if (script.length <= maxCharacters) return [script];
  const words = script.split(/\s+/).filter(Boolean);
  const parts: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && next.length > maxCharacters) {
      parts.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) parts.push(current);
  return parts;
};

/**
 * Recover source-word spans for shots made by an older planner. This is only a
 * migration path; new shots always carry their exact script indexes.
 */
const spansForExistingShots = (script: string, shots: CutShot[]) => {
  const words = scriptWords(script);
  const tokens = words.map(scriptToken);
  let cursor = 0;
  return shots.map((shot) => {
    const storedStart = shot.scriptWordStart;
    const storedEnd = shot.scriptWordEnd;
    const storedMatchesNarration =
      Number.isInteger(storedStart) &&
      Number.isInteger(storedEnd) &&
      (storedStart as number) >= 0 &&
      (storedEnd as number) > (storedStart as number) &&
      scriptWords(shot.narration)
        .map(scriptToken)
        .join('\u0000') ===
        words
          .slice(storedStart as number, storedEnd as number)
          .map(scriptToken)
          .join('\u0000');
    if (storedMatchesNarration) {
      cursor = Math.min(words.length, storedEnd as number);
      return {wordStart: storedStart as number, wordEnd: storedEnd as number};
    }
    const wanted = scriptWords(shot.narration).map(scriptToken).filter(Boolean);
    let found = -1;
    if (wanted.length) {
      for (let index = cursor; index + wanted.length <= tokens.length; index += 1) {
        if (wanted.every((token, offset) => tokens[index + offset] === token)) {
          found = index;
          break;
        }
      }
    }
    const wordStart = found >= 0 ? found : cursor;
    const wordEnd = Math.min(words.length, Math.max(wordStart + 1, wordStart + wanted.length));
    cursor = wordEnd;
    return {wordStart, wordEnd};
  });
};

type ScriptShotBuildOptions = {
  whole?: SpokenLine;
  beats?: Beat[];
};

const MIN_SHOT_SECONDS = 3.5;
const MAX_SHOT_SECONDS = MAX_SHOT_FRAMES / CANVAS.fps;

/** Pick the strongest natural break at or before the last legal word edge. */
const latestNaturalScriptBoundary = (
  words: string[],
  start: number,
  latest: number,
) => {
  for (let boundary = latest; boundary > start; boundary -= 1) {
    if (/[.!?;:,][\"'’”)]*$/.test(words[boundary - 1] ?? '')) return boundary;
  }
  for (let boundary = latest; boundary > start + 1; boundary -= 1) {
    if (/^(?:and|but|because|so|while|then|or|which|that)$/i.test(words[boundary] ?? '')) {
      return boundary;
    }
  }
  return latest;
};

/**
 * The model suggests semantic spans; this function owns the timing contract.
 * It splits each suggestion at the latest natural word edge that still lands
 * by eight seconds, using measured speech timestamps whenever they exist.
 */
const boundPlansToShotDuration = (
  plans: ScriptShotPlan[],
  words: string[],
  wpm: number,
  timings: ReturnType<typeof alignScriptWords> | null,
  sourceDuration: number,
) => {
  const lastSpokenEnd = timings?.[timings.length - 1]?.end ?? sourceDuration;
  const effectiveSourceDuration = timings
    ? Math.min(sourceDuration, lastSpokenEnd + 0.15)
    : sourceDuration;
  const boundarySeconds = (wordIndex: number) => {
    if (!timings) return (wordIndex * 60) / Math.max(60, wpm);
    if (wordIndex <= 0) return 0;
    if (wordIndex >= words.length) return effectiveSourceDuration;
    return timings[wordIndex]?.start ?? effectiveSourceDuration;
  };
  const bounded: ScriptShotPlan[] = [];
  let generatedGroup =
    plans.reduce(
      (highest, plan) => (plan.group === undefined ? highest : Math.max(highest, plan.group)),
      -1,
    ) + 1;

  for (const plan of plans) {
    let cursor = Math.max(0, Math.min(words.length - 1, Math.round(plan.wordStart)));
    const end = Math.min(words.length, Math.max(cursor + 1, Math.round(plan.wordEnd)));
    let splitIndex = 0;
    let splitGroup = plan.group;
    while (cursor < end) {
      const startSeconds = boundarySeconds(cursor);
      if (boundarySeconds(end) - startSeconds <= MAX_SHOT_SECONDS + 1e-6) {
        bounded.push({
          ...plan,
          wordStart: cursor,
          wordEnd: end,
          group: splitIndex > 0 ? splitGroup : plan.group,
          transitionBefore: splitIndex === 0 ? plan.transitionBefore : false,
        });
        break;
      }

      let latest = cursor;
      for (let boundary = cursor + 1; boundary < end; boundary += 1) {
        if (boundarySeconds(boundary) - startSeconds > MAX_SHOT_SECONDS + 1e-6) break;
        latest = boundary;
      }
      if (latest <= cursor) {
        throw new Error(
          'The voiceover contains an uninterrupted word or pause longer than 8 seconds. Retry voiceover.',
        );
      }
      if (splitGroup === undefined) {
        splitGroup = generatedGroup;
        generatedGroup += 1;
      }
      const next = latestNaturalScriptBoundary(words, cursor, latest);
      bounded.push({
        ...plan,
        wordStart: cursor,
        wordEnd: next,
        group: splitGroup,
        transitionBefore: splitIndex === 0 ? plan.transitionBefore : false,
      });
      cursor = next;
      splitIndex += 1;
    }
  }

  // Merge any sub-3.5s segment with its neighbor so no segment is less than 3.5s of speech
  const currentPlans = [...bounded];
  let changed = true;
  while (changed && currentPlans.length > 1) {
    changed = false;
    for (let i = 0; i < currentPlans.length; i++) {
      const item = currentPlans[i];
      const dur = boundarySeconds(item.wordEnd) - boundarySeconds(item.wordStart);
      if (dur < MIN_SHOT_SECONDS) {
        // Try merging with previous if possible
        if (i > 0) {
          const prev = currentPlans[i - 1];
          const combined = boundarySeconds(item.wordEnd) - boundarySeconds(prev.wordStart);
          if (combined <= MAX_SHOT_SECONDS + 1e-6) {
            prev.wordEnd = item.wordEnd;
            currentPlans.splice(i, 1);
            changed = true;
            break;
          }
        }
        // Otherwise try merging with next
        if (i < currentPlans.length - 1) {
          const next = currentPlans[i + 1];
          const combined = boundarySeconds(next.wordEnd) - boundarySeconds(item.wordStart);
          if (combined <= MAX_SHOT_SECONDS + 1e-6) {
            next.wordStart = item.wordStart;
            currentPlans.splice(i, 1);
            changed = true;
            break;
          }
        }
      }
    }
  }

  return {plans: currentPlans.length ? currentPlans : bounded, sourceDuration: effectiveSourceDuration};
};

/** Build shots from script spans, optionally attaching slices of one track. */
const buildScriptShots = (
  cut: Cut,
  plans: ScriptShotPlan[],
  options: ScriptShotBuildOptions = {},
): CutShot[] => {
  const script = cleanTranscript(cut.transcript);
  const words = scriptWords(script);
  const beats = options.beats ?? parseTranscript(script, {wpm: cut.wpm});
  const timings = options.whole
    ? alignScriptWords(script, options.whole.words ?? [])
    : null;
  const sourceDuration = options.whole?.durationSeconds ?? 0;
  const bounded = boundPlansToShotDuration(
    plans,
    words,
    cut.wpm,
    timings,
    sourceDuration,
  );
  const timedPlans = bounded.plans;
  const effectiveSourceDuration = bounded.sourceDuration;
  let sourceCursor = 0;

  const shots = timedPlans
    .map((plan, planIndex) => {
      const wordStart = Math.max(0, Math.min(words.length - 1, Math.round(plan.wordStart)));
      const wordEnd = Math.min(
        words.length,
        Math.max(wordStart + 1, Math.round(plan.wordEnd)),
      );
      const narration = words.slice(wordStart, wordEnd).join(' ');
      const coveredBeats = beats.filter((beat) => {
        const start = beat.wordStart ?? 0;
        const end = beat.wordEnd ?? start + beat.wordCount;
        return start < wordEnd && end > wordStart;
      });
      const fallbackBeat =
        coveredBeats[0] ?? beats[Math.min(beats.length - 1, planIndex)] ?? null;

      let sourceStartSeconds: number;
      let sourceEndSeconds: number;
      let audio: SpokenLine | undefined;
      if (timings && options.whole) {
        // The previous segment owns any pause before this one. That makes the
        // cumulative slices cover the one source file without overlap or gaps.
        sourceStartSeconds = sourceCursor;
        const naturalEnd =
          planIndex + 1 < timedPlans.length
            ? timings[Math.min(words.length - 1, Math.max(0, timedPlans[planIndex + 1].wordStart))]
                ?.start ?? effectiveSourceDuration
            : effectiveSourceDuration;
        sourceEndSeconds = Math.min(
          effectiveSourceDuration,
          Math.max(sourceStartSeconds + 0.02, naturalEnd),
        );
        if (planIndex === timedPlans.length - 1) sourceEndSeconds = effectiveSourceDuration;
        if (!(sourceEndSeconds > sourceStartSeconds)) {
          throw new Error('The script segments do not have increasing voice boundaries. Retry voiceover.');
        }
        const segmentTimings = timings.slice(wordStart, wordEnd);
        const spokenStart = Math.min(...segmentTimings.map((timing) => timing.spokenStart));
        const spokenEnd = Math.max(...segmentTimings.map((timing) => timing.spokenEnd));
        const globalWords = (options.whole.words ?? []).slice(spokenStart, spokenEnd);
        if (!globalWords.length) {
          throw new Error(`No measured words were found for scene ${planIndex + 1}. Retry voiceover.`);
        }
        const durationSeconds = sourceEndSeconds - sourceStartSeconds;
        const relativeWords = globalWords.map((word) => {
          const start = Math.max(0, Math.min(durationSeconds, word.start - sourceStartSeconds));
          const end = Math.max(
            start,
            Math.min(durationSeconds, Math.max(0, word.end - sourceStartSeconds)),
          );
          return {...word, start, end};
        });
        audio = {
          ...options.whole,
          durationSeconds,
          durationIncludesTail: true,
          sourceText: narration,
          words: relativeWords,
        };
        sourceCursor = sourceEndSeconds;
      } else {
        const msPerWord = 60000 / Math.max(60, cut.wpm);
        sourceStartSeconds = (wordStart * msPerWord) / 1000;
        sourceEndSeconds = (wordEnd * msPerWord) / 1000;
      }

      const continuesGroup =
        cut.mode === 'continuous' ||
        (plan.group !== undefined && timedPlans[planIndex - 1]?.group === plan.group);
      return {
        id: makeId('shot'),
        beatIds: coveredBeats.length
          ? coveredBeats.map((beat) => beat.id)
          : fallbackBeat
            ? [fallbackBeat.id]
            : [],
        narration,
        scriptWordStart: wordStart,
        scriptWordEnd: wordEnd,
        sourceStartSeconds,
        sourceEndSeconds,
        brief: plan.brief,
        group: cut.mode === 'continuous' ? 0 : plan.group,
        transitionBefore:
          cut.mode === 'continuous' || continuesGroup || plan.transitionBefore === false
            ? false
            : true,
        background: {
          mode: plan.background === 'transparent' ? ('transparent' as const) : ('solid' as const),
          color: groundForCutStyle(cut.style),
        },
        code: '',
        startFrame: 0,
        durationInFrames: options.whole
          ? Math.max(
              1,
              Math.round(sourceEndSeconds * CANVAS.fps) -
                Math.round(sourceStartSeconds * CANVAS.fps),
            )
          : Math.max(
              MIN_SHOT_FRAMES,
              msToFrames((sourceEndSeconds - sourceStartSeconds) * 1000),
            ),
        status: 'planned' as const,
        audio,
      };
    })
    .filter((shot) => shot.scriptWordEnd! > shot.scriptWordStart!);
  const overlong = shots.find((shot) => shot.durationInFrames > MAX_SHOT_FRAMES);
  if (overlong) {
    throw new Error('A scene could not be cut below 8 seconds at a valid word boundary.');
  }
  return shots;
};

type VoicePassResult = {
  failures: number;
  completed: Map<string, SpokenLine>;
};

export type CutProgress = {
  built: number;
  voiced: number;
  total: number;
};

export type CutState = {
  busy: 'idle' | 'planning' | 'generating' | 'voicing' | 'generating-voicing';
  step: 'idle' | 'voice' | 'plan' | 'build';
  progress?: CutProgress | null;
  status?: string | null;
  error?: string | null;
};

interface EditorPageProps {
  settings: StudioSettings;
  onOpenSettings: () => void;
  onRecordSpend: (model: string, cost: number | null) => void;
  onModelChange: (model: string) => void;
  spend: SpendMap;
  cuts: Cut[];
  setCuts: React.Dispatch<React.SetStateAction<Cut[]>>;
  activeCutId: string;
  setActiveCutId: (cutId: string) => void;
  onCreateCut: () => void;
  onDeleteCut: (cutId: string) => void;
}

export const EditorPage: React.FC<EditorPageProps> = ({
  settings,
  onOpenSettings,
  onRecordSpend,
  onModelChange,
  spend: _spend,
  cuts,
  setCuts,
  activeCutId,
  setActiveCutId: _setActiveCutId,
  onCreateCut: _onCreateCut,
  onDeleteCut: _onDeleteCut,
}) => {
  const {auth: _codexAuth} = useCodexAuth();
  /** False until the durable IndexedDB copy has been read, so a save cannot
      overwrite it with a stale localStorage mirror first. */
  const [cutsReady, setCutsReady] = useState(false);
  const cutsRef = useRef(cuts);
  cutsRef.current = cuts;
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  /** A quick-fix reply belongs to the shot it was run on; clear on switch. */
  useEffect(() => setQuickFixReply(null), [selectedShotId]);
  const [playheadFrame, setPlayheadFrame] = useState(0);
  const [seekSignal, setSeekSignal] = useState<{frame: number; token: number}>();
  const [cutStates, setCutStates] = useState<Record<string, CutState>>({});
  const activeCut = cuts.find((cut) => cut.id === activeCutId) ?? cuts[0];
  const cutRef = useRef(activeCut);
  cutRef.current = activeCut;

  const cancelMapRef = useRef<Map<string, boolean>>(new Map());
  const cancelRef = useRef(false);

  const isCancelled = useCallback((cutId: string) => cancelMapRef.current.get(cutId) === true, []);
  const resetCancel = useCallback((cutId: string) => {
    cancelMapRef.current.set(cutId, false);
    if (cutRef.current.id === cutId) {
      cancelRef.current = false;
    }
  }, []);
  const triggerCancel = useCallback((cutId: string) => {
    cancelMapRef.current.set(cutId, true);
    if (cutRef.current.id === cutId) {
      cancelRef.current = true;
    }
  }, []);

  const setCutBusy = useCallback((cutId: string, busyVal: CutState['busy']) => {
    setCutStates((prev) => ({
      ...prev,
      [cutId]: {...prev[cutId], busy: busyVal, step: prev[cutId]?.step ?? 'idle'},
    }));
  }, []);

  const setCutWorkflowStep = useCallback((cutId: string, stepVal: CutState['step']) => {
    setCutStates((prev) => ({
      ...prev,
      [cutId]: {...prev[cutId], step: stepVal, busy: prev[cutId]?.busy ?? 'idle'},
    }));
  }, []);

  const setCutProgress = useCallback(
    (
      cutId: string,
      update: CutProgress | null | ((prev: CutProgress | null) => CutProgress | null),
    ) => {
      setCutStates((prev) => {
        const current = prev[cutId]?.progress ?? null;
        const nextProgress = typeof update === 'function' ? update(current) : update;
        return {
          ...prev,
          [cutId]: {
            ...prev[cutId],
            progress: nextProgress,
            busy: prev[cutId]?.busy ?? 'idle',
            step: prev[cutId]?.step ?? 'idle',
          },
        };
      });
    },
    [],
  );

  const setCutStatus = useCallback((cutId: string, statusVal: string | null) => {
    setCutStates((prev) => ({
      ...prev,
      [cutId]: {
        ...prev[cutId],
        status: statusVal,
        busy: prev[cutId]?.busy ?? 'idle',
        step: prev[cutId]?.step ?? 'idle',
      },
    }));
  }, []);

  const setCutError = useCallback((cutId: string, errorVal: string | null) => {
    setCutStates((prev) => ({
      ...prev,
      [cutId]: {
        ...prev[cutId],
        error: errorVal,
        busy: prev[cutId]?.busy ?? 'idle',
        step: prev[cutId]?.step ?? 'idle',
      },
    }));
  }, []);

  const activeCutState = cutStates[activeCut.id] ?? {
    busy: 'idle',
    step: 'idle',
    progress: null,
    status: null,
    error: null,
  };
  const busy = activeCutState.busy;
  const activeWorkflowStep = activeCutState.step;
  const progress = activeCutState.progress ?? null;
  const status = activeCutState.status ?? null;
  const error = activeCutState.error ?? null;

  const setBusy = useCallback((val: CutState['busy']) => setCutBusy(cutRef.current.id, val), [setCutBusy]);
  const setActiveWorkflowStep = useCallback(
    (val: CutState['step']) => setCutWorkflowStep(cutRef.current.id, val),
    [setCutWorkflowStep],
  );
  const setStatus = useCallback((val: string | null) => setCutStatus(cutRef.current.id, val), [setCutStatus]);
  const setError = useCallback((val: string | null) => setCutError(cutRef.current.id, val), [setCutError]);

  const [voices, setVoices] = useState<SpeechVoice[]>([]);
  const [logs, setLogs] = useState<TimelineLog[]>([]);
  const activeGeneratingShotsRef = useRef<Set<string>>(new Set());
  const [generatingShotIds, setGeneratingShotIds] = useState<string[]>([]);
  const logCounterRef = useRef(0);

  const hasShots = activeCut.shots.length > 0;
  const [panelOpen, setPanelOpen] = useState(true);
  const [rightTab, setRightTab] = useState<'transcript' | 'chat' | 'shot' | 'history'>(() =>
    hasShots ? 'chat' : 'transcript',
  );
  /** Restorable auto-snapshots per cut: every finished build, fix, or code
   * edit lands here after a short quiet window, newest last. */
  const [cutHistories, setCutHistories] = useState<Record<string, CutVersion[]>>(loadCutHistories);
  /** Lifetime spend per cut, shown as the project total in the history panel. */
  const [cutSpend, setCutSpend] = useState<Record<string, number>>(loadCutSpend);
  /**
   * Spend since the last snapshot, waiting to be attached to the next version.
   * A ref rather than state: a build records a cost per shot and the snapshot
   * is debounced behind it, so this has to accumulate without re-rendering or
   * restarting that timer.
   */
  const pendingVersionCostRef = useRef<Record<string, number>>({});
  /** Label for the next snapshot (Build, Fix, Edit…); consumed by the
   * snapshot effect so rapid per-shot updates collapse into one version. */
  const lastActionRef = useRef<string | null>(null);
  /** True while applying a restore, so the snapshot effect skips one cycle
   * instead of re-saving the version that was just restored. */
  const restoreGuardRef = useRef(false);
  /** Persist is best-effort: scene code can outgrow localStorage, in which
   * case the in-memory history still works for the session. */
  const pruneGuardRef = useRef(false);

  const [fixDraft, setFixDraft] = useState('');
  const [fixImages, setFixImages] = useState<Attachment[]>([]);
  const [fixNote, setFixNote] = useState('');
  const [copiedFixReply, setCopiedFixReply] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const copyFixReply = async () => {
    if (!quickFixReply) return;
    try {
      await navigator.clipboard.writeText(quickFixReply);
      setCopiedFixReply(true);
      window.setTimeout(() => setCopiedFixReply(false), 1200);
    } catch {
      // Clipboard access can be unavailable in an embedded or insecure preview.
    }
  };

  const addFixImages = async (files: File[]) => {
    const room = 4 - fixImages.length;
    if (room <= 0) {
      setFixNote('Up to 4 reference images.');
      return;
    }
    const accepted: Attachment[] = [];
    for (const file of files.slice(0, room)) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const {full, thumb} = await prepareImage(file);
        accepted.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          dataUrl: full,
          thumbUrl: thumb,
        });
      } catch {
        // ignore
      }
    }
    if (accepted.length) setFixImages((curr) => [...curr, ...accepted]);
  };

  const appendLog = useCallback(
    (level: TimelineLog['level'], message: string, shotId?: string, cutId = cutRef.current.id) => {
      const entry: TimelineLog = {
        id: `log-${Date.now()}-${logCounterRef.current++}`,
        cutId,
        time: Date.now(),
        level,
        message,
        shotId,
      };
      setLogs((current) => [...current.slice(-(MAX_LOG_ENTRIES - 1)), entry]);
    },
    [],
  );

  useEffect(() => {
    if (!cutsReady) return;
    const timer = window.setTimeout(() => saveCuts(cuts), 600);
    return () => window.clearTimeout(timer);
  }, [cuts, cutsReady]);
  useEffect(() => saveActiveCutId(activeCut.id), [activeCut.id]);

  // The durable IndexedDB copy outranks the localStorage mirror: scene code
  // can outgrow the quota, and a silently-failed mirror write used to wipe
  // every generated graphic on refresh.
  useEffect(() => {
    let live = true;
    loadCutsDurable()
      .then((stored) => {
        if (!live || !stored?.length) return;
        setCuts((current) => {
          const currentLatest = current.reduce((max, cut) => Math.max(max, cut.updatedAt), 0);
          const storedLatest = stored.reduce((max, cut) => Math.max(max, cut.updatedAt), 0);
          return storedLatest > currentLatest ? stored.map(withVoiceDefaults) : current;
        });
      })
      .finally(() => {
        if (live) setCutsReady(true);
      });
    return () => {
      live = false;
    };
  }, []);

  // Flush the latest cuts when the page unmounts (e.g. switching to the
  // studio), so a change made moments earlier is never lost to the debounce.
  useEffect(
    () => () => {
      saveCuts(cutsRef.current);
    },
    [],
  );

  // The bridge only exists while the dev server is running, so a failure here
  // is expected in a built preview and must not surface as an error.
  useEffect(() => {
    listVoices()
      .then((result) => setVoices(result.voices))
      .catch(() => setVoices([]));
  }, []);

  const updateCut = useCallback(
    (cutId: string, update: (cut: Cut) => Cut) => {
      setCuts((current) =>
        current.map((cut) => (cut.id === cutId ? {...update(cut), updatedAt: Date.now()} : cut)),
      );
    },
    [],
  );

  const updateShot = useCallback(
    (cutId: string, shotId: string, update: (shot: CutShot) => CutShot) => {
      updateCut(cutId, (cut) => ({
        ...cut,
        shots: resequence(cut.shots.map((shot) => (shot.id === shotId ? update(shot) : shot))),
      }));
    },
    [updateCut],
  );

  const totalFrames = Math.max(1, cutDurationInFrames(activeCut.shots));
  // Operational changes such as "generating" and timeline logs must not
  // rebuild the compiled Remotion tree. Preserve the last shot object whenever
  // every field that actually affects rendering is unchanged.
  const renderShotsRef = useRef<CutShot[]>([]);
  const previousRenderShots = renderShotsRef.current;
  const nextRenderShots = activeCut.shots.map((shot, index) => {
    const previous = previousRenderShots[index];
    return previous &&
      previous.id === shot.id &&
      previous.code === shot.code &&
      previous.startFrame === shot.startFrame &&
      previous.durationInFrames === shot.durationInFrames &&
      previous.background.mode === shot.background.mode &&
      previous.background.color === shot.background.color &&
      previous.audio?.file === shot.audio?.file
      ? previous
      : shot;
  });
  const renderShots =
    previousRenderShots.length === nextRenderShots.length &&
    nextRenderShots.every((shot, index) => shot === previousRenderShots[index])
      ? previousRenderShots
      : nextRenderShots;
  renderShotsRef.current = renderShots;
  /** Shot ids already given one automatic regeneration after a runtime crash. */
  const handledCrashesRef = useRef<Set<string>>(new Set());
  const giphyWarningRef = useRef(false);
  const [quickFixBusy, setQuickFixBusy] = useState(false);
  /** Style direction is optional, so the empty-state composer keeps it folded. */
  const [composerStyleNote, setComposerStyleNote] = useState(false);
  const styleNoteRef = useRef<HTMLTextAreaElement>(null);

  const [renderingCutId, setRenderingCutId] = useState<string | null>(null);
  const [renderLogs, setRenderLogs] = useState<Record<string, RenderProgress>>({});
  const [renderResults, setRenderResults] = useState<Record<string, RenderResult>>({});
  /** The model's reply from the last fix, shown under the shot. */
  const [quickFixReply, setQuickFixReply] = useState<string | null>(null);
  /** Always the latest handler, so the memoized cut component calls fresh state. */
  const crashHandlerRef = useRef<(shotId: string, message: string) => void>(() => {});
  const onCrash = useCallback(
    (shotId: string, message: string) => crashHandlerRef.current(shotId, message),
    [],
  );
  // The cut is pushed into a store rather than rebuilt as a new component on
  // every edit. Swapping the component type made the Player unmount and
  // remount its whole tree — including the <Audio> tags — so the voiceover
  // restarted cold after each change and regularly came back stalled or
  // silent, because the fresh tags had no user gesture behind them. The store
  // keeps one mounted tree that re-renders in place.
  const cutStoreRef = useRef<{id: string; store: CutStore} | null>(null);
  if (!cutStoreRef.current || cutStoreRef.current.id !== activeCut.id) {
    cutStoreRef.current = {
      id: activeCut.id,
      store: createCutStore({
        shots: renderShots,
        style: activeCut.style,
        voiceover: activeCut.voiceover,
        onCrash,
      }),
    };
  }
  const cutStore = cutStoreRef.current.store;
  useEffect(() => {
    cutStore.set({
      shots: renderShots,
      style: activeCut.style,
      voiceover: activeCut.voiceover,
      onCrash,
    });
  }, [cutStore, renderShots, activeCut.style, activeCut.voiceover, onCrash]);
  // Identity is per cut, so switching cuts still mounts a fresh player tree.
  const cutComponent = useMemo(() => makeLiveCutComponent(cutStore), [cutStore]);

  const preview = useMemo(() => {
    // A cheap fingerprint of the scene sources: the Player restarts on it, so
    // a quick fix or edit visibly lands instead of the preview holding its
    // old frame.
    const fingerprint = activeCut.shots.map((shot) => shot.code).join('\u0000');
    let hash = 5381;
    for (let i = 0; i < fingerprint.length; i += 1) {
      hash = ((hash << 5) + hash + fingerprint.charCodeAt(i)) | 0;
    }
    return {
      id: activeCut.id,
      name: activeCut.name,
      component: cutComponent,
      durationInFrames: totalFrames,
      fps: CANVAS.fps,
      width: CANVAS.width,
      height: CANVAS.height,
      contentKey: (hash >>> 0).toString(36),
    };
  }, [activeCut.id, activeCut.name, cutComponent, totalFrames]);

  const selectedShot =
    activeCut.shots.find((shot) => shot.id === selectedShotId) ?? null;
  const activeLogs = useMemo(
    () => logs.filter((entry) => entry.cutId === activeCut.id),
    [activeCut.id, logs],
  );
  const activeVersions = useMemo(
    () => cutHistories[activeCut.id] ?? [],
    [cutHistories, activeCut.id],
  );

  const activeCutSpend = cutSpend[activeCut.id] ?? 0;

  /**
   * Every billed call in this cut, in one place: it reaches the app-wide spend
   * ledger, the cut's lifetime total, and the pending bucket for the next
   * version. Call this instead of `onRecordSpend` directly, or the cost lands
   * in the global figure and nowhere the user can attribute it.
   */
  const recordCutSpend = useCallback(
    (cutId: string, model: string, cost: number | null | undefined) => {
      onRecordSpend(model, cost ?? null);
      if (typeof cost !== 'number' || !Number.isFinite(cost) || cost <= 0) return;
      pendingVersionCostRef.current[cutId] = (pendingVersionCostRef.current[cutId] ?? 0) + cost;
      setCutSpend((current) => ({...current, [cutId]: (current[cutId] ?? 0) + cost}));
    },
    [onRecordSpend],
  );

  /* ───────────────────────── cut version history ───────────────────────── */

  useEffect(() => {
    try {
      window.localStorage.setItem(CUT_SPEND_KEY, JSON.stringify(cutSpend));
    } catch {
      // A few numbers never fill the quota, but spend is a nicety either way.
    }
  }, [cutSpend]);

  /** The latest histories, so the snapshot below can decide whether it is
      writing a version before it calls setState. */
  const cutHistoriesRef = useRef(cutHistories);
  cutHistoriesRef.current = cutHistories;

  useEffect(() => {
    try {
      window.localStorage.setItem(CUT_VERSIONS_KEY, JSON.stringify(cutHistories));
    } catch {
      // Scene code can outgrow the quota: keep the newest few per cut and try
      // once more, otherwise stay in-memory for the session.
      if (pruneGuardRef.current) return;
      pruneGuardRef.current = true;
      setCutHistories((current) => {
        const pruned: Record<string, CutVersion[]> = {};
        for (const [cutId, versions] of Object.entries(current)) {
          pruned[cutId] = versions.slice(-5);
        }
        try {
          window.localStorage.setItem(CUT_VERSIONS_KEY, JSON.stringify(pruned));
        } catch {
          // In-memory only from here.
        }
        return pruned;
      });
    }
  }, [cutHistories]);

  /**
   * Auto-snapshot the cut's scenes after a quiet window. Builds update shots
   * one by one, so the debounce collapses a whole build into a single
   * version; fixes and manual code edits settle the same way. Restores set a
   * guard so re-applying a version never records a duplicate of itself.
   */
  useEffect(() => {
    if (!activeCut.shots.length || !activeCut.shots.some((shot) => shot.code.trim())) return;
    if (busy !== 'idle' || quickFixBusy) return;
    const fingerprint = fingerprintShots(activeCut.shots);
    const timer = window.setTimeout(() => {
      if (restoreGuardRef.current) {
        restoreGuardRef.current = false;
        return;
      }
      const label = lastActionRef.current ?? 'Edit';
      lastActionRef.current = null;
      const existing = cutHistoriesRef.current[activeCut.id] ?? [];
      if (existing.length && existing[existing.length - 1].fingerprint === fingerprint) {
        // No new version, so the pending spend stays pending and rolls into
        // whichever snapshot does land — it is never dropped.
        return;
      }
      // Drained here rather than when each cost arrives: the debounce means
      // one build's shots all bill before a single version is written. It
      // happens outside the state updater on purpose — an updater may be
      // called more than once for a single update, and draining inside it
      // billed the version $0 on the second call.
      const costUsd = pendingVersionCostRef.current[activeCut.id] ?? 0;
      pendingVersionCostRef.current[activeCut.id] = 0;
      const version: CutVersion = {
        id: `version-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: Date.now(),
        label,
        shotCount: activeCut.shots.length,
        fingerprint,
        shots: activeCut.shots.map((shot) => ({...shot})),
        costUsd: costUsd > 0 ? costUsd : undefined,
      };
      setCutHistories((current) => ({
        ...current,
        [activeCut.id]: [...(current[activeCut.id] ?? []), version].slice(-MAX_CUT_VERSIONS),
      }));
    }, VERSION_SNAPSHOT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [activeCut.id, activeCut.shots, busy, quickFixBusy]);

  const restoreCutVersion = useCallback(
    (version: CutVersion) => {
      restoreGuardRef.current = true;
      lastActionRef.current = null;
      updateCut(activeCut.id, (cut) => ({
        ...cut,
        shots: resequence(version.shots.map((shot) => ({...shot}))),
      }));
      setSelectedShotId(version.shots[0]?.id ?? null);
      setStatus(`Restored ${version.label.toLowerCase()} version · ${version.shotCount} scenes`);
      appendLog('success', `Restored version from ${formatVersionTime(version.createdAt)}`, undefined, activeCut.id);
      window.setTimeout(() => {
        restoreGuardRef.current = false;
      }, VERSION_SNAPSHOT_DELAY_MS + 500);
    },
    [activeCut.id, appendLog, updateCut],
  );

  const deleteCutVersion = useCallback((cutId: string, versionId: string) => {
    setCutHistories((current) => {
      const existing = current[cutId] ?? [];
      const next = existing.filter((version) => version.id !== versionId);
      if (next.length === existing.length) return current;
      if (!next.length) {
        const {[cutId]: _removed, ...rest} = current;
        return rest;
      }
      return {...current, [cutId]: next};
    });
  }, []);

  const clearCutVersions = useCallback((cutId: string) => {
    setCutHistories((current) => {
      if (!current[cutId]) return current;
      const {[cutId]: _removed, ...rest} = current;
      return rest;
    });
  }, []);

  /* ───────────────────────── beats ───────────────────────── */

  const splitBeats = useCallback(
    (cut: Cut) => {
      const beats = parseTranscript(cut.transcript, {wpm: cut.wpm});
      updateCut(cut.id, (current) => ({...current, beats}));
      return beats;
    },
    [updateCut],
  );

  /* ───────────────────────── planning ───────────────────────── */

  const requestScriptPlan = async (cut: Cut) => {
    const script = cleanTranscript(cut.transcript);
    const beats = parseTranscript(script, {wpm: cut.wpm});
    if (!script || !beats.length) throw new Error('That transcript did not split into any beats.');
    const plannerModel = settings.selectedModel;
    if (!hasKeyForModel(settings, plannerModel)) {
      onOpenSettings();
      throw new Error('Add a key for the selected planning model in Settings.');
    }
    const {shots, cost} = await planScriptShotList({
      settings,
      model: plannerModel,
      script,
      styleNote: cut.styleNote,
      style: cut.style,
      mode: cut.mode,
    });
    recordCutSpend(cut.id, plannerModel, cost);
    return {script, beats, plans: shots};
  };

  const planCut = async () => {
    const cut = cutRef.current;
    setError(null);
    if (!cut.transcript.trim()) {
      setError('Paste the transcript first.');
      return;
    }
    setBusy('planning');
    setActiveWorkflowStep('plan');
    setStatus('Planning scene boundaries from the script');
    appendLog('info', 'Planning visual boundaries from the pasted script', undefined, cut.id);
    try {
      const {beats, plans} = await requestScriptPlan(cut);
      const shots = buildScriptShots(cut, plans, {beats});
      updateCut(cut.id, (current) => ({
        ...current,
        transcript: cleanTranscript(current.transcript),
        beats,
        shots: resequence(shots),
        voiceover: undefined,
      }));
      setSelectedShotId(shots[0]?.id ?? null);
      setStatus(`${shots.length} script scenes planned · voice them to lock timing`);
      appendLog('success', `Planned ${shots.length} script scenes`, undefined, cut.id);
      return shots;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'The script could not be planned.';
      setError(message);
      appendLog('error', `Planning failed: ${message}`, undefined, cut.id);
      setStatus(null);
      return null;
    } finally {
      setBusy('idle');
      setActiveWorkflowStep('idle');
    }
  };

  /* ───────────────────────── generation ───────────────────────── */

  /**
   * One shot's scene. Returns the source, or throws with the last error after
   * its retry. The duration is never taken from the model: on a timeline the
   * narration decides how long a shot holds.
   */
  const generateOne = async (cut: Cut, shot: CutShot, previousCode?: string) => {
    // A photograph, when this shot is one of the few that earns one. The
    // budget is spent in shot order and never on two shots in a row: the
    // point of a real image is that it interrupts the drawn register, and an
    // interruption every shot is just a slideshow.
    let photo: ShotPhoto | null = null;
    const shotIndex = cut.shots.findIndex((candidate) => candidate.id === shot.id);
    const spent = cut.shots.filter((candidate) => candidate.photo).length;
    const previousShot = shotIndex > 0 ? cut.shots[shotIndex - 1] : undefined;
    const nextShot = shotIndex >= 0 ? cut.shots[shotIndex + 1] : undefined;
    const photoAllowed =
      Boolean(settings.serperApiKey.trim() && settings.googleApiKey.trim()) &&
      spent < photoBudget(cut.shots.length) &&
      !previousShot?.photo &&
      !nextShot?.photo;
    if (photoAllowed) {
      try {
        photo = await resolveShotPhoto({
          serperApiKey: settings.serperApiKey,
          googleApiKey: settings.googleApiKey,
          narration: shot.narration,
          brief: shot.brief,
          onNote: (message) => appendLog('info', message, shot.id, cut.id),
        });
      } catch (caught) {
        // A photo is an enhancement. Losing one never fails a shot.
        const detail = caught instanceof Error ? caught.message : 'The photo lookup failed.';
        appendLog('info', `Photo skipped: ${detail}`, shot.id, cut.id);
      }
      if (photo) {
        const resolved = photo;
        updateShot(cut.id, shot.id, (current) => ({...current, photo: resolved}));
      }
    }
    let giphyAssets: GiphyAsset[] = [];
    if (cut.style !== 'dev' && settings.giphyApiKey.trim()) {
      try {
        // Every shot in a cut sees the same deterministic slice, so a
        // continuous scene can safely retain a verified insert across a join.
        giphyAssets = await currentTrendingGiphyAssets(settings.giphyApiKey, cut.id);
      } catch (caught) {
        if (!giphyWarningRef.current) {
          giphyWarningRef.current = true;
          const detail = caught instanceof Error ? caught.message : 'GIPHY Trending was unavailable.';
          appendLog('info', `GIPHY skipped: ${detail}`, shot.id, cut.id);
        }
      }
    }
    const instruction = cutInstruction({
      narration: shot.narration,
      brief: shot.brief,
      styleNote: cut.styleNote,
      background: shot.background,
      durationInFrames: shot.durationInFrames,
      // The shot's beats give the model the narration's timing inside the
      // shot, so reveals can land on the words that describe them.
      beats: beatsForShot(cut.beats, shot),
      wordTimings: shot.audio?.words,
      style: cut.style,
      // A grouped shot continues the previous shot's composition: the model
      // gets it as CURRENT SCENE and must evolve it, never start fresh.
      previousCode,
      giphyAssets,
      photo,
    });

    let repairError: string | undefined;
    let lastError = 'The shot could not be generated.';
    // A scene that renders but breaks a style rule is kept, not thrown away:
    // advisories used to be rejections, which burned the repair budget and
    // failed the shot over a preference. It gets ONE correction round with
    // the advisories handed back, and whichever version comes out is used.
    let renderable: {code: string; cost: number | null} | null = null;
    let spentOnPolish = 0;
    let polishRounds = 0;
    // The correction round gets the scene it is correcting, so it edits that
    // source instead of generating a different graphic from the brief again.
    let polishFrom: string | undefined;

    for (let attempt = 0; attempt < MAX_SHOT_ATTEMPTS; attempt += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const reply = await requestScene({
          settings,
          model: settings.selectedModel,
          instruction,
          currentCode: polishFrom ?? previousCode,
          // Continuation shots need the complete evolved scene, not a patch.
          forceFullRewrite: Boolean(polishFrom || previousCode),
          repairError,
          history: [],
          images: [],
          houseStyle: 'cut',
        });
        const {issues, notes} = validateSceneSource({code: reply.code, instruction, history: []});
        if (issues.length) throw new Error(formatValidationError(issues));
        compileScene(reply.code);
        const cost = (reply.cost ?? 0) + spentOnPolish;
        if (!notes.length || polishRounds >= 1) return {code: reply.code, cost};
        // Keep this one in hand, then ask for the same scene without the
        // violations. If the correction fails or is worse, this is returned.
        renderable = {code: reply.code, cost};
        spentOnPolish = cost;
        polishRounds += 1;
        polishFrom = reply.code;
        for (const note of notes) appendLog('info', `Style: ${note}`, shot.id, cut.id);
        repairError = `The scene renders, but it breaks these rules of the style:\n${notes
          .map((note) => `- ${note}`)
          .join('\n')}\n\nReturn the same scene with exactly these fixed. Change nothing else, and keep every element the brief asked for.`;
      } catch (caught) {
        lastError = caught instanceof Error ? caught.message : String(caught);
        repairError = lastError;
      }
    }
    if (renderable) return renderable;
    throw new Error(lastError);
  };

  const runGeneration = async (
    shotIds: string[],
    seed?: CutShot[],
    options?: {quiet?: boolean; cutId?: string},
  ) => {
    if (!hasKeyForModel(settings, settings.selectedModel)) {
      onOpenSettings();
      return;
    }
    const cutId = options?.cutId ?? cutRef.current.id;
    const targetCut = cutsRef.current.find((c) => c.id === cutId) ?? cutRef.current;
    // A Confirm pass can start in the same tick that planning/voiceover
    // updates state. Let the freshly timed seed win over the still-stale
    // cutRef copy; the old order silently replaced it and tripped the
    // measured-word-cues gate with every shot appearing unvoiced.
    const sourceShots = [...targetCut.shots, ...(seed ?? [])];
    const byId = new Map(sourceShots.map((shot) => [shot.id, shot]));
    const unaligned = shotIds.filter((id) => {
      const shot = byId.get(id);
      return Boolean(shot?.narration.trim() && !shot.audio?.words?.length);
    });
    if (unaligned.length) {
      const message = `Voice-align ${unaligned.length} shot${unaligned.length === 1 ? '' : 's'} before building. Animation timing requires measured word cues.`;
      setCutError(cutId, message);
      setCutStatus(cutId, message);
      return unaligned.length;
    }
    resetCancel(cutId);
    lastActionRef.current = shotIds.length > 1 ? 'Build' : 'Regenerate';

    // Register active generating shots for concurrent tracking
    for (const id of shotIds) {
      activeGeneratingShotsRef.current.add(id);
    }
    setGeneratingShotIds(Array.from(activeGeneratingShotsRef.current));

    if (!options?.quiet) {
      setCutBusy(cutId, 'generating');
      setCutWorkflowStep(cutId, 'build');
      setCutError(cutId, null);
    }

    let failures = 0;
    let finished = 0;
    // Group the shot ids: shots sharing a group render one continuous scene,
    // so they generate one after another — each continuing the previous shot's
    // composition. Groups themselves run in parallel.
    const groups: string[][] = [];
    let currentGroup: string[] = [];
    let currentGroupKey: string | undefined;
    for (const shotId of shotIds) {
      const key = String(byId.get(shotId)?.group ?? shotId);
      if (currentGroup.length && key !== currentGroupKey) {
        groups.push(currentGroup);
        currentGroup = [];
      }
      currentGroup.push(shotId);
      currentGroupKey = key;
    }
    if (currentGroup.length) groups.push(currentGroup);

    const generatedCodes = new Map<string, string>();
    let groupCursor = 0;

    const worker = async () => {
      while (!isCancelled(cutId)) {
        const groupIndex = groupCursor;
        groupCursor += 1;
        if (groupIndex >= groups.length) return;

        // Inside a group the shots are sequential, so each one can build on
        // the composition the one before it produced.
        let previousCode: string | undefined;
        for (const shotId of groups[groupIndex]) {
          if (isCancelled(cutId)) break;

          const cut = cutsRef.current.find((c) => c.id === cutId) ?? cutRef.current;
          // `seed` covers the one case the lookup cannot: a run started in the
          // same tick as the plan that created these shots, before React has
          // re-rendered and refreshed cutRef.
          const shot =
            seed?.find((candidate) => candidate.id === shotId) ??
            cut.shots.find((candidate) => candidate.id === shotId);
          if (!shot) continue;

          // A freshly planned script can arrive before React publishes its new
          // beat array. Recreate the deterministic text beats for the prompt
          // instead of giving the scene generator stale or empty anchors.
          const generationCut =
            seed?.some((candidate) => candidate.scriptWordStart !== undefined)
              ? {...cut, beats: parseTranscript(cut.transcript, {wpm: cut.wpm})}
              : cut;

          updateShot(cutId, shot.id, (current) => ({
            ...current,
            status: 'generating',
            error: undefined,
          }));
          appendLog('info', `Building shot ${finished + 1} of ${shotIds.length}`, shot.id, cutId);

          try {
            // eslint-disable-next-line no-await-in-loop
            const {code, cost} = await generateOne(generationCut, shot, previousCode);
            generatedCodes.set(shotId, code);
            previousCode = code;
            recordCutSpend(cutId, settings.selectedModel, cost);
            updateShot(cutId, shot.id, (current) => ({
              ...current,
              code,
              status: 'ready',
              error: undefined,
              fallbackReason: undefined,
              model: settings.selectedModel,
              costUsd: cost ?? undefined,
            }));
            appendLog('success', `Built shot ${finished + 1} of ${shotIds.length}`, shot.id, cutId);
          } catch (caught) {
            failures += 1;
            const reason =
              caught instanceof Error ? caught.message : 'The shot could not be generated.';
            // The cut is a video, so a shot that could not be generated still
            // gets a real scene rather than an error card in the middle of the
            // edit. The failure is recorded on the shot for the inspector.
            updateShot(cutId, shot.id, (current) => ({
              ...current,
              code: fallbackScene({
                narration: current.narration,
                brief: current.brief,
                palette: paletteFor(cut.style),
              }),
              status: 'ready',
              error: undefined,
              fallbackReason: reason,
              model: settings.selectedModel,
            }));
            previousCode = undefined;
            appendLog('error', `Shot ${finished + 1} used fallback: ${reason}`, shot.id, cutId);
          } finally {
            activeGeneratingShotsRef.current.delete(shot.id);
            setGeneratingShotIds(Array.from(activeGeneratingShotsRef.current));
          }

          finished += 1;
          if (options?.quiet) {
            setCutProgress(cutId, (current) => (current ? {...current, built: current.built + 1} : current));
          } else {
            setCutStatus(cutId, `Built ${finished} of ${shotIds.length} shots`);
          }
        }
      }
    };

    await Promise.all(
      Array.from(
        {length: Math.min(SHOT_CONCURRENCY_FOR(providerForModel(settings.selectedModel)), groups.length)},
        worker,
      ),
    );

    // Clean up any remaining shotIds
    for (const id of shotIds) {
      activeGeneratingShotsRef.current.delete(id);
    }
    setGeneratingShotIds(Array.from(activeGeneratingShotsRef.current));

    if (!options?.quiet) {
      if (activeGeneratingShotsRef.current.size === 0) {
        setCutBusy(cutId, 'idle');
        setCutWorkflowStep(cutId, 'idle');
        setCutStatus(
          cutId,
          isCancelled(cutId)
            ? 'Stopped'
            : failures
              ? `Done — ${failures} shot${failures === 1 ? '' : 's'} fell back to a plain card`
              : 'Cut complete',
        );
      } else {
        setCutStatus(cutId, `${activeGeneratingShotsRef.current.size} shot${activeGeneratingShotsRef.current.size === 1 ? '' : 's'} generating…`);
      }
    }
    appendLog(
      failures ? 'error' : 'success',
      isCancelled(cutId)
        ? `Build stopped after ${finished} of ${shotIds.length} shots`
        : failures
          ? `Build finished with ${failures} fallback${failures === 1 ? '' : 's'}`
          : `Built all ${finished} shots`,
      undefined,
      cutId,
    );
    return failures;
  };

  const generateAll = () =>
    runGeneration(
      cutRef.current.shots
        .filter((shot) => shot.status !== 'ready' || !shot.code)
        .map((shot) => shot.id),
    );

  /**
   * Cheap-model fix for one shot: the user's typed change is sent with the
   * shot's source to the free Gemini 3.1 Flash Lite model, which applies
   * surgical FIND/REPLACE edits. The main generation model is never touched.
   */
  const quickFixShot = async (
    shotId: string,
    instruction: string,
    images: Attachment[] = [],
  ) => {
    if (isBusy || quickFixBusy) return;
    const trimmed = instruction.trim();
    if (!trimmed) return;
    if (!hasKeyForModel(settings, QUICK_FIX_MODEL)) {
      onOpenSettings();
      return;
    }
    const cut = cutRef.current;
    const shot = cut.shots.find((candidate) => candidate.id === shotId);
    if (!shot?.code) return;
    lastActionRef.current = 'Fix';
    setQuickFixBusy(true);
    setQuickFixReply(null);
    setStatus('Applying the change…');
    try {
      // The cheap model can mis-copy a FIND block; retrying with the patch
      // error handed back (as the studio does) recovers most misses. A
      // "no edits" reply or a missing key is not retried.
      let repairError: string | undefined;
      let reply: Awaited<ReturnType<typeof requestScene>> | null = null;
      let lastFixError = 'The change could not be applied.';
      for (let attempt = 0; attempt < 3 && !reply; attempt += 1) {
        try {
          const candidate = await requestScene({
            settings,
            model: QUICK_FIX_MODEL,
            instruction: trimmed,
            currentCode: shot.code,
            currentDurationInFrames: shot.durationInFrames,
            repairError,
            history: [],
            images,
          });
          const {issues} = validateSceneSource({
            code: candidate.code,
            instruction: trimmed,
            history: [],
          });
          if (issues.length) throw new Error(formatValidationError(issues));
          compileScene(candidate.code);
          reply = candidate;
        } catch (caught) {
          if (caught instanceof InvalidSceneReplyError || caught instanceof MissingKeyError) {
            throw caught;
          }
          lastFixError = caught instanceof Error ? caught.message : String(caught);
          repairError = lastFixError;
        }
      }
      if (!reply) throw new Error(lastFixError);
      updateShot(cut.id, shotId, (current) => ({
        ...current,
        code: reply.code,
        status: 'ready',
        error: undefined,
      }));
      recordCutSpend(cut.id, QUICK_FIX_MODEL, reply.cost);
      const changed = reply.code.trim() !== shot.code.trim();
      const summary = changed
        ? `Change applied — ${reply.editCount ?? 0} edit${(reply.editCount ?? 0) === 1 ? '' : 's'}. ${
            reply.message.trim() || ''
          }`.trim()
        : 'The reply applied no changes — the scene is identical.';
      setQuickFixReply(summary);
      appendLog('success', `Fix: ${summary}`, shotId, cut.id);
      setStatus(changed ? 'Change applied' : 'No changes applied');
    } catch (caught) {
      // The model returned no edits: show its reply instead of failing
      // silently, and leave the scene untouched.
      if (caught instanceof InvalidSceneReplyError) {
        const raw = caught.rawReply.trim().slice(0, 700);
        const summary = raw
          ? `The model returned no edits — nothing changed.\n\n${raw}`
          : 'The model returned no edits — nothing changed.';
        setQuickFixReply(summary);
        appendLog('info', 'Fix: no edits returned (model found nothing to change)', shotId, cut.id);
        setStatus('No changes applied');
        return;
      }
      const message =
        caught instanceof Error ? caught.message : 'The quick fix could not be applied.';
      setError(message);
      setQuickFixReply(`Fix failed:\n${message}`);
      appendLog('error', `Quick fix failed: ${message}`, shotId, cut.id);
    } finally {
      setQuickFixBusy(false);
    }
  };

  /* ───────────────────────── render ───────────────────────── */

  /** Render the whole cut at 1080p60 in the browser, including voiceover. */
  const renderCut = async () => {
    if (isBusy || renderingCutId) return;
    // Pinned to the cut the click came from: the active cut can change while
    // the render runs, and the file belongs to the cut that produced it.
    const cut = cutRef.current;
    if (!cut.shots.length) {
      setError('Plan the cut first — there is nothing to render yet.');
      return;
    }
    const signature = cutRenderSignature(cut);
    const fileName = `${
      cut.name.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'cut'
    }.mp4`;
    setRenderingCutId(cut.id);
    setRenderResults((current) => {
      if (!current[cut.id]) return current;
      releaseRenderedFile(current[cut.id]);
      const {[cut.id]: _replaced, ...rest} = current;
      return rest;
    });
    setStatus('Rendering at 1080p 60fps…');
    try {
      const result = await runRenderWithLogs(
        {
          kind: 'cut',
          shots: cut.shots,
          style: cut.style,
          voiceover: cut.voiceover,
          durationInFrames: cutDurationInFrames(cut.shots),
        },
        (progress) =>
          setRenderLogs((current) => ({
            ...current,
            [cut.id]: {...progress, logs: [...progress.logs]},
          })),
      );
      if (result.status === 'error') {
        throw new Error(result.error ?? 'The render failed.');
      }
      if (!result.url) {
        throw new Error('The render finished without producing a file.');
      }
      setRenderResults((current) => ({
        ...current,
        [cut.id]: {url: result.url as string, fileName, signature},
      }));
      downloadRenderedFile(result.url, fileName);
      const seconds = Math.round((result.renderedInMs ?? 0) / 1000);
      appendLog('success', `Render ready · ${seconds}s at 1080p 60fps`, undefined, cut.id);
      setStatus(`Render ready (${seconds}s)`);
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : 'The render failed.';
      setError(message);
      appendLog('error', `Render failed: ${message}`, undefined, cut.id);
    } finally {
      setRenderingCutId((current) => (current === cut.id ? null : current));
    }
  };

  /* ───────────────────────── voiceover ───────────────────────── */

  /**
   * Voice the cleaned pasted script exactly once. Scene boundaries are not
   * involved in this request: Cartesia returns one file and one global word
   * map, which becomes the timing source for the subsequent text segmentation.
   */
  const voiceScript = async (options?: {quiet?: boolean; cutId?: string}): Promise<SpokenLine | null> => {
    const cutId = options?.cutId ?? cutRef.current.id;
    const cut = cutsRef.current.find((c) => c.id === cutId) ?? cutRef.current;
    const script = cleanTranscript(cut.transcript);
    if (!script) {
      setCutError(cutId, 'Paste the transcript first.');
      return null;
    }
    if (!settings.cartesiaApiKey.trim()) {
      setCutError(cutId, 'Add a Cartesia API key in Settings to generate voiceover.');
      onOpenSettings();
      return null;
    }

    const scriptKey = JSON.stringify({
      script,
      voice: cut.voice.voice,
      rate: cut.voice.rate,
    });

    resetCancel(cutId);
    if (!options?.quiet) {
      setCutBusy(cutId, 'voicing');
      setCutWorkflowStep(cutId, 'voice');
      setCutError(cutId, null);
    }
    appendLog(
      'info',
      `Voicing the pasted script once · ${scriptWords(script).length} words`,
      undefined,
      cutId,
    );
    try {
      const speechParts = splitScriptForSpeech(script);
      const whole =
        speechParts.length === 1
          ? await speak({
              text: script,
              voice: cut.voice.voice,
              rate: cut.voice.rate,
              cartesiaApiKey: settings.cartesiaApiKey,
            })
          : await (async () => {
              const joined = await speakVoiceover({
                parts: speechParts.map((text) => ({
                  text,
                  voice: cut.voice.voice,
                  rate: cut.voice.rate,
                })),
                voice: cut.voice.voice,
                rate: cut.voice.rate,
                // This is only a bridge between provider requests; the script
                // planner still owns every visual boundary.
                tailSeconds: 0.12,
                cartesiaApiKey: settings.cartesiaApiKey,
              });
              const words: NonNullable<SpokenLine['words']> = [];
              let offset = 0;
              speechParts.forEach((_part, index) => {
                for (const word of joined.partWords[index] ?? []) {
                  words.push({
                    ...word,
                    start: word.start + offset,
                    end: word.end + offset,
                  });
                }
                offset += joined.partDurations[index] ?? 0;
              });
              return {
                file: joined.file,
                durationSeconds: joined.durationSeconds,
                engine: joined.engine,
                voice: joined.voice,
                rate: joined.rate,
                cached: joined.cached,
                words,
              } satisfies SpokenLine;
            })();
      if (isCancelled(cutId)) return null;
      if (!whole.words?.length) {
        throw new Error('Cartesia returned audio without global word timestamps. Retry voiceover.');
      }
      // Fail before planning/building if the provider's transcript does not
      // correspond closely enough to the pasted script to anchor scenes.
      alignScriptWords(script, whole.words);
      const line: SpokenLine = {
        ...whole,
        durationIncludesTail: true,
        sourceText: script,
        words: whole.words,
      };

      // Do not let a response for an older paste overwrite a newer document.
      // The textarea also flips cancelRef, but this identity check protects
      // programmatic updates and cut switches too.
      const latestCut = cutsRef.current.find((candidate) => candidate.id === cutId);
      if (!latestCut || cleanTranscript(latestCut.transcript) !== script) {
        triggerCancel(cutId);
        throw new Error('The script changed while voiceover was generating. Build the new script again.');
      }

      updateCut(cutId, (current) => ({
        ...current,
        transcript: script,
        // A different voice/rate produces a different source file. Retain
        // the briefs and generated code for a possible retry, but remove old
        // audio windows so a failed planner can never play them against the
        // new track.
        shots: current.shots.map((shot) =>
          shot.audio && shot.audio.file !== line.file
            ? {
                ...shot,
                audio: undefined,
                sourceStartSeconds: undefined,
                sourceEndSeconds: undefined,
              }
            : shot,
        ),
        voiceover: {
          file: line.file,
          durationSeconds: line.durationSeconds,
          partDurations: [line.durationSeconds],
          scriptKey,
        },
      }));
      if (!options?.quiet) {
        setCutStatus(cutId, `Voiceover ready · ${line.durationSeconds.toFixed(1)}s · script aligned`);
      }
      appendLog(
        'success',
        `Script voiceover ready · ${line.durationSeconds.toFixed(1)}s · one continuous track${line.cached ? ' · cached' : ''}`,
        undefined,
        cutId,
      );
      return line;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'The voiceover failed.';
      setCutError(cutId, message);
      if (!options?.quiet) setCutStatus(cutId, message);
      appendLog('error', `Voiceover failed: ${message}`, undefined, cutId);
      return null;
    } finally {
      if (!options?.quiet) {
        setCutBusy(cutId, 'idle');
        setCutWorkflowStep(cutId, 'idle');
      }
    }
  };

  /** Voice the full script, then remap the existing text scenes onto it. */
  const voiceCut = async (): Promise<VoicePassResult | null> => {
    const whole = await voiceScript();
    if (!whole || cancelRef.current) return null;
    const cut = cutRef.current;
    try {
      const script = cleanTranscript(cut.transcript);
      if (script !== cleanTranscript(whole.sourceText ?? '')) {
        throw new Error('The script changed while voiceover was generating. Build the new script again.');
      }
      const beats = parseTranscript(script, {wpm: cut.wpm});
      const spans = spansForExistingShots(script, cut.shots);
      const plans: ScriptShotPlan[] = spans.map((span, index) => {
        const source = cut.shots[index];
        return {
          wordStart: span.wordStart,
          wordEnd: span.wordEnd,
          brief: source?.brief || 'A clear visual for this passage, kept simple and centred.',
          background: source?.background.mode === 'transparent' ? 'transparent' : 'solid',
          group: source?.group,
          transitionBefore: source?.transitionBefore,
        };
      });
      const retimed = buildScriptShots(cut, plans, {whole, beats});
      const reusedSourceIds = new Set<string>();
      const preserved = retimed.map((shot) => {
        const sourceIndex = spans.findIndex(
          (span) =>
            (shot.scriptWordStart ?? 0) >= span.wordStart &&
            (shot.scriptWordStart ?? 0) < span.wordEnd,
        );
        const source = sourceIndex >= 0 ? cut.shots[sourceIndex] : undefined;
        const canReuseId = Boolean(source && !reusedSourceIds.has(source.id));
        if (source && canReuseId) reusedSourceIds.add(source.id);
        return {
          ...shot,
          id: canReuseId && source ? source.id : shot.id,
          code: source?.code ?? '',
          status: source?.code ? source.status : ('planned' as const),
          model: source?.model,
          costUsd: source?.costUsd,
          fallbackReason: source?.fallbackReason,
        };
      });
      const completed = new Map<string, SpokenLine>();
      preserved.forEach((shot) => {
        if (shot.audio) completed.set(shot.id, shot.audio);
      });
      updateCut(cut.id, (current) => ({
        ...current,
        transcript: script,
        beats,
        voiceover: {
          file: whole.file,
          durationSeconds: whole.durationSeconds,
          partDurations: [whole.durationSeconds],
          scriptKey: JSON.stringify({script, voice: cut.voice.voice, rate: cut.voice.rate}),
        },
        shots: resequence(preserved),
      }));
      setStatus(`Voiceover aligned to ${preserved.length} script scenes`);
      return {failures: 0, completed};
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'The voiceover could not be mapped to the scenes.';
      setError(message);
      setStatus(message);
      appendLog('error', `Voice alignment failed: ${message}`, undefined, cut.id);
      return {failures: 1, completed: new Map()};
    }
  };

  /* ───────────────────────── the one button ───────────────────────── */

  /**
   * Transcript in, finished cut out.
   *
   * The three passes were always meant to run together — planning without
   * building leaves an empty timeline, and building without voicing leaves
   * every shot on an estimated length. They stay separately callable for
   * re-running one pass, but this is the path the page is built around.
   *
   * Voice now runs first. Cartesia emits the PCM and word timestamps together,
   * and those measured cues are passed into scene generation. Building in
   * parallel used to make every reveal depend on a WPM estimate.
   *
   * Nothing here throws a cut away: a shot that cannot be generated falls
   * back to a plain card. Missing native timestamps stop generation because
   * an estimated build would violate the timing contract.
   */
  const confirmCut = async () => {
    if (!settings.cartesiaApiKey.trim()) {
      setError('Add a Cartesia API key in Settings to generate voiceover.');
      onOpenSettings();
      return;
    }
    const cutId = cutRef.current.id;
    const cut = cutsRef.current.find((c) => c.id === cutId) ?? cutRef.current;
    if (!cut.transcript.trim()) {
      setCutError(cutId, 'Paste the transcript first.');
      return;
    }
    if (!hasKeyForModel(settings, settings.selectedModel)) {
      onOpenSettings();
      return;
    }

    // The order is intentional: one full script track, then language-only
    // boundaries, then visual generation with each scene's measured word map.
    resetCancel(cutId);
    setCutError(cutId, null);
    setCutBusy(cutId, 'generating-voicing');
    setCutWorkflowStep(cutId, 'voice');
    setCutProgress(cutId, {built: 0, voiced: 0, total: 1});
    try {
      const whole = await voiceScript({quiet: true, cutId});
      if (!whole || isCancelled(cutId)) {
        setCutStatus(cutId, 'Stopped before build · voiceover was not ready');
        return;
      }

      setCutWorkflowStep(cutId, 'plan');
      setCutProgress(cutId, {built: 0, voiced: 1, total: 1});
      const cutToPlan = cutsRef.current.find((c) => c.id === cutId) ?? cut;
      const {script, beats, plans} = await requestScriptPlan(cutToPlan);
      if (isCancelled(cutId)) {
        setCutStatus(cutId, 'Stopped');
        return;
      }
      if (!plans.length) throw new Error('The script planner returned no visual scenes.');
      const timedPlanned = buildScriptShots(cutToPlan, plans, {whole, beats});
      if (!timedPlanned.length) throw new Error('The script planner returned no usable scenes.');
      const latestCut = cutsRef.current.find((candidate) => candidate.id === cutId);
      if (!latestCut || cleanTranscript(latestCut.transcript) !== script) {
        triggerCancel(cutId);
        throw new Error('The script changed while scenes were being planned. Build the new script again.');
      }
      updateCut(cutId, (current) => ({
        ...current,
        transcript: script,
        beats,
        voiceover: {
          file: whole.file,
          durationSeconds: whole.durationSeconds,
          partDurations: [whole.durationSeconds],
          scriptKey: JSON.stringify({script, voice: cutToPlan.voice.voice, rate: cutToPlan.voice.rate}),
        },
        shots: resequence(timedPlanned),
      }));
      if (cutRef.current.id === cutId) {
        setSelectedShotId(timedPlanned[0]?.id ?? null);
      }
      setCutProgress(cutId, {built: 0, voiced: timedPlanned.length, total: timedPlanned.length});
      setCutStatus(cutId, `Voiceover aligned · ${timedPlanned.length} script scenes · building visuals`);
      setCutWorkflowStep(cutId, 'build');
      const failures = await runGeneration(
        timedPlanned.map((shot) => shot.id),
        timedPlanned,
        {quiet: true, cutId},
      );

      setCutStatus(
        cutId,
        isCancelled(cutId)
          ? 'Stopped'
          : failures
              ? `Cut ready — ${failures} shot${failures === 1 ? '' : 's'} fell back to a plain card`
              : 'Cut ready',
      );
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'The cut could not be built.';
      setCutError(cutId, message);
      setCutStatus(cutId, `Build stopped · ${message}`);
      appendLog('error', `Build failed: ${message}`, undefined, cutId);
    } finally {
      setCutBusy(cutId, 'idle');
      setCutWorkflowStep(cutId, 'idle');
      setCutProgress(cutId, null);
    }
  };

  /* ───────────────────────── playhead ───────────────────────── */

  const handleFrameChange = useCallback(
    (frame: number) => {
      setPlayheadFrame(frame);
      // Follow the playhead with the selection so the inspector always shows
      // the shot on screen, unless a generation is mid-flight and would make
      // the panel jump under the user's hands.
      const shot = shotAtFrame(cutRef.current.shots, frame);
      if (shot) setSelectedShotId((current) => (current === shot.id ? current : shot.id));
    },
    [],
  );

  const seekTo = useCallback((frame: number) => {
    setPlayheadFrame(frame);
    setSeekSignal({frame, token: Date.now()});
  }, []);

  const selectTimelineShot = useCallback(
    (shotId: string) => {
      setSelectedShotId(shotId);
      const shot = cutRef.current.shots.find((candidate) => candidate.id === shotId);
      if (shot) seekTo(shot.startFrame);
    },
    [seekTo],
  );

  const resizeTimelineShot = useCallback(
    (shotId: string, durationInFrames: number) =>
      updateShot(cutRef.current.id, shotId, (shot) =>
        shot.audio?.durationIncludesTail
          ? shot
          : {...shot, durationInFrames: Math.min(MAX_SHOT_FRAMES, durationInFrames)},
      ),
    [updateShot],
  );

  const isBusy = busy !== 'idle';
  /**
   * A scene that crashes at runtime is flawed code: regenerate it once as the
   * fallback. If the replacement still crashes, the shot is marked red on the
   * timeline instead of pretending it is ready.
   */
  const handleShotCrash = useCallback(
    (shotId: string, message: string) => {
      const cut = cutRef.current;
      if (!cut.shots.some((shot) => shot.id === shotId)) return;
      if (isBusy) return;
      if (handledCrashesRef.current.has(shotId)) {
        updateShot(cut.id, shotId, (current) => ({
          ...current,
          status: 'error',
          error: message,
        }));
        appendLog('error', `Shot failed at runtime: ${message}`, shotId, cut.id);
        return;
      }
      handledCrashesRef.current.add(shotId);
      appendLog('info', 'Shot crashed at runtime — regenerating once', shotId, cut.id);
      void runGeneration([shotId]);
    },
    [appendLog, isBusy, runGeneration, updateShot],
  );
  crashHandlerRef.current = handleShotCrash;
  const phaseLabel =
    busy === 'planning'
      ? 'Planning'
      : busy === 'generating'
        ? 'Building'
        : busy === 'voicing'
          ? 'Voicing'
          : busy === 'generating-voicing'
            ? 'Building + voicing'
            : 'Working';
  const beatCount = activeCut.beats.length;

  /* ─────────────── this cut's render, and only this cut's ─────────────── */
  const {
    isRendering: isRenderingActiveCut,
    download: activeRenderDownload,
    log: activeRenderLog,
  } = renderButtonState({
    id: activeCut.id,
    signature: cutRenderSignature(activeCut),
    renderingProjectId: renderingCutId,
    result: renderResults[activeCut.id],
    log: renderLogs[activeCut.id],
  });
  const downloadActiveRender = () => {
    if (activeRenderDownload) {
      downloadRenderedFile(activeRenderDownload.url, activeRenderDownload.fileName);
    }
  };
  const dismissRenderLog = (cutId: string) =>
    setRenderLogs((current) => {
      if (!current[cutId]) return current;
      const {[cutId]: _dismissed, ...rest} = current;
      return rest;
    });

  /**
   * One-click style switch. Keeps the plan, the briefs, the narration, and
   * the voiceover: scenes referencing `palette.*` recolour instantly because
   * the host recompiles them against the new palette, and default grounds
   * follow the style. Custom background colours are left alone.
   */
  const setCutStyle = (next: CutStyle) => {
    const groundFor = (style: CutStyle) =>
      style === 'dark'
        ? DEFAULT_GROUND_DARK
        : style === 'dev'
          ? DEFAULT_GROUND_DEV
          : style === 'signal'
            ? DEFAULT_GROUND_SIGNAL
            : DEFAULT_GROUND;
    updateCut(activeCut.id, (cut) => ({
      ...cut,
      style: next,
      shots: cut.shots.map((shot) => {
        if (shot.background.mode !== 'solid') return shot;
        const {color} = shot.background;
        const isDefault =
          color === DEFAULT_GROUND ||
          color === DEFAULT_GROUND_DARK ||
          color === DEFAULT_GROUND_DEV ||
          color.toLowerCase() === '#0d1117' ||
          color === DEFAULT_GROUND_SIGNAL ||
          // Older signal grounds, kept so saved cuts still recolour when the
          // style changes.
          color === '#0d0a20' ||
          color === '#130f2e' ||
          color === '#201c35' ||
          color === '#08090c' ||
          color === '#050911';
        return isDefault
          ? {...shot, background: {...shot.background, color: groundFor(next)}}
          : shot;
      }),
    }));
  };

  /** Workflow passes shown on hover when scenes are generating */
  const workflowItems = useMemo(() => {
    const isVoicingActive = activeWorkflowStep === 'voice';
    const isPlanningActive = activeWorkflowStep === 'plan';
    const isBuildingActive = activeWorkflowStep === 'build';
    const isBusyGenerating = isVoicingActive || isPlanningActive || isBuildingActive;

    const voiceDone = isBusyGenerating
      ? isPlanningActive || isBuildingActive
      : hasShots && Boolean(activeCut.voiceover || activeCut.shots.every((s) => s.audio?.words?.length));

    const planDone = isBusyGenerating
      ? isBuildingActive
      : hasShots;

    const buildDone = isBusyGenerating
      ? false
      : hasShots && activeCut.shots.every((shot) => shot.code);

    return [
      {
        key: 'voice',
        label: 'Voice script',
        icon: <MicrophoneIcon className="h-3.5 w-3.5" />,
        onClick: () => void voiceCut(),
        disabled: isBusy || !hasShots || !voices.length,
        status: isVoicingActive ? ('running' as const) : voiceDone ? ('done' as const) : ('pending' as const),
        hint: isVoicingActive
          ? 'Voicing…'
          : activeCut.voiceover
            ? `${activeCut.voiceover.durationSeconds.toFixed(1)}s`
            : undefined,
      },
      {
        key: 'plan',
        label: 'Plan scenes',
        icon: <ChecklistIcon className="h-3.5 w-3.5" />,
        onClick: () => void planCut(),
        disabled: isBusy || !activeCut.transcript.trim(),
        status: isPlanningActive ? ('running' as const) : planDone ? ('done' as const) : ('pending' as const),
        hint: isPlanningActive
          ? 'Planning…'
          : hasShots
            ? `${activeCut.shots.length} scenes`
            : undefined,
      },
      {
        key: 'build',
        label: 'Build scenes',
        icon: <ZapIcon className="h-3.5 w-3.5" />,
        onClick: generateAll,
        disabled: isBusy || !hasShots,
        status: isBuildingActive ? ('running' as const) : buildDone ? ('done' as const) : ('pending' as const),
        hint: isBuildingActive
          ? progress
            ? `${progress.built}/${progress.total}`
            : 'Building…'
          : hasShots && !activeCut.shots.every((shot) => shot.code)
            ? `${activeCut.shots.filter((s) => !s.code).length} to build`
            : undefined,
      },
    ];
  }, [
    activeWorkflowStep,
    hasShots,
    activeCut.voiceover,
    activeCut.shots,
    progress,
    isBusy,
    voices.length,
    activeCut.transcript,
    voiceCut,
    planCut,
    generateAll,
  ]);


  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#121211]">
      {error ? <ErrorBanner message={error} /> : null}
      <PageHeader>
        {/* Ghost Title: responsive width matching title length */}
        <HeaderTitle
          value={activeCut.name}
          placeholder="Untitled cut"
          onChange={(name) => updateCut(activeCut.id, (cut) => ({...cut, name}))}
        />

        {(progress || status) ? (
          <HeaderMeta title={status ?? undefined}>
            {progress
              ? `${progress.built} built · ${progress.voiced}/${progress.total} voiced`
              : status}
          </HeaderMeta>
        ) : null}

        <div className="min-w-0 flex-1" />

        {/* Workflow shown on hover when scenes are generating */}
        {isBusy ? (
          <div className="relative group">
            <div className={`${headerActionButton} cursor-pointer`}>
              <Spinner className="h-3.5 w-3.5 text-zinc-400" />
              <span className="motion-shimmer font-medium">{phaseLabel}</span>
            </div>
            <div className="absolute right-0 top-full z-50 mt-1 hidden w-56 border border-white/[0.08] bg-[#181716] p-1 shadow-none group-hover:block pointer-events-auto">
              <div className="px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-zinc-500 border-b border-white/[0.06] mb-1">
                Workflow
              </div>
              {workflowItems.map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between px-2.5 py-1.5 text-[11px] text-zinc-300"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-zinc-500">{item.icon}</span>
                    <span>{item.label}</span>
                  </span>
                  {item.status === 'running' ? (
                    <Spinner className="h-3 w-3 text-amber-400" />
                  ) : item.status === 'done' ? (
                    <CheckIcon className="h-3 w-3 text-emerald-400" />
                  ) : item.hint ? (
                    <span className="font-mono text-[9px] text-zinc-500">{item.hint}</span>
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-700" />
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <HeaderRenderButton
          log={activeRenderLog}
          isRendering={isRenderingActiveCut}
          download={activeRenderDownload}
          disabled={Boolean(renderingCutId) || isBusy || !hasShots}
          ready={hasShots}
          onRender={renderCut}
          onDownload={downloadActiveRender}
          onDismissLog={() => dismissRenderLog(activeCut.id)}
          renderTitle="Render this cut in the browser and download the MP4"
          downloadTitle="Download the file rendered from this cut"
        />
      </PageHeader>

      <div className="flex min-h-0 flex-1">
        {/* Center player & CutTimeline */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            {/* With no scenes the player is a blank frame with a transport
                under it, which reads as something that failed to load rather
                than as a cut nobody has built yet. */}
            {hasShots ? (
              <PlayerView
                graphic={preview}
                onFrameChange={handleFrameChange}
                seekSignal={seekSignal}
                wide
              />
            ) : (
              /* Nothing to play yet, so the canvas becomes the composer and the
                 right panel stays out of the way until there are scenes to
                 inspect. */
              <PromptComposer
                headline="Turn a script into scenes"
                value={activeCut.transcript}
                onChange={(transcript) => {
                  triggerCancel(activeCut.id);
                  updateCut(activeCut.id, (cut) => ({
                    ...cut,
                    transcript,
                    beats: [],
                    shots: [],
                    voiceover: undefined,
                  }));
                  setSelectedShotId(null);
                }}
                onBlur={() => activeCut.transcript.trim() && splitBeats(cutRef.current)}
                onSubmit={confirmCut}
                placeholder="Paste narration text here. Plain text is fine — no timestamps needed."
                busy={isBusy}
                busyLabel={phaseLabel}
                submitLabel="Generate cut  (⌘↵)"
                secondaryOpen={composerStyleNote}
                secondary={
                  <textarea
                    ref={styleNoteRef}
                    value={activeCut.styleNote}
                    onChange={(event) =>
                      updateCut(activeCut.id, (cut) => ({
                        ...cut,
                        styleNote: event.target.value,
                      }))
                    }
                    rows={2}
                    placeholder="Style direction — specific visual notes for these scenes."
                    className="w-full resize-none border-0 border-b border-white/[0.06] bg-transparent px-3 py-2 text-[11px] leading-relaxed text-zinc-300 outline-none placeholder:text-zinc-600"
                  />
                }
                toolbarLeft={
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setComposerStyleNote((open) => !open);
                        if (!composerStyleNote) {
                          // Focus lands after the row has somewhere to be.
                          window.setTimeout(() => styleNoteRef.current?.focus(), 210);
                        }
                      }}
                      title="Style direction (optional)"
                      aria-label="Style direction"
                      aria-pressed={composerStyleNote}
                      className={`grid h-7 w-7 shrink-0 place-items-center transition-colors hover:bg-[#201F1D] ${
                        composerStyleNote || activeCut.styleNote.trim()
                          ? 'text-zinc-200'
                          : 'text-zinc-500 hover:text-white'
                      }`}
                    >
                      <ColorSwatchIcon className="h-3.5 w-3.5" />
                    </button>

                    <CustomSelect
                      className="shrink-0"
                      value={activeCut.style}
                      options={THEMES.map((theme) => ({
                        value: theme.style,
                        label: theme.label,
                        hint: theme.tag,
                      }))}
                      onChange={setCutStyle}
                      menuMinWidth={280}
                      buttonClassName={COMPOSER_CHIP}
                    />

                    <CustomSelect
                      className="min-w-0 shrink-0"
                      value={activeCut.voice.voice}
                      options={
                        voices.length
                          ? voices.map((v) => ({value: v.id, label: v.label}))
                          : [{value: '', label: 'Default voice'}]
                      }
                      onChange={(val) =>
                        updateCut(activeCut.id, (cut) => ({
                          ...cut,
                          voice: {...cut.voice, voice: val},
                        }))
                      }
                      disabled={!voices.length}
                      placeholder={voices.length ? 'Voice…' : 'Default voice'}
                      menuMinWidth={220}
                      buttonClassName={COMPOSER_CHIP}
                    />
                  </>
                }
                toolbarRight={
                  <ModelPicker
                    className="shrink-0"
                    models={settings.modelSlugs}
                    value={settings.selectedModel}
                    onChange={onModelChange}
                    buttonClassName={`${COMPOSER_CHIP} max-w-[190px]`}
                    readyProviders={{
                      openrouter: Boolean(settings.apiKey.trim()),
                      google: Boolean(settings.googleApiKey.trim()),
                      openlux: Boolean(settings.openluxApiKey.trim()),
                      codex: _codexAuth.status === 'authenticated',
                    }}
                    openLuxApiKey={settings.openluxApiKey}
                    spend={_spend}
                  />
                }
              />
            )}
          </div>
          {/* No scenes, no timeline: an empty strip under the guidance reads
              as a broken control, not as an empty edit. */}
          <div className={`shrink-0 ${hasShots ? '' : 'hidden'}`}>
            <CutTimeline
              shots={activeCut.shots}
              totalFrames={totalFrames}
              playheadFrame={playheadFrame}
              selectedShotId={selectedShotId}
              onSelectShot={selectTimelineShot}
              onSeek={seekTo}
              onResizeShot={resizeTimelineShot}
              logs={activeLogs}
            />
          </div>
        </main>

        {/* Right Tabbed Panel — smooth collapse animation */}
        {hasShots ? (
          <aside
            className={`relative flex h-full shrink-0 flex-col bg-surface transition-[width] duration-300 ease-in-out ${
              panelOpen
                ? 'w-[330px] border-l border-white/[0.07] 2xl:w-[370px]'
                : 'w-0 border-l-0'
            }`}
          >
            {/* Collapse / Expand toggle — stays outside the box in same row as panel header */}
            <div className="absolute right-full top-2 mr-2 z-30 flex items-center gap-1.5 pointer-events-auto">
              <button
                type="button"
                onClick={() => setPanelOpen(!panelOpen)}
                title={panelOpen ? 'Collapse panel' : 'Expand panel'}
                aria-label={panelOpen ? 'Collapse panel' : 'Expand panel'}
                className="grid h-7 w-7 shrink-0 place-items-center border border-white/[0.08] bg-[#181716] text-zinc-400 hover:border-white/20 hover:bg-[#201F1D] hover:text-white transition-colors shadow-md"
              >
                {panelOpen ? (
                  <PanelCollapseIcon className="h-3.5 w-3.5" />
                ) : (
                  <PanelExpandIcon className="h-3.5 w-3.5" />
                )}
              </button>
            </div>

            {/* Inner clipped content */}
            <div className="flex h-full w-[330px] flex-col overflow-hidden 2xl:w-[370px]">
              {/* Header / Tab Switcher */}
            <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/[0.06] px-2.5">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setRightTab('transcript')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium transition-all duration-150 active:scale-[0.97] ${
                    rightTab === 'transcript'
                      ? 'bg-[#2A2928] text-white'
                      : 'text-zinc-500 hover:text-white'
                  }`}
                >
                  <EditPenIcon className="h-3.5 w-3.5" />
                  Script
                </button>

                <button
                  onClick={() => setRightTab('chat')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium transition-all duration-150 active:scale-[0.97] ${
                    rightTab === 'chat'
                      ? 'bg-[#2A2928] text-white'
                      : 'text-zinc-500 hover:text-white'
                  }`}
                >
                  <Sparkle className="h-3.5 w-3.5" />
                  Chat
                </button>

                <button
                  onClick={() => setRightTab('shot')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium transition-all duration-150 active:scale-[0.97] ${
                    rightTab === 'shot'
                      ? 'bg-[#2A2928] text-white'
                      : 'text-zinc-500 hover:text-white'
                  }`}
                >
                  <StackIcon className="h-3.5 w-3.5" />
                  {selectedShot
                    ? `Scene ${activeCut.shots.indexOf(selectedShot) + 1}`
                    : activeCut.shots.length > 0
                      ? 'Scene 1'
                      : 'Scene'}
                </button>
              </div>

              <button
                onClick={() =>
                  setRightTab((current) =>
                    current === 'history' ? (hasShots ? 'chat' : 'transcript') : 'history',
                  )
                }
                title="Version history"
                aria-label="Version history"
                aria-pressed={rightTab === 'history'}
                className={`p-1.5 transition-all duration-150 active:scale-[0.97] ${
                  rightTab === 'history'
                    ? 'bg-[#2A2928] text-white'
                    : 'text-zinc-500 hover:bg-[#201F1D] hover:text-white'
                }`}
              >
                <ClockIcon className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Tab Contents */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {rightTab === 'transcript' && (
                <div className="flex h-full flex-col">
                  {/* Scrollable Script Tab Fields */}
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    <div className="rise p-3">
                      <div className="mb-1.5 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.1em] text-zinc-500">
                        <span><span className="mr-1.5 text-zinc-700">01</span>Narration Script</span>
                        {beatCount > 0 && <span>{beatCount} scenes</span>}
                      </div>
                      <textarea
                        value={activeCut.transcript}
                        onChange={(event) => {
                          const transcript = event.target.value;
                          triggerCancel(activeCut.id);
                          updateCut(activeCut.id, (cut) => ({
                            ...cut,
                            transcript,
                            beats: [],
                            shots: [],
                            voiceover: undefined,
                          }));
                          setSelectedShotId(null);
                        }}
                        onBlur={() => activeCut.transcript.trim() && splitBeats(cutRef.current)}
                        placeholder="Paste narration text here. Plain text is fine — no timestamps needed."
                        rows={6}
                        className="w-full resize-none border border-white/[0.08] bg-[#121211] p-3 text-[11px] leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-white/25"
                      />
                    </div>

                    <div className="space-y-3 border-t border-white/[0.06] p-3">
                      {/* Model Dropdown (Opens Model Picker Modal) */}
                      <div className="rise" style={{animationDelay: '40ms'}}>
                        <label className="mb-1.5 block font-mono text-[9px] uppercase tracking-[0.1em] text-zinc-500">
                          <span className="mr-1.5 text-zinc-700">02</span>Model
                        </label>
                        <ModelPicker
                          className="w-full"
                          buttonClassName="flex w-full items-center justify-between border border-white/[0.08] bg-[#121211] px-2.5 py-1.5 text-left text-[11px] text-zinc-200 outline-none transition-colors hover:bg-[#201F1D]"
                          models={settings.modelSlugs}
                          value={settings.selectedModel}
                          onChange={onModelChange}
                          readyProviders={{
                            openrouter: Boolean(settings.apiKey.trim()),
                            google: Boolean(settings.googleApiKey.trim()),
                            openlux: Boolean(settings.openluxApiKey.trim()),
                            codex: _codexAuth.status === 'authenticated',
                          }}
                          openLuxApiKey={settings.openluxApiKey}
                          spend={_spend}
                        />
                      </div>

                      {/* Theme Selector: only label and chevrons */}
                      <div className="rise" style={{animationDelay: '80ms'}}>
                        <div className="mb-1.5 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.1em] text-zinc-500">
                          <span><span className="mr-1.5 text-zinc-700">03</span>Theme</span>
                          <span>{THEMES.find((t) => t.style === activeCut.style)?.tag}</span>
                        </div>
                        <div className="flex w-full items-center justify-between border border-white/[0.08] bg-[#121211] px-2.5 py-1.5">
                          <span className="text-[11px] font-medium text-zinc-200">
                            {THEMES.find((t) => t.style === activeCut.style)?.label ?? 'Dev'}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                const idx = THEMES.findIndex((t) => t.style === activeCut.style);
                                const next = (idx - 1 + THEMES.length) % THEMES.length;
                                setCutStyle(THEMES[next].style);
                              }}
                              title="Previous theme"
                              aria-label="Previous theme"
                              className="grid h-5 w-5 place-items-center border border-white/[0.08] bg-[#201F1D] text-zinc-400 transition-colors hover:bg-[#2A2928] hover:text-white"
                            >
                              <ChevronLeftIcon className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const idx = THEMES.findIndex((t) => t.style === activeCut.style);
                                const next = (idx + 1) % THEMES.length;
                                setCutStyle(THEMES[next].style);
                              }}
                              title="Next theme"
                              aria-label="Next theme"
                              className="grid h-5 w-5 place-items-center border border-white/[0.08] bg-[#201F1D] text-zinc-400 transition-colors hover:bg-[#2A2928] hover:text-white"
                            >
                              <ChevronRightIcon className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Voice Actor Dropdown */}
                      <div className="rise" style={{animationDelay: '120ms'}}>
                        <label className="mb-1.5 block font-mono text-[9px] uppercase tracking-[0.1em] text-zinc-500">
                          <span className="mr-1.5 text-zinc-700">04</span>Voice Actor
                        </label>
                        <CustomSelect
                          value={activeCut.voice.voice}
                          options={
                            voices.length
                              ? voices.map((v) => ({value: v.id, label: v.label}))
                              : [{value: '', label: 'Default voice'}]
                          }
                          onChange={(val) =>
                            updateCut(activeCut.id, (cut) => ({
                              ...cut,
                              voice: {...cut.voice, voice: val},
                            }))
                          }
                          disabled={!voices.length}
                          placeholder={voices.length ? 'Select voice…' : 'Default voice'}
                        />
                      </div>

                      {/* Style Direction (Optional) */}
                      <div className="rise" style={{animationDelay: '150ms'}}>
                        <label className="mb-1.5 block font-mono text-[9px] uppercase tracking-[0.1em] text-zinc-500">
                          <span className="mr-1.5 text-zinc-700">05</span>Style Direction (Optional)
                        </label>
                        <textarea
                          value={activeCut.styleNote}
                          onChange={(event) =>
                            updateCut(activeCut.id, (cut) => ({
                              ...cut,
                              styleNote: event.target.value,
                            }))
                          }
                          rows={2}
                          placeholder="Specific visual directions for these scenes."
                          className="w-full resize-none border border-white/[0.08] bg-[#121211] p-2 text-[11px] leading-relaxed text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-white/25"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Docked Footer with Generate / Regenerate button */}
                  <div className="shrink-0 border-t border-white/[0.06] bg-[#121211] p-3">
                    <button
                      type="button"
                      onClick={confirmCut}
                      disabled={isBusy || !activeCut.transcript.trim()}
                      title={hasShots ? 'Regenerate cut' : 'Generate cut'}
                      className={`flex w-full items-center justify-center gap-2 border border-sky-400/25 bg-[#181716] px-3 py-2 text-xs font-medium text-zinc-200 transition-all duration-150 hover:bg-[#201F1D] hover:border-sky-400/40 hover:text-white active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-35 disabled:border-white/[0.06] ${
                        isBusy ? 'cursor-not-allowed text-sky-200' : ''
                      }`}
                    >
                      {isBusy ? (
                        <>
                          <Spinner className="h-3.5 w-3.5 text-sky-400" />
                          <span className="motion-shimmer font-medium">{phaseLabel}</span>
                        </>
                      ) : (
                        <>
                          <GenerateIcon className="h-3.5 w-3.5 text-sky-400" />
                          <span>{hasShots ? 'Regenerate Cut' : 'Generate Cut'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {rightTab === 'chat' && (
                <div className="rise flex h-full flex-col p-3">
                  {/* Target Scope Banner */}
                  <div className="flex shrink-0 items-center justify-between border border-white/[0.08] bg-[#121211] px-3 py-2 text-[11px]">
                    <div className="flex items-center gap-2 text-zinc-300">
                      <Sparkle className="h-3.5 w-3.5 text-zinc-400" />
                      <span>
                        {selectedShot
                          ? `Scene ${activeCut.shots.indexOf(selectedShot) + 1}`
                          : activeCut.shots.length > 0
                            ? 'Scene 1'
                            : 'All Scenes'}
                      </span>
                    </div>
                    {selectedShot ? (
                      <button
                        onClick={() => setSelectedShotId(null)}
                        className="text-[10px] text-zinc-500 hover:text-white"
                      >
                        All Scenes
                      </button>
                    ) : null}
                  </div>

                  {!hasShots ? (
                    <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
                      <ChatEmptyState
                        title="No scenes yet"
                        description="Generate the cut first, then direct changes here — fixes land on the selected scene."
                      >
                        <button
                          onClick={() => setRightTab('transcript')}
                          className={`${headerActionButton} w-full`}
                        >
                          <GenerateIcon className="h-3.5 w-3.5" />
                          <span>Open Script</span>
                        </button>
                      </ChatEmptyState>
                    </div>
                  ) : !quickFixReply && !quickFixBusy ? (
                    <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
                      <ChatEmptyState
                        title="Direct this scene"
                        description="Describe the change in plain words — type, pacing, colour, layout. It lands on the selected scene."
                      >
                        <div className="mx-auto flex w-full max-w-[240px] flex-col gap-1.5 pt-1">
                          {QUICK_PROMPT_SHORTCUTS.map((promptText) => {
                            const targetId = selectedShotId ?? activeCut.shots[0]?.id;
                            const isTargetGenerating = Boolean(
                              targetId &&
                                (generatingShotIds.includes(targetId) ||
                                  activeCut.shots.find((s) => s.id === targetId)?.status === 'generating'),
                            );
                            return (
                              <button
                                key={promptText}
                                type="button"
                                onClick={() => {
                                  if (targetId) void quickFixShot(targetId, promptText, []);
                                }}
                                disabled={isTargetGenerating || quickFixBusy || !hasShots}
                                className="flex w-full items-center gap-2 border border-white/[0.08] bg-[#121211] px-2.5 py-1.5 text-left text-[11px] text-zinc-300 transition-colors hover:border-white/20 hover:bg-[#201F1D] hover:text-white disabled:opacity-40"
                              >
                                <Sparkle className="h-2.5 w-2.5 shrink-0 text-zinc-500" />
                                <span>{promptText}</span>
                              </button>
                            );
                          })}
                        </div>
                      </ChatEmptyState>
                    </div>
                  ) : (
                  <div className="mt-2 min-h-0 flex-1 space-y-3 overflow-y-auto">
                    {/* Quick fix reply box */}
                    {quickFixReply ? (
                      <div className="rise border border-white/[0.08] bg-[#121211] p-3 text-[11px] leading-relaxed text-zinc-300">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-500">
                            Assistant Response
                          </div>
                          <GhostIconButton
                            title="Copy response"
                            onClick={() => void copyFixReply()}
                          >
                            {copiedFixReply ? (
                              <CheckIcon className="h-3 w-3 text-white" />
                            ) : (
                              <CopyIcon className="h-3 w-3" />
                            )}
                          </GhostIconButton>
                        </div>
                        <p className="whitespace-pre-wrap break-words">{quickFixReply}</p>
                      </div>
                    ) : null}

                    {quickFixBusy && <ThinkingIndicator label="Applying changes…" />}
                  </div>
                  )}

                  {/* Chat Composer */}
                  <div className="mt-2 shrink-0 space-y-2 border-t border-white/[0.06] pt-3">
                    {/* Quick prompt shortcut badges: persistent and always accessible */}
                    {(() => {
                      const targetId = selectedShotId ?? activeCut.shots[0]?.id;
                      const isTargetGenerating = Boolean(
                        targetId &&
                          (generatingShotIds.includes(targetId) ||
                            activeCut.shots.find((s) => s.id === targetId)?.status === 'generating'),
                      );
                      const hasFixContent = Boolean(fixDraft.trim() || fixImages.length > 0);
                      const hasStartedChat = Boolean(quickFixReply || quickFixBusy);

                      const handleSendFix = () => {
                        if (targetId && (fixDraft.trim() || fixImages.length > 0) && !quickFixBusy) {
                          void quickFixShot(targetId, fixDraft.trim(), fixImages);
                          setFixDraft('');
                          setFixImages([]);
                        }
                      };

                      return (
                        <>
                          {hasStartedChat && (
                            <div
                              className={`overflow-hidden transition-all duration-200 ease-out ${
                                hasFixContent
                                  ? 'max-h-0 opacity-0 pointer-events-none mb-0'
                                  : 'max-h-12 opacity-100 mb-2'
                              }`}
                            >
                              <QuickActions
                                asRow
                                onSend={(promptText) => {
                                  if (targetId) {
                                    void quickFixShot(targetId, promptText, []);
                                  }
                                }}
                                disabled={isTargetGenerating || quickFixBusy || !hasShots}
                              />
                            </div>
                          )}

                          <div className="border border-white/[0.08] bg-[#121211] p-2 transition-colors focus-within:border-white/20">
                            {!!fixImages.length && (
                              <div className="mb-1.5 flex flex-wrap gap-1.5 px-1 pt-1">
                                {fixImages.map((image) => (
                                  <div key={image.id} className="group relative">
                                    <img
                                      src={image.thumbUrl ?? image.dataUrl}
                                      alt={image.name}
                                      title={image.name}
                                      className="h-12 w-12 object-cover border border-white/10"
                                    />
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setFixImages((current) => current.filter((item) => item.id !== image.id))
                                      }
                                      aria-label={`Remove ${image.name}`}
                                      className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center bg-zinc-800 text-zinc-400 hover:bg-red-500 hover:text-white"
                                    >
                                      <MultiplyIcon className="h-2.5 w-2.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}

                            {fixNote && (
                              <p className="px-2 pb-1 text-[10px] leading-relaxed text-zinc-400">
                                {fixNote}
                              </p>
                            )}

                            <textarea
                              value={fixDraft}
                              onChange={(event) => setFixDraft(event.target.value)}
                              onPaste={(event) => {
                                const files = Array.from(event.clipboardData.files).filter((file) =>
                                  file.type.startsWith('image/'),
                                );
                                if (files.length) {
                                  event.preventDefault();
                                  void addFixImages(files);
                                }
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' && !event.shiftKey) {
                                  event.preventDefault();
                                  handleSendFix();
                                }
                              }}
                              rows={1}
                              disabled={isTargetGenerating || quickFixBusy || !hasShots}
                              placeholder={
                                hasShots
                                  ? selectedShot
                                    ? `Direct Shot ${activeCut.shots.indexOf(selectedShot) + 1} — paste a reference image too…`
                                    : 'Describe changes for the cut — paste a reference image too…'
                                  : 'Build the cut first to use chat directing'
                              }
                              className="assistant-prompt-input block min-h-[44px] max-h-40 w-full resize-none border-0 border-none bg-transparent px-2 py-1.5 text-xs leading-relaxed text-white placeholder:text-zinc-600 outline-none ring-0 shadow-none focus:border-none focus:outline-none focus:ring-0 disabled:opacity-40"
                            />

                            <div className="mt-1 flex items-center justify-between gap-2">
                              <ModelPicker
                                models={settings.modelSlugs}
                                value={settings.selectedModel}
                                onChange={onModelChange}
                                readyProviders={{
                                  openrouter: Boolean(settings.apiKey.trim()),
                                  google: Boolean(settings.googleApiKey.trim()),
                                  openlux: Boolean(settings.openluxApiKey.trim()),
                                  codex: _codexAuth.status === 'authenticated',
                                }}
                                openLuxApiKey={settings.openluxApiKey}
                                spend={_spend}
                              />

                              <div className="flex items-center gap-2">
                                <input
                                  ref={fileInputRef}
                                  type="file"
                                  accept="image/png,image/jpeg,image/webp,image/gif"
                                  multiple
                                  hidden
                                  onChange={(event) => {
                                    void addFixImages(Array.from(event.target.files ?? []));
                                    event.target.value = '';
                                  }}
                                />

                                <button
                                  type="button"
                                  onClick={() => fileInputRef.current?.click()}
                                  disabled={isTargetGenerating || quickFixBusy || !hasShots || fixImages.length >= 4}
                                  title="Attach a reference image (up to 4)"
                                  aria-label="Attach a reference image"
                                  className="grid h-7 w-7 place-items-center text-zinc-500 hover:bg-[#201F1D] hover:text-white disabled:opacity-25 disabled:hover:bg-transparent transition-colors"
                                >
                                  <AttachmentIcon className="h-3.5 w-3.5" />
                                </button>

                                <button
                                  type="button"
                                  onClick={handleSendFix}
                                  disabled={isTargetGenerating || quickFixBusy || !hasShots || (!fixDraft.trim() && !fixImages.length)}
                                  aria-label="Send direction"
                                  className="grid h-7 w-7 place-items-center bg-[#2A2928] text-[#299FFF] hover:text-white disabled:bg-transparent disabled:text-zinc-600 transition-colors"
                                >
                                  {quickFixBusy ? (
                                    <Spinner className="h-3.5 w-3.5 text-sky-400" />
                                  ) : (
                                    <SendIcon className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}

              {rightTab === 'shot' && (
                <div className="rise h-full">
                {selectedShot ? (
                  <ShotInspector
                    shot={selectedShot}
                    index={activeCut.shots.indexOf(selectedShot)}
                    narration={
                      selectedShot.narration ||
                      beatsText(beatsForShot(activeCut.beats, selectedShot))
                    }
                    isBusy={selectedShot.status === 'generating' || generatingShotIds.includes(selectedShot.id)}
                    onChangeBrief={(brief) =>
                      updateShot(activeCut.id, selectedShot.id, (shot) => ({...shot, brief}))
                    }
                    onChangeBackground={(background) =>
                      updateShot(activeCut.id, selectedShot.id, (shot) => ({...shot, background}))
                    }
                    onChangeDuration={(durationInFrames) =>
                      updateShot(activeCut.id, selectedShot.id, (shot) =>
                        shot.audio?.durationIncludesTail
                          ? shot
                          : {...shot, durationInFrames: Math.min(MAX_SHOT_FRAMES, durationInFrames)},
                      )
                    }
                    onChangeCode={(code) => {
                      lastActionRef.current = 'Edit';
                      updateShot(activeCut.id, selectedShot.id, (shot) => ({
                        ...shot,
                        code,
                        status: 'ready',
                        error: undefined,
                      }));
                    }}
                    onRegenerate={() => void runGeneration([selectedShot.id])}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center p-6 text-center text-xs text-zinc-500">
                    Select a shot in the timeline to view its properties
                  </div>
                )}
                </div>
              )}

              {rightTab === 'history' && (
                <div className="rise flex h-full flex-col p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-zinc-500">
                      Versions · {activeVersions.length}
                    </span>
                    {activeVersions.length > 0 && (
                      <button
                        onClick={() => clearCutVersions(activeCut.id)}
                        className="text-[10px] text-zinc-500 hover:text-white"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  {/* Always shown, including at zero: a hidden total reads as
                      a broken ledger, not as a cut that has cost nothing. */}
                  <div className="mb-2 flex items-baseline justify-between border border-white/[0.08] bg-[#121211] px-3 py-2">
                    <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-zinc-500">
                      Total spent
                    </span>
                    <span className="font-mono text-[13px] text-zinc-200">
                      {formatUsd(activeCutSpend)}
                    </span>
                  </div>
                  {activeVersions.length === 0 ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
                      <ClockIcon className="h-5 w-5 text-zinc-600" />
                      <p className="text-xs text-zinc-500">
                        No versions yet. Build, fix, or edit a scene and it will appear here.
                      </p>
                    </div>
                  ) : (
                    <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
                      {activeVersions
                        .slice()
                        .reverse()
                        .map((version, reverseIndex) => {
                          const isLatest = reverseIndex === 0;
                          return (
                            <div
                              key={version.id}
                              className="rise border border-white/[0.08] bg-[#121211] px-3 py-2"
                              style={{animationDelay: `${Math.min(reverseIndex, 5) * 35}ms`}}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-medium text-zinc-200">
                                  {version.label}
                                  {isLatest && (
                                    <span className="ml-2 font-mono text-[9px] uppercase tracking-[0.1em] text-emerald-400">
                                      Current
                                    </span>
                                  )}
                                </span>
                                <button
                                  onClick={() => deleteCutVersion(activeCut.id, version.id)}
                                  title="Delete this version"
                                  aria-label="Delete this version"
                                  className="p-0.5 text-zinc-600 hover:text-red-400"
                                >
                                  <MultiplyIcon className="h-3 w-3" />
                                </button>
                              </div>
                              <div className="mt-0.5 flex items-baseline justify-between gap-2 font-mono text-[9px] text-zinc-500">
                                <span>
                                  {formatVersionTime(version.createdAt)} · {version.shotCount} scene
                                  {version.shotCount === 1 ? '' : 's'}
                                </span>
                                {version.costUsd ? (
                                  <span
                                    className="text-zinc-300"
                                    title="Spent producing this version: planning, scene generation, and fixes since the previous one"
                                  >
                                    {formatUsd(version.costUsd)}
                                  </span>
                                ) : (
                                  // A version with no billed call — a manual
                                  // edit, a restore, or a free model. The dash
                                  // says the column is there and this run was
                                  // free, rather than leaving a blank that
                                  // reads as missing data.
                                  <span
                                    className="text-zinc-600"
                                    title="No billed model call went into this version"
                                  >
                                    —
                                  </span>
                                )}
                              </div>
                              {!isLatest && (
                                <button
                                  onClick={() => restoreCutVersion(version)}
                                  disabled={isBusy || quickFixBusy}
                                  className="mt-2 w-full bg-[#2A2928] py-1.5 text-[10px] font-medium text-zinc-200 hover:brightness-125 hover:text-white disabled:opacity-40"
                                >
                                  Restore this version
                                </button>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              )}
            </div>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
};

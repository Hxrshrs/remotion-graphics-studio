/**
 * The shot planner: beats in, shots out.
 *
 * This is the step that makes a transcript into an edit. Left to itself a
 * model will hand back one graphic per sentence, which is the thing the
 * reference never does — its graphics hold for five to fifteen seconds while
 * annotations land on them. So the planner's whole job is grouping: decide
 * which consecutive beats share one artifact, and say in one line what that
 * artifact is.
 *
 * The reply is repaired rather than trusted. A plan that skips beats, repeats
 * them, or reorders them is normalised into a contiguous cover before it is
 * returned, because a gap in the cover would silently drop narration from the
 * timeline.
 */
import {
  CUT_LOOK_BRIEF,
  CUT_LOOK_BRIEF_DARK,
  CUT_LOOK_BRIEF_DEV_COMPACT,
  CUT_LOOK_BRIEF_SIGNAL,
  CutStyle,
} from './editorStyle';
import {TruncatedJsonError, extractJson, requestCompletion} from './complete';
import {Beat, scriptWords} from './transcript';
import {StudioSettings} from './types';

export type PlannedShot = {
  /** Indexes into the beat list, contiguous and ascending. */
  beatIndexes: number[];
  brief: string;
  background: 'solid' | 'transparent';
  /** Same integer on consecutive shots that should render as one continuous
      evolving scene instead of separate graphics. Omit on standalone shots. */
  group?: number;
  /**
   * Whether the boundary BEFORE this shot gets a player transition. False is
   * a deliberate hard cut. Grouped continuations are always false (they are
   * one evolving composition); omit or set true for a normal shot.
   */
  transitionBefore?: boolean;
};

/** The planner's brief is chosen per cut style; the rules stay fixed. */
const SYSTEM_BODY = `You are the shot planner for a fast, educational, human-centered explainer video.

You are given narration split into numbered beats. Group beats into short, punchy shots and describe the exact educational graphic each shot shows.

\${LOOK_BRIEF}

PLANNING RULES — STRICTLY 3.5 TO 5 SECONDS PER SEGMENT
- Clip duration MUST BE AT LEAST 3.5 SECONDS (never less than 3.5s) and AT MOST 5 SECONDS (strictly 3.5s to 5s). A human mind needs at least 3.5 seconds to comfortably absorb an idea. Each segment must cover enough spoken beats to span at least 3.5 seconds. If a run of beats is too short, combine it with the adjacent thought; if it exceeds 5 seconds, split at a natural boundary.
- Every beat is covered exactly once, in order, with no gaps and no overlaps.
- CREATIVE DESIGNS & CUSTOM DRAWINGS: Be creative with designs! Don't just make generic boxes or static cards. Plan custom visual diagrams, illustrated metaphors, animated vector paths, balance scales, gauges, branching pipelines, or mechanical systems that make the concept intuitive and delightful.
- CELEBRATE EMOJIS, ICONS & theSVG LOGOS: Every brief must specify a concrete visual anchor:
  · Expressive, colorful native emojis (e.g. 🚀, ⚡, 💡, 🧠, 🎯, ⏱️, 💰, 📦, 👤, 🛡️, 🔥, ⚙️, 📊, 🔍) — emojis bring personality, human warmth, and instant visual comprehension! Use them prominently.
  · A Lucide icon name (e.g. icon "shield-check", "database", "cpu", "zap", "activity", "network", "lock", "git-branch")
  · A verified theSVG brand logo slug when tools or companies are mentioned (e.g. "openai", "github", "docker", "stripe", "python", "google", "aws", "vercel")
- 5 CORE EDUCATIONAL ARCHETYPES (choose the one that best clarifies the beat):
  1. WORKFLOW OR BRANCHING TREE: A multi-stage workflow pipeline (A ➔ B ➔ C) with directional arrows (ui.Arrow), or a branching tree (Root branching into 2–3 children) with dashed moving lines (ui.TreeWire, NEVER use arrows in trees!). Nodes are open and floating without heavy background cards.
  2. HERO METRIC: One huge number or percentage living directly on the canvas without a background card, anchored by an icon/emoji and a 1–2 word label (e.g. "⚡ 10×" over "faster queries").
  3. DIRECT COMPARISON: Two contrasting sides (Old vs New, Slow vs Fast, Problem vs Solution) with 2 contrasting icons/logos and short tags.
  4. CORE SUBJECT & CALLOUTS: A central hero icon, drawing, or brand logo with 1–2 concise callout lines explaining the mechanism.
  5. KINETIC CENTER BUILD: A fast typography punchline for emphatic statements. Start brief with "KINETIC CENTER BUILD:" and 2–6 spoken words. MUST NOT BE UPPERCASE: use natural sentence case (e.g. "How important is memory?").
- NO SLOP TEXT, NO EXTRAS:
  · Strictly NO meta-labels or slide chrome: never write "Overview", "Key Insight", "Result:", "Summary:", or "Feature:".
  · Strictly NO explanatory sentences on screen: text must be limited to 1–4 words per label or a number. The voiceover explains; the screen anchors.
  · Never invent facts, numbers, or corporate buzzwords.
- Never name code components or APIs in a brief (no "ui.Window", "ui.DataTable", etc.). Describe the visual itself simply and concretely.
- Vary the visual form across consecutive shots. Mix hero metrics, comparisons, icon pipelines, and diagrams so adjacent shots feel fresh.
- STAGE, DON'T STACK: Show 1–3 visual units at most. Never plan a growing card wall or cluttered multi-item slide.
- GROUP CONTINUOUS SCENES: When 2–3 consecutive shots evolve the same picture (e.g. showing step 1 then step 2 of one system), assign the same integer to "group". Continuation briefs must state what is retained, what moves, and what replaces stale support.
- Choose "solid" for a graphic that owns the frame (default), "transparent" only for a small overlay.

Reply with JSON only: an array of {"beats": [numbers], "brief": string, "background": "solid" | "transparent", "group": integer (optional), "transitionBefore": boolean (optional)}.`;

const lookBriefForStyle = (style: CutStyle) =>
  style === 'dark'
    ? CUT_LOOK_BRIEF_DARK
    : style === 'dev'
      ? CUT_LOOK_BRIEF_DEV_COMPACT
      : style === 'signal'
        ? CUT_LOOK_BRIEF_SIGNAL
        : CUT_LOOK_BRIEF;

const systemForStyle = (style: CutStyle) =>
  SYSTEM_BODY.replace('${LOOK_BRIEF}', lookBriefForStyle(style));

const schema = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    properties: {
      beats: {type: 'array', items: {type: 'integer'}},
      brief: {type: 'string'},
      background: {type: 'string', enum: ['solid', 'transparent']},
      group: {type: 'integer'},
      transitionBefore: {type: 'boolean'},
    },
    required: ['beats', 'brief', 'background'],
  },
};

/** Plain-language stand-ins for the components a brief must not name. */
const COMPONENT_NOUNS: Record<string, string> = {
  Window: 'browser window',
  Panel: 'card',
  DataTable: 'table of records',
  Caption: 'caption',
  Verdict: 'tick-or-cross mark',
  Shout: 'shouted word',
  Disclaimer: 'line of fine print',
  Countdown: 'counter',
  Tile: 'icon tile',
  Wire: 'connector',
  Callout: 'callout',
  Cursor: 'pointer',
  Rings: 'concentric rings',
  Chip: 'pill label',
  Count: 'counting number',
  FlowNode: 'labelled node',
};

/**
 * A prompt rule is a request, so this is the guarantee behind it: any
 * component name that survives into a brief is rewritten as the thing it
 * draws. Briefs are shown to the user in the inspector and on the timeline,
 * and "A ui.DataTable showing historical assets" is both ugly there and the
 * tell that the planner was thinking about the API instead of the subject.
 */
export const cleanBrief = (brief: string) =>
  brief
    .replace(/\bui\.([A-Z][A-Za-z0-9]*)/g, (_match, name: string) =>
      COMPONENT_NOUNS[name] ??
      // An unmapped name still reads better split than left as an identifier.
      name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase(),
    )
    .replace(/\s{2,}/g, ' ')
    .trim();

/**
 * Force a raw plan into a contiguous, ordered, complete cover of the beats.
 * Anything the model left out is appended to the neighbouring shot rather
 * than dropped, so no narration ever disappears from the timeline.
 */
export const normalisePlan = (raw: PlannedShot[], beatCount: number): PlannedShot[] => {
  if (!beatCount) return [];

  // Take each shot's earliest unclaimed beat as its start, in plan order.
  const claimed = new Set<number>();
  const starts: Array<{start: number; shot: PlannedShot}> = [];
  for (const shot of raw) {
    const indexes = (shot.beatIndexes ?? [])
      .filter((index) => Number.isInteger(index) && index >= 0 && index < beatCount)
      .sort((a, b) => a - b);
    const start = indexes.find((index) => !claimed.has(index));
    if (start === undefined) continue;
    claimed.add(start);
    starts.push({start, shot});
  }
  starts.sort((a, b) => a.start - b.start);

  if (!starts.length) {
    return [
      {
        beatIndexes: Array.from({length: beatCount}, (_, index) => index),
        brief: 'One graphic covering the whole passage.',
        background: 'solid',
      },
    ];
  }

  // The first shot always starts at beat 0, whatever the model said.
  starts[0].start = 0;

  return starts.map((entry, index) => {
    const end = index + 1 < starts.length ? starts[index + 1].start : beatCount;
    return {
      beatIndexes: Array.from({length: end - entry.start}, (_, offset) => entry.start + offset),
      brief: cleanBrief(entry.shot.brief ?? '') || 'One graphic covering this passage.',
      background: entry.shot.background === 'transparent' ? 'transparent' : 'solid',
      group: Number.isInteger(entry.shot.group) ? (entry.shot.group as number) : undefined,
      transitionBefore:
        typeof entry.shot.transitionBefore === 'boolean' ? entry.shot.transitionBefore : undefined,
    };
  });
  // Each shot runs from its own start to the next one's, so the cover is
  // contiguous by construction and a dropped beat is impossible.
};

export const planShotList = async ({
  settings,
  model,
  beats,
  styleNote,
  style = 'paper',
  mode = 'separate',
}: {
  settings: StudioSettings;
  model: string;
  beats: Beat[];
  styleNote: string;
  style?: CutStyle;
  mode?: 'separate' | 'continuous';
}): Promise<{shots: PlannedShot[]; cost: number | null}> => {
  if (!beats.length) return {shots: [], cost: null};

  const beatLines = beats
    .map(
      (beat) =>
        `${beat.index}. [${(beat.startMs / 1000).toFixed(1)}s-${(beat.endMs / 1000).toFixed(1)}s] ${beat.text}`,
    )
    .join('\n');

  const user = [
    styleNote.trim() ? `EXTRA DIRECTION FOR THIS CUT\n${styleNote.trim()}` : '',
    mode === 'continuous'
      ? 'MODE: CONTINUOUS VIDEO — every shot is the next moment of ONE flowing video. Each brief describes what CHANGES, arrives, or becomes in the picture compared to the beat before it — not a standalone graphic. Layouts should evolve: keep continuity, but change the composition whenever the narration genuinely calls for it (a new subject, a new scale, a different arrangement), never sticking to one layout or the same card throughout. When a new idea takes over, retire the old visual before adding the replacement so the frame stays within the 1–4 component window.'
      : '',
    style === 'dark'
      ? 'STYLE: the dark register of the house style — near-black ground, light ink, violet accent, same composition rules.'
      : style === 'dev'
        ? 'STYLE: the modular dev register (Signal-inspired architecture) — obsidian ground, sleek charcoal modules (20-28px rounded corners, flat matte finish with thin border), uppercase Fredoka (IBM Plex Mono for exact machine values), crisp white type lit by one orange accent, one core takeaway per 3-5s clip, structured as clean modular layouts: side-by-side comparison cards, 2-3 step architecture pipeline with node carriers and clean connectors, an exact hero metric, or a clean code surface. Prominently use Lucide icons, native emoji, and verified theSVG brand logos (OpenAI, GitHub, Docker, Stripe, etc.). Never plan slides, code walls, or dense tables. Never invent commands or technical filler.'
        : style === 'signal'
          ? "STYLE: the signal register — neutral near-black ground, softly rounded true-charcoal modules, Bricolage Grotesque type, neutral-gray context, hot crimson emphasis, round-ended connectors, and a completely flat treatment with no borders, shadows, or glow. No blue tint."
          : 'STYLE: the light paper register of the house style — warm paper ground, dark ink, orange accent, same composition rules.',
    `NARRATION BEATS (${beats.length})\n${beatLines}`,
    'Return the shot list as JSON.',
  ]
    .filter(Boolean)
    .join('\n\n');

// One completion, with one automatic retry when the reply was cut off.
  // Truncation happens when a long transcript or a verbose brief blows the
  // output budget, so the retry names the failure and asks for the complete
  // JSON only — never silently keeps the partial plan (a dropped shot would
  // merge its narration into the neighbouring shot).
  const MAX_PLAN_TOKENS = 10000;
  const TRUNCATION_NOTE =
    'Your previous reply was cut off before the JSON array was complete. Return ONLY the complete JSON array this time, covering every beat exactly once, with no commentary before or after it.';

  let totalCost: number | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const {text, cost} = await requestCompletion({
      settings,
      model,
      system: systemForStyle(style),
      user: `${user}\n\n${attempt === 1 ? TRUNCATION_NOTE : ''}`.trim(),
      jsonSchema: schema,
      maxTokens: MAX_PLAN_TOKENS,
    });
    totalCost = totalCost === null && cost === null ? null : (totalCost ?? 0) + (cost ?? 0);
    try {
      const parsed = extractJson<
        Array<{
          beats?: number[];
          brief?: string;
          background?: string;
          group?: number;
          transitionBefore?: boolean;
        }>
      >(text);
      if (!Array.isArray(parsed)) throw new Error('The planner did not return a shot list.');

      const raw: PlannedShot[] = parsed.map((entry) => ({
        beatIndexes: Array.isArray(entry.beats) ? entry.beats : [],
        brief: typeof entry.brief === 'string' ? entry.brief : '',
        background: entry.background === 'transparent' ? 'transparent' : 'solid',
        group: Number.isInteger(entry.group) ? entry.group : undefined,
        transitionBefore:
          typeof entry.transitionBefore === 'boolean' ? entry.transitionBefore : undefined,
      }));
      return {shots: raw, cost: totalCost};
    } catch (caught) {
      lastError = caught;
      // A cut-off reply is worth one retry; any other malformed reply will
      // not fix itself by asking again.
      if (!(caught instanceof TruncatedJsonError)) throw caught;
    }
  }
  throw lastError;
};

/**
 * A text-first shot boundary. Unlike PlannedShot, these indexes point into
 * the cleaned script itself, not into an audio part or an estimated beat.
 * Cartesia's word timestamps are attached only after this plan is complete.
 */
export type ScriptShotPlan = {
  wordStart: number;
  wordEnd: number;
  brief: string;
  background: 'solid' | 'transparent';
  group?: number;
  transitionBefore?: boolean;
};

const SCRIPT_SYSTEM_BODY = `You are the editorial segment planner for an educational, human-centered explainer.

The input is the pasted SCRIPT and a numbered list of its exact words. Group words into short, intuitive visual scenes (3–5 seconds each). Audio will be generated to match this pacing.

\${LOOK_BRIEF}

SCRIPT SEGMENTATION RULES — STRICTLY 3.5 TO 5 SECONDS PER SEGMENT
- Return a list of contiguous word spans. wordStart is inclusive and wordEnd is exclusive. Cover every word from 0 to the end with no gaps or duplicates.
- DURATION TARGET: STRICTLY 3.5 TO 5 SECONDS (never less than 3.5s, maximum 5s; typically 9–15 words). Never plan a segment shorter than 3.5 seconds.
- CREATIVE DESIGNS & CUSTOM DRAWINGS: Be creative with designs! Don't just make generic boxes or static cards. Plan custom visual diagrams, illustrated metaphors, animated vector paths, balance scales, gauges, branching pipelines, or mechanical systems that make the concept intuitive and delightful.
- CELEBRATE EMOJIS, ICONS & theSVG LOGOS: Every brief must name a concrete visual anchor:
  · Expressive, colorful native emojis (e.g. 🚀, ⚡, 💡, 🧠, 🎯, ⏱️, 💰, 📦, 👤, 🛡️, 🔥, ⚙️, 📊, 🔍) — emojis bring personality, human warmth, and instant visual comprehension! Use them prominently.
  · A Lucide icon name (e.g. icon "shield-check", "database", "cpu", "zap", "activity", "lock", "server", "git-branch")
  · A verified theSVG brand logo slug when tools/companies are named (e.g. "openai", "github", "docker", "stripe", "python", "aws")
- 5 EDUCATIONAL ARCHETYPES:
  1. WORKFLOW OR BRANCHING TREE: Multi-stage pipeline (A ➔ B ➔ C) with directional arrows (ui.Arrow), or branching tree (Root ➔ Branch 1, Branch 2) with dashed moving lines (ui.TreeWire, NO arrows in trees!). Nodes are open and floating without heavy background cards.
  2. HERO METRIC: 1 prominent number/stat living directly on canvas without a card + bold emoji/icon + 1–2 word label.
  3. DIRECT COMPARISON: 2 contrasting sides (Old vs New, Slow vs Fast) with 2 contrasting icons/logos.
  4. CORE SUBJECT & CALLOUTS: A central hero drawing, icon, or brand logo with 1–2 concise callout lines.
  5. KINETIC CENTER BUILD: Typography punchline for emphatic statements. Brief starts with "KINETIC CENTER BUILD:" and 2–6 spoken words. MUST NOT BE UPPERCASE: use natural sentence case.
- NO SLOP TEXT, NO EXTRAS:
  · Never include meta-labels or slide categories like "Overview:", "Key Insight:", "Result:", or "Summary:".
  · Never write explanatory sentences on screen: labels must be 1–4 words maximum. The narration speaks; the screen anchors.
  · Only use facts, names, numbers, and entities actually present in the script.
- STAGE, DON'T STACK: Show 1–3 visual units at most. Never plan a growing card wall or cluttered multi-item slide.
- Mark the same integer in group for 2–3 consecutive spans that evolve one continuing picture.
- Use background "solid" for a scene that owns the frame (default), "transparent" only for an overlay.

Reply with JSON only: an array of {"wordStart": number, "wordEnd": number, "brief": string, "background": "solid" | "transparent", "group": integer (optional), "transitionBefore": boolean (optional)}.`;

const scriptSchema = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    properties: {
      wordStart: {type: 'integer'},
      wordEnd: {type: 'integer'},
      brief: {type: 'string'},
      background: {type: 'string', enum: ['solid', 'transparent']},
      group: {type: 'integer'},
      transitionBefore: {type: 'boolean'},
    },
    required: ['wordStart', 'wordEnd', 'brief', 'background'],
  },
};

const fallbackBrief = 'A clear visual for this passage, kept simple and centred.';

const naturalBoundary = (words: string[], start: number, end: number, target: number) => {
  const lower = Math.max(start + 1, Math.min(end - 1, target));
  // Search backwards only: a pleasant boundary is never allowed to push a
  // scene beyond the duration ceiling it is meant to enforce.
  for (let candidate = lower; candidate > start; candidate -= 1) {
    if (/[.!?;:,]$/.test(words[candidate - 1] ?? '')) return candidate;
  }
  return lower;
};

/** Keep a malformed/overlong model span from producing an unwatchable scene. */
const boundScriptPlans = (plans: ScriptShotPlan[], words: string[]) => {
  const out: ScriptShotPlan[] = [];
  const MAX_SPAN_WORDS = 15;
  for (const plan of plans) {
    let cursor = plan.wordStart;
    while (plan.wordEnd - cursor > MAX_SPAN_WORDS) {
      const next = naturalBoundary(words, cursor, plan.wordEnd, cursor + MAX_SPAN_WORDS);
      out.push({...plan, wordStart: cursor, wordEnd: next});
      cursor = next;
    }
    if (cursor < plan.wordEnd) out.push({...plan, wordStart: cursor});
  }
  return out;
};

/**
 * Repair a model response into a complete, ordered script cover. Boundaries
 * are the only model-owned part; the editor owns coverage and all timing.
 */
export const normaliseScriptPlan = (
  raw: ScriptShotPlan[],
  words: string[],
): ScriptShotPlan[] => {
  const wordCount = words.length;
  if (!wordCount) return [];
  const candidates = raw
    .map((entry) => ({
      ...entry,
      wordStart: Number.isInteger(entry.wordStart) ? entry.wordStart : -1,
      wordEnd: Number.isInteger(entry.wordEnd) ? entry.wordEnd : -1,
      brief: cleanBrief(entry.brief ?? '') || fallbackBrief,
      background: entry.background === 'transparent' ? 'transparent' : 'solid',
    }))
    .filter(
      (entry) =>
        entry.wordStart >= 0 &&
        entry.wordEnd > entry.wordStart &&
        entry.wordStart < wordCount,
    )
    .sort((a, b) => a.wordStart - b.wordStart);

  if (!candidates.length) {
    const fallback: ScriptShotPlan[] = [];
    let cursor = 0;
    while (cursor < wordCount) {
      const end = Math.min(wordCount, naturalBoundary(words, cursor, wordCount, cursor + 20));
      fallback.push({wordStart: cursor, wordEnd: Math.max(cursor + 1, end), brief: fallbackBrief, background: 'solid'});
      cursor = Math.max(cursor + 1, end);
    }
    return fallback;
  }

  const cover: ScriptShotPlan[] = [];
  let cursor = 0;
  for (const candidate of candidates) {
    const start = Math.max(cursor, Math.min(wordCount - 1, candidate.wordStart));
    const end = Math.min(wordCount, Math.max(start + 1, candidate.wordEnd));
    if (start > cursor) {
      // A gap gets the previous picture when possible; this preserves the
      // model's meaning while making the script cover mathematically exact.
      const previous = cover[cover.length - 1];
      if (previous) previous.wordEnd = start;
      else cover.push({wordStart: cursor, wordEnd: start, brief: fallbackBrief, background: 'solid'});
    }
    if (end <= cursor) continue;
    cover.push({
      ...candidate,
      wordStart: start,
      wordEnd: end,
      background: candidate.background === 'transparent' ? 'transparent' : 'solid',
    });
    cursor = end;
    if (cursor >= wordCount) break;
  }
  if (cursor < wordCount) {
    const previous = cover[cover.length - 1];
    if (previous) previous.wordEnd = wordCount;
    else cover.push({wordStart: 0, wordEnd: wordCount, brief: fallbackBrief, background: 'solid'});
  }

  // Starts are the authoritative boundaries. Remove any duplicate start that
  // a model produced, then split spans that would be longer than the timing
  // contract allows. All words remain covered exactly once.
  const deduped: ScriptShotPlan[] = [];
  for (const plan of cover) {
    const previous = deduped[deduped.length - 1];
    if (previous && previous.wordStart === plan.wordStart) {
      previous.wordEnd = Math.max(previous.wordEnd, plan.wordEnd);
      continue;
    }
    deduped.push(plan);
  }
  const bounded = boundScriptPlans(deduped, words);
  return bounded.map((plan, index) => ({
    ...plan,
    wordStart: index === 0 ? 0 : plan.wordStart,
    wordEnd: Math.min(wordCount, plan.wordEnd),
    transitionBefore:
      typeof plan.transitionBefore === 'boolean' ? plan.transitionBefore : undefined,
  }));
};

/** Plan visual boundaries from the script, before any audio is cut or sliced. */
export const planScriptShotList = async ({
  settings,
  model,
  script,
  styleNote,
  style = 'paper',
  mode = 'separate',
}: {
  settings: StudioSettings;
  model: string;
  script: string;
  styleNote: string;
  style?: CutStyle;
  mode?: 'separate' | 'continuous';
}): Promise<{shots: ScriptShotPlan[]; cost: number | null}> => {
  const words = scriptWords(script);
  if (!words.length) return {shots: [], cost: null};
  const wordLines = words.map((word, index) => `${index}: ${word}`).join('\n');
  const user = [
    styleNote.trim() ? `EXTRA DIRECTION FOR THIS CUT\n${styleNote.trim()}` : '',
    mode === 'continuous'
      ? 'MODE: CONTINUOUS VIDEO — related spans should share a group and describe the next evolution of one composition. Retire or replace stale visual units as the words change so no span grows into a card wall and the visible window stays at 1–4 components.'
      : '',
    style === 'dark'
      ? 'STYLE: dark near-black stage, light ink, violet accent.'
      : style === 'dev'
        ? 'STYLE: the modular dev register (Signal-inspired architecture) — obsidian ground, sleek charcoal modules (20-28px rounded corners, flat matte finish with thin border), uppercase Fredoka (IBM Plex Mono for exact machine values), crisp white type lit by one orange accent, one core takeaway per 3-5s clip, structured as clean modular layouts: side-by-side comparison cards, 2-3 step pipeline with node carriers and clean connectors, a hero metric, or a clean code surface. Prominently use Lucide icons, native emoji, and verified theSVG brand logos (OpenAI, GitHub, Docker, Stripe, etc.). Never plan slides, code walls, or dense tables. Never invent commands or technical filler.'
        : style === 'signal'
          ? 'STYLE: neutral near-black signal stage, flat charcoal modules with no borders or shadows, white type, crimson emphasis, no blue tint.'
          : 'STYLE: warm paper stage, dark ink, orange accent.',
    `NUMBERED SCRIPT (${words.length} WORDS)\n${wordLines}`,
    'Return the complete script segmentation as JSON.',
  ]
    .filter(Boolean)
    .join('\n\n');

  const MAX_PLAN_TOKENS = 12000;
  let totalCost: number | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const {text, cost} = await requestCompletion({
      settings,
      model,
      system: SCRIPT_SYSTEM_BODY.replace('${LOOK_BRIEF}', lookBriefForStyle(style)),
      user:
        attempt === 1
          ? `${user}\n\nReturn ONLY the complete JSON array. Do not add commentary or omit any word span.`
          : user,
      jsonSchema: scriptSchema,
      maxTokens: MAX_PLAN_TOKENS,
    });
    totalCost = totalCost === null && cost === null ? null : (totalCost ?? 0) + (cost ?? 0);
    try {
      const parsed = extractJson<
        Array<{
          wordStart?: number;
          wordEnd?: number;
          brief?: string;
          background?: string;
          group?: number;
          transitionBefore?: boolean;
        }>
      >(text);
      if (!Array.isArray(parsed)) throw new Error('The script planner did not return a shot list.');
      const raw: ScriptShotPlan[] = parsed.map((entry) => ({
        wordStart: Number.isInteger(entry.wordStart) ? (entry.wordStart as number) : -1,
        wordEnd: Number.isInteger(entry.wordEnd) ? (entry.wordEnd as number) : -1,
        brief: typeof entry.brief === 'string' ? entry.brief : '',
        background: entry.background === 'transparent' ? 'transparent' : 'solid',
        group: Number.isInteger(entry.group) ? entry.group : undefined,
        transitionBefore:
          typeof entry.transitionBefore === 'boolean' ? entry.transitionBefore : undefined,
      }));
      return {shots: normaliseScriptPlan(raw, words), cost: totalCost};
    } catch (caught) {
      lastError = caught;
      if (!(caught instanceof TruncatedJsonError)) throw caught;
    }
  }
  throw lastError;
};

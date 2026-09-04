export type SceneIntentKind =
  | 'process'
  | 'map'
  | 'timeline'
  | 'comparison'
  | 'chart'
  | 'network'
  | 'ranking'
  | 'metric'
  | 'lower-third'
  | 'title'
  | 'quote-card'
  | 'reference-board'
  | 'editorial';

export type SceneIntent = {
  kind: SceneIntentKind;
  label: string;
  composition: string;
  defaultCanvas: 'full-frame' | 'overlay';
  confidence: number;
};

export type CanvasMode = 'full-frame' | 'overlay';

type IntentDefinition = Omit<SceneIntent, 'confidence'> & {
  phrases: string[];
  words: string[];
};

const DEFINITIONS: IntentDefinition[] = [
  {
    kind: 'lower-third',
    label: 'lower third / broadcast overlay',
    composition: 'one compact edge-anchored identity group over transparent footage',
    defaultCanvas: 'overlay',
    phrases: ['lower third', 'name strap', 'speaker id', 'speaker identifier', 'broadcast overlay'],
    words: ['chyron', 'strapline'],
  },
  {
    kind: 'map',
    label: 'editorial map',
    composition: 'one simplified geographic field with direct markers and meaningful routes',
    defaultCanvas: 'full-frame',
    phrases: ['trade route', 'flight route', 'migration route', 'regional map', 'world map'],
    words: ['map', 'geography', 'geographic', 'migration', 'territory', 'countries', 'regions'],
  },
  {
    kind: 'timeline',
    label: 'timeline / chronology',
    composition: 'one clear chronological path with unevenly weighted milestones',
    defaultCanvas: 'full-frame',
    phrases: ['over time', 'through the years', 'history of', 'evolution of', 'project roadmap'],
    words: ['timeline', 'chronology', 'milestones', 'history', 'evolution', 'roadmap'],
  },
  {
    kind: 'comparison',
    label: 'comparison',
    composition: 'one shared comparison field with matched measures and a decisive contrast',
    defaultCanvas: 'full-frame',
    phrases: ['before and after', 'pros and cons', 'side by side', 'then and now', 'compare with'],
    words: ['compare', 'comparison', 'versus', 'vs', 'difference', 'differences'],
  },
  {
    kind: 'chart',
    label: 'data chart',
    composition: 'one honest chart with direct labels, a highlighted finding, and no dashboard chrome',
    defaultCanvas: 'full-frame',
    phrases: ['bar chart', 'line chart', 'area chart', 'scatter plot', 'data visualization', 'data visualisation'],
    words: ['chart', 'graph', 'trend', 'distribution', 'dataset', 'series'],
  },
  {
    kind: 'network',
    label: 'relationship / hierarchy diagram',
    composition: 'one legible node system whose position and connectors encode real relationships',
    defaultCanvas: 'full-frame',
    phrases: ['org chart', 'family tree', 'system architecture', 'relationship map'],
    words: ['network', 'hierarchy', 'ecosystem', 'architecture', 'relationships', 'tree'],
  },
  {
    kind: 'reference-board',
    label: 'reference-style visual board',
    composition: 'a saturated atmospheric field with one focal metric, object, or hub and at most a few quiet supporting marks — never a card wall',
    defaultCanvas: 'full-frame',
    phrases: [
      'visual board',
      'reference style',
      'reference image',
      'visual reference',
      'hub and spoke',
      'hub-and-spoke',
      'product board',
      'menu board',
      'system board',
      'catalog layout',
      'orbit layout',
      'card collage',
    ],
    words: ['collage', 'orbit', 'catalog', 'tiles', 'tile', 'pod'],
  },
  {
    kind: 'ranking',
    label: 'ranking / ordered list',
    composition: 'one typographic ranking with a dominant leader and a controlled stepped rhythm',
    defaultCanvas: 'full-frame',
    phrases: ['top five', 'top ten', 'best to worst', 'ranked list'],
    words: ['ranking', 'ranked', 'leaderboard', 'countdown'],
  },
  {
    kind: 'process',
    label: 'process / mechanism explainer',
    composition: 'one connected spatial system showing cause, transfer, transformation, and result',
    defaultCanvas: 'full-frame',
    phrases: [
      'how it works',
      'how does',
      'how do',
      'how is',
      'step by step',
      'supply chain',
      'water cycle',
      'rainwater harvesting',
      'flow diagram',
    ],
    words: [
      'process',
      'mechanism',
      'workflow',
      'pipeline',
      'lifecycle',
      'infrastructure',
      'harvesting',
      'manufacturing',
      'recycling',
    ],
  },
  {
    kind: 'metric',
    label: 'single statistic / number story',
    composition: 'one oversized number or short fact with only the context needed to understand it',
    defaultCanvas: 'overlay',
    phrases: ['key metric', 'big number', 'single statistic', 'number counter'],
    words: ['stat', 'statistic', 'percentage', 'counter', 'kpi', 'amount', 'total'],
  },
  {
    kind: 'quote-card',
    label: 'quote / profile / genuine card',
    composition: 'one solid compact card whose rows share measured edges and one radius family',
    defaultCanvas: 'overlay',
    phrases: ['social post', 'profile card', 'quote card', 'testimonial card'],
    words: ['profile', 'post', 'tweet', 'card'],
  },
  {
    kind: 'title',
    label: 'title / chapter opener',
    composition: 'one typographic focal statement with sparse supporting context',
    defaultCanvas: 'full-frame',
    phrases: ['title card', 'chapter opener', 'opening title', 'end card', 'intro screen'],
    words: ['title', 'intro', 'opener', 'chapter', 'headline'],
  },
];

const DEFAULT_INTENT: SceneIntent = {
  kind: 'editorial',
  label: 'editorial motion graphic',
  composition: 'one dominant idea with a supporting visual system, not a generic card grid',
  defaultCanvas: 'full-frame',
  confidence: 0,
};

const normalized = (value: string) =>
  value
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9%+\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Full source replacement is reserved for an explicit request to replace the
 * composition. Ordinary visual changes, including background and animation
 * tweaks, stay surgical even when a provider is tempted to resend the file.
 */
export const isExplicitRewriteInstruction = (instruction: string) => {
  // Do not let a safety instruction such as “don't rewrite everything” opt
  // into replacement mode just because it contains the same words.
  const text = normalized(instruction).replace(
    /\b(?:dont|do not|never|without|avoid)\s+(?:(?:just|simply|ever|need to|want to)\s+)*(?:start over|from scratch|replace everything|make (?:this|it) (?:a|an|into)\b|turn (?:this|it) into\b|completely (?:redesign|rebuild|replace)|rebuild (?:the )?(?:graphic|scene|composition))/g,
    '',
  );
  return /\b(?:start over|from scratch|replace everything|replace the (?:whole|entire) (?:graphic|scene|composition)|make (?:this|it) (?:a|an|into)\b|turn (?:this|it) into\b|completely (?:redesign|rebuild|replace)|rebuild (?:the )?(?:graphic|scene|composition))\b/.test(
    text,
  );
};

/**
 * Remove common negative format instructions before routing. “No cards” must
 * not classify a mechanism request as a card merely because the word appears.
 */
const withoutNegatedFormats = (value: string) =>
  value.replace(
    /\b(?:no|not|never|without|avoid|dont|do not)\s+(?:any\s+)?(?:rounded\s+)?(?:cards?|dashboards?|charts?|maps?|timelines?|titles?)\b/g,
    '',
  );

const scoreDefinition = (text: string, definition: IntentDefinition) => {
  const padded = ` ${text} `;
  const phraseScore = definition.phrases.reduce(
    (score, phrase) => score + (text.includes(phrase) ? 5 : 0),
    0,
  );
  const wordScore = definition.words.reduce(
    (score, word) => score + (padded.includes(` ${word} `) ? 2 : 0),
    0,
  );
  return phraseScore + wordScore;
};

export const inferSceneIntent = (instruction: string): SceneIntent => {
  const text = withoutNegatedFormats(normalized(instruction));
  if (!text) return DEFAULT_INTENT;

  let winner: IntentDefinition | null = null;
  let winningScore = 0;
  for (const definition of DEFINITIONS) {
    const score = scoreDefinition(text, definition);
    if (score > winningScore) {
      winner = definition;
      winningScore = score;
    }
  }

  if (!winner && /(?:[$€£₹]\s*\d|\b\d+(?:[.,]\d+)?\s*%(?:\s|$)|\b\d{1,3}(?:,\d{3})+\b)/.test(text)) {
    const metric = DEFINITIONS.find((definition) => definition.kind === 'metric');
    if (metric) {
      const {phrases: _phrases, words: _words, ...intent} = metric;
      return {...intent, confidence: 1};
    }
  }

  if (!winner) return DEFAULT_INTENT;
  const {phrases: _phrases, words: _words, ...intent} = winner;
  return {...intent, confidence: winningScore};
};

/**
 * A terse edit such as “fix the spacing” should retain the format established
 * by the previous user direction. A new explicit format always wins.
 */
export const resolveSceneIntent = (
  instruction: string,
  history: Array<{role: 'user' | 'assistant'; content: string}> = [],
): SceneIntent => {
  const current = inferSceneIntent(instruction);
  if (current.confidence > 0) return current;

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const turn = history[index];
    if (turn.role !== 'user') continue;
    const previous = inferSceneIntent(turn.content);
    if (previous.confidence > 0) return previous;
  }

  return current;
};

const explicitCanvasMode = (instruction: string): CanvasMode | null => {
  const text = normalized(instruction);
  if (
    /\b(?:transparent|transparency|transparente|alpha background|alpha bg|no background|no bg|without background|backgroundless)\b/.test(
      text,
    )
  ) {
    return 'overlay';
  }
  if (/\b(?:full frame|full-frame|fill the frame|fill the canvas|solid background)\b/.test(text)) {
    return 'full-frame';
  }
  return null;
};

/** Explicit canvas directions beat the format's automatic default. */
export const resolveCanvasMode = (
  instruction: string,
  history: Array<{role: 'user' | 'assistant'; content: string}> = [],
): CanvasMode => {
  const current = explicitCanvasMode(instruction);
  if (current) return current;

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const turn = history[index];
    if (turn.role !== 'user') continue;
    const previous = explicitCanvasMode(turn.content);
    if (previous) return previous;
  }

  return resolveSceneIntent(instruction, history).defaultCanvas;
};

const explicitPlacement = (instruction: string): 'center' | 'edge' | null => {
  const text = normalized(instruction);
  if (/\b(?:center|centered|centred|middle of the frame|middle of the canvas)\b/.test(text)) {
    return 'center';
  }
  if (
    /\b(?:edge anchored|edge-aligned|corner placement|in the corner|top left|top right|bottom left|bottom right|left edge|right edge|along the top|along the bottom)\b/.test(
      text,
    )
  ) {
    return 'edge';
  }
  return null;
};

/** Background transparency never implies edge placement. */
export const shouldCenterComposition = (
  instruction: string,
  history: Array<{role: 'user' | 'assistant'; content: string}> = [],
) => {
  const current = explicitPlacement(instruction);
  if (current) return current === 'center';

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const turn = history[index];
    if (turn.role !== 'user') continue;
    const previous = explicitPlacement(turn.content);
    if (previous) return previous === 'center';
  }

  return resolveSceneIntent(instruction, history).kind !== 'lower-third';
};

export const sceneIntentBrief = (intent: SceneIntent, canvasMode = intent.defaultCanvas) =>
  [
    `Detected format: ${intent.label}.`,
    `Composition: ${intent.composition}.`,
    `Canvas mode: ${canvasMode === 'overlay' ? 'transparent overlay' : 'full-frame'}.`,
    canvasMode === intent.defaultCanvas
      ? 'This is an automatic default. Any explicit user instruction overrides it.'
      : 'The user explicitly overrode the automatic canvas default.',
  ].join('\n');

import type {SpokenWord} from './voice';

/**
 * Plain-text transcript -> timed beats.
 *
 * The editor is fed a pasted script with no timings, so every duration here is
 * an estimate from word count at a speaking rate. That estimate only has to be
 * close: the timeline lets the user drag any shot, and the shot list is what
 * actually decides where graphics land.
 *
 * A beat is one spoken clause — the unit a graphic can be keyed to. Sentences
 * are the first cut; over-long ones are split again at clause joints, because
 * a 40-word sentence holding one graphic for 15 seconds is the failure mode
 * this whole page exists to avoid.
 */

/** Words per minute. Fast explainer narration, measured against the reference. */
export const DEFAULT_WPM = 165;

/** Below this a beat is a fragment and gets folded into its neighbour. */
const MIN_BEAT_WORDS = 4;
/** Above this a beat is split again at the best clause joint. */
const MAX_BEAT_WORDS = 20;
/** No beat reads faster than this, however few words it holds. */
const MIN_BEAT_MS = 700;

export type Beat = {
  id: string;
  /** Position in the transcript, 0-based. */
  index: number;
  text: string;
  wordCount: number;
  /** Inclusive/exclusive indexes in the cleaned script word list. */
  wordStart?: number;
  wordEnd?: number;
  startMs: number;
  endMs: number;
};

/** Speaker labels, stage directions, and stray timestamps a paste carries in. */
export const cleanTranscript = (raw: string) =>
  raw
    // [music], (laughs), and the bracketed noise auto-transcripts add.
    .replace(/[[(]\s*(?:music|applause|laugh\w*|inaudible|silence|__)[^\])]*[\])]/gi, ' ')
    // "12:34" / "1:02:03" / "00:00:04,120 --> ..." left over from a copied transcript.
    .replace(/^\s*\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?(?:\s*-+>\s*\S+)?\s*/gm, ' ')
    // "SPEAKER:" / "Narrator:" at the head of a line.
    .replace(/^\s*[A-Z][\w .'-]{0,24}:\s+/gm, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const scriptWords = (raw: string): string[] =>
  cleanTranscript(raw).split(/\s+/).filter(Boolean);

export type ScriptWordTiming = {
  index: number;
  text: string;
  start: number;
  end: number;
  /** Index range in Cartesia's global word list. */
  spokenStart: number;
  spokenEnd: number;
  /** False only for the deliberately conservative fallback match. */
  matched: boolean;
};

const alignmentToken = (value: string) =>
  value
    .toLocaleLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9]+/g, '');

const SMALL_NUMBER_WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const TENS_NUMBER_WORDS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** A small number-to-speech expansion for model names and measurements. */
const numberWords = (value: number): string[] => {
  if (!Number.isInteger(value) || value < 0 || value > 999_999) return [];
  if (value < 20) return [SMALL_NUMBER_WORDS[value]];
  if (value < 100) {
    return value % 10 ? [TENS_NUMBER_WORDS[Math.floor(value / 10)], SMALL_NUMBER_WORDS[value % 10]] : [TENS_NUMBER_WORDS[value / 10]];
  }
  if (value < 1000) {
    const rest = value % 100;
    return [
      SMALL_NUMBER_WORDS[Math.floor(value / 100)],
      'hundred',
      ...(rest ? numberWords(rest) : []),
    ];
  }
  const rest = value % 1000;
  return [
    ...numberWords(Math.floor(value / 1000)),
    'thousand',
    ...(rest ? numberWords(rest) : []),
  ];
};

/** English speakers often insert "and" after the last hundred in a number. */
const numberWordsWithAnd = (words: string[]): string[] => {
  const hundredIndex = words.lastIndexOf('hundred');
  if (hundredIndex < 0 || hundredIndex >= words.length - 1 || words[hundredIndex + 1] === 'and') {
    return words;
  }
  return [
    ...words.slice(0, hundredIndex + 1),
    'and',
    ...words.slice(hundredIndex + 1),
  ];
};

/** Common spoken expansions Cartesia uses for compact script abbreviations. */
const SPOKEN_ALIASES: Record<string, string[]> = {
  kb: ['kilobytes'],
  mb: ['megabytes'],
  gb: ['gigabytes'],
  tb: ['terabytes'],
  khz: ['kilohertz'],
  mhz: ['megahertz'],
  ghz: ['gigahertz'],
};

/**
 * Return plausible spoken forms for one source word. The first form keeps
 * exact transcript matching fast; the expanded form handles IDs, numbers,
 * camel-case names, hyphenated words, and units without changing the source
 * word indexes used by the editor.
 */
const alignmentVariants = (value: string): string[][] => {
  const base = alignmentToken(value);
  if (!base) return [];
  const rawValue = String(value).trim();
  const numberCandidate = rawValue.replace(/[.,!?;:]+$/, '');
  const commaNumber = /^\d{1,3}(?:,\d{3})+$/.test(numberCandidate);
  if (commaNumber) {
    const numeric = numberWords(Number(numberCandidate.replace(/,/g, '')));
    if (numeric.length) {
      const withAnd = numberWordsWithAnd(numeric);
      const variants = [[base], numeric];
      if (withAnd.join('') !== numeric.join('')) variants.unshift(withAnd);
      return variants;
    }
  }
  const variants: string[][] = [[base]];
  const camelSeparated = String(value).replace(/([a-z])([A-Z])/g, '$1 $2');
  const parts = camelSeparated.toLocaleLowerCase().match(/[a-z]+|\d+/g) ?? [];
  const expanded: string[] = [];
  let changed = parts.length > 1 || /\d|[-/:_.]/.test(String(value));
  for (const part of parts) {
    const alias = SPOKEN_ALIASES[part];
    if (alias) {
      expanded.push(...alias);
      changed = true;
      continue;
    }
    if (/^\d+$/.test(part)) {
      const words = numberWords(Number(part));
      if (words.length) expanded.push(...words);
      else expanded.push(part);
      changed = true;
      continue;
    }
    expanded.push(part);
  }
  if (changed && expanded.length && expanded.join('') !== base) {
    const expandedWithAnd = numberWordsWithAnd(expanded);
    if (expandedWithAnd.join('') !== expanded.join('')) variants.unshift(expandedWithAnd);
    variants.unshift(expanded);
  }
  return variants;
};

const editDistance = (left: string, right: string) => {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  let previous = Array.from({length: right.length + 1}, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length];
};

/** Exact first, then a deliberately small typo tolerance for brand names. */
const equivalentAlignment = (left: string, right: string) => {
  if (left === right) return true;
  if (left.length < 4 || right.length < 4) return false;
  const singularLeft = left.endsWith('s') ? left.slice(0, -1) : left;
  const singularRight = right.endsWith('s') ? right.slice(0, -1) : right;
  if (singularLeft === singularRight) return true;
  const limit = Math.min(3, Math.max(1, Math.floor(Math.min(left.length, right.length) * 0.12)));
  return editDistance(left, right) <= limit;
};

/**
 * Map the cleaned script words onto Cartesia's one-track word timestamps.
 *
 * TTS providers occasionally split a hyphenated word or join a contraction
 * differently from the pasted text. The small look-ahead handles those cases
 * without losing monotonicity. A low match ratio is rejected instead of
 * silently placing scenes on made-up timings.
 */
export const alignScriptWords = (
  raw: string,
  spokenWords: SpokenWord[],
): ScriptWordTiming[] => {
  const tokens = scriptWords(raw);
  // Keep the provider indexes stable; segment slicing uses them to take the
  // corresponding range from the original global word array.
  const spoken = spokenWords;
  if (!tokens.length) throw new Error('The script is empty after cleanup.');
  if (!spoken.length) throw new Error('Cartesia returned no usable word timestamps for the script.');

  const result: ScriptWordTiming[] = [];
  let spokenCursor = 0;
  let matchedCount = 0;
  const pushTiming = (
    index: number,
    startIndex: number,
    endIndex: number,
    matched: boolean,
  ) => {
    const first = spoken[Math.min(startIndex, spoken.length - 1)];
    const last = spoken[Math.min(Math.max(startIndex, endIndex - 1), spoken.length - 1)];
    result.push({
      index,
      text: tokens[index],
      start: Math.max(0, first.start),
      end: Math.max(Math.max(0, first.start), last.end),
      spokenStart: startIndex,
      spokenEnd: Math.max(startIndex + 1, endIndex),
      matched,
    });
  };

  const matchExpandedToken = (scriptIndex: number, cursor: number) => {
    const variants = alignmentVariants(tokens[scriptIndex]);
    if (!variants.length) return null;
    const maxSpokenSpan = Math.min(8, spoken.length - cursor);
    // Prefer an exact expansion before typo-tolerant matching. Otherwise a
    // fuzzy prefix such as "Quen three eight two seven" can win before its
    // final spoken "B", shifting every following cue by one word.
    for (const variant of variants) {
      const wanted = variant.join('');
      for (let span = 1; span <= maxSpokenSpan; span += 1) {
        const spokenJoined = spoken
          .slice(cursor, cursor + span)
          .map((word) => alignmentToken(word.word))
          .join('');
        if (spokenJoined === wanted) return span;
      }
    }
    let best: {span: number; score: number} | null = null;
    for (const variant of variants) {
      const wanted = variant.join('');
      // A source word may be joined into one provider token or split into a
      // couple of tokens, but never absorb an arbitrary following sentence.
      const minSpan = Math.max(1, variant.length - 2);
      const maxSpan = Math.min(maxSpokenSpan, variant.length + 2);
      for (let span = minSpan; span <= maxSpan; span += 1) {
        const spokenJoined = spoken
          .slice(cursor, cursor + span)
          .map((word) => alignmentToken(word.word))
          .join('');
        if (!spokenJoined || !equivalentAlignment(wanted, spokenJoined)) continue;
        const score =
          Math.abs(span - variant.length) * 10 + editDistance(wanted, spokenJoined);
        if (!best || score < best.score || (score === best.score && span > best.span)) {
          best = {span, score};
        }
      }
    }
    return best?.span ?? null;
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const wanted = alignmentToken(tokens[index]);
    if (!wanted) continue;

    const current = alignmentToken(spoken[spokenCursor]?.word ?? '');
    const expandedSpan = matchExpandedToken(index, spokenCursor);
    if (expandedSpan) {
      pushTiming(index, spokenCursor, spokenCursor + expandedSpan, true);
      matchedCount += 1;
      spokenCursor += expandedSpan;
      continue;
    }

    // One spoken token can represent two or three source tokens (for example,
    // a hyphenated phrase that Cartesia normalises as one word).
    let scriptSpan = 0;
    for (let span = 2; span <= 3 && index + span <= tokens.length; span += 1) {
      const joined = tokens
        .slice(index, index + span)
        .map(alignmentToken)
        .join('');
      if (equivalentAlignment(joined, current)) {
        scriptSpan = span;
        break;
      }
    }
    if (scriptSpan) {
      for (let offset = 0; offset < scriptSpan; offset += 1) {
        pushTiming(index + offset, spokenCursor, spokenCursor + 1, true);
      }
      matchedCount += scriptSpan;
      index += scriptSpan - 1;
      spokenCursor += 1;
      continue;
    }

    // A source token can be spoken as several tokens ("real-time" is the
    // common example). Collapse up to three adjacent provider words.
    let spokenSpan = 0;
    for (let span = 2; span <= 3 && spokenCursor + span <= spoken.length; span += 1) {
      const joined = spoken
        .slice(spokenCursor, spokenCursor + span)
        .map((word) => alignmentToken(word.word))
        .join('');
      if (equivalentAlignment(joined, wanted)) {
        spokenSpan = span;
        break;
      }
    }
    if (spokenSpan) {
      pushTiming(index, spokenCursor, spokenCursor + spokenSpan, true);
      matchedCount += 1;
      spokenCursor += spokenSpan;
      continue;
    }

    // A compact ID, unit, or name may have several spoken words that are not
    // recoverable from the source spelling. Look ahead for the next source
    // word that does match and assign this unmatched span to the words before
    // it. This prevents one mismatch from shifting every later cue by one.
    let resyncSpoken = -1;
    const scriptLookaheadEnd = Math.min(tokens.length, index + 8);
    const spokenLookaheadEnd = Math.min(spoken.length, spokenCursor + 24);
    for (let nextScript = index + 1; nextScript < scriptLookaheadEnd && resyncSpoken < 0; nextScript += 1) {
      for (let nextSpoken = spokenCursor + 1; nextSpoken < spokenLookaheadEnd; nextSpoken += 1) {
        const nextSpan = matchExpandedToken(nextScript, nextSpoken);
        if (nextSpan) {
          resyncSpoken = nextSpoken;
          break;
        }
      }
    }
    if (resyncSpoken > spokenCursor) {
      pushTiming(index, spokenCursor, resyncSpoken, false);
      spokenCursor = resyncSpoken;
      continue;
    }

    // Keep the mapping monotonic when punctuation, a number pronunciation, or
    // a provider normalisation differs. The match ratio below prevents this
    // conservative fallback from accepting a completely different transcript.
    const fallbackIndex = Math.min(spokenCursor, spoken.length - 1);
    pushTiming(index, fallbackIndex, fallbackIndex + 1, false);
    spokenCursor = Math.min(spoken.length, spokenCursor + 1);
  }

  if (result.length !== tokens.length) {
    throw new Error('Cartesia word alignment did not cover every script word. Retry voiceover.');
  }
  const minimumMatches = Math.max(1, Math.ceil(tokens.length * 0.75));
  if (matchedCount < minimumMatches) {
    throw new Error(
      `Cartesia word alignment was too different from the pasted script (${matchedCount}/${tokens.length} words matched). Check the script and retry voiceover.`,
    );
  }
  return result;
};

const countWords = (text: string) => scriptWords(text).length;

/**
 * Sentence boundaries. A period only ends a sentence when what follows starts
 * a new one, so "tinyurl.com/abc" and "Mr. Smith" stay whole.
 */
const splitSentences = (text: string): string[] => {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (!'.?!'.includes(text[i])) continue;
    // Run past "?!" and any closing quote or bracket.
    let end = i;
    while (end + 1 < text.length && '.?!"\')]'.includes(text[end + 1])) end += 1;
    const after = text.slice(end + 1);
    // A boundary needs whitespace then something that opens a sentence.
    if (!/^\s+["'(]?[A-Z0-9]/.test(after)) continue;
    // An initial or a lone abbreviation is not a boundary.
    const before = text.slice(start, end + 1);
    if (/(?:^|\s)(?:[A-Z]|Mr|Mrs|Ms|Dr|St|vs|etc|e\.g|i\.e)\.$/.test(before)) continue;
    out.push(before.trim());
    start = end + 1;
  }
  const tail = text.slice(start).trim();
  if (tail) out.push(tail);
  return out.filter(Boolean);
};

/** Clause joints, best first: a split here reads as a natural breath. */
const CLAUSE_JOINTS = [
  /\s+—\s+/,
  /\s+–\s+/,
  /\s*;\s*/,
  /,\s+(?=(?:and|but|so|because|which|while|then|until|unless)\b)/i,
  /\s+(?=(?:but|because|so that|which means)\b)/i,
  /,\s+/,
];

/**
 * Words that open a subordinate clause. A long run of speech with no commas
 * in it — which is most of how people actually talk — has no punctuation to
 * split on, so the split falls back to these.
 */
const JOINT_WORDS = new Set([
  'and',
  'but',
  'so',
  'because',
  'which',
  'while',
  'when',
  'where',
  'that',
  'if',
  'then',
  'after',
  'before',
  'since',
  'until',
  'unless',
  'though',
  'although',
  'or',
]);

/** Split into two at whichever word boundary is closest to the middle. */
const splitAtWord = (text: string): string[] | null => {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < MIN_BEAT_WORDS * 2) return null;
  const middle = words.length / 2;

  const legal = (index: number) =>
    index >= MIN_BEAT_WORDS && words.length - index >= MIN_BEAT_WORDS;

  // A connective near the middle first; a bare midpoint cut only if there is
  // none. Either beats leaving a beat over the cap, since a beat is a timing
  // unit and the planner regroups them into shots anyway.
  const connectives = words
    .map((word, index) => ({index, word: word.toLowerCase().replace(/[^a-z]/g, '')}))
    .filter(({index, word}) => legal(index) && JOINT_WORDS.has(word))
    .sort((a, b) => Math.abs(a.index - middle) - Math.abs(b.index - middle));

  const at = connectives.length ? connectives[0].index : Math.round(middle);
  if (!legal(at)) return null;
  return [words.slice(0, at).join(' '), words.slice(at).join(' ')];
};

/** Split until every piece is under the cap. */
const splitLongBeat = (text: string): string[] => {
  if (countWords(text) <= MAX_BEAT_WORDS) return [text];

  for (const joint of CLAUSE_JOINTS) {
    // Only split at a joint that leaves both halves substantial.
    const pieces = text
      .split(joint)
      .map((piece) => piece.trim())
      .filter(Boolean);
    if (pieces.length < 2) continue;
    if (pieces.some((piece) => countWords(piece) < MIN_BEAT_WORDS)) continue;
    return pieces.flatMap(splitLongBeat);
  }

  const halves = splitAtWord(text);
  return halves ? halves.flatMap(splitLongBeat) : [text];
};

/** Fold fragments into whichever neighbour keeps beats closest to even. */
const mergeFragments = (pieces: string[]): string[] => {
  const out: string[] = [];
  for (const piece of pieces) {
    const previous = out[out.length - 1];
    if (previous && countWords(piece) < MIN_BEAT_WORDS) {
      out[out.length - 1] = `${previous} ${piece}`;
      continue;
    }
    out.push(piece);
  }
  // A leading fragment has no previous to join, so it folds forward instead.
  if (out.length > 1 && countWords(out[0]) < MIN_BEAT_WORDS) {
    out[1] = `${out[0]} ${out[1]}`;
    out.shift();
  }
  return out;
};

export type ParseTranscriptOptions = {
  /** Speaking rate used to estimate every duration. */
  wpm?: number;
  /** Where the first beat starts, for a transcript that begins mid-video. */
  offsetMs?: number;
};

export const parseTranscript = (
  raw: string,
  {wpm = DEFAULT_WPM, offsetMs = 0}: ParseTranscriptOptions = {},
): Beat[] => {
  const text = cleanTranscript(raw);
  if (!text) return [];

  const pieces = mergeFragments(splitSentences(text).flatMap(splitLongBeat));
  const msPerWord = 60000 / Math.max(60, wpm);

  let cursor = Math.max(0, offsetMs);
  let wordCursor = 0;
  return pieces.map((piece, index) => {
    const wordCount = countWords(piece);
    const startMs = cursor;
    const endMs = startMs + Math.max(MIN_BEAT_MS, Math.round(wordCount * msPerWord));
    cursor = endMs;
    const wordStart = wordCursor;
    wordCursor += wordCount;
    return {
      id: `beat-${index}`,
      index,
      text: piece,
      wordCount,
      wordStart,
      wordEnd: wordCursor,
      startMs,
      endMs,
    };
  });
};

export const transcriptDurationMs = (beats: Beat[]) =>
  beats.length ? beats[beats.length - 1].endMs : 0;

/** Beats joined back into the narration a shot covers. */
export const beatsText = (beats: Beat[]) => beats.map((beat) => beat.text).join(' ');

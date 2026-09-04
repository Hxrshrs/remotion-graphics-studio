/**
 * Surgical edits.
 *
 * A model asked to change one line of a 200-line scene used to have to
 * re-emit all 200, and every re-emission is a chance to silently drop a
 * label, reorder a beat, or reformat something the user had already
 * accepted. Instead an edit reply carries only find/replace blocks, and the
 * untouched source is copied here, in code, where it cannot drift.
 *
 * Matching is deliberately forgiving about indentation because that is the
 * one thing models reproduce badly, and deliberately strict about ambiguity:
 * a find block that matches in two places is rejected rather than guessed at,
 * with a message telling the model to include more context.
 */

export type SceneEdit = {
  find: string;
  replace: string;
};

export type PatchResult =
  | {ok: true; code: string; applied: number}
  | {ok: false; error: string};

const EDIT_BLOCK =
  /<{5,}\s*FIND\s*\n([\s\S]*?)\n?={5,}\s*\n([\s\S]*?)\n?>{5,}\s*REPLACE/gi;

/** Pull `<<<<<<< FIND … ======= … >>>>>>> REPLACE` blocks out of a raw reply. */
export const parseEditBlocks = (raw: string): SceneEdit[] => {
  const edits: SceneEdit[] = [];
  EDIT_BLOCK.lastIndex = 0;
  for (const match of raw.matchAll(EDIT_BLOCK)) {
    edits.push({find: match[1], replace: match[2]});
  }
  return edits;
};

const lines = (value: string) => value.replace(/\r\n/g, '\n').split('\n');

/** Indentation and trailing whitespace are the parts models reproduce worst. */
const loose = (line: string) => line.trim().replace(/\s+/g, ' ');

/**
 * Every start index at which `needle` appears in `haystack` as a run of
 * lines, compared with whitespace normalised away. Blank lines inside the
 * needle are ignored so a model that adds or drops one still matches.
 */
const findLineRuns = (haystack: string[], needle: string[]) => {
  const hits: Array<{start: number; end: number}> = [];
  const wanted = needle.map(loose).filter((line) => line.length > 0);
  if (!wanted.length) return hits;

  for (let start = 0; start < haystack.length; start += 1) {
    let cursor = start;
    let matched = 0;
    while (cursor < haystack.length && matched < wanted.length) {
      const current = loose(haystack[cursor]);
      if (!current) {
        cursor += 1;
        continue;
      }
      if (current !== wanted[matched]) break;
      matched += 1;
      cursor += 1;
    }
    if (matched === wanted.length) hits.push({start, end: cursor});
  }
  return hits;
};

const preview = (value: string, limit = 160) => {
  const flat = value.trim().split('\n')[0];
  return flat.length > limit ? `${flat.slice(0, limit)}…` : flat;
};

/**
 * Reindent a replacement so it lands at the same depth as the code it
 * replaces. Models frequently emit a block flush-left; the scene still
 * compiles, but the source the user reads afterwards should not degrade.
 */
const reindent = (replacement: string[], targetIndent: string, sourceIndent: string) => {
  if (targetIndent === sourceIndent) return replacement;
  return replacement.map((line) => {
    if (!line.trim()) return line;
    const stripped = line.startsWith(sourceIndent) ? line.slice(sourceIndent.length) : line.trimStart();
    return `${targetIndent}${stripped}`;
  });
};

const indentOf = (line: string) => line.match(/^\s*/)?.[0] ?? '';

/** Apply every edit in order. Any failure aborts: a half-patched scene is worse than none. */
export const applyEdits = (source: string, edits: SceneEdit[]): PatchResult => {
  if (!edits.length) return {ok: false, error: 'The reply contained no edit blocks.'};

  let current = source.replace(/\r\n/g, '\n');

  for (const [index, edit] of edits.entries()) {
    const label = `Edit ${index + 1} ("${preview(edit.find)}")`;

    if (!edit.find.trim()) {
      return {ok: false, error: `${label} has an empty FIND section.`};
    }

    // Fast path: the model reproduced the source exactly.
    const exact = current.split(edit.find);
    if (exact.length === 2) {
      current = exact.join(edit.replace);
      continue;
    }
    if (exact.length > 2) {
      return {
        ok: false,
        error: `${label} matches ${exact.length - 1} places in the scene. Include more surrounding lines so it identifies exactly one.`,
      };
    }

    const haystack = lines(current);
    const hits = findLineRuns(haystack, lines(edit.find));
    if (hits.length === 0) {
      return {
        ok: false,
        error: `${label} does not appear in the current scene. Copy the lines to change verbatim from CURRENT SCENE.`,
      };
    }
    if (hits.length > 1) {
      return {
        ok: false,
        error: `${label} matches ${hits.length} places in the scene. Include more surrounding lines so it identifies exactly one.`,
      };
    }

    const {start, end} = hits[0];
    const replacement = lines(edit.replace);
    const firstMeaningful = replacement.find((line) => line.trim()) ?? '';
    const reindented = reindent(replacement, indentOf(haystack[start]), indentOf(firstMeaningful));
    haystack.splice(start, end - start, ...reindented);
    current = haystack.join('\n');
  }

  return {ok: true, code: current, applied: edits.length};
};

/** Rough share of the scene an edit set rewrites, for diagnostics. */
export const editFootprint = (source: string, edits: SceneEdit[]) => {
  const total = Math.max(1, source.length);
  // Count the larger side so a tiny FIND block cannot smuggle an entire
  // replacement scene through an otherwise valid-looking patch.
  const touched = edits.reduce(
    (sum, edit) => sum + Math.max(edit.find.length, edit.replace.length),
    0,
  );
  return Math.min(1, touched / total);
};

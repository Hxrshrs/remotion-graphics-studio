import {requestGoogleCompletion} from './google';
import {PROVIDER_LABEL, keyFieldForProvider, providerForModel, sanitizeApiKey} from './models';
import {requestOpenRouterCompletion} from './openrouter';
import {requestOpenLuxCompletion} from './openlux';
import {requestCodexCompletion} from './codex';
import {applyEdits, parseEditBlocks} from './patch';
import {isExplicitRewriteInstruction} from './intent';
import {HouseStyle} from './prompt';
import {Attachment, StudioSettings} from './types';

export type SceneReply = {
  /** The one-line note the assistant wrote about the graphic. */
  message: string;
  /** The complete JSX source for the scene, after any edits were applied. */
  code: string;
  /** How the model produced it: a patch onto the current scene, or a rewrite. */
  mode: 'edit' | 'full';
  /** Number of find/replace blocks applied, when mode is 'edit'. */
  editCount?: number;
  /** Frames at 60fps, if the model specified one. */
  durationInFrames?: number;
  /** Short project name the model proposed, if it included a TITLE line. */
  title?: string;
  /** USD charged for this call; 0 for the free Google models, null if unknown. */
  cost: number | null;
};

/**
 * The model asked for a surgical edit but its find/replace blocks did not
 * land. The caller retries with the same source and clearer matching
 * instructions, preserving the existing scene throughout the repair loop.
 */
export class EditPatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EditPatchError';
  }
}

/** A provider tried to replace an existing scene during an ordinary edit. */
export class FullRewriteBlockedError extends Error {
  constructor(
    message =
      'The model returned a complete rewrite for an existing scene. Keep the current scene intact and return only FIND/REPLACE blocks for the requested change.',
  ) {
    super(message);
    this.name = 'FullRewriteBlockedError';
  }
}

type RequestSceneArgs = {
  settings: StudioSettings;
  model: string;
  instruction: string;
  currentCode?: string;
  currentDurationInFrames?: number;
  repairError?: string;
  /** Ask for the complete source rather than an edit, after a patch failed. */
  forceFullRewrite?: boolean;
  history?: Array<{role: 'user' | 'assistant'; content: string}>;
  images?: Attachment[];
  /** 'cut' layers the shared paper-and-orange house style over the prompt. */
  houseStyle?: HouseStyle;
};

const CODE_FENCE = /```(?:jsx|tsx|js|javascript|react)?[ \t]*(?:\r?\n)?([\s\S]*?)```/i;
const BARE_SCENE = /(?:^|\n)\s*((?:const|let|var)\s+Scene\s*=|function\s+Scene\s*\()/m;

const bareSceneSource = (raw: string) => {
  const marker = raw.match(BARE_SCENE);
  if (marker?.index === undefined) return null;
  const markerOffset = marker[0].lastIndexOf(marker[1]);
  const source = raw.slice(marker.index + markerOffset).trim().replace(/```\s*$/i, '').trim();
  // A prose sentence can mention "const Scene =". Require syntax that looks
  // like an actual component before treating an unfenced reply as source.
  return /(?:=>|return\s*\()[\s\S]*<[A-Za-z]/.test(source) ? source : null;
};

export class InvalidSceneReplyError extends Error {
  constructor(
    message: string,
    public readonly rawReply: string,
  ) {
    super(message);
    this.name = 'InvalidSceneReplyError';
  }
}

export const parseSceneReply = (
  raw: string,
  cost: number | null = null,
  currentCode?: string,
): SceneReply => {
  // Edit blocks are read before the code fence: a model that wraps its
  // find/replace blocks in ```jsx would otherwise look like a full rewrite
  // consisting of patch markers.
  const edits = currentCode?.trim() ? parseEditBlocks(raw) : [];
  const fenced = raw.match(CODE_FENCE);
  const bare = fenced ? null : bareSceneSource(raw);

  let code: string;
  let mode: SceneReply['mode'] = 'full';
  let editCount: number | undefined;

  if (edits.length && currentCode) {
    const patched = applyEdits(currentCode, edits);
    if (!patched.ok) throw new EditPatchError(patched.error);
    code = patched.code.trim();
    mode = 'edit';
    editCount = patched.applied;
  } else if (fenced) {
    code = fenced[1].trim();
  } else if (bare) {
    code = bare;
  } else {
    throw new InvalidSceneReplyError(
      'The model returned no usable scene code or FIND/REPLACE edits, so the existing graphic was left unchanged.',
      raw,
    );
  }

  const durationMatch = raw.match(/DURATION\s*[:=]\s*(\d{1,5})/i);
  const durationInFrames = durationMatch ? Number(durationMatch[1]) : undefined;

  const titleMatch = raw.match(/^TITLE\s*[:=]\s*(.+)$/im);
  const title = titleMatch
    ? titleMatch[1].trim().replace(/^["'`]+|["'`]+$/g, '').slice(0, 60)
    : undefined;

  // Everything before the first code or edit block, minus the metadata
  // lines, is the note.
  const noteEnd = Math.min(
    ...[fenced?.index, bare ? raw.search(BARE_SCENE) : undefined, raw.search(/<{5,}\s*FIND/i)]
      .filter((index): index is number => typeof index === 'number' && index >= 0)
      .concat(raw.length),
  );
  const note = raw
    .slice(0, noteEnd)
    .replace(/^TITLE\s*[:=]\s*.+$/im, '')
    .replace(/DURATION\s*[:=]\s*\d{1,5}/i, '')
    .replace(/```/g, '')
    .trim();

  return {
    message: note || 'Updated the graphic on the canvas.',
    code,
    mode,
    editCount,
    durationInFrames:
      durationInFrames && durationInFrames >= 30 && durationInFrames <= 3600
        ? durationInFrames
        : undefined,
    title: title || undefined,
    cost,
  };
};

/** Thrown when the selected model's provider has no key configured yet. */
export class MissingKeyError extends Error {
  constructor(public readonly provider: ReturnType<typeof providerForModel>) {
    super(
      `Add your ${PROVIDER_LABEL[provider]} API key in Settings, then send that direction again.`,
    );
    this.name = 'MissingKeyError';
  }
}

export const hasKeyForModel = (settings: StudioSettings, model: string) => {
  const provider = providerForModel(model);
  const keyField = keyFieldForProvider[provider];
  return provider === 'codex' || Boolean(keyField && sanitizeApiKey(settings[keyField] ?? ''));
};

/**
 * One entry point for all providers. Each transport returns raw reply text in
 * the same prose + fenced-code shape, so parsing and the repair loop upstream
 * do not care which model answered.
 */
export const requestScene = async ({
  settings,
  model,
  instruction,
  currentCode,
  currentDurationInFrames,
  repairError,
  forceFullRewrite,
  history = [],
  images = [],
  houseStyle,
}: RequestSceneArgs): Promise<SceneReply> => {
  const provider = providerForModel(model);
  const allowFullRewrite = Boolean(forceFullRewrite) || isExplicitRewriteInstruction(instruction);
  if (provider === 'codex') {
    const {text, cost} = await requestCodexCompletion({
      model,
      instruction,
      currentCode,
      currentDurationInFrames,
      repairError,
      forceFullRewrite: allowFullRewrite,
      history,
      images,
      houseStyle,
    });
    const parsed = parseSceneReply(text, cost, allowFullRewrite ? undefined : currentCode);
    if (currentCode?.trim() && !allowFullRewrite && parsed.mode === 'full') {
      throw new FullRewriteBlockedError();
    }
    return parsed;
  }

  const keyField = keyFieldForProvider[provider];
  const apiKey = keyField ? sanitizeApiKey(settings[keyField] ?? '') : '';
  if (!apiKey) throw new MissingKeyError(provider);

  const args = {
    apiKey,
    model,
    instruction,
    currentCode,
    currentDurationInFrames,
    repairError,
    forceFullRewrite: allowFullRewrite,
    history,
    images,
    houseStyle,
  };
  const {text, cost} =
    provider === 'google'
      ? await requestGoogleCompletion(args)
      : provider === 'openlux'
        ? await requestOpenLuxCompletion(args)
        : await requestOpenRouterCompletion(args);

  const parsed = parseSceneReply(text, cost, allowFullRewrite ? undefined : currentCode);
  if (currentCode?.trim() && !allowFullRewrite && parsed.mode === 'full') {
    throw new FullRewriteBlockedError();
  }
  return parsed;
};

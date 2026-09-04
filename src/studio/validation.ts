import {resolveSceneIntent} from './intent';
import {cutStyleFromInstruction} from './editorStyle';
import {resolveBrandLogoSlug} from './logos';

type History = Array<{role: 'user' | 'assistant'; content: string}>;

/**
 * Source checks, split by how the pipeline may treat them.
 *
 * `issues` are fatal-only: identifiers from libraries the runtime does not
 * ship, and APIs that were removed. Nothing that merely looks a certain way
 * lives here — this gate used to reject stylistic choices, which turned a
 * perfectly renderable scene into a failed generation and burned the repair
 * budget on a preference. Taste is the prompt's job, and where taste still
 * needs a nudge it returns as an advisory `note` that never blocks a scene.
 */

const IMPOSSIBLE: Array<{pattern: RegExp; message: string}> = [
  {
    pattern: /\buseFrame\s*\(/,
    message: '`useFrame()` does not exist. Use `useCurrentFrame()`.',
  },
  {
    pattern: /\bstudio\.[A-Z][A-Za-z0-9]*/,
    message:
      'Preset components no longer exist. Build the scene with JSX, SVG, and the runtime helpers.',
  },
  {
    pattern: /\bmotion\.[a-z]+|\bframer-motion\b|\bAnimatePresence\b/,
    message:
      'framer-motion is not available. Animate with anim() and the ui.Rise / ui.Wipe / ui.Grow helpers.',
  },
  {
    pattern: /\bgsap\b|\banime\s*\(|\bd3\.[a-z]/,
    message:
      'External animation and charting libraries are not available. Use anim(), scale(), and SVG.',
  },
  {
    pattern: /\bstyled\.[a-z]+|\bstyled\s*\(/,
    message: 'styled-components is not available. Use inline style objects.',
  },
  {
    pattern: /\brequire\s*\(/,
    message: 'There is no module loader. Every helper is already in scope.',
  },
  {
    pattern: /\b(?:fetch|XMLHttpRequest)\s*\(/,
    message: 'Network access is unavailable. Scenes must render from supplied content alone.',
  },
  {
    pattern: /\bMath\.random\s*\(/,
    message:
      '`Math.random()` makes the scene render differently on every frame. Use `random(seed)`, which is deterministic.',
  },
  {
    pattern: /(?:\banimation|\btransition)\s*:/i,
    message:
      'CSS transitions and animations are not allowed. Drive the focal motion from the frame with anim() and the ui reveal helpers.',
  },
  {
    pattern: /@keyframes\b/i,
    message:
      'CSS keyframes are not allowed. Use one frame-timed reveal for the focal element instead of an unbounded or looping animation.',
  },
];

export type SceneSourceCheck = {
  /** Fatal: the scene cannot run at all. Repaired with a fresh attempt. */
  issues: string[];
  /** Advisory: taste, offered to one optional polish pass if cheap. */
  notes: string[];
};

export const validateSceneSource = ({
  code,
  instruction = '',
  history = [],
}: {
  code: string;
  instruction?: string;
  history?: History;
  isNewScene?: boolean;
}): SceneSourceCheck => {
  const issues: string[] = [];
  const notes: string[] = [];
  for (const {pattern, message} of IMPOSSIBLE) {
    if (pattern.test(code)) issues.push(message);
  }

  // A logo is an external, named asset: accepting a guessed slug silently
  // produces a blank image in both the preview and the render. Require a
  // literal name and resolve it against the same curated registry used by the
  // Logo component. This also catches dynamic names that cannot be verified.
  for (const match of code.matchAll(/<ui\.Logo\b([\s\S]*?)(?:\/?>)/g)) {
    const props = match[1] ?? '';
    const nameMatch = props.match(
      /\bname\s*=\s*(?:"([^"]+)"|'([^']+)'|\{\s*(['"])(.*?)\3\s*\})/,
    );
    const name = nameMatch?.[1] ?? nameMatch?.[2] ?? nameMatch?.[4];
    if (!name || !resolveBrandLogoSlug(name)) {
      issues.push(
        `This ui.Logo does not use a verified theSVG slug. Set name to one literal slug from the curated brand list; never guess or compute a logo name.`,
      );
    }
  }

  // GIPHY is also an externally sourced named asset. A generated scene may
  // use only a literal MP4/page pair that the live Trending resolver placed
  // in this exact instruction. This makes a hallucinated or stale URL fatal
  // before it ever reaches preview or render.
  const verifiedGiphyMp4 = new Set(
    [...instruction.matchAll(/^\s*MP4:\s*"([^"]+)"\s*$/gm)].map((match) => match[1]),
  );
  const verifiedGiphyPages = new Set(
    [...instruction.matchAll(/^\s*PAGE:\s*"([^"]+)"\s*$/gm)].map((match) => match[1]),
  );
  const verifiedGiphyPairs = new Set(
    [...instruction.matchAll(/^\s*MP4:\s*"([^"]+)"\s*\n\s*PAGE:\s*"([^"]+)"\s*$/gm)].map(
      (match) => `${match[1]}\n${match[2]}`,
    ),
  );
  const giphyComponents = [...code.matchAll(/<ui\.Giphy\b([\s\S]*?)(?:\/?>)/g)];
  if (giphyComponents.length > 1) {
    issues.push('Use at most one verified ui.Giphy component in a shot.');
  }
  const literalProp = (props: string, name: string) => {
    const expression = props.match(
      new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]+)"|'([^']+)'|\\{\\s*(['"])(.*?)\\3\\s*\\})`),
    );
    return expression?.[1] ?? expression?.[2] ?? expression?.[4];
  };
  for (const match of giphyComponents) {
    const props = match[1] ?? '';
    const src = literalProp(props, 'src');
    const sourceUrl = literalProp(props, 'sourceUrl');
    if (!src || !verifiedGiphyMp4.has(src)) {
      issues.push(
        'ui.Giphy src must be one literal exact MP4 URL from VERIFIED CURRENT GIPHY ASSETS.',
      );
    }
    if (!sourceUrl || !verifiedGiphyPages.has(sourceUrl)) {
      issues.push(
        'ui.Giphy sourceUrl must be the literal exact GIPHY PAGE URL supplied with that asset.',
      );
    }
    if (src && sourceUrl && !verifiedGiphyPairs.has(`${src}\n${sourceUrl}`)) {
      issues.push('ui.Giphy must keep the verified MP4 and PAGE URLs from the same GIPHY asset.');
    }
  }
  // A photograph is an external named asset like a GIPHY clip: an invented or
  // stale path renders as an empty frame in the player AND in the export, so
  // the only accepted src is the exact local or same-origin path resolved for this shot.
  const verifiedPhotoFiles = new Set(
    [...instruction.matchAll(/<ui\.Photo src=(?:\{\s*)?["']([^"']+)["'](?:\s*\})?/g)].map(
      (match) => match[1],
    ),
  );
  const photoComponents = [...code.matchAll(/<ui\.Photo\b([\s\S]*?)(?:\/?>)/g)];
  if (photoComponents.length > 1) {
    issues.push('Use at most one ui.Photo in a shot: one photograph is the anchor, a wall of them is a slideshow.');
  }
  for (const match of photoComponents) {
    const props = match[1] ?? '';
    const direct = props.match(/\bsrc\s*=\s*(?:\{\s*)?['"]([^'"]+)['"](?:\s*\})?/);
    const local = props.match(/\bsrc\s*=\s*\{\s*staticFile\(\s*['"]([^'"]+)['"]\s*\)\s*\}/);
    const file = direct ?? local;
    if (!file || !verifiedPhotoFiles.has(file[1])) {
      issues.push(
        verifiedPhotoFiles.size
          ? `ui.Photo src must be exactly ${JSON.stringify([...verifiedPhotoFiles][0])} — the photograph resolved for this shot.`
          : 'No photograph was resolved for this shot, so ui.Photo cannot be used. Draw the idea instead.',
      );
    }
  }
  if (/<(?:ui\.WebImage|Img)\b[^>]*\bsrc\s*=\s*['"]https?:/i.test(code) && verifiedPhotoFiles.size) {
    issues.push('Render the shot\'s photograph with ui.Photo and its verified source, not a raw Img/WebImage URL.');
  }
  const hasRawGiphyUrl = /https:\/\/[^\s'"}]*giphy\.com\//i.test(code);
  if (hasRawGiphyUrl && giphyComponents.length === 0) {
    issues.push('GIPHY media must use ui.Giphy with an exact verified Trending asset.');
  }
  if (instruction.includes('WORD-LOCKED VOICE CUES') && !/\bvoiceCue\s*\(/.test(code)) {
    issues.push(
      'This shot has measured voice cues but does not call `voiceCue()`. Anchor every meaning-bearing animation to its spoken phrase with `voiceCue(phrase, occurrence, fallbackFrame)`.',
    );
  }
  const isKineticCenterBuild = /WHAT TO BUILD\s*\n\s*KINETIC CENTER BUILD:/i.test(instruction);
  if (isKineticCenterBuild) {
    const kineticCount = (code.match(/<ui\.KineticCenterBuild\b/g) ?? []).length;
    if (kineticCount !== 1) {
      issues.push('A KINETIC CENTER BUILD shot must render exactly one ui.KineticCenterBuild.');
    }
    if (/<(?:Img|Video|OffthreadVideo|WebImage|svg)\b/.test(code)) {
      issues.push('A KINETIC CENTER BUILD shot is typography-only; remove images, video, GIFs, and SVG.');
    }
    const layoutWrappers = new Set(['KineticCenterBuild', 'Center', 'Box', 'Slot', 'Fill']);
    const otherUi = [...code.matchAll(/<ui\.([A-Z][A-Za-z0-9]*)\b/g)]
      .map((match) => match[1])
      .filter((name) => !layoutWrappers.has(name));
    if (otherUi.length) {
      issues.push(
        `A KINETIC CENTER BUILD shot cannot add other foreground components (${Array.from(new Set(otherUi)).join(', ')}).`,
      );
    }
  }
  // A colour emoji, but not a text-default dingbat: ➔ and ✔ are punctuation in
  // these scenes, while ⏱️ is an emoji only because of its variation selector.
  const EMOJI_GLYPH = /(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F)/u;
  const marksOnScreen = [...code.matchAll(/<ui\.(?:Icon|DevIcon|Logo)\b[\s\S]{0,400}?\/?>/g)];
  // Two glyphs for one subject — the icon-in-a-tile with an unrelated emoji
  // stacked under it. Anything within the next few hundred characters is
  // still inside the same card in practice.
  const stackedMark = marksOnScreen.some((match) => {
    const after = code.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + match[0].length + 320);
    return EMOJI_GLYPH.test(after.split(/<ui\.(?:Icon|DevIcon|Logo)\b/)[0] ?? '');
  });
  if (stackedMark) {
    notes.push(
      'One mark per subject: an emoji sits directly beside or beneath an icon or logo. Keep the most specific mark (logo, then icon, then emoji) and delete the other.',
    );
  }
  // The shot's own words name a product with a verified mark, and the scene
  // drew something else. This is the exact failure that put four generic
  // glyphs on a comparison of four real inference tools.
  // Read the slugs the instruction already resolved for this shot rather than
  // re-scanning it: the style brief itself names brands as examples, and
  // detecting those would fire this note on every shot.
  const suppliedBrands = [
    ...instruction.matchAll(/^- (.+?) \u2192 <ui\.Logo name="([a-z0-9-]+)"/gm),
  ].map((match) => ({label: match[1], slug: match[2]}));
  if (suppliedBrands.length && !/<ui\.Logo\b/.test(code)) {
    notes.push(
      `This shot names ${suppliedBrands.map(({label}) => label).join(', ')}, ${suppliedBrands.length === 1 ? 'which has a verified theSVG mark' : 'which have verified theSVG marks'}. Render ${suppliedBrands.map(({slug}) => `ui.Logo name="${slug}"`).join(', ')} instead of a generic icon or emoji.`,
    );
  }
  const intent = resolveSceneIntent(instruction, history);
  const isDevTheme = cutStyleFromInstruction(instruction) === 'dev';
  if (isDevTheme) {
    // Every check below is taste, and none of them stops a scene from
    // rendering, so they are advisories. They used to be rejections: a dev
    // shot that merely used a border, a tinted gray, or a 1920-wide root was
    // thrown away and regenerated, and when the three attempts ran out the
    // shot failed outright. That is why dev shots were slow and fell over
    // while paper shots did not. The dev system prompt owns enforcement.
    const devNote = (message: string) => notes.push(message);
    const isGroupedContinuation = /CONTINUE FROM THE PREVIOUS SCENE/.test(instruction);
    const usesDevGroupMorph = /<ui\.DevGroupMorph\b/.test(code);
    if (isGroupedContinuation && !usesDevGroupMorph) {
      devNote(
        'A grouped dev continuation must use ui.DevGroupMorph for a shared-element handoff. Match the previous settled frame at frame 0, move one retained component, fade stale support out, and fade replacement support in; never jump directly to a new complete frame.',
      );
    }
    if (!isGroupedContinuation && usesDevGroupMorph) {
      devNote('ui.DevGroupMorph is reserved for grouped continuation shots. Remove it from this standalone scene.');
    }
    // Dev styling used to tempt the model into fabricating convincing-looking
    // shell commands (for example "memdump --raw") and diagnostic headings.
    // Terminal text is evidence, not decoration: when command-shaped copy is
    // rendered, require it to occur in the shot's narration or build brief.
    const suppliedShotContent = instruction;
    const normaliseVisibleCopy = (value: string) =>
      value
        .replace(/\\([\\'"`])/g, '$1')
        .toLowerCase()
        .replace(/[^a-z0-9$./:_-]+/g, ' ')
        .trim();
    const suppliedCopy = normaliseVisibleCopy(suppliedShotContent);
    const suppliedWords = new Set(suppliedCopy.split(/\s+/).filter(Boolean));

    const COMMON_DEV_TERMS = new Set([
      'ms', 's', 'sec', 'seconds', 'min', 'max', 'avg', 'fps', 'hz', 'mhz', 'ghz',
      'b', 'kb', 'mb', 'gb', 'tb', 'pb', 'req', 'res', 'reqs', 'qps', 'tps', 'iops',
      'px', 'em', 'rem', '%', 'x', 'k', 'm',
      'ok', 'done', 'pass', 'passed', 'fail', 'failed', 'err', 'error', 'warn', 'warning', 'info',
      'debug', 'trace', 'idle', 'active', 'ready', 'pending', 'running', 'success',
      'get', 'post', 'put', 'delete', 'patch', 'head', 'options',
      'cpu', 'gpu', 'ram', 'memory', 'disk', 'net', 'network', 'io', 'load', 'latency', 'uptime',
      'http', 'https', 'ws', 'wss', 'tcp', 'udp', 'ip', 'dns', 'ssl', 'tls', 'ssh',
      'api', 'sdk', 'cli', 'app', 'ui', 'ux', 'db', 'sql', 'nosql', 'git', 'pr', 'ci', 'cd',
      'dev', 'prod', 'staging', 'test', 'local', 'host', 'port', 'status', 'version', 'v1', 'v2',
      'build', 'run', 'start', 'stop', 'exit', 'init', 'create', 'update',
      'in', 'out', 'to', 'from', 'by', 'for', 'with', 'and', 'or', 'not', 'true', 'false', 'null',
    ]);

    const isSuppliedVerbatim = (value: string) => {
      const copy = normaliseVisibleCopy(value);
      if (!copy) return true;
      if (suppliedCopy.includes(copy)) return true;
      const words = copy.split(/\s+/).filter((w) => w.length >= 2);
      if (
        words.length > 0 &&
        words.every(
          (w) =>
            suppliedWords.has(w) ||
            COMMON_DEV_TERMS.has(w) ||
            /^\d+[\w%]*$/.test(w),
        )
      ) {
        return true;
      }
      return false;
    };
    const looksLikeInventedTerminalCopy = (value: string) =>
      /(?:^|\s)\$\s*\S|(?:^|\s)--?[a-z][\w-]*|\s\/[-\w./]+|\s\/\w|\/\/\s*[a-z]/i.test(value);
    const unsupportedTerminalCopy: string[] = [];
    const unsupportedVisibleCopy: string[] = [];
    for (const match of code.matchAll(/<ui\.DevTyping\b([\s\S]*?)(?:\/?>)/g)) {
      const props = match[1] ?? '';
      for (const prop of ['text', 'prompt', 'suffix']) {
        const value = literalProp(props, prop);
        if (
          value &&
          (prop === 'prompt' || looksLikeInventedTerminalCopy(value)) &&
          !isSuppliedVerbatim(value)
        ) {
          unsupportedTerminalCopy.push(value);
        }
      }
    }
    for (const match of code.matchAll(/>\s*([^<>{}\n][^<>{}\n]{0,180}?)\s*</g)) {
      const value = match[1]?.trim() ?? '';
      if (looksLikeInventedTerminalCopy(value) && !isSuppliedVerbatim(value)) {
        unsupportedTerminalCopy.push(value);
      }
      if (/[a-z]{2,}/i.test(value) && !isSuppliedVerbatim(value)) {
        unsupportedVisibleCopy.push(value);
      }
    }
    for (const match of code.matchAll(
      /\b(?:text|label|caption|prefix|suffix|prompt)\s*[:=]\s*(?:\{\s*)?['"]([^'"]+)['"]/gi,
    )) {
      const value = match[1]?.trim() ?? '';
      if (/[a-z]{2,}/i.test(value) && !isSuppliedVerbatim(value)) {
        unsupportedVisibleCopy.push(value);
      }
    }
    if (unsupportedTerminalCopy.length) {
      devNote(
        'Remove invented terminal copy. Commands, tool names, prompts, flags, paths, statuses, and diagnostic headings must be copied verbatim from NARRATION OVER THIS SHOT or WHAT TO BUILD. If no exact command was supplied, use a direct icon, emoji, number, or supplied phrase without terminal chrome.',
      );
    }
    if (unsupportedVisibleCopy.length) {
      notes.push(
        'Remove invented on-screen words. Every dev-theme title, heading, label, caption, prefix, suffix, and text line must be copied verbatim from NARRATION OVER THIS SHOT or WHAT TO BUILD; omit unsupported chrome instead of naming it.',
      );
    }
    if (
      intent.kind === 'chart' &&
      (!/<svg\b/.test(code) || !/\bscale\.linear\s*\(/.test(code))
    ) {
      devNote(
        'A dev chart must use one bounded SVG plot and shared scale.linear geometry. Derive every mark, axis, baseline, and label from the same plot rectangle instead of hand-positioning separate components.',
      );
    }
    // DevTyping's own frame is structurally exclusive: do not double-frame it.
    const usesDevTyping = /<ui\.DevTyping\b/.test(code);
    const OUTLINE_DECLARATION = /\b(?:border|outline)\s*:(?!\s*['"]?(?:none|0)\b)/;
    const rawOutlineCount = (code.match(new RegExp(OUTLINE_DECLARATION, 'g')) ?? []).length;
    if (usesDevTyping && rawOutlineCount > 0) {
      devNote(
        'ui.DevTyping already owns its terminal outline. Remove the surrounding bordered card or set framed={false} on DevTyping so the terminal has one clean frame.',
      );
    }
    // Measured against the frame, not the content footprint: a root
    // AbsoluteFill or an SVG canvas is legitimately 1920×1080, and flagging
    // those made this fire on almost every scene.
    const oversizedDevDimension = [
      ...code.matchAll(/\b(?:width|height)\s*:\s*(\d+)/g),
      ...code.matchAll(/\b(?:width|height)\s*=\s*\{?\s*(\d+)/g),
    ].find((match) => Number(match[1]) > (match[0].startsWith('height') ? 1080 : 1920));
    if (oversizedDevDimension) {
      devNote(
        'A dev element exceeds the 1440×810 content footprint. Reduce that literal dimension and keep every child, rule, and terminal row inside data-layout-main.',
      );
    }
    if (
      /\b(?:boxShadow|textShadow|filter)\s*:(?!\s*['"]?none\b)/i.test(code) ||
      /(?:linear|radial)-gradient\s*\(/i.test(code)
    ) {
      devNote('Dev shots are flat matte with NO glow, NO shadows, and NO gradients (remove boxShadow, textShadow, filter, and glow).');
    }
    const cardBorders = [...code.matchAll(/style\s*=\s*\{\{([\s\S]*?)\}\}/g)]
      .map((match) => match[1] ?? '')
      .filter((s) => /\b(?:border|outline)\s*:\s*['"](?!\s*(?:none|0)\b)[^'"]+['"]/i.test(s) && /\b(?:background|borderRadius)\s*:/i.test(s));
    if (cardBorders.length > 0) {
      devNote("Dev theme cards and modules must have NO stroke or border (set border: 'none'). Only connecting lines/arrows and icons have a stroke.");
    }
    // Ban #0E172A (navy) and white for background card colors
    if (
      /\b(?:background|backgroundColor)\s*:\s*['"]?(?:#0[eE]172[aA]|rgba?\(\s*14\s*,\s*23\s*,\s*42|white|#fff(?:fff)?)\b/i.test(code) ||
      /\b(?:Surface|Tile|Panel|Window)\b[^>]*\bbackground\s*=\s*['"]?(?:#0[eE]172[aA]|white|#fff(?:fff)?)\b/i.test(code)
    ) {
      issues.push(
        'Forbidden card background color: Do NOT use #0E172A or white for card backgrounds. Background cards must use flat charcoal matte (palette.card or #121212). White is reserved for typography/icons only.',
      );
    }
    // There is deliberately NO colour check here. The dev register is orange
    // on charcoal with a semantic green or red where a result needs one, and
    // a checker that could not tell "chromatic" from "off-palette" is what
    // turned it into a grey wireframe. Colour discipline is the brief's job.
    // The display face plus the mono face for machine values; nothing else.
    const wrongFont = [...code.matchAll(/\bfont\(\s*['"]([^'"]+)['"]/g)].find(
      (match) => !['fredoka', 'ibm plex mono'].includes(match[1].toLowerCase()),
    );
    if (wrongFont || /fontFamily\s*:\s*['"](?![^'"]*(?:Fredoka|IBM Plex Mono))[^'"]+['"]/i.test(code)) {
      // A mono family is legitimate for exact machine text, so it is named in
      // the advisory rather than reported as the wrong face.
      devNote("Dev shots must use font('Fredoka') for all viewer-facing text, and font('IBM Plex Mono') only for exact machine values.");
    }
  }

  const spatialIntent = new Set([
    'process',
    'network',
    'timeline',
    'chart',
    'comparison',
    'editorial',
  ]).has(intent.kind);
  // Standalone ui.Surface containers only, not every rounded element: rounded
  // bars, chips, icons, and table cells are legitimate inside one connected
  // system, and counting them made this flag working scenes. Still advisory —
  // a scene that runs is never rejected over its containers.
  const cardSurfaces = (code.match(/<ui\.Surface\b/g) ?? []).length;
  if (spatialIntent && cardSurfaces >= 3) {
    notes.push(
      `This ${intent.label} uses ${cardSurfaces} separate card-like surfaces. Prefer one connected spatial system—paths, shared axes, direct labels, typography, or a single focal object.`,
    );
  }
  // A fixed-size clip container around content is the classic half-mask bug:
  // anything taller or wider than the box gets cut and renders visually
  // broken. Advisory — the fix is to pad the mask, let it grow, or use the
  // dev terminal helper for long copy.
  const fixedClipContainer =
    new RegExp(`overflow\\s*:\\s*['"](?:hidden|clip)['"][^{}]{0,180}(?:height|width)\\s*:\\s*\\d+`).test(code) ||
    new RegExp(`(?:height|width)\\s*:\\s*\\d+[^{}]{0,180}overflow\\s*:\\s*['"](?:hidden|clip)['"]`).test(code);
  if (fixedClipContainer) {
    notes.push(
      'A fixed-size clip container can cut a label or figure. Give the clip box padding, let it fit its content, or use ui.DevTyping for long dev copy so no text is clipped.',
    );
  }

  // A delayed first reveal can leave the viewer looking at only the ground.
  // This remains advisory because arbitrary JSX/SVG can still paint a valid
  // persistent object that a source scan cannot measure.
  const delayedFirstReveal =
    /(?:<ui\.(?:Rise|Wipe|Grow|Draw|FollowPath|Count|Words))\b[^>]*\bdelay\s*=\s*\{?\s*(\d+)/g;
  const delays = [...code.matchAll(delayedFirstReveal)]
    .map((match) => Number(match[1]))
    .filter((delay) => Number.isFinite(delay));
  if (delays.length && Math.min(...delays) > 60) {
    notes.push(
      'The first animated component starts after one second. Keep a persistent, substantial focal/supporting component visible from frame 0 so the composition never has an empty lead-in.',
    );
  }

  // Educational 3-5s cognitive load: detect slide meta categories
  if (/\b(?:Overview|Key Takeaway|Core Insight|Summary|Core Feature|Key Point)\s*:/i.test(code)) {
    notes.push(
      'Remove slide meta-labels ("Overview:", "Key Insight:", etc.). Present the concrete entity, metric, or concept directly without slide chrome.',
    );
  }

  // Educational visual asset anchoring: verify the scene carries an anchor
  const hasVisualAnchor =
    /<ui\.(?:Icon|Logo|Tile|FlowNode|StatCard|DevIcon|DevFlow|DevStat)\b/.test(code) ||
    /<(?:svg|path)\b/.test(code) ||
    /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(code);
  if (!hasVisualAnchor && !isKineticCenterBuild) {
    notes.push(
      'This shot lacks a prominent visual anchor. For a 3–5s educational clip, anchor the concept with a Lucide icon, native emoji, or verified theSVG brand logo.',
    );
  }

  // Branching tree arrows check: trees must use dashed moving lines, not arrows
  if (
    /\b(?:tree|branch|worktree|hierarchy)\b/i.test(instruction) &&
    (/<ui\.Arrow\b/.test(code) || /\barrow\s*=\s*['"]?(?:end|start|both|true)\b/.test(code))
  ) {
    notes.push(
      'Trees and branching structures should use dashed moving lines (ui.TreeWire or Wire dash="8 6" flow={1.5}) without arrows.',
    );
  }

  // KineticCenterBuild casing check
  if (isKineticCenterBuild) {
    const kineticMatch = code.match(/words\s*=\s*\{\[([\s\S]*?)\]\}/);
    if (kineticMatch && /"[A-Z\s]{4,}"/.test(kineticMatch[1])) {
      notes.push('ui.KineticCenterBuild words should use natural sentence case, not uppercase.');
    }
  }

  // 1.5s animation hold check: in-animations must complete by the 1.5s cutoff
  const inAnimationDelays = [...code.matchAll(/(?:<ui\.(?:Push|Rise|Wipe|Grow|Draw|Count|Words|Pop|Popup|Stamp|Flip))\b[^>]*\bdelay\s*=\s*\{?\s*(\d+)/g)]
    .map((m) => Number(m[1]))
    .filter(Number.isFinite);
  if (inAnimationDelays.some((d) => d > 75)) {
    notes.push(
      'An in-animation starts late. All entrance animations must complete at least 1.5 seconds (45 frames) before the shot ends so the visual can settle.',
    );
  }

  return {issues, notes};
};

export const formatValidationError = (issues: string[]) =>
  [
    'THIS SCENE CANNOT RUN',
    ...issues.map((issue, index) => `${index + 1}. ${issue}`),
    'Fix only these items with an edit. Change nothing else: keep the content, layout, palette, timing, and duration exactly as they are.',
  ].join('\n');

/** Advisory wording for the optional polish pass, never a rejection. */
export const formatValidationNotes = (notes: string[]) =>
  [
    'LAYOUT NOTES',
    ...notes.map((note, index) => `${index + 1}. ${note}`),
    'If you address them, keep the content, layout, palette, timing, and duration. The scene runs either way and is never rejected for these.',
  ].join('\n');

/**
 * Google Fonts on demand.
 *
 * A scene just writes `fontFamily: font('Bebas Neue')` (or the plain string
 * `'Bebas Neue'`). Anything that reaches `ensureFont` gets a stylesheet
 * injected once and cached forever.
 *
 * css2 rejects the whole request if you ask for a weight a family does not
 * publish, and it rejects `wght@100..900` ranges on non-variable families —
 * so weights are always enumerated, never expressed as a range, and unknown
 * families fall back to a bare request (regular only) which is valid for
 * every real family on Google Fonts.
 */
import {isDevPalette} from './palette';

const W = {
  one: [400],
  twoWay: [400, 700],
  wide: [300, 400, 500, 600, 700, 800, 900],
  full: [100, 200, 300, 400, 500, 600, 700, 800, 900],
  midHeavy: [200, 300, 400, 500, 600, 700, 800],
  light: [300, 400, 500, 600, 700],
  toHeavy: [400, 500, 600, 700, 800, 900],
};

/**
 * Curated families, each with weights that family actually publishes.
 * These are the names surfaced to the assistant in the system prompt.
 */
export const FONT_CATALOG: Record<string, {weights: number[]; italic?: boolean; note: string}> = {
  // Editorial sans
  Inter: {weights: W.full, italic: true, note: 'neutral UI/editorial sans'},
  'DM Sans': {weights: W.full, italic: true, note: 'warm geometric sans'},
  Manrope: {weights: W.midHeavy, note: 'modern semi-geometric sans'},
  'Plus Jakarta Sans': {weights: W.midHeavy, italic: true, note: 'friendly contemporary sans'},
  Figtree: {weights: W.light.concat([800, 900]), italic: true, note: 'clean rounded sans'},
  Outfit: {weights: W.full, note: 'geometric display sans'},
  Sora: {weights: [100, 200, 300, 400, 500, 600, 700, 800], note: 'technical geometric sans'},
  Epilogue: {weights: W.full, italic: true, note: 'sharp variable sans'},
  'Work Sans': {weights: W.full, italic: true, note: 'sturdy workhorse sans'},
  'Libre Franklin': {weights: W.full, italic: true, note: 'classic american gothic'},
  Archivo: {weights: W.full, italic: true, note: 'grotesque, great for captions'},
  'Space Grotesk': {weights: W.light, note: 'quirky technical grotesque'},
  Syne: {weights: W.toHeavy, note: 'art-directed display sans'},
  'Bricolage Grotesque': {weights: [200, 300, 400, 500, 600, 700, 800], note: 'expressive editorial grotesque'},
  'IBM Plex Sans': {weights: [100, 200, 300, 400, 500, 600, 700], italic: true, note: 'corporate/technical sans'},
  Barlow: {weights: W.full, italic: true, note: 'slightly condensed grotesque'},
  'Barlow Condensed': {weights: W.full, italic: true, note: 'condensed, tight lower thirds'},
  Roboto: {weights: W.full, italic: true, note: 'neutral default sans'},
  'Roboto Condensed': {weights: W.full, italic: true, note: 'condensed neutral sans'},
  Poppins: {weights: W.full, italic: true, note: 'geometric rounded sans'},
  Fredoka: {weights: [300, 400, 500, 600, 700], note: 'soft rounded display sans, playful and highly legible'},

  // Heavy display
  Anton: {weights: W.one, note: 'ultra-condensed poster caps'},
  'Bebas Neue': {weights: W.one, note: 'tall condensed caps, doc titles'},
  'Archivo Black': {weights: W.one, note: 'very heavy grotesque'},
  Oswald: {weights: [200, 300, 400, 500, 600, 700], note: 'condensed news display'},
  Teko: {weights: [300, 400, 500, 600, 700], note: 'tall condensed sport/news'},
  Chivo: {weights: W.full, italic: true, note: 'strong grotesque, good numerals'},

  // Serif
  Newsreader: {weights: [200, 300, 400, 500, 600, 700], italic: true, note: 'literary text serif'},
  'Source Serif 4': {weights: [200, 300, 400, 500, 600, 700, 800, 900], italic: true, note: 'clear reading serif'},
  Lora: {weights: [400, 500, 600, 700], italic: true, note: 'contemporary body serif'},
  'Libre Baskerville': {weights: W.twoWay, italic: true, note: 'classic bookish serif'},
  'EB Garamond': {weights: [400, 500, 600, 700, 800], italic: true, note: 'old-style humanist serif'},
  'Cormorant Garamond': {weights: W.light, italic: true, note: 'high-contrast elegant serif'},
  'Crimson Pro': {weights: [200, 300, 400, 500, 600, 700, 800, 900], italic: true, note: 'refined text serif'},
  Spectral: {weights: [200, 300, 400, 500, 600, 700, 800], italic: true, note: 'screen-first serif'},
  Fraunces: {weights: W.full, italic: true, note: 'soft wonky display serif'},
  'Playfair Display': {weights: [400, 500, 600, 700, 800, 900], italic: true, note: 'high-contrast title serif'},
  'DM Serif Display': {weights: W.one, italic: true, note: 'clean display serif'},
  'Instrument Serif': {weights: W.one, italic: true, note: 'tight modern display serif'},
  'Bodoni Moda': {weights: [400, 500, 600, 700, 800, 900], italic: true, note: 'dramatic didone'},

  // Handwritten, for the marker-annotation register
  'Patrick Hand': {weights: W.one, note: 'even handwritten marker, explainer labels'},

  // Mono
  'IBM Plex Mono': {weights: [100, 200, 300, 400, 500, 600, 700], italic: true, note: 'documentary data mono'},
  'JetBrains Mono': {weights: [100, 200, 300, 400, 500, 600, 700, 800], italic: true, note: 'wide legible mono'},
  'Roboto Mono': {weights: [100, 200, 300, 400, 500, 600, 700], italic: true, note: 'neutral mono'},
  'Space Mono': {weights: W.twoWay, italic: true, note: 'characterful mono'},
};

export const FONT_NAMES = Object.keys(FONT_CATALOG);

/** Families already shipped locally — never fetch these. */
const LOCAL_FAMILIES = new Set(['DM Sans', 'IBM Plex Mono', 'Newsreader']);

const injected = new Set<string>();

const toHref = (family: string) => {
  const name = family.replace(/\s+/g, '+');
  const entry = FONT_CATALOG[family];
  if (!entry) {
    // Unknown family: a bare request is valid for any real Google family.
    return `https://fonts.googleapis.com/css2?family=${name}&display=swap`;
  }
  const weights = entry.weights.join(';');
  const axis = entry.italic
    ? `:ital,wght@${entry.weights.map((w) => `0,${w}`).join(';')};${entry.weights
        .map((w) => `1,${w}`)
        .join(';')}`
    : `:wght@${weights}`;
  return `https://fonts.googleapis.com/css2?family=${name}${axis}&display=swap`;
};

/** Inject the stylesheet for one family. Idempotent and safe to call in render. */
export const ensureFont = (rawFamily: string) => {
  const family = rawFamily.replace(/['"]/g, '').trim();
  if (!family || injected.has(family)) return family;
  injected.add(family);
  if (LOCAL_FAMILIES.has(family)) return family;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = toHref(family);
  link.dataset.googleFont = family;
  document.head.appendChild(link);
  return family;
};

/**
 * The emoji face, appended to every stack this module builds.
 *
 * Emoji are plain text in a scene, so without a named family in the stack they
 * fall through to whatever the host machine ships — Apple's artwork on a Mac,
 * Segoe UI Emoji on the Windows PCs that also run this studio, Noto on a Linux
 * render box. That is the same cut looking like three different films. The
 * face is declared once in index.css as `local('Apple Color Emoji')` first,
 * so a Mac uses the system copy it already has and only machines that lack it
 * fetch the file.
 *
 * It goes LAST, never first: Apple Color Emoji also carries glyphs for the
 * digits, '#' and '*' that keycap sequences are built from, so a stack that
 * led with it would draw numerals out of the emoji font.
 */
export const EMOJI_FAMILY = 'Apple Color Emoji';

/** Append the emoji face to a stack that does not already name it. */
export const withEmoji = (stack: string) =>
  stack.includes(EMOJI_FAMILY) ? stack : `${stack}, '${EMOJI_FAMILY}'`;

/**
 * What a scene calls. Returns a CSS font-family stack, so
 * `fontFamily: font('Anton')` is always a complete, safe value.
 */
/**
 * The dev register's display face moved from DM Sans to Fredoka, and every
 * dev scene already saved asks for DM Sans by name. Aliasing at the call
 * rather than rewriting stored source means the whole back catalogue picks
 * up the new face the way it picked up the stage scale — no regeneration,
 * and nothing to miss. Only this one pairing is remapped, and only while the
 * dev palette is active: a paper or signal scene still gets what it asked
 * for, and a deliberate font('IBM Plex Mono') is never touched.
 */
const DEV_FACE_ALIASES: Record<string, string> = {'dm sans': 'Fredoka'};

const resolveFamily = (family: string) =>
  (isDevPalette() && DEV_FACE_ALIASES[family.trim().toLowerCase()]) || family;

export const font = (rawFamily: string, fallback = 'sans-serif') => {
  const family = resolveFamily(rawFamily);
  ensureFont(family);
  return withEmoji(`'${family.replace(/['"]/g, '')}', ${fallback}`);
};

/**
 * Preload every family named in a scene's source before it renders, so the
 * first painted frame is not the fallback face. Catches both `font('X')` and
 * plain `fontFamily: 'X'` / `fontFamily: "X, serif"`.
 */
export const preloadFontsInCode = (code: string) => {
  const found = new Set<string>();
  for (const match of code.matchAll(/\bfont\(\s*['"]([^'"]+)['"]/g)) {
    found.add(match[1]);
  }
  for (const match of code.matchAll(/fontFamily\s*:\s*['"]([^'"]+)['"]/g)) {
    // Take only the first family in a stack, and skip generic keywords.
    const first = match[1].split(',')[0].replace(/['"]/g, '').trim();
    if (first && !/^(sans-serif|serif|monospace|cursive|system-ui|inherit)$/i.test(first)) {
      found.add(first);
    }
  }
  found.forEach(ensureFont);
};

/**
 * Real photographs in a cut.
 *
 * A documentary that draws everything loses the one thing footage does for
 * free: the viewer seeing the actual object. This module finds a real image
 * for a shot that deserves one, and it is built around a single conviction —
 * a model is far better at picking a photograph out of a wall of photographs
 * than at describing which one it wants. So the pipeline is:
 *
 *   1. QUERY. A cheap model reads this shot's narration and brief and answers
 *      two questions: does a photograph actually help here, and what would you
 *      type into image search. It says no often, and that is the point.
 *   2. SEARCH. serper.dev returns up to 48 candidates, through the local
 *      bridge so the key never reaches the browser.
 *   3. CONTACT SHEET. Those 48 are composited into one numbered 8x6 grid,
 *      exactly the way a photo editor lays out proofs on a light table.
 *   4. PICK. The sheet goes to Gemini as ONE image with one question: which
 *      cell belongs in this shot, or none of them. Comparing candidates side
 *      by side is a judgement it can actually make; ranking 48 separate URLs
 *      is not.
 *   5. SAVE. Local development stores the winner under public/images. A
 *      hosted deployment keeps a same-origin proxy URL, so the browser render
 *      can use it without writing to Vercel's read-only filesystem.
 *
 * Balance is enforced here rather than asked for: `photoBudget` decides how
 * many shots in a cut may carry a photograph and refuses two in a row. Every
 * failure in this file is non-fatal — no key, no result, no agreement from
 * the picker, and the shot is simply drawn the way it always was.
 */
import {requestGeminiJson} from './google';
import {IMAGE_PICKER_MODEL} from './models';

export type PhotoCandidate = {
  imageUrl: string;
  title: string;
  source: string;
  pageUrl: string;
  width: number;
  height: number;
};

export type ShotPhoto = {
  /** Local public/ path or a same-origin hosted image URL. */
  file: string;
  /** What the photo shows, in the picker's words. Used as the credit line. */
  subject: string;
  source: string;
  query: string;
  width: number;
  height: number;
};

/** The contact sheet's shape. 48 proofs is the most a picker reads reliably. */
export const SHEET_COLUMNS = 8;
export const SHEET_ROWS = 6;
export const SHEET_CELLS = SHEET_COLUMNS * SHEET_ROWS;

const CELL_WIDTH = 208;
const CELL_HEIGHT = 156;
const CELL_GAP = 6;
const LABEL_HEIGHT = 30;

const post = async <T>(route: string, body: unknown): Promise<T> => {
  const response = await fetch(route, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as T & {detail?: string};
  if (!response.ok) throw new Error(payload?.detail ?? `${route} returned ${response.status}.`);
  return payload;
};

export const searchPhotos = async (apiKey: string, query: string, count = SHEET_CELLS) => {
  const {images} = await post<{images: PhotoCandidate[]}>('/api/images/search', {
    apiKey,
    query,
    count,
  });
  return images;
};

/**
 * Candidate bytes, fetched by the bridge rather than by an <img> tag.
 *
 * A canvas that has drawn a cross-origin image is tainted and cannot be read
 * back, so the sheet has to be built from same-origin data. Hosts that refuse
 * the request come back with an empty string and are simply left out of the
 * sheet — a proof sheet with 41 usable frames is still a proof sheet.
 */
const loadCandidateImages = async (urls: string[]) => {
  const {images} = await post<{images: Array<{url: string; dataUrl: string}>}>(
    '/api/images/candidates',
    {urls},
  );
  const byUrl = new Map(images.map((image) => [image.url, image.dataUrl]));
  return urls.map((url) => byUrl.get(url) ?? '');
};

const decode = (dataUrl: string) =>
  new Promise<HTMLImageElement | null>((resolve) => {
    if (!dataUrl) {
      resolve(null);
      return;
    }
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = dataUrl;
  });

export type ContactSheet = {
  /** The composited grid, as a JPEG data URL. */
  dataUrl: string;
  /** Cell number (1-based, reading order) to the candidate it shows. */
  cells: Map<number, PhotoCandidate>;
};

/**
 * Composite candidates into one numbered grid.
 *
 * Cells are filled in reading order and numbered in the corner, so the answer
 * "17" is unambiguous for both sides. Images are drawn cover-cropped: a proof
 * sheet of letterboxed thumbnails wastes most of the resolution the picker
 * has to judge with.
 */
export const buildContactSheet = async (candidates: PhotoCandidate[]): Promise<ContactSheet | null> => {
  const usable = candidates.slice(0, SHEET_CELLS);
  if (!usable.length) return null;
  const dataUrls = await loadCandidateImages(usable.map((candidate) => candidate.imageUrl));
  const decoded = await Promise.all(dataUrls.map(decode));

  // Hosts refuse plenty of requests, so the sheet is sized to what actually
  // decoded. A full-height canvas with three filled rows would send the
  // picker several hundred kilobytes of empty grey to reason about.
  const drawable = decoded.filter((image): image is HTMLImageElement => image !== null).length;
  if (!drawable) return null;
  const rows = Math.min(SHEET_ROWS, Math.ceil(drawable / SHEET_COLUMNS));
  const columns = Math.min(SHEET_COLUMNS, drawable);

  const canvas = document.createElement('canvas');
  canvas.width = columns * (CELL_WIDTH + CELL_GAP) + CELL_GAP;
  canvas.height = rows * (CELL_HEIGHT + LABEL_HEIGHT + CELL_GAP) + CELL_GAP;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.fillStyle = '#111111';
  context.fillRect(0, 0, canvas.width, canvas.height);

  const cells = new Map<number, PhotoCandidate>();
  let cellNumber = 0;

  for (let index = 0; index < usable.length; index += 1) {
    const image = decoded[index];
    if (!image) continue;
    if (cellNumber >= rows * SHEET_COLUMNS) break;
    cellNumber += 1;
    cells.set(cellNumber, usable[index]);

    const slot = cellNumber - 1;
    const column = slot % SHEET_COLUMNS;
    const row = Math.floor(slot / SHEET_COLUMNS);
    const x = CELL_GAP + column * (CELL_WIDTH + CELL_GAP);
    const y = CELL_GAP + row * (CELL_HEIGHT + LABEL_HEIGHT + CELL_GAP);

    // Cover-crop into the cell.
    const scale = Math.max(CELL_WIDTH / image.width, CELL_HEIGHT / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    context.save();
    context.beginPath();
    context.rect(x, y + LABEL_HEIGHT, CELL_WIDTH, CELL_HEIGHT);
    context.clip();
    context.drawImage(
      image,
      x + (CELL_WIDTH - drawWidth) / 2,
      y + LABEL_HEIGHT + (CELL_HEIGHT - drawHeight) / 2,
      drawWidth,
      drawHeight,
    );
    context.restore();

    context.fillStyle = '#000000';
    context.fillRect(x, y, CELL_WIDTH, LABEL_HEIGHT);
    context.fillStyle = '#e58527';
    context.font = 'bold 20px sans-serif';
    context.textBaseline = 'middle';
    context.fillText(String(cellNumber), x + 8, y + LABEL_HEIGHT / 2 + 1);
  }

  if (!cells.size) return null;
  return {dataUrl: canvas.toDataURL('image/jpeg', 0.72), cells};
};

const QUERY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    usePhoto: {
      type: 'boolean',
      description: 'True only when a real photograph of a real thing would teach more than a drawn graphic.',
    },
    query: {
      type: 'string',
      description: 'Image search query: the concrete noun to photograph, 2-6 words. Empty when usePhoto is false.',
    },
    subject: {
      type: 'string',
      description: 'One or two words naming what the photo should show, for the on-screen caption.',
    },
  },
  required: ['usePhoto', 'query', 'subject'],
};

const QUERY_SYSTEM = `You choose whether a documentary shot should show a real photograph, and what to search for.

SAY YES only when the narration names something that physically exists and a viewer would benefit from seeing the real thing: a device, a chip, a machine, a building, a place, a named person, a product, a vehicle, an animal, a piece of hardware, a historical event, a real user interface.

SAY NO — and this is the common answer — for anything abstract: a process, a concept, a comparison, a ratio, a workflow, a definition, a quantity, a trend, a warning, a metaphor, an idea about software architecture. Those are drawn, not photographed. A stock photo of someone pointing at a laptop teaches nothing and cheapens the film.

THE QUERY, when you say yes, is the concrete noun and nothing else: the exact product name, the exact model number, the exact place. Two to six words. No adjectives about mood, no "concept", no "background", no "illustration", no style words.`;

/** Does this shot want a photograph, and of what. */
export const makeImageQuery = async ({
  apiKey,
  narration,
  brief,
}: {
  apiKey: string;
  narration: string;
  brief: string;
}) => {
  const result = await requestGeminiJson<{usePhoto?: boolean; query?: string; subject?: string}>({
    apiKey,
    model: IMAGE_PICKER_MODEL,
    systemPrompt: QUERY_SYSTEM,
    prompt: `NARRATION OVER THIS SHOT\n"${narration.trim()}"\n\nWHAT THE SHOT BUILDS\n${brief.trim()}`,
    schema: QUERY_SCHEMA,
    maxOutputTokens: 300,
  });
  const query = (result.query ?? '').trim();
  if (!result.usePhoto || !query) return null;
  return {query, subject: (result.subject ?? '').trim() || query};
};

const PICK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    choice: {
      type: 'integer',
      description: 'The number printed on the chosen cell, or 0 when no candidate is right.',
    },
    subject: {
      type: 'string',
      description: 'One to three words naming what the chosen photo actually shows.',
    },
    reason: {type: 'string', description: 'One short sentence on why that cell.'},
  },
  required: ['choice', 'subject', 'reason'],
};

const PICK_SYSTEM = `You are a photo editor picking one frame off a contact sheet for a documentary shot.

The image is a grid of numbered candidates. Read them all, then answer with the number of the ONE that belongs in this shot.

Choose the candidate that is: actually the thing the narration is about (not a lookalike, not a related product), a clean readable photograph of it, and free of watermarks, heavy text overlays, collages, memes, chart screenshots, and stock-photo staging.

Answer 0 — and answer 0 without hesitation — when nothing on the sheet is genuinely the subject. A wrong photograph is worse than no photograph, because the viewer believes it.`;

/** Which numbered cell belongs in this shot, if any. */
export const chooseFromSheet = async ({
  apiKey,
  sheet,
  narration,
  brief,
  query,
}: {
  apiKey: string;
  sheet: ContactSheet;
  narration: string;
  brief: string;
  query: string;
}) => {
  const result = await requestGeminiJson<{choice?: number; subject?: string; reason?: string}>({
    apiKey,
    model: IMAGE_PICKER_MODEL,
    systemPrompt: PICK_SYSTEM,
    prompt: `The shot's narration: "${narration.trim()}"
What the shot builds: ${brief.trim()}
The search that produced this sheet: "${query}"
The sheet holds ${sheet.cells.size} numbered candidates. Answer with one number from 1 to ${sheet.cells.size}, or 0.`,
    images: [sheet.dataUrl],
    schema: PICK_SCHEMA,
    maxOutputTokens: 300,
  });
  const choice = Number(result.choice) || 0;
  const candidate = sheet.cells.get(choice);
  if (!candidate) return null;
  return {candidate, subject: (result.subject ?? '').trim(), reason: (result.reason ?? '').trim()};
};

/** Resolve the chosen photo to a local path or hosted same-origin proxy. */
export const savePhoto = async (url: string) =>
  post<{file: string}>('/api/images/save', {url});

/**
 * How many shots in a cut may carry a photograph.
 *
 * A third, rounded down, with a floor of one for a short cut and a ceiling
 * that keeps a long cut from turning into a slideshow. The picker's own "no"
 * usually lands well under this, so the budget is a backstop against a subject
 * where every shot happens to name a real object.
 */
export const photoBudget = (shotCount: number) =>
  Math.max(1, Math.min(6, Math.floor(shotCount / 3)));

/**
 * The whole pipeline for one shot. Returns null whenever a photograph is not
 * the right answer, which includes every failure mode.
 */
export const resolveShotPhoto = async ({
  serperApiKey,
  googleApiKey,
  narration,
  brief,
  onNote,
}: {
  serperApiKey: string;
  googleApiKey: string;
  narration: string;
  brief: string;
  /** Progress for the shot log. Never throws. */
  onNote?: (message: string) => void;
}): Promise<ShotPhoto | null> => {
  if (!serperApiKey.trim() || !googleApiKey.trim()) return null;

  const wanted = await makeImageQuery({apiKey: googleApiKey, narration, brief});
  if (!wanted) return null;
  onNote?.(`Searching photos for "${wanted.query}"`);

  const candidates = await searchPhotos(serperApiKey, wanted.query);
  if (!candidates.length) {
    onNote?.(`No photo results for "${wanted.query}"`);
    return null;
  }

  const sheet = await buildContactSheet(candidates);
  if (!sheet) {
    onNote?.('No candidate images could be loaded for the contact sheet.');
    return null;
  }

  const picked = await chooseFromSheet({
    apiKey: googleApiKey,
    sheet,
    narration,
    brief,
    query: wanted.query,
  });
  if (!picked) {
    onNote?.(`No candidate fit the shot — drawing it instead ("${wanted.query}")`);
    return null;
  }

  const saved = await savePhoto(picked.candidate.imageUrl);
  onNote?.(`Photo: ${picked.subject || wanted.subject} — ${picked.reason}`);
  return {
    file: saved.file,
    subject: picked.subject || wanted.subject,
    source: picked.candidate.source,
    query: wanted.query,
    width: picked.candidate.width,
    height: picked.candidate.height,
  };
};

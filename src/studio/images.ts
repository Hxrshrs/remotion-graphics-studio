/**
 * Attached images are used twice, at very different sizes:
 *
 * - `full` is what goes to the model. Vision models gain nothing from a 4000px
 *   photo, and the tokens are billed, so the long edge is capped.
 * - `thumb` is what the transcript keeps. Project transcripts are persisted to
 *   localStorage, and full data URLs would exhaust the ~5MB quota after a
 *   couple of attachments — silently breaking ALL project saving.
 */

const SEND_MAX_EDGE = 1536;
const THUMB_MAX_EDGE = 160;

const loadImage = (dataUrl: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not decode the image.'));
    image.src = dataUrl;
  });

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });

const resize = (image: HTMLImageElement, maxEdge: number, quality: number) => {
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
};

export type PreparedImage = {
  /** Sent to the model. */
  full: string;
  /** Kept in the persisted transcript. */
  thumb: string;
};

export const prepareImage = async (file: File): Promise<PreparedImage> => {
  const original = await readAsDataUrl(file);
  try {
    const image = await loadImage(original);
    const full = resize(image, SEND_MAX_EDGE, 0.85) ?? original;
    const thumb = resize(image, THUMB_MAX_EDGE, 0.7) ?? full;
    return {full, thumb};
  } catch {
    // A format the canvas cannot decode still gets sent as-is.
    return {full: original, thumb: original};
  }
};

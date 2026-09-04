/**
 * Per-project render state for the studio page.
 *
 * Rendering used to be tracked with one boolean and one progress object for
 * the whole app, so a render started in one project reported "Done" on every
 * other project's button and offered a file belonging to a different graphic.
 * Everything here is keyed by project id, and a finished file is tagged with
 * what produced it so an edit takes the button back to Render.
 */
import type {RenderProgress} from './renderClient';

export type RenderResult = {
  url: string;
  fileName: string;
  /** The code and duration this file was rendered from. */
  signature: string;
};

type RenderedProject = {code: string; durationInFrames: number};

/** Cheap stable hash, matching the one the canvas uses for scene identity. */
const hashCode = (value: string) => {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36);
};

/** What a rendered file was made from: an edit to either invalidates it. */
export const renderSignature = (project: RenderedProject) =>
  `${hashCode(project.code)}:${project.durationInFrames}`;

/**
 * The same idea for a cut, whose picture is every shot's source and length
 * plus the style and the voiceover track. Editing one shot, re-voicing, or
 * switching theme all produce a different film, so all of it is in the hash.
 */
export const cutRenderSignature = (cut: {
  style: string;
  voiceover?: {file: string} | undefined;
  shots: Array<{code: string; durationInFrames: number}>;
}) =>
  hashCode(
    [
      cut.style,
      cut.voiceover?.file ?? '',
      ...cut.shots.map((shot) => `${shot.code}:${shot.durationInFrames}`),
    ].join(''),
  );

/**
 * What one project's render button should show, given the whole app's render
 * state. A render running in another project is invisible from here.
 */
export const downloadRenderedFile = (url: string, fileName: string) => {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
};

/** Release the in-memory MP4 when a browser render is replaced. */
export const releaseRenderedFile = (result?: RenderResult) => {
  if (result?.url.startsWith('blob:')) URL.revokeObjectURL(result.url);
};

export const renderButtonState = ({
  id,
  signature,
  renderingProjectId,
  result,
  log,
}: {
  /** The project or cut this button belongs to. */
  id: string;
  /** Its content right now, from renderSignature or cutRenderSignature. */
  signature: string;
  renderingProjectId: string | null;
  result?: RenderResult;
  log?: RenderProgress;
}) => {
  const isRendering = renderingProjectId === id;
  // A file is only offered while it still matches what is on the canvas.
  const download = result && result.signature === signature ? result : undefined;
  return {
    isRendering,
    download,
    // The log outlives the render only while its file is still the current
    // one, or when it failed and the reason is still worth reading. A stale
    // success log would otherwise keep the button in its finished shape.
    log: isRendering || download || log?.status === 'error' ? log : undefined,
  };
};

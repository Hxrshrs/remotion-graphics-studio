/**
 * Whether a project has anything in it yet.
 *
 * One definition, used in three places that must agree: the sidebar decides
 * whether to list the project in History, and each page decides whether to
 * show its empty state instead of the canvas. If they disagreed, a project
 * would sit in History showing "nothing here yet", or a page would coach the
 * user through a first step they had already taken.
 *
 * A new project is created eagerly — a click on New leaves one behind whether
 * or not anything is done with it — so "created" is deliberately not content.
 * Sending a message is: the intent is on the record even if the reply failed.
 */
import {Cut} from './cut';
import {StudioProject} from './types';
import {STARTER_SCENE} from '../remotion/starter';

/** A Studio chat counts once it has been talked to, saved, or drawn in. */
export const projectHasContent = (project: StudioProject) =>
  (project.messages?.length ?? 0) > 0 ||
  (project.savedGraphics?.length ?? 0) > 0 ||
  (project.code?.trim() ?? '') !== STARTER_SCENE.trim();

/** An Editor cut counts once a script is pasted or scenes exist. The cut's
    chat is per-scene direction, so it cannot exist before the scenes do. */
export const cutHasContent = (cut: Cut) =>
  (cut.transcript?.trim() ?? '') !== '' || (cut.shots?.length ?? 0) > 0;

/**
 * First free "Untitled …" name: the bare title when nothing shares it,
 * otherwise the lowest free "Title 02", "Title 03", … Deleted numbers are
 * reused instead of growing forever, so creating and discarding drafts never
 * inflates the count.
 */
export const nextUntitledName = (base: string, names: Iterable<string>): string => {
  const taken = new Set(names);
  if (!taken.has(base)) return base;
  let index = 2;
  while (taken.has(`${base} ${String(index).padStart(2, '0')}`)) index += 1;
  return `${base} ${String(index).padStart(2, '0')}`;
};

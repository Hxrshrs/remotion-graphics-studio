/**
 * Path sampling helpers for scenes: an element travelling ALONG an SVG path
 * must sit on real path coordinates, which the browser can measure exactly.
 * Models cannot compute bezier points by hand — they drift or hallucinate —
 * so the position is always sampled here, never guessed.
 */

let pathElement: SVGPathElement | null = null;

const pathEl = (): SVGPathElement => {
  if (pathElement) return pathElement;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  svg.appendChild(path);
  pathElement = path;
  return path;
};

export type PathPoint = {x: number; y: number; angle: number};

/** Total length of the path, for arc-length timing or dash math. */
export const pathLength = (d: string): number => {
  const el = pathEl();
  el.setAttribute('d', d);
  return el.getTotalLength();
};

/** A point exactly on the path at progress t (0-1). */
export const pathPoint = (d: string, t: number): {x: number; y: number} => {
  const el = pathEl();
  el.setAttribute('d', d);
  const length = el.getTotalLength();
  if (!length) return {x: 0, y: 0};
  const point = el.getPointAtLength(Math.max(0, Math.min(1, t)) * length);
  return {x: point.x, y: point.y};
};

/** A point on the path plus the tangent angle in degrees, so the travelling
    element can be rotated to face the route. */
export const pathProgress = (d: string, t: number): PathPoint => {
  const el = pathEl();
  el.setAttribute('d', d);
  const length = el.getTotalLength();
  if (!length) return {x: 0, y: 0, angle: 0};
  const dist = Math.max(0, Math.min(1, t)) * length;
  const point = el.getPointAtLength(dist);
  const before = el.getPointAtLength(Math.max(0, dist - 1));
  const after = el.getPointAtLength(Math.min(length, dist + 1));
  const angle = (Math.atan2(after.y - before.y, after.x - before.x) * 180) / Math.PI;
  return {x: point.x, y: point.y, angle};
};
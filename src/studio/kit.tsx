/**
 * Scene kit.
 *
 * These are the five or six things a graphic needs on nearly every take:
 * place a box at fixed coordinates, reveal something without a fade, draw a
 * stroke, count a number up, and map data to pixels. Written by hand each
 * time they are where scenes break — an unmeasured SVG path length, a
 * mask that forgot overflow hidden, a bar chart whose bars do not share a
 * baseline. Written once here they cannot break, and the model spends its
 * attention on the composition instead.
 *
 * Nothing here owns timing beyond the shared anim() curve, and every
 * component accepts `style` so any decision can be overridden in scene code.
 */
import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {anim, popScale, popScaleExit, popupSpring, popupSpringExit, signalSpring, signalSpringExit} from './motion';
import {isSignalPalette} from './palette';

type Div = React.HTMLAttributes<HTMLDivElement>;

const CANVAS = {width: 1920, height: 1080};

/** Broadcast-safe inset, and the box a centred composition should live in. */
export const safe = {
  margin: 96,
  width: CANVAS.width - 192,
  height: CANVAS.height - 192,
  left: 96,
  top: 96,
};

type SlotProps = Div & {
  x?: number | string;
  y?: number | string;
  right?: number | string;
  bottom?: number | string;
  w?: number | string;
  h?: number | string;
};

/**
 * A fixed footprint. Position and size are declared once, so a later reveal
 * inside the slot can never push or resize a neighbouring element.
 */
const Slot: React.FC<SlotProps> = ({x, y, right, bottom, w, h, style, ...props}) => (
  <div
    {...props}
    style={{
      position: 'absolute',
      left: x,
      top: y,
      right,
      bottom,
      width: w,
      height: h,
      ...style,
    }}
  />
);

type RiseProps = Div & {
  delay?: number;
  /** Pixels travelled. Keep it restrained; 24-40 reads as deliberate. */
  distance?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
  /** Frames the move takes. Leave unset for the shared settle curve. */
  span?: number;
};

/**
 * Mask reveal (or Push with Fade for Signal theme).
 * In signal theme, no mask slide reveal is used: it performs a push with fade at the start,
 * fast launch with a soft spring settle at the end.
 */
const Rise: React.FC<RiseProps> = ({
  delay = 0,
  distance = 32,
  direction = 'up',
  span,
  style,
  children,
  ...props
}) => {
  const frame = useCurrentFrame();
  const signal = isSignalPalette();

  if (signal) {
    const progress = signalSpring(frame, delay, span ?? 24);
    const travel = (1 - progress) * distance;
    const axis =
      direction === 'up'
        ? `translate3d(0, ${travel}px, 0)`
        : direction === 'down'
          ? `translate3d(0, ${-travel}px, 0)`
          : direction === 'left'
            ? `translate3d(${travel}px, 0, 0)`
            : `translate3d(${-travel}px, 0, 0)`;
    return (
      <div
        {...props}
        style={{
          transform: axis,
          opacity: progress,
          visibility: progress <= 0 ? 'hidden' : 'visible',
          willChange: 'transform, opacity',
          ...style,
        }}
      >
        {children}
      </div>
    );
  }

  const progress = anim(frame, delay, 0, 1, span ? {span} : undefined);
  const travel = (1 - progress) * Math.max(102, Math.min(125, 100 + distance / 3));
  const axis =
    direction === 'up'
      ? `translate3d(0, ${travel}%, 0)`
      : direction === 'down'
        ? `translate3d(0, ${-travel}%, 0)`
        : direction === 'left'
          ? `translate3d(${travel}%, 0, 0)`
          : `translate3d(${-travel}%, 0, 0)`;
  return (
    <div
      {...props}
      style={{
        overflow: 'hidden',
        clipPath: 'inset(0)',
        visibility: progress <= 0 ? 'hidden' : 'visible',
        ...style,
      }}
    >
      <div style={{transform: axis, willChange: 'transform'}}>{children}</div>
    </div>
  );
};

type WipeProps = Div & {
  delay?: number;
  from?: 'left' | 'right' | 'top' | 'bottom';
  span?: number;
};

/**
 * The reveal wipe (or Push with Fade for Signal theme).
 *
 * Outside signal, this used to animate `clipPath: inset()` directly. Two
 * things were wrong with that. An animated inset is not a composited
 * property — Chrome re-rasterises the element on every frame, which is exactly
 * the stutter that reads as "the wipe lags". And a hard clip edge crawling
 * across type on the old symmetric ease drew attention to the edge itself
 * rather than to the content arriving behind it.
 *
 * It is now a travelling gradient mask: a GPU-composited `mask-image` whose
 * edge is feathered over a fraction of the box, paired with a short slide of
 * the content along the same axis. One motion owner, one direction, both on
 * the house curve, so the whole reveal leaves at full speed on its first frame
 * and settles quietly.
 */
const WIPE_FEATHER = 14;
const WIPE_SLIDE = 44;
const WIPE_SPAN = 30;

const Wipe: React.FC<WipeProps> = ({delay = 0, from = 'left', span, style, children, ...props}) => {
  const frame = useCurrentFrame();
  const signal = isSignalPalette();

  if (signal) {
    const progress = signalSpring(frame, delay, span ?? 24);
    const travel = (1 - progress) * 36;
    const axis =
      from === 'left'
        ? `translate3d(${-travel}px, 0, 0)`
        : from === 'right'
          ? `translate3d(${travel}px, 0, 0)`
          : from === 'top'
            ? `translate3d(0, ${-travel}px, 0)`
            : `translate3d(0, ${travel}px, 0)`;
    return (
      <div
        {...props}
        style={{
          transform: axis,
          opacity: progress,
          visibility: progress <= 0 ? 'hidden' : 'visible',
          willChange: 'transform, opacity',
          ...style,
        }}
      >
        {children}
      </div>
    );
  }

  const progress = anim(frame, delay, 0, 1, {span: span ?? WIPE_SPAN});

  // The feathered edge travels from just before the box to just past it, so
  // frame 0 is fully masked and the settle is fully opaque with no residue.
  const edge = progress * (100 + WIPE_FEATHER);
  const towards =
    from === 'left'
      ? 'to right'
      : from === 'right'
        ? 'to left'
        : from === 'top'
          ? 'to bottom'
          : 'to top';
  const maskImage = `linear-gradient(${towards}, #000 ${edge - WIPE_FEATHER}%, rgba(0, 0, 0, 0) ${edge}%)`;

  // The content follows the edge in, covering real distance so no frame of the
  // move is a sub-pixel step.
  const slide = (1 - progress) * WIPE_SLIDE;
  const axis =
    from === 'left'
      ? `translate3d(${-slide}px, 0, 0)`
      : from === 'right'
        ? `translate3d(${slide}px, 0, 0)`
        : from === 'top'
          ? `translate3d(0, ${-slide}px, 0)`
          : `translate3d(0, ${slide}px, 0)`;

  // The transform goes on the same element as the mask rather than on an inner
  // wrapper: scenes style ui.Wipe as their own flex/grid container, and an
  // extra div between it and its children would break those layouts. A scene's
  // own transform is composed with the slide instead of being dropped.
  const transform = style?.transform ? `${axis} ${style.transform}` : axis;

  return (
    <div
      {...props}
      style={{
        maskImage,
        WebkitMaskImage: maskImage,
        overflow: 'hidden',
        visibility: progress <= 0 ? 'hidden' : 'visible',
        willChange: 'mask-image, transform',
        ...style,
        transform,
      }}
    >
      {children}
    </div>
  );
};

type PushProps = Div & {
  delay?: number;
  distance?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
  span?: number;
  exitDelay?: number;
  exitSpan?: number;
  exitDirection?: 'up' | 'down' | 'left' | 'right';
};

/**
 * Signal-style Push with Fade animation:
 * - In-animation: fast launch at start, decelerates into a soft spring settle with opacity fade.
 * - Out-animation: pushes away with fade at end.
 * No clipping masks or slide cutoffs.
 */
const Push: React.FC<PushProps> = ({
  delay = 0,
  distance = 36,
  direction = 'up',
  span = 24,
  exitDelay,
  exitSpan = 18,
  exitDirection,
  style,
  children,
  ...props
}) => {
  const frame = useCurrentFrame();
  const enter = signalSpring(frame, delay, span);
  const outDir = exitDirection ?? direction;

  let exitProgress = 0;
  if (exitDelay !== undefined && frame >= exitDelay) {
    exitProgress = signalSpringExit(frame, exitDelay, exitSpan);
  }

  const inTravel = (1 - enter) * distance;
  const inAxis =
    direction === 'up'
      ? [0, inTravel]
      : direction === 'down'
        ? [0, -inTravel]
        : direction === 'left'
          ? [inTravel, 0]
          : [-inTravel, 0];

  const outTravel = exitProgress * distance;
  const outAxis =
    outDir === 'up'
      ? [0, -outTravel]
      : outDir === 'down'
        ? [0, outTravel]
        : outDir === 'left'
          ? [-outTravel, 0]
          : [outTravel, 0];

  const currentX = inAxis[0] + outAxis[0];
  const currentY = inAxis[1] + outAxis[1];
  const opacity = Math.max(0, Math.min(1, enter - exitProgress));

  return (
    <div
      {...props}
      style={{
        transform: `translate3d(${currentX}px, ${currentY}px, 0)`,
        opacity,
        visibility: enter <= 0 || opacity <= 0 ? 'hidden' : 'visible',
        willChange: 'transform, opacity',
        ...style,
      }}
    >
      {children}
    </div>
  );
};

type GrowProps = Div & {
  delay?: number;
  axis?: 'x' | 'y' | 'both';
  from?: number;
  origin?: React.CSSProperties['transformOrigin'];
  span?: number;
};

/** Scale from a baseline. The honest way to animate a bar or a plotted mark. */
const Grow: React.FC<GrowProps> = ({
  delay = 0,
  axis = 'y',
  from = 0,
  origin,
  span,
  style,
  children,
  ...props
}) => {
  const frame = useCurrentFrame();
  const value = anim(frame, delay, from, 1, span ? {span} : undefined);
  const transform =
    axis === 'x' ? `scaleX(${value})` : axis === 'y' ? `scaleY(${value})` : `scale(${value})`;
  return (
    <div
      {...props}
      style={{
        transform,
        transformOrigin: origin ?? (axis === 'x' ? 'left center' : 'center bottom'),
        willChange: 'transform',
        ...style,
      }}
    >
      {children}
    </div>
  );
};

type DrawProps = Omit<React.SVGProps<SVGPathElement>, 'ref'> & {
  d: string;
  delay?: number;
  span?: number;
};

/**
 * A stroke that draws itself. `pathLength={1}` normalises the geometry, so
 * the dash math needs no measurement pass and stays deterministic at any
 * frame — the usual getTotalLength() approach cannot run during a seek.
 */
const Draw: React.FC<DrawProps> = ({d, delay = 0, span, style, ...props}) => {
  const frame = useCurrentFrame();
  const progress = anim(frame, delay, 0, 1, span ? {span} : undefined);
  return (
    <path
      {...props}
      d={d}
      pathLength={1}
      strokeDasharray={1}
      strokeDashoffset={1 - progress}
      fill={props.fill ?? 'none'}
      style={style}
    />
  );
};

type FollowPathProps = Div & {
  /** The exact same SVG path data passed to ui.Draw. */
  d: string;
  delay?: number;
  span?: number;
  /** Portion of the route to travel, useful when continuing a path. */
  from?: number;
  to?: number;
  /** Rotate the child to the path tangent. Off by default for badges/logos. */
  orient?: boolean;
  angleOffset?: number;
};

type PathGeometry = {path: SVGPathElement; length: number};
const pathGeometryCache = new Map<string, PathGeometry>();

/**
 * Measure a detached SVG path. Unlike a mounted ref, this is available on the
 * first render and on arbitrary seeks, so preview, render, and scrubbing all
 * return the same point for the same frame.
 */
const pathGeometry = (d: string): PathGeometry | null => {
  if (typeof document === 'undefined' || !d.trim()) return null;
  const cached = pathGeometryCache.get(d);
  if (cached) return cached;
  try {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    const length = path.getTotalLength();
    if (!Number.isFinite(length) || length <= 0) return null;
    const geometry = {path, length};
    pathGeometryCache.set(d, geometry);
    return geometry;
  } catch {
    return null;
  }
};

/**
 * Move any HTML child along an SVG path. Pair it with ui.Draw using the same
 * d, delay, and span so a marker, logo, vehicle, or icon rides the head of the
 * line instead of being positioned by unrelated x/y guesses.
 */
const FollowPath: React.FC<FollowPathProps> = ({
  d,
  delay = 0,
  span,
  from = 0,
  to = 1,
  orient = false,
  angleOffset = 0,
  style,
  children,
  ...props
}) => {
  const frame = useCurrentFrame();
  const progress = anim(frame, delay, from, to, span ? {span} : undefined);
  const geometry = pathGeometry(d);
  const distance = geometry ? Math.max(0, Math.min(1, progress)) * geometry.length : 0;
  const point = geometry?.path.getPointAtLength(distance) ?? {x: 0, y: 0};
  const tangentStep = geometry ? Math.max(0.5, geometry.length / 1000) : 0;
  const before = geometry?.path.getPointAtLength(Math.max(0, distance - tangentStep)) ?? point;
  const after =
    geometry?.path.getPointAtLength(Math.min(geometry.length, distance + tangentStep)) ?? point;
  const angle = orient
    ? (Math.atan2(after.y - before.y, after.x - before.x) * 180) / Math.PI + angleOffset
    : angleOffset;

  return (
    <div
      {...props}
      style={{
        position: 'absolute',
        left: point.x,
        top: point.y,
        transform: `translate(-50%, -50%) rotate(${angle}deg)`,
        transformOrigin: '50% 50%',
        visibility: frame < delay || !geometry ? 'hidden' : 'visible',
        willChange: 'left, top, transform',
        ...style,
      }}
    >
      {children}
    </div>
  );
};

type CountProps = {
  to: number;
  from?: number;
  delay?: number;
  span?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  /** Thousands separators, on by default for values above 9,999. */
  group?: boolean;
  style?: React.CSSProperties;
  className?: string;
};

/**
 * A number counting to its real value. Tabular figures are forced so the
 * digits do not jitter the layout while they change.
 */
const Count: React.FC<CountProps> = ({
  to,
  from = 0,
  delay = 0,
  span,
  decimals = 0,
  prefix = '',
  suffix = '',
  group,
  style,
  className,
}) => {
  const frame = useCurrentFrame();
  const value = anim(frame, delay, from, to, span ? {span} : undefined);
  const useGroups = group ?? Math.abs(to) >= 10000;
  const text = value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: useGroups,
  });
  return (
    <span
      className={className}
      style={{fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"', ...style}}
    >
      {prefix}
      {text}
      {suffix}
    </span>
  );
};

/**
 * Data-to-pixel mapping, so a chart's geometry is arithmetic instead of
 * guesswork. `linear` clamps by default; a value outside the domain should
 * sit at the end of the axis, never off the plot.
 */
const scale = {
  linear: ({
    domain,
    range,
    clamp = true,
  }: {
    domain: [number, number];
    range: [number, number];
    clamp?: boolean;
  }) => {
    const [d0, d1] = domain;
    const [r0, r1] = range;
    const spread = d1 - d0 || 1;
    return (value: number) => {
      const t = (value - d0) / spread;
      const bounded = clamp ? Math.min(1, Math.max(0, t)) : t;
      return r0 + bounded * (r1 - r0);
    };
  },
  /** Evenly spaced slots for categories: returns {position, size} per index. */
  band: ({
    count,
    range,
    padding = 0.2,
  }: {
    count: number;
    range: [number, number];
    padding?: number;
  }) => {
    const [r0, r1] = range;
    const total = r1 - r0;
    const step = total / Math.max(1, count);
    const size = step * (1 - padding);
    return (index: number) => ({
      position: r0 + step * index + (step - size) / 2,
      size,
      center: r0 + step * index + step / 2,
    });
  },
  /** A nice rounded axis maximum above the largest value. */
  niceMax: (value: number) => {
    if (value <= 0) return 1;
    const magnitude = 10 ** Math.floor(Math.log10(value));
    return Math.ceil(value / magnitude) * magnitude;
  },
};

/** Evenly spread N items across a length, centred as a group. */
const spread = ({
  count,
  length,
  gap,
}: {
  count: number;
  length: number;
  gap: number;
}) => {
  const size = (length - gap * Math.max(0, count - 1)) / Math.max(1, count);
  return (index: number) => ({position: index * (size + gap), size});
};

type PopProps = Div & {
  delay?: number;
  span?: number;
  fromScale?: number;
  peakScale?: number;
  targetScale?: number;
  /** Vertical lift in pixels as it pops up (default 10px) */
  lift?: number;
  origin?: React.CSSProperties['transformOrigin'];
  exitDelay?: number;
  exitSpan?: number;
};

/**
 * High-energy Pop-up animation:
 * Goes from 0 to 115% really quick, then settles slowly to 100% with eased motion.
 */
const Pop: React.FC<PopProps> = ({
  delay = 0,
  span = 24,
  fromScale = 0,
  peakScale = 1.15,
  targetScale = 1.0,
  lift = 10,
  origin = 'center center',
  exitDelay,
  exitSpan = 18,
  style,
  children,
  ...props
}) => {
  const frame = useCurrentFrame();
  const scaleVal = popScale(frame, delay, span, {from: fromScale, peak: peakScale, to: targetScale});
  const opacity = interpolate(frame - delay, [0, Math.min(6, Math.max(3, Math.round(span * 0.25)))], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  let exitProgress = 0;
  if (exitDelay !== undefined && frame >= exitDelay) {
    exitProgress = popScaleExit(frame, exitDelay, exitSpan);
  }

  const currentScale = scaleVal * (1 - exitProgress * 0.3);
  const currentLift = (1 - Math.min(1, scaleVal / targetScale)) * lift;
  const netOpacity = Math.max(0, Math.min(1, opacity - exitProgress));

  return (
    <div
      {...props}
      style={{
        transform: `translate3d(0, ${currentLift}px, 0) scale(${Math.max(0, currentScale)})`,
        transformOrigin: origin,
        opacity: netOpacity,
        visibility: frame < delay || netOpacity <= 0 ? 'hidden' : 'visible',
        willChange: 'transform, opacity',
        ...style,
      }}
    >
      {children}
    </div>
  );
};

type StampProps = Div & {
  delay?: number;
  span?: number;
  fromScale?: number;
  origin?: React.CSSProperties['transformOrigin'];
};

/**
 * Stamp / Punch pop-in:
 * Stamps down from an oversized scale (1.38x) to 1.0 with a sharp impact and soft spring settle.
 * Excellent for verdicts, badges, checkmarks, status chips, and stamps.
 */
const Stamp: React.FC<StampProps> = ({
  delay = 0,
  span = 22,
  fromScale = 1.38,
  origin = 'center center',
  style,
  children,
  ...props
}) => {
  const frame = useCurrentFrame();
  const progress = popupSpring(frame, delay, span, {damping: 13, mass: 0.6, stiffness: 180});
  const opacity = Math.min(1, popupSpring(frame, delay, Math.round(span * 0.65)));
  const currentScale = fromScale - (fromScale - 1) * progress;

  return (
    <div
      {...props}
      style={{
        transform: `scale(${Math.max(0, currentScale)})`,
        transformOrigin: origin,
        opacity,
        visibility: progress <= 0 || opacity <= 0 ? 'hidden' : 'visible',
        willChange: 'transform, opacity',
        ...style,
      }}
    >
      {children}
    </div>
  );
};

type PulseProps = Div & {
  delay?: number;
  span?: number;
  scale?: number;
  loop?: boolean;
  interval?: number;
  origin?: React.CSSProperties['transformOrigin'];
};

/**
 * Highlight Pulse:
 * A subtle heartbeat expansion (e.g. 1.0 -> 1.14 -> 1.0) with spring deceleration.
 * Can be a one-shot emphasis or a periodic beacon.
 */
const Pulse: React.FC<PulseProps> = ({
  delay = 0,
  span = 20,
  scale = 1.14,
  loop = false,
  interval = 45,
  origin = 'center center',
  style,
  children,
  ...props
}) => {
  const frame = useCurrentFrame();
  if (frame < delay) {
    return <div {...props} style={style}>{children}</div>;
  }
  const relFrame = loop ? (frame - delay) % interval : frame - delay;
  const p = relFrame < span
    ? Math.sin((relFrame / span) * Math.PI)
    : 0;
  const currentScale = 1 + (scale - 1) * p;

  return (
    <div
      {...props}
      style={{
        transform: `scale(${currentScale})`,
        transformOrigin: origin,
        willChange: 'transform',
        ...style,
      }}
    >
      {children}
    </div>
  );
};

type FloatProps = Div & {
  delay?: number;
  distance?: number;
  speed?: number;
  direction?: 'y' | 'x';
};

/**
 * Ambient Hover / Float drift:
 * After entering, elements gently bob with organic floating motion.
 */
const Float: React.FC<FloatProps> = ({
  delay = 0,
  distance = 6,
  speed = 1,
  direction = 'y',
  style,
  children,
  ...props
}) => {
  const frame = useCurrentFrame();
  const activeFrame = Math.max(0, frame - delay);
  const offset = Math.sin(activeFrame * 0.05 * speed) * distance;
  const transform = direction === 'y' ? `translate3d(0, ${offset}px, 0)` : `translate3d(${offset}px, 0, 0)`;

  return (
    <div
      {...props}
      style={{
        transform,
        willChange: 'transform',
        ...style,
      }}
    >
      {children}
    </div>
  );
};

type FlipProps = Div & {
  delay?: number;
  span?: number;
  axis?: 'x' | 'y';
  fromAngle?: number;
  perspective?: number;
  origin?: React.CSSProperties['transformOrigin'];
  exitDelay?: number;
  exitSpan?: number;
};

/**
 * 3D Perspective Flip reveal:
 * Rotates into view with fast launch and smooth spring deceleration.
 */
const Flip: React.FC<FlipProps> = ({
  delay = 0,
  span = 24,
  axis = 'x',
  fromAngle = -35,
  perspective = 800,
  origin = 'center center',
  exitDelay,
  exitSpan = 18,
  style,
  children,
  ...props
}) => {
  const frame = useCurrentFrame();
  const progress = popupSpring(frame, delay, span);
  const opacity = Math.min(1, popupSpring(frame, delay, Math.round(span * 0.7)));

  let exitProgress = 0;
  if (exitDelay !== undefined && frame >= exitDelay) {
    exitProgress = popupSpringExit(frame, exitDelay, exitSpan);
  }

  const angle = fromAngle * (1 - progress) + exitProgress * (-fromAngle);
  const rotation = axis === 'x' ? `rotateX(${angle}deg)` : `rotateY(${angle}deg)`;
  const netOpacity = Math.max(0, Math.min(1, opacity - exitProgress));

  return (
    <div
      {...props}
      style={{
        perspective,
        transform: `${rotation}`,
        transformOrigin: origin,
        opacity: netOpacity,
        visibility: progress <= 0 || netOpacity <= 0 ? 'hidden' : 'visible',
        willChange: 'transform, opacity',
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const kit = {
  safe,
  Slot,
  Rise,
  Wipe,
  Push,
  Pop,
  Popup: Pop,
  Stamp,
  Pulse,
  Float,
  Flip,
  Grow,
  Draw,
  FollowPath,
  Count,
  scale,
  spread,
};

/**
 * Explainer diagram vocabulary.
 *
 * The reference style this studio is used for — a flat editorial explainer —
 * keeps reusing the same handful of marks: an icon on a coloured tile, a wire
 * running between things with a dot on its end, a leader line pointing at a
 * detail, a pointer arrow, concentric rings behind a focal object, a small
 * chip label straddling an edge.
 *
 * Each of them is fiddly to hand-write and each fails in the same ways: an
 * elbow path with the corner on the wrong axis, a leader line that misses its
 * anchor, an SVG whose user units do not match the surrounding pixels. They
 * are components here so the model places them and the geometry is already
 * correct.
 *
 * Geometry note: every SVG layer below is `width: 100%, height: 100%` with no
 * viewBox, so one user unit is one CSS pixel and coordinates are simply
 * positions inside the parent box. Put these inside a bounded ui.Slot or the
 * data-layout-main group and use that group's own coordinates.
 */
import React from 'react';
import {useCurrentFrame} from 'remotion';
import {anim, signalSpring, SPEED_GRAPH} from './motion';
import {Words} from './type';
import {DynamicStudioIcon} from './dynamicIcon';
import {isSignalPalette, paletteNow} from './palette';

type Point = [number, number];

/** A full-parent SVG whose user units are the parent's pixels. */
const Layer: React.FC<{children: React.ReactNode; style?: React.CSSProperties}> = ({
  children,
  style,
}) => (
  <svg
    width="100%"
    height="100%"
    style={{position: 'absolute', left: 0, top: 0, overflow: 'visible', ...style}}
  >
    {children}
  </svg>
);

/** A path drawn by its own length, normalised so no measurement is needed. */
const DrawnPath: React.FC<
  Omit<React.SVGProps<SVGPathElement>, 'ref'> & {d: string; delay: number; span?: number}
> = ({d, delay, span, ...props}) => {
  const frame = useCurrentFrame();
  const progress = anim(frame, delay, 0, 1, span ? {span} : undefined);
  return (
    <path
      fill="none"
      {...props}
      d={d}
      pathLength={1}
      strokeDasharray={1}
      strokeDashoffset={1 - progress}
    />
  );
};

/* ─────────────────────────── Tile ─────────────────────────── */

type TileProps = {
  x?: number;
  y?: number;
  size?: number;
  /** Width and height separately, when the tile is not square. */
  w?: number;
  h?: number;
  radius?: number;
  fill?: string;
  /** Any Lucide name. Ignored when children are supplied. */
  icon?: string;
  iconColor?: string;
  iconSize?: number;
  /** In the icon's own 24-unit box, not pixels. 1.5-2.5 reads as a line icon. */
  strokeWidth?: number;
  border?: string;
  delay?: number;
  /** Which edge the tile is revealed from. 'none' places it with no entrance. */
  from?: 'bottom' | 'top' | 'left' | 'right' | 'none';
  span?: number;
  style?: React.CSSProperties;
  children?: React.ReactNode;
};

/**
 * A rounded tile with a line icon centred in it, revealed by a clip rather
 * than a fade. The icon is sized from the tile unless given its own size, so
 * a row of tiles stays optically consistent without hand-tuning each one.
 */
const Tile: React.FC<TileProps> = ({
  x,
  y,
  size = 320,
  w,
  h,
  radius,
  fill = '#f0a044',
  icon,
  iconColor = '#141414',
  iconSize,
  strokeWidth = 2,
  border,
  delay = 0,
  from = 'bottom',
  span,
  style,
  children,
}) => {
  const frame = useCurrentFrame();
  const signal = isSignalPalette(paletteNow());
  const width = w ?? size;
  const height = h ?? size;
  const progress = signal ? signalSpring(frame, delay, span ?? 22) : (from === 'none' ? 1 : anim(frame, delay, 0, 1, span ? {span} : undefined));
  const hidden = (1 - progress) * 100;
  const inset =
    from === 'bottom'
      ? `${hidden}% 0% 0% 0%`
      : from === 'top'
        ? `0% 0% ${hidden}% 0%`
        : from === 'left'
          ? `0% ${hidden}% 0% 0%`
          : from === 'right'
            ? `0% 0% 0% ${hidden}%`
            : '0%';
  const glyph = iconSize ?? Math.round(Math.min(width, height) * 0.56);

  return (
    <div
      style={{
        position: x === undefined && y === undefined ? 'relative' : 'absolute',
        left: x,
        top: y,
        width,
        height,
        borderRadius: radius ?? Math.round(Math.min(width, height) * 0.14),
        background: fill,
        border: signal ? 'none' : border,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: signal ? 'visible' : 'hidden',
        clipPath: signal ? undefined : `inset(${inset})`,
        transform: signal ? `${style?.transform ?? ''} translate3d(0, ${(1 - progress) * 28}px, 0)`.trim() : style?.transform,
        opacity: signal ? progress : style?.opacity,
        ...style,
        ...(signal ? {border: 'none', outline: 'none', boxShadow: 'none', filter: 'none'} : {}),
      }}
    >
      {children ??
        (icon ? (
          <DynamicStudioIcon
            name={icon}
            width={glyph}
            height={glyph}
            color={iconColor}
            strokeWidth={strokeWidth}
            fill="none"
            aria-hidden
          />
        ) : null)}
    </div>
  );
};

/* ─────────────────────────── Wire ─────────────────────────── */

type WireProps = {
  from: Point;
  to: Point;
  /** Optional exact route, including the first and last point. */
  points?: Point[];
  /**
   * How the run is routed. 'h' turns the corner on the horizontal axis first,
   * 'v' on the vertical, 'kink' runs diagonally then straightens into the
   * target, 'none' is a straight line.
   */
  elbow?: 'none' | 'h' | 'v' | 'kink';
  /** Length of the straight tail on a 'kink' route. */
  tail?: number;
  color?: string;
  width?: number;
  dot?: 'none' | 'start' | 'end' | 'both';
  dotSize?: number;
  /** Draws a crisp directional arrowhead at the start, end, or both. */
  arrow?: boolean | 'none' | 'end' | 'start' | 'both';
  arrowSize?: number;
  dash?: number | string;
  /** Enables continuous dashed moving lines (marching dashes), ideal for trees. */
  flow?: boolean | number;
  delay?: number;
  span?: number;
  cap?: 'butt' | 'round' | 'square';
};

/**
 * A connector that draws itself, with an optional terminal dot or directional
 * arrowhead that arrives once the line reaches it.
 */
const Wire: React.FC<WireProps> = ({
  from,
  to,
  points,
  elbow = 'none',
  tail = 80,
  color = '#141414',
  width = 6,
  dot = 'none',
  dotSize = 22,
  arrow = 'none',
  arrowSize,
  dash,
  flow,
  delay = 0,
  span,
  cap = 'butt',
}) => {
  const frame = useCurrentFrame();
  const [x1, y1] = from;
  const [x2, y2] = to;

  const d =
    points && points.length > 1
      ? points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ')
      : elbow === 'h'
      ? `M ${x1} ${y1} L ${x2} ${y1} L ${x2} ${y2}`
      : elbow === 'v'
        ? `M ${x1} ${y1} L ${x1} ${y2} L ${x2} ${y2}`
        : elbow === 'kink'
          ? `M ${x1} ${y1} L ${x2 + (x2 >= x1 ? -tail : tail)} ${y2} L ${x2} ${y2}`
          : `M ${x1} ${y1} L ${x2} ${y2}`;

  // The dot and arrow land as the stroke arrives, not before it.
  const dotDelay = delay + (span ?? SPEED_GRAPH.span) * 0.72;
  const radius = anim(frame, dotDelay, 0, dotSize / 2, {span: 14});
  const startRadius = anim(frame, delay, 0, dotSize / 2, {span: 14});

  if (flow) {
    const flowSpeed = typeof flow === 'number' ? flow : 1.5;
    const progress = anim(frame, delay, 0, 1, span ? {span} : undefined);
    return (
      <Layer>
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={width}
          strokeLinecap={cap}
          strokeLinejoin="round"
          strokeDasharray={dash ?? '8 6'}
          strokeDashoffset={-frame * flowSpeed}
          opacity={progress}
        />
        {(dot === 'start' || dot === 'both') && (
          <circle cx={x1} cy={y1} r={startRadius} fill={color} />
        )}
        {(dot === 'end' || dot === 'both') && <circle cx={x2} cy={y2} r={radius} fill={color} />}
      </Layer>
    );
  }

  let prevX = x1;
  let prevY = y1;
  if (points && points.length > 1) {
    [prevX, prevY] = points[points.length - 2];
  } else if (elbow === 'h') {
    prevX = x2;
    prevY = y1;
  } else if (elbow === 'v') {
    prevX = x1;
    prevY = y2;
  } else if (elbow === 'kink') {
    prevX = x2 + (x2 >= x1 ? -tail : tail);
    prevY = y2;
  }
  const endAngle = (Math.atan2(y2 - prevY, x2 - prevX) * 180) / Math.PI;

  let nextX = x2;
  let nextY = y2;
  if (points && points.length > 1) {
    [nextX, nextY] = points[1];
  } else if (elbow === 'h') {
    nextX = x2;
    nextY = y1;
  } else if (elbow === 'v') {
    nextX = x1;
    nextY = y2;
  } else if (elbow === 'kink') {
    nextX = x2 + (x2 >= x1 ? -tail : tail);
    nextY = y1;
  }
  const startAngle = (Math.atan2(y1 - nextY, x1 - nextX) * 180) / Math.PI;

  const arrowProgress = anim(frame, dotDelay, 0, 1, {span: 12});
  const startArrowProgress = anim(frame, delay, 0, 1, {span: 12});
  const aSize = arrowSize ?? Math.max(width * 2.8, 16);
  const showEndArrow = arrow === true || arrow === 'end' || arrow === 'both';
  const showStartArrow = arrow === 'start' || arrow === 'both';

  return (
    <Layer>
      <DrawnPath
        d={d}
        delay={delay}
        span={span}
        stroke={color}
        strokeWidth={width}
        strokeLinecap={cap}
        strokeLinejoin="round"
        strokeDasharray={dash}
      />
      {(dot === 'start' || dot === 'both') && (
        <circle cx={x1} cy={y1} r={startRadius} fill={color} />
      )}
      {(dot === 'end' || dot === 'both') && <circle cx={x2} cy={y2} r={radius} fill={color} />}
      {showEndArrow && (
        <polygon
          points={`${-aSize},${-aSize * 0.55} 0,0 ${-aSize},${aSize * 0.55}`}
          transform={`translate(${x2}, ${y2}) rotate(${endAngle}) scale(${arrowProgress})`}
          fill={color}
        />
      )}
      {showStartArrow && (
        <polygon
          points={`${-aSize},${-aSize * 0.55} 0,0 ${-aSize},${aSize * 0.55}`}
          transform={`translate(${x1}, ${y1}) rotate(${startAngle}) scale(${startArrowProgress})`}
          fill={color}
        />
      )}
    </Layer>
  );
};

type ArrowProps = Omit<WireProps, 'arrow'> & {
  label?: string;
  labelBg?: string;
  labelColor?: string;
};

/** A directional arrow connecting two points, states, or nodes, with optional edge label. */
const Arrow: React.FC<ArrowProps> = ({
  label,
  labelBg,
  labelColor,
  color = '#38bdf8',
  ...wireProps
}) => {
  const [x1, y1] = wireProps.from;
  const [x2, y2] = wireProps.to;
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;

  return (
    <>
      <Wire {...wireProps} color={color} arrow="end" />
      {label ? (
        <EdgeLabel
          x={midX}
          y={midY}
          label={label}
          color={labelColor}
          background={labelBg}
          delay={(wireProps.delay ?? 0) + (wireProps.span ?? 24) * 0.4}
        />
      ) : null}
    </>
  );
};

type TreeWireProps = Omit<WireProps, 'arrow'> & {
  /** Speed of the marching dashed lines (default 1.5). */
  speed?: number;
};

/**
 * Dedicated tree connector with dashed moving lines and NO arrows.
 * Used for worktrees, branching trees, and hierarchy topologies.
 */
const TreeWire: React.FC<TreeWireProps> = ({
  speed = 1.5,
  dash = '8 6',
  color = '#FAFAFA',
  width = 3,
  cap = 'round',
  ...wireProps
}) => (
  <Wire
    {...wireProps}
    arrow="none"
    dash={dash}
    flow={speed}
    color={color}
    width={width}
    cap={cap}
  />
);

/* ───────────────────────── Flow node ───────────────────────── */

type FlowNodeProps = {
  x: number;
  y: number;
  label: string;
  w?: number;
  h?: number;
  radius?: number;
  fill?: string;
  border?: string;
  color?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  tracking?: string | number;
  delay?: number;
  span?: number;
  from?: 'bottom' | 'top' | 'left' | 'right';
  style?: React.CSSProperties;
};

/** A compact text-first state for connected diagrams, not an icon card. */
const FlowNode: React.FC<FlowNodeProps> = ({
  x,
  y,
  label,
  w = 200,
  h = 72,
  radius = 14,
  fill = '#101010',
  border,
  color = '#f5f5f5',
  fontFamily = 'system-ui, sans-serif',
  fontSize = 22,
  fontWeight = 500,
  tracking = '-0.01em',
  delay = 0,
  span = 22,
  from = 'bottom',
  style,
}) => {
  const frame = useCurrentFrame();
  const signal = isSignalPalette(paletteNow());
  const borderRule = signal ? 'none' : border ?? '1px solid #343434';
  const progress = signal ? signalSpring(frame, delay, span) : anim(frame, delay, 0, 1, {span});
  const hidden = (1 - progress) * 100;
  const inset =
    from === 'bottom'
      ? `${hidden}% 0% 0% 0%`
      : from === 'top'
        ? `0% 0% ${hidden}% 0%`
        : from === 'left'
          ? `0% ${hidden}% 0% 0%`
          : `0% 0% 0% ${hidden}%`;

  return (
    <div
      style={{
        position: 'absolute', left: x, top: y, width: w, minHeight: h,
        boxSizing: 'border-box', padding: '16px 26px',
        borderRadius: radius, background: fill, border: borderRule, color, fontFamily,
        fontSize, fontWeight, letterSpacing: tracking, lineHeight: 1.3,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', whiteSpace: 'nowrap',
        overflow: signal ? 'visible' : 'hidden',
        clipPath: signal ? undefined : `inset(${inset})`,
        transform: signal ? `${style?.transform ?? ''} translate3d(0, ${(1 - progress) * 24}px, 0)`.trim() : style?.transform,
        opacity: signal ? progress : style?.opacity,
        ...style,
        ...(signal ? {border: 'none', outline: 'none', boxShadow: 'none', filter: 'none'} : {}),
      }}
    >
      {label}
    </div>
  );
};

type EdgeLabelProps = {
  x: number;
  y: number;
  label: string;
  delay?: number;
  color?: string;
  background?: string;
  border?: string;
  fontFamily?: string;
  fontSize?: number;
  padding?: string;
  radius?: number;
  style?: React.CSSProperties;
};

/** A restrained transition label that can sit directly across a route. */
const EdgeLabel: React.FC<EdgeLabelProps> = ({
  x, y, label, delay = 0, color = '#8b8b8b', background = '#050505',
  border, fontFamily = 'system-ui, sans-serif',
  fontSize = 15, padding = '9px 18px', radius = 999, style,
}) => {
  const frame = useCurrentFrame();
  const signal = isSignalPalette(paletteNow());
  const borderRule = signal ? 'none' : border ?? '1px solid #242424';
  const reveal = signal ? signalSpring(frame, delay, 16) : anim(frame, delay, 0, 1, {span: 16});
  return (
    <div style={{
      position: 'absolute', left: x, top: y,
      transform: signal
        ? `translate(-50%, -50%) translate3d(0, ${(1 - reveal) * 16}px, 0)`
        : `translate(-50%, -50%) scale(${0.92 + reveal * 0.08})`,
      transformOrigin: '50% 50%',
      clipPath: signal ? undefined : `inset(0 ${100 - reveal * 100}% 0 0)`,
      opacity: signal ? reveal : 1,
      boxSizing: 'border-box',
      color, background, border: borderRule, borderRadius: radius, padding, fontFamily,
      fontSize, fontWeight: 500, lineHeight: 1.3, whiteSpace: 'nowrap', ...style,
      ...(signal ? {border: 'none', outline: 'none', boxShadow: 'none', filter: 'none'} : {}),
    }}>
      {label}
    </div>
  );
};

/* ────────────────────────── Callout ───────────────────────── */

type CalloutProps = {
  /** The point being annotated. */
  at: Point;
  side?: 'right' | 'left';
  /** Horizontal distance from the anchor to the label. */
  length?: number;
  /** How far the label sits above (negative) or below the anchor. */
  rise?: number;
  tail?: number;
  color?: string;
  width?: number;
  handle?: 'square' | 'dot' | 'none';
  handleSize?: number;
  label?: string;
  sublabel?: string;
  labelStyle?: React.CSSProperties;
  sublabelStyle?: React.CSSProperties;
  labelWidth?: number;
  delay?: number;
  span?: number;
  children?: React.ReactNode;
};

/**
 * The annotation mark: a small handle on the thing being pointed at, a leader
 * line, and a label. Kept as one component because the failure mode when it
 * is assembled by hand is always the same — the line and the handle drift
 * apart, or the label overlaps the line it is attached to.
 */
const Callout: React.FC<CalloutProps> = ({
  at,
  side = 'right',
  length = 260,
  rise = -90,
  tail = 90,
  color = '#3ddbb0',
  width = 2,
  handle = 'square',
  handleSize = 14,
  label,
  sublabel,
  labelStyle,
  sublabelStyle,
  labelWidth = 420,
  delay = 0,
  span,
  children,
}) => {
  const frame = useCurrentFrame();
  const [ax, ay] = at;
  const direction = side === 'right' ? 1 : -1;
  const endX = ax + direction * length;
  const endY = ay + rise;
  const handleScale = anim(frame, delay, 0, 1, {span: 14});
  const labelDelay = delay + (span ?? SPEED_GRAPH.span) * 0.5;

  return (
    <>
      <Layer>
        <path
          d={`M ${ax} ${ay} L ${endX - direction * tail} ${endY} L ${endX} ${endY}`}
          fill="none"
          stroke={color}
          strokeWidth={width}
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - anim(frame, delay, 0, 1, span ? {span} : undefined)}
        />
        {handle === 'square' && (
          <rect
            x={ax - (handleSize * handleScale) / 2}
            y={ay - (handleSize * handleScale) / 2}
            width={handleSize * handleScale}
            height={handleSize * handleScale}
            fill={color}
          />
        )}
        {handle === 'dot' && <circle cx={ax} cy={ay} r={(handleSize / 2) * handleScale} fill={color} />}
      </Layer>
      <div
        style={{
          position: 'absolute',
          left: side === 'right' ? endX + 18 : endX - 18,
          top: endY,
          width: labelWidth,
          transform: side === 'right' ? 'translateY(-50%)' : 'translate(-100%, -50%)',
          textAlign: side === 'right' ? 'left' : 'right',
        }}
      >
        {children ?? (
          <>
            {label ? (
              <Words
                text={label}
                delay={labelDelay}
                maxWidth={labelWidth}
                align={side === 'right' ? 'left' : 'right'}
                style={labelStyle}
              />
            ) : null}
            {sublabel ? (
              <Words
                text={sublabel}
                delay={labelDelay + 8}
                maxWidth={labelWidth}
                align={side === 'right' ? 'left' : 'right'}
                style={sublabelStyle}
              />
            ) : null}
          </>
        )}
      </div>
    </>
  );
};

/* ─────────────────────────── Cursor ───────────────────────── */

type CursorProps = {
  x: number;
  y: number;
  /** Travels from here to (x, y) when given. */
  from?: Point;
  size?: number;
  color?: string;
  outline?: string;
  delay?: number;
  span?: number;
  /** Frame at which the pointer presses. One dip, no bounce. */
  click?: number;
  style?: React.CSSProperties;
};

/**
 * The pointer arrow. The tip is the anchor: (x, y) is where it points, not
 * the corner of its box, which is the thing that is always wrong when this is
 * drawn by hand.
 */
const Cursor: React.FC<CursorProps> = ({
  x,
  y,
  from,
  size = 120,
  color = '#141414',
  outline,
  delay = 0,
  span,
  click,
  style,
}) => {
  const frame = useCurrentFrame();
  const travelX = from ? anim(frame, delay, from[0], x, span ? {span} : undefined) : x;
  const travelY = from ? anim(frame, delay, from[1], y, span ? {span} : undefined) : y;
  // A press, not a bounce: one dip down and one recovery, nothing past 1.
  const press =
    click === undefined
      ? 1
      : anim(frame, click, 1, 0.88, {span: 6}) + anim(frame, click + 6, 0, 0.12, {span: 10});

  return (
    <svg
      width={size}
      height={size * 1.32}
      viewBox="0 0 24 32"
      style={{
        position: 'absolute',
        left: travelX,
        top: travelY,
        transform: `scale(${press})`,
        transformOrigin: '0% 0%',
        overflow: 'visible',
        ...style,
      }}
    >
      <path
        d="M1 1 L1 26 L7.2 20.2 L11.4 30 L15.6 28.2 L11.5 18.7 L20 18.4 Z"
        fill={color}
        stroke={outline ?? 'none'}
        strokeWidth={outline ? 1.5 : 0}
        strokeLinejoin="round"
      />
    </svg>
  );
};

/* ─────────────────────────── Rings ────────────────────────── */

type RingsProps = {
  x: number;
  y: number;
  /** Explicit radii, or use count + step. A bare number is accepted too. */
  radii?: number[] | number;
  count?: number;
  step?: number;
  inner?: number;
  color?: string;
  width?: number;
  delay?: number;
  stagger?: number;
  span?: number;
};

/** Concentric rings behind a focal object. Each ring draws itself in turn. */
const Rings: React.FC<RingsProps> = ({
  x,
  y,
  radii,
  count = 3,
  step = 210,
  inner = 240,
  color = '#141414',
  width = 2,
  delay = 0,
  stagger = 10,
  span,
}) => {
  const frame = useCurrentFrame();
  // Same guard as ui.DataTable's highlight: a model that passes radii={80}
  // instead of radii={[80]} must not take the whole cut down with a
  // "radii.map is not a function".
  const list = Array.isArray(radii)
    ? radii
    : typeof radii === 'number'
      ? [radii]
      : Array.from({length: count}, (_, index) => inner + index * step);
  return (
    <Layer>
      {list.map((radius, index) => (
        <circle
          key={radius}
          cx={x}
          cy={y}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={width}
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - anim(frame, delay + index * stagger, 0, 1, span ? {span} : undefined)}
        />
      ))}
    </Layer>
  );
};

/* ─────────────────────────── Chip ─────────────────────────── */

type ChipProps = React.HTMLAttributes<HTMLDivElement> & {
  background?: string;
  color?: string;
  radius?: number;
  padding?: string | number;
  border?: string;
  delay?: number;
  from?: 'bottom' | 'top' | 'left' | 'right' | 'none';
  span?: number;
};

/** The small pill label that sits on or across the edge of a card. */
const Chip: React.FC<ChipProps> = ({
  background = '#0b3b32',
  color = '#ffffff',
  radius = 12,
  padding = '14px 34px',
  border,
  delay = 0,
  from = 'bottom',
  span,
  style,
  ...props
}) => {
  const frame = useCurrentFrame();
  const signal = isSignalPalette(paletteNow());
  const progress = signal ? signalSpring(frame, delay, span ?? 18) : (from === 'none' ? 1 : anim(frame, delay, 0, 1, span ? {span} : undefined));
  const hidden = (1 - progress) * 100;
  const inset =
    from === 'bottom'
      ? `${hidden}% 0% 0% 0%`
      : from === 'top'
        ? `0% 0% ${hidden}% 0%`
        : from === 'left'
          ? `0% ${hidden}% 0% 0%`
          : `0% 0% 0% ${hidden}%`;
  return (
    <div
      {...props}
      style={{
        display: 'inline-block',
        background,
        color,
        borderRadius: radius,
        padding,
        border: signal ? 'none' : border,
        whiteSpace: 'nowrap',
        clipPath: signal ? undefined : `inset(${inset} round ${radius}px)`,
        transform: signal ? `${style?.transform ?? ''} translate3d(0, ${(1 - progress) * 18}px, 0)`.trim() : style?.transform,
        opacity: signal ? progress : style?.opacity,
        ...style,
        ...(signal ? {border: 'none', outline: 'none', boxShadow: 'none', filter: 'none'} : {}),
      }}
    />
  );
};

export const diagram = {
  Tile,
  Wire,
  Arrow,
  TreeWire,
  FlowNode,
  EdgeLabel,
  Callout,
  Cursor,
  Rings,
  Chip,
};

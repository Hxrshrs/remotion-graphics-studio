/**
 * Hand-drawn explainer vocabulary.
 *
 * The reference here is a technical explainer shot on a flat dark navy ground:
 * big centred type, hard column alignment, and a handful of *marks* drawn by
 * hand over the top — a curly brace gathering a block, an underline under a
 * phrase, circled numerals down a list, a segmented header strip with content
 * column-aligned beneath it.
 *
 * The handwritten feel comes from the marks, never from wobbly text. A brace
 * here is a real cubic-bezier construction (two outward arms, a hook at each
 * terminal, a point in the middle) rather than a rotated font glyph, because a
 * glyph cannot span an arbitrary length without shearing its stroke weight.
 *
 * Geometry note, same as `diagram.tsx`: every SVG layer below is
 * `width: 100%, height: 100%` with no viewBox, so one user unit is one CSS
 * pixel and coordinates are simply positions inside the positioned parent.
 *
 * Nothing here fades. Marks arrive by drawing themselves, boxes by clip,
 * badges by scale, lists by count and stagger. `opacity` is never animated.
 */
import React from 'react';
import {useCurrentFrame} from 'remotion';
import {anim, signalSpring, stagger as staggerBy} from './motion';
import {font} from './fonts';
import {isSignalPalette} from './palette';

/** The reference palette. Exported through nothing — defaults only. */
const MINT = '#5ee88a';
const PERI = '#93b4f0';
const TEAL = '#4a8a94';
const WHITE = '#ffffff';

/**
 * Hard and barely there for the non-signal registers: a tight offset with no
 * blur radius, at low alpha. A blurred shadow reads as a glow on this ground
 * and immediately breaks the flat-poster look the whole vocabulary depends on;
 * signal disables depth effects entirely.
 */
const HARD_SHADOW = '0 3px 0 rgba(0,0,0,.22)';

const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace, 'Apple Color Emoji'";
const SANS = font('Fredoka');

/**
 * Models pass a scalar where a list is documented often enough that it has to
 * be survivable: `items="one"` instead of `items={['one']}` or `radii={90}`
 * instead of `radii={[90]}`. A helper that throws kills every shot in the cut,
 * so coerce instead of trusting the type. This has already cost three renders.
 */
const asArray = <T,>(value: T | T[] | undefined | null): T[] => {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
};

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

/**
 * A path drawn by its own length, normalised so no measurement is needed.
 * `pathLength={1}` is what makes this correct during a seek: the dash offset is
 * a pure function of the frame, with no layout pass to wait for.
 */
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

/* ──────────────────── Deterministic hand wobble ──────────────────── */

/** FNV-1a over the props that define a mark, so the same mark hashes alike. */
const hashSeed = (input: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

/**
 * Signed noise in [-1, 1] for the nth coordinate of a seeded mark.
 *
 * `Math.random()` is banned in scene scope and would be wrong here anyway:
 * Remotion re-renders the same frame during a seek and on every render pass, so
 * a randomly wobbled brace would crawl. Every offset below is a pure function
 * of the props, which means frame 120 looks identical however often it is
 * drawn, while two braces of different length still wobble differently.
 */
const jitter = (seed: number, index: number): number => {
  const mixed = Math.imul(seed ^ Math.imul(index + 1, 0x9e3779b1), 0x85ebca6b) >>> 0;
  return (mixed % 2001) / 1000 - 1;
};

type Pt = [number, number];

/**
 * Nudge a run of points by the seeded noise, in place of a shaky hand.
 *
 * `weights` scales the shake per point, because a real hand is steady where it
 * is turning a tight corner and loose along a long unsupported run. Applying
 * one flat amplitude makes the terminals look chewed and the long arms look
 * ruled, which is the wrong way round.
 */
const wobbled = (points: Pt[], seed: number, amount: number, weights?: number[]): Pt[] =>
  points.map(([px, py], index): Pt => {
    const weight = (weights?.[index] ?? 1) * amount;
    return [px + jitter(seed, index * 2) * weight, py + jitter(seed, index * 2 + 1) * weight];
  });

/** `M` then a chain of cubics: the point list must be 1 + 3n long. */
const cubicPath = (points: Pt[]): string => {
  if (points.length === 0) return '';
  let d = `M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`;
  for (let index = 1; index + 2 < points.length; index += 3) {
    const [c1x, c1y] = points[index];
    const [c2x, c2y] = points[index + 1];
    const [ex, ey] = points[index + 2];
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${ex.toFixed(2)} ${ey.toFixed(2)}`;
  }
  return d;
};

/* ─────────────────────────── Brace ─────────────────────────── */

type BraceOpen = 'down' | 'up' | 'left' | 'right';

type BraceProps = {
  /** The brace's POINT — the little spike in the middle — not a box corner. */
  x: number;
  y: number;
  /** Span from terminal to terminal, along the brace's own axis. */
  length?: number;
  /** How far the point stands off the arms. Drives the hook size too. */
  depth?: number;
  /** Which way the mouth faces, i.e. which side the gathered content is on. */
  open?: BraceOpen;
  color?: string;
  width?: number;
  /** Peak hand-shake in pixels. 0 gives a mechanically clean brace. */
  wobble?: number;
  /** Override the shape's identity when two same-size braces should differ. */
  seed?: string | number;
  delay?: number;
  span?: number;
};

/**
 * The signature mark: a hand-drawn curly brace, drawn from one terminal
 * through the point to the other, in one stroke, the way a hand draws it.
 *
 * Built in a canonical orientation — an overbrace, point at the local origin,
 * arms running along ±x, terminals hooking down to +y — and then rotated about
 * that origin. Anchoring on the point rather than a bounding box is what makes
 * the four orientations interchangeable at a call site: the label always hangs
 * off (x, y) and the gathered content always sits on the far side.
 *
 * The hook and point runs are sized in absolute pixels rather than as a
 * fraction of the span, so a 1200px brace keeps the same terminal curl as a
 * 300px one instead of growing a pair of scrolls.
 */
const Brace: React.FC<BraceProps> = ({
  x,
  y,
  length = 520,
  depth = 30,
  open = 'down',
  color = WHITE,
  width = 5,
  wobble = 2.4,
  seed,
  delay = 0,
  span,
}) => {
  const half = Math.max(24, length) / 2;
  const armY = depth;
  const hookDrop = depth * 0.62;
  // Clamped so a short brace degrades into a shallow chevron instead of
  // folding its hooks back through its own point.
  const hookRun = Math.min(depth * 0.5, half * 0.24);
  const pointRun = Math.min(depth * 0.85, half * 0.35);
  // The arms sag away from the point. Scaled by span, not by depth, because a
  // long arm held level for 1200px is the single thing that most gives away a
  // machine-drawn brace.
  const sag = depth * 0.1 + half * 0.012;

  const raw: Pt[] = [
    [-half, armY + hookDrop],
    [-half + hookRun * 0.05, armY + hookDrop * 0.62],
    [-half + hookRun * 0.5, armY + hookDrop * 0.06],
    [-half + hookRun, armY],
    [-half * 0.68, armY + sag * 0.8],
    [-half * 0.3, armY + sag],
    [-pointRun * 1.15, armY + sag * 0.7],
    // The point is a spike, so both controls sit close to the tip: a control
    // out near the arm rounds it into a bump instead.
    [-pointRun * 0.55, armY * 0.92],
    [-pointRun * 0.2, armY * 0.2],
    [0, 0],
    [pointRun * 0.2, armY * 0.2],
    [pointRun * 0.55, armY * 0.92],
    [pointRun * 1.15, armY + sag * 0.7],
    [half * 0.3, armY + sag],
    [half * 0.68, armY + sag * 0.8],
    [half - hookRun, armY],
    [half - hookRun * 0.5, armY + hookDrop * 0.06],
    [half - hookRun * 0.05, armY + hookDrop * 0.62],
    [half, armY + hookDrop],
  ];
  // Steady at the four corners the stroke turns on, loose along the two arms.
  const weights = [
    0.6, 0.5, 0.5, 0.7, 2.1, 2.1, 1.1, 0.5, 0.4, 0.35, 0.4, 0.5, 1.1, 2.1, 2.1, 0.7, 0.5, 0.5, 0.6,
  ];

  const key = seed === undefined ? `${length}:${depth}:${open}` : String(seed);
  const d = cubicPath(wobbled(raw, hashSeed(key), wobble, weights));
  const rotation = open === 'down' ? 0 : open === 'up' ? 180 : open === 'right' ? -90 : 90;

  return (
    <Layer>
      <g transform={`translate(${x} ${y}) rotate(${rotation})`}>
        <DrawnPath
          d={d}
          delay={delay}
          span={span}
          stroke={color}
          strokeWidth={width}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </Layer>
  );
};

/* ──────────────────────── Braced group ─────────────────────── */

type BraceGroupProps = BraceProps & {
  /** Sits on the outside of the brace, level with the point. */
  label?: string;
  labelColor?: string;
  labelSize?: number;
  labelFamily?: string;
  labelWeight?: React.CSSProperties['fontWeight'];
  /** Gap from the point out to the label. */
  gap?: number;
  /** Gap from the terminals in to the gathered content. */
  contentGap?: number;
  /** Cross-axis size of the content slot. Defaults to the brace's own length. */
  contentSize?: number;
  labelStyle?: React.CSSProperties;
  contentStyle?: React.CSSProperties;
  children?: React.ReactNode;
};

/**
 * A brace with its label at the point and the gathered content on its mouth
 * side, so "Base 38, brace, character block" is one call.
 *
 * The label and the content are placed by the same anchor as the brace itself
 * (its point), which is the whole reason this exists: assembled by hand, the
 * three pieces drift apart the moment the brace's length or depth changes.
 */
const BraceGroup: React.FC<BraceGroupProps> = ({
  x,
  y,
  length = 520,
  depth = 30,
  open = 'down',
  color = WHITE,
  width,
  wobble,
  seed,
  delay = 0,
  span,
  label,
  labelColor = MINT,
  labelSize = 46,
  labelFamily = SANS,
  labelWeight = 600,
  gap = 22,
  contentGap = 26,
  contentSize,
  labelStyle,
  contentStyle,
  children,
}) => {
  const frame = useCurrentFrame();
  const signal = isSignalPalette();
  const vertical = open === 'down' || open === 'up';
  // How far the terminals reach past the point, i.e. where content must start.
  const reach = depth * 1.45;
  const slot = contentSize ?? length;

  // A label is machine text, so it wipes in from the point outward rather than
  // pretending to be drawn.
  const labelReveal = anim(frame, delay, 0, 1, {span: 22});
  const contentReveal = anim(frame, delay + 14, 0, 1, {span: 26});

  const sign = open === 'down' || open === 'right' ? 1 : -1;
  const labelBox: React.CSSProperties = vertical
    ? {
        left: x,
        top: y - sign * gap,
        transform: `translate(-50%, ${sign > 0 ? '-100%' : '0%'})`,
        textAlign: 'center',
      }
    : {
        left: x - sign * gap,
        top: y,
        transform: `translate(${sign > 0 ? '-100%' : '0%'}, -50%)`,
        textAlign: sign > 0 ? 'right' : 'left',
      };

  const contentBox: React.CSSProperties = vertical
    ? {
        left: x,
        top: y + sign * (reach + contentGap),
        width: slot,
        transform: `translate(-50%, ${sign > 0 ? '0%' : '-100%'})`,
        textAlign: 'center',
      }
    : {
        left: x + sign * (reach + contentGap),
        top: y,
        minHeight: slot,
        // `max-content` rather than auto: an absolutely positioned box with a
        // shrink-to-fit width would collapse to zero, and a zero-width box
        // takes its clip-path with it — the content vanishes entirely.
        width: 'max-content',
        transform: `translate(${sign > 0 ? '0%' : '-100%'}, -50%)`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      };

  // The content is uncovered in the direction the mouth faces, so the brace
  // looks like it is holding open a space the content then fills.
  const hide = (1 - contentReveal) * 100;
  const contentClip =
    open === 'down'
      ? `inset(0 0 ${hide}% 0)`
      : open === 'up'
        ? `inset(${hide}% 0 0 0)`
        : open === 'right'
          ? `inset(0 ${hide}% 0 0)`
          : `inset(0 0 0 ${hide}%)`;

  return (
    <>
      <Brace
        x={x}
        y={y}
        length={length}
        depth={depth}
        open={open}
        color={color}
        width={width}
        wobble={wobble}
        seed={seed}
        delay={delay}
        span={span}
      />
      {label ? (
        <div
          style={{
            position: 'absolute',
            fontFamily: labelFamily,
            fontSize: labelSize,
            fontWeight: labelWeight,
            color: labelColor,
            lineHeight: 1.1,
            whiteSpace: 'nowrap',
            clipPath: signal ? undefined : `inset(0 ${(1 - labelReveal) * 100}% 0 0)`,
            transform: signal ? `translate3d(0, ${(1 - labelReveal) * 16}px, 0)` : undefined,
            opacity: signal ? labelReveal : 1,
            ...labelBox,
            ...labelStyle,
          }}
        >
          {label}
        </div>
      ) : null}
      {children ? (
        <div
          style={{
            position: 'absolute',
            clipPath: contentClip,
            // What a brace gathers is usually a set with no spaces in it — an
            // alphabet, a character class, a key. Without this the string has
            // no break opportunity, overflows the slot, and the clip silently
            // eats the middle of it.
            overflowWrap: 'anywhere',
            ...contentBox,
            ...contentStyle,
          }}
        >
          {children}
        </div>
      ) : null}
    </>
  );
};

/* ──────────────────────── Number badge ─────────────────────── */

type NumberBadgeProps = {
  /** Omit both to place the badge inline inside a flex row. */
  x?: number;
  y?: number;
  /** The numeral, or any short glyph. */
  n: number | string;
  size?: number;
  fill?: string;
  color?: string;
  /** Ratio of the circle diameter. 0.56 keeps a two-digit numeral inside. */
  scale?: number;
  family?: string;
  weight?: React.CSSProperties['fontWeight'];
  delay?: number;
  span?: number;
  shadow?: boolean | string;
  style?: React.CSSProperties;
};

/**
 * A filled circle with a numeral centred in it — ①②③ as a component.
 *
 * It arrives by scaling from nothing, which is the no-fade way to make a small
 * mark land. `visibility` rather than opacity keeps it off-screen until its
 * delay, since a zero-scale element still paints a hairline in some browsers.
 */
const NumberBadge: React.FC<NumberBadgeProps> = ({
  x,
  y,
  n,
  size = 56,
  fill = PERI,
  color = WHITE,
  scale = 0.56,
  family = SANS,
  weight = 700,
  delay = 0,
  span = 18,
  shadow = false,
  style,
}) => {
  const frame = useCurrentFrame();
  const signal = isSignalPalette();
  const grow = anim(frame, delay, 0, 1, {span});
  const positioned = x !== undefined || y !== undefined;

  return (
    <div
      style={{
        position: positioned ? 'absolute' : 'relative',
        left: x,
        top: y,
        width: size,
        height: size,
        flex: '0 0 auto',
        borderRadius: '50%',
        background: fill,
        color,
        fontFamily: family,
        fontWeight: weight,
        fontSize: Math.round(size * scale),
        lineHeight: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: signal
          ? undefined
          : shadow
            ? typeof shadow === 'string'
              ? shadow
              : HARD_SHADOW
            : undefined,
        transform: `${positioned ? 'translate(-50%, -50%) ' : ''}scale(${grow})`,
        transformOrigin: '50% 50%',
        visibility: grow <= 0 ? 'hidden' : 'visible',
        ...style,
        ...(signal ? {boxShadow: 'none', filter: 'none', textShadow: 'none', outline: 'none'} : {}),
      }}
    >
      {n}
    </div>
  );
};

/* ──────────────────────── Number list ──────────────────────── */

type NumberListProps = {
  /** Left edge of the badge column, and the top of the first row. Omit both
   * to lay the list out in normal flow, e.g. inside a ui.BraceGroup slot. */
  x?: number;
  y?: number;
  items?: string[] | string;
  /** First numeral. 1 by default, so item 0 reads "1". */
  start?: number;
  /** Row pitch, centre to centre. */
  rowGap?: number;
  badgeSize?: number;
  badgeFill?: string;
  badgeColor?: string;
  /** Gap between the badge and the text. */
  gap?: number;
  color?: string;
  fontSize?: number;
  family?: string;
  weight?: React.CSSProperties['fontWeight'];
  delay?: number;
  /** Frames between one row and the next. */
  step?: number;
  span?: number;
  style?: React.CSSProperties;
};

/**
 * A numbered list of circled-numeral rows. The badge scales up and the text
 * behind it is uncovered by a left-to-right clip, so a row reads as being
 * written rather than appearing.
 *
 * Every row is exactly `rowGap` tall rather than as tall as its text, so the
 * list's height is always `rowGap * count`. The caller almost always has to
 * line a brace up against that height and cannot be made to measure it. The
 * rows still sit in normal flow, so the list box itself has a real width and
 * height and can be clipped by whatever slot it is dropped into.
 */
const NumberList: React.FC<NumberListProps> = ({
  x,
  y,
  items,
  start = 1,
  rowGap = 74,
  badgeSize = 52,
  badgeFill = PERI,
  badgeColor = WHITE,
  gap = 24,
  color = WHITE,
  fontSize = 34,
  family = SANS,
  weight = 500,
  delay = 0,
  step,
  span,
  style,
}) => {
  const frame = useCurrentFrame();
  const rows = asArray(items);
  const positioned = x !== undefined || y !== undefined;

  return (
    <div
      style={{
        position: positioned ? 'absolute' : 'relative',
        left: x,
        top: y,
        width: 'max-content',
        ...style,
      }}
    >
      {rows.map((row, index) => {
        const rowDelay = delay + staggerBy(index, step);
        const signal = isSignalPalette();
        const reveal = signal ? signalSpring(frame, rowDelay + 4, span ?? 20) : anim(frame, rowDelay + 6, 0, 1, span ? {span} : {span: 24});
        return (
          <div
            key={`${index}-${row}`}
            style={{
              height: rowGap,
              display: 'flex',
              alignItems: 'center',
              gap,
              whiteSpace: 'nowrap',
            }}
          >
            <NumberBadge
              n={start + index}
              size={badgeSize}
              fill={badgeFill}
              color={badgeColor}
              delay={rowDelay}
            />
            <div
              style={{
                fontFamily: family,
                fontSize,
                fontWeight: weight,
                color,
                lineHeight: 1.1,
                clipPath: signal ? undefined : `inset(0 ${(1 - reveal) * 100}% 0 0)`,
                transform: signal ? `translate3d(0, ${(1 - reveal) * 16}px, 0)` : undefined,
                opacity: signal ? reveal : 1,
              }}
            >
              {row}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* ─────────────────────── Segmented bar ─────────────────────── */

/**
 * The x-centre of each segment of a bar, in the parent's own coordinates.
 *
 * Exported alongside the component because column-aligning content under the
 * bar is the entire point of it, and a caller who lays the bar out in one place
 * and the columns in another must be able to compute the same numbers without
 * a render prop.
 */
const segmentCenters = (x: number, width: number, count: number): number[] => {
  const n = Math.max(1, Math.round(count));
  const step = width / n;
  return Array.from({length: n}, (_, index) => x + step * (index + 0.5));
};

type SegmentInfo = {
  /** x-centre of each segment, in parent coordinates. */
  centers: number[];
  /** x of each segment's left edge, plus the bar's right edge (count + 1). */
  edges: number[];
  segmentWidth: number;
  /** y of the bar's bottom edge — where content beneath it starts. */
  bottom: number;
};

type SegmentBarProps = {
  x: number;
  y: number;
  width?: number;
  height?: number;
  segments?: string[] | string;
  fill?: string;
  color?: string;
  divider?: string;
  fontSize?: number;
  family?: string;
  weight?: React.CSSProperties['fontWeight'];
  radius?: number;
  delay?: number;
  span?: number;
  style?: React.CSSProperties;
  /**
   * Content beneath the bar. Given the segment geometry so columns can be
   * aligned, and rendered OUTSIDE the bar's clip so it is never cut off.
   */
  children?: React.ReactNode | ((info: SegmentInfo) => React.ReactNode);
};

/**
 * A filled bar cut into N labelled segments, wiping in left to right.
 *
 * The labels are staggered against the wipe front so each one is uncovered as
 * the fill reaches it — the bar looks like it is being swept on with one pass
 * of a marker rather than appearing and then filling with text.
 */
const SegmentBar: React.FC<SegmentBarProps> = ({
  x,
  y,
  width = 1200,
  height = 92,
  segments,
  fill = TEAL,
  color = PERI,
  divider = 'rgba(0,0,0,.28)',
  fontSize = 38,
  family = MONO,
  weight = 500,
  radius = 6,
  delay = 0,
  span = 30,
  style,
  children,
}) => {
  const frame = useCurrentFrame();
  const signal = isSignalPalette();
  const labels = asArray(segments);
  const count = Math.max(1, labels.length);
  const wipe = signal ? signalSpring(frame, delay, span ?? 22) : anim(frame, delay, 0, 1, {span});
  const step = width / count;

  const info: SegmentInfo = {
    centers: segmentCenters(x, width, count),
    edges: Array.from({length: count + 1}, (_, index) => x + step * index),
    segmentWidth: step,
    bottom: y + height,
  };

  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width,
          height,
          background: fill,
          borderRadius: radius,
          overflow: signal ? 'visible' : 'hidden',
          clipPath: signal ? undefined : `inset(0 ${(1 - wipe) * 100}% 0 0 round ${radius}px)`,
          transform: signal ? `${style?.transform ?? ''} translate3d(0, ${(1 - wipe) * 20}px, 0)`.trim() : style?.transform,
          opacity: signal ? wipe : style?.opacity,
          ...style,
        }}
      >
        {labels.map((label, index) => (
          <React.Fragment key={`${index}-${label}`}>
            {index > 0 && (
              <div
                style={{
                  position: 'absolute',
                  left: step * index,
                  top: 0,
                  width: 2,
                  height: '100%',
                  background: divider,
                }}
              />
            )}
            <div
              style={{
                position: 'absolute',
                left: step * index,
                top: 0,
                width: step,
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: family,
                fontSize,
                fontWeight: weight,
                color,
                lineHeight: 1,
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </div>
          </React.Fragment>
        ))}
      </div>
      {typeof children === 'function' ? children(info) : children}
    </>
  );
};

/* ───────────────────────── Label / value ───────────────────── */

type LabelValueProps = {
  /** Centre of the pair, horizontally; top of the label vertically. */
  x: number;
  y: number;
  label?: string | number;
  value?: string | number;
  labelColor?: string;
  valueColor?: string;
  labelSize?: number;
  valueSize?: number;
  labelFamily?: string;
  valueFamily?: string;
  labelWeight?: React.CSSProperties['fontWeight'];
  valueWeight?: React.CSSProperties['fontWeight'];
  gap?: number;
  align?: 'center' | 'left' | 'right';
  /** Hard offset shadow on the label. `true` uses the house value. */
  shadow?: boolean | string;
  delay?: number;
  span?: number;
  style?: React.CSSProperties;
  children?: React.ReactNode;
};

/**
 * A big coloured label with a smaller value beneath it, centred as one unit.
 *
 * Both halves ride one clip so the pair reads as a single object — animating
 * them separately makes the value look like a caption that arrived late, which
 * is exactly wrong under a column-aligned header bar.
 */
const LabelValue: React.FC<LabelValueProps> = ({
  x,
  y,
  label,
  value,
  labelColor = PERI,
  valueColor = WHITE,
  labelSize = 84,
  valueSize = 36,
  labelFamily = SANS,
  valueFamily = MONO,
  labelWeight = 700,
  valueWeight = 500,
  gap = 16,
  align = 'center',
  shadow = false,
  delay = 0,
  span = 26,
  style,
  children,
}) => {
  const frame = useCurrentFrame();
  const signal = isSignalPalette();
  const reveal = signal ? signalSpring(frame, delay, 20) : anim(frame, delay, 0, 1, {span});
  const valueReveal = signal ? signalSpring(frame, delay + 8, 20) : anim(frame, delay + 10, 0, 1, {span});
  const shift = align === 'center' ? '-50%' : align === 'right' ? '-100%' : '0%';

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: `translateX(${shift})`,
        textAlign: align,
        whiteSpace: 'nowrap',
        ...style,
        ...(signal ? {boxShadow: 'none', filter: 'none', textShadow: 'none', outline: 'none'} : {}),
      }}
    >
      {label !== undefined && label !== null ? (
        <div
          style={{
            fontFamily: labelFamily,
            fontSize: labelSize,
            fontWeight: labelWeight,
            color: labelColor,
            lineHeight: 1,
            textShadow: signal
              ? undefined
              : shadow
                ? typeof shadow === 'string'
                  ? shadow
                  : '0 3px 0 rgba(0,0,0,.22)'
                : undefined,
            clipPath: signal ? undefined : `inset(${(1 - reveal) * 100}% 0 0 0)`,
            transform: signal ? `translate3d(0, ${(1 - reveal) * 20}px, 0)` : undefined,
            opacity: signal ? reveal : 1,
          }}
        >
          {label}
        </div>
      ) : null}
      {value !== undefined && value !== null ? (
        <div
          style={{
            marginTop: gap,
            fontFamily: valueFamily,
            fontSize: valueSize,
            fontWeight: valueWeight,
            color: valueColor,
            lineHeight: 1.1,
            clipPath: signal ? undefined : `inset(0 ${(1 - valueReveal) * 100}% 0 0)`,
            transform: signal ? `translate3d(0, ${(1 - valueReveal) * 16}px, 0)` : undefined,
            opacity: signal ? valueReveal : 1,
          }}
        >
          {value}
        </div>
      ) : null}
      {children}
    </div>
  );
};

/* ────────────────────────── Underline ──────────────────────── */

type UnderlineProps = {
  /** Left end of the mark. Use `align="center"` to anchor on the middle. */
  x: number;
  y: number;
  length?: number;
  color?: string;
  width?: number;
  /** 'single' | 'double' reads as an underline; 'strike' is drawn through. */
  variant?: 'single' | 'double' | 'strike';
  /** How much the stroke bows away from level, in pixels. */
  arc?: number;
  wobble?: number;
  seed?: string | number;
  align?: 'left' | 'center';
  delay?: number;
  span?: number;
};

/**
 * A hand-drawn underline or strike that draws itself under a phrase.
 *
 * Same deterministic wobble as the brace, and a slight arc, because a truly
 * straight line under handwritten-feeling type reads as a border rather than a
 * mark. A double underline offsets and re-seeds its second pass so the two
 * strokes are not identical — a mirrored pair immediately looks printed.
 */
const Underline: React.FC<UnderlineProps> = ({
  x,
  y,
  length = 340,
  color = MINT,
  width = 5,
  variant = 'single',
  arc = 5,
  wobble = 2,
  seed,
  align = 'left',
  delay = 0,
  span,
}) => {
  const left = align === 'center' ? x - length / 2 : x;
  const key = seed === undefined ? `${length}:${variant}` : String(seed);

  const stroke = (offset: number, pass: number) => {
    const raw: Pt[] = [
      [left, y + offset],
      [left + length * 0.24, y + offset + arc * 0.9],
      [left + length * 0.55, y + offset + arc * 1.1],
      [left + length * 0.72, y + offset + arc * 0.55],
      [left + length * 0.86, y + offset + arc * 0.1],
      [left + length * 0.96, y + offset - arc * 0.25],
      [left + length, y + offset - arc * 0.15],
    ];
    return cubicPath(wobbled(raw, hashSeed(`${key}:${pass}`), wobble));
  };

  return (
    <Layer>
      <DrawnPath
        d={stroke(0, 0)}
        delay={delay}
        span={span}
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
      />
      {variant === 'double' && (
        <DrawnPath
          d={stroke(width * 2.4, 1)}
          delay={delay + 8}
          span={span}
          stroke={color}
          strokeWidth={width * 0.8}
          strokeLinecap="round"
        />
      )}
    </Layer>
  );
};

/* ──────────────────────── Mono run ─────────────────────────── */

type MonoPart = string | {text: string; color?: string; dim?: boolean; weight?: number};

type MonoLineProps = {
  x: number;
  y: number;
  /** A string, or a run of segments that each carry their own colour. */
  parts?: MonoPart[] | MonoPart;
  color?: string;
  /** Colour used for `dim: true` segments — emphasis by contrast, not alpha. */
  dimColor?: string;
  fontSize?: number;
  family?: string;
  weight?: React.CSSProperties['fontWeight'];
  tracking?: number | string;
  align?: 'center' | 'left' | 'right';
  delay?: number;
  span?: number;
  style?: React.CSSProperties;
};

/**
 * A single line of machine text whose segments can differ in colour, for the
 * "most of this is greyed out, this bit is not" mark.
 *
 * The dimming is a separate ink colour, never a lowered opacity: opacity would
 * both break the no-fade rule and let the ground bleed through the glyphs.
 * One clip sweeps the whole line so the segments stay on the same baseline.
 */
const MonoLine: React.FC<MonoLineProps> = ({
  x,
  y,
  parts,
  color = WHITE,
  dimColor = '#6b7090',
  fontSize = 30,
  family = MONO,
  weight = 500,
  tracking = '0.02em',
  align = 'center',
  delay = 0,
  span = 28,
  style,
}) => {
  const frame = useCurrentFrame();
  const run = asArray(parts);
  const reveal = anim(frame, delay, 0, 1, {span});
  const shift = align === 'center' ? '-50%' : align === 'right' ? '-100%' : '0%';

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: `translateX(${shift})`,
        fontFamily: family,
        fontSize,
        fontWeight: weight,
        letterSpacing: tracking,
        lineHeight: 1.2,
        color,
        whiteSpace: 'pre',
        clipPath: `inset(0 ${(1 - reveal) * 100}% 0 0)`,
        ...style,
      }}
    >
      {run.map((part, index) => {
        const isText = typeof part === 'string';
        const text = isText ? part : part.text;
        const ink = isText ? color : (part.color ?? (part.dim ? dimColor : color));
        return (
          <span
            key={`${index}-${text}`}
            style={{color: ink, fontWeight: isText ? undefined : part.weight}}
          >
            {text}
          </span>
        );
      })}
    </div>
  );
};

export const sketch = {
  Brace,
  BraceGroup,
  NumberBadge,
  NumberList,
  SegmentBar,
  segmentCenters,
  LabelValue,
  Underline,
  MonoLine,
};

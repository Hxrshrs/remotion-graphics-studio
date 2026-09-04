/**
 * The rail vocabulary.
 *
 * The reference here is a product-launch style explainer: a strip of square
 * cards laid out off the edges of the frame, the whole strip sliding sideways
 * so that whichever card is being talked about sits dead centre and is the
 * biggest thing on screen. Under it, the numbers shots — a huge counting
 * figure with a faint rising graph behind it — and between them, a single
 * centred line of narration.
 *
 * Two ideas run through all of it:
 *
 * 1. The rail's scale is a pure function of an item's distance from the frame
 *    centre, never a per-item timer. That is what makes the move read as a
 *    camera: an item eases up as it arrives and back down as it leaves,
 *    entirely because the strip moved, so adding a seventh card cannot
 *    desynchronise the sixth.
 * 2. Nothing fades. The rail arrives by translation and scale, the sparkline
 *    by drawing itself, the number by counting, the line by word masks, the
 *    card by clip. `opacity` is only ever a *static* value here — the
 *    sparkline's faintness — and is never animated.
 *
 * Geometry note, same as `diagram.tsx` and `sketch.tsx`: SVG layers below are
 * sized in CSS pixels with no viewBox, so one user unit is one pixel.
 */
import React from 'react';
import {useCurrentFrame} from 'remotion';
import {anim, signalSpring, stagger as staggerBy} from './motion';
import {kit} from './kit';
import {Words} from './type';
import {DynamicStudioIcon} from './dynamicIcon';
import {font} from './fonts';
import {isDevPalette, isSignalPalette, paletteNow} from './palette';

/* ─────────────────────────── Palette ─────────────────────────── */

/**
 * House colours read live from the active palette, so the rail register
 * recolors when a cut switches style. Defaults evaluate at render, which is
 * what makes this safe: a paper cut and a dark cut never share a frame.
 */
const P = () => paletteNow();

/** Paper/dark rail shadow; the signal register disables it at render time. */
const HARD_SHADOW = () => `0 5px 0 ${P().border}`;

const SANS = font('Fredoka');
const BRICOLAGE = font('Bricolage Grotesque');
const DEV_SANS = font('Fredoka');
const themeSans = () => (isDevPalette(P()) ? DEV_SANS : isSignalPalette(P()) ? BRICOLAGE : SANS);

/* ────────────────────── Defensive coercion ───────────────────── */

/**
 * Models pass a scalar where a list is documented often enough that it has to
 * be survivable: `stops={90}` instead of `stops={[90]}`, `values={5}` instead
 * of `values={[5]}`. A component that throws blanks the whole cut, so coerce
 * rather than trust the declared type. This has cost four renders already.
 */
const asArray = <T,>(value: T | T[] | undefined | null): T[] => {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
};

/**
 * Same reasoning for numbers: `size="260"` and `to="1200"` arrive as strings
 * from generated scene code, and `"260" / 2` is NaN-adjacent arithmetic that
 * silently produces an invisible element rather than a loud error.
 */
const num = (value: unknown, fallback: number): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
};

/** Text can arrive as a number, or as null from an unfilled template slot. */
const asText = (value: unknown): string =>
  value === undefined || value === null || typeof value === 'object' ? '' : String(value);

/** FNV-1a, so a seeded curve is the same curve on every render pass. */
const hashSeed = (input: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

/** Clamped linear map. Local so the rail never reaches for Remotion's. */
const track = (value: number, from: number, to: number, out0: number, out1: number): number => {
  const spread = to - from;
  if (spread === 0) return out1;
  const t = Math.min(1, Math.max(0, (value - from) / spread));
  return out0 + t * (out1 - out0);
};

/* ──────────────────────────── Rail ───────────────────────────── */

export type RailItemInfo<T = unknown> = {
  index: number;
  /** The entry from `items` at this index, or `undefined` for plain children. */
  item: T;
  /** True for the item currently nearest the focus point. */
  focused: boolean;
  /** The distance-driven scale already applied to this item's wrapper. */
  scale: number;
  /** Pixels from the focus point along the rail's axis. */
  distance: number;
  /** Absolute frame position of this item's centre, in parent coordinates. */
  screenX: number;
  screenY: number;
  /** A staggered delay, so a render prop can time contents without counting. */
  delay: number;
};

type RailProps<T = unknown> = {
  /** The focus point: where the focused item is parked. Frame centre by default. */
  x?: number;
  y?: number;
  items?: T[] | T;
  /** Centre-to-centre pitch along the rail, and the default falloff distance. */
  spacing?: number;
  /** Scale at the focus point. The reference sits around 1.2. */
  focusScale?: number;
  /** Scale for anything `falloff` px or further from the focus point. */
  baseScale?: number;
  /** Distance over which focus scale decays to base scale. Defaults to spacing. */
  falloff?: number;
  /**
   * Frames at which the rail advances one item. `stops={[90, 210]}` steps
   * 0 -> 1 at frame 90 and 1 -> 2 at frame 210. Overrides hold/startDelay.
   */
  stops?: number[] | number;
  /** Schedule shorthand: first advance at `startDelay`, then every `hold`. */
  startDelay?: number;
  hold?: number;
  /** Frames one advance takes. The reference rides 70. */
  stepSpan?: number;
  /** Added to every stop, so a rail inside a later shot shifts as one unit. */
  delay?: number;
  /** Frames between consecutive items' `info.delay`. */
  step?: number;
  /** Pin the focus to one index and ignore the schedule entirely. */
  focus?: number;
  /** Run the rail top-to-bottom instead. Same maths on the other axis. */
  vertical?: boolean;
  style?: React.CSSProperties;
  /**
   * A render prop given each item's live geometry — the normal way to use
   * this. Plain children are accepted as a fallback and are laid out one per
   * slot, in order.
   */
  children?: React.ReactNode | ((info: RailItemInfo<T>) => React.ReactNode);
};

/**
 * The signature camera move: a strip of items where the whole strip slides so
 * the focused item lands on the frame centre, and every item is scaled by how
 * far it sits from that centre.
 *
 * Each advance is one `anim` over `stepSpan` and the offsets are *summed*
 * rather than switched between, so two advances that overlap in time blend
 * into one continuous slide instead of snapping. That summation is also why
 * the schedule is expressed as frames-of-advance rather than as a focus index
 * per frame: a focus index would have to be interpolated back into a position
 * somewhere, and doing it in the other direction keeps the whole thing a pure
 * function of `frame` with no state.
 *
 * Items are positioned individually at their computed screen coordinate rather
 * than inside one translated container. It is the same arithmetic, but it lets
 * each item own its transform (scale about its own centre) without a nested
 * wrapper fighting the parent's translate.
 */
const Rail = <T,>({
  x,
  y,
  items,
  spacing: spacingProp,
  focusScale: focusScaleProp,
  baseScale: baseScaleProp,
  falloff: falloffProp,
  stops,
  startDelay: startDelayProp,
  hold: holdProp,
  stepSpan: stepSpanProp,
  delay: delayProp,
  step,
  focus,
  vertical = false,
  style,
  children,
}: RailProps<T>): React.ReactElement => {
  const frame = useCurrentFrame();
  const list = asArray(items);
  const renderProp = typeof children === 'function' ? children : undefined;
  const childList = renderProp ? [] : React.Children.toArray(children as React.ReactNode);
  // With no items the rail still has to lay something out, so plain children
  // define the count. One of the two is always present in practice.
  const count = Math.max(list.length, renderProp ? 0 : childList.length);

  const spacing = Math.max(1, num(spacingProp, 440));
  const focusScale = num(focusScaleProp, 1.2);
  const baseScale = num(baseScaleProp, 1);
  const falloff = Math.max(1, num(falloffProp, spacing));
  const stepSpan = Math.max(1, num(stepSpanProp, 70));
  const delay = num(delayProp, 0);
  const centerX = num(x, 960);
  const centerY = num(y, 540);

  // The schedule. An explicit `stops` list wins; otherwise a first advance at
  // `startDelay` and one every `hold` frames after it, for count-1 advances.
  const explicit = asArray(stops)
    .map((stop) => num(stop, Number.NaN))
    .filter((stop) => Number.isFinite(stop));
  const startDelay = num(startDelayProp, 60);
  const hold = Math.max(1, num(holdProp, 120));
  const schedule =
    explicit.length > 0
      ? explicit
      : Array.from({length: Math.max(0, count - 1)}, (_, index) => startDelay + index * hold);

  // Summed advances, in pixels. `focus` short-circuits the whole schedule for
  // a scene that wants to park the rail on one item with no move at all.
  const offset =
    focus === undefined
      ? schedule.reduce((total, stop) => total + anim(frame, stop + delay, 0, spacing, {span: stepSpan}), 0)
      : num(focus, 0) * spacing;

  // Whichever item is closest to the focus point right now. Derived from the
  // offset rather than from elapsed time, so a pinned focus and a mid-slide
  // rail answer the question the same way.
  const focusIndex = Math.round(offset / spacing);

  return (
    <div style={{position: 'absolute', left: 0, top: 0, width: 0, height: 0, ...style}}>
      {Array.from({length: count}, (_, index) => {
        const along = index * spacing - offset;
        const distance = Math.abs(along);
        const scale = track(distance, 0, falloff, focusScale, baseScale);
        const screenX = vertical ? centerX : centerX + along;
        const screenY = vertical ? centerY + along : centerY;
        const info: RailItemInfo<T> = {
          index,
          item: list[index] as T,
          focused: index === focusIndex,
          scale,
          distance,
          screenX,
          screenY,
          delay: delay + staggerBy(index, step),
        };
        return (
          <div
            key={index}
            style={{
              position: 'absolute',
              left: screenX,
              top: screenY,
              // Scale about the item's own centre, after centring on the
              // computed point — the order matters: scaling first would move
              // the centre it was supposed to be pinned to.
              transform: `translate(-50%, -50%) scale(${scale})`,
              transformOrigin: '50% 50%',
              willChange: 'transform',
            }}
          >
            {renderProp ? renderProp(info) : childList[index]}
          </div>
        );
      })}
    </div>
  );
};

/* ───────────────────────── Sparkline ─────────────────────────── */

/**
 * A plausible rising series with no randomness in it.
 *
 * `Math.random()` would crawl: Remotion re-renders the same frame during a
 * seek, so a re-rolled curve shimmers behind a stationary number. Three seeded
 * sine components over a linear trend give something that reads as real data
 * and is identical on every pass.
 */
const syntheticSeries = (points: number, seed: string | number): number[] => {
  const n = Math.max(2, Math.round(points));
  const h = hashSeed(String(seed));
  const phase = (h % 1000) / 1000 * Math.PI * 2;
  const phase2 = ((h >>> 10) % 1000) / 1000 * Math.PI * 2;
  const wobble = 0.06 + (((h >>> 20) % 100) / 100) * 0.07;
  return Array.from({length: n}, (_, index) => {
    const t = index / (n - 1);
    // Slightly convex trend, so the line looks like growth rather than a ramp.
    const trend = t * 0.78 + t * t * 0.22;
    const swell = Math.sin(phase + t * 5.1) * wobble;
    const chatter = Math.sin(phase2 + t * 12.7) * wobble * 0.45;
    return trend + swell + chatter;
  });
};

/**
 * Catmull-Rom through every sample, converted to the cubic segments SVG can
 * actually draw. A polyline of straight segments reads as a *chart*; the whole
 * point of this component is that it reads as a backdrop, and the difference
 * between the two is entirely in whether the corners are rounded.
 */
const smoothPath = (pts: Array<[number, number]>): string => {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? pts[i + 1];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d;
};

export type SparklineProps = {
  /** Centre of the graph, so it can be dropped behind a centred number. */
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  /** The series. A scalar is treated as a one-point series and coerced away. */
  values?: number[] | number | string;
  /** Sample count for the generated curve when `values` is absent. */
  points?: number;
  /** Identity of the generated curve. Two graphs with different seeds differ. */
  seed?: string | number;
  color?: string;
  lineWidth?: number;
  /** Area under the line. `true` uses `color`; a string sets it explicitly. */
  fill?: boolean | string;
  /**
   * A STATIC faintness, not an animated one. This sits behind a display
   * number and must never compete with it; 0.18 is about the ceiling before
   * the eye starts reading the graph first.
   */
  opacity?: number;
  delay?: number;
  span?: number;
  style?: React.CSSProperties;
};

/**
 * A faint line-and-area chart used as a backdrop.
 *
 * The line draws itself by `pathLength={1}`, which is the only stroke reveal
 * that is correct during a seek — it needs no measurement pass. The area is
 * revealed by an SVG rect clip travelling at the same rate, so the fill never
 * runs ahead of the stroke that is supposed to be capping it.
 */
const Sparkline: React.FC<SparklineProps> = ({
  x,
  y,
  width: widthProp,
  height: heightProp,
  values,
  points: pointsProp,
  seed = 'spark',
  color = P().accent,
  lineWidth: lineWidthProp,
  fill = true,
  opacity: opacityProp,
  delay: delayProp,
  span: spanProp,
  style,
}) => {
  const frame = useCurrentFrame();
  const width = Math.max(2, num(widthProp, 900));
  const height = Math.max(2, num(heightProp, 260));
  const lineWidth = Math.max(0.5, num(lineWidthProp, 4));
  const opacity = num(opacityProp, 0.18);
  const delay = num(delayProp, 0);
  const span = Math.max(1, num(spanProp, 90));
  const points = Math.max(2, Math.round(num(pointsProp, 26)));

  const supplied = asArray(values)
    .map((value) => num(value, Number.NaN))
    .filter((value) => Number.isFinite(value));
  // A single supplied value cannot describe a line, so fall back to the
  // generated curve rather than drawing a degenerate one-point path.
  const series = supplied.length >= 2 ? supplied : syntheticSeries(points, seed);

  const min = Math.min(...series);
  const max = Math.max(...series);
  // A flat series has no range to normalise against; park it mid-height.
  const spread = max - min || 1;
  const pad = lineWidth * 1.5;
  const plotted = series.map((value, index): [number, number] => [
    (index / (series.length - 1)) * width,
    height - pad - ((value - min) / spread) * (height - pad * 2),
  ]);

  const line = smoothPath(plotted);
  const area = `${line} L ${width.toFixed(2)} ${height.toFixed(2)} L 0 ${height.toFixed(2)} Z`;
  const progress = anim(frame, delay, 0, 1, {span});
  // Deterministic id: two sparklines in one scene must not share a clip, and
  // a ref or a counter would break under Remotion's repeated render passes.
  const clipId = `spark-${hashSeed(`${seed}:${width}:${height}:${series.length}:${series[0]}`)}`;
  const fillColor = typeof fill === 'string' ? fill : color;

  return (
    <svg
      width={width}
      height={height}
      style={{
        position: 'absolute',
        left: num(x, 960) - width / 2,
        top: num(y, 540) - height / 2,
        overflow: 'visible',
        // Static — the whole element is simply faint. Never animated.
        opacity,
        ...style,
      }}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={0} y={0} width={Math.max(0, width * progress)} height={height} />
        </clipPath>
      </defs>
      {fill === false ? null : (
        <path d={area} fill={fillColor} fillOpacity={0.28} clipPath={`url(#${clipId})`} />
      )}
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={lineWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - progress}
      />
    </svg>
  );
};

/* ───────────────────────── Big number ────────────────────────── */

type BigNumberProps = {
  /** Centre of the whole block — number plus label. */
  x?: number;
  y?: number;
  to?: number | string;
  from?: number | string;
  delay?: number;
  span?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  /** Thousands separators. Defaults to on above 9,999, like ui.Count. */
  group?: boolean;
  fontSize?: number;
  family?: string;
  weight?: React.CSSProperties['fontWeight'];
  color?: string;
  /** A quiet caption under the figure. Wipes in slightly behind the count. */
  label?: string;
  labelColor?: string;
  labelSize?: number;
  labelWeight?: React.CSSProperties['fontWeight'];
  /** Hard offset shadow on the figure. `true` uses the house value. */
  shadow?: boolean | string;
  /** Sparkline props. Sized and centred to the number when left unset. */
  sparkline?: SparklineProps | boolean;
  style?: React.CSSProperties;
};

/**
 * The counting-number shot: a huge figure with an optional faint graph behind
 * it and a caption beneath.
 *
 * The counter itself is `ui.Count` — reused rather than reimplemented, so the
 * tabular-figure handling and the grouping rules stay in one place. What this
 * component owns is the *composition*: centring the block on a point, sizing
 * the backdrop graph off the type rather than off a measurement, and keeping
 * the caption on the same anchor so a longer label cannot shift the figure.
 */
const BigNumber: React.FC<BigNumberProps> = ({
  x,
  y,
  to,
  from,
  delay: delayProp,
  span: spanProp,
  decimals,
  prefix = '',
  suffix = '',
  group,
  fontSize: fontSizeProp,
  family = themeSans(),
  weight = 700,
  color = P().ink,
  label,
  labelColor = P().ink,
  labelSize: labelSizeProp,
  labelWeight = 600,
  shadow = false,
  sparkline,
  style,
}) => {
  const frame = useCurrentFrame();
  const signal = isSignalPalette(P());
  const useShadow = Boolean(shadow) && !signal;
  const fontSize = Math.max(22, num(fontSizeProp, 180));
  const delay = num(delayProp, 0);
  const span = Math.max(1, num(spanProp, 90));
  const labelSize = Math.max(22, num(labelSizeProp, Math.round(fontSize * 0.22)));
  const caption = asText(label);
  const labelReveal = anim(frame, delay + 14, 0, 1, {span: 26});

  // Enough box for a five-or-six digit figure at this size without measuring
  // anything. It only has to bound the backdrop, and the backdrop is faint.
  const sparkProps = sparkline === true || sparkline === undefined ? {} : sparkline || {};
  const showSpark = sparkline !== undefined && sparkline !== false;

  return (
    <>
      {showSpark ? (
        <Sparkline
          delay={delay}
          span={span}
          {...(sparkProps as SparklineProps)}
          x={num((sparkProps as SparklineProps).x, num(x, 960))}
          y={num((sparkProps as SparklineProps).y, num(y, 540))}
          // Deliberately wider and taller than the figure it sits behind. A
          // backdrop sized to the type reads as a box drawn around the number;
          // running past it on both sides is what makes it read as ground.
          width={num((sparkProps as SparklineProps).width, fontSize * 7.4)}
          height={num((sparkProps as SparklineProps).height, fontSize * 2.2)}
        />
      ) : null}
      <div
        style={{
          position: 'absolute',
          left: num(x, 960),
          top: num(y, 540),
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          whiteSpace: 'nowrap',
          fontFamily: family,
          ...style,
          ...(signal ? {textShadow: 'none', outline: 'none', boxShadow: 'none', filter: 'none'} : {}),
        }}
      >
        <div
          style={{
            fontSize,
            fontWeight: weight,
            color,
            lineHeight: 1,
            letterSpacing: '-0.02em',
            // Tabular here as well as inside Count, so the prefix and suffix
            // sit on the same rhythm as the digits they bracket.
            fontVariantNumeric: 'tabular-nums',
            textShadow: useShadow
              ? typeof shadow === 'string'
                ? shadow
                : HARD_SHADOW()
              : undefined,
          }}
        >
          <kit.Count
            to={num(to, 100)}
            from={num(from, 0)}
            delay={delay}
            span={span}
            decimals={Math.max(0, Math.round(num(decimals, 0)))}
            prefix={asText(prefix)}
            suffix={asText(suffix)}
            group={group}
          />
        </div>
        {caption ? (
          <div
            style={{
              marginTop: Math.round(fontSize * 0.12),
              fontSize: labelSize,
              fontWeight: labelWeight,
              color: labelColor,
              lineHeight: 1.2,
              letterSpacing: '0.04em',
              clipPath: signal ? undefined : `inset(0 ${(1 - labelReveal) * 100}% 0 0)`,
              transform: signal ? `translate3d(0, ${(1 - labelReveal) * 16}px, 0)` : undefined,
              opacity: signal ? labelReveal : 1,
              visibility: labelReveal <= 0 ? 'hidden' : 'visible',
            }}
          >
            {caption}
          </div>
        ) : null}
      </div>
    </>
  );
};

/* ────────────────────────── One line ─────────────────────────── */

type OneLineProps = {
  /** Centre of the line. Frame centre by default — this is a centred shot. */
  x?: number;
  y?: number;
  text?: string;
  /**
   * The phrase inside `text` to paint in `accent`. `*asterisks*` in the text
   * do the same thing inline, for a scene that wants two highlighted runs.
   */
  highlight?: string;
  accent?: string;
  fontSize?: number;
  family?: string;
  weight?: React.CSSProperties['fontWeight'];
  color?: string;
  /** Column the line wraps against. Safe area inside the frame by default. */
  maxWidth?: number;
  lineHeight?: number;
  delay?: number;
  /** Frames between one word and the next. Keep tight: 2-4. */
  step?: number;
  span?: number;
  align?: 'left' | 'center' | 'right';
  style?: React.CSSProperties;
};

/**
 * One line of narration, centred in the frame, entering word by word.
 *
 * The reveal is `Words` — reused, not reimplemented, so this line wipes in
 * through exactly the same masks as every other text block in the studio. What is
 * added here is the framing: a fixed centre anchor and a real `maxWidth`.
 * That width is not optional in practice. An absolutely positioned block with
 * only a `left` has no width to wrap against, so the browser sizes it to the
 * unwrapped sentence and a long line simply runs off both edges of the frame.
 *
 * Accented runs go through `Words`' `runs` prop rather than a second `Words`
 * beside the first: two independent blocks each wrap correctly on their own
 * but know nothing about each other's width, so together they overflow again.
 */
const OneLine: React.FC<OneLineProps> = ({
  x,
  y,
  text,
  highlight,
  accent = P().accent,
  fontSize: fontSizeProp,
  family = themeSans(),
  weight = 600,
  color = P().ink,
  maxWidth: maxWidthProp,
  lineHeight = 1.16,
  delay: delayProp,
  step: stepProp,
  span: spanProp,
  align = 'center',
  style,
}) => {
  const copy = asText(text);
  const fontSize = Math.max(22, num(fontSizeProp, 72));
  const maxWidth = Math.max(120, num(maxWidthProp, 1440));
  const delay = num(delayProp, 0);
  const step = Math.max(0, num(stepProp, 3));
  const span = Math.max(1, num(spanProp, 16));

  // Split into plain and accented runs. Asterisk pairs first; failing those,
  // a single `highlight` substring. Everything else is one plain run.
  const accentStyle: React.CSSProperties = {color: accent};
  const runs: Array<{text: string; style?: React.CSSProperties}> = [];
  if (/\*[^*]+\*/.test(copy)) {
    copy.split(/(\*[^*]+\*)/).forEach((piece) => {
      if (!piece) return;
      const marked = piece.startsWith('*') && piece.endsWith('*') && piece.length > 2;
      runs.push(marked ? {text: `${piece.slice(1, -1)} `, style: accentStyle} : {text: piece});
    });
  } else if (highlight && copy.includes(highlight)) {
    const at = copy.indexOf(highlight);
    if (at > 0) runs.push({text: copy.slice(0, at)});
    runs.push({text: `${highlight} `, style: accentStyle});
    const rest = copy.slice(at + highlight.length);
    if (rest.trim()) runs.push({text: rest});
  } else {
    runs.push({text: copy});
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: num(x, 960),
        top: num(y, 540),
        width: maxWidth,
        transform: 'translate(-50%, -50%)',
        ...style,
      }}
    >
      <Words
        runs={runs}
        delay={delay}
        step={step}
        span={span}
        maxWidth={maxWidth}
        align={align}
        lineHeight={lineHeight}
        style={{
          fontFamily: family,
          fontSize,
          fontWeight: weight,
          color,
          letterSpacing: '-0.01em',
          textAlign: align,
          // The block is exactly maxWidth wide, so centring the flex rows
          // inside it is what actually centres the sentence.
          marginLeft: 'auto',
          marginRight: 'auto',
        }}
      />
    </div>
  );
};

/* ───────────────────────── Stat card ─────────────────────────── */

type StatCardProps = {
  /** Centre of the card. The pill hangs below it without moving the anchor. */
  x?: number;
  y?: number;
  size?: number;
  /** Width and height separately when the card is not square. */
  w?: number;
  h?: number;
  fill?: string;
  /** Border colour, or a full shorthand like `3px solid #24211d`. */
  border?: string;
  borderWidth?: number;
  radius?: number;
  /** Any Lucide name. Ignored when children are supplied. */
  icon?: string;
  iconColor?: string;
  iconSize?: number;
  strokeWidth?: number;
  label?: string;
  labelColor?: string;
  labelFill?: string;
  labelBorder?: string;
  labelSize?: number;
  /** Gap between the card's bottom edge and the pill. */
  labelGap?: number;
  delay?: number;
  span?: number;
  shadow?: boolean | string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
};

/**
 * The rail's item: an orange square with a dark border and an icon in it,
 * plus a separate rounded pill label beneath.
 *
 * The pill is a sibling of the card rather than a child, because the card is
 * a hard-clipped box — a label inside it would be cut by the card's own
 * reveal and by its border radius. Hanging it below on the same centre anchor
 * keeps a two-word label and a six-word label centred on the same point.
 *
 * Arrival is a clip from the bottom plus a small scale up: two mechanical
 * reveals, no fade. `visibility` gates it before the delay, since a
 * zero-height clip can still paint a hairline of border.
 */
const StatCard: React.FC<StatCardProps> = ({
  x,
  y,
  size: sizeProp,
  w,
  h,
  fill = P().card,
  border,
  borderWidth: borderWidthProp,
  radius: radiusProp,
  icon,
  iconColor = P().ink,
  iconSize,
  strokeWidth: strokeWidthProp,
  label,
  labelColor = P().ink,
  labelFill = P().card,
  labelBorder,
  labelSize: labelSizeProp,
  labelGap: labelGapProp,
  delay: delayProp,
  span: spanProp,
  shadow = true,
  style,
  children,
}) => {
  const frame = useCurrentFrame();
  const signal = isSignalPalette(P());
  const size = Math.max(24, num(sizeProp, 260));
  const width = Math.max(24, num(w, size));
  const height = Math.max(24, num(h, size));
  const borderWidth = signal ? 0 : Math.max(0, num(borderWidthProp, 3));
  const radius = num(radiusProp, signal ? 28 : 20);
  const delay = num(delayProp, 0);
  const span = Math.max(1, num(spanProp, 26));
  const glyph = Math.max(8, num(iconSize, Math.round(Math.min(width, height) * 0.42)));
  const labelSize = Math.max(22, num(labelSizeProp, 26));
  const labelGap = num(labelGapProp, 22);
  const caption = asText(label);

  const arrive = signal ? signalSpring(frame, delay, span) : anim(frame, delay, 0, 1, {span});
  const labelArrive = signal ? signalSpring(frame, delay + 6, span) : anim(frame, delay + 8, 0, 1, {span});
  const grow = signal ? 1 : 0.92 + arrive * 0.08;
  // A shorthand border wins over the colour-plus-width pair, so a caller can
  // pass either `border="#24211d"` or `border="3px solid #24211d"`.
  const borderRule = signal
    ? 'none'
    : border && /\s/.test(border)
      ? border
      : `${borderWidth}px solid ${border ?? P().border}`;

  return (
    <div
      style={{
        position: 'absolute',
        left: num(x, 0),
        top: num(y, 0),
        transform: `translate(-50%, -50%) scale(${grow})`,
        transformOrigin: '50% 50%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        visibility: arrive <= 0 ? 'hidden' : 'visible',
        ...style,
        ...(signal ? {boxShadow: 'none', filter: 'none', textShadow: 'none', outline: 'none'} : {}),
      }}
    >
      <div
        style={{
          width,
          height,
          borderRadius: radius,
          background: fill,
          border: borderRule,
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: signal ? 'visible' : 'hidden',
          boxShadow: signal
            ? undefined
            : shadow
              ? typeof shadow === 'string'
                ? shadow
                : HARD_SHADOW()
              : undefined,
          clipPath: signal ? undefined : `inset(${(1 - arrive) * 100}% 0% 0% 0% round ${radius}px)`,
          transform: signal ? `translate3d(0, ${(1 - arrive) * 32}px, 0)` : undefined,
          opacity: signal ? arrive : 1,
        }}
      >
        {children ??
          (icon ? (
            <DynamicStudioIcon
              name={icon}
              width={glyph}
              height={glyph}
              color={iconColor}
              strokeWidth={num(strokeWidthProp, 2)}
              fill="none"
              aria-hidden
            />
          ) : null)}
      </div>
      {caption ? (
        <div
          style={{
            marginTop: labelGap,
            padding: `${Math.max(12, Math.round(labelSize * 0.55))}px ${Math.max(20, Math.round(labelSize * 1.1))}px`,
            borderRadius: 999,
            background: labelFill,
            border: signal
              ? 'none'
              : `${borderWidth}px solid ${labelBorder ?? border ?? P().border}`,
            boxSizing: 'border-box',
            color: labelColor,
            fontFamily: themeSans(),
            fontSize: labelSize,
            fontWeight: 600,
            lineHeight: 1.25,
            whiteSpace: 'nowrap',
            clipPath: signal ? undefined : `inset(${(1 - labelArrive) * 100}% 0% 0% 0% round 999px)`,
            transform: signal ? `translate3d(0, ${(1 - labelArrive) * 18}px, 0)` : undefined,
            opacity: signal ? labelArrive : 1,
            visibility: labelArrive <= 0 ? 'hidden' : 'visible',
            overflow: signal ? 'visible' : 'hidden',
          }}
        >
          {caption}
        </div>
      ) : null}
    </div>
  );
};

export const rail = {
  Rail,
  Sparkline,
  BigNumber,
  OneLine,
  StatCard,
  /** The reference ground, for a scene that wants the rail's own backdrop. */
  railPalette: {ground: P().ground, card: P().card, border: P().border, accent: P().accent, text: P().ink},
};

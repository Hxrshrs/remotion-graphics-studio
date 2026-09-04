/**
 * Screen-explainer vocabulary.
 *
 * The reference for the editor page is a tech explainer whose graphics are
 * almost all the same handful of marks: a mock app window or form card
 * floating on a dark stage, a data table whose rows are redacted except the
 * one being talked about, a caption line under the artifact whose colour
 * carries the state, a red-cross/green-tick verdict pair, a big shouted word
 * over the top, and a tiny corner disclaimer.
 *
 * They are components rather than prompt instructions for the same reason as
 * `diagram.tsx`: hand-written versions fail in identical ways every time — a
 * table whose columns do not line up, a caption that drifts off-centre from
 * the artifact it labels, a window chrome that reads as a rectangle.
 *
 * Everything here arrives by clip, scale, or mask. Nothing fades: opacity is
 * never animated, per the studio's standing rule.
 */
import React from 'react';
import {useCurrentFrame} from 'remotion';
import {anim, signalSpring, stagger} from './motion';
import {font} from './fonts';
import {isSignalPalette, paletteNow} from './palette';

/** Light surface values, shared so a window and a card read as one system. */
const PAPER = '#ffffff';
const PAPER_INK = '#1c1c22';
const PAPER_MUTED = '#6b6b78';
const PAPER_LINE = '#dcdce4';
/**
 * Hard and barely there in paper/dark cuts: a tight offset with no blur radius,
 * at low alpha. The signal register disables this depth effect.
 * A wide soft shadow reads as a glow behind the card and muddies the stage;
 * what separates a light surface from a dark ground here is the edge, not a
 * cloud under it.
 */
const SHADOW = '0 3px 0 rgba(0,0,0,.22)';

const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace, 'Apple Color Emoji'";
const SANS = font('Fredoka');

type Reveal = 'up' | 'down' | 'left' | 'right' | 'scale' | 'none';

/**
 * Models pass a scalar where a list is documented often enough that it has to
 * be survivable: `highlight={2}` instead of `highlight={[2]}` took the whole
 * canvas down with "highlight.includes is not a function". A helper that
 * throws kills every shot in the cut, so coerce instead of trusting the type.
 */
const asArray = <T,>(value: T | T[] | undefined | null): T[] => {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
};

/** Clip-path insets for a wipe from each edge, at progress 0. */
const clipFor = (reveal: Reveal, progress: number) => {
  const hidden = `${(1 - progress) * 100}%`;
  switch (reveal) {
    case 'up':
      return `inset(${hidden} 0 0 0)`;
    case 'down':
      return `inset(0 0 ${hidden} 0)`;
    case 'left':
      return `inset(0 ${hidden} 0 0)`;
    case 'right':
      return `inset(0 0 0 ${hidden})`;
    default:
      return 'none';
  }
};

/**
 * The shared entrance. A bounded box that wipes or scales in, never fades.
 * Every component below sits on one of these so entrances stay consistent.
 */
const Arrive: React.FC<{
  delay: number;
  reveal: Reveal;
  span?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({delay, reveal, span = 26, style, children}) => {
  const frame = useCurrentFrame();
  const signal = isSignalPalette(paletteNow());

  if (signal) {
    const progress = signalSpring(frame, delay, span);
    return (
      <div
        style={{
          ...style,
          transform: `${style?.transform ?? ''} translate3d(0, ${(1 - progress) * 32}px, 0)`.trim(),
          opacity: progress,
          visibility: progress <= 0 ? 'hidden' : 'visible',
          overflow: style?.overflow,
        }}
      >
        {children}
      </div>
    );
  }

  const progress = anim(frame, delay, 0, 1, {span});
  const scale = reveal === 'scale' ? 0.94 + progress * 0.06 : 1;
  return (
    <div
      style={{
        ...style,
        transform: `${style?.transform ?? ''} scale(${scale})`.trim(),
        clipPath: clipFor(reveal, progress),
        overflow: reveal === 'none' || reveal === 'scale' ? style?.overflow : 'hidden',
        // A scale entrance still needs the box hidden before its delay.
        visibility: progress <= 0 ? 'hidden' : 'visible',
      }}
    >
      {children}
    </div>
  );
};

/* ─────────────────────────── Window ─────────────────────────── */

type WindowProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  /** Text in the address bar. Omit for an app window with no URL. */
  url?: string;
  /** Colour of the URL text, so a dead link can go red mid-shot. */
  urlColor?: string;
  /** Title-bar label for an app window. */
  title?: string;
  /** Dark app chrome instead of the light default. */
  dark?: boolean;
  radius?: number;
  delay?: number;
  reveal?: Reveal;
  style?: React.CSSProperties;
  children?: React.ReactNode;
};

/**
 * A mock browser window. The chrome is the point: three dots, an address bar,
 * and a content area the scene fills. Children are laid out in the content
 * area's own coordinates, which starts below the chrome.
 */
const Window: React.FC<WindowProps> = ({
  x = 0,
  y = 0,
  width = 900,
  height = 560,
  url,
  urlColor,
  title,
  dark = false,
  radius = 12,
  delay = 0,
  reveal = 'scale',
  style,
  children,
}) => {
  const chromeHeight = url || title ? 58 : 0;
  const signal = isSignalPalette(paletteNow());
  const ground = dark ? '#26262f' : PAPER;
  const chromeGround = dark ? '#1e1e26' : '#f2f2f6';
  const ink = dark ? '#e7e7ee' : PAPER_INK;
  const line = signal ? 'transparent' : dark ? '#3a3a46' : PAPER_LINE;

  return (
    <Arrive
      delay={delay}
      reveal={reveal}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        height,
        borderRadius: radius,
        overflow: 'hidden',
        background: ground,
        boxShadow: signal ? undefined : SHADOW,
        ...style,
        ...(signal ? {border: 'none', outline: 'none', boxShadow: 'none', filter: 'none'} : {}),
      }}
    >
      {chromeHeight > 0 && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '100%',
            height: chromeHeight,
            background: chromeGround,
            borderBottom: `1px solid ${line}`,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0 14px',
            boxSizing: 'border-box',
          }}
        >
          <div style={{display: 'flex', gap: 6}}>
            {['#ff5f57', '#febc2e', '#28c840'].map((dot) => (
              <div key={dot} style={{width: 10, height: 10, borderRadius: 5, background: dot}} />
            ))}
          </div>
          {url ? (
            <div
              style={{
                flex: 1,
                height: 32,
                borderRadius: 16,
                background: dark ? '#15151b' : '#ffffff',
                border: `1px solid ${line}`,
                display: 'flex',
                alignItems: 'center',
                padding: '0 10px',
                fontFamily: MONO,
                fontSize: 18,
                color: urlColor ?? (dark ? '#9a9aa8' : PAPER_MUTED),
                whiteSpace: 'nowrap',
                overflow: 'hidden',
              }}
            >
              {url}
            </div>
          ) : (
            <div style={{flex: 1, fontFamily: SANS, fontSize: 18, color: ink, fontWeight: 600}}>
              {title}
            </div>
          )}
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: chromeHeight,
          width: '100%',
          height: height - chromeHeight,
        }}
      >
        {children}
      </div>
    </Arrive>
  );
};

/* ─────────────────────────── Panel ─────────────────────────── */

type PanelProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  dark?: boolean;
  radius?: number;
  padding?: number;
  delay?: number;
  reveal?: Reveal;
  style?: React.CSSProperties;
  children?: React.ReactNode;
};

/** A plain floating card — a form, a dialog, an error box. */
const Panel: React.FC<PanelProps> = ({
  x = 0,
  y = 0,
  width = 520,
  height,
  dark = false,
  radius = 10,
  padding = 24,
  delay = 0,
  reveal = 'scale',
  style,
  children,
}) => {
  const signal = isSignalPalette(paletteNow());
  return (
    <Arrive
      delay={delay}
      reveal={reveal}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        ...(height ? {height} : null),
        boxSizing: 'border-box',
        padding,
        borderRadius: radius,
        background: dark ? '#1b1b22' : PAPER,
        color: dark ? '#e7e7ee' : PAPER_INK,
        border: signal ? 'none' : `1px solid ${dark ? '#33333f' : PAPER_LINE}`,
        boxShadow: signal ? undefined : SHADOW,
        fontFamily: SANS,
        ...style,
        ...(signal ? {border: 'none', outline: 'none', boxShadow: 'none', filter: 'none'} : {}),
      }}
    >
      {children}
    </Arrive>
  );
};

/* ─────────────────────────── DataTable ─────────────────────────── */

export type TableCell = string | {redacted: number};

type DataTableProps = {
  x?: number;
  y?: number;
  width?: number;
  /** Column headers. Their count defines the column count. */
  columns: string[];
  /**
   * Rows of cells. A cell of `{redacted: n}` renders n question marks, the
   * reference's way of showing a field exists without showing its value.
   */
  rows: TableCell[][];
  /** Relative column widths. Defaults to equal columns. */
  widths?: number[];
  /** Row indexes drawn at full strength while the rest stay muted. A bare
   *  number is accepted for the common case of one highlighted row. */
  highlight?: number[] | number;
  /** Fill painted behind a highlighted row. */
  highlightColor?: string;
  rowHeight?: number;
  fontSize?: number;
  dark?: boolean;
  delay?: number;
  /** Frames between one row arriving and the next. */
  step?: number;
  style?: React.CSSProperties;
};

/**
 * The redacted table. Rows wipe in from the left one after another; a
 * highlighted row is the one the narration is about.
 */
const DataTable: React.FC<DataTableProps> = ({
  x = 0,
  y = 0,
  width = 900,
  columns,
  rows,
  widths,
  highlight,
  highlightColor,
  rowHeight = 44,
  fontSize = 22,
  dark = false,
  delay = 0,
  step = 4,
  style,
}) => {
  const frame = useCurrentFrame();
  const signal = isSignalPalette(paletteNow());
  const ink = dark ? '#e7e7ee' : PAPER_INK;
  const muted = dark ? '#6f6f80' : '#9a9aa8';
  const line = signal ? 'transparent' : dark ? '#3a3a46' : PAPER_LINE;
  const columnList = asArray(columns);
  const rowList = asArray(rows).map((row) => asArray(row));
  const highlighted = asArray(highlight);
  const widthList = asArray(widths);
  const ratios =
    widthList.length === columnList.length ? widthList : columnList.map(() => 1);
  const total = ratios.reduce((sum, ratio) => sum + ratio, 0);

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        border: signal ? 'none' : `1px solid ${line}`,
        borderRadius: 4,
        overflow: 'hidden',
        fontFamily: MONO,
        fontSize,
        background: dark ? 'transparent' : PAPER,
        ...style,
        ...(signal ? {border: 'none', outline: 'none', boxShadow: 'none', filter: 'none'} : {}),
      }}
    >
      <div style={{display: 'flex', height: rowHeight + 8, alignItems: 'center'}}>
        {columnList.map((column, index) => (
          <div
            key={column}
            style={{
              width: `${(ratios[index] / total) * 100}%`,
              padding: '0 10px',
              boxSizing: 'border-box',
              color: ink,
              fontWeight: 600,
              borderRight: index < columnList.length - 1 ? `1px solid ${line}` : undefined,
              textAlign: index === 0 ? 'left' : 'center',
            }}
          >
            {column}
          </div>
        ))}
      </div>
      <div style={{height: 1, background: line}} />
      {rowList.map((row, rowIndex) => {
        const isHighlighted = highlighted.includes(rowIndex);
        const progress = anim(frame, delay + stagger(rowIndex, step), 0, 1, {span: 18});
        return (
          <div
            // Row content is stable for the life of a scene, so its text is a
            // sound key and reordering is not a case that arises.
            key={`row-${rowIndex}`}
            style={{
              display: 'flex',
              height: rowHeight,
              alignItems: 'center',
              clipPath: signal ? undefined : `inset(0 ${(1 - progress) * 100}% 0 0)`,
              transform: signal ? `translate3d(0, ${(1 - progress) * 16}px, 0)` : undefined,
              opacity: signal ? progress : 1,
              visibility: progress <= 0 ? 'hidden' : 'visible',
              background: isHighlighted ? highlightColor ?? 'transparent' : 'transparent',
            }}
          >
            {row.map((cell, cellIndex) => (
              <div
                key={`cell-${rowIndex}-${cellIndex}`}
                style={{
                  width: `${(ratios[cellIndex] / total) * 100}%`,
                  padding: '0 10px',
                  boxSizing: 'border-box',
                  color: isHighlighted ? ink : muted,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  // A value longer than its column reads as a rendering fault
                  // when it is hard-cut mid-glyph; ellipsis reads as elision.
                  textOverflow: 'ellipsis',
                  textAlign: cellIndex === 0 ? 'left' : 'center',
                }}
              >
                {typeof cell === 'string' ? cell : '?'.repeat(Math.max(1, cell.redacted))}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
};

/* ─────────────────────────── Caption ─────────────────────────── */

type CaptionProps = {
  text: string;
  /** Centre of the caption, so it stays centred under the artifact it labels. */
  centerX: number;
  y: number;
  color?: string;
  fontSize?: number;
  /** Monospace by default, the way a URL reads in the reference. */
  mono?: boolean;
  delay?: number;
  style?: React.CSSProperties;
};

/**
 * The line under an artifact. Anchored by its centre rather than its left
 * edge, because a caption's job is to stay aligned with the thing above it
 * whatever its own length turns out to be.
 */
const Caption: React.FC<CaptionProps> = ({
  text,
  centerX,
  y,
  color = '#8ab4ff',
  fontSize = 30,
  mono = true,
  delay = 0,
  style,
}) => {
  const frame = useCurrentFrame();
  const signal = isSignalPalette(paletteNow());
  const progress = signal ? signalSpring(frame, delay, 20) : anim(frame, delay, 0, 1, {span: 20});
  return (
    <div
      style={{
        position: 'absolute',
        left: centerX,
        top: y,
        transform: signal ? `translateX(-50%) translate3d(0, ${(1 - progress) * 16}px, 0)` : 'translateX(-50%)',
        clipPath: signal ? undefined : `inset(0 0 ${(1 - progress) * 100}% 0)`,
        opacity: signal ? progress : 1,
        fontFamily: mono ? MONO : SANS,
        fontSize,
        fontWeight: 600,
        color,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {text}
    </div>
  );
};

/* ─────────────────────────── Verdict ─────────────────────────── */

type VerdictProps = {
  /** Centre of the mark. */
  x: number;
  y: number;
  kind: 'pass' | 'fail';
  size?: number;
  delay?: number;
  color?: string;
};

/** The red cross / green tick that sits over a compared item. */
const Verdict: React.FC<VerdictProps> = ({x, y, kind, size = 56, delay = 0, color}) => {
  const frame = useCurrentFrame();
  const progress = anim(frame, delay, 0, 1, {span: 16});
  const stroke = color ?? (kind === 'pass' ? '#3ddc72' : '#ff4d5e');
  const d =
    kind === 'pass'
      ? `M ${size * 0.16} ${size * 0.54} L ${size * 0.4} ${size * 0.78} L ${size * 0.86} ${size * 0.22}`
      : `M ${size * 0.2} ${size * 0.2} L ${size * 0.8} ${size * 0.8} M ${size * 0.8} ${size * 0.2} L ${size * 0.2} ${size * 0.8}`;
  return (
    <svg
      width={size}
      height={size}
      style={{
        position: 'absolute',
        left: x - size / 2,
        top: y - size / 2,
        overflow: 'visible',
      }}
    >
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={size * 0.13}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - progress}
      />
    </svg>
  );
};

/* ─────────────────────────── Shout ─────────────────────────── */

type ShoutProps = {
  text: string;
  centerX: number;
  centerY: number;
  color?: string;
  fontSize?: number;
  delay?: number;
  /** Letter-spacing for the all-caps look the reference uses. */
  tracking?: string;
  style?: React.CSSProperties;
};

/**
 * The big shouted word laid over whatever is already on screen — "$$$",
 * "WRONG FORMAT". It punches in on the shared curve rather than fading.
 */
const Shout: React.FC<ShoutProps> = ({
  text,
  centerX,
  centerY,
  color = '#ff4d5e',
  fontSize = 96,
  delay = 0,
  tracking = '0.02em',
  style,
}) => {
  const frame = useCurrentFrame();
  const progress = anim(frame, delay, 0, 1, {span: 14});
  const signal = isSignalPalette(paletteNow());
  return (
    <div
      style={{
        position: 'absolute',
        left: centerX,
        top: centerY,
        transform: `translate(-50%, -50%) scale(${0.86 + progress * 0.14})`,
        visibility: progress <= 0 ? 'hidden' : 'visible',
        fontFamily: SANS,
        fontWeight: 800,
        fontSize,
        letterSpacing: tracking,
        color,
        whiteSpace: 'nowrap',
        textShadow: signal ? undefined : '0 2px 0 rgba(0,0,0,.28)',
        ...style,
        ...(signal ? {textShadow: 'none', filter: 'none'} : {}),
      }}
    >
      {text}
    </div>
  );
};

/* ─────────────────────────── Disclaimer ─────────────────────────── */

type DisclaimerProps = {
  text: string;
  x?: number;
  y?: number;
  width?: number;
  color?: string;
  fontSize?: number;
  delay?: number;
};

/** The tiny grey fine print in the corner. Deliberately near-illegible. */
const Disclaimer: React.FC<DisclaimerProps> = ({
  text,
  x = 40,
  y = 32,
  width = 460,
  color = '#6a6a78',
  fontSize = 17,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const signal = isSignalPalette(paletteNow());
  const progress = signal ? signalSpring(frame, delay, 16) : anim(frame, delay, 0, 1, {span: 16});
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        clipPath: signal ? undefined : `inset(0 ${(1 - progress) * 100}% 0 0)`,
        transform: signal ? `translate3d(0, ${(1 - progress) * 16}px, 0)` : undefined,
        opacity: signal ? progress : 1,
        visibility: progress <= 0 ? 'hidden' : 'visible',
        fontFamily: SANS,
        fontSize,
        lineHeight: 1.35,
        color,
      }}
    >
      {text}
    </div>
  );
};

/* ─────────────────────────── Countdown ─────────────────────────── */

type CountdownProps = {
  x: number;
  y: number;
  /** Label before the number, e.g. "Skip Ad". */
  label: string;
  from: number;
  /** Frames each step holds. */
  holdFrames?: number;
  delay?: number;
  background?: string;
  color?: string;
  /** Shown once the count reaches zero. */
  doneLabel?: string;
};

/** A live UI counter, like the reference's "Skip Ad (5)" chip. */
const Countdown: React.FC<CountdownProps> = ({
  x,
  y,
  label,
  from,
  holdFrames = 60,
  delay = 0,
  background = '#f5a524',
  color = '#20202c',
  doneLabel,
}) => {
  const frame = useCurrentFrame();
  const signal = isSignalPalette(paletteNow());
  const elapsed = Math.max(0, frame - delay);
  const remaining = Math.max(0, from - Math.floor(elapsed / Math.max(1, holdFrames)));
  const progress = signal ? signalSpring(frame, delay, 14) : anim(frame, delay, 0, 1, {span: 14});
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        padding: '8px 16px',
        borderRadius: 6,
        background,
        color,
        fontFamily: SANS,
        fontWeight: 700,
        fontSize: 24,
        whiteSpace: 'nowrap',
        clipPath: signal ? undefined : `inset(0 ${(1 - progress) * 100}% 0 0)`,
        transform: signal ? `translate3d(0, ${(1 - progress) * 16}px, 0)` : undefined,
        opacity: signal ? progress : 1,
      }}
    >
      {remaining > 0 ? `${label} (${remaining})` : (doneLabel ?? `${label} →`)}
    </div>
  );
};

export const stage = {
  Window,
  Panel,
  DataTable,
  Caption,
  Verdict,
  Shout,
  Disclaimer,
  Countdown,
};

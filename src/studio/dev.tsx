import React from 'react';
import {Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {kineticProgress} from './type';
import {Logo} from './logo';
import {DynamicStudioIcon} from './dynamicIcon';
import {font} from './fonts';
import {paletteNow} from './palette';
import {SETTLE_FRAMES} from './motion';
import {shotDuration} from './shotContext';

// The dev display face. Fredoka's rounded geometry is what makes an
// all-uppercase dev frame read as a title rather than as shouting.
const DEV_SANS = () => font('Fredoka');

type DevTypingProps = {
  text: string;
  delay?: number;
  charsPerSecond?: number;
  cursor?: boolean;
  prompt?: string;
  suffix?: string;
  width?: number | string;
  /** Draw the terminal's one outline. Disable only when a parent owns it. */
  framed?: boolean;
  style?: React.CSSProperties;
};

/** Reference-style terminal line. Its frame exists immediately; only the copy types. */
const DevTyping: React.FC<DevTypingProps> = ({
  text,
  delay = 0,
  charsPerSecond = 28,
  cursor = true,
  prompt = '›',
  suffix,
  width = '100%',
  framed = true,
  style,
}) => {
  const frame = useCurrentFrame();
  const duration = shotDuration();
  const requested = Math.max(8, Math.min(60, charsPerSecond));
  // Typing is the one reveal whose length is set by its content rather than a
  // span, so a long command can still be running when the shot cuts. If the
  // requested rate would finish inside the settled tail, type faster instead.
  const framesAvailable = Math.max(1, duration - SETTLE_FRAMES - delay);
  const needed = (String(text).length / requested) * 60;
  const speed =
    needed > framesAvailable
      ? Math.min(90, (String(text).length / framesAvailable) * 60)
      : requested;
  const count = Math.max(0, Math.floor(((frame - delay) / 60) * speed));
  const typed = String(text).slice(0, count);
  // Keep a stable-width cursor slot and blink it on the composition timeline.
  // It stays attached after the last character, like a real terminal cursor,
  // without using CSS animation or changing the line's layout while blinking.
  const cursorOn =
    cursor &&
    frame >= delay &&
    Math.floor((frame - delay) / 15) % 2 === 0;
  return (
    <div
      style={{
        minHeight: 210,
        display: 'flex',
        alignItems: 'center',
        gap: 42,
        padding: '42px 72px',
        border: framed ? `3px solid ${paletteNow().border}` : 'none',
        borderRadius: framed ? 14 : 0,
        color: paletteNow().ink,
        fontFamily: DEV_SANS(),
        textTransform: 'none',
        fontSize: 68,
        fontWeight: 500,
        lineHeight: 1.15,
        letterSpacing: '-0.025em',
        ...style,
        // Hard layout guardrails: generated scenes often place this inside a
        // 1440px dev stage. A wider prop now shrinks to the parent instead of
        // painting past it, and style overrides cannot re-enable clipping.
        width: style?.width ?? width,
        maxWidth: '100%',
        minWidth: 0,
        boxSizing: 'border-box',
        overflow: 'visible',
        whiteSpace: 'normal',
        overflowWrap: 'anywhere',
      }}
    >
      <span style={{flex: '0 0 auto', color: paletteNow().ink, fontSize: '1.22em'}}>❯</span>
      <span
        style={{
          minWidth: 0,
          flex: '1 1 auto',
          maxWidth: '100%',
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
          wordBreak: 'break-word',
        }}
      >
        {prompt && prompt !== '›' ? <span style={{color: paletteNow().muted}}>{prompt} </span> : null}
        {typed}
        {cursor ? (
          <span
            aria-hidden
            style={{
              display: 'inline-block',
              minWidth: '0.58em',
              color: paletteNow().muted,
              visibility: cursorOn ? 'visible' : 'hidden',
              verticalAlign: '-0.08em',
            }}
          >
            |
          </span>
        ) : null}
      </span>
      {suffix ? (
        <span
          style={{
            marginLeft: 'auto',
            color: paletteNow().muted,
            flex: '0 0 auto',
            whiteSpace: 'nowrap',
          }}
        >
          {suffix}
        </span>
      ) : null}
    </div>
  );
};

type DevWordRiseProps = {
  text: string;
  delay?: number;
  step?: number;
  span?: number;
  distance?: number;
  style?: React.CSSProperties;
};

/** Large Fredoka copy sliding upward word-by-word with no opacity animation. */
const DevWordRise: React.FC<DevWordRiseProps> = ({
  text,
  delay = 0,
  step = 5,
  span = 18,
  distance = 30,
  style,
}) => {
  const frame = useCurrentFrame();
  const words = String(text).split(/\s+/).filter(Boolean);
  return (
    <div
      style={{
        maxWidth: 1560,
        width: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        color: paletteNow().ink,
        fontFamily: DEV_SANS(),
        fontSize: 116,
        fontWeight: 600,
        lineHeight: 1.08,
        letterSpacing: '-0.045em',
        textAlign: 'center',
        overflow: 'visible',
        ...style,
      }}
    >
      {words.map((word, index) => {
        const start = delay + index * step;
        // The same decelerating curve the kinetic line uses — sharper at the
        // head than the house curve, because a short word rise has no frames
        // to spare on easing in.
        const progress = kineticProgress(frame, start, Math.max(8, Math.min(30, span)));
        return (
          <span
            key={`${index}-${word}`}
            style={{
              display: 'inline-block',
              maxWidth: '100%',
              overflow: 'hidden',
              overflowWrap: 'anywhere',
              padding: '0.12em 0.13em 0.16em',
              lineHeight: 1.05,
            }}
          >
            <span
              style={{
                display: 'inline-block',
                visibility: progress <= 0 ? 'hidden' : 'visible',
                transform: `translate3d(0, ${(1 - progress) * distance}px, 0)`,
                willChange: 'transform',
              }}
            >
              {word}
            </span>
          </span>
        );
      })}
    </div>
  );
};

type DevScaleProps = {
  delay?: number;
  /** Frames used by the fast pop; kept short so the settle reads immediately. */
  span?: number;
  from?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
};

const DEV_POP_SPRING = {
  damping: 13,
  mass: 0.5,
  stiffness: 190,
};

/** One-shot fast pop entrance. Rotation belongs to DevIcon, never this wrapper. */
const DevScale: React.FC<DevScaleProps> = ({
  delay = 0,
  span = 18,
  from = 0.78,
  style,
  children,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const duration = Math.max(8, Math.min(42, Math.round(span)));
  const startScale = Math.max(0.68, Math.min(0.94, from));
  const progress =
    frame < delay
      ? 0
      : spring({
          frame: frame - delay,
          fps,
          durationInFrames: duration,
          config: DEV_POP_SPRING,
        });
  const scale = startScale + (1 - startScale) * progress;
  return (
    <div
      style={{
        ...style,
        transform: `${style?.transform ?? ''} scale(${scale})`.trim(),
        transformOrigin: style?.transformOrigin ?? '50% 50%',
        visibility: frame < delay ? 'hidden' : 'visible',
        willChange: 'transform',
      }}
    >
      {children}
    </div>
  );
};

type DevIconProps = {
  name: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
  filled?: boolean;
  delay?: number;
  /** Frames used by the icon's small spring rotation. */
  span?: number;
  rotateFrom?: number;
  style?: React.CSSProperties;
};

/**
 * An icon-only motion companion for DevScale. A card or surface stays flat;
 * only the glyph gets the small spring turn when the scene calls for one.
 */
const DevIcon: React.FC<DevIconProps> = ({
  name,
  // A 64px glyph is a web-page icon: on a 1920x1080 canvas played back small
  // it reads as a bullet point rather than the subject of the shot.
  size = 140,
  color = paletteNow().ink,
  strokeWidth = 2,
  filled = false,
  delay = 0,
  span = 16,
  rotateFrom = -8,
  style,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const duration = Math.max(8, Math.min(36, Math.round(span)));
  const progress =
    frame < delay
      ? 0
      : spring({
          frame: frame - delay,
          fps,
          durationInFrames: duration,
          config: DEV_POP_SPRING,
        });
  const rotation = Math.max(-12, Math.min(12, rotateFrom)) * (1 - progress);
  return (
    <DynamicStudioIcon
      name={name}
      width={size}
      height={size}
      color={color}
      strokeWidth={strokeWidth}
      fill={filled ? color : 'none'}
      aria-hidden
      style={{
        ...style,
        transform: `${style?.transform ?? ''} rotate(${rotation}deg)`.trim(),
        transformOrigin: style?.transformOrigin ?? '50% 50%',
        visibility: frame < delay ? 'hidden' : 'visible',
        willChange: 'transform',
      }}
    />
  );
};

type DevGroupMorphState = {
  x?: number;
  y?: number;
  scale?: number;
  opacity?: number;
};

type DevGroupMorphProps = {
  from?: DevGroupMorphState;
  to?: DevGroupMorphState;
  delay?: number;
  span?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
};

/**
 * Shared-element handoff for consecutive shots in one generated group.
 * Frame zero is exactly `from`, so it can match the previous shot's settled
 * frame; the retained element then moves while stale/new support crossfades.
 */
const DevGroupMorph: React.FC<DevGroupMorphProps> = ({
  from = {},
  to = {},
  delay = 0,
  span = 26,
  style,
  children,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const duration = Math.max(12, Math.min(48, Math.round(span)));
  const rawProgress =
    frame < delay
      ? 0
      : spring({
          frame: frame - delay,
          fps,
          durationInFrames: duration,
          config: {damping: 16, mass: 0.65, stiffness: 150},
        });
  const progress = Math.max(0, Math.min(1, rawProgress));
  const mix = (a: number | undefined, b: number | undefined, fallback: number) =>
    (a ?? fallback) + ((b ?? fallback) - (a ?? fallback)) * progress;
  const x = mix(from.x, to.x, 0);
  const y = mix(from.y, to.y, 0);
  const scale = mix(from.scale, to.scale, 1);
  const opacity = mix(from.opacity, to.opacity, 1);

  return (
    <div
      style={{
        ...style,
        opacity,
        transform: `${style?.transform ?? ''} translate3d(${x}px, ${y}px, 0) scale(${scale})`.trim(),
        transformOrigin: style?.transformOrigin ?? '50% 50%',
        visibility: opacity <= 0.001 ? 'hidden' : 'visible',
        willChange: 'transform, opacity',
      }}
    >
      {children}
    </div>
  );
};

/**
 * The dev register's teaching layouts.
 *
 * A clip in this cut runs three to five seconds. That is room for one idea,
 * one relationship, and roughly half a dozen words — so these are the only
 * shapes offered, and each carries exactly one thought. The earlier attempt
 * at this handed the model a single generic tile, which produced app icons in
 * boxes; before that, an open canvas, which produced slides. A small
 * vocabulary of purposeful layouts is what actually keeps the register.
 *
 * Every layout takes the same item shape, so there is one thing to learn:
 * a subject (an icon, an emoji, a brand logo, or a short value) and at most a
 * word or two naming it.
 */
/** On-screen stroke width for the register's outline drawings, in px. */
const DEV_HAIRLINE = 2.5;

export type DevItem = {
  /** A real Lucide icon name. */
  icon?: string;
  /** One native emoji, which keeps its own colour. */
  emoji?: string;
  /** A verified brand slug for ui.Logo. */
  logo?: string;
  /** A short exact value: a number, a character, a word. */
  value?: string;
  /** One or two words naming this item. Never a sentence. */
  label?: string;
};

type DevItemViewProps = {
  item: DevItem;
  size: number;
  /** Dims an item that is present for contrast rather than as the point. */
  dim?: boolean;
  /**
   * Height every subject in a row shares, so a label hangs below its own
   * subject instead of lifting it: a centred row aligns on the whole item,
   * and one labelled item among unlabelled ones then sits visibly higher.
   */
  boxHeight?: number;
  labelSize?: number;
  progress?: number;
};

/**
 * One item, drawn at whatever scale its layout asks for. The subject is
 * whichever field is set, in this order — an explicit drawing wins over a
 * brand mark, which wins over an emoji, which wins over an icon.
 */
const DevItemView: React.FC<DevItemViewProps> = ({
  item,
  size,
  dim = false,
  boxHeight,
  labelSize,
  progress = 1,
}) => {
  const ink = dim ? paletteNow().green : paletteNow().ink;
  const subject = item.logo ? (
    <span
      style={{
        display: 'inline-flex',
        // Brand marks come through as white silhouettes here. This register is
        // monochrome — a full-colour logo breaks it, and a dark mark such as
        // GitHub's simply vanishes on a black ground. brightness(0) flattens
        // the artwork to black while keeping its alpha, and invert(1) turns
        // that into white, so any mark reads the same whatever it shipped as.
        filter: 'brightness(0) invert(1)',
      }}
    >
      <Logo
        name={item.logo}
        size={size}
        variant="default"
        fallback={
          <span style={{fontSize: size * 0.34, fontWeight: 500, color: ink}}>
            {item.label ?? item.value ?? item.logo}
          </span>
        }
      />
    </span>
  ) : item.emoji ? (
    <span style={{fontSize: size * 0.86, lineHeight: 1}}>{item.emoji}</span>
  ) : item.icon ? (
    <DynamicStudioIcon
      name={item.icon}
      width={size}
      height={size}
      color={ink}
      // Lucide strokes scale with the glyph, so a normal weight becomes a
      // marker line at this size. Solve for a constant on-screen hairline.
      strokeWidth={(DEV_HAIRLINE * 24) / size}
      fill="none"
      aria-hidden
    />
  ) : item.value ? (
    <span
      style={{
        fontSize: size * 0.72,
        fontWeight: 500,
        letterSpacing: '-0.04em',
        lineHeight: 1,
        color: ink,
        whiteSpace: 'nowrap',
      }}
    >
      {item.value}
    </span>
  ) : null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: Math.round(size * 0.2),
        transform: `scale(${0.88 + 0.12 * progress})`,
        visibility: progress <= 0 ? 'hidden' : 'visible',
        // Colour alone cannot dim an emoji or a logo, so the whole item fades.
        // Static, not animated: this is hierarchy, not an entrance.
        opacity: dim ? 0.45 : 1,
        willChange: 'transform',
      }}
    >
      <div
        style={{
          height: boxHeight ?? size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {subject}
      </div>
      {item.label ? (
        <span
          style={{
            fontSize: labelSize ?? Math.round(size * 0.24),
            fontWeight: 400,
            letterSpacing: '-0.02em',
            color: dim ? paletteNow().green : paletteNow().muted,
            whiteSpace: 'nowrap',
          }}
        >
          {item.label}
        </span>
      ) : null}
    </div>
  );
};

/** A stagger that keeps a whole layout inside a three-second clip. */
const DEV_ITEM_STEP = 7;

const itemProgress = (frame: number, delay: number, index: number, fps: number) =>
  frame < delay + index * DEV_ITEM_STEP
    ? 0
    : spring({
        frame: frame - delay - index * DEV_ITEM_STEP,
        fps,
        durationInFrames: 18,
        config: DEV_POP_SPRING,
      });

/** The connective line between two items in a flow. It grows from its start. */
const DevArrow: React.FC<{length: number; progress: number; centerOn: number}> = ({
  length,
  progress,
  centerOn,
}) => {
  const stroke = paletteNow().green;
  return (
    <svg
      width={length}
      height={24}
      viewBox={`0 0 ${length} 24`}
      style={{
        flex: '0 0 auto',
        // The row aligns on the subject band, so the arrow is pushed down to
        // the middle of that band rather than floating at the row's top.
        marginTop: Math.round(centerOn / 2) - 12,
        transform: `scaleX(${Math.max(0.001, progress)})`,
        transformOrigin: 'left center',
      }}
      aria-hidden
    >
      <line x1={0} y1={12} x2={length - 10} y2={12} stroke={stroke} strokeWidth={DEV_HAIRLINE} />
      <polyline
        points={`${length - 20},5 ${length - 8},12 ${length - 20},19`}
        fill="none"
        stroke={stroke}
        strokeWidth={DEV_HAIRLINE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

/** Shared frame: everything in this register is centred with air around it. */
const DevStage: React.FC<{gap?: number; style?: React.CSSProperties; children: React.ReactNode}> = ({
  gap = 56,
  style,
  children,
}) => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap,
      fontFamily: DEV_SANS(),
      textAlign: 'center',
      ...style,
    }}
  >
    {children}
  </div>
);

/** The white line that names what the shot is about. One line, never two. */
const DevCaption: React.FC<{text: string; delay: number; size?: number}> = ({
  text,
  delay,
  size = 64,
}) => (
  <DevWordRise
    text={text}
    delay={delay}
    style={{
      fontSize: size,
      fontWeight: 500,
      letterSpacing: '-0.03em',
      color: paletteNow().ink,
      maxWidth: 1280,
    }}
  />
);

type DevSubjectProps = {
  item?: DevItem;
  /** An explicit drawing, when the subject is not an icon, emoji, or value. */
  children?: React.ReactNode;
  /** The one white line naming the subject. */
  caption?: string;
  size?: number;
  delay?: number;
  style?: React.CSSProperties;
};

/** One thing, named. The default beat: a viewer reads it in well under a second. */
const DevSubject: React.FC<DevSubjectProps> = ({
  item,
  children,
  caption,
  size = 260,
  delay = 0,
  style,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const progress = itemProgress(frame, delay, 0, fps);
  return (
    <DevStage gap={72} style={style}>
      {children ? (
        <div
          style={{
            transform: `scale(${0.88 + 0.12 * progress})`,
            visibility: progress <= 0 ? 'hidden' : 'visible',
          }}
        >
          {children}
        </div>
      ) : item ? (
        <DevItemView item={item} size={size} progress={progress} />
      ) : null}
      {caption ? <DevCaption text={caption} delay={delay + 6} /> : null}
    </DevStage>
  );
};

type DevFlowProps = {
  /** Two or three items. More than three cannot be read in a short clip. */
  items: DevItem[];
  caption?: string;
  size?: number;
  delay?: number;
  style?: React.CSSProperties;
};

/**
 * What becomes what. The explainer atom: two or three subjects on one line,
 * joined by arrows that grow as each stage arrives.
 */
const DevFlow: React.FC<DevFlowProps> = ({items, caption, size = 150, delay = 0, style}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const stages = items.slice(0, 3);
  const arrow = Math.round(size * 0.78);
  return (
    <DevStage gap={72} style={style}>
      <div style={{display: 'flex', alignItems: 'flex-start', gap: Math.round(size * 0.34)}}>
        {stages.map((item, index) => (
          <React.Fragment key={`${index}-${item.label ?? item.value ?? item.icon ?? ''}`}>
            {index > 0 ? (
              <DevArrow
                length={arrow}
                centerOn={size}
                progress={itemProgress(frame, delay, index - 0.5, fps)}
              />
            ) : null}
            <DevItemView
              item={item}
              size={size}
              progress={itemProgress(frame, delay, index, fps)}
            />
          </React.Fragment>
        ))}
      </div>
      {caption ? (
        <DevCaption text={caption} delay={delay + stages.length * DEV_ITEM_STEP} size={56} />
      ) : null}
    </DevStage>
  );
};

type DevSetProps = {
  /** Three to six items. The one at `active` is the point of the shot. */
  items: DevItem[];
  active?: number;
  caption?: string;
  size?: number;
  delay?: number;
  style?: React.CSSProperties;
};

/**
 * Several things, one of which is the point. The rest are there to give the
 * chosen one meaning, so they stay dim and unlabelled — a label on every item
 * is six things to read, which is more than a short clip affords.
 */
const DevSet: React.FC<DevSetProps> = ({
  items,
  active = 0,
  caption,
  size = 120,
  delay = 0,
  style,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const shown = items.slice(0, 6);
  const activeIndex = Math.max(0, Math.min(shown.length - 1, Math.round(active)));
  return (
    <DevStage gap={72} style={style}>
      <div style={{display: 'flex', alignItems: 'flex-start', gap: Math.round(size * 0.62)}}>
        {shown.map((item, index) => {
          const isActive = index === activeIndex;
          return (
            <DevItemView
              key={`${index}-${item.label ?? item.value ?? item.icon ?? ''}`}
              // Only the chosen item keeps its label: the others are contrast.
              item={isActive ? item : {...item, label: undefined}}
              size={isActive ? Math.round(size * 1.3) : size}
              boxHeight={Math.round(size * 1.3)}
              dim={!isActive}
              progress={itemProgress(frame, delay, isActive ? 0 : 1, fps)}
            />
          );
        })}
      </div>
      {caption ? <DevCaption text={caption} delay={delay + 10} size={56} /> : null}
    </DevStage>
  );
};

type DevStatProps = {
  /** The figure itself, exactly as supplied. */
  value: string;
  /** What it counts. Two or three words. */
  label?: string;
  /** An optional quiet icon above the figure. */
  icon?: string;
  emoji?: string;
  delay?: number;
  style?: React.CSSProperties;
};

/** One number that is the whole point of the clip. */
const DevStat: React.FC<DevStatProps> = ({value, label, icon, emoji, delay = 0, style}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const progress = itemProgress(frame, delay, 0, fps);
  return (
    <DevStage gap={40} style={style}>
      {icon || emoji ? (
        <DevItemView item={{icon, emoji}} size={96} dim progress={progress} />
      ) : null}
      <span
        style={{
          fontSize: 210,
          fontWeight: 500,
          letterSpacing: '-0.05em',
          lineHeight: 1,
          color: paletteNow().ink,
          transform: `scale(${0.9 + 0.1 * progress})`,
          visibility: progress <= 0 ? 'hidden' : 'visible',
          willChange: 'transform',
        }}
      >
        {value}
      </span>
      {label ? (
        <DevWordRise
          text={label}
          delay={delay + 8}
          style={{
            fontSize: 46,
            fontWeight: 400,
            letterSpacing: '-0.02em',
            color: paletteNow().muted,
          }}
        />
      ) : null}
    </DevStage>
  );
};

/* ─────────────────────────── evidence layouts ─────────────────────────── */
/**
 * The register the references actually show: a dense, real artifact with one
 * lit point in it.
 *
 * The mistake in the two earlier attempts was treating "one idea per clip" as
 * "one object on screen". A viewer does not read the nine redacted rows of a
 * table or the six lines of hex — they see a field of grey with one white line
 * in it, and that reads in well under a second while carrying the weight of
 * real evidence. The density is the context that makes the lit item mean
 * something; it is not information the viewer is asked to process.
 *
 * So: show the actual thing — the URL, the ID, the bytes, the checks — in
 * mono, keep almost all of it grey, and let exactly one element be white.
 */
const DEV_MONO = () => font('IBM Plex Mono');

/** The surface every evidence block sits on. */
const DevSurface: React.FC<{
  progress?: number;
  padding?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({progress = 1, padding = 44, style, children}) => (
  <div
    style={{
      background: paletteNow().card,
      border: `2px solid ${paletteNow().border}`,
      borderRadius: 18,
      padding,
      boxSizing: 'border-box',
      transform: `scale(${0.97 + 0.03 * progress})`,
      visibility: progress <= 0 ? 'hidden' : 'visible',
      willChange: 'transform',
      ...style,
    }}
  >
    {children}
  </div>
);

type DevRecordsProps = {
  /** Column headers, left to right. Two or three. */
  columns: string[];
  /** Every row's cells, in column order. Eight to twelve reads best. */
  rows: string[][];
  /** The one row that is the point. Everything else stays redacted. */
  active?: number;
  /**
   * Columns from this index on are hidden behind a run of `?` on every row
   * but the active one. Default 1: the identifier stays readable, the payload
   * does not.
   */
  redactFrom?: number;
  caption?: string;
  /** A small icon or emoji stack beside the table, as in the reference. */
  aside?: DevItem[];
  delay?: number;
  style?: React.CSSProperties;
};

/**
 * A table of real records with one row revealed.
 *
 * The redaction is the graphic: a wall of `?` says "we cannot see these"
 * without asking anyone to read them, and the single white row lands as the
 * answer. Cell text is never invented here — pass the real values.
 */
const DevRecords: React.FC<DevRecordsProps> = ({
  columns,
  rows,
  active = Math.floor(rows.length / 2),
  redactFrom = 1,
  caption,
  aside = [],
  delay = 0,
  style,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const surface = itemProgress(frame, delay, 0, fps);
  // The lit row arrives after the table, so the shot has a beat: the wall of
  // redactions first, then the one record that matters.
  const reveal = itemProgress(frame, delay, 2, fps);
  const activeIndex = Math.max(0, Math.min(rows.length - 1, Math.round(active)));
  const widest = Math.max(...rows.map((row) => (row[redactFrom] ?? '').length), 24);
  return (
    <DevStage gap={44} style={style}>
      <div style={{display: 'flex', alignItems: 'center', gap: 56}}>
        <DevSurface progress={surface}>
          <div style={{display: 'flex', gap: 48}}>
            {columns.map((column, columnIndex) => (
              <div
                key={column}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  // The identifier column is sized to its content; the payload
                  // column takes the rest so the redaction runs long.
                  flex: columnIndex >= redactFrom ? '1 1 auto' : '0 0 auto',
                }}
              >
                <span
                  style={{
                    fontFamily: DEV_SANS(),
                    fontSize: 34,
                    fontWeight: 500,
                    color: paletteNow().ink,
                    textAlign: 'center',
                    paddingBottom: 16,
                    borderBottom: `2px solid ${paletteNow().border}`,
                    marginBottom: 20,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {column}
                </span>
                {rows.map((row, rowIndex) => {
                  const isActive = rowIndex === activeIndex;
                  const redacted = columnIndex >= redactFrom && !isActive;
                  const shown = redacted ? '?'.repeat(widest) : (row[columnIndex] ?? '');
                  const lit = isActive && reveal > 0;
                  return (
                    <span
                      key={`${rowIndex}-${columnIndex}`}
                      style={{
                        fontFamily: DEV_MONO(),
          // Machine values are copied, not styled: the stage uppercases the
          // register, and a hash or a path means something different in caps.
          textTransform: 'none',
                        fontSize: 30,
                        lineHeight: 1.62,
                        letterSpacing: redacted ? '0.02em' : '-0.01em',
                        color: lit ? paletteNow().ink : paletteNow().red,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        // The revealed row is the only thing that moves.
                        opacity: isActive && reveal <= 0 ? 0 : 1,
                      }}
                    >
                      {isActive && reveal <= 0 ? '?'.repeat(widest) : shown}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </DevSurface>
        {aside.length ? (
          <div style={{display: 'flex', flexDirection: 'column', gap: 44}}>
            {aside.map((item, index) => (
              <DevItemView
                key={index}
                item={item}
                size={96}
                progress={itemProgress(frame, delay, 3 + index, fps)}
              />
            ))}
          </div>
        ) : null}
      </div>
      {caption ? <DevCaption text={caption} delay={delay + 20} size={52} /> : null}
    </DevStage>
  );
};

type DevTransformProps = {
  /** What went in, shown verbatim. */
  from: string;
  /** What came out, shown verbatim. */
  to: string;
  /** What the arc is doing. Two or three words. */
  label?: string;
  delay?: number;
  style?: React.CSSProperties;
};

/**
 * Two real strings and the arc that turns one into the other.
 *
 * The arc is the sentence: it brackets the result, names itself at its apex,
 * and points at both ends of what it produced. Nothing here is a paraphrase —
 * both strings are the actual values, in mono, so the difference between them
 * is the whole graphic.
 */
const DevTransform: React.FC<DevTransformProps> = ({from, to, label, delay = 0, style}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const sourceIn = itemProgress(frame, delay, 0, fps);
  const arcIn = itemProgress(frame, delay, 1.5, fps);
  const resultIn = itemProgress(frame, delay, 3, fps);
  const width = 1180;
  const height = 190;
  // A shallow arc that clears the label, ending in arrowheads that turn down
  // onto each end of the result line.
  const arc = `M 40 ${height - 12} C 40 40, ${width * 0.3} 22, ${width / 2} 22 C ${
    width * 0.7
  } 22, ${width - 40} 40, ${width - 40} ${height - 12}`;
  return (
    <DevStage gap={0} style={style}>
      <div style={{position: 'relative', width, height, opacity: arcIn > 0 ? 1 : 0}}>
        <svg width={width} height={height} style={{position: 'absolute', inset: 0}} aria-hidden>
          <path
            d={arc}
            fill="none"
            stroke={paletteNow().muted}
            strokeWidth={DEV_HAIRLINE}
            strokeLinecap="round"
            // Drawn rather than faded: the arc travels the way the eye should.
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={1 - arcIn}
          />
          {[40, width - 40].map((x) => (
            <polyline
              key={x}
              points={`${x - 11},${height - 30} ${x},${height - 12} ${x + 11},${height - 30}`}
              fill="none"
              stroke={paletteNow().muted}
              strokeWidth={DEV_HAIRLINE}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={arcIn > 0.92 ? 1 : 0}
            />
          ))}
        </svg>
        {label ? (
          <span
            style={{
              position: 'absolute',
              top: 0,
              left: '50%',
              transform: 'translateX(-50%)',
              // The label sits on the ground colour so the arc reads as
              // breaking for it, the way a hand-drawn annotation does. A real
              // gap in the path would have to know the text's width.
              background: paletteNow().ground,
              padding: '0 26px',
              whiteSpace: 'nowrap',
              fontFamily: DEV_SANS(),
              fontSize: 46,
              fontWeight: 500,
              letterSpacing: '-0.03em',
              color: paletteNow().ink,
              opacity: arcIn > 0.5 ? 1 : 0,
            }}
          >
            {label}
          </span>
        ) : null}
      </div>
      <span
        style={{
          fontFamily: DEV_MONO(),
          // Machine values are copied, not styled: the stage uppercases the
          // register, and a hash or a path means something different in caps.
          textTransform: 'none',
          fontSize: 44,
          fontWeight: 500,
          color: paletteNow().ink,
          transform: `scale(${0.96 + 0.04 * resultIn})`,
          visibility: resultIn <= 0 ? 'hidden' : 'visible',
          whiteSpace: 'nowrap',
        }}
      >
        {to}
      </span>
      <span
        style={{
          marginTop: 22,
          fontFamily: DEV_MONO(),
          // Machine values are copied, not styled: the stage uppercases the
          // register, and a hash or a path means something different in caps.
          textTransform: 'none',
          fontSize: 40,
          color: paletteNow().green,
          visibility: sourceIn <= 0 ? 'hidden' : 'visible',
          whiteSpace: 'nowrap',
        }}
      >
        {from}
      </span>
    </DevStage>
  );
};

type DevCheck = {
  /** What was checked. A short phrase, never a sentence. */
  label: string;
  /** The result, as it would be written on a report: EXACT, 45 / 45. */
  badge?: string;
};

type DevChecksProps = {
  items: DevCheck[];
  /** The line that follows the list: the count, the verdict. */
  verdict?: string;
  delay?: number;
  style?: React.CSSProperties;
};

/** A checked list with its results in pills, as an annotation column. */
const DevChecks: React.FC<DevChecksProps> = ({items, verdict, delay = 0, style}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 34,
        // A checked list reads down its left edge; centring it breaks the
        // column of ticks that makes it scannable.
        textAlign: 'left',
        ...style,
      }}
    >
      {items.slice(0, 4).map((item, index) => {
        const progress = itemProgress(frame, delay, index, fps);
        return (
          <div
            key={item.label}
            style={{
              display: 'flex',
              // Top-aligned, so a label that wraps to two lines leaves its
              // tick on the first line instead of floating to the middle.
              alignItems: 'flex-start',
              gap: 24,
              transform: `translate3d(${(1 - progress) * -18}px, 0, 0)`,
              visibility: progress <= 0 ? 'hidden' : 'visible',
            }}
          >
            <DynamicStudioIcon
              name="circle-check"
              width={44}
              height={44}
              color={paletteNow().ink}
              strokeWidth={(DEV_HAIRLINE * 24) / 44}
              fill="none"
              style={{flex: '0 0 auto', marginTop: 4}}
              aria-hidden
            />
            <span
              style={{
                flex: '1 1 auto',
                fontFamily: DEV_SANS(),
                fontSize: 38,
                fontWeight: 500,
                color: paletteNow().ink,
                letterSpacing: '-0.02em',
              }}
            >
              {item.label}
            </span>
            {item.badge ? (
              <span
                style={{
                  flex: '0 0 auto',
                  fontFamily: DEV_MONO(),
          // Machine values are copied, not styled: the stage uppercases the
          // register, and a hash or a path means something different in caps.
          textTransform: 'none',
                  fontSize: 24,
                  letterSpacing: '0.08em',
                  color: paletteNow().muted,
                  border: `2px solid ${paletteNow().border}`,
                  borderRadius: 8,
                  padding: '8px 16px',
                  marginTop: 2,
                  whiteSpace: 'nowrap',
                }}
              >
                {item.badge}
              </span>
            ) : null}
          </div>
        );
      })}
      {verdict ? (
        <span
          style={{
            marginTop: 12,
            fontFamily: DEV_MONO(),
          // Machine values are copied, not styled: the stage uppercases the
          // register, and a hash or a path means something different in caps.
          textTransform: 'none',
            fontSize: 54,
            fontWeight: 500,
            letterSpacing: '0.02em',
            color: paletteNow().ink,
            visibility: itemProgress(frame, delay, items.length, fps) <= 0 ? 'hidden' : 'visible',
          }}
        >
          {verdict}
        </span>
      ) : null}
    </div>
  );
};

type DevLedgerProps = {
  /** Header over the two compared columns. */
  columns?: [string, string];
  /** Each row: the two values being compared. */
  rows: Array<[string, string]>;
  /** The line under the rule: NO DRIFT FOUND. */
  verdict?: string;
  delay?: number;
  style?: React.CSSProperties;
};

/**
 * Two columns of real values with `=` between them, and a verdict underneath.
 *
 * The point is never the values: it is the column of `=` signs, which a
 * viewer reads as "all the same" at a glance without parsing a single byte.
 */
const DevLedger: React.FC<DevLedgerProps> = ({columns, rows, verdict, delay = 0, style}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const surface = itemProgress(frame, delay, 0, fps);
  return (
    <DevSurface progress={surface} style={style}>
      {columns ? (
        <div
          style={{
            display: 'flex',
            gap: 40,
            fontFamily: DEV_SANS(),
            fontSize: 26,
            letterSpacing: '0.14em',
            color: paletteNow().muted,
            marginBottom: 24,
          }}
        >
          <span style={{flex: '1 1 0'}}>{columns[0]}</span>
          <span style={{flex: '0 0 auto', opacity: 0}}>=</span>
          <span style={{flex: '1 1 0', textAlign: 'right'}}>{columns[1]}</span>
        </div>
      ) : null}
      {rows.slice(0, 8).map(([left, right], index) => (
        <div
          key={`${index}-${left}`}
          style={{
            display: 'flex',
            gap: 40,
            alignItems: 'baseline',
            fontFamily: DEV_MONO(),
          // Machine values are copied, not styled: the stage uppercases the
          // register, and a hash or a path means something different in caps.
          textTransform: 'none',
            fontSize: 34,
            lineHeight: 1.6,
            color: paletteNow().ink,
            visibility: itemProgress(frame, delay, index * 0.4, fps) <= 0 ? 'hidden' : 'visible',
          }}
        >
          <span style={{flex: '1 1 0'}}>{left}</span>
          <span style={{flex: '0 0 auto', color: paletteNow().muted}}>=</span>
          <span style={{flex: '1 1 0', textAlign: 'right'}}>{right}</span>
        </div>
      ))}
      {verdict ? (
        <div
          style={{
            marginTop: 26,
            paddingTop: 22,
            borderTop: `2px solid ${paletteNow().border}`,
            fontFamily: DEV_MONO(),
          // Machine values are copied, not styled: the stage uppercases the
          // register, and a hash or a path means something different in caps.
          textTransform: 'none',
            fontSize: 32,
            letterSpacing: '0.1em',
            color: paletteNow().ink,
            visibility: itemProgress(frame, delay, rows.length * 0.4, fps) <= 0 ? 'hidden' : 'visible',
          }}
        >
          {verdict}
        </div>
      ) : null}
    </DevSurface>
  );
};

type DevSplitProps = {
  /** The evidence: a ui.DevLedger, a ui.DevTyping, a chart. */
  left: React.ReactNode;
  /** What it means: usually a ui.DevChecks. */
  right: React.ReactNode;
  gap?: number;
  style?: React.CSSProperties;
};

/**
 * Evidence on one side, what it means on the other.
 *
 * This is the one two-column layout the register allows, and the distinction
 * matters: a slide puts a title on one side and its content on the other,
 * while this puts the artifact beside its reading. Both halves carry weight.
 */
const DevSplit: React.FC<DevSplitProps> = ({left, right, gap = 90, style}) => (
  <DevStage gap={0} style={style}>
    <div style={{display: 'flex', alignItems: 'center', gap, width: '100%'}}>
      <div style={{flex: '1 1 0', minWidth: 0, display: 'flex', justifyContent: 'flex-end'}}>
        {left}
      </div>
      <div style={{flex: '1 1 0', minWidth: 0}}>{right}</div>
    </div>
  </DevStage>
);

export type DevZoomProps = {
  /** Target scale to emphasize the segment (default 1.22). */
  scale?: number;
  /** Frame to begin the smooth zoom in (default 0). */
  delay?: number;
  /** Duration of the zoom-in transition in frames (default 24). Fast start with a real slow settle. */
  span?: number;
  /**
   * How many frames to hold the zoom before zooming back out.
   * If omitted or undefined, stays zoomed in.
   */
  hold?: number;
  /**
   * Exact frame to start zooming back out.
   */
  outDelay?: number;
  /** Duration of the zoom-out transition in frames (default 20). */
  outSpan?: number;
  /** Transform origin (e.g. '50% 50%', 'center top', etc.). */
  transformOrigin?: string;
  /** Center offset {x, y} in pixels to adjust the focal point during zoom. */
  centerOffset?: {x?: number; y?: number};
  /** Subtle breathing/cinematic drift while holding (default true). */
  drift?: boolean;
  /** Legacy props for backward compatibility */
  cue?: string;
  componentHeight?: number;
  targetHeight?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
};

/**
 * Smooth zoom in and out to emphasize important segments or components.
 * Zoom in has a fast start and real slow deceleration settle (cubic bezier 0.12, 1, 0.25, 1).
 */
const DevZoom: React.FC<DevZoomProps> = ({
  scale = 1.22,
  delay = 0,
  span = 24,
  hold,
  outDelay,
  outSpan = 20,
  transformOrigin = '50% 50%',
  centerOffset,
  drift = true,
  style,
  children,
}) => {
  const frame = useCurrentFrame();

  // Fast start, real slow settle ease-out curve
  const easeIn = Easing.bezier(0.12, 1, 0.25, 1);
  const easeOut = Easing.bezier(0.25, 1, 0.5, 1);

  const inProgress = interpolate(frame, [delay, delay + Math.max(1, span)], [0, 1], {
    easing: easeIn,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const outStart = outDelay ?? (hold !== undefined ? delay + span + hold : undefined);
  const outProgress =
    outStart !== undefined
      ? interpolate(frame, [outStart, outStart + Math.max(1, outSpan)], [0, 1], {
          easing: easeOut,
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      : 0;

  const holdFrames = Math.max(0, frame - (delay + span));
  const driftAmount = drift && inProgress >= 1 && outProgress <= 0 ? holdFrames * 0.0006 : 0;

  const currentScale = 1 + (scale - 1) * inProgress * (1 - outProgress) + driftAmount;
  const offsetX = (centerOffset?.x ?? 0) * inProgress * (1 - outProgress);
  const offsetY = (centerOffset?.y ?? 0) * inProgress * (1 - outProgress);

  return (
    <div
      style={{
        ...style,
        transform: `${style?.transform ?? ''} translate3d(${offsetX}px, ${offsetY}px, 0) scale(${currentScale})`.trim(),
        transformOrigin,
        willChange: 'transform',
      }}
    >
      {children}
    </div>
  );
};

export const dev = {
  Records: DevRecords,
  Transform: DevTransform,
  Ledger: DevLedger,
  Checks: DevChecks,
  Split: DevSplit,
  Subject: DevSubject,
  Flow: DevFlow,
  Set: DevSet,
  Stat: DevStat,
  Typing: DevTyping,
  WordRise: DevWordRise,
  Scale: DevScale,
  Icon: DevIcon,
  GroupMorph: DevGroupMorph,
  Zoom: DevZoom,
};

/**
 * Word-by-word type reveal.
 *
 * Every text block in a scene enters the same way: each word wipes cleanly
 * from left to right, one after another. No fades anywhere, so text is never rendered
 * at partial opacity over footage. Words use the same shared decelerating
 * cubic-bezier curve as every other animated value.
 *
 * A block that a scene positions with `position: 'absolute'` and only a
 * `left` (the usual way to place a text group) has no width to wrap
 * against: the browser sizes it to its unwrapped content instead, so the
 * whole paragraph runs off in one line past any card and past the frame
 * edge. `maxWidth` is a required-in-practice prop for exactly that reason —
 * it defaults to a safe-area width so a scene that forgets it still wraps
 * inside the frame, but a card or column narrower than that default must
 * pass its own maxWidth to actually wrap where intended.
 *
 * A mixed-style line — a highlighted lead-in phrase followed by plain
 * continuation copy — is one `runs` array, not two separate `<Words>`
 * placed side by side. Two independent Words blocks each wrap fine on
 * their own but know nothing about each other's width, so together they
 * still run past the frame exactly like an unset maxWidth does. `runs`
 * flows every word from every segment through the same wrapping rows so
 * the whole sentence wraps as one paragraph, whatever the mid-sentence
 * style changes.
 */
import React from 'react';
import {Easing, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {anim} from './motion';
import {font} from './fonts';
import {isDevPalette, paletteNow} from './palette';
import {shotDuration, useSpokenCues} from './shotContext';

export type WordsRun = {
  text: string;
  /** Style for just this run's words: colour, weight, background, and so on. */
  style?: React.CSSProperties;
};

export type WordsProps = {
  /** The copy. Use \n for a deliberate line break. Ignored if `runs` is set. */
  text?: string;
  /** A single paragraph made of differently styled segments. See above. */
  runs?: WordsRun[];
  /** Frame the first word starts on. */
  delay?: number;
  /** Frames between one word and the next. Keep this tight: 2-3. */
  step?: number;
  /**
   * Frames one word takes to rise. The shared speed graph's span is for major
   * moves — camera, group entrances. A word crawling in over the full span
   * reads as broken, so a short span is the default here.
   */
  span?: number;
  /**
   * Column width in px the text wraps against. Always set this to match the
   * card or block the text lives in (its inner width, minus padding), not
   * just the fallback. Required whenever the block is positioned absolutely.
   */
  maxWidth?: number | string;
  /** Style for the type itself: family, size, weight, color, tracking. Base for every run. */
  style?: React.CSSProperties;
  /** Unitless line height. Keep 0.9-1.05 for display, 1.25-1.4 for body. */
  lineHeight?: number;
  align?: 'left' | 'center' | 'right';
  /** Optional per-word override, e.g. to colour one word. Ignored if `runs` is set. */
  wordStyle?: (word: string, index: number) => React.CSSProperties | undefined;
};

type Token = {word: string; runStyle?: React.CSSProperties; lineBreakBefore: boolean};

const tokenize = (props: Pick<WordsProps, 'text' | 'runs' | 'wordStyle'>): Token[] => {
  const runs: WordsRun[] = props.runs ?? [{text: props.text ?? ''}];
  const tokens: Token[] = [];
  runs.forEach((run) => {
    run.text.split('\n').forEach((segment, segmentIndex) => {
      const words = segment.split(/\s+/).filter(Boolean);
      words.forEach((word, wordIndex) => {
        tokens.push({
          word,
          runStyle: run.style,
          lineBreakBefore: segmentIndex > 0 && wordIndex === 0,
        });
      });
    });
  });
  return tokens;
};

export const Words: React.FC<WordsProps> = ({
  text,
  runs,
  delay = 0,
  step = 3,
  span = 14,
  maxWidth,
  style,
  lineHeight = 1.02,
  align = 'left',
  wordStyle,
}) => {
  const frame = useCurrentFrame();
  const {width: canvasWidth} = useVideoConfig();
  const tokens = tokenize({text, runs, wordStyle});

  // Group into lines at each explicit \n, keeping every word's place in the
  // overall reveal order (its index across the whole paragraph, not just its
  // own line) so the cascade reads as one continuous entrance.
  const lines: Token[][] = [[]];
  tokens.forEach((token) => {
    if (token.lineBreakBefore) lines.push([]);
    lines[lines.length - 1].push(token);
  });

  let index = 0;

  return (
    <div style={{maxWidth: maxWidth ?? canvasWidth - 256, ...style, lineHeight}}>
      {lines.map((line, lineIndex) => (
        <div
          key={lineIndex}
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
          }}
        >
          {line.map((token, wordIndex) => {
            const start = delay + index * step;
            const overrideStyle = runs ? token.runStyle : wordStyle?.(token.word, index);
            index += 1;
            // A horizontal clip has stable geometry for every font: no
            // ascender, descender, or line-height can leak over a moving
            // vertical mask edge. The hard hidden state removes the final
            // antialiasing sliver at zero progress.
            const reveal = anim(frame, start, 0, 1, {span});
            return (
              <span
                key={`${lineIndex}-${wordIndex}`}
                style={{
                  display: 'inline-block',
                  overflow: 'hidden',
                  clipPath: `inset(0 ${(1 - reveal) * 100}% 0 0)`,
                  visibility: reveal <= 0 ? 'hidden' : 'visible',
                  paddingRight: '0.26em',
                  ...(runs ? overrideStyle : undefined),
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    transform: `translate3d(${(1 - reveal) * 6}px, 0, 0)`,
                    willChange: 'transform',
                    ...(runs ? undefined : overrideStyle),
                  }}
                >
                  {token.word}
                </span>
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

/** Frames a Words block needs before the next element should start. */
export const wordsLead = (text: string, step = 3, span = 14) =>
  Math.max(0, String(text).split(/\s+/).filter(Boolean).length - 1) * step + span;

export type KineticCenterBuildProps = {
  /** Spoken words or short phrases. Supports \n or auto-linebreaks if the line gets big. */
  words: string[];
  /**
   * Shot-relative frames when each item is spoken, used as the fallback when
   * the word cannot be found in the shot's measured narration. The component
   * re-reads the alignment itself, so these only matter for a word the
   * voiceover never says.
   */
  cues: number[];
  /** Frames used by each word entrance. */
  span?: number;
  /** Vertical slide distance for each word. */
  distance?: number;
  /** Maximum words per line before wrapping to a new line (default: 4-5) */
  maxWordsPerLine?: number;
  /** Vertical gap between lines when multi-line (default: ~24px) */
  lineGap?: number;
  style?: React.CSSProperties;
  wordStyle?:
    | ((word: string, index: number) => React.CSSProperties | undefined)
    | React.CSSProperties;
};

/**
 * The entrance curve for a word: the house curve's shape, pushed further.
 *
 * A kinetic handoff is 12-20 frames, short enough that even a small amount of
 * ease at the head eats most of the move and the line reads mushy. These words
 * are effectively at full velocity on their first frame and spend the whole
 * span settling, which is what makes a fast cue read as struck rather than as
 * slid.
 */
const KINETIC_EASE_OUT = Easing.bezier(0.1, 0.96, 0.22, 1);

export const kineticProgress = (frame: number, start: number, span: number) =>
  interpolate(frame, [start, start + span], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: KINETIC_EASE_OUT,
  });

/**
 * The recentring curve, which is deliberately not the word's curve.
 *
 * A word is one glyph group travelling its own height; the line under it can
 * be shifting by 200px, and running that on the word's snappy head threw the
 * whole sentence sideways at 60px in a single frame. The correction gets a
 * longer, gentler ride: the incoming word still pops, while everything already
 * on screen drifts to its new centre.
 *
 * The multiplier is the whole trade-off, measured against a real rendered line
 * (peak travel in a single frame / frames still drifting after the word has
 * settled): 1.0x is 84px and 0 frames — the lurch this replaced; 2.2x is 21px
 * but 17 frames, which reads as the sentence sliding around under settled
 * type. 1.6x is 29px with 8 frames and only 4% of the shift outstanding when
 * the word lands, so the recentre is imperceptible by the time the eye
 * arrives.
 */
const KINETIC_EASE_GLIDE = Easing.bezier(0.33, 0.62, 0.2, 1);

/** The closing push-in's curve: soft at both ends, near-linear through the middle. */
const KINETIC_EASE_ZOOM = Easing.bezier(0.37, 0.05, 0.5, 0.95);
const LINE_SPAN_MULTIPLIER = 1.6;

export const kineticLineProgress = (frame: number, start: number, span: number) =>
  interpolate(frame, [start, start + span * LINE_SPAN_MULTIPLIER], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: KINETIC_EASE_GLIDE,
  });

/**
 * How far right to slide the fixed-width line so the words already on screen
 * sit centred in the frame.
 *
 * Every word holds its slot for the whole shot, so the line's own width is the
 * finished sentence from frame 0. Half the width still to arrive is therefore
 * exactly the correction, and weighting each slot by `1 - entrance` makes that
 * correction travel on the same eased curve as the word itself instead of
 * stepping between whole words. A slot with no measurement yet contributes
 * nothing, which degrades to a line centred on its full width.
 */
export const kineticLineOffset = (
  slotWidths: number[],
  entrances: number[],
  gapPx: number,
) =>
  entrances.reduce((total, entrance, index) => {
    const slot = slotWidths[index];
    return slot === undefined ? total : total + (1 - entrance) * (slot + gapPx);
  }, 0) / 2;

/**
 * Fast typography-only punctuation: words slide up word-by-word into a single
 * horizontal line, dynamically keeping the line centered in the composition
 * according to the words currently visible in the comp, with natural word spacing.
 *
 * Every word is mounted from frame 0 and holds its own space, hidden until its
 * cue. Mounting words as they were spoken made the centred flex line grow in
 * one-frame steps, and every word already on screen jumped sideways by half
 * the new word's width — the visible roughness was that reflow, not the
 * per-word motion. Layout is now fixed for the whole shot, and the line is
 * translated by half the width still to come so the visible words stay
 * centred. That offset is driven by the same eased progress as the words, so
 * the recentring travels with them instead of snapping between them.
 */
export const KineticCenterBuild: React.FC<KineticCenterBuildProps> = ({
  words,
  cues,
  span = 14,
  distance,
  maxWordsPerLine,
  lineGap,
  style,
  wordStyle,
}) => {
  const frame = useCurrentFrame();
  const durationInFrames = Math.max(1, shotDuration());

  const getWordStyle = (w: string, idx: number): React.CSSProperties | undefined => {
    if (typeof wordStyle === 'function') {
      try {
        return wordStyle(w, idx);
      } catch {
        return undefined;
      }
    }
    if (wordStyle && typeof wordStyle === 'object') {
      return wordStyle;
    }
    return undefined;
  };

  // Flatten words while identifying explicit linebreaks (\n)
  const rawWordTokens: string[] = [];
  for (const item of words) {
    const s = String(item);
    if (s.includes('\n')) {
      const parts = s.split('\n');
      for (let p = 0; p < parts.length; p++) {
        const trimmed = parts[p].trim();
        if (trimmed) rawWordTokens.push(trimmed);
        if (p < parts.length - 1) rawWordTokens.push('\n');
      }
    } else {
      const trimmed = s.trim();
      if (trimmed) rawWordTokens.push(trimmed);
    }
  }

  // Filter out \n to build cleanWords for voice cue lookup
  const cleanWords = rawWordTokens
    .filter((w) => w !== '\n')
    .slice(0, 14)
    .map((w, idx) => {
      // Natural sentence casing if authored in shouting ALL-CAPS
      if (w === w.toUpperCase() && w.length > 1 && !/^[A-Z0-9_]{1,3}$/.test(w)) {
        return idx === 0
          ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
          : w.toLowerCase();
      }
      return w;
    });

  // Construct structured lines preserving word tokens and mapping to globalIndices
  const hasExplicitBreaks = rawWordTokens.includes('\n');
  const lines: Array<Array<{word: string; globalIndex: number}>> = [];

  if (hasExplicitBreaks) {
    let currentLine: Array<{word: string; globalIndex: number}> = [];
    let gIdx = 0;
    for (const token of rawWordTokens) {
      if (token === '\n') {
        if (currentLine.length > 0) {
          lines.push(currentLine);
          currentLine = [];
        }
      } else {
        if (gIdx < cleanWords.length) {
          currentLine.push({word: cleanWords[gIdx], globalIndex: gIdx});
          gIdx++;
        }
      }
    }
    if (currentLine.length > 0) lines.push(currentLine);
  } else {
    // Automatic line breaks if kinetic line gets big
    const maxWords = maxWordsPerLine ?? 4;
    const totalChars = cleanWords.reduce((acc, w) => acc + w.length, 0);

    if (cleanWords.length <= maxWords && totalChars <= 24) {
      // Fits comfortably on 1 line
      lines.push(cleanWords.map((word, globalIndex) => ({word, globalIndex})));
    } else if (cleanWords.length <= 8 || totalChars <= 50) {
      // Split into 2 balanced lines
      let bestSplit = Math.ceil(cleanWords.length / 2);
      let minDiff = Infinity;
      for (let i = 1; i < cleanWords.length; i++) {
        const len1 = cleanWords.slice(0, i).join(' ').length;
        const len2 = cleanWords.slice(i).join(' ').length;
        const diff = Math.abs(len1 - len2);
        if (diff < minDiff) {
          minDiff = diff;
          bestSplit = i;
        }
      }
      lines.push(
        cleanWords.slice(0, bestSplit).map((word, i) => ({word, globalIndex: i})),
        cleanWords.slice(bestSplit).map((word, i) => ({word, globalIndex: bestSplit + i})),
      );
    } else {
      // 9+ words: split into 3 balanced lines
      const third = Math.ceil(cleanWords.length / 3);
      const split1 = third;
      const split2 = third * 2;
      lines.push(
        cleanWords.slice(0, split1).map((word, i) => ({word, globalIndex: i})),
        cleanWords.slice(split1, split2).map((word, i) => ({word, globalIndex: split1 + i})),
        cleanWords.slice(split2).map((word, i) => ({word, globalIndex: split2 + i})),
      );
    }
  }

  const safeSpan = Math.max(8, Math.min(24, Math.round(span)));
  const spokenCues = useSpokenCues(cleanWords, cues);

  const totalChars = cleanWords.reduce((acc, w) => acc + w.length, 0);
  const calculatedFontSize =
    lines.length >= 3 ? 48 :
    lines.length === 2 ? (totalChars > 36 ? 54 : 62) :
    totalChars > 26 ? 56 :
    totalChars > 16 ? 64 : 72;

  const fontSize =
    typeof style?.fontSize === 'number'
      ? style.fontSize
      : typeof style?.fontSize === 'string'
        ? parseFloat(style.fontSize) || calculatedFontSize
        : calculatedFontSize;

  const lineRef = React.useRef<HTMLDivElement>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const [slotWidths, setSlotWidths] = React.useState<number[]>([]);
  const [maxLineWidth, setMaxLineWidth] = React.useState(0);
  const [available, setAvailable] = React.useState(0);

  React.useLayoutEffect(() => {
    const stageWidth = stageRef.current?.clientWidth ?? 0;
    setAvailable((current) => (current === stageWidth ? current : stageWidth));

    const lineContainer = lineRef.current;
    if (!lineContainer) return;
    const lineChildren = Array.from(lineContainer.children) as HTMLElement[];
    const widest = Math.max(0, ...lineChildren.map((c) => c.offsetWidth));
    setMaxLineWidth((current) => (current === widest ? current : widest));

    // If single line, also measure word slots for dynamic recentring
    if (lines.length === 1 && lineChildren[0]) {
      const slots = Array.from(lineChildren[0].children).map((c) => (c as HTMLElement).offsetWidth);
      setSlotWidths((current) =>
        current.length === slots.length && current.every((w, i) => w === slots[i]) ? current : slots,
      );
    }
  });

  if (cleanWords.length === 0) return null;

  const starts: number[] = [];
  const lead = Math.round(safeSpan * 0.35);
  const latest = Math.max(0, durationInFrames - 45 - safeSpan);

  const rawFirstSpoken = spokenCues[0] ?? cues[0] ?? 0;
  const initialDelay = Math.max(0, Math.round(rawFirstSpoken) - lead);

  for (let i = 0; i < cleanWords.length; i++) {
    const rawSpoken = Math.round(spokenCues[i] ?? cues[i] ?? (i * 24));
    const adjustedCue = initialDelay > 6
      ? Math.max(0, rawSpoken - initialDelay)
      : Math.max(0, rawSpoken - lead);

    const floor = i === 0 ? 0 : starts[i - 1] + 4;
    const maxGapFromPrev = i === 0 ? 0 : starts[i - 1] + 24;
    const targetStart = i === 0 ? 0 : Math.min(maxGapFromPrev, Math.max(floor, adjustedCue));

    starts.push(Math.min(latest, targetStart));
  }

  const lastStart = starts[cleanWords.length - 1];
  const hasGenerousHold = durationInFrames - lastStart >= 75;
  const exitStart = hasGenerousHold ? durationInFrames - 12 : durationInFrames + 9999;
  const pExit = anim(frame, exitStart, 0, 1, {span: 12});
  const opacityExit = Math.max(0, 1 - pExit);

  const fontFamily = isDevPalette() ? font('Fredoka') : font('Bricolage Grotesque');
  const slideDist = distance ?? Math.round(fontSize * 0.9);

  const entrances = cleanWords.map((_, index) =>
    kineticProgress(frame, starts[index], safeSpan),
  );
  const lineEntrances = cleanWords.map((_, index) =>
    kineticLineProgress(frame, starts[index], safeSpan),
  );

  const gapPx = Math.max(14, Math.round(fontSize * 0.28));
  // Kinetic type is one spoken sentence broken across lines, not a paragraph:
  // the lines want to read as a single block, so the leading is set well below
  // the font's own. The word masks below carry their own headroom, so this gap
  // is the whole of the visible spacing.
  const lineGapPx = lineGap ?? Math.max(2, Math.round(fontSize * 0.1));
  const lineOffset = lines.length === 1 ? kineticLineOffset(slotWidths, lineEntrances, gapPx) : 0;
  const fitScale =
    available > 0 && maxLineWidth > 0 ? Math.min(1, (available * 0.92) / maxLineWidth) : 1;

  /**
   * The closing push-in.
   *
   * Once the last word has landed the block would otherwise sit dead still for
   * the rest of the shot. A slow 4% scale over the tail keeps the frame alive
   * without becoming a beat of its own: it is a camera move, so it rides the
   * near-linear drift curve rather than the house ease, and it is exempt from
   * the settle rule for the same reason cameraDrift is.
   */
  const zoomFrames = Math.min(110, Math.max(40, Math.round(durationInFrames * 0.4)));
  const zoomStart = Math.max(lastStart + safeSpan, durationInFrames - zoomFrames);
  const endZoom = interpolate(frame, [zoomStart, Math.max(zoomStart + 1, durationInFrames - 1)], [1, 1.04], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: KINETIC_EASE_ZOOM,
  });
  const stageScale = fitScale * endZoom;

  if (opacityExit <= 0) return null;

  return (
    <div
      ref={stageRef}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        padding: '48px 80px',
        boxSizing: 'border-box',
      }}
    >
      <div
        ref={lineRef}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: `${lineGapPx}px`,
          opacity: opacityExit,
          transform: `scale(${stageScale})`,
          transformOrigin: 'center center',
          willChange: 'transform',
        }}
      >
        {lines.map((lineWords, lineIdx) => {
          const isSingleLine = lines.length === 1;
          const lineTransform = isSingleLine && lineOffset !== 0
            ? `translate3d(${lineOffset}px, 0, 0)`
            : undefined;

          return (
            <div
              key={lineIdx}
              style={{
                display: 'inline-flex',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize,
                gap: `${gapPx}px`,
                whiteSpace: 'nowrap',
                transform: lineTransform,
                willChange: lineTransform ? 'transform' : undefined,
              }}
            >
              {lineWords.map(({word, globalIndex}) => {
                const pEnter = entrances[globalIndex];
                const yEnter = (1 - pEnter) * slideDist;
                const opacityEnter = Math.min(1, pEnter * 2.2);

                return (
                  <span
                    key={`${globalIndex}-${word}`}
                    style={{
                      display: 'inline-block',
                      overflow: 'hidden',
                      verticalAlign: 'baseline',
                      padding: '0.12em 0.08em 0.22em',
                      marginTop: '-0.12em',
                      marginBottom: '-0.22em',
                      lineHeight: 1.08,
                      visibility: frame >= starts[globalIndex] ? 'visible' : 'hidden',
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-block',
                        fontFamily,
                        fontSize,
                        fontWeight: 650,
                        lineHeight: 1.08,
                        letterSpacing: '-0.02em',
                        color: paletteNow().ink,
                        textTransform: 'none',
                        transform: `translate3d(0, ${yEnter}px, 0)`,
                        opacity: opacityEnter,
                        willChange: 'transform, opacity',
                        whiteSpace: 'nowrap',
                        ...style,
                        ...getWordStyle(word, globalIndex),
                      }}
                    >
                      {word}
                    </span>
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};

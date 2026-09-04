/**
 * The one speed graph.
 *
 * Every animation in every scene rides the same decelerating cubic bezier: it
 * leaves at full velocity on the first frame and spends the rest of its span
 * settling. The old symmetric ease-in-out spent its head crawling away from
 * the start value, which read as lag rather than as ease — an entrance wants
 * its speed at the front and its time at the settle.
 *
 * Two things make motion read as 60fps rather than as a slideshow: velocity at
 * the head, and a value delta large enough that consecutive frames differ by
 * more than a rounding error. A 6px move over 48 frames is sub-pixel for most
 * of its life and reads as stepping no matter how high the frame rate is, so
 * the travel and distance tokens below are deliberately generous.
 */
import {Easing, interpolate, spring} from 'remotion';

/** The composition frame rate every spring is tuned against. */
export const FPS = 60;

export const SPEED_GRAPH = {
  /** Control points of the shared cubic bezier: near-instant head, long settle. */
  points: [0.16, 1, 0.3, 1] as const,
  css: 'cubic-bezier(0.16, 1, 0.3, 1)',
  /** Frames one animation is stretched across, whatever the duration. */
  span: 40,
  /** Travel distances big enough that every frame of the move is visible. */
  travel: {text: 64, group: 88, mark: 44, wipe: 120},
  /** Frames between one element's start and the next in a chain. */
  stagger: 6,
};

/**
 * Signal theme spring motion:
 * Fast launch at the start, decelerating smoothly with a spring-like settle at the end.
 */
export const signalSpring = (
  frame: number,
  delay = 0,
  span = 22,
  config?: {damping?: number; mass?: number; stiffness?: number},
): number => {
  if (frame < delay) return 0;
  return spring({
    frame: frame - delay,
    fps: FPS,
    durationInFrames: Math.max(1, span),
    config: {
      damping: config?.damping ?? 13,
      mass: config?.mass ?? 0.7,
      stiffness: config?.stiffness ?? 130,
    },
  });
};

/** Signal theme spring for outgoing exits */
export const signalSpringExit = (
  frame: number,
  startFrame: number,
  span = 18,
): number => {
  if (frame < startFrame) return 0;
  return spring({
    frame: frame - startFrame,
    fps: FPS,
    durationInFrames: Math.max(1, span),
    config: {
      damping: 14,
      mass: 0.8,
      stiffness: 140,
    },
  });
};

/**
 * Pop-up animation scale curve:
 * Goes from 0 to 115% really quick, then settles slowly to 100% with eased motion.
 */
export const popScale = (
  frame: number,
  delay = 0,
  span = 24,
  options?: {
    from?: number;
    peak?: number;
    to?: number;
    quickFraction?: number;
  },
): number => {
  if (frame < delay) return options?.from ?? 0;
  const relFrame = frame - delay;
  const from = options?.from ?? 0;
  const peak = options?.peak ?? 1.15;
  const to = options?.to ?? 1.0;
  const quickSpan = Math.max(4, Math.round(span * (options?.quickFraction ?? 0.32)));

  if (relFrame <= quickSpan) {
    return interpolate(relFrame, [0, quickSpan], [from, peak], {
      easing: Easing.bezier(0.12, 0.95, 0.2, 1),
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
  }

  return interpolate(relFrame, [quickSpan, span], [peak, to], {
    easing: Easing.bezier(0.25, 1, 0.5, 1),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
};

/** Eased scale exit for pop animations */
export const popScaleExit = (
  frame: number,
  startFrame: number,
  span = 18,
): number => {
  if (frame < startFrame) return 0;
  return interpolate(frame - startFrame, [0, span], [0, 1], {
    easing: Easing.bezier(0.35, 0, 0.25, 1),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
};

/**
 * Pop-up spring motion:
 * Fast launch at the start with energetic spring momentum,
 * slight bloom/overshoot, then slowly and softly settling into rest.
 */
export const popupSpring = (
  frame: number,
  delay = 0,
  span = 24,
  config?: {damping?: number; mass?: number; stiffness?: number},
): number => {
  if (frame < delay) return 0;
  return spring({
    frame: frame - delay,
    fps: FPS,
    durationInFrames: Math.max(1, span),
    config: {
      damping: config?.damping ?? 11,
      mass: config?.mass ?? 0.55,
      stiffness: config?.stiffness ?? 160,
    },
  });
};

/** Pop-up spring for outgoing exits */
export const popupSpringExit = (
  frame: number,
  startFrame: number,
  span = 18,
): number => {
  if (frame < startFrame) return 0;
  return spring({
    frame: frame - startFrame,
    fps: FPS,
    durationInFrames: Math.max(1, span),
    config: {
      damping: 14,
      mass: 0.6,
      stiffness: 170,
    },
  });
};

/**
 * The cut boundary is owned by the player, not by generated scene code.
 *
 * Both halves of an edit move the same way: the outgoing shot travels up and
 * grows past the frame, the incoming shot arrives from below at the same scale
 * the outgoing one left on and settles back to rest. Direction and rate are
 * continuous across the edit even though position is not, which is what makes
 * a cut read as one gesture rather than as two separate moves.
 *
 * `overlap` is the piece that was missing. The shots' Sequences used to be
 * strictly back to back, so the outgoing shot's fade finished on its own last
 * frame and the incoming shot's fade started from zero on its first: for two
 * or three frames the frame held nothing but the ground, and every edit
 * blinked. The player now keeps the outgoing shot mounted `overlap` frames
 * into its successor and runs its departure there, so the two halves genuinely
 * cross instead of both being invisible at the same instant.
 *
 * `lead` is how far before the edit the outgoing shot starts to move, so the
 * departure is already underway when the incoming shot appears.
 */
export const CUT_BOUNDARY = {
  travel: 72,
  /** Scale the incoming shot enters from; the outgoing shot grows past 1 by as much. */
  scale: 0.972,
  halfSpan: 10,
  lead: 2,
  /** Frames the outgoing shot stays mounted past its own end, to cross with the next. */
  overlap: 16,
} as const;
export type CutTransitionMode = 'push';

// One boundary family only: the outgoing shot slides up and fades out fast,
// the incoming shot continues the same slide and fades in fast. Mask-based
// families (wipes, scale-masks) are excluded — a mask edge reads as a cut
// artifact, and the fade already owns the handoff.
const CUT_TRANSITIONS: CutTransitionMode[] = ['push'];

/** One deterministic transition family per edit, shared by both adjacent shots. */
export const cutTransitionForBoundary = (boundaryIndex: number): CutTransitionMode =>
  CUT_TRANSITIONS[Math.abs(Math.trunc(boundaryIndex)) % CUT_TRANSITIONS.length];

/**
 * transitions.dev's useful spatial tokens and semantic catalog, adapted for
 * generated video graphics. Timing and easing are intentionally omitted: the
 * studio's one fixed anim() curve owns both.
 */
export const TRANSITIONS = {
  distance: {micro: 10, small: 18, base: 28, medium: 44, large: 80},
  scale: {large: 0.86, medium: 0.9, small: 0.94, tiny: 0.97},
  blur: {small: 2, medium: 3, large: 8},
  catalog: [
    'card-resize',
    'number-pop-in',
    'notification-badge',
    'text-states-swap',
    'panel-reveal',
    'page-side-by-side',
    'icon-swap',
    'success-check',
    'skeleton-reveal',
    'shimmer-text',
    'tabs-sliding',
    'texts-reveal',
    'toast',
    'checkbox-check',
    'spinning-counter',
    'thinking-states',
    'streaming-text',
    'matrix-loader',
    'banner-stacking',
  ] as const,
};

/** The house curve: full velocity on frame one, then a long quiet settle. */
export const EASE_OUT = Easing.bezier(...SPEED_GRAPH.points);
// Time-reversing the house curve gives its mirror — slow head, fast tail —
// which is what an outgoing half of a cut needs so the edit is the velocity
// peak rather than a second place where motion settles.
const EASE_OUT_REVERSE = (value: number) => 1 - EASE_OUT(1 - value);

/**
 * A camera is the one thing that must not use the house curve. The house curve
 * spends its velocity immediately, which on a push-in means the zoom is over
 * in half a second and the rest of the shot is frozen. A drift wants the
 * opposite: near-linear through the middle, soft at both ends, never a beat of
 * its own.
 */
const EASE_DRIFT = Easing.bezier(0.37, 0.05, 0.5, 0.95);

/**
 * The only interpolation a scene needs: `anim(frame, delay, from, to)`.
 * Clamped at both ends, so before `delay` it sits at `from` and after the span
 * it holds `to` forever.
 */
export const anim = (
  frame: number,
  delay = 0,
  from = 0,
  to = 1,
  options?: {span?: number},
): number => {
  // A shorter span is allowed for small, local moves — a word rising out of
  // its mask should not take the same 40 frames as the camera. The curve
  // itself never changes, only how far it is stretched.
  const span = Math.max(1, options?.span ?? SPEED_GRAPH.span);
  return interpolate(frame, [delay, delay + span], [from, to], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE_OUT,
  });
};

/**
 * Frame-aware scenes occasionally reach for Remotion's raw interpolate(). Keep
 * those values on the same shared bezier rather than allowing an accidental
 * linear segment to break the otherwise smooth motion language.
 */
export const smoothInterpolate = (...args: Parameters<typeof interpolate>) => {
  const [input, inputRange, outputRange, options] = args;
  return interpolate(input, inputRange, outputRange, {
    ...options,
    easing: EASE_OUT,
  });
};

/** Delay for the nth element of a chain. */
export const stagger = (index: number, step = SPEED_GRAPH.stagger) => index * step;

/**
 * The single root zoom, spread across the whole composition so the frame never
 * stops moving.
 */
export const cameraZoom = (
  frame: number,
  durationInFrames: number,
  from = 1,
  to = 1.055,
): number =>
  interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [from, to], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE_DRIFT,
  });

/**
 * The cut player's push-in: a barely-there zoom that keeps every shot alive
 * across its voiceover. Nearly linear with soft ends, so it never reads as a
 * beat of its own — just a frame that is never quite still. It settles 1.5s
 * before the shot ends so the tail of the shot is genuinely static, matching
 * the scene rule that all motion completes by the final 90 frames.
 */
/**
 * The settled tail every shot ends on, in frames at 60fps.
 *
 * Nothing may still be animating inside it — no entrance, reveal, count, draw,
 * or type — in any theme. Two things are exempt because they are the shot
 * leaving rather than the shot changing: an outgoing animation (`exit`,
 * `inOut`, the player's boundary envelope) and a zoom (`cameraDrift`, which
 * settles right on this line anyway).
 *
 * The prompts have asked for this for a while; what was missing was anything
 * that made it true. `voiceCue` now clamps to it, which covers every
 * voice-locked reveal in a cut.
 */
export const SETTLE_FRAMES = 90;

/**
 * What a reveal is assumed to take when its own span is unknown, so a cue
 * pulled back to the settle line still finishes before it rather than
 * starting on it.
 */
export const TYPICAL_REVEAL_FRAMES = 18;

const TAIL_HOLD_FRAMES = SETTLE_FRAMES;

export const cameraDrift = (
  frame: number,
  durationInFrames: number,
  from = 1,
  to = 1.035,
): number =>
  interpolate(
    frame,
    [0, Math.max(1, durationInFrames - 1 - TAIL_HOLD_FRAMES)],
    [from, to],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: EASE_DRIFT,
    },
  );

/**
 * The exit ramp: 0 for almost all of a shot, then 0 -> 1 over its last
 * `span` frames.
 *
 * Cuts feel seamless when a shot leaves deliberately rather than being
 * chopped, so every scene in a cut multiplies its outgoing transform by this.
 * It is deliberately short and late — an exit that starts early reads as the
 * graphic losing confidence in itself.
 */
export const exit = (frame: number, durationInFrames: number, options?: {span?: number}) => {
  const span = Math.max(1, options?.span ?? 18);
  const start = Math.max(0, durationInFrames - span);
  return anim(frame, start, 0, 1, {span});
};

/**
 * The edit is the velocity peak. The outgoing half uses the time-reversed
 * curve (slow -> fast), then the incoming half uses the normal curve
 * (fast -> slow). Together they form one continuous motion envelope centred on
 * the cut instead of two ease-outs that both settle at the edit. The player
 * overlaps the two shots across that envelope, so both halves are on screen at
 * once and the crossing is a real dissolve rather than a dip to the ground.
 */
export const cutEnterProgress = (frame: number): number =>
  anim(frame, 0, 0, 1, {span: CUT_BOUNDARY.halfSpan});

export const signalCutEnterProgress = (frame: number): number =>
  signalSpring(frame, 0, 14, {
    damping: 15,
    mass: 0.7,
    stiffness: 140,
  });

/**
 * The outgoing half runs across the edit, not up to it.
 *
 * It begins `lead` frames early so the departure has already started when the
 * cut lands, and finishes inside the overlap the player holds it mounted for.
 * Every frame of it is therefore composited over the incoming shot rather than
 * over an empty ground.
 */
/**
 * `crosses` is false for the last shot in a cut, which has nothing to hand off
 * to and is not held mounted past its end. Its departure has to finish inside
 * its own frames or it would be truncated by the composition instead of
 * completing.
 */
const exitStart = (durationInFrames: number, span: number, crosses: boolean) =>
  crosses
    ? Math.max(0, durationInFrames - CUT_BOUNDARY.lead)
    : Math.max(0, durationInFrames - 1 - span);

export const cutExitProgress = (
  frame: number,
  durationInFrames: number,
  crosses = true,
): number => {
  const start = exitStart(durationInFrames, CUT_BOUNDARY.halfSpan, crosses);
  return interpolate(frame, [start, start + CUT_BOUNDARY.halfSpan], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE_OUT_REVERSE,
  });
};

export const signalCutExitProgress = (
  frame: number,
  durationInFrames: number,
  crosses = true,
): number => signalSpringExit(frame, exitStart(durationInFrames, 14, crosses), 14);

/** Backwards-compatible vertical boundary value for callers that need one number. */
export const cutBoundaryY = (frame: number, durationInFrames: number): number =>
  (1 - cutEnterProgress(frame)) * CUT_BOUNDARY.travel -
  cutExitProgress(frame, durationInFrames) * CUT_BOUNDARY.travel;

/**
 * Shorthand for the usual pairing: a value that rises in at `delay` and, near
 * the end of the shot, travels back out by `by` pixels. Returns the offset to
 * put in a translate.
 */
export const inOut = (
  frame: number,
  durationInFrames: number,
  options?: {delay?: number; from?: number; by?: number; span?: number; exitSpan?: number},
) => {
  const from = options?.from ?? SPEED_GRAPH.travel.group;
  const by = options?.by ?? -SPEED_GRAPH.travel.mark;
  const entered = anim(frame, options?.delay ?? 0, from, 0, {span: options?.span ?? 26});
  const leaving = exit(frame, durationInFrames, {span: options?.exitSpan ?? 18}) * by;
  return entered + leaving;
};

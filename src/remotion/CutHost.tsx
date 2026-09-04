/**
 * The cut's composition: every shot's scene, laid end to end in one Player.
 *
 * Shots are compiled independently and each is wrapped in its own error
 * boundary, so a shot that crashes shows its message in its own slot while
 * the rest of the timeline keeps playing. That is the whole reason this does
 * not reuse the studio's single-scene host: on a timeline, one bad shot must
 * not take down the cut.
 */
import React from 'react';
import {Audio} from '@remotion/media';
import {AbsoluteFill, Easing, Freeze, Sequence, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {compileScene} from '../studio/compile';
import {CutShot} from '../studio/cut';
import {CUT_PALETTE, CUT_PALETTE_DEV, CutStyle, paletteFor} from '../studio/editorStyle';
import {ensureFont} from '../studio/fonts';
import {CANVAS} from '../studio/prompt';
import {
  CUT_BOUNDARY,
  CutTransitionMode,
  cameraDrift,
  cutEnterProgress,
  cutExitProgress,
  signalCutEnterProgress,
  signalCutExitProgress,
  cutTransitionForBoundary,
} from '../studio/motion';
import {ShotDurationProvider} from '../studio/shotContext';
import {patterns} from '../studio/textures';
import {setActivePalette} from '../studio/palette';

/** Hosted speech returns an inline WAV; local development still uses public/. */
const mediaSource = (file: string) =>
  /^(?:data:|blob:|https?:\/\/)/i.test(file) ? file : staticFile(file);

type BoundaryProps = {
  children: React.ReactNode;
  label: string;
  style: CutStyle;
  /** Fired once per crash so the editor can regenerate the flawed scene. */
  onCrash?: (message: string) => void;
};

class ShotBoundary extends React.Component<BoundaryProps, {message: string | null}> {
  state = {message: null as string | null};

  static getDerivedStateFromError(error: unknown) {
    return {message: error instanceof Error ? error.message : String(error)};
  }

  componentDidCatch(error: unknown) {
    this.props.onCrash?.(error instanceof Error ? error.message : String(error));
  }

  render() {
    if (this.state.message) {
      return (
        <ShotNotice
          label={this.props.label}
          detail={this.state.message}
          style={this.props.style}
        />
      );
    }
    return <>{this.props.children}</>;
  }
}

/** What a shot shows when it has no scene yet, or its scene failed. */
const ShotNotice: React.FC<{label: string; detail?: string; muted?: boolean; style?: CutStyle}> = ({
  label,
  detail,
  muted,
  style = 'paper',
}) => {
  const signal = style === 'signal';
  const dev = style === 'dev';
  const activePalette = paletteFor(style);
  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 1400,
          height: 480,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 18,
          padding: 64,
          backgroundColor: signal || dev ? activePalette.card : muted ? '#ebeae6' : '#19141f',
          border: signal ? 'none' : `3px solid ${dev ? activePalette.border : muted ? '#b8b4ac' : '#ff8f7a'}`,
          borderRadius: dev ? 14 : 24,
          boxShadow: signal || dev ? undefined : `0 5px 0 ${muted ? '#b8b4ac' : '#ff8f7a'}`,
        }}
      >
        <div
          style={{
            fontFamily: dev ? "'Fredoka', sans-serif" : "'IBM Plex Mono', monospace",
            fontSize: 20,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: signal || dev ? activePalette.accent : muted ? '#6a6a78' : '#ff8f7a',
          }}
        >
          {label}
        </div>
        {detail ? (
          <div
            style={{
              fontFamily: dev ? "'Fredoka', sans-serif" : "'IBM Plex Mono', monospace",
              fontSize: 22,
              lineHeight: 1.6,
              color: signal || dev ? activePalette.ink : muted ? '#8a8a99' : '#ff8f7a',
              maxWidth: 1200,
            }}
          >
            {detail}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

/**
 * Compile once per source and palette. A cut re-renders on every timeline
 * drag and every inspector keystroke; recompiling ten scenes through Babel on
 * each of those would make the page unusable.
 */
const cache = new Map<string, {Component: React.ComponentType<Record<string, unknown>>} | {error: string}>();

const compileCached = (code: string, palette: typeof CUT_PALETTE) => {
  const key = `${code}\u0000${palette.ground}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let result: {Component: React.ComponentType<Record<string, unknown>>} | {error: string};
  try {
    result = {Component: compileScene(code, palette).Component};
  } catch (error) {
    result = {error: error instanceof Error ? error.message : 'The shot could not be compiled.'};
  }
  // Bounded so a long editing session cannot grow this without limit.
  if (cache.size > 60) cache.clear();
  cache.set(key, result);
  return result;
};

const boundaryStyle = (
  mode: CutTransitionMode | null,
  phase: 'enter' | 'exit',
  progress: number,
): React.CSSProperties => {
  if (!mode) return {};
  // Every boundary cross-fades fast. The two shots are mounted together across
  // the edit, so these two ramps overlap on screen: the outgoing shot dims out
  // over its exit envelope while the incoming shot brightens in underneath it
  // over its enter envelope. The push carries the fade; the ground below both
  // never breaks.
  const opacity = phase === 'enter' ? progress : 1 - progress;

  if (mode === 'push') {
    // Both halves travel up and both grow. The incoming shot enters at exactly
    // the scale the outgoing one is passing through, so the pair reads as a
    // single continuous push rather than as one move stopping and another
    // starting.
    const grow = 1 - CUT_BOUNDARY.scale;
    const y =
      phase === 'enter'
        ? (1 - progress) * CUT_BOUNDARY.travel
        : -progress * CUT_BOUNDARY.travel;
    const scale =
      phase === 'enter'
        ? CUT_BOUNDARY.scale + grow * progress
        : 1 + grow * progress;
    return {
      transform: `translate3d(0, ${y}px, 0) scale(${scale})`,
      transformOrigin: '50% 50%',
      opacity,
      willChange: 'transform, opacity',
    };
  }

  // No other families exist: mask-based transitions (wipes, scale-masks) were
  // removed because a mask edge reads as a cut artifact next to the fade.
  return {opacity};
};

/**
 * Dev shots read smaller than every other theme's, and the reason is
 * structural: the mandated 1440x810 group is 75% of the frame, and dev is the
 * only style whose camera never moves, so nothing ever magnifies it. Paper,
 * dark, and signal shots all ride cameraDrift up to 1.035 across the shot.
 * This lifts the whole dev stage to 1728x972 inside 1920x1080 — everything
 * 20% larger, with a 96x54px margin still outside it — without touching a
 * line of generated code, so existing shots grow too. Anything authored
 * inside the footprint the prompt requires stays fully on screen.
 */
const DEV_STAGE_SCALE = 1.2;

/**
 * The dev ground: pure black under a dense engineering grid.
 *
 * It is painted once at the cut root rather than per shot, and the reason is
 * layering. A shot's own ground sits outside the transition envelope so the
 * texture cannot swim at a cut — but each shot is its own <Sequence>, and at a
 * boundary two of them are mounted at once. A per-shot ground therefore pops in
 * at full strength on top of the outgoing shot's components for the length of
 * the crossfade. Black on black hid that; a visible grid would not. One layer
 * beneath every Sequence is below the components at every frame, and the dev
 * camera never moves, so a single fixed field is also the correct look.
 */
const DEV_GROUND: React.CSSProperties = {
  backgroundColor: CUT_PALETTE_DEV.ground,
  backgroundImage: patterns.grid({color: '#ffffff', opacity: 0.15, size: 28}),
};

/**
 * The dev register's type, applied at the stage rather than asked for.
 *
 * Every dev word is Fredoka and uppercase. Setting it here means it holds for
 * scenes already saved and for any the model writes without being told, which
 * is the difference between a house style and a suggestion. Exact machine
 * text is the exception and opts out with textTransform: 'none' at the
 * component that draws it (ui.DevTyping and the mono value cells) — a command
 * or a hash is evidence, and shouting it changes what it says.
 */
const DEV_STAGE_TYPE: React.CSSProperties = {
  fontFamily: "'Fredoka', sans-serif",
  textTransform: 'uppercase',
};

const ShotMotion: React.FC<{
  durationInFrames: number;
  enterMode: CutTransitionMode | null;
  exitMode: CutTransitionMode | null;
  cameraMotion?: boolean;
  /** A fixed magnification for a shot whose camera never moves. */
  staticScale?: number;
  isSignal?: boolean;
  /**
   * Whether this shot is held mounted past its end to cross with the next one.
   * The last shot of a cut is not, so its departure has to fit inside its own
   * frames instead of running across the boundary.
   */
  exitCrosses?: boolean;
  /** Dev shots inherit the register's face and casing from the stage. */
  isDev?: boolean;
  children: React.ReactNode;
}> = ({
  durationInFrames,
  enterMode,
  exitMode,
  cameraMotion = true,
  staticScale = 1,
  isSignal = false,
  exitCrosses = true,
  isDev = false,
  children,
}) => {
  const frame = useCurrentFrame();
  // The stage names the face in raw CSS, so nothing else guarantees the
  // stylesheet is present when a scene draws plain divs.
  if (isDev) ensureFont('Fredoka');
  const enter = isSignal ? signalCutEnterProgress(frame) : cutEnterProgress(frame);
  const leave = isSignal
    ? signalCutExitProgress(frame, durationInFrames, exitCrosses)
    : cutExitProgress(frame, durationInFrames, exitCrosses);

  return (
    <AbsoluteFill style={boundaryStyle(exitMode, 'exit', leave)}>
      <AbsoluteFill style={boundaryStyle(enterMode, 'enter', enter)}>
        {/* The player's slow push-in keeps every shot alive across its
            voiceover; scenes never animate their own root. */}
        <AbsoluteFill
          style={{
            transform: `scale(${cameraMotion ? cameraDrift(frame, durationInFrames) : staticScale})`,
            transformOrigin: '50% 50%',
            willChange: 'transform',
            ...(isDev ? DEV_STAGE_TYPE : null),
          }}
        >
          {children}
        </AbsoluteFill>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const ShotFrame: React.FC<{
  shot: CutShot;
  index: number;
  style: CutStyle;
  enterMode: CutTransitionMode | null;
  exitMode: CutTransitionMode | null;
  playAudio: boolean;
  /** Whole-cut voiceover slice for this shot, when the cut voices as one track. */
  voiceoverSlice?: {file: string; startSeconds: number; durationSeconds: number};
  /** Compatibility handoff for older grouped dev scenes without DevGroupMorph. */
  groupFallbackFrom?: CutShot;
  /**
   * The ground the outgoing shot is painting, when it is the same one this
   * shot paints. During the overlap this shot sits on top of its predecessor,
   * so an opaque ground here would hide the departure happening underneath it.
   * Knowing the layer below is an identical, already-opaque ground makes it
   * safe to bring this one in on the same envelope as the content.
   */
  crossfadeGround?: boolean;
  /** False for the shot that closes the cut: it has no successor to cross with. */
  exitCrosses?: boolean;
  onCrash?: (shotId: string, message: string) => void;
}> = ({shot, index, style, enterMode, exitMode, playAudio, voiceoverSlice, groupFallbackFrom, crossfadeGround, exitCrosses, onCrash}) => {
  const frame = useCurrentFrame();
  const label = `Shot ${String(index + 1).padStart(2, '0')}`;
  // Component defaults (rail cards, badges, tiles) read the active palette,
  // so point it at this shot's palette even when the compile was cached.
  setActivePalette(paletteFor(style));

  const body = (() => {
    if (!shot.code.trim()) {
      return <ShotNotice label={label} detail={shot.brief} muted style={style} />;
    }
    const compiled = compileCached(shot.code, paletteFor(style));
    if ('error' in compiled) {
      return <ShotNotice label={label} detail={compiled.error} style={style} />;
    }
    const {Component} = compiled;
    return (
      <ShotBoundary
        label={label}
        style={style}
        onCrash={(message) => onCrash?.(shot.id, message)}
      >
        <Component />
      </ShotBoundary>
    );
  })();

  const fallbackBody = (() => {
    if (!groupFallbackFrom?.code.trim()) return null;
    const compiled = compileCached(groupFallbackFrom.code, paletteFor(style));
    if ('error' in compiled) return null;
    const {Component} = compiled;
    return (
      <ShotDurationProvider
        durationInFrames={groupFallbackFrom.durationInFrames}
        wordTimings={groupFallbackFrom.audio?.words}
      >
        <Freeze frame={Math.max(0, groupFallbackFrom.durationInFrames - 1)}>
          <ShotBoundary label="Previous grouped scene" style={style}>
            <Component />
          </ShotBoundary>
        </Freeze>
      </ShotDurationProvider>
    );
  })();

  const fallbackProgress = fallbackBody
    ? interpolate(frame, [0, 16], [0, 1], {
        easing: Easing.bezier(0.25, 1, 0.5, 1),
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 1;
  const transitionedBody = fallbackBody ? (
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          opacity: 1 - fallbackProgress,
          willChange: 'opacity',
        }}
      >
        {fallbackBody}
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          opacity: fallbackProgress,
          willChange: 'opacity',
        }}
      >
        {body}
      </AbsoluteFill>
    </AbsoluteFill>
  ) : body;

  return (
    <AbsoluteFill>
      {shot.background.mode === 'solid' && style !== 'dev' ? (
        // The ground lives outside the transition so a scene change moves the
        // foreground only; the paper and its tick field stay perfectly still.
        // Dev is the exception: its ground is one layer at the cut root, so a
        // shot must not paint an opaque black over it. See DEV_GROUND.
        <AbsoluteFill
          style={{
            opacity:
              crossfadeGround && enterMode
                ? (style === 'signal'
                    ? signalCutEnterProgress(frame)
                    : cutEnterProgress(frame))
                : 1,
            backgroundColor:
              style === 'signal' ? paletteFor(style).ground : shot.background.color,
            backgroundImage:
              style === 'signal'
                ? // The signal ground is the midnight indigo-to-black gradient,
                  // with the plus field barely a texture behind it.
                  `${patterns.ticks({
                    color: '#ffffff',
                    opacity: 0.07,
                    size: 24,
                    arm: 5,
                    weight: 1,
                  })}, linear-gradient(0deg, #060410 0%, #000000 100%)`
                : patterns.ticks({
                    color: paletteFor(style).ticks,
                    opacity: 0.85,
                    size: 36,
                  }),
            backgroundBlendMode: style === 'signal' ? 'screen' : undefined,
          }}
        />
      ) : null}
      <ShotDurationProvider
        durationInFrames={shot.durationInFrames}
        wordTimings={shot.audio?.words}
      >
        <ShotMotion
          durationInFrames={shot.durationInFrames}
          cameraMotion={style !== 'dev'}
          staticScale={style === 'dev' ? DEV_STAGE_SCALE : 1}
          isDev={style === 'dev'}
          enterMode={enterMode}
          exitMode={exitMode}
          exitCrosses={exitCrosses}
          isSignal={style === 'signal' || style === 'dev'}
        >
          {/* The Sequence runs `overlap` frames past the shot's own end so the
              picture can cross with the next one. Those frames are the shot
              leaving, not the shot continuing, so the content is pinned to its
              settled frame: a scene that reached for a raw interpolate without
              clamping would otherwise keep extrapolating through its own
              departure. */}
          <Freeze
            frame={Math.max(0, shot.durationInFrames - 1)}
            active={(f) => f >= shot.durationInFrames}
          >
            {transitionedBody}
          </Freeze>
        </ShotMotion>
      </ShotDurationProvider>
      {/* Legacy whole-cut documents can still use a per-shot slice when their
          scene metadata is incomplete. New aligned cuts mount one continuous
          track at the cut root below, so audio never has to stop and resume at
          a visual boundary. */}
      {/* The Sequence runs past the shot's own end so the picture can cross
          with the next one; the narration must not. It is pinned to the
          shot's real length here so an extended tail cannot leak audio into
          the following shot. */}
      <Sequence from={0} durationInFrames={Math.max(1, shot.durationInFrames)} layout="none">
      {voiceoverSlice ? (
        <Audio
          src={mediaSource(voiceoverSlice.file)}
          // startFrom/endAt are in frames into the whole track. Mounted inside
          // the shot's own Sequence, so the narration plays at the shot's
          // position on the timeline no matter how the shots are retimed.
          trimBefore={Math.round(voiceoverSlice.startSeconds * CANVAS.fps)}
          trimAfter={Math.round((voiceoverSlice.startSeconds + voiceoverSlice.durationSeconds) * CANVAS.fps)}
        />
      ) : playAudio && shot.audio ? (
        <Audio src={mediaSource(shot.audio.file)} />
      ) : null}
      </Sequence>
    </AbsoluteFill>
  );
};

/** Everything the mounted cut draws from. */
export type CutSnapshot = {
  shots: CutShot[];
  style: CutStyle;
  /** One continuous voiceover file covering the whole cut. */
  voiceover?: {file: string; durationSeconds: number; partDurations: number[]};
  onCrash?: (shotId: string, message: string) => void;
};

/**
 * The cut itself, as a real component with props.
 *
 * It has to be one stable component type, because the Player mounts whatever
 * it is given and React unmounts the whole tree when that type changes. The
 * tree contains the <Audio> tags: a swap tears them down mid-playback, they
 * re-acquire Remotion's shared audio tags from scratch, and the new ones have
 * never seen a user gesture — which is the voiceover going silent or stalling
 * after an edit. Props change on every edit; the type never does.
 */
const CutBody: React.FC<CutSnapshot> = ({shots, style, voiceover, onCrash}) => {
  const options = {voiceover};
  // Continuous voiceover: the whole track stays mounted at the cut root so audio
  // plays completely uninterrupted with ZERO gaps or chopped pauses between sentences.
  // Visual shots lock their startFrame and duration to the voiceover timestamps.
  const useWholeTrack = Boolean(
    options?.voiceover &&
      shots.length &&
      shots.every(
        (shot) =>
          Boolean(shot.audio?.durationSeconds) &&
          shot.audio?.file === options.voiceover?.file &&
          Number.isFinite(shot.sourceStartSeconds) &&
          Number.isFinite(shot.sourceEndSeconds),
      ),
  );
  const playPerShotAudio = !options?.voiceover || !useWholeTrack;
  // Slices for each shot to mount in its own Sequence so audio never drifts
  const voiceoverSlices = options?.voiceover && !useWholeTrack
      ? (() => {
        let cursor = 0;
        return shots.map((shot) => {
          const durationSeconds = shot.audio?.durationSeconds ?? 0;
          const startSeconds =
            Number.isFinite(shot.sourceStartSeconds) && shot.sourceStartSeconds !== undefined
              ? Math.max(0, shot.sourceStartSeconds)
              : cursor;
          const slice =
            durationSeconds > 0
              ? {file: options.voiceover!.file, startSeconds, durationSeconds}
              : undefined;
          cursor = startSeconds + durationSeconds;
          return slice;
        });
      })()
    : null;
  // Grouped continuations deliberately skip the player transition because
  // their next scene continues the prior settled frame without an abrupt cut.
  const isGroupContinuation = (index: number) =>
    index > 0 &&
    shots[index]?.group !== undefined &&
    shots[index - 1]?.group === shots[index]?.group;

  const transitionAt = (index: number) =>
    index > 0 &&
    !isGroupContinuation(index) &&
    shots[index]?.transitionBefore !== false;

  /**
   * Whether this shot hands off to a real successor, as opposed to closing the
   * cut. Only a handoff gets the overlap: there is nothing to cross with at the
   * end, so the last shot's departure has to finish inside its own frames.
   * transitionAt() is deliberately left permissive past the end so the cut
   * still closes on a fade rather than stopping dead.
   */
  const handsOff = (index: number) => index < shots.length - 1 && transitionAt(index + 1);
  return (
    <AbsoluteFill>
      {style === 'dev' ? <AbsoluteFill style={DEV_GROUND} /> : null}
      {useWholeTrack && options?.voiceover ? (
        <Audio src={mediaSource(options.voiceover.file)} />
      ) : null}
      {shots.map((shot, index) => (
        <Sequence
          key={shot.id}
          from={shot.startFrame}
          // A shot that hands off to another stays mounted into it, so its
          // departure is composited over its successor instead of over an
          // empty ground. Without this the two envelopes are back to back and
          // every edit blinks. Scenes are unaffected: they read their length
          // from ShotDurationProvider, which still reports the real one, and
          // every anim() clamps, so the extra frames hold the settled frame.
          durationInFrames={
            Math.max(1, shot.durationInFrames) +
            (handsOff(index) ? CUT_BOUNDARY.overlap : 0)
          }
          // Each shot is its own frame origin, so a scene written for a
          // standalone canvas animates from 0 wherever it sits in the cut.
          layout="none"
        >
          <ShotFrame
            shot={shot}
            index={index}
            style={style}
            playAudio={playPerShotAudio}
            voiceoverSlice={voiceoverSlices?.[index]}
            groupFallbackFrom={
              isGroupContinuation(index) &&
              !/<ui\.DevGroupMorph\b/.test(shot.code)
                ? shots[index - 1]
                : undefined
            }
            onCrash={onCrash}
            crossfadeGround={
              transitionAt(index) &&
              shots[index - 1]?.background.mode === 'solid' &&
              shots[index - 1]?.background.color === shot.background.color
            }
            enterMode={transitionAt(index) ? cutTransitionForBoundary(index - 1) : null}
            exitMode={transitionAt(index + 1) ? cutTransitionForBoundary(index) : null}
            exitCrosses={handsOff(index)}
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

/**
 * Builds the component the Player mounts for a one-off render: the shot list
 * is fixed for the life of the composition, so it can be closed over.
 */
export const makeCutComponent = (
  shots: CutShot[],
  options?: {
    onCrash?: (shotId: string, message: string) => void;
    style?: CutStyle;
    voiceover?: {file: string; durationSeconds: number; partDurations: number[]};
  },
): React.FC => {
  const snapshot: CutSnapshot = {
    shots,
    style: options?.style ?? 'paper',
    voiceover: options?.voiceover,
    onCrash: options?.onCrash,
  };
  const Cut: React.FC = () => <CutBody {...snapshot} />;
  return Cut;
};

/**
 * The editor's cut: one component whose identity survives every edit.
 *
 * Rebuilding the component on each change was remounting the Player's whole
 * tree — see CutBody. The editor pushes new shots into this store instead, and
 * the mounted tree re-renders in place with the voiceover still playing.
 */
export type CutStore = {
  get: () => CutSnapshot;
  set: (next: CutSnapshot) => void;
  subscribe: (listener: () => void) => () => void;
};

const sameSnapshot = (a: CutSnapshot, b: CutSnapshot) =>
  a.shots === b.shots &&
  a.style === b.style &&
  a.voiceover === b.voiceover &&
  a.onCrash === b.onCrash;

export const createCutStore = (initial: CutSnapshot): CutStore => {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => snapshot,
    set: (next) => {
      // getSnapshot has to return a stable reference between real changes or
      // useSyncExternalStore re-renders forever.
      if (sameSnapshot(snapshot, next)) return;
      snapshot = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

export const makeLiveCutComponent = (store: CutStore): React.FC => {
  const LiveCut: React.FC = () => {
    const snapshot = React.useSyncExternalStore(store.subscribe, store.get, store.get);
    if (!snapshot.shots.length) return <EmptyCut />;
    return <CutBody {...snapshot} />;
  };
  return LiveCut;
};

export const EmptyCut: React.FC = () => (
  <AbsoluteFill style={{backgroundColor: '#ebeae6'}}>
    <ShotNotice label="No shots yet" detail="Paste a transcript and plan the cut." muted />
  </AbsoluteFill>
);

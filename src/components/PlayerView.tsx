import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Player, PlayerRef } from '@remotion/player';
import {
  KeyboardIcon,
  MultiplyIcon,
  PauseIcon,
  PlayIcon,
} from './MageIcon';
import type {SelectOption} from './CustomSelect';

/** The compiled scene the Player mounts, plus its canvas settings. */
export interface ScenePreview {
  id: string;
  name: string;
  component: React.ComponentType<any>;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  /** Fingerprint of the scene sources; playback restarts when it changes so
      edits and quick fixes visibly land. */
  contentKey?: string;
}

interface PlayerViewProps {
  graphic: ScenePreview;
  /**
   * Playhead reporting, for a surrounding timeline. Fires on the same
   * throttle as the timecode, not once per painted frame.
   */
  onFrameChange?: (frame: number) => void;
  /**
   * A seek asked for from outside. `token` is what makes a repeat seek to the
   * same frame take effect, so clicking one shot twice still rewinds to it.
   */
  seekSignal?: {frame: number; token: number};
  /** Extra controls rendered next to the transport, e.g. a timeline. */
  footer?: React.ReactNode;
  /**
   * Drops the `max-w-5xl` column the studio page is designed around, so the
   * stage and the transport fill whatever width the host gives them. The
   * frame then grows until it hits the shorter of the two axes, which is what
   * the editor wants once its side panels are folded away.
   */
  wide?: boolean;
  previewUnderlay?: PreviewUnderlay;
  onPreviewUnderlayChange?: (underlay: PreviewUnderlay) => void;
}

export type PreviewUnderlay = 'dark' | 'black' | 'light' | 'grid';

/** ~30Hz. Fast enough that the marker tracks the picture, slow enough that the
    surrounding editor is not re-rendered on every painted frame. */
const FRAME_REPORT_MS = 32;

export const PREVIEW_UNDERLAY_OPTIONS: Array<SelectOption<PreviewUnderlay>> = [
  {value: 'dark', label: 'Dark', hint: '#121211'},
  {value: 'black', label: 'Black', hint: '#000000'},
  {value: 'light', label: 'Light', hint: '#FAFAFA'},
  {value: 'grid', label: 'Grid', hint: 'transp.'},
];

export const PlayerView: React.FC<PlayerViewProps> = ({
  graphic,
  onFrameChange,
  seekSignal,
  footer,
  wide = false,
  previewUnderlay: controlledUnderlay,
  onPreviewUnderlayChange,
}) => {
  const playerRef = useRef<PlayerRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  /** True while playback is supposed to be running (never true when the user paused). */
  const wantsPlayRef = useRef(false);
  /** When the playhead last advanced, so a frozen player can be detected. */
  const lastFrameAdvanceRef = useRef<{frame: number; at: number}>({
    frame: 0,
    at: Date.now(),
  });
  const currentFrameRef = useRef(0);
  /** Last frame handed to React, so the throttle below paces on the clock. */
  const lastReportRef = useRef<{frame: number; at: number}>({frame: -1, at: 0});
  // Held in a ref so a new callback identity never re-subscribes the player.
  const onFrameChangeRef = useRef(onFrameChange);
  onFrameChangeRef.current = onFrameChange;
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isLooping, setIsLooping] = useState(true);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [internalUnderlay, setInternalUnderlay] = useState<PreviewUnderlay>('grid');

  const previewUnderlay = controlledUnderlay ?? internalUnderlay;
  const setPreviewUnderlay = (mode: PreviewUnderlay) => {
    setInternalUnderlay(mode);
    onPreviewUnderlayChange?.(mode);
  };

  const previewBackground = {
    dark: '#151719',
    black: '#000000',
    light: '#d8d4ca',
    grid:
      'repeating-linear-gradient(0deg, transparent 0 31px, rgba(255,255,255,.045) 31px 32px), repeating-linear-gradient(90deg, transparent 0 31px, rgba(255,255,255,.045) 31px 32px), #121211',
  }[previewUnderlay];

  // Track playback state & current frame
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onWaiting = () => setIsBuffering(true);
    const onResume = () => setIsBuffering(false);
    const onFrameUpdate = (e: { detail: { frame: number } }) => {
      const frame = e.detail.frame;
      currentFrameRef.current = frame;
      lastFrameAdvanceRef.current = {frame, at: Date.now()};
      // Throttled on elapsed time, never on the frame number. This used to
      // report only even frames, which reads as ~30Hz right up until the
      // player stops painting every frame: a display that advances the
      // composition two frames at a time can land on odd numbers for a whole
      // run, and then the scrubber and the timeline marker freeze while the
      // picture and the voiceover keep going. A clock cannot lock to a
      // parity. The final frame always reports so the marker finishes at the
      // end of the cut instead of just short of it.
      const now = performance.now();
      const isLastFrame = frame >= graphic.durationInFrames - 1;
      if (frame === lastReportRef.current.frame) return;
      if (!isLastFrame && now - lastReportRef.current.at < FRAME_REPORT_MS) return;
      lastReportRef.current = {frame, at: now};
      setCurrentFrame(frame);
      onFrameChangeRef.current?.(frame);
    };

    player.addEventListener('play', onPlay);
    player.addEventListener('pause', onPause);
    player.addEventListener('waiting', onWaiting);
    player.addEventListener('resume', onResume);
    player.addEventListener('frameupdate', onFrameUpdate);

    return () => {
      player.removeEventListener('play', onPlay);
      player.removeEventListener('pause', onPause);
      player.removeEventListener('waiting', onWaiting);
      player.removeEventListener('resume', onResume);
      player.removeEventListener('frameupdate', onFrameUpdate);
    };
  }, [graphic.id, graphic.durationInFrames]);

  // A different composition starts from the top. Reset without autoplay:
  // starting unmuted media outside a user gesture makes Chromium mute the
  // player, which can leave later voiceovers silent or stalled as well.
  useEffect(() => {
    const restartTimer = window.setTimeout(() => {
      const player = playerRef.current;
      if (!player) return;
      setIsLooping(true);
      player.pause();
      player.seekTo(0);
      wantsPlayRef.current = false;
      currentFrameRef.current = 0;
      lastFrameAdvanceRef.current = {frame: 0, at: Date.now()};
      setCurrentFrame(0);
    }, 180);

    return () => {
      window.clearTimeout(restartTimer);
    };
  }, [graphic.id]);

  // An EDIT is not a new composition. This used to run the reset above on
  // every content change, which is why playback died on each change: a build
  // updates the shots one at a time, so the player was pausing and rewinding
  // to frame 0 every time a scene landed, and the voiceover restarted from
  // nothing with it. The mounted tree now survives an edit (see CutBody in
  // CutHost), so the only thing still needed here is to keep the playhead
  // inside a cut that got shorter.
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const last = Math.max(0, graphic.durationInFrames - 1);
    if (currentFrameRef.current <= last) return;
    player.seekTo(last);
    currentFrameRef.current = last;
    lastFrameAdvanceRef.current = {frame: last, at: Date.now()};
    setCurrentFrame(last);
  }, [graphic.contentKey, graphic.durationInFrames]);

  // Self-healing watchdog: a stalled audio element or a blocked play() can
  // freeze the player with the playhead and the voiceover both stuck. When
  // playback is supposed to be running but the frame has not advanced for a
  // couple of seconds, resync and resume instead of waiting on the user to
  // reload. Never fires while the user has paused.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const player = playerRef.current;
      if (!player || !wantsPlayRef.current) return;
      const {frame, at} = lastFrameAdvanceRef.current;
      if (Date.now() - at < 3500 || frame !== currentFrameRef.current) return;
      // Step past a media boundary that failed to resolve, then resume using
      // the audio context created by the original user play gesture.
      const target = Math.min(graphic.durationInFrames - 1, currentFrameRef.current + 1);
      player.pause();
      player.seekTo(target);
      player.play();
      currentFrameRef.current = target;
      lastFrameAdvanceRef.current = {frame: target, at: Date.now()};
    }, 1000);
    return () => window.clearInterval(timer);
  }, [graphic.durationInFrames]);

  const togglePlay = useCallback((event?: React.SyntheticEvent) => {
    if (!playerRef.current) return;
    if (playerRef.current.isPlaying()) {
      wantsPlayRef.current = false;
      playerRef.current.pause();
    } else {
      wantsPlayRef.current = true;
      // The event matters: Remotion only warms its premounted audio tags when
      // play() receives the user gesture, and without that warmth browsers
      // intermittently block the voiceover under the autoplay policy.
      playerRef.current.play(event);
    }
  }, []);

  const handleSeek = useCallback((frame: number) => {
    if (!playerRef.current) return;
    const target = Math.max(0, Math.min(graphic.durationInFrames - 1, frame));
    playerRef.current.seekTo(target);
    currentFrameRef.current = target;
    setCurrentFrame(target);
  }, [graphic.durationInFrames]);

  const scrubRef = useRef<HTMLDivElement>(null);

  /** Click or drag anywhere on the line to seek; fill is a plain white line. */
  const seekFromClientX = useCallback((clientX: number) => {
    const el = scrubRef.current;
    if (!el || graphic.durationInFrames <= 1) return;
    const bounds = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width));
    handleSeek(Math.round(ratio * (graphic.durationInFrames - 1)));
  }, [graphic.durationInFrames, handleSeek]);

  const scrubFillPercent =
    graphic.durationInFrames > 1
      ? (currentFrame / (graphic.durationInFrames - 1)) * 100
      : 0;

  // An outside seek pauses first: clicking a shot in the timeline is a request
  // to look at it, not to keep rolling past it.
  useEffect(() => {
    if (!seekSignal) return;
    const player = playerRef.current;
    if (!player) return;
    wantsPlayRef.current = false;
    player.pause();
    handleSeek(seekSignal.frame);
  }, [seekSignal?.token, seekSignal?.frame, handleSeek]);

  const handleRestart = useCallback((event?: React.SyntheticEvent) => {
    if (!playerRef.current) return;
    wantsPlayRef.current = true;
    playerRef.current.seekTo(0);
    playerRef.current.play(event);
    currentFrameRef.current = 0;
    setCurrentFrame(0);
  }, []);

  const stepFrame = useCallback((delta: number) => {
    if (!playerRef.current) return;
    const nextFrame = Math.max(
      0,
      Math.min(graphic.durationInFrames - 1, currentFrameRef.current + delta)
    );
    playerRef.current.seekTo(nextFrame);
    currentFrameRef.current = nextFrame;
    setCurrentFrame(nextFrame);
  }, [graphic.durationInFrames]);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  const cyclePlaybackRate = useCallback(() => {
    const rates = [1, 1.25, 1.5, 2];
    const nextIndex = (rates.indexOf(playbackRate) + 1) % rates.length;
    setPlaybackRate(rates[nextIndex]);
  }, [playbackRate]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore shortcut if user is currently typing in an input or textarea
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        if (e.key === 'Escape') {
          target.blur();
        }
        return;
      }

      switch (e.code) {
        case 'Space':
        case 'KeyK':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
        case 'KeyJ':
          e.preventDefault();
          stepFrame(e.shiftKey ? -10 : -1);
          break;
        case 'ArrowRight':
        case 'KeyL':
          e.preventDefault();
          stepFrame(e.shiftKey ? 10 : 1);
          break;
        case 'Home':
        case 'Digit0':
          e.preventDefault();
          handleSeek(0);
          break;
        case 'End':
          e.preventDefault();
          handleSeek(graphic.durationInFrames - 1);
          break;
        case 'KeyR':
          e.preventDefault();
          handleRestart();
          break;
        case 'KeyF':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'Slash':
          if (e.shiftKey) {
            // '?' key
            e.preventDefault();
            setShowShortcuts((prev) => !prev);
          }
          break;
        case 'Escape':
          setShowShortcuts(false);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    togglePlay,
    stepFrame,
    handleSeek,
    handleRestart,
    toggleFullscreen,
    graphic.durationInFrames,
  ]);

  const formatTime = (frame: number, fps: number) => {
    const totalSeconds = frame / fps;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const subSeconds = Math.floor((totalSeconds % 1) * 100);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(subSeconds).padStart(2, '0')}`;
  };

  return (
    <div
      ref={containerRef}
      className="flex-1 h-full flex flex-col justify-between items-center min-w-0 relative"
    >
      {/* Studio gets document metadata here. In the editor the cut toolbar
          already owns that information, so the canvas stays visually quiet. */}
      {!wide ? <div className="w-full flex items-center justify-between px-3 py-1.5 bg-surface mb-2">
        <div className="flex items-center gap-2.5">
          <span className="w-1.5 h-1.5 bg-white" />
          <span className="text-xs font-medium text-white tracking-wide">
            {graphic.name}
          </span>
          <span className="text-[10px] font-mono text-zinc-500 bg-surface-raised px-1.5 py-0.5">
            16:9 • 1920×1080
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div
            role="group"
            aria-label="Preview background"
            title="Preview background"
            className="flex h-7 items-center gap-0.5 bg-[#121211] p-0.5"
          >
            {(['dark', 'black', 'light', 'grid'] as const).map((theme) => (
              <button
                key={theme}
                type="button"
                aria-pressed={previewUnderlay === theme}
                onClick={() => setPreviewUnderlay(theme)}
                className={`flex h-5 items-center gap-1.5 px-2 font-mono text-[9px] uppercase transition-colors ${
                  previewUnderlay === theme
                    ? 'bg-zinc-100 text-zinc-950'
                    : 'text-zinc-400 hover:bg-[#201F1D] hover:text-white'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 ${
                    theme === 'dark'
                      ? 'bg-[#181818]'
                      : theme === 'light'
                        ? 'bg-[#e5e5e5]'
                        : 'bg-[linear-gradient(135deg,#333_25%,#111_25%,#111_50%,#333_50%,#333_75%,#111_75%)] bg-[length:4px_4px]'
                  }`}
                />
                {theme}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowShortcuts(true)}
            title="View Keyboard Shortcuts (?)"
            className="flex items-center gap-1.5 px-2 py-1 bg-surface-raised hover:bg-surface-active text-[10px] font-mono text-zinc-400 hover:text-white transition-colors"
          >
            <KeyboardIcon className="w-3 h-3" />
            <span>Shortcuts</span>
          </button>
          <span className="text-[10px] font-mono text-zinc-500">60 FPS</span>
        </div>
      </div> : null}

      {/* Center 16:9 Video Player Viewport */}
      <div
        className={`flex-1 w-full flex items-center justify-center min-h-0 relative ${
          wide ? '[container-type:size] bg-[#121211] p-4' : ''
        }`}
      >
        <div
          className="flex flex-col items-end gap-2"
          style={{
            width: wide
              ? 'min(calc(100cqw - 32px), calc((100cqh - 32px) * 16 / 9))'
              : '100%',
            maxWidth: wide ? undefined : '64rem',
          }}
        >

          <div
            data-remotion-container
            onClickCapture={togglePlay}
            className={`remotion-canvas-wrapper aspect-video w-full overflow-hidden flex items-center justify-center relative cursor-pointer group ${
              wide ? '' : 'w-full max-w-5xl'
            }`}
            style={{
              background: previewBackground,
            }}
          >
            <Player
              key={graphic.id}
              acknowledgeRemotionLicense
              ref={playerRef}
              component={graphic.component}
              durationInFrames={graphic.durationInFrames}
              compositionWidth={graphic.width}
              compositionHeight={graphic.height}
              fps={graphic.fps}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                backgroundColor: 'transparent',
              }}
              loop={isLooping}
              playbackRate={playbackRate}
              autoPlay={false}
              numberOfSharedAudioTags={8}
              audioLatencyHint="interactive"
              _experimentalKeepAudioContextAlive={wide}
            />
          </div>
        </div>
      </div>

      {/* Editor transport is a single docked strip; Studio keeps the roomier
          two-row deck used on the standalone canvas page. */}
      {/* Editor & Studio Transport Strip */}
      <div
        className={`w-full flex bg-surface ${
          wide
            ? 'h-10 shrink-0 items-center gap-3 px-3'
            : 'mt-1 max-w-5xl items-center gap-3 p-3'
        }`}
      >
        {/* Left Playback Controls: Only Play and Playback Speed Toggle */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={togglePlay}
            title="Play / Pause (Space / K)"
            className="p-1.5 bg-[#2A2928] hover:brightness-125 text-zinc-200 hover:text-white transition-colors border-none outline-none ring-0 shadow-none focus:outline-none"
          >
            {isPlaying ? (
              <PauseIcon className="w-3.5 h-3.5 fill-current" />
            ) : (
              <PlayIcon className="w-3.5 h-3.5 fill-current ml-0.5" />
            )}
          </button>

          <button
            onClick={cyclePlaybackRate}
            className="flex items-center px-2 py-1 bg-surface-raised hover:bg-surface-active text-[11px] font-mono text-zinc-300 transition-colors border-none outline-none ring-0 shadow-none focus:outline-none"
            title="Change playback speed"
          >
            <span>{playbackRate}x</span>
          </button>
        </div>

        {/* Timeline Scrubber */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span className="text-[11px] font-mono text-zinc-400 min-w-14 shrink-0">
            {formatTime(currentFrame, graphic.fps)}
          </span>

          <div
            ref={scrubRef}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              seekFromClientX(event.clientX);
            }}
            onPointerMove={(event) => {
              if (event.buttons & 1) seekFromClientX(event.clientX);
            }}
            title="Seek"
            className="relative flex h-5 flex-1 cursor-ew-resize items-center"
          >
            <div className="relative h-px w-full bg-white/20">
              <div
                className="absolute left-0 top-0 h-full bg-white"
                style={{width: `${scrubFillPercent}%`}}
              />
            </div>
          </div>

          <span className="text-[11px] font-mono text-zinc-500 min-w-14 text-right shrink-0">
            {isBuffering ? 'Buffering…' : formatTime(graphic.durationInFrames, graphic.fps)}
          </span>
        </div>
      </div>

      {footer ? (
        <div className={`w-full mt-1 min-h-0 ${wide ? '' : 'max-w-5xl'}`}>{footer}</div>
      ) : null}

      {/* Keyboard Shortcuts Modal */}
      {showShortcuts && (
        <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-sm bg-[#181716] p-5 space-y-4 select-none">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white uppercase font-mono tracking-wider">
                Keyboard Shortcuts
              </span>
              <button
                onClick={() => setShowShortcuts(false)}
                className="p-1 text-zinc-500 hover:text-white"
              >
                <MultiplyIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs font-mono">
              <div className="flex items-center justify-between py-1">
                <span className="text-zinc-400">Play / Pause</span>
                <kbd className="px-2 py-0.5 bg-[#2A2928] text-white">Space / K</kbd>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-zinc-400">Step 1 Frame</span>
                <kbd className="px-2 py-0.5 bg-[#2A2928] text-white">← / →</kbd>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-zinc-400">Jump 10 Frames</span>
                <kbd className="px-2 py-0.5 bg-[#2A2928] text-white">Shift + ← / →</kbd>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-zinc-400">Restart from Start</span>
                <kbd className="px-2 py-0.5 bg-[#2A2928] text-white">R / Home</kbd>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-zinc-400">Toggle Fullscreen</span>
                <kbd className="px-2 py-0.5 bg-[#2A2928] text-white">F</kbd>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-zinc-400">Close Shortcuts</span>
                <kbd className="px-2 py-0.5 bg-[#2A2928] text-white">Esc</kbd>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

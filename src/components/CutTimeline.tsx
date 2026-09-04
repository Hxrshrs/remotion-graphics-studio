import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {CheckIcon, ExclamationTriangleIcon} from './MageIcon';
import {Spinner} from './AppIcons';
import {CutShot, framesToSeconds} from '../studio/cut';

/**
 * The shot track.
 *
 * Blocks are sized in proportion to their duration, so the track reads as
 * time rather than as a list. Unvoiced blocks can be retimed from the right
 * edge; once a whole-script voice track exists, its scene boundaries are
 * locked to the measured words.
 */

const STATUS_STYLE: Record<CutShot['status'], string> = {
  planned: 'bg-white/[0.06] border-white/10 text-zinc-400',
  generating: 'bg-[#ffcf4a]/15 border-[#ffcf4a]/40 text-[#ffcf4a]',
  ready: 'bg-[#5ea9f6]/15 border-[#5ea9f6]/40 text-zinc-200',
  error: 'bg-[#ff6b6b]/15 border-[#ff6b6b]/40 text-[#ff9c9c]',
};

const StatusMark: React.FC<{status: CutShot['status']}> = ({status}) => {
  if (status === 'generating') return <Spinner className="h-2.5 w-2.5 shrink-0" />;
  if (status === 'error') return <ExclamationTriangleIcon className="h-2.5 w-2.5 shrink-0" />;
  if (status === 'ready') return <CheckIcon className="h-2.5 w-2.5 shrink-0" />;
  return null;
};

/** Frames below this and a block is too narrow to hold a label. */
const MIN_DRAG_FRAMES = 20;

export type TimelineLog = {
  id: string;
  cutId: string;
  time: number;
  level: 'info' | 'success' | 'error';
  message: string;
  shotId?: string;
};

interface CutTimelineProps {
  shots: CutShot[];
  totalFrames: number;
  playheadFrame: number;
  selectedShotId: string | null;
  onSelectShot: (shotId: string) => void;
  onSeek: (frame: number) => void;
  onResizeShot: (shotId: string, durationInFrames: number) => void;
  logs?: TimelineLog[];
}

export const CutTimeline: React.FC<CutTimelineProps> = ({
  shots,
  totalFrames,
  playheadFrame,
  selectedShotId,
  onSelectShot,
  onSeek,
  onResizeShot,
  logs = [],
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{
    shotId: string;
    startX: number;
    startFrames: number;
    framesPerPixel: number;
  } | null>(null);
  // Shown instead of the stored duration while a drag is in flight, so the
  // block follows the pointer without committing a change per mouse move.
  const [dragFrames, setDragFrames] = useState<number | null>(null);
  // Playhead scrub state. A pointer-down anywhere on the track arms a scrub;
  // it only becomes a scrub past a small move threshold so a plain click
  // still selects a shot instead of scrubbing it.
  const [isScrubbing, setIsScrubbing] = useState(false);
  const scrubStateRef = useRef<{startX: number; pointerId: number; didMove: boolean} | null>(null);
  const suppressClickRef = useRef(false);

  const beginDrag = useCallback((event: React.PointerEvent, shot: CutShot) => {
    event.stopPropagation();
    event.preventDefault();
    // A whole-script track owns these boundaries. Letting a drag move one
    // visual past its spoken window would make the next slice overlap it.
    if (shot.audio?.durationIncludesTail) return;
    const track = trackRef.current;
    if (!track || !totalFrames) return;
    setDrag({
      shotId: shot.id,
      startX: event.clientX,
      startFrames: shot.durationInFrames,
      framesPerPixel: totalFrames / track.getBoundingClientRect().width,
    });
    setDragFrames(shot.durationInFrames);
  }, [totalFrames]);

  const endDrag = useCallback(() => {
    if (drag && dragFrames !== null && dragFrames !== drag.startFrames) {
      onResizeShot(drag.shotId, dragFrames);
    }
    setDrag(null);
    setDragFrames(null);
  }, [drag, dragFrames, onResizeShot]);

  useEffect(() => {
    if (!drag) return;
    const onMove = (event: PointerEvent) => {
      const delta = (event.clientX - drag.startX) * drag.framesPerPixel;
      setDragFrames(Math.max(MIN_DRAG_FRAMES, Math.round(drag.startFrames + delta)));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', endDrag);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', endDrag);
    };
  }, [drag, endDrag]);

  const frameFromClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track || !totalFrames) return 0;
      const bounds = track.getBoundingClientRect();
      const ratio = (clientX - bounds.left) / bounds.width;
      return Math.round(Math.max(0, Math.min(1, ratio)) * (totalFrames - 1));
    },
    [totalFrames],
  );

  const seekFromClick = (event: React.MouseEvent) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onSeek(frameFromClientX(event.clientX));
  };

  // Pointer-down on the track arms a scrub. The actual seek happens once the
  // pointer moves past the threshold (see the window listeners below), so a
  // plain click on a shot still just selects it.
  const beginTrackScrub = useCallback((event: React.PointerEvent) => {
    if (drag) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    scrubStateRef.current = {startX: event.clientX, pointerId: event.pointerId, didMove: false};
  }, [drag]);

  // Pointer-down on the playhead handle seeks immediately and scrubs from
  // the first pixel — no threshold, since there is no click to preserve.
  const beginPlayheadScrub = useCallback(
    (event: React.PointerEvent) => {
      event.stopPropagation();
      event.preventDefault();
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (!totalFrames) return;
      scrubStateRef.current = {startX: event.clientX, pointerId: event.pointerId, didMove: true};
      setIsScrubbing(true);
      onSeek(frameFromClientX(event.clientX));
    },
    [frameFromClientX, onSeek, totalFrames],
  );

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const scrub = scrubStateRef.current;
      if (!scrub || event.pointerId !== scrub.pointerId) return;
      if (!scrub.didMove && Math.abs(event.clientX - scrub.startX) < 4) return;
      if (!scrub.didMove) {
        scrub.didMove = true;
        setIsScrubbing(true);
      }
      onSeek(frameFromClientX(event.clientX));
    };
    const onUp = (event: PointerEvent) => {
      const scrub = scrubStateRef.current;
      if (!scrub || event.pointerId !== scrub.pointerId) return;
      scrubStateRef.current = null;
      setIsScrubbing(false);
      // A drag that moved must not fall through to the click handlers: it
      // would re-seek to the down position or re-select the shot the drag
      // started on, undoing the scrub.
      if (scrub.didMove) suppressClickRef.current = true;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [frameFromClientX, onSeek]);

  const latestLog = logs.at(-1);

  const shotBlocks = useMemo(
    () =>
      shots.map((shot, index) => {
        const frames =
          drag?.shotId === shot.id && dragFrames !== null ? dragFrames : shot.durationInFrames;
        const liveTotal =
          drag && dragFrames !== null
            ? totalFrames - drag.startFrames + dragFrames
            : totalFrames;
        const isSelected = shot.id === selectedShotId;
        return (
          <div
            key={shot.id}
            onClick={(event) => {
              event.stopPropagation();
              if (suppressClickRef.current) {
                suppressClickRef.current = false;
                return;
              }
              onSelectShot(shot.id);
            }}
            style={{width: `${(frames / Math.max(1, liveTotal)) * 100}%`}}
            className={`group relative flex min-w-0 flex-col justify-between gap-0.5 overflow-hidden cursor-pointer border px-1.5 py-1 transition-colors select-none ${STATUS_STYLE[shot.status]} ${isSelected ? 'ring-1 ring-white/70' : ''}`}
            title={
              shot.group !== undefined
                ? `Scene ${index + 1} · group ${shot.group}: ${shot.brief || shot.narration}`
                : `Scene ${index + 1}: ${shot.brief || shot.narration}`
            }
          >
            {/* Top row: status, index, duration — nothing else fits 13-up. */}
            <div className="flex w-full min-w-0 items-center justify-between gap-1">
              <div className="flex min-w-0 items-center gap-1 font-mono text-[10px] uppercase tracking-[0.08em] opacity-90">
                <StatusMark status={shot.status} />
                <span className="font-semibold">{String(index + 1).padStart(2, '0')}</span>
              </div>
              <span className="shrink-0 font-mono text-[9px] opacity-70">
                {framesToSeconds(frames).toFixed(1)}s
              </span>
            </div>

            {/* Bottom layer: brief description */}
            <div className="min-w-0 truncate text-[10px] leading-tight text-zinc-500">
              {shot.brief || `Scene ${index + 1}`}
            </div>

            {/* Grouped scenes share one continuous composition: a quiet
                amber foot instead of a pill that collides at 13-up. */}
            {shot.group !== undefined ? (
              <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[2px] bg-[#ffcf4a]/70" />
            ) : null}

            <div
              onPointerDown={(event) => beginDrag(event, shot)}
              title={
                shot.audio?.durationIncludesTail
                  ? "Voice-aligned duration is locked to the script"
                  : "Drag to retime this shot"
              }
              className={
                "absolute right-0 top-0 h-full w-2 bg-white/0 " +
                (shot.audio?.durationIncludesTail
                  ? "cursor-not-allowed"
                  : "cursor-col-resize hover:bg-white/25")
              }
            />
          </div>
        );
      }),
    [
      drag,
      dragFrames,
      beginDrag,
      onSelectShot,
      selectedShotId,
      shots,
      totalFrames,
    ],
  );

  if (!shots.length) {
    return (
      <div className="flex h-[92px] items-center justify-center border-t border-white/[0.07] bg-[#121211] text-[11px] text-zinc-500">
        Add a transcript, then build the cut to create a timeline.
      </div>
    );
  }

  return (
    <div className="border-t border-white/[0.07] bg-[#121211] px-3 pb-3 pt-2">
      <div className="mb-2 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-500">
        <span>Timeline · {shots.length} scenes</span>
        <span className="min-w-0 flex-1 truncate px-3 text-center normal-case tracking-normal text-zinc-500" aria-live="polite">
          {latestLog?.message ?? 'Ready'}
        </span>
        <span>{framesToSeconds(totalFrames).toFixed(1)}s total</span>
      </div>

      <div
        ref={trackRef}
        onClick={seekFromClick}
        onPointerDown={beginTrackScrub}
        className={`relative flex h-[58px] w-full touch-none select-none gap-px overflow-hidden bg-black/50 p-1 ${isScrubbing ? 'cursor-ew-resize' : 'cursor-text'}`}
      >
        {shotBlocks}

        <div
          aria-hidden="true"
          style={{left: `${(playheadFrame / Math.max(1, totalFrames)) * 100}%`}}
          className="pointer-events-none absolute top-0 h-full w-0"
        >
          <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white shadow-[0_0_6px_rgba(255,255,255,0.7)]" />
        </div>
        {/* Draggable playhead handle: a wide invisible hit area with a small
            visible knob, so the 1px line can be grabbed with the cursor. */}
        <div
          role="slider"
          aria-label="Playhead"
          aria-valuemin={0}
          aria-valuemax={Math.max(0, totalFrames - 1)}
          aria-valuenow={playheadFrame}
          aria-orientation="horizontal"
          title="Drag to scrub"
          onPointerDown={beginPlayheadScrub}
          onClick={(event) => {
            event.stopPropagation();
            // Consume the suppress flag set by the drag's pointer-up so the
            // next plain click is not wrongly swallowed.
            if (suppressClickRef.current) suppressClickRef.current = false;
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              event.preventDefault();
              const delta = event.key === 'ArrowLeft' ? -1 : 1;
              onSeek(Math.max(0, Math.min(totalFrames - 1, playheadFrame + delta)));
            } else if (event.key === 'Home') {
              event.preventDefault();
              onSeek(0);
            } else if (event.key === 'End') {
              event.preventDefault();
              onSeek(Math.max(0, totalFrames - 1));
            }
          }}
          tabIndex={0}
          style={{left: `${(playheadFrame / Math.max(1, totalFrames)) * 100}%`}}
          className={`absolute top-0 z-10 h-full w-4 -translate-x-1/2 outline-none ${isScrubbing ? 'cursor-grabbing' : 'cursor-ew-resize'}`}
        >
          <div
            className={`absolute left-1/2 top-0 h-2.5 w-3 -translate-x-1/2 rounded-[2px] bg-white shadow transition-transform ${isScrubbing ? 'scale-110' : 'group-hover:scale-105 hover:scale-110'}`}
          />
        </div>
      </div>
    </div>
  );
};

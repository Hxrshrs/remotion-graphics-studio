import React from 'react';
import {CheckCircleIcon, MultiplyCircleIcon, MultiplyIcon} from './MageIcon';
import {Spinner} from './AppIcons';
import {RenderProgress} from '../studio/renderClient';

/** Live render progress: stage, a progress bar, and the streaming log lines. */
export const RenderLogPanel: React.FC<{
  progress: RenderProgress;
  onClose?: () => void;
  className?: string;
}> = ({progress, onClose, className}) => {
  const done = progress.status === 'done';
  const failed = progress.status === 'error';
  const barColor = failed ? 'bg-[#ff6b6b]' : done ? 'bg-emerald-400' : 'bg-[#ffcf4a]';

  return (
    <div
      className={
        className ??
        'pointer-events-auto fixed bottom-4 right-4 z-[130] w-[340px] overflow-hidden bg-[#181716] border border-[#2A2928]'
      }
    >
      <div className="flex items-center justify-between border-b border-white/[0.055] px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          {failed ? (
            <MultiplyCircleIcon className="h-4 w-4 shrink-0 text-[#ff6b6b]" />
          ) : done ? (
            <CheckCircleIcon className="h-4 w-4 shrink-0 text-emerald-400" />
          ) : (
            <Spinner className="h-4 w-4 shrink-0 text-[#ffcf4a]" />
          )}
          <span className="truncate text-[11px] font-medium text-white">
            {failed ? 'Render failed' : done ? 'Render complete' : 'Rendering'}
          </span>
        </div>
        <button
          onClick={onClose}
          aria-label="Close render log"
          className="p-1 text-zinc-600 hover:bg-white/5 hover:text-white"
        >
          <MultiplyIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="px-3 py-2.5">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="truncate font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-500">
            {progress.stage}
          </span>
          <span className="shrink-0 font-mono text-[10px] text-zinc-500">
            {Math.round(progress.progress)}%
          </span>
        </div>
        <div className="h-1.5 overflow-hidden bg-black/40">
          <div
            className={`h-full transition-[width] duration-500 ${barColor}`}
            style={{width: `${Math.max(2, Math.min(100, progress.progress))}%`}}
          />
        </div>
      </div>

      <div className="max-h-[180px] overflow-y-auto border-t border-white/[0.055] bg-black/20 px-3 py-2">
        {progress.logs.length ? (
          <div className="space-y-1">
            {progress.logs.map((line, index) => (
              <p key={index} className="break-words font-mono text-[9.5px] leading-relaxed text-zinc-500">
                {line}
              </p>
            ))}
          </div>
        ) : (
          <p className="font-mono text-[9.5px] text-zinc-700">Waiting for the server…</p>
        )}
      </div>
    </div>
  );
};
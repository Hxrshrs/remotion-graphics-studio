import React from 'react';
import {CheckCircleIcon} from './MageIcon';
import {RenderIcon, Spinner} from './AppIcons';
import {RenderLogPanel} from './RenderLogPanel';
import type {RenderProgress} from '../studio/renderClient';
import type {RenderResult} from '../studio/renderState';

/**
 * The one header language for the whole app. Studio and the editor render
 * the same shell, the same ghost title, the same meta line, and the same
 * render button — only the middle actions differ per page.
 */

/** Bordered label button: Generate, Render, Download, workflow pill. */
export const headerActionButton =
  'h-7 flex items-center justify-center gap-1.5 border border-white/[0.08] bg-[#201F1D] px-2.5 text-[11px] font-medium text-zinc-200 hover:bg-[#2A2928] hover:text-white transition-colors disabled:cursor-not-allowed disabled:opacity-35';

/** Quiet icon button: the idle render glyph. */
export const headerIconButton =
  'h-7 w-7 flex items-center justify-center p-0 text-zinc-400 hover:text-white disabled:opacity-25 transition-colors bg-transparent border-none outline-none ring-0 shadow-none focus:outline-none';

export const PageHeader: React.FC<{children: React.ReactNode}> = ({children}) => (
  <header className="w-full shrink-0 border-b border-white/[0.07] bg-surface">
    <div className="flex h-12 w-full min-w-0 items-center gap-2.5 px-3">{children}</div>
  </header>
);

/** Ghost title: only the pointer is visible until editing, width fits text. */
export const HeaderTitle: React.FC<{
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}> = ({value, placeholder, onChange}) => (
  <div className="inline-grid max-w-[340px] items-center">
    <span
      aria-hidden="true"
      className="invisible col-start-1 row-start-1 whitespace-pre px-0 text-xs font-medium"
    >
      {value || placeholder}
    </span>
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="col-start-1 row-start-1 w-full min-w-[20px] bg-transparent px-0 py-0 text-xs font-medium text-white border-0 border-none outline-none ring-0 shadow-none focus:outline-none focus:ring-0 focus:border-none focus:shadow-none focus:bg-transparent placeholder:text-zinc-600 hover:text-zinc-200 focus:text-white"
    />
  </div>
);

/** Mono micro line next to the title: subtitle, status, or build progress. */
export const HeaderMeta: React.FC<{children: React.ReactNode; title?: string}> = ({
  children,
  title,
}) => (
  <div
    title={title}
    className="max-w-[240px] truncate font-mono text-[9px] uppercase tracking-[0.1em] text-zinc-500"
  >
    {children}
  </div>
);

type HeaderRenderButtonProps = {
  log?: RenderProgress;
  isRendering: boolean;
  download?: RenderResult;
  disabled: boolean;
  /** Nothing renderable yet (fresh project/cut): hide the idle icon entirely. */
  ready?: boolean;
  onRender: () => void;
  onDownload: () => void;
  onDismissLog: () => void;
  renderTitle: string;
  downloadTitle: string;
};

/** Render → Rendering… → Download, with the streaming log on hover. */
export const HeaderRenderButton: React.FC<HeaderRenderButtonProps> = ({
  log,
  isRendering,
  download,
  disabled,
  ready = true,
  onRender,
  onDownload,
  onDismissLog,
  renderTitle,
  downloadTitle,
}) => {
  if (!log && !isRendering && !download) {
    if (!ready) return null;
    return (
      <button
        onClick={onRender}
        disabled={disabled}
        title={renderTitle}
        className={headerIconButton}
      >
        <RenderIcon className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div className="relative group">
      <button
        onClick={download ? onDownload : onRender}
        disabled={disabled}
        title={download ? downloadTitle : undefined}
        className={headerActionButton}
      >
        {isRendering ? (
          <>
            <Spinner className="h-3.5 w-3.5 text-amber-400" />
            <span className="motion-shimmer font-medium">
              Rendering… {log ? `${Math.round(log.progress)}%` : ''}
            </span>
          </>
        ) : download ? (
          <>
            <CheckCircleIcon className="h-3.5 w-3.5 text-emerald-400" />
            <span>Download</span>
          </>
        ) : (
          <>
            <RenderIcon className="h-3.5 w-3.5" />
            <span>Render</span>
          </>
        )}
      </button>

      {log && (
        <div className="absolute right-0 top-full z-50 mt-1 hidden w-[340px] border border-white/[0.08] bg-[#181716] shadow-none group-hover:block pointer-events-auto">
          <RenderLogPanel
            progress={log}
            onClose={onDismissLog}
            className="w-full overflow-hidden bg-[#181716]"
          />
        </div>
      )}
    </div>
  );
};

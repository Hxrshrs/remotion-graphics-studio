import React from 'react';
import {Sparkle} from './Sparkle';

/**
 * Shared chrome for every chat surface: ghost buttons, metadata labels, and
 * the thinking row. Studio and the editor render the same pieces so the two
 * panels never drift apart again.
 */

/** Quiet square button for copy / restore / dismiss actions on messages. */
export const GhostIconButton: React.FC<{
  title: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}> = ({title, onClick, disabled = false, className = '', children}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    aria-label={title}
    className={`grid h-7 w-7 shrink-0 place-items-center text-zinc-500 transition-colors hover:bg-[#201F1D] hover:text-white disabled:opacity-25 ${className}`}
  >
    {children}
  </button>
);

/** Mono micro metadata: model, time, cost, state. Uppercase by convention. */
export const MetaLabel: React.FC<{children: React.ReactNode}> = ({children}) => (
  <div className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.08em] text-zinc-600">
    {children}
  </div>
);

/** Thinking row: breathing mark, shimmer label, bouncing square dots. */
export const ThinkingIndicator: React.FC<{label: string}> = ({label}) => (
  <div className="rise flex items-center gap-2.5 border border-white/[0.08] bg-[#121211] px-3 py-2.5">
    <Sparkle className="h-3.5 w-3.5 animate-pulse text-zinc-300" />
    <span className="motion-shimmer text-xs font-medium">{label}</span>
    <span className="ml-auto flex items-center gap-1" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="think-dot h-1 w-1 bg-zinc-400"
          style={{animationDelay: `${index * 0.22}s`}}
        />
      ))}
    </span>
  </div>
);

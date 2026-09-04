import React from 'react';
import {Sparkle} from './Sparkle';

/**
 * The one shared set of quick actions for every AI chat surface. Studio and
 * the editor render the same list with the same look; only the send target
 * differs (studio submits a direction, the editor quick-fixes a scene).
 */
export const QUICK_PROMPT_SHORTCUTS = [
  'Fix contrast',
  'Make it faster',
  'Simplify layout',
  'Punchier typography',
  'Smooth animation',
] as const;

export const STUDIO_BUILD_SHORTCUTS = [
  'Lower third with speaker name',
  'Stat callout with trend graph',
  'Side-by-side comparison',
  'Timeline roadmap with milestones',
  'Kinetic typography title',
] as const;

type QuickActionsProps = {
  onSend: (prompt: string) => void;
  disabled?: boolean;
  asRow?: boolean;
  className?: string;
};

export const QuickActions: React.FC<QuickActionsProps> = ({
  onSend,
  disabled = false,
  asRow = false,
  className = '',
}) => (
  <div
    className={
      className ||
      (asRow
        ? 'flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none'
        : 'flex flex-col gap-1.5 w-full')
    }
  >
    {QUICK_PROMPT_SHORTCUTS.map((promptText) => (
      <button
        key={promptText}
        type="button"
        onClick={() => {
          if (disabled) return;
          onSend(promptText);
        }}
        disabled={disabled}
        title={`Send: "${promptText}"`}
        className={`inline-flex items-center gap-1.5 border border-white/[0.08] bg-[#121211] px-2.5 py-1.5 text-[11px] text-zinc-400 hover:border-white/20 hover:bg-[#201F1D] hover:text-white transition-colors disabled:opacity-40 ${
          asRow ? 'shrink-0 whitespace-nowrap text-[10px] px-2 py-1' : 'w-full text-left'
        }`}
      >
        <Sparkle className="h-2.5 w-2.5 shrink-0 text-zinc-500" />
        <span>{promptText}</span>
      </button>
    ))}
  </div>
);

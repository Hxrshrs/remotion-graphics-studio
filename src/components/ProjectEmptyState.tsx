import React from 'react';

/**
 * What a page shows before its project has anything in it.
 *
 * Deliberately static: no aurora, no fade-in, no shimmer. This is the first
 * thing a new user reads, and it is a set of instructions — motion competes
 * with reading them, and the page it sits on is a video canvas where anything
 * that moves reads as playback.
 *
 * The steps are numbered because the order matters; the copy stays in plain
 * words, naming the button the user is looking for rather than describing a
 * concept.
 */
export const ProjectEmptyState: React.FC<{
  /** Micro-label above the title, e.g. the kind of project this is. */
  label: string;
  title: string;
  description: string;
  steps: Array<{title: string; detail: string}>;
  /** Optional single button, for the step the user should take first. */
  action?: {label: string; onClick: () => void; icon?: React.ReactNode};
  /** One quiet line under everything, for a caveat or a shortcut. */
  footnote?: string;
}> = ({label, title, description, steps, action, footnote}) => (
  <div className="flex h-full w-full items-center justify-center overflow-y-auto p-6">
    <div className="w-full max-w-[420px]">
      <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-500">
        {label}
      </div>
      <h2 className="mt-1.5 text-[15px] font-medium leading-snug tracking-tight text-zinc-100">
        {title}
      </h2>
      <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">{description}</p>

      <ol className="mt-4 border border-white/[0.07] bg-[#121211]">
        {steps.map((step, index) => (
          <li
            key={step.title}
            className={`flex gap-2.5 px-3 py-2.5 ${
              index > 0 ? 'border-t border-white/[0.06]' : ''
            }`}
          >
            <span className="mt-px font-mono text-[10px] text-zinc-600">{index + 1}</span>
            <span className="min-w-0">
              <span className="block text-[11px] font-medium text-zinc-200">{step.title}</span>
              <span className="mt-0.5 block text-[11px] leading-relaxed text-zinc-500">
                {step.detail}
              </span>
            </span>
          </li>
        ))}
      </ol>

      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-3 flex w-full items-center justify-center gap-1.5 border border-white/[0.08] bg-[#201F1D] py-2 text-[11px] font-medium text-zinc-200 hover:border-white/20 hover:text-white"
        >
          {action.icon}
          <span>{action.label}</span>
        </button>
      ) : null}

      {footnote ? (
        <p className="mt-3 text-[10px] leading-relaxed text-zinc-600">{footnote}</p>
      ) : null}
    </div>
  </div>
);

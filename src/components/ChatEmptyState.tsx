import React from 'react';
import {Sparkle} from './Sparkle';

/**
 * The welcome a chat panel shows before its first message. Centered mark,
 * greeting, and one action row, under a faint blue aurora falling from the
 * top edge. Static gradient only — no motion, no glow spill.
 */
export const ChatEmptyState: React.FC<{
  title: string;
  description: string;
  children?: React.ReactNode;
}> = ({title, description, children}) => (
  <div className="relative flex min-h-full flex-col items-center justify-start overflow-hidden px-4 pb-8 pt-10 text-center">
    {/* Lean, smooth aurora curtain */}
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-40 overflow-hidden">
      {/* Precision hairline light line at the top */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/30 to-transparent" />

      {/* Primary sky-blue ethereal ribbon */}
      <div className="aurora-drift absolute -top-16 left-[5%] h-32 w-[85%] bg-[radial-gradient(ellipse_75%_55%_at_50%_0%,rgba(56,189,248,0.15),rgba(37,99,235,0.05)_50%,transparent_100%)] blur-3xl" />

      {/* Secondary soft indigo/blue depth curtain */}
      <div className="aurora-drift-rev absolute -top-12 right-[5%] h-28 w-[70%] bg-[radial-gradient(ellipse_65%_45%_at_55%_0%,rgba(129,140,248,0.11),rgba(41,159,255,0.04)_55%,transparent_100%)] blur-3xl" />
    </div>

    <div className="relative grid h-9 w-9 place-items-center bg-[#201F1D] text-zinc-200">
      <Sparkle className="h-4 w-4" />
    </div>
    <div className="relative mt-3 text-[14px] font-medium leading-snug tracking-tight text-zinc-100">
      {title}
    </div>
    <p className="relative mt-1 max-w-[280px] text-[11px] leading-relaxed text-zinc-500">
      {description}
    </p>
    {children ? <div className="relative mt-3.5 w-full">{children}</div> : null}
  </div>
);

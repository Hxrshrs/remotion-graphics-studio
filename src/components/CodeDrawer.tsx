import React, {useEffect, useMemo, useState} from 'react';
import {CheckIcon, ClockIcon, ExclamationTriangleIcon, NoteTextIcon, RefreshIcon} from './MageIcon';
import {FONT_NAMES} from '../studio/fonts';
import {CopyButton} from './CopyButton';

type CodeDrawerProps = {
  code: string;
  durationInFrames: number;
  compileError: string | null;
  onApply: (code: string, durationInFrames: number) => void;
};

/**
 * Hand-editing for the scene the assistant wrote. Changes are staged locally
 * and applied deliberately, so a half-typed expression never blanks the canvas.
 */
export const CodeDrawer: React.FC<CodeDrawerProps> = ({
  code,
  durationInFrames,
  compileError,
  onApply,
}) => {
  const [draft, setDraft] = useState(code);
  const [duration, setDuration] = useState(String(durationInFrames));
  const [showFonts, setShowFonts] = useState(false);

  useEffect(() => setDraft(code), [code]);
  useEffect(() => setDuration(String(durationInFrames)), [durationInFrames]);

  const parsedDuration = Number(duration);
  const durationValid =
    Number.isFinite(parsedDuration) && parsedDuration >= 30 && parsedDuration <= 3600;
  const dirty = draft !== code || (durationValid && parsedDuration !== durationInFrames);

  const seconds = useMemo(
    () => (durationValid ? (parsedDuration / 60).toFixed(2) : '—'),
    [durationValid, parsedDuration],
  );

  const apply = () => {
    if (!durationValid) return;
    onApply(draft, parsedDuration);
  };

  return (
    <div className="flex h-full min-h-0 flex-col p-3.5 pt-2">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.13em] text-zinc-500">
          Scene source
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowFonts((open) => !open)}
            title="Available Google Fonts"
            className={`p-1.5 transition-colors ${showFonts ? 'bg-white/10 text-white' : 'text-zinc-600 hover:bg-white/5 hover:text-white'}`}
          >
            <NoteTextIcon className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => {
              setDraft(code);
              setDuration(String(durationInFrames));
            }}
            disabled={!dirty}
            title="Discard edits"
            className="p-1.5 text-zinc-600 hover:bg-white/5 hover:text-white disabled:opacity-25"
          >
            <RefreshIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {showFonts && (
        <div className="mb-2 max-h-40 overflow-y-auto bg-[#121211] p-2.5">
          <p className="mb-2 text-[10px] leading-relaxed text-zinc-600">
            Use <span className="font-mono text-zinc-400">font('Name')</span> as a{' '}
            <span className="font-mono text-zinc-400">fontFamily</span>. Any other Google
            Fonts family works by name too, at weight 400.
          </p>
          <div className="flex flex-wrap gap-1">
            {FONT_NAMES.map((name) => (
              <button
                key={name}
                onClick={() => navigator.clipboard?.writeText(`font('${name}')`)}
                title="Copy font() call"
                className="bg-white/[0.045] px-1.5 py-1 font-mono text-[9px] text-zinc-500 hover:bg-white/10 hover:text-white"
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      )}

      {compileError && (
        <div className="mb-2 flex items-start gap-2 bg-red-500/[0.07] px-3 py-2.5 text-[10px] leading-relaxed text-red-300">
          <ExclamationTriangleIcon className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="min-w-0 flex-1 font-mono break-words">{compileError}</span>
          <CopyButton value={compileError} title="Copy error" />
        </div>
      )}

      <textarea
        value={draft}
        spellCheck={false}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            apply();
          }
          if (event.key === 'Tab') {
            event.preventDefault();
            const target = event.currentTarget;
            const {selectionStart, selectionEnd, value} = target;
            const next = `${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`;
            setDraft(next);
            requestAnimationFrame(() => {
              target.selectionStart = target.selectionEnd = selectionStart + 2;
            });
          }
        }}
        className="min-h-0 flex-1 resize-none bg-[#121211] p-3 font-mono text-[10.5px] leading-[1.65] text-zinc-300 selection:bg-[#ffcf4a]/25"
      />

      <div className="mt-2 flex items-center gap-2">
        <div className="flex items-center gap-1.5 bg-[#121211] px-2.5 py-2">
          <ClockIcon className="h-3 w-3 text-zinc-600" />
          <input
            value={duration}
            onChange={(event) => setDuration(event.target.value.replace(/[^\d]/g, ''))}
            className={`w-9 bg-transparent text-center font-mono text-[11px] ${durationValid ? 'text-white' : 'text-red-400'}`}
          />
          <span className="font-mono text-[9px] text-zinc-600">f · {seconds}s</span>
        </div>
        <button
          onClick={apply}
          disabled={!dirty || !durationValid}
          className="flex flex-1 items-center justify-center gap-1.5 bg-[#2A2928] py-2 text-[11px] font-medium text-zinc-200 hover:brightness-125 hover:text-white disabled:bg-[#181716] disabled:text-zinc-600 transition-colors"
        >
          <CheckIcon className="h-3.5 w-3.5" />
          {dirty ? 'Apply to canvas' : 'On canvas'}
        </button>
      </div>
    </div>
  );
};

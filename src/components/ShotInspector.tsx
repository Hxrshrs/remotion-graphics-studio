import React, {useEffect, useState} from 'react';
import {ExclamationTriangleIcon, FileIcon} from './MageIcon';
import {GenerateIcon, Spinner} from './AppIcons';
import {CodeDrawer} from './CodeDrawer';
import {CopyButton} from './CopyButton';
import {
  CutShot,
  DEFAULT_GROUND,
  DEFAULT_GROUND_DARK,
} from '../studio/cut';
import {Sparkle} from './Sparkle';

const GROUND_SWATCHES = [
  DEFAULT_GROUND,
  '#f4f1e8',
  '#d5d3ca',
  DEFAULT_GROUND_DARK,
  '#24211d',
  '#ffffff',
];

interface ShotInspectorProps {
  shot: CutShot;
  index: number;
  narration: string;
  isBusy: boolean;
  onChangeBrief: (brief: string) => void;
  onChangeBackground: (background: CutShot['background']) => void;
  onChangeDuration: (durationInFrames: number) => void;
  onChangeCode: (code: string) => void;
  onRegenerate: () => void;
}

export const ShotInspector: React.FC<ShotInspectorProps> = ({
  shot,
  index,
  narration,
  isBusy,
  onChangeBrief,
  onChangeBackground,
  onChangeDuration,
  onChangeCode,
  onRegenerate,
}) => {
  const [tab, setTab] = useState<'brief' | 'code'>('brief');
  const [briefDraft, setBriefDraft] = useState(shot.brief);

  useEffect(() => {
    setBriefDraft(shot.brief);
  }, [shot.id, shot.brief]);

  const commitBrief = () => {
    if (briefDraft.trim() && briefDraft !== shot.brief) onChangeBrief(briefDraft.trim());
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3.5 pt-3 pb-1">
        <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-500">
          Scene {String(index + 1).padStart(2, '0')}
        </div>
        <div className="flex items-center gap-1">
          {(['brief', 'code'] as const).map((name) => (
            <button
              key={name}
              onClick={() => setTab(name)}
              title={name === 'brief' ? 'Brief' : 'Code'}
              aria-label={name === 'brief' ? 'Brief' : 'Code'}
              className={`p-1.5 transition-colors ${
                tab === name ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-white'
              }`}
            >
              {name === 'brief' ? <Sparkle className="h-3.5 w-3.5" /> : <FileIcon className="h-3.5 w-3.5" />}
            </button>
          ))}
        </div>
      </div>

      {tab === 'code' ? (
        <div className="min-h-0 flex-1">
          <CodeDrawer
            code={shot.code}
            durationInFrames={shot.durationInFrames}
            compileError={shot.status === 'error' ? shot.error ?? null : null}
            onApply={(code, durationInFrames) => {
              onChangeCode(code);
              if (durationInFrames !== shot.durationInFrames) onChangeDuration(durationInFrames);
            }}
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3.5 py-3">
          {shot.fallbackReason ? (
            <div className="flex items-start gap-2 bg-[#ffcf4a]/10 p-2.5 text-[11px] leading-relaxed text-[#ffcf4a]">
              <ExclamationTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1">
                Showing a plain card — the graphic could not be generated.
                <span className="mt-1 block break-words text-[#ffcf4a]/70">
                  {shot.fallbackReason}
                </span>
              </span>
              <CopyButton value={shot.fallbackReason} title="Copy error" />
            </div>
          ) : null}

          {shot.status === 'error' && shot.error ? (
            <div className="flex items-start gap-2 bg-[#ff6b6b]/10 p-2.5 text-[11px] leading-relaxed text-[#ff9c9c]">
              <ExclamationTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1 break-words">{shot.error}</span>
              <CopyButton value={shot.error} title="Copy error" />
            </div>
          ) : null}

          <div>
            <div className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-500">
              Narration
            </div>
            <p className="border border-white/[0.06] bg-black/25 p-2.5 text-[11px] leading-relaxed text-zinc-300">
              {narration || '—'}
            </p>
          </div>

          <div>
            <div className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-500">
              What this shot shows
            </div>
            <textarea
              value={briefDraft}
              onChange={(event) => setBriefDraft(event.target.value)}
              onBlur={commitBrief}
              rows={5}
              className="w-full resize-none border border-white/[0.08] bg-[#121211] p-2.5 text-[11px] leading-relaxed text-zinc-100 outline-none ring-0 shadow-none focus:outline-none focus:ring-0 focus:border-white/20"
            />
          </div>

          <div>
            <div className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-500">
              Background
            </div>
            <div className="flex gap-1.5">
              {(['solid', 'transparent'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => onChangeBackground({...shot.background, mode})}
                  className={`flex-1 px-2 py-2 text-[10px] transition-colors ${
                    shot.background.mode === mode
                      ? 'bg-[#2A2928] text-white'
                      : 'bg-[#181716] text-zinc-400 hover:bg-[#201F1D]'
                  }`}
                >
                  {mode === 'solid' ? 'Solid' : 'Over footage'}
                </button>
              ))}
            </div>
            {shot.background.mode === 'solid' ? (
              <div className="mt-2 flex items-center gap-1.5">
                {GROUND_SWATCHES.map((swatch) => (
                  <button
                    key={swatch}
                    onClick={() => onChangeBackground({mode: 'solid', color: swatch})}
                    title={swatch}
                    style={{background: swatch}}
                    className={`h-6 w-6 border transition-transform ${
                      shot.background.color.toLowerCase() === swatch.toLowerCase()
                        ? 'scale-110 border-white'
                        : 'border-white/15'
                    }`}
                  />
                ))}
                <input
                  type="color"
                  value={shot.background.color}
                  onChange={(event) =>
                    onChangeBackground({mode: 'solid', color: event.target.value})
                  }
                  title="Custom ground"
                  className="h-6 w-9 cursor-pointer border border-white/15 bg-transparent"
                />
                <span className="ml-auto font-mono text-[10px] text-zinc-600">
                  {shot.background.color}
                </span>
              </div>
            ) : null}
          </div>

          <button
            onClick={() => {
              commitBrief();
              onRegenerate();
            }}
            disabled={isBusy}
            className="flex w-full items-center justify-center gap-1.5 bg-[#2A2928] px-3 py-2 text-[11px] font-medium text-zinc-200 transition-colors hover:brightness-125 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
          >
            {isBusy ? (
              <Spinner className="h-4 w-4" />
            ) : (
              <GenerateIcon className="h-4 w-4" />
            )}
            {shot.code ? 'Regenerate shot' : 'Generate shot'}
          </button>
        </div>
      )}
    </div>
  );
};

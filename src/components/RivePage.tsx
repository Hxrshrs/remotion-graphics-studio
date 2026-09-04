import React, {useMemo, useRef, useState} from 'react';
import {Layout, Fit, Alignment, useRive} from '@rive-app/react-webgl2';
import {PauseIcon, PlayIcon, UploadIcon} from './MageIcon';
import {PageHeader, HeaderTitle} from './PageHeader';
import {RiveProject} from '../studio/rive';

type Props = {
  project: RiveProject;
  onChange: (project: RiveProject) => void;
};

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const RiveCanvas: React.FC<{project: RiveProject; onError: (message: string) => void}> = ({
  project,
  onError,
}) => {
  const params = useMemo(
    () => ({
      src: project.src,
      autoplay: project.autoplay,
      autoBind: true,
      artboard: project.artboard.trim() || undefined,
      stateMachine: project.stateMachine.trim() || undefined,
      layout: new Layout({fit: Fit.Contain, alignment: Alignment.Center}),
      onLoadError: (error: unknown) =>
        onError(error instanceof Error ? error.message : 'This Rive file could not be loaded.'),
    }),
    [project.artboard, project.autoplay, project.src, project.stateMachine, onError],
  );
  const {rive, RiveComponent} = useRive(params);

  return (
    <div className="relative h-full w-full">
      <RiveComponent className="h-full w-full" aria-label={`${project.name} interactive Rive preview`} />
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 border border-white/10 bg-[#161514]/90 p-1 shadow-xl backdrop-blur">
        <button type="button" onClick={() => rive?.play()} title="Play" className="grid h-7 w-7 place-items-center text-zinc-400 hover:bg-white/10 hover:text-white">
          <PlayIcon className="h-3 w-3" />
        </button>
        <button type="button" onClick={() => rive?.pause()} title="Pause" className="grid h-7 w-7 place-items-center text-zinc-400 hover:bg-white/10 hover:text-white">
          <PauseIcon className="h-3 w-3" />
        </button>
        <button type="button" onClick={() => rive?.reset()} title="Restart" className="h-7 px-2 font-mono text-[10px] text-zinc-400 hover:bg-white/10 hover:text-white">
          Restart
        </button>
      </div>
    </div>
  );
};

export const RivePage: React.FC<Props> = ({project, onChange}) => {
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const update = (patch: Partial<RiveProject>) =>
    onChange({...project, ...patch, updatedAt: Date.now()});

  const upload = (file?: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.riv')) {
      setError('Choose a .riv file exported from the Rive editor.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('This file is over 20 MB. Host it publicly and paste its URL instead.');
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setError('The browser could not read this file.');
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      setError(null);
      update({src: reader.result});
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#121211]">
      <PageHeader>
        <HeaderTitle
          value={project.name}
          placeholder="Untitled Rive"
          onChange={(name) => update({name})}
        />
        <div className="min-w-0 flex-1" />
        <span className="border border-[#299FFF]/25 bg-[#299FFF]/10 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-[#70bcff]">
          Interactive
        </span>
      </PageHeader>

      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 p-5">
          <div className="h-full overflow-hidden border border-white/[0.08] bg-[#0b0b0b] shadow-2xl">
            {project.src ? (
              <RiveCanvas key={`${project.src}|${project.artboard}|${project.stateMachine}`} project={project} onError={(message) => setError(message)} />
            ) : (
              <button type="button" onClick={() => fileInput.current?.click()} className="flex h-full w-full flex-col items-center justify-center gap-3 text-zinc-500 hover:bg-white/[0.015] hover:text-zinc-300">
                <span className="grid h-12 w-12 place-items-center border border-dashed border-white/15">
                  <UploadIcon className="h-5 w-5" />
                </span>
                <span className="text-sm text-zinc-300">Drop in an exported Rive file</span>
                <span className="max-w-sm text-center text-[11px] leading-relaxed">Pointer, hover, and state-machine interactions run directly in this browser preview.</span>
              </button>
            )}
          </div>
        </main>

        <aside className="w-[330px] shrink-0 overflow-y-auto border-l border-white/[0.07] bg-surface p-4 2xl:w-[370px]">
          <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-500">Rive source</div>
          <input ref={fileInput} type="file" accept=".riv,application/octet-stream" className="hidden" onChange={(event) => upload(event.target.files?.[0])} />
          <button type="button" onClick={() => fileInput.current?.click()} className="mt-2 flex h-9 w-full items-center justify-center gap-2 border border-white/10 bg-surface-raised text-[11px] text-zinc-300 hover:border-white/20 hover:text-white">
            <UploadIcon className="h-3.5 w-3.5" /> Upload .riv file
          </button>

          <label className="mt-4 block text-[10px] text-zinc-400">Public URL or /asset.riv</label>
          <input value={project.src.startsWith('data:') ? '' : project.src} onChange={(event) => { setError(null); update({src: event.target.value}); }} placeholder="https://…/animation.riv" className="mt-1 h-8 w-full border border-white/10 bg-[#111110] px-2 text-[11px] text-zinc-200 outline-none focus:border-white/25" />
          {project.src.startsWith('data:') ? <p className="mt-1.5 text-[10px] text-zinc-500">Uploaded file stored locally in this browser.</p> : null}

          <div className="mt-5 border-t border-white/[0.07] pt-4">
            <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-500">Playback</div>
            <label className="mt-3 block text-[10px] text-zinc-400">Artboard <span className="text-zinc-600">(optional)</span></label>
            <input value={project.artboard} onChange={(event) => update({artboard: event.target.value})} placeholder="First artboard" className="mt-1 h-8 w-full border border-white/10 bg-[#111110] px-2 text-[11px] text-zinc-200 outline-none focus:border-white/25" />
            <label className="mt-3 block text-[10px] text-zinc-400">State machine <span className="text-zinc-600">(optional)</span></label>
            <input value={project.stateMachine} onChange={(event) => update({stateMachine: event.target.value})} placeholder="State Machine 1" className="mt-1 h-8 w-full border border-white/10 bg-[#111110] px-2 text-[11px] text-zinc-200 outline-none focus:border-white/25" />
            <label className="mt-3 flex items-center justify-between text-[11px] text-zinc-300">
              Autoplay
              <input type="checkbox" checked={project.autoplay} onChange={(event) => update({autoplay: event.target.checked})} className="accent-[#299FFF]" />
            </label>
          </div>

          {error ? <div className="mt-4 border border-red-400/20 bg-red-400/[0.06] p-2.5 text-[11px] leading-relaxed text-red-300">{error}</div> : null}

          <div className="mt-5 border-t border-white/[0.07] pt-4 text-[10px] leading-relaxed text-zinc-500">
            Build visuals, state machines, and Luau scripts in Rive, export a <span className="text-zinc-300">.riv</span> file, then test the interaction here. The web runtime plays the file; it does not compile React or Luau into one.
            <a href="https://rive.app/docs/scripting/getting-started" target="_blank" rel="noreferrer" className="mt-2 block text-[#70bcff] hover:text-white">Open Rive scripting docs ↗</a>
          </div>
        </aside>
      </div>
    </div>
  );
};

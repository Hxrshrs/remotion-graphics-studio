import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Layout, Fit, Alignment, useRive} from '@rive-app/react-webgl2';
import {CopyIcon, PauseIcon, PlayIcon, PlusIcon, SendIcon, SettingsIcon, TrashIcon, UploadIcon} from './MageIcon';
import {PageHeader, HeaderTitle} from './PageHeader';
import {RiveProject} from '../studio/rive';
import {StudioSettings} from '../studio/types';
import {requestRiveHelp, validateRiveAssistantReply} from '../studio/riveAssistant';
import {ModelPicker} from './ModelPicker';
import {SpendMap} from '../studio/spend';
import {Spinner} from './AppIcons';
import {useCodexAuth} from '../studio/codex';

type Props = {
  project: RiveProject;
  onChange: (project: RiveProject) => void;
  settings: StudioSettings;
  spend: SpendMap;
  onModelChange: (model: string) => void;
  onOpenSettings: () => void;
  onRecordSpend: (model: string, cost: number | null) => void;
  onCreateProject: () => void;
  onDeleteProject: () => void;
};

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

class RivePreviewBoundary extends React.Component<
  {children: React.ReactNode; onError: (message: string) => void},
  {failed: boolean}
> {
  state = {failed: false};

  static getDerivedStateFromError() {
    return {failed: true};
  }

  componentDidCatch(error: unknown) {
    this.props.onError(
      error instanceof Error ? error.message : 'The Rive preview stopped unexpectedly.',
    );
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="flex h-full items-center justify-center p-8 text-center text-[11px] text-red-300">
          This Rive file could not be displayed. Check the file, artboard, and state-machine names.
        </div>
      );
    }
    return this.props.children;
  }
}

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

export const RivePage: React.FC<Props> = ({project, onChange, settings, spend, onModelChange, onOpenSettings, onRecordSpend, onCreateProject, onDeleteProject}) => {
  const fileInput = useRef<HTMLInputElement>(null);
  const chatBottom = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<'chat' | 'configure'>('chat');
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const {auth: codexAuth} = useCodexAuth();

  const update = (patch: Partial<RiveProject>) =>
    onChange({...project, ...patch, updatedAt: Date.now()});

  useEffect(() => {
    // Some embedded browsers return a Promise from scrollIntoView(). Never
    // return that value from an effect: React would treat it as a cleanup
    // function and crash when this page unmounts.
    chatBottom.current?.scrollIntoView({behavior: 'smooth'});
  }, [project.messages, thinking]);

  const send = async () => {
    const instruction = draft.trim();
    if (!instruction || thinking) return;
    const userMessage = {id: `rive-message-${Date.now()}`, role: 'user' as const, content: instruction, createdAt: Date.now()};
    const history = (project.messages ?? []).slice(-8).map(({role, content}) => ({role, content}));
    update({messages: [...(project.messages ?? []), userMessage]});
    setDraft('');
    setThinking(true);
    try {
      const reply = await requestRiveHelp({settings, instruction, history, project});
      onRecordSpend(settings.selectedModel, reply.cost);
      onChange({
        ...project,
        messages: [...(project.messages ?? []), userMessage, {id: `rive-reply-${Date.now()}`, role: 'assistant', content: reply.text, createdAt: Date.now(), model: settings.selectedModel, costUsd: reply.cost ?? undefined}],
        updatedAt: Date.now(),
      });
    } catch (caught) {
      onChange({
        ...project,
        messages: [...(project.messages ?? []), userMessage, {id: `rive-error-${Date.now()}`, role: 'assistant', content: caught instanceof Error ? caught.message : 'The Rive assistant failed.', createdAt: Date.now(), isError: true}],
        updatedAt: Date.now(),
      });
    } finally {
      setThinking(false);
    }
  };

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
        <button type="button" onClick={onCreateProject} className="flex h-7 items-center gap-1.5 border border-white/10 bg-surface-raised px-2.5 text-[10px] text-zinc-300 hover:border-white/20 hover:text-white" title="Create another Rive project">
          <PlusIcon className="h-3 w-3" /> New project
        </button>
        <button type="button" onClick={onDeleteProject} className="flex h-7 items-center gap-1.5 border border-white/10 px-2.5 text-[10px] text-zinc-500 hover:border-red-400/30 hover:bg-red-400/[0.06] hover:text-red-300" title="Delete this Rive project">
          <TrashIcon className="h-3 w-3" /> Delete
        </button>
        <span className="border border-[#299FFF]/25 bg-[#299FFF]/10 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-[#70bcff]">
          Interactive
        </span>
      </PageHeader>

      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 p-5">
          <div className="h-full overflow-hidden border border-white/[0.08] bg-[#0b0b0b] shadow-2xl">
            {project.src ? (
              <RivePreviewBoundary
                key={`${project.src}|${project.artboard}|${project.stateMachine}`}
                onError={setError}
              >
                <RiveCanvas project={project} onError={setError} />
              </RivePreviewBoundary>
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

        <aside className="flex w-[330px] shrink-0 flex-col overflow-hidden border-l border-white/[0.07] bg-surface 2xl:w-[370px]">
          <div className="flex h-11 shrink-0 items-center gap-1 border-b border-white/[0.07] px-3">
            <button onClick={() => setPanel('chat')} className={`px-2.5 py-1 text-[11px] ${panel === 'chat' ? 'bg-[#2A2928] text-white' : 'text-zinc-500 hover:text-white'}`}>Assistant</button>
            <button onClick={() => setPanel('configure')} className={`px-2.5 py-1 text-[11px] ${panel === 'configure' ? 'bg-[#2A2928] text-white' : 'text-zinc-500 hover:text-white'}`}>Configure</button>
            <div className="flex-1" />
            <button onClick={onOpenSettings} title="Settings" className="p-1.5 text-zinc-500 hover:bg-[#201F1D] hover:text-white"><SettingsIcon className="h-3.5 w-3.5" /></button>
          </div>

          {panel === 'chat' ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto p-3.5">
                {!project.messages?.length ? (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#70bcff]">Rive assistant</div>
                    <h2 className="mt-2 text-sm text-white">Design the interaction</h2>
                    <p className="mt-2 max-w-[250px] text-[11px] leading-relaxed text-zinc-500">Ask for state-machine structure, data binding, or Luau code to paste into the Rive editor.</p>
                    <div className="mt-4 flex w-full flex-col gap-1.5">
                      {['Design a hover interaction', 'Plan a button state machine', 'Make this responsive with layouts'].map((prompt) => (
                        <button key={prompt} onClick={() => setDraft(prompt)} className="border border-white/[0.08] bg-[#121211] px-2.5 py-2 text-left text-[11px] text-zinc-400 hover:border-white/20 hover:text-white">{prompt}</button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {project.messages.map((message) => {
                      const invalidRiveApis =
                        message.role === 'assistant' && !message.isError
                          ? validateRiveAssistantReply(message.content)
                          : [];
                      return (
                        <div key={message.id} className={message.role === 'user' ? 'flex justify-end' : ''}>
                          <div className={`${message.role === 'user' ? 'max-w-[92%] bg-[#201F1D] px-3 py-2.5 text-zinc-200' : message.isError || invalidRiveApis.length ? 'text-red-300' : 'text-zinc-300'} whitespace-pre-wrap text-[11px] leading-relaxed`}>
                            {invalidRiveApis.length ? (
                              <div className="mb-2 border border-red-400/20 bg-red-400/[0.06] p-2 text-[10px]">
                                This older reply uses unsupported Rive APIs and should not be pasted into the editor.
                              </div>
                            ) : null}
                            {message.content}
                            {message.role === 'assistant' && !message.isError && !invalidRiveApis.length ? <button onClick={() => navigator.clipboard.writeText(message.content)} title="Copy response" className="ml-2 inline-flex align-middle text-zinc-600 hover:text-white"><CopyIcon className="h-3 w-3" /></button> : null}
                          </div>
                        </div>
                      );
                    })}
                    {thinking ? <div className="flex items-center gap-2 text-[11px] text-zinc-500"><Spinner className="h-3.5 w-3.5 text-[#70bcff]" /> Writing Rive guidance…</div> : null}
                    <div ref={chatBottom} />
                  </div>
                )}
              </div>
              <div className="p-3">
                <div className="border border-white/[0.08] bg-[#121211] p-2 focus-within:border-white/20">
                  <textarea rows={2} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="Ask about this Rive interaction…" className="block max-h-32 w-full resize-none bg-transparent px-1 py-1 text-xs text-white outline-none placeholder:text-zinc-600" />
                  <div className="mt-1 flex items-center justify-between">
                    <ModelPicker models={settings.modelSlugs} value={settings.selectedModel} onChange={onModelChange} readyProviders={{openrouter: Boolean(settings.apiKey.trim()), google: Boolean(settings.googleApiKey.trim()), openlux: Boolean(settings.openluxApiKey.trim()), codex: codexAuth.status === 'authenticated'}} openLuxApiKey={settings.openluxApiKey} spend={spend} />
                    <button onClick={() => void send()} disabled={!draft.trim() || thinking} className="grid h-7 w-7 place-items-center bg-[#2A2928] text-[#299FFF] hover:text-white disabled:bg-transparent disabled:text-zinc-600">{thinking ? <Spinner className="h-3.5 w-3.5" /> : <SendIcon className="h-3.5 w-3.5" />}</button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
          <div className="overflow-y-auto p-4">
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
          </div>
          )}
        </aside>
      </div>
    </div>
  );
};

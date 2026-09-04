import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {FileIcon} from './components/MageIcon';
import {PanelCollapseIcon, PanelExpandIcon} from './components/AppIcons';
import {CustomSelect} from './components/CustomSelect';
import {AiAssistant} from './components/AiAssistant';
import {ModelPicker} from './components/ModelPicker';
import {COMPOSER_CHIP, PromptComposer} from './components/PromptComposer';
import {EditorPage} from './components/EditorPage';
import {CodeDrawer} from './components/CodeDrawer';
import {PlayerView, PreviewUnderlay, PREVIEW_UNDERLAY_OPTIONS} from './components/PlayerView';
import {cutHasContent, nextUntitledName, projectHasContent} from './studio/activity';
import {useCodexAuth} from './studio/codex';
import {PageHeader, HeaderTitle, HeaderRenderButton} from './components/PageHeader';
import {Sparkle} from './components/Sparkle';
import {SettingsModal} from './components/SettingsModal';
import {StudioSidebar} from './components/StudioSidebar';
import {RivePage} from './components/RivePage';
import {EmptyScene, makeSceneComponent} from './remotion/SceneHost';
import {STARTER_DURATION, STARTER_SCENE} from './remotion/starter';
import {SceneCompileError, compileScene} from './studio/compile';
import {
  EditPatchError,
  FullRewriteBlockedError,
  InvalidSceneReplyError,
  MissingKeyError,
  hasKeyForModel,
  requestScene,
} from './studio/assistant';
import {providerForModel} from './studio/models';
import {modelSupportsImages, useOpenRouterCatalog} from './studio/catalog';
import {CANVAS} from './studio/prompt';
import {
  loadActiveProjectId,
  loadProjects,
  loadProjectsDurable,
  loadSettings,
  loadSettingsDurable,
  loadCuts,
  loadActiveCutId,
  loadActiveRiveId,
  loadRiveProjects,
  loadRiveProjectsDurable,
  makeId,
  saveActiveProjectId,
  saveActiveRiveId,
  saveProjects,
  saveRiveProjects,
  saveSettings,
} from './studio/storage';
import {Cut, newCut, withVoiceDefaults} from './studio/cut';
import {newRiveProject, riveHasContent, RiveProject} from './studio/rive';
import {SpendMap, loadSpend, recordSpend, saveSpend} from './studio/spend';
import {runRenderWithLogs, RenderProgress} from './studio/renderClient';
import {
  RenderResult,
  downloadRenderedFile,
  releaseRenderedFile,
  renderButtonState,
  renderSignature,
} from './studio/renderState';
import {Attachment, StudioMessage, StudioProject, StudioSettings} from './studio/types';
import {formatValidationError, formatValidationNotes, validateSceneSource} from './studio/validation';

const newProject = (name: string): StudioProject => {
  const now = Date.now();
  return {
    id: makeId('project'),
    name,
    code: STARTER_SCENE,
    durationInFrames: STARTER_DURATION,
    messages: [],
    savedGraphics: [],
    createdAt: now,
    updatedAt: now,
  };
};

/** Cheap stable id for a scene, so the Player remounts when the source changes. */
const hashCode = (value: string) => {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36);
};

const MAX_AUTO_FIX_ATTEMPTS = 3;
/** Retries for a reply in the wrong shape, or an edit whose blocks missed. */
const MAX_REPLY_RETRIES = 2;
const stableSceneRestoredMessage =
  'I could not produce a runnable revision after automatic repair, so I kept the last working scene. Try the request again or make the change smaller.';

type AskAssistantOptions = {
  repairError?: string;
  images?: Attachment[];
  currentCode?: string;
  autoFix?: boolean;
  /** Override the picker's model for this one request (e.g. the cheap
      quick-fix model). */
  model?: string;
  projectId?: string;
};

type AutoFixState = {
  attempts: number;
  instruction: string;
  images: Attachment[];
  baseCode: string;
  baseDurationInFrames: number;
};

const initialProjects = () => {
  const stored = loadProjects();
  if (!stored.length) return [newProject(nextUntitledName('Untitled motion', []))];
  // Projects saved by the old prop-editing studio carry no scene source.
  return stored.map((project) => ({
    ...project,
    code: typeof project.code === 'string' ? project.code : STARTER_SCENE,
    durationInFrames: Number(project.durationInFrames) || STARTER_DURATION,
    savedGraphics: (project.savedGraphics ?? []).filter(
      (saved) => typeof saved.code === 'string',
    ),
    messages: project.messages ?? [],
  }));
};

export const App: React.FC = () => {
  const [projects, setProjects] = useState<StudioProject[]>(initialProjects);
  /** False until the durable IndexedDB copy has been read, so a save cannot
      overwrite it with a stale localStorage mirror first. */
  const [projectsReady, setProjectsReady] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState(
    () => loadActiveProjectId() ?? projects[0].id,
  );
  const [settings, setSettings] = useState<StudioSettings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [inspector, setInspector] = useState<'ai' | 'code'>('ai');
  // The studio builds one graphic; the editor builds a whole cut from a
  // transcript. They share the sidebar, the settings, and the spend ledger.
  const [page, setPage] = useState<'studio' | 'editor' | 'rive'>(() => {
    try {
      const saved = localStorage.getItem('rendr_active_page');
      if (saved === 'editor' || saved === 'studio' || saved === 'rive') return saved;
    } catch {}
    return 'studio';
  });

  useEffect(() => {
    try {
      localStorage.setItem('rendr_active_page', page);
    } catch {}
  }, [page]);
  const [previewUnderlay, setPreviewUnderlay] = useState<PreviewUnderlay>(() => {
    try {
      const saved = localStorage.getItem('rendr_preview_underlay');
      if (saved === 'dark' || saved === 'black' || saved === 'light' || saved === 'grid') return saved;
    } catch {}
    return 'dark';
  });

  const handlePreviewUnderlayChange = useCallback((mode: PreviewUnderlay) => {
    setPreviewUnderlay(mode);
    try {
      localStorage.setItem('rendr_preview_underlay', mode);
    } catch {}
  }, []);
  const [thinkingProjects, setThinkingProjects] = useState<string[]>([]);
  /** What the untouched-project prompt box holds before the first direction. */
  const [studioDraft, setStudioDraft] = useState('');
  const [studioImages, setStudioImages] = useState<Attachment[]>([]);
  const {auth: codexAuth} = useCodexAuth();
  const [assistantOpen, setAssistantOpen] = useState(true);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [spend, setSpend] = useState<SpendMap>(loadSpend);
  const catalog = useOpenRouterCatalog(
    providerForModel(settings.selectedModel) === 'openrouter',
  );
  const supportsImages = modelSupportsImages(catalog, settings.selectedModel);
  const [undoSnapshots, setUndoSnapshots] = useState<
    Record<string, {code: string; durationInFrames: number}>
  >({});

  const activeProject =
    projects.find((project) => project.id === activeProjectId) ?? projects[0];

  const projectRef = useRef(activeProject);
  projectRef.current = activeProject;
  const undoRef = useRef(undoSnapshots);
  undoRef.current = undoSnapshots;
  const handledRuntimeErrorRef = useRef<string | null>(null);
  const autoFixStateRef = useRef<Record<string, AutoFixState>>({});
  const autoFixInFlightRef = useRef<Set<string>>(new Set());

  const askAssistantRef = useRef<
    ((instruction: string, options?: AskAssistantOptions) => Promise<void>) | null
  >(null);
  // Render state is per project, never global. One shared flag meant a render
  // started in one project reported "Done" on every other project's button,
  // offering a file that belongs to a different graphic.
  const [renderingProjectId, setRenderingProjectId] = useState<string | null>(null);
  const [renderLogs, setRenderLogs] = useState<Record<string, RenderProgress>>({});
  /**
   * The finished file for a project, tagged with what was rendered.
   *
   * `signature` is the code and duration the file was made from, so an edit
   * after the render takes the button back to Render — offering "Download" for
   * a file that no longer matches the canvas is the same lie in slower motion.
   */
  const [renderResults, setRenderResults] = useState<Record<string, RenderResult>>({});

  type DeletedToastItem =
    | {
        type: 'project';
        project: StudioProject;
        index: number;
      }
    | {
        type: 'cut';
        cut: Cut;
        index: number;
      };

  type ActiveUndoToast = DeletedToastItem & {key: number};

  const [undoToast, setUndoToast] = useState<ActiveUndoToast | null>(null);
  const [undoSecondsLeft, setUndoSecondsLeft] = useState(7);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearUndoTimers = useCallback(() => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    if (undoIntervalRef.current) {
      clearInterval(undoIntervalRef.current);
      undoIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearUndoTimers();
    };
  }, [clearUndoTimers]);

  const triggerUndoToast = useCallback((item: DeletedToastItem) => {
    clearUndoTimers();
    setUndoSecondsLeft(7);
    setUndoToast({
      ...item,
      key: Date.now(),
    });

    const startTime = Date.now();
    const duration = 7000;

    undoIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, Math.ceil((duration - elapsed) / 1000));
      setUndoSecondsLeft(remaining);
      if (remaining <= 0) {
        clearUndoTimers();
        setUndoToast(null);
      }
    }, 200);

    undoTimerRef.current = setTimeout(() => {
      clearUndoTimers();
      setUndoToast(null);
    }, duration);
  }, [clearUndoTimers]);

  const handleUndoDelete = useCallback(() => {
    if (!undoToast) return;
    if (undoToast.type === 'project') {
      const {project, index} = undoToast;
      setProjects((prev) => {
        const next = prev.filter((p) => p.id !== project.id);
        // A new project may have reused the deleted name; only rename on collision.
        const restored = next.some((p) => p.name === project.name)
          ? {...project, name: nextUntitledName(project.name, next.map((p) => p.name))}
          : project;
        const targetIndex = Math.min(Math.max(0, index), next.length);
        next.splice(targetIndex, 0, restored);
        return next;
      });
      setActiveProjectId(project.id);
    } else if (undoToast.type === 'cut') {
      const {cut, index} = undoToast;
      setCuts((prev) => {
        const next = prev.filter((c) => c.id !== cut.id);
        const restored = next.some((c) => c.name === cut.name)
          ? {...cut, name: nextUntitledName(cut.name, next.map((c) => c.name))}
          : cut;
        const targetIndex = Math.min(Math.max(0, index), next.length);
        next.splice(targetIndex, 0, restored);
        return next;
      });
      setActiveCutId(cut.id);
    }
    clearUndoTimers();
    setUndoToast(null);
  }, [undoToast, clearUndoTimers]);

  const dismissUndoToast = useCallback(() => {
    clearUndoTimers();
    setUndoToast(null);
  }, [clearUndoTimers]);

  useEffect(() => {
    if (!projectsReady) return;
    const saveTimer = window.setTimeout(() => saveProjects(projects), 200);
    return () => window.clearTimeout(saveTimer);
  }, [projects, projectsReady]);

  // The durable IndexedDB copy outranks the localStorage mirror, so generated
  // scenes survive a quota-full mirror write that used to wipe them silently.
  useEffect(() => {
    let live = true;
    loadProjectsDurable()
      .then((stored) => {
        if (!live || !stored?.length) return;
        setProjects((current) => {
          const currentLatest = current.reduce(
            (max, project) => Math.max(max, project.updatedAt),
            0,
          );
          const storedLatest = stored.reduce(
            (max, project) => Math.max(max, project.updatedAt),
            0,
          );
          return storedLatest > currentLatest ? stored : current;
        });
      })
      .finally(() => {
        if (live) setProjectsReady(true);
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => saveActiveProjectId(activeProject.id), [activeProject.id]);
  useEffect(() => saveSettings(settings), [settings]);

  // Durable backup of the chosen model: if localStorage was reset or was
  // never writable, adopt the IndexedDB copy on load so the last selection
  // survives a refresh.
  useEffect(() => {
    let live = true;
    loadSettingsDurable()
      .then((model) => {
        if (!live || !model) return;
        setSettings((current) =>
          current.selectedModel === model ? current : {...current, selectedModel: model},
        );
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  // A project switch clears the previous scene error. Edits clear it when they
  // successfully reach the canvas, while a failed render keeps it visible.
  useEffect(() => {
    setRuntimeError(null);
    handledRuntimeErrorRef.current = null;
  }, [activeProject.id]);

  const compiled = useMemo(() => {
    if (!activeProject.code.trim()) {
      return {Component: EmptyScene, error: null as string | null};
    }
    try {
      return {Component: compileScene(activeProject.code).Component, error: null};
    } catch (error) {
      return {
        Component: EmptyScene,
        error:
          error instanceof Error ? error.message : 'The scene could not be compiled.',
      };
    }
  }, [activeProject.code]);

  const restoreToStableScene = (
    projectId: string,
    brokenCode: string,
    errorMessage: string,
  ) => {
    const state = autoFixStateRef.current[projectId];
    const snapshot = undoRef.current[projectId];
    const fallback = state
      ? {code: state.baseCode, durationInFrames: state.baseDurationInFrames}
      : snapshot ?? {code: STARTER_SCENE, durationInFrames: STARTER_DURATION};

    console.error('Automatic scene repair failed:', errorMessage);
    setRuntimeError(stableSceneRestoredMessage);
    updateProject(projectId, (current) => {
      // Do not overwrite a newer edit that arrived while the broken scene was
      // being repaired.
      if (current.code !== brokenCode) return current;
      return {
        ...current,
        code: fallback.code,
        durationInFrames: fallback.durationInFrames,
        messages: [
          ...current.messages,
          {
            id: makeId('message'),
            role: 'assistant',
            content: stableSceneRestoredMessage,
            createdAt: Date.now(),
            isError: true,
          },
        ],
        updatedAt: Date.now(),
      };
    });
    setUndoSnapshots((current) => {
      const next = {...current};
      delete next[projectId];
      return next;
    });
  };

  const handleRuntimeError = useCallback((message: string) => {
    const project = projectRef.current;
    const snapshot = undoRef.current[project.id];
    const existingState = autoFixStateRef.current[project.id];
    const state = existingState ?? {
      attempts: 0,
      instruction: 'The scene on the canvas is broken. Fix it and keep the design intact.',
      images: [],
      baseCode: snapshot?.code ?? STARTER_SCENE,
      baseDurationInFrames: snapshot?.durationInFrames ?? STARTER_DURATION,
    };
    autoFixStateRef.current[project.id] = state;
    const errorKey = `${project.id}:${project.code}:${message}`;
    if (handledRuntimeErrorRef.current === errorKey) return;
    handledRuntimeErrorRef.current = errorKey;

    setRuntimeError(message);
    if (
      state.attempts < MAX_AUTO_FIX_ATTEMPTS &&
      askAssistantRef.current &&
      !autoFixInFlightRef.current.has(project.id)
    ) {
      autoFixInFlightRef.current.add(project.id);
      const brokenCode = project.code;
      window.setTimeout(() => {
        void askAssistantRef.current?.(state.instruction, {
          repairError: message,
          currentCode: brokenCode,
          images: state.images,
          autoFix: true,
          projectId: project.id,
        }).finally(() => {
          autoFixInFlightRef.current.delete(project.id);
        });
      }, 0);
      return;
    }

    restoreToStableScene(project.id, project.code, message);
  }, []);

  const scene = useMemo(
    () => ({
      id: `${activeProject.id}-${hashCode(activeProject.code)}`,
      name: activeProject.name,
      component: makeSceneComponent(compiled.Component, handleRuntimeError),
      durationInFrames: activeProject.durationInFrames,
      fps: CANVAS.fps,
      width: CANVAS.width,
      height: CANVAS.height,
    }),
    [
      activeProject.id,
      activeProject.name,
      activeProject.code,
      activeProject.durationInFrames,
      compiled.Component,
      handleRuntimeError,
    ],
  );

  const sceneError = compiled.error ?? runtimeError;

  const updateProject = (
    projectId: string,
    update: (project: StudioProject) => StudioProject,
  ) => {
    setProjects((current) =>
      current.map((project) => (project.id === projectId ? update(project) : project)),
    );
  };

  const updateActive = (update: (project: StudioProject) => StudioProject) =>
    updateProject(activeProject.id, update);

  const createProject = () => {
    // Spamming New on an untouched draft must not mint numbered empties:
    // reuse the active project while it has no content yet.
    if (!projectHasContent(activeProject)) {
      setInspector('ai');
      setAssistantOpen(true);
      return;
    }
    const project = newProject(
      nextUntitledName(
        'Untitled motion',
        projects.map((item) => item.name),
      ),
    );
    setProjects((current) => [...current, project]);
    setActiveProjectId(project.id);
    setInspector('ai');
    setAssistantOpen(true);
  };

  const deleteProject = (projectId: string) => {
    const projectIndex = projects.findIndex((item) => item.id === projectId);
    if (projectIndex === -1) return;
    const project = projects[projectIndex];

    const remaining = projects.filter((item) => item.id !== projectId);
    if (!remaining.length) {
      const replacement = newProject(nextUntitledName('Untitled motion', []));
      setProjects([replacement]);
      setActiveProjectId(replacement.id);
    } else {
      setProjects(remaining);
      if (activeProject.id === projectId) setActiveProjectId(remaining[0].id);
    }

    triggerUndoToast({
      type: 'project',
      project,
      index: projectIndex,
    });
  };

  /** Render the project at 1080p60 in the browser and download the MP4. */
  const renderProject = async () => {
    // Every step below is pinned to the project the click came from. The
    // active project can change while a render runs, and the result must
    // still land on the graphic it was made from.
    const project = activeProject;
    if (thinkingProjects.includes(project.id) || renderingProjectId) return;
    const signature = renderSignature(project);
    const fileName = `${
      project.name.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() ||
      'motion-graphic'
    }.mp4`;
    setRenderingProjectId(project.id);
    setRenderResults((current) => {
      if (!current[project.id]) return current;
      releaseRenderedFile(current[project.id]);
      const {[project.id]: _replaced, ...rest} = current;
      return rest;
    });
    try {
      const result = await runRenderWithLogs(
        {
          kind: 'scene',
          code: project.code,
          durationInFrames: project.durationInFrames,
        },
        (progress) =>
          setRenderLogs((current) => ({
            ...current,
            [project.id]: {...progress, logs: [...progress.logs]},
          })),
      );
      if (result.status === 'error') {
        throw new Error(result.error ?? 'The render failed.');
      }
      if (!result.url) {
        throw new Error('The render finished without producing a file.');
      }
      setRenderResults((current) => ({
        ...current,
        [project.id]: {url: result.url as string, fileName, signature},
      }));
      downloadRenderedFile(result.url, fileName);
    } catch (error) {
      appendMessage(project.id, {
        id: makeId('message'),
        role: 'assistant',
        content: error instanceof Error ? `Render failed: ${error.message}` : 'Render failed.',
        createdAt: Date.now(),
        isError: true,
      });
    } finally {
      setRenderingProjectId((current) => (current === project.id ? null : current));
    }
  };

  const applyScene = (code: string, durationInFrames: number) => {
    try {
      compileScene(code);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'The scene could not be compiled.';
      setRuntimeError(message);
      appendMessage(activeProject.id, {
        id: makeId('message'),
        role: 'assistant',
        content: `Scene update rejected: ${message}\nThe last working scene is still on the canvas.`,
        createdAt: Date.now(),
        isError: true,
      });
      return;
    }
    autoFixStateRef.current[activeProject.id] = {
      attempts: 0,
      instruction: 'The scene on the canvas is broken. Fix it and keep the design intact.',
      images: [],
      baseCode: activeProject.code,
      baseDurationInFrames: activeProject.durationInFrames,
    };
    setRuntimeError(null);
    handledRuntimeErrorRef.current = null;
    setUndoSnapshots((current) => ({
      ...current,
      [activeProject.id]: {
        code: activeProject.code,
        durationInFrames: activeProject.durationInFrames,
      },
    }));
    updateActive((project) => ({
      ...project,
      code,
      durationInFrames,
      updatedAt: Date.now(),
    }));
  };

  const restoreSaved = (savedId: string) => {
    const saved = activeProject.savedGraphics.find((item) => item.id === savedId);
    if (!saved) return;
    applyScene(saved.code, saved.durationInFrames);
  };

  const deleteSaved = (savedId: string) => {
    const saved = activeProject.savedGraphics.find((item) => item.id === savedId);
    if (!saved) return;
    updateActive((project) => ({
      ...project,
      savedGraphics: project.savedGraphics.filter((item) => item.id !== savedId),
      updatedAt: Date.now(),
    }));
  };

  const restoreFromMessage = (messageId: string) => {
    const message = activeProject.messages.find((item) => item.id === messageId);
    if (!message?.code) return;
    applyScene(message.code, message.durationInFrames ?? activeProject.durationInFrames);
  };

  const appendMessage = (projectId: string, message: StudioMessage) => {
    updateProject(projectId, (project) => ({
      ...project,
      messages: [...project.messages, message],
      updatedAt: Date.now(),
    }));
  };
  /** Validate and compile a generated scene before it reaches the canvas. */
  const preflightCandidate = async ({
    code,
    instruction,
    history,
  }: {
    code: string;
    durationInFrames: number;
    instruction: string;
    history: Array<{role: 'user' | 'assistant'; content: string}>;
  }): Promise<string[]> => {
    const {issues, notes} = validateSceneSource({code, instruction, history});
    if (issues.length) throw new SceneCompileError(formatValidationError(issues));
    compileScene(code);
    return notes;
  };

  const askAssistant = async (
    instruction: string,
    options?: AskAssistantOptions & {projectId?: string},
  ) => {
    // Capture this once so the attribution and every retry reflect the model
    // that actually handled the direction, even if the picker changes while
    // the request is in flight.
    const modelUsed = options?.model ?? settings.selectedModel;
    const images = options?.images ?? [];
    const projectId = options?.projectId ?? activeProjectId;
    const project = projects.find((p) => p.id === projectId) ?? projectRef.current;
    const isAutoFix = Boolean(options?.autoFix && options.repairError);
    const isNewPrompt = !options?.repairError;
    const existingState = autoFixStateRef.current[projectId];
    const snapshot = undoRef.current[projectId];

    if (isNewPrompt || !existingState || !isAutoFix) {
      autoFixStateRef.current[projectId] = {
        attempts: 0,
        instruction,
        images: images.length ? images : existingState?.images ?? [],
        baseCode: existingState?.baseCode ?? snapshot?.code ?? project.code,
        baseDurationInFrames:
          existingState?.baseDurationInFrames ??
          snapshot?.durationInFrames ??
          project.durationInFrames,
      };
    }
    const autoFixState = autoFixStateRef.current[projectId];
    const codeForRequest = options?.currentCode ?? project.code;
    const isUntouchedStarter =
      isNewPrompt &&
      project.messages.length === 0 &&
      codeForRequest.trim() === STARTER_SCENE.trim();
    const sceneCodeForRequest = isUntouchedStarter ? undefined : codeForRequest;
    // Only meaningful alongside a scene: on an empty canvas the model picks the
    // length with nothing to preserve.
    const sceneDurationForRequest = sceneCodeForRequest
      ? project.durationInFrames
      : undefined;

    if (isNewPrompt) {
      appendMessage(projectId, {
        id: makeId('message'),
        role: 'user',
        content: instruction,
        createdAt: Date.now(),
        // Only the thumbnail is persisted; the full image goes to the model
        // but would exhaust the localStorage quota if kept in the transcript.
        images: images.length
          ? images.map((image) => ({
              id: image.id,
              name: image.name,
              dataUrl: image.thumbUrl ?? image.dataUrl,
            }))
          : undefined,
      });
    }

    if (isAutoFix && autoFixState.attempts >= MAX_AUTO_FIX_ATTEMPTS) {
      restoreToStableScene(projectId, codeForRequest, options?.repairError ?? 'The scene failed to run.');
      return;
    }

    if (!hasKeyForModel(settings, modelUsed)) {
      appendMessage(projectId, {
        id: makeId('message'),
        role: 'assistant',
        content: new MissingKeyError(providerForModel(modelUsed)).message,
        createdAt: Date.now(),
        model: modelUsed,
        isError: true,
      });
      setShowSettings(true);
      return;
    }

    // Recent turns give the model conversational memory without resending
    // every scene it has ever written.
    const history = project.messages.slice(-6).map((message) => ({
      role: message.role,
      content: message.content,
    }));

    setThinkingProjects((current) =>
      current.includes(projectId) ? current : [...current, projectId],
    );

    try {
      if (isAutoFix) autoFixState.attempts += 1;
      /**
       * One model call, with the two recoveries worth making silently: a
       * reply in the wrong shape, and an edit whose FIND blocks did not
       * match the source. Both are the model's mistake, both are cheap to
       * retry here, and neither is worth showing the user.
       */
      const requestOnce = async (options: {
        repairError?: string;
        currentCode?: string;
        currentDurationInFrames?: number;
      }) => {
        let retries = 0;
        let repairError = options.repairError;
        // Explicit replacement language is handled centrally by requestScene;
        // otherwise this remains patch-only for the whole retry sequence.
        const forceFullRewrite = false;
        while (true) {
          try {
            // eslint-disable-next-line no-await-in-loop
            return await requestScene({
              settings,
              model: modelUsed,
              instruction,
              currentCode: options.currentCode,
              currentDurationInFrames: options.currentDurationInFrames,
              repairError,
              forceFullRewrite,
              history,
              images,
              houseStyle: 'cut',
            });
          } catch (error) {
            retries += 1;
            if (retries > MAX_REPLY_RETRIES) throw error;

            if (error instanceof EditPatchError) {
              // A patch miss is still an edit. Retry with the same source and
              // clearer matching instructions; never turn an ordinary edit
              // into a destructive whole-file rewrite.
              repairError = [
                options.repairError,
                `Your previous edit could not be applied: ${(error as EditPatchError).message}`,
              ]
                .filter(Boolean)
                .join('\n\n');
              continue;
            }
            if (error instanceof FullRewriteBlockedError) {
              // A normal edit must never fall back to a destructive rewrite.
              // Ask the provider again for a surgical patch while preserving
              // the existing source in the request.
              repairError = [
                options.repairError,
                error.message,
                'This is an edit to the existing scene. Return only FIND/REPLACE blocks. Do not send a complete JSX rewrite.',
              ]
                .filter(Boolean)
                .join('\n\n');
              continue;
            }
            if (error instanceof InvalidSceneReplyError) {
              repairError = [
                error.message,
                'Reply with usable scene output: exact FIND/REPLACE edit blocks, one complete Scene in a ```jsx fence, or the provider JSON wrapper containing one of those payloads.',
                `Your reply was:\n${error.rawReply.slice(0, 4000)}`,
              ].join('\n\n');
              continue;
            }
            throw error;
          }
        }
      };

      let cost: number | null = null;
      const addCost = (amount: number | null) => {
        if (cost === null && amount === null) return;
        cost = (cost ?? 0) + (amount ?? 0);
      };

      let reply = await requestOnce({
        repairError: options?.repairError,
        currentCode: sceneCodeForRequest,
        currentDurationInFrames: sceneDurationForRequest,
      });
      addCost(reply.cost);
      const originalTitle = reply.title;
      const originalDuration = reply.durationInFrames;
      /** Keep the title and length the first reply chose across repair rounds. */
      const carryForward = (next: typeof reply, previousDuration?: number) => ({
        ...next,
        title: next.title || originalTitle,
        durationInFrames: next.durationInFrames ?? previousDuration ?? originalDuration,
      });

      const durationFor = (candidate: typeof reply) =>
        candidate.durationInFrames ?? sceneDurationForRequest ?? project.durationInFrames;

      const preflight = async (candidate: typeof reply) =>
        preflightCandidate({
          code: candidate.code,
          durationInFrames: durationFor(candidate),
          instruction,
          history,
        });

      // Repair rounds are for scenes that cannot run at all. Everything the
      // inspection considers merely imperfect comes back as advisory notes.
      let notes: string[] = [];
      let fatal: string | null = null;
      for (let round = 0; round <= MAX_AUTO_FIX_ATTEMPTS; round += 1) {
        try {
          // eslint-disable-next-line no-await-in-loop
          notes = await preflight(reply);
          fatal = null;
          break;
        } catch (error) {
          fatal = error instanceof Error ? error.message : 'The generated scene did not run.';
        }
        if (round === MAX_AUTO_FIX_ATTEMPTS) break;
        autoFixState.attempts += 1;
        const previousDuration = reply.durationInFrames;
        // eslint-disable-next-line no-await-in-loop
        const repaired = await requestOnce({
          repairError: fatal,
          currentCode: reply.code,
          currentDurationInFrames: previousDuration ?? sceneDurationForRequest,
        });
        addCost(repaired.cost);
        reply = carryForward(repaired, previousDuration);
      }
      if (fatal) throw new SceneCompileError(fatal);

      // One optional polish round. The scene already runs, so this is pure
      // upside: if the revision does not compile, or does not actually
      // reduce the notes, the take that works is the one that ships.
      if (notes.length) {
        console.info('Advisory layout notes:', notes);
        try {
          const previousDuration = reply.durationInFrames;
          const polished = carryForward(
            await requestOnce({
              repairError: formatValidationNotes(notes),
              currentCode: reply.code,
              currentDurationInFrames: previousDuration ?? sceneDurationForRequest,
            }),
            previousDuration,
          );
          const polishedNotes = await preflight(polished);
          if (polishedNotes.length < notes.length) {
            addCost(polished.cost);
            reply = polished;
            notes = polishedNotes;
          }
        } catch (error) {
          console.info('Polish round skipped; keeping the take that renders.', error);
        }
      }

      setSpend((current) => {
        const next = recordSpend(current, modelUsed, cost);
        saveSpend(next);
        return next;
      });

      const durationInFrames = reply.durationInFrames ?? project.durationInFrames;

      setUndoSnapshots((current) => ({
        ...current,
        [projectId]: {code: project.code, durationInFrames: project.durationInFrames},
      }));

      // Adopt the model's proposed title only while the project still carries
      // its auto-generated placeholder name — a project the user has renamed
      // themselves is never overwritten.
      const isPlaceholderName = /^Untitled motion( \d+)?$/i.test(project.name);
      const name = reply.title && isPlaceholderName ? reply.title : undefined;

      updateProject(projectId, (current) => ({
        ...current,
        ...(name ? {name} : null),
        code: reply.code,
        durationInFrames,
        messages: [
          ...current.messages,
          {
            id: makeId('message'),
            role: 'assistant',
            content: reply.message,
            createdAt: Date.now(),
            model: modelUsed,
            code: reply.code,
            durationInFrames,
            costUsd: cost ?? undefined,
          },
        ],
        updatedAt: Date.now(),
      }));
      setRuntimeError(null);
      handledRuntimeErrorRef.current = null;

    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'The scene failed before it reached the canvas.';
      if (isAutoFix) {
        restoreToStableScene(projectId, codeForRequest, message);
      } else {
        if (error instanceof SceneCompileError) console.error('Scene generation failed:', error);
        appendMessage(projectId, {
          id: makeId('message'),
          role: 'assistant',
          content: error instanceof SceneCompileError ? stableSceneRestoredMessage : message,
          createdAt: Date.now(),
          model: modelUsed,
          isError: true,
        });
      }
    } finally {
      setThinkingProjects((current) => current.filter((id) => id !== projectId));
    }
  };

  askAssistantRef.current = askAssistant;

  const undoLastEdit = () => {
    const snapshot = undoSnapshots[activeProject.id];
    if (!snapshot) return;
    updateActive((project) => ({
      ...project,
      code: snapshot.code,
      durationInFrames: snapshot.durationInFrames,
      updatedAt: Date.now(),
    }));
    setUndoSnapshots((current) => {
      const next = {...current};
      delete next[activeProject.id];
      return next;
    });
  };

  const [cuts, setCuts] = useState<Cut[]>(() => {
    const stored = loadCuts();
    return stored.length ? stored.map(withVoiceDefaults) : [newCut(nextUntitledName('Untitled cut', []))];
  });
  const [activeCutId, setActiveCutId] = useState<string>(() => loadActiveCutId() ?? cuts[0]?.id ?? 'cut-1');

  const [riveProjects, setRiveProjects] = useState<RiveProject[]>(() => {
    const stored = loadRiveProjects();
    return stored.length ? stored : [newRiveProject(nextUntitledName('Untitled Rive', []))];
  });
  const [riveProjectsReady, setRiveProjectsReady] = useState(false);
  const [activeRiveId, setActiveRiveId] = useState(
    () => loadActiveRiveId() ?? riveProjects[0].id,
  );
  const activeRive =
    riveProjects.find((project) => project.id === activeRiveId) ?? riveProjects[0];

  useEffect(() => {
    let live = true;
    loadRiveProjectsDurable()
      .then((stored) => {
        if (!live || !stored?.length) return;
        setRiveProjects((current) => {
          const currentLatest = Math.max(...current.map((item) => item.updatedAt));
          const storedLatest = Math.max(...stored.map((item) => item.updatedAt));
          return storedLatest > currentLatest ? stored : current;
        });
      })
      .finally(() => {
        if (live) setRiveProjectsReady(true);
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!riveProjectsReady) return;
    const timer = window.setTimeout(() => saveRiveProjects(riveProjects), 200);
    return () => window.clearTimeout(timer);
  }, [riveProjects, riveProjectsReady]);

  useEffect(() => saveActiveRiveId(activeRive.id), [activeRive.id]);

  const handleCreateRive = useCallback(() => {
    const active = riveProjects.find((item) => item.id === activeRiveId);
    if (active && !riveHasContent(active)) return;
    const project = newRiveProject(
      nextUntitledName('Untitled Rive', riveProjects.map((item) => item.name)),
    );
    setRiveProjects((current) => [...current, project]);
    setActiveRiveId(project.id);
  }, [activeRiveId, riveProjects]);

  const handleDeleteRive = useCallback((riveId: string) => {
    setRiveProjects((current) => {
      if (current.length <= 1) return current;
      const remaining = current.filter((item) => item.id !== riveId);
      if (riveId === activeRiveId) setActiveRiveId(remaining[0].id);
      return remaining;
    });
  }, [activeRiveId]);

  const handleCreateCut = useCallback(() => {
    // Same anti-spam rule as projects: reuse the active cut while untouched.
    const active = cuts.find((c) => c.id === activeCutId);
    if (active && !cutHasContent(active)) {
      setActiveCutId(active.id);
      return;
    }
    const cut = newCut(nextUntitledName('Untitled cut', cuts.map((c) => c.name)));
    setCuts((current) => [...current, cut]);
    setActiveCutId(cut.id);
  }, [cuts, activeCutId]);

  const handleDeleteCut = useCallback((cutId: string) => {
    const cutIndex = cuts.findIndex((c) => c.id === cutId);
    if (cutIndex === -1) return;
    const cut = cuts[cutIndex];
    const remaining = cuts.filter((c) => c.id !== cutId);
    if (remaining.length) {
      setCuts(remaining);
      setActiveCutId(remaining[0].id);
      triggerUndoToast({
        type: 'cut',
        cut,
        index: cutIndex,
      });
    }
  }, [cuts, triggerUndoToast]);

  /* ─────────────── this project's render, and only this project's ─────────────── */
  const {
    isRendering: isRenderingActiveProject,
    download: activeRenderDownload,
    log: activeRenderLog,
  } = renderButtonState({
    id: activeProject.id,
    signature: renderSignature(activeProject),
    renderingProjectId,
    result: renderResults[activeProject.id],
    log: renderLogs[activeProject.id],
  });
  const downloadActiveRender = () => {
    if (activeRenderDownload) {
      downloadRenderedFile(activeRenderDownload.url, activeRenderDownload.fileName);
    }
  };
  const dismissRenderLog = (projectId: string) =>
    setRenderLogs((current) => {
      if (!current[projectId]) return current;
      const {[projectId]: _dismissed, ...rest} = current;
      return rest;
    });

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background font-sans text-zinc-100">
      <StudioSidebar
        projects={projects}
        activeProject={activeProject}
        thinkingProjectIds={thinkingProjects}
        onCreateProject={createProject}
        onSelectProject={setActiveProjectId}
        onDeleteProject={deleteProject}
        onRestoreSaved={restoreSaved}
        onDeleteSaved={deleteSaved}
        cuts={cuts}
        activeCutId={activeCutId}
        onCreateCut={handleCreateCut}
        onSelectCut={setActiveCutId}
        onDeleteCut={handleDeleteCut}
        riveProjects={riveProjects}
        activeRiveId={activeRive.id}
        onCreateRive={handleCreateRive}
        onSelectRive={setActiveRiveId}
        onDeleteRive={handleDeleteRive}
        onOpenSettings={() => setShowSettings(true)}
        page={page}
        onChangePage={setPage}
        undoToast={undoToast}
        undoSecondsLeft={undoSecondsLeft}
        onUndoDelete={handleUndoDelete}
        onDismissUndo={dismissUndoToast}
      />

      {page === 'editor' ? (
        <div className="h-full min-w-0 flex-1 flex flex-col overflow-hidden">
          <EditorPage
            settings={settings}
            onOpenSettings={() => setShowSettings(true)}
            onRecordSpend={(model, cost) =>
              setSpend((current) => {
                const next = recordSpend(current, model, cost);
                saveSpend(next);
                return next;
              })
            }
            onModelChange={(selectedModel) => setSettings({...settings, selectedModel})}
            spend={spend}
            cuts={cuts}
            setCuts={setCuts}
            activeCutId={activeCutId}
            setActiveCutId={setActiveCutId}
            onCreateCut={handleCreateCut}
            onDeleteCut={handleDeleteCut}
          />
        </div>
      ) : page === 'rive' ? (
        <RivePage
          project={activeRive}
          onChange={(next) =>
            setRiveProjects((current) =>
              current.map((item) => (item.id === next.id ? next : item)),
            )
          }
        />
      ) : (
        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#121211]">
          <PageHeader>
            <HeaderTitle
              value={activeProject.name}
              placeholder="Untitled project"
              onChange={(name) =>
                updateActive((project) => ({
                  ...project,
                  name,
                  updatedAt: Date.now(),
                }))
              }
            />

            <div className="min-w-0 flex-1" />

            <div className="flex items-center gap-2">
              <HeaderRenderButton
                log={activeRenderLog}
                isRendering={isRenderingActiveProject}
                download={activeRenderDownload}
                disabled={
                  Boolean(renderingProjectId) || thinkingProjects.includes(activeProject.id)
                }
                ready={projectHasContent(activeProject)}
                onRender={renderProject}
                onDownload={downloadActiveRender}
                onDismissLog={() => dismissRenderLog(activeProject.id)}
                renderTitle="Render this graphic at 1080p60 in this browser and download the MP4"
                downloadTitle="Download the file rendered from this graphic"
              />
            </div>
          </PageHeader>

          <div className="flex min-h-0 flex-1">
            <main className="flex min-w-0 flex-1 flex-col">
              <div className="min-h-0 flex-1">
                {/* An untouched project has only the starter scene on the
                    canvas, which tells a first-time user nothing about how to
                    replace it. Same test the sidebar uses to decide whether
                    this project is in History at all. */}
                {projectHasContent(activeProject) ? (
                  <PlayerView
                    graphic={scene}
                    wide
                    previewUnderlay={previewUnderlay}
                    onPreviewUnderlayChange={handlePreviewUnderlayChange}
                  />
                ) : (
                  /* Nothing built yet, so the canvas becomes the prompt box —
                     the same one the editor opens on, with only the model to
                     choose. Once there is a graphic, the Assistant takes over. */
                  <PromptComposer
                    headline="Make one graphic"
                    value={studioDraft}
                    onChange={setStudioDraft}
                    images={studioImages}
                    onImagesChange={setStudioImages}
                    supportsImages={supportsImages}
                    onSubmit={() => {
                      const instruction = studioDraft.trim();
                      if (!instruction && !studioImages.length) return;
                      const imagesToSend = [...studioImages];
                      setStudioDraft('');
                      setStudioImages([]);
                      setAssistantOpen(true);
                      askAssistant(
                        instruction || 'Build an animated graphic based on the reference image.',
                        {projectId: activeProject.id, images: imagesToSend},
                      );
                    }}
                    placeholder={
                      supportsImages
                        ? 'Describe the graphic in plain words, or paste a reference image…'
                        : 'Describe the graphic in plain words: what it says, what it is for.'
                    }
                    busy={thinkingProjects.includes(activeProject.id)}
                    busyLabel="Drawing…"
                    submitLabel="Build the graphic  (⌘↵)"
                    toolbarRight={
                      <ModelPicker
                        className="shrink-0"
                        models={settings.modelSlugs}
                        value={settings.selectedModel}
                        onChange={(selectedModel) => setSettings({...settings, selectedModel})}
                        buttonClassName={`${COMPOSER_CHIP} max-w-[190px]`}
                        readyProviders={{
                          openrouter: Boolean(settings.apiKey.trim()),
                          google: Boolean(settings.googleApiKey.trim()),
                          openlux: Boolean(settings.openluxApiKey.trim()),
                          codex: codexAuth.status === 'authenticated',
                        }}
                        openLuxApiKey={settings.openluxApiKey}
                        spend={spend}
                      />
                    }
                  />
                )}
              </div>
            </main>

            {/* Right Tabbed Panel */}
            {/* An untouched project has the prompt box on the canvas; the
                panel and its collapsed rail would only point back at it. */}
            {!projectHasContent(activeProject) ? null : (
              <aside
                className={`relative flex h-full shrink-0 flex-col bg-surface transition-[width] duration-300 ease-in-out ${
                  assistantOpen
                    ? 'w-[330px] border-l border-white/[0.07] 2xl:w-[370px]'
                    : 'w-0 border-l-0'
                }`}
              >
                {/* Floating controls row outside the panel, in same row as panel header */}
                <div className="absolute right-full top-2 mr-2 z-30 flex items-center gap-1.5 pointer-events-auto">
                  <CustomSelect<PreviewUnderlay>
                    value={previewUnderlay}
                    options={PREVIEW_UNDERLAY_OPTIONS}
                    onChange={handlePreviewUnderlayChange}
                    className="w-36"
                    menuMinWidth={144}
                  />
                  <button
                    type="button"
                    onClick={() => setAssistantOpen(!assistantOpen)}
                    title={assistantOpen ? 'Collapse panel' : 'Expand panel'}
                    aria-label={assistantOpen ? 'Collapse panel' : 'Expand panel'}
                    className="grid h-7 w-7 shrink-0 place-items-center border border-white/[0.08] bg-[#181716] text-zinc-400 hover:border-white/20 hover:bg-[#201F1D] hover:text-white transition-colors shadow-md"
                  >
                    {assistantOpen ? (
                      <PanelCollapseIcon className="h-3.5 w-3.5" />
                    ) : (
                      <PanelExpandIcon className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>

                {/* Inner clipped content */}
                <div className="flex h-full w-[330px] flex-col overflow-hidden 2xl:w-[370px]">
                  {/* Header / Tab Switcher */}
                  <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/[0.06] px-2.5">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setInspector('ai')}
                        className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium transition-colors ${
                          inspector === 'ai'
                            ? 'bg-[#2A2928] text-white'
                            : 'text-zinc-500 hover:text-white'
                        }`}
                      >
                        <Sparkle className="h-3.5 w-3.5" />
                        Assistant
                      </button>

                      <button
                        onClick={() => setInspector('code')}
                        className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium transition-colors ${
                          inspector === 'code'
                            ? 'bg-[#2A2928] text-white'
                            : 'text-zinc-500 hover:text-white'
                        }`}
                      >
                        <FileIcon className="h-3.5 w-3.5" />
                        Code
                      </button>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    {inspector === 'ai' ? (
                      <AiAssistant
                        hideHeader
                        messages={activeProject.messages}
                        settings={settings}
                        isThinking={thinkingProjects.includes(activeProject.id)}
                        onSubmit={(instruction, images) =>
                          askAssistant(instruction, {images, projectId: activeProject.id})
                        }
                        spend={spend}
                        onModelChange={(selectedModel) => setSettings({...settings, selectedModel})}
                        onOpenSettings={() => setShowSettings(true)}
                        onShowProperties={() => setInspector('code')}
                        onClose={() => setAssistantOpen(false)}
                        onUndo={undoLastEdit}
                        canUndo={Boolean(undoSnapshots[activeProject.id])}
                        onRestoreCode={restoreFromMessage}
                        sceneError={sceneError}
                        onFixError={
                          sceneError
                            ? () =>
                                askAssistant(
                                  'The scene on the canvas is broken. Fix it and keep the design intact.',
                                  {repairError: sceneError, projectId: activeProject.id},
                                )
                            : undefined
                        }
                      />
                    ) : (
                      <CodeDrawer
                        code={activeProject.code}
                        durationInFrames={activeProject.durationInFrames}
                        compileError={sceneError}
                        onApply={applyScene}
                      />
                    )}
                  </div>
                </div>
              </aside>
            )}
          </div>
        </div>
      )}

      {showSettings && (
        <SettingsModal
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSave={(next) => {
            setSettings(next);
            setShowSettings(false);
          }}
        />
      )}
    </div>
  );
};

export default App;

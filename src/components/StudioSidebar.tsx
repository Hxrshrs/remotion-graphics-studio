import React, {useMemo, useState} from 'react';
import {MultiplyIcon, RefreshIcon, SearchIcon, SettingsIcon, TrashIcon} from './MageIcon';
import {StudioProject} from '../studio/types';
import {Cut} from '../studio/cut';
import {RiveProject} from '../studio/rive';
import {cutHasContent, projectHasContent} from '../studio/activity';
import {BrandLogo} from './BrandLogo';
import {ChatLoader, EditorCutIcon, StudioChatIcon} from './AppIcons';

type StudioSidebarProps = {
  page: 'studio' | 'editor' | 'rive';
  onChangePage: (page: 'studio' | 'editor' | 'rive') => void;
  // Studio Projects
  projects: StudioProject[];
  activeProject: StudioProject;
  thinkingProjectIds: string[];
  onCreateProject: () => void;
  onSelectProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onRestoreSaved: (savedId: string) => void;
  onDeleteSaved: (savedId: string) => void;
  // Editor Cuts
  cuts?: Cut[];
  activeCutId?: string;
  onCreateCut?: () => void;
  onSelectCut?: (cutId: string) => void;
  onDeleteCut?: (cutId: string) => void;
  // Rive Interactives
  riveProjects?: RiveProject[];
  activeRiveId?: string;
  onCreateRive?: () => void;
  onSelectRive?: (riveId: string) => void;
  onDeleteRive?: (riveId: string) => void;
  onOpenSettings: () => void;
  // Undo Toast
  undoToast?: {
    type: 'project' | 'cut';
    project?: StudioProject;
    cut?: Cut;
    key: number;
  } | null;
  undoSecondsLeft?: number;
  onUndoDelete?: () => void;
  onDismissUndo?: () => void;
};

export const StudioSidebar: React.FC<StudioSidebarProps> = ({
  page,
  onChangePage,
  projects,
  activeProject,
  thinkingProjectIds,
  onCreateProject,
  onSelectProject,
  onDeleteProject,
  onRestoreSaved,
  onDeleteSaved,
  cuts = [],
  activeCutId,
  onCreateCut,
  onSelectCut,
  onDeleteCut,
  riveProjects = [],
  activeRiveId,
  onCreateRive,
  onSelectRive,
  onDeleteRive,
  onOpenSettings,
  undoToast,
  undoSecondsLeft,
  onUndoDelete,
  onDismissUndo,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  type HistoryEntry =
    | {kind: 'studio'; id: string; name: string; time: number}
    | {kind: 'editor'; id: string; name: string; time: number}
    | {kind: 'rive'; id: string; name: string; time: number};

  const history = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    // Empty drafts stay out of history, the open one included. Clicking New
    // creates a project whether or not anything is done with it, and listing
    // those turned History into a column of untouched "New chat" rows. A
    // project appears the moment it holds a message, a saved version, an
    // edited scene, or a pasted script — see studio/activity.ts, which the
    // pages' empty states read from too.
    const projectEntries: HistoryEntry[] = projects
      .filter(projectHasContent)
      .filter((p) => (q ? p.name.toLowerCase().includes(q) : true))
      .map((p) => {
        const latestMsg = p.messages?.length ? p.messages[p.messages.length - 1].createdAt : 0;
        return {
          kind: 'studio' as const,
          id: p.id,
          name: p.name,
          time: Math.max(p.updatedAt || 0, latestMsg, p.createdAt || 0),
        };
      });
    const cutEntries: HistoryEntry[] = cuts
      .filter(cutHasContent)
      .filter((c) => (q ? c.name.toLowerCase().includes(q) : true))
      .map((c) => ({
        kind: 'editor' as const,
        id: c.id,
        name: c.name || 'Untitled Cut',
        time: c.updatedAt || 0,
      }));
    const riveEntries: HistoryEntry[] = riveProjects
      .filter((item) => (q ? item.name.toLowerCase().includes(q) : true))
      .map((item) => ({kind: 'rive', id: item.id, name: item.name, time: item.updatedAt}));
    return [...projectEntries, ...cutEntries, ...riveEntries].sort((a, b) => b.time - a.time);
  }, [projects, cuts, riveProjects, searchQuery]);

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const cutById = useMemo(() => new Map(cuts.map((c) => [c.id, c])), [cuts]);
  const riveById = useMemo(() => new Map(riveProjects.map((item) => [item.id, item])), [riveProjects]);

  const handleSelectStudio = (projectId: string) => {
    if (page !== 'studio') onChangePage('studio');
    onSelectProject(projectId);
  };

  const handleSelectEditor = (cutId: string) => {
    if (page !== 'editor') onChangePage('editor');
    onSelectCut?.(cutId);
  };

  const handleCreateStudio = () => {
    if (page !== 'studio') onChangePage('studio');
    onCreateProject();
  };

  const handleCreateEditor = () => {
    if (page !== 'editor') onChangePage('editor');
    onCreateCut?.();
  };

  const handleCreateRive = () => {
    if (page !== 'rive') onChangePage('rive');
    onCreateRive?.();
  };

  return (
    <aside className="relative flex h-full w-60 shrink-0 flex-col overflow-hidden bg-surface border-r border-white/[0.07] p-2.5 font-sans select-none">
      {/* Top Header: Brand Logo & Settings */}
      <div className="flex h-7 items-center justify-between px-1">
        <div title="Rendr Studio" className="flex items-center">
          <BrandLogo className="h-4.5 w-auto text-white" />
        </div>
        <button
          type="button"
          onClick={onOpenSettings}
          title="Settings"
          aria-label="Settings"
          className="p-1 text-zinc-500 hover:text-white hover:bg-surface-raised transition-colors"
        >
          <SettingsIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Action Row: Search & New Studio / Editor */}
      <div className="mt-2.5 flex items-center gap-1">
        <div className="relative min-w-0 flex-1">
          <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search history…"
            className="h-7 w-full border border-white/[0.07] bg-surface-raised pl-6 pr-5 text-[11px] text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-white/25"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-zinc-500 hover:text-white"
            >
              <MultiplyIcon className="h-2.5 w-2.5" />
            </button>
          ) : null}
        </div>

        <button
          type="button"
          onClick={handleCreateStudio}
          title="New Studio chat"
          aria-label="New Studio chat"
          className="grid h-7 w-7 shrink-0 place-items-center border border-white/[0.07] bg-surface-raised text-zinc-400 hover:bg-surface-hover hover:text-white transition-colors"
        >
          <StudioChatIcon className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={handleCreateEditor}
          title="New Editor cut"
          aria-label="New Editor cut"
          className="grid h-7 w-7 shrink-0 place-items-center border border-white/[0.07] bg-surface-raised text-zinc-400 hover:bg-surface-hover hover:text-white transition-colors"
        >
          <EditorCutIcon className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={handleCreateRive}
          title="New Rive interactive"
          aria-label="New Rive interactive"
          className="grid h-7 w-7 shrink-0 place-items-center border border-white/[0.07] bg-surface-raised font-mono text-[11px] font-semibold text-zinc-400 hover:bg-surface-hover hover:text-white transition-colors"
        >
          R
        </button>
      </div>

      {/* Section Header */}
      <div className="mt-3 flex items-center justify-between px-1 font-mono text-[9px] uppercase tracking-[0.1em] text-zinc-500">
        <span>History</span>
        <span>{history.length}</span>
      </div>

      {/* Scrollable List: one shared history, subtle type cue per row */}
      <div className="mt-1 min-h-0 flex-1 overflow-y-auto space-y-0.5 pr-0.5">
        {history.map((entry) => {
          if (entry.kind === 'studio') {
            const project = projectById.get(entry.id);
            if (!project) return null;
            const active = page === 'studio' && project.id === activeProject.id;
            const thinking = thinkingProjectIds.includes(project.id);
            return (
              <div key={`studio-${project.id}`} className="group relative">
                <button
                  type="button"
                  onClick={() => handleSelectStudio(project.id)}
                  title={`Studio chat · ${project.name}`}
                  className={`flex w-full items-center justify-between py-1.5 px-2 text-left transition-colors ${
                    active
                      ? 'bg-surface-raised text-white'
                      : 'text-zinc-400 hover:bg-surface-hover hover:text-zinc-200'
                  }`}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    {thinking ? (
                      <ChatLoader className="h-3 w-3 shrink-0 text-white" />
                    ) : (
                      <StudioChatIcon
                        className={`h-3 w-3 shrink-0 ${
                          active ? 'text-zinc-300' : 'text-zinc-600'
                        }`}
                      />
                    )}
                    <span
                      className={`min-w-0 flex-1 truncate text-[11px] ${
                        thinking ? 'motion-shimmer' : ''
                      }`}
                    >
                      {project.name}
                    </span>
                  </div>
                </button>

                {active && (
                  <span className="pointer-events-none absolute left-0 top-0 h-full w-0.5 bg-[#299FFF]" />
                )}

                <button
                  type="button"
                  aria-label={`Delete ${project.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteProject(project.id);
                  }}
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-zinc-500 opacity-0 hover:text-red-400 focus:opacity-100 group-hover:opacity-100 transition-opacity"
                >
                  <TrashIcon className="h-3 w-3" />
                </button>
              </div>
            );
          }
          if (entry.kind === 'rive') {
            const riveProject = riveById.get(entry.id);
            if (!riveProject) return null;
            const active = page === 'rive' && riveProject.id === activeRiveId;
            return (
              <div key={`rive-${riveProject.id}`} className="group relative">
                <button type="button" onClick={() => { if (page !== 'rive') onChangePage('rive'); onSelectRive?.(riveProject.id); }} title={`Rive interactive · ${riveProject.name}`} className={`flex w-full items-center gap-1.5 px-2 py-1.5 text-left transition-colors ${active ? 'bg-surface-raised text-white' : 'text-zinc-400 hover:bg-surface-hover hover:text-zinc-200'}`}>
                  <span className={`grid h-3 w-3 shrink-0 place-items-center font-mono text-[8px] font-bold ${active ? 'text-[#70bcff]' : 'text-zinc-600'}`}>R</span>
                  <span className="min-w-0 flex-1 truncate text-[11px]">{riveProject.name}</span>
                </button>
                {active ? <span className="pointer-events-none absolute left-0 top-0 h-full w-0.5 bg-[#299FFF]" /> : null}
                {onDeleteRive ? (
                  <button type="button" aria-label={`Delete ${riveProject.name}`} onClick={(event) => { event.stopPropagation(); onDeleteRive(riveProject.id); }} className={`absolute right-1 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-red-400 focus:opacity-100 group-hover:opacity-100 transition-opacity ${active ? 'opacity-100' : 'opacity-0'}`}>
                    <TrashIcon className="h-3 w-3" />
                  </button>
                ) : null}
              </div>
            );
          }
          const cut = cutById.get(entry.id);
          if (!cut) return null;
          const active = page === 'editor' && cut.id === activeCutId;
          return (
            <div key={`editor-${cut.id}`} className="group relative">
              <button
                type="button"
                onClick={() => handleSelectEditor(cut.id)}
                title={`Editor cut · ${cut.name || 'Untitled Cut'}`}
                className={`flex w-full items-center justify-between py-1.5 px-2 text-left transition-colors ${
                  active
                    ? 'bg-surface-raised text-white'
                    : 'text-zinc-400 hover:bg-surface-hover hover:text-zinc-200'
                }`}
              >
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <EditorCutIcon
                    className={`h-3 w-3 shrink-0 ${
                      active ? 'text-zinc-300' : 'text-zinc-600'
                    }`}
                  />
                  <span className="min-w-0 flex-1 truncate text-[11px]">
                    {cut.name || 'Untitled Cut'}
                  </span>
                </div>
                <span className="shrink-0 font-mono text-[9px] text-zinc-500 pl-1 group-hover:opacity-0 transition-opacity">
                  {cut.shots.length}s
                </span>
              </button>

              {active && (
                <span className="pointer-events-none absolute left-0 top-0 h-full w-0.5 bg-[#299FFF]" />
              )}

              {cuts.length > 1 && onDeleteCut && (
                <button
                  type="button"
                  aria-label={`Delete ${cut.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteCut(cut.id);
                  }}
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-zinc-500 opacity-0 hover:text-red-400 focus:opacity-100 group-hover:opacity-100 transition-opacity"
                >
                  <TrashIcon className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
        {!history.length && (
          <div className="px-2 py-6 text-[11px] leading-relaxed text-zinc-500">
            {searchQuery.trim() ? (
              <>
                Nothing matches "{searchQuery.trim()}".
              </>
            ) : (
              <>
                <p className="text-zinc-400">Nothing here yet.</p>
                <p className="mt-1.5">
                  Projects show up once you have written in them. Start a chat to make one
                  graphic, a cut to turn a script into scenes, or a Rive interactive.
                </p>
              </>
            )}
          </div>
        )}

        {/* Saved Versions (active Studio project) */}
        {page === 'studio' && activeProject.savedGraphics.length > 0 && (
          <div className="pt-3">
            <div className="mb-1 flex items-center justify-between px-1 font-mono text-[8px] uppercase tracking-[0.1em] text-zinc-500">
              <span>Saved versions</span>
              <span>{activeProject.savedGraphics.length}</span>
            </div>
            <div className="space-y-0.5">
              {activeProject.savedGraphics
                .slice()
                .reverse()
                .map((saved) => (
                  <div key={saved.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => onRestoreSaved(saved.id)}
                      className="flex w-full items-center py-1 px-2 text-left text-zinc-400 hover:bg-surface-hover hover:text-white transition-colors"
                    >
                      <span className="min-w-0 flex-1 truncate text-[10px]">
                        {saved.name}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${saved.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSaved(saved.id);
                      }}
                          className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-zinc-500 opacity-0 hover:text-red-400 focus:opacity-100 group-hover:opacity-100 transition-opacity"
                        >
                          <TrashIcon className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            )}
      </div>

      {/* Undo Toast anchored in sidebar bottom */}
      {undoToast && (
        <div
          role="status"
          aria-live="polite"
          className="relative mt-2 shrink-0 border border-white/[0.12] bg-[#121211] p-2 select-none"
        >
          {/* 7s Countdown Line */}
          <div
            key={undoToast.key}
            className="absolute top-0 left-0 h-[2px] bg-white/70 pointer-events-none"
            style={{
              width: '100%',
              animation: 'undo-shrink 7000ms linear forwards',
            }}
          />

          <div className="flex items-center justify-between gap-1 text-[11px] mb-1.5 pt-0.5">
            <span className="truncate font-medium text-zinc-200">
              {undoToast.type === 'project' ? undoToast.project?.name : undoToast.cut?.name}
            </span>
            <button
              type="button"
              onClick={onDismissUndo}
              aria-label="Dismiss notification"
              className="text-zinc-500 hover:text-white transition-colors p-0.5"
            >
              <MultiplyIcon className="h-3 w-3" />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-500">Deleted</span>
            <button
              type="button"
              onClick={onUndoDelete}
              className="flex items-center gap-1 font-mono text-[11px] font-medium text-zinc-200 hover:text-white transition-colors bg-transparent border-none p-0 focus:outline-none"
            >
              <RefreshIcon className="h-2.5 w-2.5" />
              <span>Undo ({undoSecondsLeft ?? 7}s)</span>
            </button>
          </div>
        </div>
      )}
    </aside>
  );
};

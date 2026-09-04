import React, {useEffect, useRef, useState} from 'react';
import {
  AttachmentIcon,
  CheckIcon,
  CopyIcon,
  ExclamationTriangleIcon,
  FileIcon,
  ImageIcon,
  LayoutRightIcon,
  MultiplyIcon,
  ReloadReverseIcon,
  SendIcon,
  SettingsIcon,
} from './MageIcon';
import {modelSupportsImages, useOpenRouterCatalog} from '../studio/catalog';
import {useCodexAuth} from '../studio/codex';
import {prepareImage} from '../studio/images';
import {apiModelId, providerForModel} from '../studio/models';
import {SpendMap} from '../studio/spend';
import {Attachment, StudioMessage, StudioSettings} from '../studio/types';
import {ModelPicker} from './ModelPicker';
import {QuickActions, STUDIO_BUILD_SHORTCUTS} from './QuickActions';
import {ChatEmptyState} from './ChatEmptyState';
import {GhostIconButton, MetaLabel, ThinkingIndicator} from './ChatChrome';
import {Sparkle} from './Sparkle';
import {Spinner} from './AppIcons';

/** Kept small so a direction stays well inside provider request limits. */
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

type AiAssistantProps = {
  messages: StudioMessage[];
  settings: StudioSettings;
  isThinking: boolean;
  onSubmit: (instruction: string, images: Attachment[]) => void;
  spend?: SpendMap;
  onModelChange: (model: string) => void;
  onOpenSettings: () => void;
  onShowProperties: () => void;
  onClose: () => void;
  onUndo: () => void;
  canUndo: boolean;
  onRestoreCode?: (messageId: string) => void;
  sceneError?: string | null;
  onFixError?: () => void;
  hideHeader?: boolean;
};



export const AiAssistant: React.FC<AiAssistantProps> = ({
  messages,
  settings,
  isThinking,
  onSubmit,
  spend = {},
  onModelChange,
  onOpenSettings,
  onShowProperties,
  onClose,
  onUndo,
  canUndo,
  onRestoreCode,
  sceneError,
  onFixError,
  hideHeader = false,
}) => {
  const [draft, setDraft] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentNote, setAttachmentNote] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const promptInputRef = useRef<HTMLTextAreaElement>(null);

  const catalog = useOpenRouterCatalog(providerForModel(settings.selectedModel) === 'openrouter');
  const {auth: codexAuth} = useCodexAuth();
  const supportsImages = modelSupportsImages(catalog, settings.selectedModel);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({behavior: 'smooth'});
  }, [messages, isThinking]);

  useEffect(() => {
    const input = promptInputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
    input.style.overflowY = input.scrollHeight > 160 ? 'auto' : 'hidden';
  }, [draft]);

  // Switching to a text-only model must not silently send images it will reject.
  useEffect(() => {
    if (!supportsImages && attachments.length) {
      setAttachments([]);
      setAttachmentNote('Removed the attached images — this model does not accept them.');
    }
  }, [supportsImages, attachments.length]);

  const addFiles = async (files: File[]) => {
    if (!supportsImages || !files.length) return;
    const room = MAX_IMAGES - attachments.length;
    if (room <= 0) {
      setAttachmentNote(`Up to ${MAX_IMAGES} images per direction.`);
      return;
    }

    const notes: string[] = [];
    const accepted: Attachment[] = [];
    for (const file of files.slice(0, room)) {
      if (!file.type.startsWith('image/')) continue;
      if (file.size > MAX_IMAGE_BYTES) {
        notes.push(`${file.name} is over ${MAX_IMAGE_BYTES / 1024 / 1024}MB.`);
        continue;
      }
      try {
        const {full, thumb} = await prepareImage(file);
        accepted.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          dataUrl: full,
          thumbUrl: thumb,
        });
      } catch {
        notes.push(`Could not read ${file.name}.`);
      }
    }
    if (files.length > room) notes.push(`Only the first ${room} were added.`);
    if (accepted.length) setAttachments((current) => [...current, ...accepted]);
    setAttachmentNote(notes.join(' '));
  };

  const removeAttachment = (id: string) => {
    setAttachments((current) => current.filter((image) => image.id !== id));
    setAttachmentNote('');
  };

  const send = () => {
    const instruction = draft.trim();
    if ((!instruction && !attachments.length) || isThinking) return;
    setDraft('');
    setAttachments([]);
    setAttachmentNote('');
    onSubmit(instruction, attachments);
  };

  const copyText = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 1200);
    } catch {
      // Clipboard access can be unavailable in an embedded or insecure preview.
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-surface">
      {!hideHeader && (
        <div className="flex items-center justify-between gap-2 px-3.5 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="grid h-7 w-7 shrink-0 place-items-center bg-[#201F1D] text-zinc-300">
              <Sparkle className="h-3.5 w-3.5" />
            </div>
            <div className="text-xs font-medium text-white">Assistant</div>
          </div>
          <div className="flex items-center gap-1">
            <button disabled={!canUndo} onClick={onUndo} title="Undo last AI edit" className="p-1.5 text-zinc-500 hover:bg-[#201F1D] hover:text-white disabled:opacity-25">
              <ReloadReverseIcon className="h-3.5 w-3.5" />
            </button>
            <button onClick={onShowProperties} title="Edit scene code" className="p-1.5 text-zinc-500 hover:bg-[#201F1D] hover:text-white">
              <FileIcon className="h-3.5 w-3.5" />
            </button>
            <button onClick={onOpenSettings} title="Settings" className="p-1.5 text-zinc-500 hover:bg-[#201F1D] hover:text-white">
              <SettingsIcon className="h-3.5 w-3.5" />
            </button>
            <button onClick={onClose} title="Collapse assistant" className="p-1.5 text-zinc-500 hover:bg-[#201F1D] hover:text-white">
              <LayoutRightIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3.5 py-4">
        {!messages.length ? (
          <ChatEmptyState
            title="What should we build?"
            description="A blank 1920×1080 canvas with composable building blocks, not templates. Layout, colour, type, SVG and visual style remain open."
          >
            <div className="mx-auto flex w-full max-w-[240px] flex-col gap-1.5 pt-1">
              {STUDIO_BUILD_SHORTCUTS.map((promptText) => (
                <button
                  key={promptText}
                  type="button"
                  onClick={() => onSubmit(promptText, [])}
                  disabled={isThinking}
                  className="flex w-full items-center gap-2 border border-white/[0.08] bg-[#121211] px-2.5 py-1.5 text-left text-[11px] text-zinc-300 transition-colors hover:border-white/20 hover:bg-[#201F1D] hover:text-white disabled:opacity-40"
                >
                  <Sparkle className="h-2.5 w-2.5 shrink-0 text-zinc-500" />
                  <span>{promptText}</span>
                </button>
              ))}
            </div>
          </ChatEmptyState>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <div key={message.id} className={message.role === 'user' ? 'group flex justify-end' : 'group'}>
                {message.role === 'user' ? (
                  <div className="flex max-w-[94%] items-end justify-end gap-1.5">
                    <GhostIconButton
                      title="Copy prompt"
                      onClick={() => copyText(message.id, message.content)}
                      className="opacity-0 group-hover:opacity-100"
                    >
                      {copiedId === message.id ? (
                        <CheckIcon className="h-3 w-3 text-white" />
                      ) : (
                        <CopyIcon className="h-3 w-3" />
                      )}
                    </GhostIconButton>
                    <div className="min-w-0 max-w-full">
                      {!!message.images?.length && (
                        <div className="mb-1 flex flex-wrap justify-end gap-1">
                          {message.images.map((image) => (
                            <img
                              key={image.id}
                              src={image.dataUrl}
                              alt={image.name}
                              title={image.name}
                              className="h-14 w-14 object-cover"
                            />
                          ))}
                        </div>
                      )}
                      <div className="bg-[#201F1D] px-3 py-2.5 text-[11px] leading-relaxed text-zinc-200">
                        {message.content || (
                          <span className="inline-flex items-center gap-1 text-zinc-500">
                            <ImageIcon className="h-3 w-3" />
                            {message.images?.length === 1 ? 'Reference image' : 'Reference images'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="max-w-[94%]">
                    <div className={`text-[11px] leading-relaxed ${message.isError ? 'text-red-300' : 'text-zinc-300'}`}>
                      {message.content}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                      <MetaLabel>
                        {message.model ? (
                          <span className="truncate">
                            {providerForModel(message.model)} | {apiModelId(message.model)}
                          </span>
                        ) : null}
                      </MetaLabel>
                      <div className="flex shrink-0 items-center gap-1">
                        {!!message.content && (
                          <GhostIconButton
                            title="Copy response"
                            onClick={() => copyText(`reply-${message.id}`, message.content)}
                          >
                            {copiedId === `reply-${message.id}` ? (
                              <CheckIcon className="h-3 w-3 text-white" />
                            ) : (
                              <CopyIcon className="h-3 w-3" />
                            )}
                          </GhostIconButton>
                        )}
                        {!!message.code && (
                          <button
                            onClick={() => onRestoreCode?.(message.id)}
                            title="Put this version back on the canvas"
                            className="border border-white/[0.08] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.08em] text-zinc-400 transition-colors hover:border-white/20 hover:text-white"
                          >
                            {message.durationInFrames ?? 240}f · Restore
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {isThinking && <ThinkingIndicator label="Writing the scene…" />}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="p-3">
        {sceneError && (
          <div className="mb-2 bg-red-950/40 p-2.5">
            <div className="flex items-start gap-2 text-[10px] leading-relaxed text-red-300">
              <ExclamationTriangleIcon className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="break-words font-mono">{sceneError}</span>
            </div>
            {onFixError && (
              <button
                onClick={onFixError}
                disabled={isThinking}
                className="mt-2 w-full bg-red-900/60 py-1.5 text-[10px] font-medium text-red-200 hover:bg-red-800 disabled:opacity-40"
              >
                Ask the assistant to fix it
              </button>
            )}
          </div>
        )}
        {/* Quick actions: shown after first chat as a row above prompt box; hides with animation when text/image added */}
        {messages.length > 0 && (
          <div
            className={`overflow-hidden transition-all duration-200 ease-out ${
              draft.trim() || attachments.length > 0
                ? 'max-h-0 opacity-0 pointer-events-none mb-0'
                : 'max-h-12 opacity-100 mb-2'
            }`}
          >
            <QuickActions
              asRow
              onSend={(promptText) => onSubmit(promptText, [])}
              disabled={isThinking}
            />
          </div>
        )}

        <div className="border border-white/[0.08] bg-[#121211] p-2 transition-colors focus-within:border-white/20">
          {!!attachments.length && (
            <div className="mb-1.5 flex flex-wrap gap-1.5 px-1 pt-1">
              {attachments.map((image) => (
                <div key={image.id} className="group relative">
                  <img
                    src={image.dataUrl}
                    alt={image.name}
                    title={image.name}
                    className="h-12 w-12 object-cover"
                  />
                  <button
                    onClick={() => removeAttachment(image.id)}
                    aria-label={`Remove ${image.name}`}
                    className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center bg-zinc-800 text-zinc-400 hover:bg-red-500 hover:text-white"
                  >
                    <MultiplyIcon className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {attachmentNote && (
            <p className="px-2 pb-1 text-[10px] leading-relaxed text-zinc-400">
              {attachmentNote}
            </p>
          )}
          <textarea
            ref={promptInputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onPaste={(event) => {
              const files = Array.from(event.clipboardData.files).filter((file) =>
                file.type.startsWith('image/'),
              );
              if (files.length) {
                event.preventDefault();
                addFiles(files);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder={
              supportsImages ? 'Direct the graphic — paste a reference image too…' : 'Direct the graphic…'
            }
            className="assistant-prompt-input block min-h-[44px] max-h-40 w-full resize-none border-0 border-none bg-transparent px-2 py-1.5 text-xs leading-relaxed text-white placeholder:text-zinc-600 outline-none ring-0 shadow-none focus:border-none focus:outline-none focus:ring-0"
          />
          <div className="mt-1 flex items-center justify-between gap-2">
            <ModelPicker
              models={settings.modelSlugs}
              value={settings.selectedModel}
              onChange={onModelChange}
              readyProviders={{
                openrouter: Boolean(settings.apiKey.trim()),
                google: Boolean(settings.googleApiKey.trim()),
                openlux: Boolean(settings.openluxApiKey.trim()),
                codex: codexAuth.status === 'authenticated',
              }}
              openLuxApiKey={settings.openluxApiKey}
              spend={spend}
            />
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                multiple
                hidden
                onChange={(event) => {
                  addFiles(Array.from(event.target.files ?? []));
                  event.target.value = '';
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={!supportsImages || attachments.length >= MAX_IMAGES}
                title={
                  supportsImages
                    ? `Attach a reference image (up to ${MAX_IMAGES})`
                    : 'This model does not accept images'
                }
                aria-label="Attach a reference image"
                className="grid h-7 w-7 place-items-center text-zinc-500 hover:bg-[#201F1D] hover:text-white disabled:opacity-25 disabled:hover:bg-transparent"
              >
                <AttachmentIcon className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={send}
                disabled={(!draft.trim() && !attachments.length) || isThinking}
                className="grid h-7 w-7 place-items-center bg-[#2A2928] text-[#299FFF] hover:text-white disabled:bg-transparent disabled:text-zinc-600 transition-colors"
              >
                {isThinking ? (
                  <Spinner className="h-3.5 w-3.5 text-sky-400" />
                ) : (
                  <SendIcon className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {AttachmentIcon, MultiplyIcon, SendIcon, SpinnerIcon} from './MageIcon';
import {Attachment} from '../studio/types';
import {prepareImage} from '../studio/images';

/** How tall the composer may grow before it scrolls instead. */
const MAX_HEIGHT = 148;
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * Chromeless trigger for the composer toolbar: only the send button gets an
 * edge, so the whole thing reads as one field rather than as a form.
 */
export const COMPOSER_CHIP =
  'flex min-w-0 max-w-[170px] items-center gap-1 border-0 bg-transparent px-2 py-1 text-left text-[11px] text-zinc-400 outline-none transition-colors hover:bg-[#201F1D] hover:text-white';

/**
 * The prompt box a project opens on before it has anything in it: one
 * headline, one growing field, and the few controls that change what gets
 * built. Shared by the editor (a script becomes a cut) and the studio (a
 * sentence becomes a graphic), which differ only in their toolbar.
 *
 * The box — not the box plus its headline — is what sits in the centre of the
 * window. The headline hangs above it, so opening the secondary field or
 * pasting a long script never slides the thing you are typing into off-centre.
 */
export const PromptComposer: React.FC<{
  headline: string;
  value: string;
  onChange: (next: string) => void;
  onBlur?: () => void;
  onSubmit: () => void;
  placeholder: string;
  /** A request is in flight: the send button spins and refuses a second one. */
  busy?: boolean;
  /** Tooltip for the send button while busy, e.g. the current phase. */
  busyLabel?: string;
  submitLabel?: string;
  /** Optional secondary field, revealed above the prompt. */
  secondary?: React.ReactNode;
  secondaryOpen?: boolean;
  toolbarLeft?: React.ReactNode;
  toolbarRight?: React.ReactNode;
  /** Attached reference images. */
  images?: Attachment[];
  onImagesChange?: (next: Attachment[]) => void;
  supportsImages?: boolean;
  maxImages?: number;
}> = ({
  headline,
  value,
  onChange,
  onBlur,
  onSubmit,
  placeholder,
  busy = false,
  busyLabel,
  submitLabel = 'Send  (⌘↵)',
  secondary,
  secondaryOpen = false,
  toolbarLeft,
  toolbarRight,
  images = [],
  onImagesChange,
  supportsImages = true,
  maxImages = MAX_IMAGES,
}) => {
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachmentNote, setAttachmentNote] = useState<string>('');
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const hasText = Boolean(value.trim());
  const hasImages = images.length > 0;
  const ready = !busy && (hasText || hasImages);

  /**
   * The field opens at one line and grows with the text up to MAX_HEIGHT, then
   * scrolls. A fixed five-row box spends most of its life empty, and a box with
   * no ceiling pushes its own toolbar off the screen.
   */
  const fit = useCallback(() => {
    const box = boxRef.current;
    if (!box) return;
    box.style.height = 'auto';
    box.style.height = `${Math.min(box.scrollHeight, MAX_HEIGHT)}px`;
  }, []);

  // Re-fit when the value changes from outside, and once on mount.
  useEffect(fit, [fit, value]);

  const addFiles = async (files: File[]) => {
    if (!onImagesChange) return;
    if (!supportsImages) {
      setAttachmentNote('The selected model does not accept reference images.');
      return;
    }
    const room = maxImages - images.length;
    if (room <= 0) {
      setAttachmentNote(`Up to ${maxImages} reference images.`);
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
    if (accepted.length) onImagesChange([...images, ...accepted]);
    setAttachmentNote(notes.join(' '));
  };

  const removeAttachment = (id: string) => {
    if (!onImagesChange) return;
    onImagesChange(images.filter((img) => img.id !== id));
    setAttachmentNote('');
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData?.files ?? []).filter((file) =>
      file.type.startsWith('image/'),
    );
    if (files.length > 0) {
      if (onImagesChange) {
        event.preventDefault();
        void addFiles(files);
      } else {
        setAttachmentNote('Pasting images is not supported here — narration requires text.');
      }
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center overflow-y-auto p-6">
      <div className="relative w-full max-w-[620px]">
        <h2 className="absolute bottom-full left-0 right-0 mb-6 text-center text-[26px] font-medium leading-tight tracking-tight text-zinc-100">
          {headline}
        </h2>

        <div
          onDragOver={(e) => {
            if (onImagesChange && e.dataTransfer.types.includes('Files')) {
              e.preventDefault();
              setIsDraggingOver(true);
            }
          }}
          onDragLeave={(e) => {
            if (e.currentTarget.contains(e.relatedTarget as Node)) return;
            setIsDraggingOver(false);
          }}
          onDrop={(e) => {
            if (!onImagesChange) return;
            e.preventDefault();
            setIsDraggingOver(false);
            const files = Array.from(e.dataTransfer.files).filter((file) =>
              file.type.startsWith('image/'),
            );
            if (files.length > 0) void addFiles(files);
          }}
          className={`rise border bg-[#121211] transition-colors focus-within:border-white/25 ${
            isDraggingOver ? 'border-sky-400/50 bg-[#15191f]' : 'border-white/[0.08]'
          }`}
        >
          {secondary ? (
            // Height cannot transition from `auto`, so the row grows through a
            // grid track instead — smooth, and still sized by its content.
            <div
              className={`grid transition-all duration-200 ease-out ${
                secondaryOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
              }`}
            >
              <div className="overflow-hidden">{secondary}</div>
            </div>
          ) : null}

          {/* Attached image preview tray */}
          {images.length > 0 && (
            <div className="flex flex-wrap gap-2 px-3 pt-3 pb-0.5">
              {images.map((image) => (
                <div
                  key={image.id}
                  className="group relative h-12 w-12"
                  title={image.name}
                >
                  <div className="h-full w-full overflow-hidden border border-white/10 bg-black/40">
                    <img
                      src={image.thumbUrl ?? image.dataUrl}
                      alt={image.name}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeAttachment(image.id)}
                    aria-label={`Remove ${image.name}`}
                    className="absolute -right-1.5 -top-1.5 z-10 grid h-4 w-4 place-items-center bg-zinc-800 text-zinc-300 hover:bg-red-500 hover:text-white transition-colors"
                  >
                    <MultiplyIcon className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {attachmentNote && (
            <p className="px-3 pt-1.5 text-[10px] leading-relaxed text-zinc-400">
              {attachmentNote}
            </p>
          )}

          <textarea
            ref={boxRef}
            value={value}
            onChange={(event) => {
              onChange(event.target.value);
              fit();
            }}
            onBlur={onBlur}
            onPaste={handlePaste}
            onKeyDown={(event) => {
              // Chat-box reflex: send on Cmd/Ctrl+Enter, newline on Enter.
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                if (ready) onSubmit();
              }
            }}
            placeholder={placeholder}
            rows={1}
            autoFocus
            style={{maxHeight: MAX_HEIGHT}}
            className="w-full resize-none overflow-y-auto border-0 bg-transparent px-3 pb-1 pt-3 text-[12px] leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-600"
          />

          <div className="flex items-center gap-0.5 px-1.5 pb-1.5 pt-0.5">
            {onImagesChange && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  multiple
                  hidden
                  onChange={(event) => {
                    void addFiles(Array.from(event.target.files ?? []));
                    event.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!supportsImages || images.length >= maxImages}
                  title={
                    supportsImages
                      ? `Attach reference image (up to ${maxImages})`
                      : 'This model does not accept images'
                  }
                  aria-label="Attach reference image"
                  className="grid h-7 w-7 shrink-0 place-items-center text-zinc-500 hover:bg-[#201F1D] hover:text-white disabled:opacity-25 disabled:hover:bg-transparent transition-colors"
                >
                  <AttachmentIcon className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            {toolbarLeft}
            <div className="min-w-0 flex-1" />
            {toolbarRight}
            <button
              type="button"
              onClick={onSubmit}
              disabled={!ready}
              title={busy ? (busyLabel ?? 'Working…') : submitLabel}
              aria-label={submitLabel}
              className="ml-1 grid h-7 w-7 shrink-0 place-items-center border border-sky-400/25 bg-[#181716] text-zinc-200 transition-all duration-150 hover:border-sky-400/40 hover:bg-[#201F1D] hover:text-white active:scale-[0.97] disabled:cursor-not-allowed disabled:border-white/[0.08] disabled:opacity-35"
            >
              {busy ? (
                <SpinnerIcon className="h-3.5 w-3.5 text-sky-400" />
              ) : (
                <SendIcon className="h-3.5 w-3.5 text-sky-400" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

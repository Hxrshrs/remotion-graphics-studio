import React, {useEffect, useMemo, useRef, useState} from 'react';
import {CheckIcon, DownloadIcon, EyeIcon, EyeOffIcon, MultiplyIcon, PlusIcon, TrashIcon, UploadIcon} from './MageIcon';
import {CustomSelect} from './CustomSelect';
import {startCodexLogin, useCodexAuth} from '../studio/codex';
import {sanitizeApiKey} from '../studio/models';
import {StudioSettings} from '../studio/types';

type SettingsModalProps = {
  settings: StudioSettings;
  onSave: (settings: StudioSettings) => void;
  onClose: () => void;
};

/** Which key an entry holds. Also the identity used to toggle its reveal. */
type KeyField = keyof Pick<
  StudioSettings,
  'apiKey' | 'googleApiKey' | 'openluxApiKey' | 'cartesiaApiKey' | 'giphyApiKey' | 'serperApiKey'
>;

/**
 * Keys are entered the way environment variables are: pick the provider, paste
 * the value, add it, and it joins a list of what this browser holds.
 *
 * The panel used to be a grid of six permanent cards, one per provider, each
 * with its own always-visible password field. That shape asserted that every
 * provider is a thing you are part-way through configuring — five empty boxes
 * shouting at someone who only ever uses one model — and it grew by a whole
 * card every time a provider was added. A list only shows what actually
 * exists, so the panel now answers "what do I have?" at a glance, and the
 * provider dropdown carries the full catalogue for discovery instead of the
 * page.
 */
const PROVIDERS: Array<{
  field: KeyField;
  label: string;
  placeholder: string;
  hint: string;
}> = [
  {
    field: 'apiKey',
    label: 'OpenRouter',
    placeholder: 'sk-or-v1-…',
    hint: 'Most scene models. Sent only to OpenRouter.',
  },
  {
    field: 'googleApiKey',
    label: 'Google AI Studio',
    placeholder: 'AIzaSy…',
    hint: 'Gemini models, the quick fix pass, and the photo picker.',
  },
  {
    field: 'openluxApiKey',
    label: 'OpenLux',
    placeholder: 'lux_…',
    hint: 'OpenLux models and the shot planner.',
  },
  {
    field: 'cartesiaApiKey',
    label: 'Cartesia',
    placeholder: 'sk_car_…',
    hint: 'Voiceover and the word timing every reveal is cued to.',
  },
  {
    field: 'serperApiKey',
    label: 'serper.dev',
    placeholder: 'serper.dev key…',
    hint: 'Real photographs for shots that name a real thing. Needs the Google key too.',
  },
  {
    field: 'giphyApiKey',
    label: 'Giphy',
    placeholder: 'Giphy key…',
    hint: 'Verified Trending clips for reaction beats.',
  },
];

const providerFor = (field: KeyField) =>
  PROVIDERS.find((provider) => provider.field === field) ?? PROVIDERS[0];

/**
 * Enough of the key to recognise which one it is, never enough to use.
 * The head is the provider's own prefix and the tail is what distinguishes two
 * keys from the same account, which together are what someone checking their
 * settings actually needs to see.
 */
const maskKey = (key: string) =>
  key.length <= 12
    ? '•'.repeat(Math.max(6, key.length))
    : `${key.slice(0, 5)}${'•'.repeat(8)}${key.slice(-4)}`;

const StatusDot: React.FC<{tone: 'on' | 'off' | 'busy'}> = ({tone}) => (
  <span
    className={`h-1.5 w-1.5 shrink-0 ${
      tone === 'on' ? 'bg-emerald-400' : tone === 'busy' ? 'bg-white' : 'bg-zinc-700'
    }`}
  />
);

const SectionLabel: React.FC<{children: React.ReactNode; note?: string}> = ({children, note}) => (
  <div className="mb-2 flex items-baseline justify-between gap-3">
    <h3 className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-400">{children}</h3>
    {note ? <span className="text-[10px] text-zinc-600">{note}</span> : null}
  </div>
);

export const SettingsModal: React.FC<SettingsModalProps> = ({settings, onSave, onClose}) => {
  const [draft, setDraft] = useState(settings);
  const [revealed, setRevealed] = useState<KeyField | null>(null);
  const [codexLoginBusy, setCodexLoginBusy] = useState(false);
  const [codexLoginError, setCodexLoginError] = useState('');
  const [importError, setImportError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {auth: codexAuth, refresh: refreshCodexAuth} = useCodexAuth();

  const has = (field: KeyField) => Boolean(sanitizeApiKey(draft[field] ?? ''));

  /** The list is what exists; the dropdown is the whole catalogue. */
  const entries = PROVIDERS.filter((provider) => has(provider.field));
  const firstUnset = PROVIDERS.find((provider) => !has(provider.field)) ?? PROVIDERS[0];

  const [pending, setPending] = useState<KeyField>(firstUnset.field);
  const [pendingValue, setPendingValue] = useState('');

  const dirty = useMemo(
    () => PROVIDERS.some(({field}) => (draft[field] ?? '') !== (settings[field] ?? '')),
    [draft, settings],
  );

  const pendingProvider = providerFor(pending);
  const pendingClean = sanitizeApiKey(pendingValue);
  const replacing = has(pending);

  const addKey = () => {
    if (!pendingClean) return;
    setDraft((current) => ({...current, [pending]: pendingClean}));
    setPendingValue('');
    // Move to the next provider still missing a key, so adding several in a
    // row never means reaching for the dropdown between each one.
    const next = PROVIDERS.find(
      (provider) => provider.field !== pending && !sanitizeApiKey(draft[provider.field] ?? ''),
    );
    if (next) setPending(next.field);
  };

  const removeKey = (field: KeyField) => {
    setDraft((current) => ({...current, [field]: ''}));
    if (revealed === field) setRevealed(null);
  };

  /** Download every setting — keys, model choice, pinned models — as JSON. */
  const exportSettings = () => {
    const payload = JSON.stringify(
      {
        app: 'rendr-studio-settings',
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: draft,
      },
      null,
      2,
    );
    const url = URL.createObjectURL(new Blob([payload], {type: 'application/json'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'rendr-settings.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  /** Read a backup file back into the draft. Nothing is saved until Save. */
  const importSettingsFile = async (file: File) => {
    setImportError('');
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const raw =
        parsed !== null &&
        typeof parsed === 'object' &&
        'settings' in parsed &&
        (parsed as {settings?: unknown}).settings !== null &&
        typeof (parsed as {settings?: unknown}).settings === 'object'
          ? ((parsed as {settings: Record<string, unknown>}).settings as Record<string, unknown>)
          : (parsed as Record<string, unknown> | null);
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error('Not a settings backup.');
      }
      const str = (value: unknown) => (typeof value === 'string' ? value : '');
      const keyOr = (value: unknown, fallback: string) =>
        value === undefined ? fallback : sanitizeApiKey(str(value));
      const slugs = Array.isArray(raw.modelSlugs)
        ? raw.modelSlugs.filter(
            (slug): slug is string => typeof slug === 'string' && slug.trim() !== '',
          )
        : draft.modelSlugs;
      const next: StudioSettings = {
        ...draft,
        apiKey: keyOr(raw.apiKey, draft.apiKey),
        cartesiaApiKey: keyOr(raw.cartesiaApiKey, draft.cartesiaApiKey),
        googleApiKey: keyOr(raw.googleApiKey, draft.googleApiKey),
        openluxApiKey: keyOr(raw.openluxApiKey, draft.openluxApiKey),
        giphyApiKey: keyOr(raw.giphyApiKey, draft.giphyApiKey),
        serperApiKey: keyOr(raw.serperApiKey, draft.serperApiKey),
        modelSlugs: slugs,
        selectedModel: str(raw.selectedModel) || draft.selectedModel,
      };
      setDraft(next);
      // A revealed key that the import just cleared has nothing left to show.
      setRevealed((current) =>
        current && !sanitizeApiKey(next[current] ?? '') ? null : current,
      );
    } catch {
      setImportError('That file is not a settings backup.');
    }
  };

  const loginWithCodex = async () => {
    setCodexLoginBusy(true);
    setCodexLoginError('');
    const result = await startCodexLogin();
    if (!result.ok) setCodexLoginError(result.detail ?? 'Could not start Codex sign-in.');
    setCodexLoginBusy(false);
    if (result.ok) {
      // The CLI opens the OAuth browser flow. Give it a moment, then refresh;
      // the user can press the button again if the browser flow is still open.
      window.setTimeout(() => void refreshCodexAuth(), 1500);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      // The save button can be a scroll away on a short window.
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) onSave(draft);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, onSave, draft]);

  const codexStatus =
    codexAuth.status === 'authenticated'
      ? {tone: 'on' as const, text: 'Connected'}
      : codexAuth.status === 'checking'
        ? {tone: 'busy' as const, text: 'Checking…'}
        : {tone: 'off' as const, text: codexAuth.status === 'signed_out' ? 'Not connected' : 'Unavailable'};

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
      onMouseDown={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-2xl flex-col bg-[#181716]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-5 pb-4 pt-5">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-white">Settings</h2>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              {entries.length} of {PROVIDERS.length} keys set · stored in this browser only, never
              sent anywhere but the service each one belongs to.
            </p>
          </div>
          <button
            aria-label="Close settings"
            onClick={onClose}
            className="p-1.5 text-zinc-500 hover:bg-[#2A2928] hover:text-white"
          >
            <MultiplyIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          <section>
            <SectionLabel note={`${entries.length} added`}>Keys</SectionLabel>

            {/* Add row: provider, value, add. */}
            <div className="bg-[#121211] p-3">
              <div className="flex items-center gap-2">
                <CustomSelect<KeyField>
                  value={pending}
                  onChange={(field) => {
                    setPending(field);
                    setPendingValue('');
                  }}
                  className="w-44 shrink-0"
                  options={PROVIDERS.map((provider) => ({
                    value: provider.field,
                    label: provider.label,
                    hint: sanitizeApiKey(draft[provider.field] ?? '') ? 'Key set' : undefined,
                  }))}
                />
                <div className="flex min-w-0 flex-1 items-center bg-[#0D0D0C] px-2.5">
                  <input
                    type="password"
                    value={pendingValue}
                    onChange={(event) => setPendingValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addKey();
                      }
                    }}
                    placeholder={pendingProvider.placeholder}
                    spellCheck={false}
                    autoComplete="off"
                    aria-label={`${pendingProvider.label} key`}
                    className="min-w-0 flex-1 border-0 border-none py-2 font-mono text-[11px] text-white shadow-none outline-none ring-0 placeholder:text-zinc-600 focus:border-none focus:outline-none focus:ring-0"
                  />
                </div>
                <button
                  onClick={addKey}
                  disabled={!pendingClean}
                  className="inline-flex shrink-0 items-center gap-1.5 bg-[#2A2928] px-3 py-2 text-[11px] font-medium text-white hover:brightness-125 disabled:opacity-40 disabled:hover:brightness-100"
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                  {replacing ? 'Replace' : 'Add'}
                </button>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                {replacing
                  ? `${pendingProvider.label} already has a key. Adding one replaces it.`
                  : pendingProvider.hint}
              </p>
            </div>

            {/* The list itself is capped and scrolls, so the panel keeps its
                shape as providers are added rather than growing a row at a
                time until the footer is pushed off screen. */}
            <div className="mt-2 max-h-[220px] overflow-y-auto">
              {entries.length === 0 ? (
                <div className="bg-[#121211] px-3 py-6 text-center">
                  <p className="text-[11px] text-zinc-500">No keys yet.</p>
                  <p className="mt-1 text-[11px] text-zinc-600">
                    Pick a provider above and paste its key to get started.
                  </p>
                </div>
              ) : (
                <ul className="flex flex-col gap-px">
                  {entries.map(({field, label, hint}) => {
                    const value = sanitizeApiKey(draft[field] ?? '');
                    const isRevealed = revealed === field;
                    return (
                      <li
                        key={field}
                        className="flex items-center gap-3 border-l-2 border-emerald-400/70 bg-[#121211] py-2 pl-3 pr-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-xs font-medium text-zinc-200">
                              {label}
                            </span>
                            <span className="inline-flex shrink-0 items-center gap-1.5 text-[10px] text-emerald-400/90">
                              <StatusDot tone="on" />
                              Available
                            </span>
                          </div>
                          <p className="mt-0.5 truncate font-mono text-[10px] text-zinc-500">
                            {isRevealed ? value : maskKey(value)}
                          </p>
                        </div>
                        <span className="hidden min-w-0 max-w-[38%] shrink truncate text-[10px] text-zinc-600 sm:block">
                          {hint}
                        </span>
                        <button
                          aria-label={`${isRevealed ? 'Hide' : 'Show'} ${label} key`}
                          onClick={() => setRevealed(isRevealed ? null : field)}
                          className="shrink-0 p-1 text-zinc-600 hover:text-zinc-300"
                        >
                          {isRevealed ? (
                            <EyeOffIcon className="h-3.5 w-3.5" />
                          ) : (
                            <EyeIcon className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          aria-label={`Remove ${label} key`}
                          onClick={() => removeKey(field)}
                          className="shrink-0 p-1 text-zinc-600 hover:text-red-400"
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          <section className="mt-5">
            <SectionLabel note="no key needed">Connections</SectionLabel>
            <div className="flex items-center gap-3 bg-[#121211] py-2 pl-3 pr-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-xs font-medium text-zinc-200">OpenAI Codex</span>
                  <span className="inline-flex shrink-0 items-center gap-1.5 text-[10px] text-zinc-500">
                    <StatusDot tone={codexStatus.tone} />
                    {codexStatus.text}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[10px] text-zinc-500">
                  {codexLoginError ||
                    (codexAuth.status === 'authenticated'
                      ? codexAuth.detail || 'Signed in'
                      : 'Uses the Codex desktop/CLI session on this machine.')}
                </p>
              </div>
              <button
                onClick={loginWithCodex}
                disabled={codexLoginBusy}
                className="inline-flex shrink-0 items-center gap-1.5 bg-[#2A2928] px-2.5 py-1.5 text-[11px] font-medium text-white hover:brightness-125 disabled:opacity-40"
              >
                {codexAuth.status === 'authenticated' && !codexLoginBusy ? (
                  <CheckIcon className="h-3.5 w-3.5" />
                ) : null}
                {codexLoginBusy
                  ? 'Opening…'
                  : codexAuth.status === 'authenticated'
                    ? 'Re-authenticate'
                    : 'Sign in'}
              </button>
            </div>
          </section>

          <section className="mt-5">
            <SectionLabel note="json file">Backup</SectionLabel>
            <div className="flex items-center gap-2 bg-[#121211] p-3">
              <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-zinc-500">
                Export every key, the model choice, and pinned models to a file.
                Import it on another machine to restore them — nothing applies
                until you press Save.
              </p>
              <button
                onClick={exportSettings}
                className="inline-flex shrink-0 items-center gap-1.5 bg-[#2A2928] px-2.5 py-1.5 text-[11px] font-medium text-white hover:brightness-125"
              >
                <DownloadIcon className="h-3.5 w-3.5" />
                Export
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex shrink-0 items-center gap-1.5 bg-[#2A2928] px-2.5 py-1.5 text-[11px] font-medium text-white hover:brightness-125"
              >
                <UploadIcon className="h-3.5 w-3.5" />
                Import
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                aria-label="Import settings file"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void importSettingsFile(file);
                }}
              />
            </div>
            {importError ? (
              <p className="mt-2 text-[11px] text-red-400">{importError}</p>
            ) : null}
          </section>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[#242322] px-5 py-3">
          <span className="text-[11px] text-zinc-600">
            {dirty ? 'Unsaved changes' : 'All changes saved'}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-2 text-xs text-zinc-500 hover:text-white">
              Cancel
            </button>
            <button
              onClick={() => onSave(draft)}
              disabled={!dirty}
              className="bg-[#2A2928] px-4 py-2 text-xs font-medium text-zinc-200 transition-colors hover:text-white hover:brightness-125 disabled:opacity-40 disabled:hover:text-zinc-200 disabled:hover:brightness-100"
            >
              Save settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

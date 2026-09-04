import React, {useEffect, useMemo, useState} from 'react';
import {createPortal} from 'react-dom';
import {CheckIcon, ChevronDownIcon, ImageIcon, KeyIcon, SearchIcon} from './MageIcon';
import {openRouterModelList, useOpenRouterCatalog} from '../studio/catalog';
import {
  CODEX_MODELS,
  GOOGLE_MODELS,
  PROVIDER_LABEL,
  Provider,
  apiModelId,
  isFreeProvider,
  isSubscriptionProvider,
  providerForModel,
} from '../studio/models';
import {useOpenLuxCatalog} from '../studio/openluxCatalog';
import {SpendMap, formatUsd} from '../studio/spend';
import {useFloatingPanel} from './useFloatingPanel';

/** A row in the dropdown: a fixed-registry model or any model OpenRouter serves. */
type PickerOption = {
  id: string;
  label: string;
  provider: Provider;
  supportsImages: boolean;
  promptPrice?: number | null;
  completionPrice?: number | null;
};

type ModelPickerProps = {
  /** Slugs the user pinned in Settings; kept even when the catalog is down. */
  models: string[];
  value: string;
  onChange: (model: string) => void;
  /** Which providers have a key configured, so unusable models read as such. */
  readyProviders?: Record<Provider, boolean>;
  openLuxApiKey: string;
  /** What each model has cost so far. */
  spend?: SpendMap;
  className?: string;
  buttonClassName?: string;
};

const PROVIDERS: Provider[] = ['google', 'codex', 'openlux', 'openrouter'];

export const ModelPicker: React.FC<ModelPickerProps> = ({
  models,
  value,
  onChange,
  readyProviders,
  openLuxApiKey,
  spend = {},
  className,
  buttonClassName,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const {anchorRef, panelRef, panelStyle} = useFloatingPanel<HTMLButtonElement>(open, {
    width: 'anchor',
    minWidth: 288,
    maxHeight: 400,
    minBelow: 240,
  });
  const catalog = useOpenRouterCatalog(open || providerForModel(value) === 'openrouter');
  const openLuxModels = useOpenLuxCatalog(
    openLuxApiKey,
    open || providerForModel(value) === 'openlux',
  );

  const openRouterOptions = useMemo<PickerOption[]>(
    () =>
      openRouterModelList(catalog, models).map((entry) => ({
        id: entry.id,
        label: entry.label,
        provider: 'openrouter',
        supportsImages: entry.supportsImages,
        promptPrice: entry.promptPrice,
        completionPrice: entry.completionPrice,
      })),
    [catalog, models],
  );

  const allOptions = useMemo<PickerOption[]>(() => {
    const google: PickerOption[] = GOOGLE_MODELS.map((model) => ({...model}));
    const openlux: PickerOption[] = openLuxModels.map((model) => ({
      ...model,
      provider: 'openlux',
    }));
    const codex: PickerOption[] = CODEX_MODELS.map((model) => ({...model}));
    return [...google, ...codex, ...openlux, ...openRouterOptions];
  }, [openLuxModels, openRouterOptions]);

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const match = (option: PickerOption) =>
      !needle ||
      option.id.toLowerCase().includes(needle) ||
      option.label.toLowerCase().includes(needle);
    return PROVIDERS.map((provider) => ({
      provider,
      options: allOptions.filter((option) => option.provider === provider && match(option)),
    })).filter((group) => group.options.length);
  }, [allOptions, query]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!anchorRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', closeOnOutside);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('mousedown', closeOnOutside);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open ]);

  const selectedLabel =
    GOOGLE_MODELS.find((model) => model.id === value)?.label ??
    CODEX_MODELS.find((model) => model.id === value)?.label ??
    openLuxModels.find((model) => model.id === value)?.label ??
    catalog[value]?.name ??
    apiModelId(value);


  const perMillion = (price: number) =>
    `$${(price * 1_000_000).toFixed(price * 1_000_000 >= 1 ? 2 : 3)}`;

  const priceLabel = (option: PickerOption) => {
    if (isFreeProvider(option.provider)) return 'Free';
    if (isSubscriptionProvider(option.provider)) return 'Included with Codex plan';
    const used = spend[option.id];
    if (used?.runs) return `${formatUsd(used.cost)} · ${used.runs} run${used.runs === 1 ? '' : 's'}`;
    if (option.provider === 'openlux') return 'OpenLux billing';
    if (option.promptPrice === 0 && option.completionPrice === 0) return 'Free';
    if (option.promptPrice == null || option.completionPrice == null) return 'No runs yet';
    return `${perMillion(option.promptPrice)}/M in · ${perMillion(option.completionPrice)}/M out`;
  };

  const select = (model: string) => {
    onChange(model);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className={`relative min-w-0 ${className ?? ''}`}>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className={
          buttonClassName ||
          'flex max-w-[210px] items-center gap-2 border border-white/[0.08] bg-[#121211] px-2.5 py-1.5 text-left text-[11px] text-zinc-300 hover:bg-[#201F1D]'
        }
        title={value}
      >
        <span className="min-w-0 flex-1 truncate font-mono">{selectedLabel}</span>
        <ChevronDownIcon
          className={`h-3 w-3 shrink-0 text-zinc-500 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={panelStyle}
            className="rise flex flex-col overflow-hidden border border-white/10 bg-[#181716] p-2"
          >
          <div className="relative mb-1.5 shrink-0">
            <SearchIcon className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search models"
              className="w-full border-0 border-none bg-[#121211] py-2 pl-8 pr-2 text-xs text-white outline-none ring-0 shadow-none placeholder:text-zinc-600 focus:border-none focus:outline-none focus:ring-0"
            />
          </div>
          <div className="max-h-72 min-h-0 flex-1 space-y-1 overflow-y-auto">
            {groups.map((group) => {
              const ready = readyProviders?.[group.provider] ?? true;
              return (
                <div key={group.provider}>
                  <div className="flex items-center gap-1.5 px-2.5 pb-1 pt-1.5 text-[9px] font-medium uppercase tracking-[0.13em] text-zinc-600">
                    <span>{PROVIDER_LABEL[group.provider]}</span>
                    <span className="text-zinc-700">{group.options.length}</span>
                    {!ready && (
                      <span
                        title="No API key set for this provider"
                        className="inline-flex items-center gap-1 text-zinc-700"
                      >
                        <KeyIcon className="h-2.5 w-2.5" /> no key
                      </span>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    {group.options.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => select(option.id)}
                        className="flex w-full items-start gap-2 px-2.5 py-2 text-left hover:bg-[#2A2928]"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span
                              className={`min-w-0 flex-1 truncate font-mono text-[11px] ${ready ? 'text-zinc-300' : 'text-zinc-600'}`}
                            >
                              {option.label}
                            </span>
                            {option.supportsImages && (
                              <ImageIcon
                                className="h-2.5 w-2.5 shrink-0 text-zinc-600"
                                aria-label="Accepts images"
                              />
                            )}
                          </span>
                          <span
                            className={`mt-0.5 block font-mono text-[9px] ${isFreeProvider(option.provider) ? 'text-emerald-500/80' : 'text-zinc-600'}`}
                          >
                            {priceLabel(option)}
                          </span>
                        </span>
                        {option.id === value && (
                          <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {!groups.length && (
              <p className="px-2.5 py-4 text-center text-[11px] text-zinc-600">
                No model matches.
              </p>
            )}
          </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

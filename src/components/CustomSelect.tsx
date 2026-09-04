import {useEffect, useState} from 'react';
import {createPortal} from 'react-dom';
import {CheckIcon, ChevronDownIcon} from './MageIcon';
import {useFloatingPanel} from './useFloatingPanel';

export type SelectOption<T extends string = string> = {
  value: T;
  label: string;
  hint?: string;
};

type CustomSelectProps<T extends string = string> = {
  value: T;
  options: Array<SelectOption<T>>;
  onChange: (value: T) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  /** Full override for the trigger's classes, for borderless toolbar chips. */
  buttonClassName?: string;
  /** Floor for the panel width, so long labels and hints are not clipped by a
   *  trigger that is deliberately narrow. */
  menuMinWidth?: number;
};

export function CustomSelect<T extends string = string>({
  value,
  options,
  onChange,
  disabled = false,
  placeholder = 'Select…',
  className = '',
  buttonClassName,
  menuMinWidth,
}: CustomSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const {anchorRef, panelRef, panelStyle} = useFloatingPanel<HTMLDivElement>(open, {
    width: 'anchor',
    minWidth: menuMinWidth,
    maxHeight: 240,
  });

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
  }, [open]);

  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <div ref={anchorRef} className={`relative select-none ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={
          buttonClassName
            ? `${buttonClassName} ${disabled ? 'cursor-not-allowed opacity-40' : ''}`
            : `flex w-full items-center justify-between border border-white/[0.08] bg-[#121211] px-2.5 py-1.5 text-[11px] text-zinc-200 outline-none transition-colors ${
                disabled
                  ? 'cursor-not-allowed opacity-40'
                  : 'cursor-pointer hover:bg-[#201F1D] focus:border-white/20'
              }`
        }
      >
        <span className="truncate text-left">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDownIcon
          className={`h-3 w-3 shrink-0 text-zinc-500 transition-transform duration-150 ${
            open ? 'rotate-180 text-zinc-300' : ''
          }`}
        />
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="listbox"
            style={panelStyle}
            className="rise overflow-y-auto border border-white/[0.08] bg-[#121211] p-0.5 shadow-none"
          >
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[11px] transition-colors ${
                    isSelected
                      ? 'bg-[#2A2928] text-white font-medium'
                      : 'text-zinc-400 hover:bg-[#201F1D] hover:text-zinc-200'
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {opt.hint && (
                      <span className="font-mono text-[9px] text-zinc-500">
                        {opt.hint}
                      </span>
                    )}
                    {isSelected ? (
                      <CheckIcon className="h-3 w-3 text-white" />
                    ) : (
                      <span className="w-3" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}

import React, {useEffect, useRef, useState} from 'react';
import {CheckIcon} from './MageIcon';

export type MenuItem = {
  key: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** A checkmark, e.g. a pipeline stage that has already run. */
  active?: boolean;
  /** A short right-aligned footnote, e.g. a count. */
  hint?: string;
};

type DropdownMenuProps = {
  /** The trigger button content. */
  children: React.ReactNode;
  items: Array<MenuItem | 'divider'>;
  /** Which edge of the trigger the panel hangs from. */
  align?: 'left' | 'right';
  buttonClassName?: string;
  title?: string;
};

export const DropdownMenu: React.FC<DropdownMenuProps> = ({
  children,
  items,
  align = 'right',
  buttonClassName = '',
  title,
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
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

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((current) => !current)}
        title={title}
        aria-label={title}
        aria-haspopup="menu"
        aria-expanded={open}
        className={buttonClassName}
      >
        {children}
      </button>
      {open ? (
        <div
          role="menu"
          className={`absolute top-full z-50 mt-1 min-w-[210px] bg-[#201F1D] p-1 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {items.map((item, index) =>
            item === 'divider' ? (
              <div key={`divider-${index}`} className="my-1 h-px bg-[#2a2a2a]" />
            ) : (
              <button
                key={item.key}
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  item.onClick();
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
                  item.danger
                    ? 'text-[#ff9c9c] hover:bg-red-400/10'
                    : 'text-zinc-300 hover:bg-[#2A2928] hover:text-white'
                }`}
              >
                {item.icon ? (
                  <span className="shrink-0 text-zinc-500">{item.icon}</span>
                ) : null}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.hint ? (
                  <span className="shrink-0 font-mono text-[9px] text-zinc-500">
                    {item.hint}
                  </span>
                ) : null}
                {item.active ? (
                  <CheckIcon className="h-3 w-3 shrink-0 text-white" />
                ) : null}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
};
import React, {useState} from 'react';
import {CheckIcon, CopyIcon} from './MageIcon';

type CopyButtonProps = {
  value: string;
  title?: string;
  className?: string;
};

/** Tiny copy-to-clipboard affordance for error and log text. */
export const CopyButton: React.FC<CopyButtonProps> = ({
  value,
  title = 'Copy',
  className = '',
}) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard can be unavailable in insecure or embedded previews.
    }
  };

  return (
    <button
      onClick={copy}
      title={title}
      aria-label={title}
      className={`grid h-6 w-6 shrink-0 place-items-center transition-colors ${
        copied
          ? 'text-[#ffcf4a]'
          : 'text-zinc-600 hover:bg-white/5 hover:text-white'
      } ${className}`}
    >
      {copied ? <CheckIcon className="h-3 w-3" /> : <CopyIcon className="h-3 w-3" />}
    </button>
  );
};
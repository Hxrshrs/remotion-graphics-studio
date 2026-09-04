import React from 'react';
import {DownloadIcon, LayoutLeftIcon, LayoutRightIcon, VideoIcon} from './MageIcon';

interface TopNavProps {
  isLeftOpen: boolean;
  onToggleLeft: () => void;
  isRightOpen: boolean;
  onToggleRight: () => void;
  graphicName: string;
}

export const TopNav: React.FC<TopNavProps> = ({
  isLeftOpen,
  onToggleLeft,
  isRightOpen,
  onToggleRight,
  graphicName,
}) => {
  return (
    <header className="w-full h-10 bg-surface px-3 flex items-center justify-between select-none">
      {/* Brand & Left Drawer Toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleLeft}
          title={isLeftOpen ? 'Collapse library' : 'Expand library'}
          className={`p-1.5 transition-colors ${
            isLeftOpen
              ? 'text-white bg-surface-raised'
              : 'text-zinc-500 hover:text-white hover:bg-surface-raised'
          }`}
        >
          <LayoutLeftIcon className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 pl-0.5">
          <div className="w-5 h-5 bg-[#201F1D] flex items-center justify-center text-zinc-300">
            <VideoIcon className="w-3 h-3" />
          </div>
          <span className="text-xs font-semibold text-white tracking-widest uppercase font-mono">
            Remotion
          </span>
        </div>
      </div>

      {/* Middle Active Graphic Name */}
      <div className="flex items-center gap-2 px-3 py-1 bg-surface-raised text-xs text-zinc-300 font-mono">
        <span className="text-white">{graphicName}</span>
        <span className="text-zinc-600">•</span>
        <span className="text-zinc-500 text-[11px]">1080p @ 60fps</span>
      </div>

      {/* Right Actions & Right Drawer Toggle */}
      <div className="flex items-center gap-1">
        <button
          onClick={onToggleRight}
          title={isRightOpen ? 'Collapse properties' : 'Expand properties'}
          className={`p-1.5 transition-colors ${
            isRightOpen
              ? 'text-white bg-surface-raised'
              : 'text-zinc-500 hover:text-white hover:bg-surface-raised'
          }`}
        >
          <LayoutRightIcon className="w-4 h-4" />
        </button>

        <button
          onClick={() => {
            alert('Export configuration copied to clipboard.');
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-raised hover:bg-surface-active text-xs font-medium text-white transition-colors font-mono"
        >
          <DownloadIcon className="w-3.5 h-3.5 text-zinc-400" />
          <span>Export</span>
        </button>
      </div>
    </header>
  );
};

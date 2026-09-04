import React from 'react';
import {
  BurstIcon,
  DownloadIcon,
  MessageDotsIcon,
  SpinnerIcon,
  VideoIcon,
} from './MageIcon';

type MageWrapperProps = {
  className?: string;
  style?: React.CSSProperties;
};

/** Render/export action: filled file-download glyph. */
export const RenderIcon: React.FC<MageWrapperProps> = ({className = 'h-4 w-4', style}) => (
  <DownloadIcon className={className} style={style} />
);

/** Studio chat entry: filled chat bubble with three dots. */
export const StudioChatIcon: React.FC<MageWrapperProps> = ({className = 'h-4 w-4', style}) => (
  <MessageDotsIcon className={className} style={style} />
);

/** Editor cut entry: Mage Video. */
export const EditorCutIcon: React.FC<MageWrapperProps> = ({className = 'h-4 w-4', style}) => (
  <VideoIcon className={className} style={style} />
);

/** AI generate mark: filled burst, inherits text color via currentColor. */
export const GenerateIcon: React.FC<MageWrapperProps> = ({className = 'h-4 w-4', style}) => (
  <BurstIcon className={className} style={style} />
);

/** Loading spinner: modern clean circular spinner. */
export const Spinner: React.FC<MageWrapperProps> = ({className = 'h-3.5 w-3.5', style}) => (
  <SpinnerIcon className={className} style={style} />
);

export const ChatLoader = Spinner;

export const PanelExpandIcon: React.FC<React.SVGProps<SVGSVGElement>> = ({
  className = 'h-3.5 w-3.5',
  ...props
}) => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <path
      d="M22.0001 8.75006V15.2501C21.9979 16.895 21.3952 18.4826 20.3051 19.7145C19.2149 20.9464 17.7126 21.7378 16.0801 21.9401V2.06006C17.7126 2.26233 19.2149 3.05375 20.3051 4.28564C21.3952 5.51754 21.9979 7.1051 22.0001 8.75006Z"
      fill="currentColor"
    />
    <path
      d="M14.08 2V22H8.75C6.9606 21.9974 5.24528 21.2853 3.97998 20.0201C2.71468 18.7548 2.00265 17.0394 2 15.25V8.75C2.00265 6.9606 2.71468 5.24525 3.97998 3.97995C5.24528 2.71465 6.9606 2.00265 8.75 2H14.08Z"
      fill="currentColor"
    />
  </svg>
);

export const PanelCollapseIcon: React.FC<React.SVGProps<SVGSVGElement>> = ({
  className = 'h-3.5 w-3.5',
  ...props
}) => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <path
      d="M7.92004 2.06006V21.9401C6.28757 21.7378 4.78505 20.9464 3.69495 19.7145C2.60484 18.4826 2.00214 16.895 2 15.2501V8.75006C2.00214 7.1051 2.60484 5.51754 3.69495 4.28564C4.78505 3.05375 6.28757 2.26233 7.92004 2.06006Z"
      fill="currentColor"
    />
    <path
      d="M21.9999 8.75V15.25C21.9972 17.0394 21.2852 18.7548 20.0199 20.0201C18.7546 21.2853 17.0393 21.9974 15.2499 22H9.91992V2H15.2499C17.0393 2.00265 18.7546 2.71465 20.0199 3.97995C21.2852 5.24525 21.9972 6.9606 21.9999 8.75Z"
      fill="currentColor"
    />
  </svg>
);

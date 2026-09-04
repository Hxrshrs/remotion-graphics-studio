import React, {useState} from 'react';
import {Img} from 'remotion';

type WebImageProps = {
  /** A real https:// image URL. Only https is accepted. */
  src: string;
  /** Shown while loading or when the URL fails to load. */
  fallback?: React.ReactNode;
  style?: React.CSSProperties;
};

/**
 * A real photo or logo from the web, with a safe fallback.
 *
 * The studio never trusts a URL: only https:// is accepted, and if the image
 * cannot load, `fallback` renders instead, so a broken hotlink never blanks
 * the shot. The model is told to use only URLs it is confident exist.
 */
export const WebImage: React.FC<WebImageProps> = ({src, fallback, style}) => {
  const [failed, setFailed] = useState(false);
  const safe = /^https:\/\//i.test(src.trim()) ? src.trim() : null;
  if (!safe || failed) return <>{fallback ?? null}</>;
  return <Img src={safe} style={style} onError={() => setFailed(true)} />;
};
import React, {useState} from 'react';
import {Video} from '@remotion/media';

type GiphyClipProps = {
  /** Exact MP4 rendition returned by the current GIPHY Trending response. */
  src: string;
  /** Exact public GIPHY page returned alongside the rendition. */
  sourceUrl: string;
  title?: string;
  width?: number | string;
  height?: number | string;
  radius?: number;
  fit?: React.CSSProperties['objectFit'];
  style?: React.CSSProperties;
};

const approvedUrl = (value: string) => {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && (host === 'giphy.com' || host.endsWith('.giphy.com'));
  } catch {
    return false;
  }
};

/** A muted, frame-accurate GIPHY MP4 with mandatory on-frame attribution. */
export const GiphyClip: React.FC<GiphyClipProps> = ({
  src,
  sourceUrl,
  title = 'GIPHY GIF',
  width = 640,
  height = 360,
  radius = 24,
  fit = 'cover',
  style,
}) => {
  const [failed, setFailed] = useState(false);
  const valid = approvedUrl(src) && approvedUrl(sourceUrl);
  return (
    <div
      aria-label={title}
      style={{
        position: 'relative',
        width,
        height,
        borderRadius: radius,
        overflow: 'hidden',
        background: '#151515',
        ...style,
      }}
    >
      {valid && !failed ? (
        <Video
          src={src}
          muted
          loop
          onError={() => {
            setFailed(true);
            return 'fail';
          }}
          style={{width: '100%', height: '100%', objectFit: fit, display: 'block'}}
        />
      ) : (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            font: '700 26px/1 sans-serif',
          }}
        >
          GIF unavailable
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          right: 12,
          bottom: 12,
          padding: '7px 10px',
          borderRadius: 7,
          background: '#000',
          color: '#fff',
          font: '800 14px/1 sans-serif',
          letterSpacing: '0.06em',
        }}
      >
        POWERED BY GIPHY
      </div>
    </div>
  );
};

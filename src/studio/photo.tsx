/**
 * A real photograph on the stage.
 *
 * The register is drawn graphics on black, so a photograph has to be placed
 * like an exhibit rather than pasted in: a fixed frame it fills by cropping,
 * the theme's own corner radius, and an optional caption underneath in the
 * theme's type. Cropping (not letterboxing) is the whole reason the component
 * exists — a scene that sets width and height on a raw <Img> gets whatever
 * aspect ratio the web happened to hand it, and a 4:3 photo squashed into a
 * 16:9 box is the most obvious tell that a graphic was assembled by a machine.
 *
 * `src` is either a local public path or the hosted same-origin image proxy.
 * The scene never carries a third-party URL directly, so preview and browser
 * export see the same bytes without cross-origin canvas failures.
 */
import React from 'react';
import {Img, staticFile} from 'remotion';
import {font} from './fonts';
import {paletteNow, isDevPalette} from './palette';

type PhotoProps = {
  /** Local public path or same-origin hosted proxy URL supplied by the picker. */
  src: string;
  /** One to three words naming what it shows. Rendered as the caption. */
  caption?: string;
  /** Where it came from, set small under the caption. */
  credit?: string;
  width?: number;
  height?: number;
  /** Corner radius; defaults to the theme's module radius. */
  radius?: number;
  /** Focal bias for the crop, 0 (top/left) to 1 (bottom/right). */
  focusX?: number;
  focusY?: number;
  style?: React.CSSProperties;
};

export const Photo: React.FC<PhotoProps> = ({
  src,
  caption,
  credit,
  width = 620,
  height = 420,
  radius,
  focusX = 0.5,
  focusY = 0.5,
  style,
}) => {
  const palette = paletteNow();
  const dev = isDevPalette(palette);
  const corner = radius ?? (dev ? 24 : 18);
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  const resolvedSrc = /^(?:data:|blob:|https?:\/\/|\/)/i.test(src) ? src : staticFile(src);
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 14, width, ...style}}>
      <div
        style={{
          width,
          height,
          borderRadius: corner,
          overflow: 'hidden',
          backgroundColor: palette.card,
          // The frame is the only edge. A border here would fight the flat
          // matte rule the dev register is built on.
          border: 'none',
          flex: '0 0 auto',
        }}
      >
        <Img
          src={resolvedSrc}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: `${clamp(focusX) * 100}% ${clamp(focusY) * 100}%`,
            display: 'block',
          }}
        />
      </div>
      {caption || credit ? (
        <div style={{display: 'flex', alignItems: 'baseline', gap: 12, minWidth: 0}}>
          {caption ? (
            <span
              style={{
                fontFamily: font('Fredoka'),
                fontSize: 24,
                fontWeight: 600,
                color: palette.ink,
                minWidth: 0,
                overflowWrap: 'anywhere',
              }}
            >
              {caption}
            </span>
          ) : null}
          {credit ? (
            <span
              style={{
                fontFamily: font('IBM Plex Mono'),
                // A credit is a source, not a label: it keeps its own casing.
                textTransform: 'none',
                fontSize: 16,
                color: palette.muted,
                marginLeft: 'auto',
                whiteSpace: 'nowrap',
              }}
            >
              {credit}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

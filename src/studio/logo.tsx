/**
 * A real company logo from the theSVG collection (thesvg.org, 6500+ brand
 * icons). Scenes pick a slug from the curated list in `logos.ts`; anything
 * else falls back gracefully instead of breaking the shot.
 */
import React, {useState} from 'react';
import {Img} from 'remotion';
import {resolveBrandLogoFile, resolveBrandLogoSlug} from './logos';
import {paletteNow} from './palette';

/**
 * Marks that disappear on a dark ground, and what to do about them.
 *
 * theSVG's `default` file is usually already light-on-dark, but a few dozen
 * are a black silhouette or a `currentColor` path (which an <img> resolves to
 * black), and those rendered as nothing at all on the dev and dark grounds —
 * a hole in the layout where a logo was asked for. Derived by fetching the
 * default file for every curated slug and reading its colours: a mark counts
 * as needing help when it declares no colour at all, or when every colour it
 * declares is both dark (relative luminance < 0.09) and achromatic (channel
 * spread <= 24). A dark *brand* colour — Pinterest red, LinkedIn blue — is
 * left alone, because inverting a hue is worse than a low contrast ratio.
 * Regenerate these two sets the same way if theSVG republishes its files.
 */
const LOGO_LIGHT_VARIANT_ON_DARK = new Set(['codex', 'github', 'sketch']);

const LOGO_INVERT_ON_DARK = new Set([
  'ai-studio-google',
  'apple-pay',
  'baseten',
  'cal-com',
  'devdotto',
  'disney',
  'elevenlabs',
  'gpt4all',
  'iterm2',
  'langchain',
  'llamaindex',
  'lm-studio',
  'localai',
  'medium',
  'notebooklm',
  'openwebui',
  'revolut',
  'square',
  'weights-and-biases',
  'x',
  'xai',
]);

const relativeLuminance = (hex: string) => {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  if (full.length !== 6) return 1;
  const channels = [0, 2, 4]
    .map((index) => parseInt(full.slice(index, index + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};

type LogoVariant =
  | 'default'
  | 'mono'
  | 'light'
  | 'dark'
  | 'wordmark'
  | 'wordmarkLight'
  | 'wordmarkDark';

type LogoProps = {
  /** Slug from the curated brand list, e.g. "github", "openai", "stripe". */
  name: string;
  size?: number;
  variant?: LogoVariant;
  /** Shown while loading or when the slug is unknown. */
  fallback?: React.ReactNode;
  style?: React.CSSProperties;
};

const VARIANT_RE = /^(default|mono|light|dark|wordmark|wordmarkLight|wordmarkDark)$/;

export const Logo: React.FC<LogoProps> = ({
  name,
  size = 96,
  variant = 'default',
  fallback,
  style,
}) => {
  const [failedAsset, setFailedAsset] = useState<string | null>(null);
  const slug = resolveBrandLogoSlug(name);
  const asked = VARIANT_RE.test(variant) ? variant : 'default';
  // Only the unqualified 'default' is adjusted for the ground. An explicit
  // mono/light/dark is the author's own decision and is left exactly as asked.
  const onDarkGround = relativeLuminance(paletteNow().ground) < 0.2;
  const needsLightVariant =
    asked === 'default' && onDarkGround && Boolean(slug) && LOGO_LIGHT_VARIANT_ON_DARK.has(slug!);
  const invertOnDark =
    asked === 'default' && onDarkGround && Boolean(slug) && LOGO_INVERT_ON_DARK.has(slug!);
  const requestedVariant: LogoVariant = needsLightVariant ? 'light' : asked;
  const requestedAsset = slug ? `${slug}/${requestedVariant}` : '';
  const safeVariant =
    requestedVariant !== 'default' && failedAsset === requestedAsset ? 'default' : requestedVariant;
  const activeAsset = slug ? `${slug}/${safeVariant}` : '';
  if (!slug || failedAsset === `${slug}/default`) return <>{fallback ?? null}</>;
  const file = slug ? resolveBrandLogoFile(slug, safeVariant) : 'default';
  return (
    <Img
      // theSVG's website route is HTML; its published SVG files are served
      // from the package CDN. Remotion's Img waits for this remote asset
      // before capturing a frame, so logos are present in exported renders.
      src={`https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons/${slug}/${file}.svg`}
      width={size}
      height={size}
      alt={slug}
      // A black or currentColor silhouette is flipped to white rather than
      // recoloured, so the mark keeps its exact shape.
      style={{objectFit: 'contain', ...(invertOnDark ? {filter: 'invert(1)'} : null), ...style}}
      onError={() => setFailedAsset(activeAsset)}
    />
  );
};

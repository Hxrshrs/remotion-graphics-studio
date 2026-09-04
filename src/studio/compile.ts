import React from 'react';
import {transform} from '@babel/standalone';
import {Audio, Video} from '@remotion/media';
import {
  AbsoluteFill,
  Easing,
  Freeze,
  Img,
  Loop,
  Sequence,
  Series,
  interpolateColors,
  random,
  spring,
  staticFile,
  useCurrentFrame,
  useRemotionEnvironment,
  useVideoConfig,
} from 'remotion';
import {EMOJI_FAMILY, ensureFont, font, preloadFontsInCode} from './fonts';
import {geo} from './maps';
import {
  anim,
  cameraZoom,
  exit,
  inOut,
  smoothInterpolate,
  stagger,
  SPEED_GRAPH,
  TRANSITIONS,
} from './motion';
import {color} from './color';
import {Words, wordsLead} from './type';
import {assets, patterns} from './textures';
import {ui} from './primitives';
import {shotDuration, voiceCue} from './shotContext';
import {kit} from './kit';
import {DynamicStudioIcon} from './dynamicIcon';
import {WebImage} from './webImage';
import {CUT_PALETTE} from './editorStyle';
import {setActivePalette} from './palette';
import {pathLength, pathPoint, pathProgress} from './path';

export type CompiledScene = {
  Component: React.ComponentType<Record<string, unknown>>;
  code: string;
};

export class SceneCompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SceneCompileError';
  }
}

const iconComponents = new Map<string, React.ComponentType<Record<string, unknown>>>();
const safeIcons = new Proxy({} as Record<string, unknown>, {
  get(_target, property) {
    if (typeof property !== 'string') return undefined;
    const cached = iconComponents.get(property);
    if (cached) return cached;
    const Component: React.FC<Record<string, unknown>> = (props) =>
      React.createElement(DynamicStudioIcon, {name: property, ...props});
    iconComponents.set(property, Component);
    return Component;
  },
});

/**
 * Everything a scene can reach. Models write plain identifiers
 * (`useCurrentFrame()`, `<AbsoluteFill>`) with no imports — the scope is
 * injected as function parameters at eval time.
 */
const buildScope = (palette: typeof CUT_PALETTE) => {
  // The ui components read their defaults from the active palette, so it must
  // match the palette this scene compiles against.
  setActivePalette(palette);
  return {
  React,
  useState: React.useState,
  useMemo: React.useMemo,
  useRef: React.useRef,
  useEffect: React.useEffect,
  useCallback: React.useCallback,
  AbsoluteFill,
  Sequence,
  Series,
  Img,
  useCurrentFrame,
  useVideoConfig,
  useRemotionEnvironment,
  // Even direct interpolate() calls use the shared cubic-bezier easing so a
  // scene cannot accidentally introduce a linear or abrupt motion segment.
  interpolate: smoothInterpolate,
  interpolateColors,
  staticFile,
  Loop,
  Freeze,
  Audio,
  Video,
  OffthreadVideo: Video,
  // Present so a model that reaches for them gets a scene that runs rather
  // than a ReferenceError. The prompt still asks for anim() as the single
  // source of timing; a stylistic preference should never be a crash.
  Easing,
  spring,
  random,
  font,
  ensureFont,
  // Geography, surface texture and the shared speed graph. Scenes get these as
  // plain identifiers for the same reason as the Remotion API: no imports.
  geo,
  patterns,
  assets,
  ui,
  scale: kit.scale,
  spread: kit.spread,
  safe: kit.safe,
  anim,
  stagger,
  cameraZoom,
  // A scene in a cut needs its own length to animate out; useVideoConfig()
  // reports the whole composition inside a Sequence, so it cannot supply it.
  shotDuration,
  voiceCue,
  exit,
  inOut,
  color,
  Words,
  wordsLead,
  SPEED_GRAPH,
  MOTION: SPEED_GRAPH,
  TRANSITIONS,
  // A model can occasionally guess a plausible Lucide name that is absent in
  // the installed release. Keep the scene alive with a neutral fallback so a
  // missing icon never crashes the entire canvas.
  icons: safeIcons,
  // A real photo or logo from the web, with a safe https-only fallback.
  WebImage,
  // The house palette for this style. Scenes are told to read every house
  // colour from here, so switching a cut's style recolors it instantly.
  palette,
  // Exact positions along an SVG path, so an element travelling a route
  // never drifts or hallucinates its way off the curve.
  pathLength,
  pathPoint,
  pathProgress,
  Math,
  Array,
  Object,
  String,
  Number,
  Boolean,
  JSON,
  Date,
  Map,
  Set,
  Intl,
  console,
  isNaN,
  isFinite,
  parseInt,
  parseFloat,
  };
};

/**
 * Models routinely emit imports/exports even when told not to. Rather than
 * failing the generation, normalise them away.
 */
const stripModuleSyntax = (source: string) =>
  source
    // `import ... from '...'` and bare `import '...'`
    .replace(/^\s*import\s+[^;]*?from\s*['"][^'"]*['"]\s*;?\s*$/gm, '')
    .replace(/^\s*import\s*['"][^'"]*['"]\s*;?\s*$/gm, '')
    // `export default Scene;` -> assignment we can pick up
    .replace(/^\s*export\s+default\s+(?:function\s+)?/gm, (match) =>
      match.includes('function') ? 'function ' : 'var __default = ',
    )
    // `export const X =` / `export function X`
    .replace(/^\s*export\s+(const|let|var|function|class)\b/gm, '$1')
    .replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gm, '');

/** Strip a ```jsx fence if the model wrapped its code in one. */
/**
 * Scenes that write a font stack by hand instead of calling font().
 *
 * font() appends the emoji face for every scene that uses it, but a model is
 * free to write `fontFamily: 'Inter, sans-serif'`, and that stack names no
 * family holding emoji — so the glyph falls through to the host machine's own
 * emoji font and a Windows render ships Segoe artwork. Rewriting the literal
 * puts the studio's face at the end of those stacks too. `font(...)` calls are
 * untouched: the regex only matches a quote directly after the colon.
 */
const withEmojiStacks = (source: string) =>
  source.replace(
    /fontFamily:\s*(['"])([^'"\n]*)\1/g,
    (whole, quote: string, stack: string) =>
      stack.includes(EMOJI_FAMILY) || !stack.trim()
        ? whole
        : `fontFamily: ${quote}${stack}, ${EMOJI_FAMILY}${quote}`,
  );

const unfence = (source: string) => {
  const fenced = source.match(/```(?:jsx|tsx|js|javascript|react)?\s*\n([\s\S]*?)```/i);
  return (fenced ? fenced[1] : source).trim();
};

/**
 * Top-level component names, in source order, so we can return the right one
 * even when the model names it something other than `Scene`.
 */
const componentNames = (source: string) => {
  const names: string[] = [];
  const patterns = [
    /^\s*(?:const|let|var)\s+([A-Z][A-Za-z0-9_]*)\s*=/gm,
    /^\s*function\s+([A-Z][A-Za-z0-9_]*)\s*\(/gm,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) names.push(match[1]);
  }
  return names;
};

/**
 * A bare "Unexpected token (12:5)" gives a repair round nothing to work with.
 * Quote the offending line and point at the column so the next attempt can be
 * a one-line fix instead of another full rewrite.
 */
const describeSyntaxError = (error: unknown, code: string) => {
  const message =
    error instanceof Error ? error.message.split('\n')[0] : 'Could not parse the scene.';
  const position = message.match(/\((\d+):(\d+)\)/);
  if (!position) return message;

  const lineNumber = Number(position[1]);
  const columnNumber = Number(position[2]);
  const sourceLines = code.split('\n');
  const offending = sourceLines[lineNumber - 1];
  if (offending === undefined) return message;

  const context = sourceLines
    .slice(Math.max(0, lineNumber - 3), lineNumber)
    .map((line, index) => `${Math.max(1, lineNumber - 2) + index} | ${line}`)
    .join('\n');
  return `${message}\n\n${context}\n${' '.repeat(String(lineNumber).length + 3 + Math.max(0, columnNumber))}^`;
};

const COMPILE_CACHE_LIMIT = 48;
const compileCache = new Map<string, CompiledScene>();

const rememberCompilation = (key: string, compiled: CompiledScene) => {
  compileCache.set(key, compiled);
  if (compileCache.size > COMPILE_CACHE_LIMIT) {
    const oldest = compileCache.keys().next().value;
    if (oldest !== undefined) compileCache.delete(oldest);
  }
  return compiled;
};

/** Scenes are compiled per palette so `palette.*` references recolour on a
    style switch without regenerating the scene. */
export const compileScene = (rawCode: string, palette: typeof CUT_PALETTE = CUT_PALETTE): CompiledScene => {
  const cacheKey = `${rawCode}\u0000${palette.ground}`;
  const cached = compileCache.get(cacheKey);
  if (cached) {
    compileCache.delete(cacheKey);
    compileCache.set(cacheKey, cached);
    return cached;
  }

  const code = withEmojiStacks(stripModuleSyntax(unfence(rawCode)));
  if (!code.trim()) throw new SceneCompileError('The scene code was empty.');

  let js: string;
  try {
    js =
      transform(code, {
        presets: [['react', {runtime: 'classic', pragma: 'React.createElement'}]],
        // TS syntax slips in often enough (`: React.FC`, `as const`) that it is
        // cheaper to parse it than to reject it.
        plugins: [['transform-typescript', {isTSX: true, allExtensions: true}]],
        filename: 'scene.tsx',
        sourceType: 'script',
      }).code ?? '';
  } catch (error) {
    throw new SceneCompileError(describeSyntaxError(error, code));
  }

  // Prefer `Scene`, then an explicit default export, then the last component
  // declared in the file.
  const candidates = ['Scene', '__default', ...componentNames(code).reverse()];
  const picker = candidates
    .map((name) => `(typeof ${name} !== 'undefined' ? ${name} : null)`)
    .join(' || ');

  const scope = buildScope(palette);
  const keys = Object.keys(scope);

  let Component: unknown;
  try {
    // eslint-disable-next-line no-new-func
    const factory = new Function(...keys, `${js}\n;return ${picker};`);
    Component = factory(...keys.map((key) => scope[key as keyof typeof scope]));
  } catch (error) {
    throw new SceneCompileError(
      error instanceof Error ? error.message : 'The scene failed while loading.',
    );
  }

  if (typeof Component !== 'function') {
    throw new SceneCompileError(
      'No component was found. Declare the scene as `const Scene = () => { ... }`.',
    );
  }

  preloadFontsInCode(code);

  return rememberCompilation(cacheKey, {Component: Component as CompiledScene['Component'], code});
};

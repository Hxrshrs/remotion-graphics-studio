/**
 * The house palette the compiled scope and the ui components' defaults draw
 * with. Scenes read `palette.*` from their compiled scope, and the components
 * read the same object here for their defaults, so both recolor when a cut's
 * style switches — no regeneration needed.
 */
import {CUT_PALETTE, CUT_PALETTE_DEV, CUT_PALETTE_SIGNAL} from './editorStyle';

export type HousePalette = typeof CUT_PALETTE;

let activePalette: HousePalette = CUT_PALETTE;

export const paletteNow = () => activePalette;

/**
 * Flat modular register: modules use contrast, spacing, and thin clean borders
 * instead of the hard outline/drop shadow used by the paper rail.
 * Both Signal and Dev themes share this modular architecture.
 */
export const isSignalPalette = (palette: HousePalette = activePalette) =>
  palette.ground === CUT_PALETTE_SIGNAL.ground || palette.ground === CUT_PALETTE_DEV.ground;

/**
 * Dev is the monochrome register, and components switch typeface on it. Same
 * rule as above: compare against the palette, never a ground literal — a
 * hardcoded '#0e0e0e' in type.tsx silently stopped recognising the theme the
 * moment the ground moved to pure black.
 */
export const isDevPalette = (palette: HousePalette = activePalette) =>
  palette.ground === CUT_PALETTE_DEV.ground;

/** Set at compile time and per shot render, so every default follows the
    cut's style. */
export const setActivePalette = (palette: HousePalette) => {
  activePalette = palette;
};

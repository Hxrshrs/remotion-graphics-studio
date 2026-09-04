/**
 * Contrast the scene can actually check.
 *
 * Telling a model "keep 4.5:1" in prose does not work; giving it a function
 * that returns the readable ink for a ground does. Everything here is pure and
 * synchronous so a scene can call it during render.
 */

const parse = (value: string): [number, number, number] => {
  // A helper that throws takes the whole canvas down with it. A scene calling
  // a colour function with the wrong number of arguments should read black,
  // not crash.
  if (typeof value !== 'string') return [0, 0, 0];
  const hex = value.trim().replace('#', '');
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return [
      parseInt(hex[0] + hex[0], 16),
      parseInt(hex[1] + hex[1], 16),
      parseInt(hex[2] + hex[2], 16),
    ];
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  }
  const rgb = value.match(/-?\d+(\.\d+)?/g);
  if (rgb && rgb.length >= 3) return [Number(rgb[0]), Number(rgb[1]), Number(rgb[2])];
  return [0, 0, 0];
};

const channel = (value: number) => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const luminance = (value: string) => {
  const [r, g, b] = parse(value);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const toHex = (rgb: [number, number, number]) =>
  `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;

export const color = {
  /** WCAG contrast ratio, 1 to 21. */
  contrast: (a: string, b: string) => {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  },

  /** True when the pair clears 4.5:1, or 3:1 for large type and graphic marks. */
  readableOn: (ink: string, ground: string, large = false) =>
    color.contrast(ink, ground) >= (large ? 3 : 4.5),

  /**
   * The candidate with the most contrast against `ground`. Pass the palette's
   * own inks so the result stays inside the palette; the neutral pair is only
   * the fallback.
   */
  readable: (ground: string, candidates: string[] = ['#f7f4ee', '#14120f']) =>
    candidates.reduce((best, candidate) =>
      color.contrast(candidate, ground) > color.contrast(best, ground) ? candidate : best,
    ),

  /** Blend two colors. amount 0 returns a, 1 returns b. */
  mix: (a: string, b: string, amount = 0.5) => {
    const [r1, g1, b1] = parse(a);
    const [r2, g2, b2] = parse(b);
    return toHex([
      r1 + (r2 - r1) * amount,
      g1 + (g2 - g1) * amount,
      b1 + (b2 - b1) * amount,
    ]);
  },

  /** Push a color toward black or white without changing its hue. */
  shade: (value: string, amount: number) =>
    amount < 0 ? color.mix(value, '#000000', -amount) : color.mix(value, '#ffffff', amount),

  /**
   * How blue a color is, from -1 (warm) to 1 (cold). Neutral greys and darks
   * should sit near 0; anything above about 0.06 reads as a blue tint.
   */
  coolness: (value: string) => {
    const [r, g, b] = parse(value);
    const max = Math.max(r, g, b, 1);
    return (b - r) / max;
  },
};

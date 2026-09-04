/**
 * Surface texture and the handful of files in `public/`.
 *
 * Every pattern is a deterministic inline-SVG data URI, so a scene sets it as
 * `backgroundImage` on a paper ground with no extra elements, no canvas, and no
 * randomness across renders.
 */

const encode = (svg: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}")`;

type Ink = {color?: string; opacity?: number; size?: number};

/** `patterns.grid('#222')` is a natural thing to write. Accept it. */
const options = <T extends Ink>(input?: T | string): T =>
  (typeof input === 'string' ? ({color: input} as T) : (input ?? ({} as T)));

export const patterns = {
  /** Regular dot field. The default for a printed-paper ground. */
  dots: (input?: (Ink & {radius?: number}) | string) => {
    const {color = '#1c1a17', opacity = 0.14, size = 18, radius = 1.6} = options<Ink & {radius?: number}>(input);
    return encode(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="${color}" fill-opacity="${opacity}"/>
      </svg>`,
    );
  },

  /** Engineering grid. Use for charts and schematics, never behind body copy. */
  grid: (input?: (Ink & {weight?: number}) | string) => {
    const {color = '#1c1a17', opacity = 0.1, size = 48, weight = 1} = options<Ink & {weight?: number}>(input);
    return encode(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
        <path d="M${size} 0H0V${size}" fill="none" stroke="${color}" stroke-opacity="${opacity}" stroke-width="${weight}"/>
      </svg>`,
    );
  },

  /** Diagonal hatch for a filled region that must stay readable underneath. */
  hatch: (input?: (Ink & {weight?: number}) | string) => {
    const {color = '#1c1a17', opacity = 0.18, size = 10, weight = 1.4} = options<Ink & {weight?: number}>(input);
    return encode(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
        <path d="M-1 1L1 -1M0 ${size}L${size} 0M${size - 1} ${size + 1}L${size + 1} ${size - 1}"
          stroke="${color}" stroke-opacity="${opacity}" stroke-width="${weight}"/>
      </svg>`,
    );
  },

  /** Horizontal rules, for a ledger or archive ground. */
  rules: (input?: (Ink & {weight?: number}) | string) => {
    const {color = '#1c1a17', opacity = 0.12, size = 34, weight = 1} = options<Ink & {weight?: number}>(input);
    return encode(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
        <path d="M0 ${size - 0.5}H${size}" stroke="${color}" stroke-opacity="${opacity}" stroke-width="${weight}"/>
      </svg>`,
    );
  },

  /** Paper grain. Fixed seed, so it is identical on every render. */
  grain: (input?: {opacity?: number; size?: number} | string) => {
    const {opacity = 0.06, size = 220} = options<Ink>(input);
    return encode(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
        <filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="7"/></filter>
        <rect width="100%" height="100%" filter="url(#g)" opacity="${opacity}"/>
      </svg>`,
    );
  },

  /**
   * A field of small plus marks at each grid intersection, the quiet
   * technical ground under a flat explainer. Lighter than `grid`, which
   * draws continuous rules.
   */
  ticks: (input?: (Ink & {arm?: number; weight?: number}) | string) => {
    const {color = '#1c1a17', opacity = 0.22, size = 96, arm = 7, weight = 1.6} = options<
      Ink & {arm?: number; weight?: number}
    >(input);
    const middle = size / 2;
    return encode(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
        <path d="M${middle - arm} ${middle}H${middle + arm}M${middle} ${middle - arm}V${middle + arm}"
          stroke="${color}" stroke-opacity="${opacity}" stroke-width="${weight}"/>
      </svg>`,
    );
  },

  /** Halftone: dots that grow toward one corner. Good under a title crop. */
  halftone: (input?: Ink | string) => {
    const {color = '#1c1a17', opacity = 0.22, size = 16} = options<Ink>(input);
    return encode(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size * 2}" height="${size * 2}">
        <g fill="${color}" fill-opacity="${opacity}">
          <circle cx="${size * 0.5}" cy="${size * 0.5}" r="${size * 0.3}"/>
          <circle cx="${size * 1.5}" cy="${size * 0.5}" r="${size * 0.2}"/>
          <circle cx="${size * 0.5}" cy="${size * 1.5}" r="${size * 0.2}"/>
          <circle cx="${size * 1.5}" cy="${size * 1.5}" r="${size * 0.12}"/>
        </g>
      </svg>`,
    );
  },
};

/**
 * Files shipped in `public/`, reached through `staticFile()`. Add a line here
 * when a new file is dropped into that folder.
 */
export const assets = {
  videos: ['clip-o90bpdmdLNE.mp4'],
  /** `staticFile` path for a file in public/. */
  path: (name: string) => name.replace(/^\/+/, ''),
};

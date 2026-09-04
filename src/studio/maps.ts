/**
 * Real geography for scenes.
 *
 * The system prompt tells models that arbitrary blobs are not a map, so they
 * need actual coastlines. `geo.map()` returns a view fitted to a region with
 * ready-made SVG path data and a projection, all synchronous and deterministic
 * so a scene can call it inside render at any frame.
 *
 * Data is Natural Earth 1:110m via world-atlas (241 countries, ~105 KB of
 * TopoJSON). It is imported eagerly rather than fetched because scenes are
 * compiled and evaluated with no async step available to them.
 */
import {feature} from 'topojson-client';
import type {FeatureCollection, Geometry, MultiPolygon, Polygon} from 'geojson';
import worldTopo from 'world-atlas/countries-110m.json';
import {lookupPlace, PLACE_NAMES} from './places';

type Ring = Array<[number, number]>;
type Shape = {name: string; rings: Ring[]; bounds: Bounds};
export type Bounds = {west: number; south: number; east: number; north: number};
type LonLat = {lat: number; lon: number};

const RAD = Math.PI / 180;
const MAX_MERCATOR_LAT = 84;

/** Named views a documentary asks for by name. Degrees, west/south/east/north. */
export const REGIONS: Record<string, Bounds> = {
  world: {west: -180, south: -60, east: 180, north: 84},
  africa: {west: -20, south: -36, east: 53, north: 38},
  'north africa': {west: -18, south: 14, east: 45, north: 38},
  'west africa': {west: -18, south: 3, east: 16, north: 25},
  'east africa': {west: 27, south: -12, east: 52, north: 18},
  'southern africa': {west: 10, south: -35, east: 41, north: -8},
  europe: {west: -12, south: 34, east: 42, north: 71},
  'western europe': {west: -11, south: 36, east: 20, north: 59},
  'eastern europe': {west: 14, south: 40, east: 50, north: 60},
  scandinavia: {west: 4, south: 54, east: 32, north: 71},
  mediterranean: {west: -7, south: 29, east: 37, north: 47},
  asia: {west: 25, south: -11, east: 150, north: 62},
  'central asia': {west: 46, south: 33, east: 88, north: 56},
  'south asia': {west: 60, south: 5, east: 93, north: 38},
  'southeast asia': {west: 92, south: -11, east: 142, north: 24},
  'east asia': {west: 73, south: 18, east: 148, north: 54},
  'middle east': {west: 25, south: 12, east: 63, north: 42},
  'north america': {west: -168, south: 7, east: -52, north: 72},
  'central america': {west: -95, south: 6, east: -76, north: 23},
  caribbean: {west: -88, south: 9, east: -59, north: 27},
  'south america': {west: -82, south: -56, east: -34, north: 13},
  'latin america': {west: -118, south: -56, east: -34, north: 33},
  oceania: {west: 110, south: -48, east: 180, north: 0},
  australia: {west: 112, south: -44, east: 154, north: -9},
  arctic: {west: -180, south: 55, east: 180, north: 84},
  atlantic: {west: -80, south: -40, east: 20, north: 65},
  pacific: {west: 100, south: -45, east: -70, north: 60},
  'indian ocean': {west: 20, south: -40, east: 120, north: 30},
};

const collection = feature(
  worldTopo as never,
  (worldTopo as never as {objects: {countries: unknown}}).objects.countries as never,
) as unknown as FeatureCollection<Geometry, {name: string}>;

const ringsOf = (geometry: Geometry): Ring[] => {
  if (geometry.type === 'Polygon') return (geometry as Polygon).coordinates as Ring[];
  if (geometry.type === 'MultiPolygon')
    return (geometry as MultiPolygon).coordinates.flat() as Ring[];
  return [];
};

const boundsOf = (rings: Ring[]): Bounds => {
  let west = 180;
  let east = -180;
  let south = 90;
  let north = -90;
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      if (lon < west) west = lon;
      if (lon > east) east = lon;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
    }
  }
  return {west, south, east, north};
};

const SHAPES: Shape[] = collection.features.map((item) => {
  const rings = ringsOf(item.geometry);
  return {name: item.properties.name, rings, bounds: boundsOf(rings)};
});

const BY_NAME = new Map<string, Shape>();
for (const shape of SHAPES) BY_NAME.set(shape.name.toLowerCase(), shape);

/** Everyday names for the Natural Earth spellings. */
const COUNTRY_ALIASES: Record<string, string> = {
  usa: 'united states of america',
  us: 'united states of america',
  'u.s.': 'united states of america',
  america: 'united states of america',
  'united states': 'united states of america',
  uk: 'united kingdom',
  britain: 'united kingdom',
  'great britain': 'united kingdom',
  england: 'united kingdom',
  uae: 'united arab emirates',
  emirates: 'united arab emirates',
  drc: 'dem. rep. congo',
  'democratic republic of the congo': 'dem. rep. congo',
  'republic of the congo': 'congo',
  'south sudan': 's. sudan',
  'bosnia and herzegovina': 'bosnia and herz.',
  bosnia: 'bosnia and herz.',
  'central african republic': 'central african rep.',
  'dominican republic': 'dominican rep.',
  'equatorial guinea': 'eq. guinea',
  'ivory coast': "côte d'ivoire",
  'czech republic': 'czechia',
  burma: 'myanmar',
  holland: 'netherlands',
  swaziland: 'eswatini',
  'cape verde': 'cabo verde',
  'east timor': 'timor-leste',
  'western sahara': 'w. sahara',
  'south korea': 'south korea',
  korea: 'south korea',
  'north macedonia': 'macedonia',
  'solomon islands': 'solomon is.',
  'marshall islands': 'marshall is.',
  'faroe islands': 'faeroe is.',
  'falkland islands': 'falkland is.',
  'turkiye': 'turkey',
  persia: 'iran',
};

const findShape = (name: string): Shape | null => {
  const key = name.trim().toLowerCase();
  return BY_NAME.get(key) ?? BY_NAME.get(COUNTRY_ALIASES[key] ?? '') ?? null;
};

type ProjectionName = 'mercator' | 'equirectangular' | 'naturalEarth';

const project = (name: ProjectionName, lon: number, lat: number): [number, number] => {
  const x = lon * RAD;
  if (name === 'equirectangular') return [x, -lat * RAD];
  if (name === 'mercator') {
    const clamped = Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, lat)) * RAD;
    return [x, -Math.log(Math.tan(Math.PI / 4 + clamped / 2))];
  }
  // Natural Earth I: the pseudocylindrical world projection that reads as a map
  // rather than a stretched rectangle.
  const phi = lat * RAD;
  const p2 = phi * phi;
  const p4 = p2 * p2;
  return [
    x * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 - 0.001529 * p2))),
    -phi * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4))),
  ];
};

export type MapOptions = {
  /** 'world', a region name from REGIONS, a country name, or several countries. */
  region?: string | string[];
  /** Explicit degrees, when a region name is not precise enough. */
  bounds?: Partial<Bounds>;
  width?: number;
  height?: number;
  /** Inset in px kept clear on every side. */
  padding?: number;
  projection?: ProjectionName;
  /** 'contain' letterboxes the region, 'cover' fills the frame and crops. */
  fit?: 'contain' | 'cover';
};

export type Route = {
  d: string;
  length: number;
  pointAt: (t: number) => {x: number; y: number; angle: number};
};

export type MapView = {
  width: number;
  height: number;
  viewBox: string;
  bounds: Bounds;
  /** Every land mass in the view as one path. */
  land: string;
  /** Country outlines that fall inside the view. */
  countries: Array<{name: string; d: string}>;
  shape: (name: string) => string;
  centroid: (name: string) => {x: number; y: number} | null;
  point: (place: string | LonLat | [number, number]) => {x: number; y: number};
  inView: (name: string) => boolean;
  route: (
    stops: Array<string | LonLat | [number, number]>,
    options?: {curve?: number; flip?: boolean},
  ) => Route;
  graticule: (stepDegrees?: number) => string;
};

const round = (value: number) => Math.round(value * 100) / 100;

const resolveBounds = (region: MapOptions['region'], explicit?: Partial<Bounds>): Bounds => {
  if (explicit && Object.keys(explicit).length === 4) return explicit as Bounds;

  const names = Array.isArray(region) ? region : [region ?? 'world'];
  const single = names.length === 1 ? String(names[0]).trim().toLowerCase() : null;
  if (single && REGIONS[single]) return REGIONS[single];

  const shapes = names.map((name) => findShape(String(name))).filter(Boolean) as Shape[];
  if (!shapes.length) return REGIONS.world;

  // Natural Earth polygons carry overseas territory (France reaches French
  // Guiana and Reunion) and single rings that wrap the dateline (Russia spans
  // -180 to 180 in one ring). Fitting to a raw bounding box would open a
  // country out into a world map, so unwrap longitudes around the country's own
  // centre and then fit to the cluster of rings around its main landmass.
  const allLons: number[] = [];
  for (const shape of shapes) {
    for (const ring of shape.rings) for (const [lon] of ring) allLons.push(lon);
  }
  if (!allLons.length) return REGIONS.world;
  allLons.sort((a, b) => a - b);
  const middleLon = allLons[Math.floor(allLons.length / 2)];
  const unwrap = (lon: number) => lon - 360 * Math.round((lon - middleLon) / 360);

  const rings: Array<{box: Bounds; size: number}> = [];
  for (const shape of shapes) {
    for (const ring of shape.rings) {
      if (ring.length < 4) continue;
      let west = Infinity;
      let east = -Infinity;
      let south = Infinity;
      let north = -Infinity;
      for (const [lon, lat] of ring) {
        const x = unwrap(lon);
        if (x < west) west = x;
        if (x > east) east = x;
        if (lat < south) south = lat;
        if (lat > north) north = lat;
      }
      const box = {west, east, south, north};
      rings.push({box, size: (east - west + 0.4) * (north - south + 0.4)});
    }
  }

  rings.sort((a, b) => b.size - a.size);
  let box = {...rings[0].box};
  // Fit to the significant land only. Small outlying rings still draw, they
  // just do not get a vote on the view: an island chain of pinpricks would drag
  // the frame a hemisphere wide (the Aleutians do this to the United States).
  const minSize = rings[0].size * 0.02;
  const near = (candidate: Bounds, gap: number) =>
    candidate.west <= box.east + gap &&
    candidate.east >= box.west - gap &&
    candidate.south <= box.north + gap &&
    candidate.north >= box.south - gap;

  // Two passes: the first attaches neighbours to the main mass, the second
  // catches an island chain that only became adjacent after the first pass.
  for (let pass = 0; pass < 2; pass++) {
    for (const ring of rings) {
      if (ring.size < minSize || !near(ring.box, 6)) continue;
      box = {
        west: Math.min(box.west, ring.box.west),
        east: Math.max(box.east, ring.box.east),
        south: Math.min(box.south, ring.box.south),
        north: Math.max(box.north, ring.box.north),
      };
    }
  }

  // Last guard: never let one country open out into a world map.
  if (box.east - box.west > 190) {
    const centre = (rings[0].box.west + rings[0].box.east) / 2;
    box = {...box, west: centre - 95, east: centre + 95};
  }

  const padLon = (box.east - box.west) * 0.08 + 1;
  const padLat = (box.north - box.south) * 0.08 + 1;
  return {
    west: box.west - padLon,
    east: box.east + padLon,
    south: Math.max(-89, box.south - padLat),
    north: Math.min(89, box.north + padLat),
  };
};

const cache = new Map<string, MapView>();

const buildMap = (options: MapOptions): MapView => {
  const width = options.width ?? 1520;
  const height = options.height ?? 860;
  const padding = options.padding ?? 32;
  const bounds = resolveBounds(options.region, options.bounds);
  const projection: ProjectionName =
    options.projection ??
    (bounds.east - bounds.west > 300 ? 'naturalEarth' : 'mercator');

  // Fit by sampling the projected bounding box: every projection here is
  // monotone in longitude but not necessarily in latitude, so sample a grid
  // rather than trusting the four corners.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const lon = bounds.west + ((bounds.east - bounds.west) * i) / steps;
      const lat = bounds.south + ((bounds.north - bounds.south) * j) / steps;
      const [x, y] = project(projection, lon, lat);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  const usableW = width - padding * 2;
  const usableH = height - padding * 2;
  const scale =
    options.fit === 'cover'
      ? Math.max(usableW / (maxX - minX), usableH / (maxY - minY))
      : Math.min(usableW / (maxX - minX), usableH / (maxY - minY));
  const offsetX = padding + (usableW - (maxX - minX) * scale) / 2;
  const offsetY = padding + (usableH - (maxY - minY) * scale) / 2;

  const toXY = (lon: number, lat: number) => {
    const [x, y] = project(projection, lon, lat);
    return {x: (x - minX) * scale + offsetX, y: (y - minY) * scale + offsetY};
  };

  const ringPath = (ring: Ring) => {
    let d = '';
    let last: {x: number; y: number} | null = null;
    let lastLon: number | null = null;
    let open = false;
    for (const [lon, lat] of ring) {
      // A ring that wraps the antimeridian in one piece (Russia, Fiji) would
      // otherwise draw a straight bar across the whole map. Break the subpath
      // at the seam instead.
      if (lastLon !== null && Math.abs(lon - lastLon) > 180) {
        if (open) d += 'Z';
        last = null;
        open = false;
      }
      lastLon = lon;
      const p = toXY(lon, lat);
      // Drop points that land on the same rounded pixel; a 50m ring can carry
      // thousands of vertices that a 1920-wide frame cannot show.
      if (last && Math.abs(p.x - last.x) < 0.35 && Math.abs(p.y - last.y) < 0.35) continue;
      d += `${last ? 'L' : 'M'}${round(p.x)} ${round(p.y)}`;
      last = p;
      open = true;
    }
    return open ? `${d}Z` : d;
  };

  const overlaps = (box: Bounds) =>
    box.east >= bounds.west &&
    box.west <= bounds.east &&
    box.north >= bounds.south &&
    box.south <= bounds.north;

  const shapePath = (shape: Shape) => shape.rings.map(ringPath).join('');

  const visible = SHAPES.filter((shape) => overlaps(shape.bounds));
  const countries = visible
    .map((shape) => ({name: shape.name, d: shapePath(shape)}))
    .filter((item) => item.d.length > 0);

  const point: MapView['point'] = (place) => {
    if (Array.isArray(place)) return toXY(place[1], place[0]);
    if (typeof place === 'object') return toXY(place.lon, place.lat);
    const city = lookupPlace(place);
    if (city) return toXY(city.lon, city.lat);
    const shape = findShape(place);
    if (shape) {
      return toXY(
        (shape.bounds.west + shape.bounds.east) / 2,
        (shape.bounds.south + shape.bounds.north) / 2,
      );
    }
    // Unknown name: the centre of the view is wrong but visible, which beats
    // NaN coordinates silently deleting a marker.
    return {x: width / 2, y: height / 2};
  };

  const route: MapView['route'] = (stops, routeOptions = {}) => {
    const curve = routeOptions.curve ?? 0.18;
    const side = routeOptions.flip ? -1 : 1;
    const points = stops.map((stop) => point(stop));
    if (points.length < 2) {
      const only = points[0] ?? {x: 0, y: 0};
      return {d: `M${round(only.x)} ${round(only.y)}`, length: 0, pointAt: () => ({...only, angle: 0})};
    }

    type Segment = {a: {x: number; y: number}; c: {x: number; y: number}; b: {x: number; y: number}; length: number};
    const segments: Segment[] = [];
    let d = `M${round(points[0].x)} ${round(points[0].y)}`;

    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const span = Math.hypot(dx, dy) || 1;
      // Bow the segment perpendicular to its own direction so a chain of stops
      // reads as one travelled arc instead of a folded polyline.
      const c = {
        x: (a.x + b.x) / 2 - (dy / span) * span * curve * side,
        y: (a.y + b.y) / 2 + (dx / span) * span * curve * side,
      };
      d += `Q${round(c.x)} ${round(c.y)} ${round(b.x)} ${round(b.y)}`;

      let length = 0;
      let previous = a;
      for (let s = 1; s <= 24; s++) {
        const t = s / 24;
        const u = 1 - t;
        const p = {
          x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
          y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
        };
        length += Math.hypot(p.x - previous.x, p.y - previous.y);
        previous = p;
      }
      segments.push({a, c, b, length});
    }

    const total = segments.reduce((sum, segment) => sum + segment.length, 0);

    const pointAt = (t: number) => {
      const target = Math.max(0, Math.min(1, t)) * total;
      let travelled = 0;
      for (const segment of segments) {
        if (travelled + segment.length >= target || segment === segments[segments.length - 1]) {
          const local = segment.length ? (target - travelled) / segment.length : 0;
          const k = Math.max(0, Math.min(1, local));
          const u = 1 - k;
          const x = u * u * segment.a.x + 2 * u * k * segment.c.x + k * k * segment.b.x;
          const y = u * u * segment.a.y + 2 * u * k * segment.c.y + k * k * segment.b.y;
          const tx = 2 * u * (segment.c.x - segment.a.x) + 2 * k * (segment.b.x - segment.c.x);
          const ty = 2 * u * (segment.c.y - segment.a.y) + 2 * k * (segment.b.y - segment.c.y);
          return {x, y, angle: (Math.atan2(ty, tx) * 180) / Math.PI};
        }
        travelled += segment.length;
      }
      return {x: points[0].x, y: points[0].y, angle: 0};
    };

    return {d, length: total, pointAt};
  };

  const graticule = (step = 20) => {
    let d = '';
    for (let lon = Math.ceil(bounds.west / step) * step; lon <= bounds.east; lon += step) {
      for (let lat = bounds.south; lat <= bounds.north; lat += 2) {
        const p = toXY(lon, lat);
        d += `${lat === bounds.south ? 'M' : 'L'}${round(p.x)} ${round(p.y)}`;
      }
    }
    for (let lat = Math.ceil(bounds.south / step) * step; lat <= bounds.north; lat += step) {
      for (let lon = bounds.west; lon <= bounds.east; lon += 2) {
        const p = toXY(lon, lat);
        d += `${lon === bounds.west ? 'M' : 'L'}${round(p.x)} ${round(p.y)}`;
      }
    }
    return d;
  };

  const centroid: MapView['centroid'] = (name) => {
    const shape = findShape(name);
    if (!shape) {
      const city = lookupPlace(name);
      return city ? toXY(city.lon, city.lat) : null;
    }
    // Label the largest ring, not the average of scattered islands.
    let best: Ring | null = null;
    let bestSpan = -1;
    for (const ring of shape.rings) {
      const box = boundsOf([ring]);
      const span = (box.east - box.west) * (box.north - box.south);
      if (span > bestSpan) {
        bestSpan = span;
        best = ring;
      }
    }
    if (!best) return null;
    const box = boundsOf([best]);
    return toXY((box.west + box.east) / 2, (box.south + box.north) / 2);
  };

  return {
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
    bounds,
    land: visible.map(shapePath).join(''),
    countries,
    shape: (name) => {
      const shape = findShape(name);
      return shape ? shapePath(shape) : '';
    },
    centroid,
    point,
    inView: (name) => {
      const shape = findShape(name);
      return shape ? overlaps(shape.bounds) : false;
    },
    route,
    graticule,
  };
};

export const geo = {
  /** Build (or reuse) a fitted map view. Safe to call inside render. */
  map: (options: MapOptions = {}): MapView => {
    const key = JSON.stringify(options);
    const hit = cache.get(key);
    if (hit) return hit;
    const view = buildMap(options);
    cache.set(key, view);
    return view;
  },
  /** Every country spelling the data recognises. */
  countries: SHAPES.map((shape) => shape.name).sort(),
  /** Named regions accepted by `region`. */
  regions: Object.keys(REGIONS),
  /** Cities and chokepoints with real coordinates. */
  places: PLACE_NAMES,
  /** Degrees for a city or country, or null when it is not in the data. */
  locate: (name: string): LonLat | null => {
    const city = lookupPlace(name);
    if (city) return {lat: city.lat, lon: city.lon};
    const shape = findShape(name);
    if (!shape) return null;
    return {
      lat: (shape.bounds.south + shape.bounds.north) / 2,
      lon: (shape.bounds.west + shape.bounds.east) / 2,
    };
  },
  has: (name: string) => Boolean(lookupPlace(name) || findShape(name)),
};

import type { Bounds, PublicLocation } from './types';

/**
 * Free vector tiles from OpenFreeMap (no API key, no usage caps). Override with VITE_MAP_STYLE_URL
 * to use a self-hosted or commercial style.
 */
export const mapStyle = import.meta.env.VITE_MAP_STYLE_URL ?? 'https://tiles.openfreemap.org/styles/positron';
export const detailMapStyle = import.meta.env.VITE_MAP_DETAIL_STYLE_URL ?? 'https://tiles.openfreemap.org/styles/liberty';

export const usaBounds: Bounds = { north: 49.5, south: 24.3, east: -66.9, west: -124.8 };

export function boundsOf(points: { latitude: number; longitude: number }[]): Bounds | null {
  if (!points.length) return null;
  let north = -90, south = 90, east = -180, west = 180;
  for (const point of points) {
    north = Math.max(north, point.latitude);
    south = Math.min(south, point.latitude);
    east = Math.max(east, point.longitude);
    west = Math.min(west, point.longitude);
  }
  // Pad single points / tight clusters so the map does not zoom to street level.
  const minSpan = 0.08;
  if (north - south < minSpan) { north += minSpan / 2; south -= minSpan / 2; }
  if (east - west < minSpan) { east += minSpan / 2; west -= minSpan / 2; }
  return { north, south, east, west };
}

export function toLngLatBounds(bounds: Bounds): [[number, number], [number, number]] {
  return [[bounds.west, bounds.south], [bounds.east, bounds.north]];
}

/** GeoJSON polygon approximating a circle, for "exact location provided after booking" areas. */
export function circlePolygon(location: Pick<PublicLocation, 'latitude' | 'longitude'>, radiusMeters: number, steps = 64) {
  const coordinates: [number, number][] = [];
  const latRadius = radiusMeters / 111_320;
  const lngRadius = radiusMeters / (111_320 * Math.cos((location.latitude * Math.PI) / 180));
  for (let i = 0; i <= steps; i += 1) {
    const angle = (i / steps) * 2 * Math.PI;
    coordinates.push([location.longitude + lngRadius * Math.cos(angle), location.latitude + latRadius * Math.sin(angle)]);
  }
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'Polygon' as const, coordinates: [coordinates] },
  };
}

export function roundBounds(bounds: Bounds): Bounds {
  const r = (value: number) => Math.round(value * 1e4) / 1e4;
  return { north: r(bounds.north), south: r(bounds.south), east: r(bounds.east), west: r(bounds.west) };
}

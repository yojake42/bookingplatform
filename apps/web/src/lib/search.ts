import type { Bounds } from './types';

/** Everything about a search lives in the URL so results are shareable and survive refresh. */
export type SearchState = {
  q: string;
  place: string;
  bounds: Bounds | null;
  checkIn: string | null;
  checkOut: string | null;
  guests: number;
  minPrice: number | null;
  maxPrice: number | null;
  bedrooms: number;
  beds: number;
  bathrooms: number;
  types: string[];
  amenities: string[];
  sort: string;
};

const num = (value: string | null) => (value != null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null);
const list = (value: string | null) => (value ? value.split(',').filter(Boolean) : []);

export function parseSearch(params: URLSearchParams): SearchState {
  const north = num(params.get('n'));
  const south = num(params.get('s'));
  const east = num(params.get('e'));
  const west = num(params.get('w'));
  return {
    q: params.get('q') ?? '',
    place: params.get('place') ?? '',
    bounds: north != null && south != null && east != null && west != null ? { north, south, east, west } : null,
    checkIn: params.get('checkIn'),
    checkOut: params.get('checkOut'),
    guests: num(params.get('guests')) ?? 0,
    minPrice: num(params.get('minPrice')),
    maxPrice: num(params.get('maxPrice')),
    bedrooms: num(params.get('bedrooms')) ?? 0,
    beds: num(params.get('beds')) ?? 0,
    bathrooms: num(params.get('bathrooms')) ?? 0,
    types: list(params.get('types')),
    amenities: list(params.get('amenities')),
    sort: params.get('sort') ?? 'recommended',
  };
}

export function serializeSearch(state: Partial<SearchState>): URLSearchParams {
  const params = new URLSearchParams();
  const set = (key: string, value: string | number | null | undefined) => {
    if (value === null || value === undefined || value === '' || value === 0) return;
    params.set(key, String(value));
  };
  set('q', state.q);
  set('place', state.place);
  if (state.bounds) {
    params.set('n', String(state.bounds.north));
    params.set('s', String(state.bounds.south));
    params.set('e', String(state.bounds.east));
    params.set('w', String(state.bounds.west));
  }
  if (state.checkIn && state.checkOut) {
    set('checkIn', state.checkIn);
    set('checkOut', state.checkOut);
  }
  set('guests', state.guests);
  set('minPrice', state.minPrice);
  set('maxPrice', state.maxPrice);
  set('bedrooms', state.bedrooms);
  set('beds', state.beds);
  set('bathrooms', state.bathrooms);
  if (state.types?.length) params.set('types', state.types.join(','));
  if (state.amenities?.length) params.set('amenities', state.amenities.join(','));
  if (state.sort && state.sort !== 'recommended') params.set('sort', state.sort);
  return params;
}

/** Search params as sent to the API. */
export function toApiQuery(state: SearchState) {
  return {
    q: state.q || undefined,
    north: state.bounds?.north,
    south: state.bounds?.south,
    east: state.bounds?.east,
    west: state.bounds?.west,
    checkIn: state.checkIn && state.checkOut ? state.checkIn : undefined,
    checkOut: state.checkIn && state.checkOut ? state.checkOut : undefined,
    guests: state.guests || undefined,
    minPrice: state.minPrice ?? undefined,
    maxPrice: state.maxPrice ?? undefined,
    bedrooms: state.bedrooms || undefined,
    beds: state.beds || undefined,
    bathrooms: state.bathrooms || undefined,
    types: state.types,
    amenities: state.amenities,
    sort: state.sort,
  };
}

export function activeFilterCount(state: SearchState) {
  return (
    (state.minPrice != null || state.maxPrice != null ? 1 : 0) +
    (state.bedrooms ? 1 : 0) +
    (state.beds ? 1 : 0) +
    (state.bathrooms ? 1 : 0) +
    state.types.length +
    state.amenities.length
  );
}

/** Carries dates and guests from search into listing links. */
export function stayParams(state: Pick<SearchState, 'checkIn' | 'checkOut' | 'guests'>) {
  const params = new URLSearchParams();
  if (state.checkIn && state.checkOut) {
    params.set('checkIn', state.checkIn);
    params.set('checkOut', state.checkOut);
  }
  if (state.guests) params.set('guests', String(state.guests));
  const text = params.toString();
  return text ? `?${text}` : '';
}

export function padBounds(bounds: Bounds, minSpan = 0.1): Bounds {
  const latPad = Math.max(0, (minSpan - (bounds.north - bounds.south)) / 2);
  const lngPad = Math.max(0, (minSpan - (bounds.east - bounds.west)) / 2);
  return { north: bounds.north + latPad, south: bounds.south - latPad, east: bounds.east + lngPad, west: bounds.west - lngPad };
}

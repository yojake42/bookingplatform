import { useEffect, useMemo, useRef, useState } from 'react';
import Map, { Layer, Marker, NavigationControl, Source, type MapRef } from 'react-map-gl/maplibre';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Eye, EyeOff, Home, Loader2, MapPin, Search } from 'lucide-react';
import { api } from '../../lib/api';
import { useClickOutside, useDebounced } from '../../lib/hooks';
import { circlePolygon, detailMapStyle } from '../../lib/map';
import type { LocationPrecision, Place } from '../../lib/types';
import { Input, Select, Textarea } from '../ui';
import { zoneLabel } from '../../lib/format';

export type LocationValue = {
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  locationPrecision: LocationPrecision;
  locationDescription: string;
  timeZone: string;
};

const allZones: string[] = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf(key: string): string[] }).supportedValuesOf('timeZone');
  } catch {
    return [];
  }
})();

export function LocationEditor({ value, onChange }: { value: LocationValue; onChange: (patch: Partial<LocationValue>) => void }) {
  /** Moves the pin and re-detects the home's time zone from it. */
  const setPoint = (patch: Partial<LocationValue> & { latitude: number; longitude: number }) => {
    onChange(patch);
    api<{ timeZone: string }>('/geo/timezone', { query: { lat: patch.latitude, lng: patch.longitude } })
      .then((result) => onChange({ timeZone: result.timeZone }))
      .catch(() => undefined);
  };
  const mapRef = useRef<MapRef>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const term = useDebounced(query.trim(), 300);
  const box = useClickOutside<HTMLDivElement>(() => setOpen(false), open);
  const places = useQuery({
    queryKey: ['geo', term],
    queryFn: () => api<Place[]>('/geo/search', { query: { q: term } }),
    enabled: term.length >= 3,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const hasPoint = value.latitude != null && value.longitude != null;
  const { latitude, longitude } = value;
  const point = useMemo(() => (hasPoint ? { latitude: latitude!, longitude: longitude! } : null), [hasPoint, latitude, longitude]);
  const circle = useMemo(() => (point ? circlePolygon(point, 650) : null), [point]);

  useEffect(() => {
    if (point) mapRef.current?.flyTo({ center: [point.longitude, point.latitude], zoom: Math.max(mapRef.current.getZoom(), 14), duration: 900 });
  }, [point]);

  const pick = (place: Place) => {
    setOpen(false);
    setQuery('');
    setPoint({
      addressLine1: place.street || value.addressLine1,
      city: place.city || value.city,
      region: place.region || value.region,
      postalCode: place.postalCode || value.postalCode,
      country: place.country || value.country,
      latitude: round(place.latitude),
      longitude: round(place.longitude),
    });
  };

  return (
    <div className="space-y-8">
      <div ref={box} className="relative">
        <label className="field-label">Search for the address</label>
        <div className="relative">
          <Search className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-500" />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Start typing a street address, town or landmark"
            className="field pl-10"
          />
          {places.isFetching && <Loader2 className="absolute top-1/2 right-3.5 size-4 -translate-y-1/2 animate-spin text-ink-400" />}
        </div>
        {open && term.length >= 3 && (
          <div className="absolute inset-x-0 top-full z-30 mt-2 max-h-80 animate-pop-in overflow-y-auto rounded-2xl bg-white py-2 shadow-float ring-1 ring-black/5">
            {places.isError && <p className="px-4 py-3 text-sm text-ink-500">{places.error.message}</p>}
            {places.data?.length === 0 && <p className="px-4 py-3 text-sm text-ink-500">No matches. Try a nearby town, or drop the pin on the map.</p>}
            {places.data?.map((place) => (
              <button key={`${place.latitude},${place.longitude},${place.label}`} type="button" onClick={() => pick(place)} className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-ink-50">
                <MapPin className="mt-0.5 size-4 shrink-0 text-ink-500" />
                <span className="text-sm">{place.label}</span>
              </button>
            ))}
          </div>
        )}
        <p className="mt-1.5 text-sm text-ink-500">Or click the map / drag the pin to set the exact spot.</p>
      </div>

      <div className="relative h-[420px] overflow-hidden rounded-2xl ring-1 ring-ink-200">
        <Map
          ref={mapRef}
          mapStyle={detailMapStyle}
          initialViewState={point ? { ...point, zoom: 14 } : { latitude: 39.5, longitude: -98.35, zoom: 3.2 }}
          onClick={(event) => setPoint({ latitude: round(event.lngLat.lat), longitude: round(event.lngLat.lng) })}
          dragRotate={false}
          cursor="crosshair"
          attributionControl={{ compact: true }}
        >
          <NavigationControl position="top-right" showCompass={false} />
          {circle && value.locationPrecision === 'APPROXIMATE' && (
            <Source id="preview-area" type="geojson" data={circle}>
              <Layer id="preview-fill" type="fill" paint={{ 'fill-color': '#e11d48', 'fill-opacity': 0.12 }} />
              <Layer id="preview-line" type="line" paint={{ 'line-color': '#e11d48', 'line-width': 1.5, 'line-dasharray': [2, 2] }} />
            </Source>
          )}
          {point && (
            <Marker
              longitude={point.longitude}
              latitude={point.latitude}
              draggable
              onDragEnd={(event) => setPoint({ latitude: round(event.lngLat.lat), longitude: round(event.lngLat.lng) })}
            >
              <span className="flex size-11 cursor-grab items-center justify-center rounded-full bg-ink-900 text-white shadow-float ring-4 ring-white active:cursor-grabbing">
                <Home className="size-5" />
              </span>
            </Marker>
          )}
        </Map>
        {!point && (
          <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center">
            <span className="rounded-full bg-white px-4 py-2 text-sm font-semibold shadow-float">Click the map to drop a pin</span>
          </div>
        )}
        {point && (
          <span className="absolute bottom-3 left-3 rounded-lg bg-white/95 px-2.5 py-1 font-mono text-xs text-ink-600 shadow-sm">
            {point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}
          </span>
        )}
      </div>

      <div>
        <span className="field-label">What guests see before booking</span>
        <div className="grid gap-3 sm:grid-cols-2">
          <PrecisionOption
            active={value.locationPrecision === 'APPROXIMATE'}
            onClick={() => onChange({ locationPrecision: 'APPROXIMATE' })}
            icon={<EyeOff className="size-5" />}
            title="General area"
            description="A circle around the neighborhood. The street address is hidden until a guest books. Recommended."
          />
          <PrecisionOption
            active={value.locationPrecision === 'EXACT'}
            onClick={() => onChange({ locationPrecision: 'EXACT' })}
            icon={<Eye className="size-5" />}
            title="Specific location"
            description="An exact pin and the street address are shown on the public listing."
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Street address" value={value.addressLine1} onChange={(event) => onChange({ addressLine1: event.target.value })} wrapperClassName="sm:col-span-2" />
        <Input label="Apt, suite, unit (optional)" value={value.addressLine2} onChange={(event) => onChange({ addressLine2: event.target.value })} wrapperClassName="sm:col-span-2" />
        <Input label="City" value={value.city} onChange={(event) => onChange({ city: event.target.value })} />
        <Input label="State / region" value={value.region} onChange={(event) => onChange({ region: event.target.value })} />
        <Input label="Postal code" value={value.postalCode} onChange={(event) => onChange({ postalCode: event.target.value })} />
        <Input label="Country" value={value.country} onChange={(event) => onChange({ country: event.target.value })} />
      </div>

      <Select
        label="Time zone"
        hint={`Detected from the pin. Check-in/checkout times, "today" on the calendar, cancellation deadlines and reminder emails all use it. Currently ${zoneLabel(value.timeZone)}.`}
        value={value.timeZone}
        onChange={(event) => onChange({ timeZone: event.target.value })}
      >
        {(allZones.includes(value.timeZone) ? allZones : [value.timeZone, ...allZones]).map((zone) => (
          <option key={zone} value={zone}>{zone.replace(/_/g, ' ')}</option>
        ))}
      </Select>

      <Textarea
        label="About the neighborhood"
        hint="Getting around, nearby highlights, parking, transit."
        value={value.locationDescription}
        onChange={(event) => onChange({ locationDescription: event.target.value })}
      />
    </div>
  );
}

function PrecisionOption({ active, onClick, icon, title, description }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; description: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        'flex gap-3 rounded-2xl p-4 text-left ring-1 transition',
        active ? 'bg-ink-50 ring-2 ring-ink-900' : 'ring-ink-200 hover:ring-ink-400',
      )}
    >
      <span className={clsx('mt-0.5', active ? 'text-ink-900' : 'text-ink-500')}>{icon}</span>
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="mt-0.5 block text-sm text-ink-500">{description}</span>
      </span>
    </button>
  );
}

function round(value: number) {
  return Math.round(value * 1e6) / 1e6;
}

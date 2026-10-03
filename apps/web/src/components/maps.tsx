import { useEffect, useMemo, useRef, useState } from 'react';
import Map, { Layer, Marker, NavigationControl, Popup, Source, type MapRef, type ViewStateChangeEvent } from 'react-map-gl/maplibre';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Home, Search, Star } from 'lucide-react';
import { boundsOf, circlePolygon, detailMapStyle, mapStyle, roundBounds, toLngLatBounds, usaBounds } from '../lib/map';
import { money, rating } from '../lib/format';
import type { Bounds, ListingCard, PublicLocation } from '../lib/types';

// ---------------------------------------------------------------------------
// Search results map
// ---------------------------------------------------------------------------

const popupOffsets = {
  center: [0, 0],
  top: [0, 10],
  'top-left': [0, 10],
  'top-right': [0, 10],
  bottom: [0, -40],
  'bottom-left': [0, -40],
  'bottom-right': [0, -40],
  left: [32, -18],
  right: [-32, -18],
} satisfies Record<string, [number, number]>;

type SearchMapProps = {
  listings: ListingCard[];
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  /** Fit the map here when `fitKey` changes (destination picked); otherwise fit to the results. */
  fitBounds: Bounds | null;
  fitKey: string;
  searchAsMove: boolean;
  onSearchAsMoveChange: (value: boolean) => void;
  onSearchArea: (bounds: Bounds) => void;
  linkSearch: string;
};

export function SearchMap({ listings, hoveredId, onHover, fitBounds, fitKey, searchAsMove, onSearchAsMoveChange, onSearchArea, linkSearch }: SearchMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingArea, setPendingArea] = useState<Bounds | null>(null);
  const located = useMemo(() => listings.filter((listing) => listing.location), [listings]);
  const selected = located.find((listing) => listing.id === selectedId) ?? null;

  const target = useMemo(
    () => fitBounds ?? boundsOf(located.map((listing) => listing.location!)) ?? usaBounds,
    // Re-fit only when a new search's results arrive (fitKey), never when the user pans or a map-area search refetches.
    [fitKey, fitBounds, located.length === 0],
  );

  useEffect(() => {
    mapRef.current?.fitBounds(toLngLatBounds(target), { padding: 64, duration: 700, maxZoom: 13 });
  }, [target]);

  const onMoveEnd = (event: ViewStateChangeEvent) => {
    // Only react to user gestures; programmatic fitBounds has no originalEvent.
    if (!event.originalEvent) return;
    const b = event.target.getBounds();
    const bounds = roundBounds({ north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() });
    if (searchAsMove) onSearchArea(bounds);
    else setPendingArea(bounds);
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-ink-100">
      <Map
        ref={mapRef}
        mapStyle={mapStyle}
        initialViewState={{ bounds: toLngLatBounds(target), fitBoundsOptions: { padding: 64, maxZoom: 13 } }}
        onMoveEnd={onMoveEnd}
        onClick={() => setSelectedId(null)}
        dragRotate={false}
        touchPitch={false}
        attributionControl={{ compact: true }}
      >
        <NavigationControl position="top-right" showCompass={false} />
        {located.map((listing) => {
          const active = listing.id === hoveredId || listing.id === selectedId;
          return (
            <Marker
              key={listing.id}
              longitude={listing.location!.longitude}
              latitude={listing.location!.latitude}
              anchor="bottom"
              style={{ zIndex: active ? 10 : 1 }}
              onClick={(event) => {
                event.originalEvent.stopPropagation();
                setSelectedId(listing.id);
              }}
            >
              <button
                type="button"
                onMouseEnter={() => onHover(listing.id)}
                onMouseLeave={() => onHover(null)}
                className={clsx(
                  'relative mb-[6px] rounded-[5px] px-2 py-1 text-[12px] font-extrabold tracking-wide shadow-[0_4px_12px_rgb(20_45_38/0.3)] transition-all duration-150',
                  'after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:border-x-[5px] after:border-t-[6px] after:border-x-transparent',
                  active ? 'z-10 scale-110 bg-brass text-ink-900 after:border-t-brass' : 'bg-pine-800 text-paper after:border-t-pine-800 hover:bg-pine-700',
                )}
              >
                {money(listing.stayTotal ?? listing.nightlyPrice, listing.currency)}
              </button>
            </Marker>
          );
        })}
        {selected && (
          <Popup
            longitude={selected.location!.longitude}
            latitude={selected.location!.latitude}
            // No fixed anchor: MapLibre opens the preview on whichever side fits inside the map.
            // Offsets clear the price tag, which sits just above the home's coordinate.
            offset={popupOffsets}
            focusAfterOpen={false}
            closeButton={false}
            onClose={() => setSelectedId(null)}
            maxWidth="320px"
          >
            <Link to={`/listings/${selected.id}${linkSearch}`} className="flex w-[300px] gap-3 overflow-hidden rounded-xl bg-paper p-2.5">
              {selected.images[0] && <img src={selected.images[0].url} alt="" className="h-24 w-24 shrink-0 rounded-lg object-cover" />}
              <div className="min-w-0 py-1">
                <div className="eyebrow truncate text-[10px]!">{selected.propertyType} · {selected.city}</div>
                <div className="display mt-1 line-clamp-2 text-[17px] leading-snug">{selected.title}</div>
                <div className="mt-1.5 flex items-center gap-2 text-[13px]">
                  <span><b>{money(selected.nightlyPrice, selected.currency)}</b> / night</span>
                  {selected.ratingAverage != null && (
                    <span className="flex items-center gap-0.5 text-ink-600">
                      <Star className="size-3 fill-brass text-brass" /> {rating(selected.ratingAverage)}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          </Popup>
        )}
      </Map>

      <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center">
        {!searchAsMove && pendingArea ? (
          <button
            type="button"
            onClick={() => {
              onSearchArea(pendingArea);
              setPendingArea(null);
            }}
            className="pointer-events-auto flex animate-pop-in items-center gap-2 rounded-lg bg-pine-800 px-4 py-2.5 text-[13px] font-bold text-paper shadow-float transition hover:bg-pine-900"
          >
            <Search className="size-4" /> Show homes in this area
          </button>
        ) : (
          <label className="pointer-events-auto flex items-center gap-2.5 rounded-lg bg-paper px-3.5 py-2 text-[13px] font-bold shadow-float ring-1 ring-ink-200">
            <input
              type="checkbox"
              checked={searchAsMove}
              onChange={(event) => {
                onSearchAsMoveChange(event.target.checked);
                setPendingArea(null);
              }}
              className="size-4 accent-pine-700"
            />
            Update results as I move the map
          </label>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single location (listing page / trip page)
// ---------------------------------------------------------------------------

export function LocationMap({ location, className, interactive = true }: { location: PublicLocation; className?: string; interactive?: boolean }) {
  const approximate = location.precision === 'APPROXIMATE';
  const circle = useMemo(() => circlePolygon(location, location.radiusMeters || 600), [location]);
  return (
    <div className={clsx('overflow-hidden rounded-2xl bg-ink-100', className)}>
      <Map
        mapStyle={detailMapStyle}
        initialViewState={{ longitude: location.longitude, latitude: location.latitude, zoom: approximate ? 13.2 : 14.5 }}
        scrollZoom={false}
        dragRotate={false}
        touchPitch={false}
        interactive={interactive}
        attributionControl={{ compact: true }}
      >
        <NavigationControl position="top-right" showCompass={false} />
        {approximate ? (
          <Source id="area" type="geojson" data={circle}>
            <Layer id="area-fill" type="fill" paint={{ 'fill-color': '#2c5a4a', 'fill-opacity': 0.14 }} />
            <Layer id="area-line" type="line" paint={{ 'line-color': '#224a3d', 'line-width': 1.5, 'line-dasharray': [3, 2] }} />
          </Source>
        ) : null}
        <Marker longitude={location.longitude} latitude={location.latitude} anchor="bottom">
          <span className="arch-sm flex h-12 w-10 items-end justify-center bg-pine-800 pb-2 text-paper shadow-[0_8px_18px_rgb(20_45_38/0.4)] ring-[3px] ring-paper">
            <Home className="size-4" />
          </span>
        </Marker>
      </Map>
    </div>
  );
}

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
              anchor="center"
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
                  'rounded-full px-2.5 py-1 text-[13px] font-bold shadow-[0_2px_8px_rgb(0_0_0/0.18)] ring-1 transition-all duration-150',
                  active ? 'scale-110 bg-ink-900 text-white ring-ink-900' : 'bg-white text-ink-900 ring-black/5 hover:scale-105',
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
            anchor="bottom"
            offset={22}
            closeButton={false}
            onClose={() => setSelectedId(null)}
            maxWidth="280px"
          >
            <Link to={`/listings/${selected.id}${linkSearch}`} className="block w-[260px] overflow-hidden rounded-2xl">
              {selected.images[0] && <img src={selected.images[0].url} alt="" className="aspect-[4/3] w-full object-cover" />}
              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="truncate text-sm font-semibold">{selected.title}</div>
                  {selected.ratingAverage != null && (
                    <span className="flex shrink-0 items-center gap-1 text-sm">
                      <Star className="size-3.5 fill-ink-900" /> {rating(selected.ratingAverage)}
                    </span>
                  )}
                </div>
                <div className="text-sm text-ink-500">{selected.city}</div>
                <div className="mt-1 text-sm">
                  <span className="font-semibold">{money(selected.nightlyPrice, selected.currency)}</span> night
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
            className="pointer-events-auto flex animate-pop-in items-center gap-2 rounded-full bg-ink-900 px-4 py-2.5 text-sm font-semibold text-white shadow-float transition hover:bg-black"
          >
            <Search className="size-4" /> Search this area
          </button>
        ) : (
          <label className="pointer-events-auto flex items-center gap-2.5 rounded-full bg-white px-4 py-2.5 text-sm font-semibold shadow-float">
            <input
              type="checkbox"
              checked={searchAsMove}
              onChange={(event) => {
                onSearchAsMoveChange(event.target.checked);
                setPendingArea(null);
              }}
              className="size-4 accent-ink-900"
            />
            Search as I move the map
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
            <Layer id="area-fill" type="fill" paint={{ 'fill-color': '#e11d48', 'fill-opacity': 0.14 }} />
            <Layer id="area-line" type="line" paint={{ 'line-color': '#e11d48', 'line-width': 2, 'line-opacity': 0.6 }} />
          </Source>
        ) : null}
        <Marker longitude={location.longitude} latitude={location.latitude} anchor="center">
          <span className="flex size-12 items-center justify-center rounded-full bg-brand-600 text-white shadow-[0_4px_14px_rgb(225_29_72/0.45)] ring-4 ring-white">
            <Home className="size-5" />
          </span>
        </Marker>
      </Map>
    </div>
  );
}

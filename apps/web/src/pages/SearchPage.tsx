import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowDownUp, List, Map as MapIcon, SearchX, SlidersHorizontal } from 'lucide-react';
import { api } from '../lib/api';
import { dateRangeLabel, plural } from '../lib/format';
import { useDocumentTitle } from '../lib/hooks';
import { activeFilterCount, parseSearch, serializeSearch, stayParams, toApiQuery, type SearchState } from '../lib/search';
import type { Bounds, SearchResponse } from '../lib/types';
import { PublicHeader } from '../components/layout';
import { SearchBar, type SearchSubmit } from '../components/SearchBar';
import { FiltersModal } from '../components/FiltersModal';
import { ListingCard, ListingCardSkeleton } from '../components/ListingCard';
import { SearchMap } from '../components/maps';
import { Button, EmptyState } from '../components/ui';

/** Property types shown as a typographic index rather than an icon strip. */
const typeIndex: { label: string; type: string | null }[] = [
  { label: 'Everything', type: null },
  { label: 'Houses', type: 'House' },
  { label: 'Cabins', type: 'Cabin' },
  { label: 'Villas', type: 'Villa' },
  { label: 'Cottages', type: 'Cottage' },
  { label: 'Chalets', type: 'Chalet' },
  { label: 'Apartments', type: 'Apartment' },
  { label: 'Lofts', type: 'Loft' },
  { label: 'Condos', type: 'Condo' },
];

const sortOptions = [
  { value: 'recommended', label: 'Our picks first' },
  { value: 'price_asc', label: 'Price, lowest first' },
  { value: 'price_desc', label: 'Price, highest first' },
  { value: 'rating', label: 'Best rated' },
  { value: 'newest', label: 'Newest to the collection' },
];

const mapAreaLabel = 'Map area';

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => parseSearch(params), [params]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<'list' | 'map'>(params.get('view') === 'map' ? 'map' : 'list');
  const [searchAsMove, setSearchAsMove] = useState(false);
  useDocumentTitle(state.place || state.q || 'The collection');

  const update = (patch: Partial<SearchState>) => setParams(serializeSearch({ ...state, ...patch }));

  const isMapArea = state.place === mapAreaLabel;
  // The map re-fits only when something other than a map-area pan changes.
  const fitKey = JSON.stringify({ ...state, bounds: isMapArea ? null : state.bounds, place: isMapArea ? '' : state.place });

  const search = useQuery({
    queryKey: ['search', toApiQuery(state)],
    queryFn: async () => ({ ...(await api<SearchResponse>('/public/listings', { query: toApiQuery(state) })), fitKey }),
    placeholderData: keepPreviousData,
  });
  const listings = search.data?.items ?? [];
  const linkSearch = stayParams(state);
  const filterCount = activeFilterCount(state);
  const activeType = state.types.length === 1 ? state.types[0] : state.types.length ? 'multiple' : null;

  const onSearch = (value: SearchSubmit) => update({ ...value });
  const onSearchArea = (bounds: Bounds) => update({ bounds, place: mapAreaLabel, q: '' });

  const where = isMapArea ? 'within the map area' : state.place ? `in ${state.place.split(',')[0]}` : state.q ? `matching “${state.q}”` : 'across the collection';

  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader wide center={<SearchBar initial={state} onSearch={onSearch} />} />

      <div className="sticky top-[72px] z-20 border-b border-ink-200 bg-paper/95 backdrop-blur-md">
        <div className="flex items-center gap-4 px-5 md:px-10">
          <nav className="scrollbar-none flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-3" aria-label="Property type">
            {typeIndex.map((entry, index) => {
              const active = entry.type === activeType || (!entry.type && !activeType);
              return (
                <span key={entry.label} className="flex shrink-0 items-center">
                  {index > 0 && <span className="mx-2 size-1 rotate-45 bg-ink-300" />}
                  <button
                    type="button"
                    onClick={() => update({ types: entry.type ? [entry.type] : [] })}
                    className={clsx(
                      'display rounded-md px-2 py-1 text-[17px] transition',
                      active ? 'bg-pine-700 text-paper italic' : 'text-ink-600 hover:text-pine-700',
                    )}
                  >
                    {entry.label}
                  </button>
                </span>
              );
            })}
          </nav>
          <div className="flex shrink-0 items-center gap-2 py-3">
            <label className="relative hidden items-center sm:flex">
              <ArrowDownUp className="pointer-events-none absolute left-3 size-3.5 text-ink-500" />
              <select
                aria-label="Sort"
                value={state.sort}
                onChange={(event) => update({ sort: event.target.value })}
                className="h-10 cursor-pointer appearance-none rounded-lg border border-ink-300 bg-white pr-4 pl-8 text-[13px] font-bold transition outline-none hover:border-ink-900"
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className={clsx(
                'flex h-10 items-center gap-2 rounded-lg border px-3.5 text-[13px] font-bold transition',
                filterCount ? 'border-pine-700 bg-pine-50 text-pine-800' : 'border-ink-300 bg-white hover:border-ink-900',
              )}
            >
              <SlidersHorizontal className="size-4" />
              <span className="hidden sm:inline">Refine</span>
              {filterCount > 0 && <span className="rounded-sm bg-pine-700 px-1.5 text-[11px] text-paper">{filterCount}</span>}
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-1">
        <section className={clsx('min-w-0 flex-1 px-5 pt-8 pb-28 md:px-10 lg:max-w-[58%] lg:flex-none lg:basis-[58%]', mobileView === 'map' && 'hidden lg:block')}>
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">{state.checkIn && state.checkOut ? `${dateRangeLabel(state.checkIn, state.checkOut)}${state.guests ? ` · ${plural(state.guests, 'guest')}` : ''}` : 'Any dates'}</p>
              <h1 className="display mt-1 text-[34px] leading-tight">
                {search.data ? plural(search.data.total, 'home') : 'Homes'} <em className="font-light text-ink-500">{where}</em>
              </h1>
              {state.checkIn && state.checkOut && <p className="mt-1 text-[13px] text-ink-500">Prices shown are the total for your dates, cleaning included.</p>}
            </div>
            {(isMapArea || state.place || state.q || filterCount > 0) && (
              <button type="button" className="shrink-0 text-[13px] font-bold underline underline-offset-4 hover:text-pine-700" onClick={() => setParams(serializeSearch({ checkIn: state.checkIn, checkOut: state.checkOut, guests: state.guests }))}>
                Start over
              </button>
            )}
          </div>

          {search.isPending ? (
            <div className="grid grid-cols-1 gap-x-7 gap-y-12 sm:grid-cols-2 2xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, index) => (
                <ListingCardSkeleton key={index} />
              ))}
            </div>
          ) : listings.length ? (
            <div className={clsx('grid grid-cols-1 gap-x-7 gap-y-12 transition-opacity sm:grid-cols-2 2xl:grid-cols-3', search.isFetching && 'opacity-60')}>
              {listings.map((listing) => (
                <ListingCard key={listing.id} listing={listing} linkSearch={linkSearch} highlighted={hoveredId === listing.id} onHover={setHoveredId} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<SearchX className="size-5" />}
              title="Nothing quite fits"
              description="Try different dates, fewer filters, or zoom out on the map to see more of the collection."
              action={
                <Button variant="secondary" onClick={() => setParams(serializeSearch({}))}>
                  Show every home
                </Button>
              }
            />
          )}
        </section>

        <aside className={clsx('sticky top-[137px] h-[calc(100dvh-137px)] flex-1 border-l border-ink-200', mobileView === 'map' ? 'block' : 'hidden lg:block')}>
          <SearchMap
            listings={listings}
            hoveredId={hoveredId}
            onHover={setHoveredId}
            fitBounds={state.bounds}
            fitKey={search.data?.fitKey ?? ''}
            searchAsMove={searchAsMove}
            onSearchAsMoveChange={setSearchAsMove}
            onSearchArea={onSearchArea}
            linkSearch={linkSearch}
          />
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-6 z-30 flex justify-center lg:hidden">
        <div className="flex rounded-lg bg-pine-900 p-1 shadow-float">
          {(['list', 'map'] as const).map((view) => (
            <button
              key={view}
              type="button"
              onClick={() => setMobileView(view)}
              className={clsx('flex items-center gap-2 rounded-md px-4 py-2 text-[13px] font-bold transition', mobileView === view ? 'bg-paper text-pine-900' : 'text-paper/70')}
            >
              {view === 'list' ? <List className="size-4" /> : <MapIcon className="size-4" />}
              {view === 'list' ? 'List' : 'Map'}
            </button>
          ))}
        </div>
      </div>

      <FiltersModal
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        state={state}
        priceRange={search.data?.priceRange ?? { min: 0, max: 100000 }}
        onApply={(filters) => update(filters)}
      />
    </div>
  );
}

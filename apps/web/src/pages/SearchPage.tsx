import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Building, Castle, Home, Hotel, LayoutGrid, List, Map as MapIcon, MountainSnow, SearchX, SlidersHorizontal, Tent, TreePine, Warehouse } from 'lucide-react';
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

const categories = [
  { label: 'All homes', type: null, icon: LayoutGrid },
  { label: 'Houses', type: 'House', icon: Home },
  { label: 'Cabins', type: 'Cabin', icon: TreePine },
  { label: 'Villas', type: 'Villa', icon: Castle },
  { label: 'Apartments', type: 'Apartment', icon: Building },
  { label: 'Cottages', type: 'Cottage', icon: Tent },
  { label: 'Chalets', type: 'Chalet', icon: MountainSnow },
  { label: 'Lofts', type: 'Loft', icon: Warehouse },
  { label: 'Condos', type: 'Condo', icon: Hotel },
];

const sortOptions = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'rating', label: 'Top rated' },
  { value: 'newest', label: 'Newest' },
];

const mapAreaLabel = 'Map area';

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => parseSearch(params), [params]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<'list' | 'map'>('list');
  const [searchAsMove, setSearchAsMove] = useState(false);
  useDocumentTitle(state.place || state.q || 'Find your stay');

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

  const heading = (() => {
    const where = isMapArea ? 'in this map area' : state.place ? `in ${state.place.split(',')[0]}` : state.q ? `matching “${state.q}”` : '';
    const count = search.data ? plural(search.data.total, 'home') : 'Homes';
    return `${count} ${where}`.trim();
  })();

  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader
        wide
        center={<SearchBar initial={state} onSearch={onSearch} />}
      />

      <div className="sticky top-20 z-20 border-b border-ink-100 bg-white">
        <div className="flex items-center gap-4 px-5 md:px-10">
          <div className="scrollbar-none flex min-w-0 flex-1 gap-7 overflow-x-auto pt-3">
            {categories.map((category) => {
              const active = category.type === activeType || (!category.type && !activeType);
              return (
                <button
                  key={category.label}
                  type="button"
                  onClick={() => update({ types: category.type ? [category.type] : [] })}
                  className={clsx(
                    'group flex shrink-0 flex-col items-center gap-1.5 border-b-2 pb-3 text-xs font-semibold transition',
                    active ? 'border-ink-900 text-ink-900' : 'border-transparent text-ink-500 hover:border-ink-200 hover:text-ink-900',
                  )}
                >
                  <category.icon className={clsx('size-6 transition', active ? 'stroke-[1.75]' : 'stroke-[1.5] group-hover:scale-105')} />
                  {category.label}
                </button>
              );
            })}
          </div>
          <div className="flex shrink-0 items-center gap-2 py-3">
            <select
              aria-label="Sort"
              value={state.sort}
              onChange={(event) => update({ sort: event.target.value })}
              className="hidden h-12 cursor-pointer rounded-xl border border-ink-200 bg-white px-3 text-sm font-semibold transition outline-none hover:border-ink-900 sm:block"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className={clsx(
                'relative flex h-12 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition hover:border-ink-900',
                filterCount ? 'border-ink-900 bg-ink-50' : 'border-ink-200',
              )}
            >
              <SlidersHorizontal className="size-4" />
              <span className="hidden sm:inline">Filters</span>
              {filterCount > 0 && (
                <span className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full bg-ink-900 text-[11px] text-white">{filterCount}</span>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-1">
        <section className={clsx('min-w-0 flex-1 px-5 pt-6 pb-24 md:px-10 lg:max-w-[58%] lg:flex-none lg:basis-[58%]', mobileView === 'map' && 'hidden lg:block')}>
          <div className="mb-6 flex items-baseline justify-between gap-4">
            <div>
              <h1 className="text-lg font-semibold">{heading}</h1>
              {state.checkIn && state.checkOut && (
                <p className="text-sm text-ink-500">
                  {dateRangeLabel(state.checkIn, state.checkOut)}
                  {state.guests ? ` · ${plural(state.guests, 'guest')}` : ''} · prices include cleaning fees
                </p>
              )}
            </div>
            {(isMapArea || state.place || state.q || filterCount > 0) && (
              <button type="button" className="shrink-0 text-sm font-semibold underline underline-offset-4" onClick={() => setParams(serializeSearch({ checkIn: state.checkIn, checkOut: state.checkOut, guests: state.guests }))}>
                Reset search
              </button>
            )}
          </div>

          {search.isPending ? (
            <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, index) => (
                <ListingCardSkeleton key={index} />
              ))}
            </div>
          ) : listings.length ? (
            <div className={clsx('grid grid-cols-1 gap-x-6 gap-y-10 transition-opacity sm:grid-cols-2 xl:grid-cols-3', search.isFetching && 'opacity-60')}>
              {listings.map((listing) => (
                <ListingCard key={listing.id} listing={listing} linkSearch={linkSearch} highlighted={hoveredId === listing.id} onHover={setHoveredId} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<SearchX className="size-6" />}
              title="No exact matches"
              description="Try changing or removing some of your filters, adjusting your dates, or zooming out on the map."
              action={
                <Button variant="secondary" onClick={() => setParams(serializeSearch({}))}>
                  Clear all filters
                </Button>
              }
            />
          )}
        </section>

        <aside className={clsx('sticky top-[166px] h-[calc(100dvh-166px)] flex-1', mobileView === 'map' ? 'block' : 'hidden lg:block')}>
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

      <button
        type="button"
        onClick={() => setMobileView(mobileView === 'list' ? 'map' : 'list')}
        className="fixed bottom-8 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-ink-900 px-5 py-3.5 text-sm font-semibold text-white shadow-float transition hover:scale-105 active:scale-95 lg:hidden"
      >
        {mobileView === 'list' ? (
          <>
            Show map <MapIcon className="size-4" />
          </>
        ) : (
          <>
            Show list <List className="size-4" />
          </>
        )}
      </button>

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

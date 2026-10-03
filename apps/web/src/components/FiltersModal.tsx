import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { api } from '../lib/api';
import { amenityByKey, popularAmenityKeys, propertyTypes } from '../lib/amenities';
import { toApiQuery, type SearchState } from '../lib/search';
import type { SearchResponse } from '../lib/types';
import { Button, Counter, Modal } from './ui';

type Filters = Pick<SearchState, 'minPrice' | 'maxPrice' | 'bedrooms' | 'beds' | 'bathrooms' | 'types' | 'amenities'>;

const emptyFilters: Filters = { minPrice: null, maxPrice: null, bedrooms: 0, beds: 0, bathrooms: 0, types: [], amenities: [] };

function toggle(list: string[], value: string) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function FiltersModal({ open, onClose, state, priceRange, onApply }: {
  open: boolean;
  onClose: () => void;
  state: SearchState;
  priceRange: { min: number; max: number };
  onApply: (filters: Filters) => void;
}) {
  const [draft, setDraft] = useState<Filters>(state);
  const [showAllAmenities, setShowAllAmenities] = useState(false);

  useEffect(() => {
    if (open) setDraft({ minPrice: state.minPrice, maxPrice: state.maxPrice, bedrooms: state.bedrooms, beds: state.beds, bathrooms: state.bathrooms, types: state.types, amenities: state.amenities });
  }, [open, state]);

  // Live result count for the draft, so "Show N homes" is always accurate.
  const preview = useQuery({
    queryKey: ['search-count', { ...state, ...draft }],
    queryFn: () => api<SearchResponse>('/public/listings', { query: toApiQuery({ ...state, ...draft }) }),
    enabled: open,
    placeholderData: keepPreviousData,
  });

  const floor = Math.floor(priceRange.min / 100 / 10) * 10;
  const ceiling = Math.max(floor + 10, Math.ceil(priceRange.max / 100 / 10) * 10);
  const low = draft.minPrice != null ? draft.minPrice / 100 : floor;
  const high = draft.maxPrice != null ? draft.maxPrice / 100 : ceiling;
  const setPrice = (nextLow: number, nextHigh: number) =>
    setDraft((current) => ({
      ...current,
      minPrice: nextLow <= floor ? null : Math.round(nextLow) * 100,
      maxPrice: nextHigh >= ceiling ? null : Math.round(nextHigh) * 100,
    }));
  const percent = (value: number) => ((value - floor) / (ceiling - floor)) * 100;

  const amenityKeys = showAllAmenities ? [...amenityByKey.keys()] : popularAmenityKeys;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Filters"
      size="lg"
      footer={
        <div className="flex items-center justify-between">
          <button type="button" className="text-[15px] font-semibold underline underline-offset-4" onClick={() => setDraft(emptyFilters)}>
            Clear all
          </button>
          <Button
            size="lg"
            loading={preview.isFetching && !preview.data}
            onClick={() => {
              onApply(draft);
              onClose();
            }}
          >
            {preview.data ? `Show ${preview.data.total} ${preview.data.total === 1 ? 'home' : 'homes'}` : 'Show homes'}
          </Button>
        </div>
      }
    >
      <section className="pb-8">
        <h3 className="text-xl font-semibold">Price range</h3>
        <p className="mt-1 text-sm text-ink-500">Nightly prices before fees</p>
        <div className="relative mt-8 h-6">
          <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-ink-200" />
          <div className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-ink-900" style={{ left: `${percent(low)}%`, right: `${100 - percent(high)}%` }} />
          {[
            { value: low, onChange: (value: number) => setPrice(Math.min(value, high - 10), high), label: 'Minimum price' },
            { value: high, onChange: (value: number) => setPrice(low, Math.max(value, low + 10)), label: 'Maximum price' },
          ].map((thumb) => (
            <input
              key={thumb.label}
              type="range"
              aria-label={thumb.label}
              min={floor}
              max={ceiling}
              step={10}
              value={thumb.value}
              onChange={(event) => thumb.onChange(Number(event.target.value))}
              className="pointer-events-none absolute inset-0 w-full appearance-none bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-7 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-ink-300 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-md [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:size-7 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-ink-300 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:active:scale-110"
            />
          ))}
        </div>
        <div className="mt-6 flex items-center justify-between gap-4">
          <PriceBox label="Minimum" value={low} onChange={(value) => setPrice(value, high)} />
          <span className="h-px w-4 bg-ink-300" />
          <PriceBox label="Maximum" value={high} suffix={high >= ceiling ? '+' : ''} onChange={(value) => setPrice(low, value)} />
        </div>
      </section>

      <section className="border-t border-ink-100 py-8">
        <h3 className="text-xl font-semibold">Rooms and beds</h3>
        <div className="mt-2 divide-y divide-ink-100">
          <Counter label="Bedrooms" value={draft.bedrooms} zeroLabel="Any" max={12} onChange={(bedrooms) => setDraft({ ...draft, bedrooms })} />
          <Counter label="Beds" value={draft.beds} zeroLabel="Any" max={16} onChange={(beds) => setDraft({ ...draft, beds })} />
          <Counter label="Bathrooms" value={draft.bathrooms} zeroLabel="Any" max={8} onChange={(bathrooms) => setDraft({ ...draft, bathrooms })} />
        </div>
      </section>

      <section className="border-t border-ink-100 py-8">
        <h3 className="text-xl font-semibold">Property type</h3>
        <div className="mt-4 flex flex-wrap gap-2">
          {propertyTypes.map((type) => (
            <Chip key={type} active={draft.types.includes(type)} onClick={() => setDraft({ ...draft, types: toggle(draft.types, type) })}>
              {type}
            </Chip>
          ))}
        </div>
      </section>

      <section className="border-t border-ink-100 pt-8">
        <h3 className="text-xl font-semibold">Amenities</h3>
        <div className="mt-4 flex flex-wrap gap-2">
          {amenityKeys.map((key) => {
            const amenity = amenityByKey.get(key)!;
            return (
              <Chip key={key} active={draft.amenities.includes(key)} onClick={() => setDraft({ ...draft, amenities: toggle(draft.amenities, key) })}>
                <amenity.icon className="size-4" />
                {amenity.label}
              </Chip>
            );
          })}
        </div>
        <button type="button" className="mt-5 text-[15px] font-semibold underline underline-offset-4" onClick={() => setShowAllAmenities((value) => !value)}>
          {showAllAmenities ? 'Show fewer' : 'Show all amenities'}
        </button>
      </section>
    </Modal>
  );
}

function PriceBox({ label, value, onChange, suffix }: { label: string; value: number; onChange: (value: number) => void; suffix?: string }) {
  return (
    <label className="flex-1 rounded-2xl border border-ink-300 px-4 py-2 focus-within:border-ink-900 focus-within:ring-1 focus-within:ring-ink-900">
      <span className="block text-xs text-ink-500">{label}</span>
      <span className="flex items-center">
        <span className="text-[15px]">$</span>
        <input
          type="number"
          min={0}
          value={Math.round(value)}
          onChange={(event) => onChange(Number(event.target.value) || 0)}
          className="w-full bg-transparent text-[15px] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        {suffix}
      </span>
    </label>
  );
}

export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition active:scale-95',
        active ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white text-ink-800 hover:border-ink-900',
      )}
    >
      {children}
    </button>
  );
}


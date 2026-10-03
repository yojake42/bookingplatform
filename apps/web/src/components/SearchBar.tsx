import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Building2, MapPin, Search, X } from 'lucide-react';
import { api } from '../lib/api';
import { dateRangeLabel, plural } from '../lib/format';
import { useClickOutside, useDebounced, useMediaQuery } from '../lib/hooks';
import { padBounds, type SearchState } from '../lib/search';
import type { Bounds, Destination, Place } from '../lib/types';
import { DateRangeCalendar } from './DateRangeCalendar';
import { Button, Counter, Modal } from './ui';

export type SearchSubmit = Pick<SearchState, 'q' | 'place' | 'bounds' | 'checkIn' | 'checkOut' | 'guests'>;

type Panel = 'where' | 'dates' | 'guests' | null;

// ---------------------------------------------------------------------------
// Where: destinations from our own listings, plus geocoded places
// ---------------------------------------------------------------------------

type Suggestion =
  | { kind: 'destination'; label: string; detail: string; bounds: Bounds | null }
  | { kind: 'place'; label: string; detail: string; bounds: Bounds };

function useSuggestions(text: string) {
  const term = useDebounced(text.trim(), 220);
  const destinations = useQuery({
    queryKey: ['destinations', term],
    queryFn: () => api<Destination[]>('/public/listings/destinations', { query: { q: term } }),
    staleTime: 60_000,
  });
  const places = useQuery({
    queryKey: ['places', term],
    queryFn: () => api<Place[]>('/geo/search', { query: { q: term } }),
    enabled: term.length >= 3,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const suggestions: Suggestion[] = [
    ...(destinations.data ?? []).map((destination) => ({
      kind: 'destination' as const,
      label: destination.label,
      detail: plural(destination.count, 'home'),
      bounds: destination.bounds ? padBounds(destination.bounds, 0.15) : null,
    })),
    ...(places.data ?? [])
      .filter((place) => !destinations.data?.some((destination) => destination.label === place.label))
      .slice(0, 5)
      .map((place) => ({
        kind: 'place' as const,
        label: place.label,
        detail: place.type ? place.type.charAt(0).toUpperCase() + place.type.slice(1).replace(/_/g, ' ') : 'Place',
        bounds: place.bounds
          ? padBounds(place.bounds, 0.12)
          : { north: place.latitude + 0.25, south: place.latitude - 0.25, east: place.longitude + 0.3, west: place.longitude - 0.3 },
      })),
  ];
  return { suggestions, loading: destinations.isFetching || places.isFetching, term };
}

function WhereSuggestions({ text, onPick }: { text: string; onPick: (suggestion: Suggestion) => void }) {
  const { suggestions, term } = useSuggestions(text);
  return (
    <div className="py-2">
      <div className="px-4 pt-2 pb-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">{term ? 'Suggestions' : 'Popular destinations'}</div>
      {term && (
        <SuggestionRow icon={<Search className="size-5" />} title={`Search "${term}"`} detail="Match titles, cities and regions" onClick={() => onPick({ kind: 'destination', label: term, detail: '', bounds: null })} />
      )}
      {suggestions.map((suggestion) => (
        <SuggestionRow
          key={`${suggestion.kind}:${suggestion.label}`}
          icon={suggestion.kind === 'destination' ? <Building2 className="size-5" /> : <MapPin className="size-5" />}
          title={suggestion.label}
          detail={suggestion.detail}
          onClick={() => onPick(suggestion)}
        />
      ))}
      {!term && !suggestions.length && <p className="px-4 py-3 text-sm text-ink-500">Start typing a city, region or address.</p>}
    </div>
  );
}

function SuggestionRow({ icon, title, detail, onClick }: { icon: ReactNode; title: string; detail: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-4 px-4 py-2.5 text-left transition hover:bg-ink-50">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-ink-100 text-ink-700">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-[15px] text-ink-900">{title}</span>
        {detail && <span className="block text-sm text-ink-500">{detail}</span>}
      </span>
    </button>
  );
}

function GuestsPanel({ guests, onChange }: { guests: number; onChange: (value: number) => void }) {
  return (
    <div className="px-6 py-3">
      <Counter label="Guests" description="Adults and children" value={guests} min={0} max={16} zeroLabel="0" onChange={onChange} />
      <p className="pb-2 text-sm text-ink-500">Infants under 2 don't count toward the guest limit.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bar
// ---------------------------------------------------------------------------

export function SearchBar({ initial, onSearch, autoFocus }: { initial: SearchSubmit; onSearch: (value: SearchSubmit) => void; autoFocus?: boolean }) {
  const desktop = useMediaQuery('(min-width: 768px)');
  const [panel, setPanel] = useState<Panel>(null);
  const [text, setText] = useState(initial.place || initial.q);
  const [where, setWhere] = useState<Pick<SearchSubmit, 'q' | 'place' | 'bounds'>>({ q: initial.q, place: initial.place, bounds: initial.bounds });
  const [dates, setDates] = useState({ checkIn: initial.checkIn, checkOut: initial.checkOut });
  const [guests, setGuests] = useState(initial.guests);
  const [mobileOpen, setMobileOpen] = useState(false);
  const container = useClickOutside<HTMLFormElement>(() => setPanel(null), panel !== null);
  const input = useRef<HTMLInputElement>(null);

  // Stay in sync when the URL changes underneath us (back button, map search).
  useEffect(() => {
    setText(initial.place || initial.q);
    setWhere({ q: initial.q, place: initial.place, bounds: initial.bounds });
    setDates({ checkIn: initial.checkIn, checkOut: initial.checkOut });
    setGuests(initial.guests);
  }, [initial.q, initial.place, initial.bounds, initial.checkIn, initial.checkOut, initial.guests]);

  useEffect(() => {
    if (autoFocus && desktop) {
      setPanel('where');
      input.current?.focus();
    }
  }, [autoFocus, desktop]);

  const submit = (override?: Partial<SearchSubmit>) => {
    const typed = text.trim();
    const whereValue = typed === (where.place || where.q) ? where : { q: typed, place: '', bounds: null };
    setPanel(null);
    setMobileOpen(false);
    onSearch({ ...whereValue, ...dates, guests, ...override });
  };

  const pick = (suggestion: Suggestion) => {
    setText(suggestion.label);
    const next = suggestion.bounds
      ? { q: '', place: suggestion.label, bounds: suggestion.bounds }
      : { q: suggestion.label, place: '', bounds: null };
    setWhere(next);
    if (desktop) setPanel('dates');
    else onSearch({ ...next, ...dates, guests });
  };

  const datesLabel = dates.checkIn && dates.checkOut ? dateRangeLabel(dates.checkIn, dates.checkOut) : null;

  if (!desktop) {
    return (
      <>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="flex w-full items-center gap-3 rounded-full bg-white px-4 py-2.5 text-left shadow-[0_3px_12px_rgb(0_0_0/0.1)] ring-1 ring-ink-200/70"
        >
          <Search className="size-5 shrink-0" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{text || 'Where to?'}</span>
            <span className="block truncate text-xs text-ink-500">
              {datesLabel ?? 'Any week'} · {guests ? plural(guests, 'guest') : 'Add guests'}
            </span>
          </span>
        </button>
        <Modal open={mobileOpen} onClose={() => setMobileOpen(false)} title="Search" size="full" bodyClassName="bg-ink-50 p-4 space-y-3"
          footer={
            <div className="flex items-center justify-between">
              <button type="button" className="text-[15px] font-semibold underline" onClick={() => { setText(''); setWhere({ q: '', place: '', bounds: null }); setDates({ checkIn: null, checkOut: null }); setGuests(0); }}>
                Clear all
              </button>
              <Button variant="brand" size="lg" icon={<Search className="size-5" />} onClick={() => submit()}>
                Search
              </Button>
            </div>
          }
        >
          <div className="rounded-3xl bg-white p-4 shadow-card">
            <h3 className="mb-3 text-xl font-bold">Where to?</h3>
            <div className="relative">
              <Search className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-500" />
              <input value={text} onChange={(event) => setText(event.target.value)} placeholder="Search destinations" className="field pl-10" />
            </div>
            <WhereSuggestions text={text} onPick={pick} />
          </div>
          <div className="rounded-3xl bg-white p-4 shadow-card">
            <h3 className="mb-3 text-xl font-bold">When?</h3>
            <DateRangeCalendar months={1} checkIn={dates.checkIn} checkOut={dates.checkOut} onChange={setDates} />
          </div>
          <div className="rounded-3xl bg-white shadow-card">
            <h3 className="px-4 pt-4 text-xl font-bold">Who?</h3>
            <GuestsPanel guests={guests} onChange={setGuests} />
          </div>
        </Modal>
      </>
    );
  }

  const segment = (name: Exclude<Panel, null>) =>
    clsx(
      'relative flex h-full flex-col justify-center rounded-full px-6 text-left transition-colors duration-150',
      panel === name ? 'bg-white shadow-[0_6px_20px_rgb(0_0_0/0.12)]' : panel ? 'hover:bg-ink-200/60' : 'hover:bg-ink-100',
    );

  return (
    <form
      ref={container}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className={clsx(
        'relative mx-auto flex h-16 w-full max-w-[850px] items-center rounded-full ring-1 ring-ink-200 transition-colors duration-200',
        panel ? 'bg-ink-100' : 'bg-white shadow-[0_3px_12px_rgb(0_0_0/0.08)]',
      )}
    >
      <div className={clsx(segment('where'), 'min-w-0 flex-[1.3] cursor-text')} onClick={() => { setPanel('where'); input.current?.focus(); }}>
        <span className="text-xs font-semibold">Where</span>
        <div className="flex items-center">
          <input
            ref={input}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setPanel('where');
            }}
            onFocus={() => setPanel('where')}
            placeholder="Search destinations"
            className="w-full min-w-0 bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-500"
          />
          {text && panel === 'where' && (
            <button
              type="button"
              aria-label="Clear"
              onClick={(event) => {
                event.stopPropagation();
                setText('');
                setWhere({ q: '', place: '', bounds: null });
                input.current?.focus();
              }}
              className="ml-1 flex size-6 shrink-0 items-center justify-center rounded-full bg-ink-200 text-ink-700 hover:bg-ink-300"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      <span className={clsx('h-8 w-px bg-ink-200', panel && 'opacity-0')} />
      <button type="button" className={clsx(segment('dates'), 'flex-1')} onClick={() => setPanel('dates')}>
        <span className="text-xs font-semibold">Check in</span>
        <span className={clsx('truncate text-sm', dates.checkIn ? 'text-ink-900' : 'text-ink-500')}>{dates.checkIn ? dateRangeLabel(dates.checkIn) : 'Add dates'}</span>
      </button>
      <span className={clsx('h-8 w-px bg-ink-200', panel && 'opacity-0')} />
      <button type="button" className={clsx(segment('dates'), 'flex-1')} onClick={() => setPanel('dates')}>
        <span className="text-xs font-semibold">Check out</span>
        <span className={clsx('truncate text-sm', dates.checkOut ? 'text-ink-900' : 'text-ink-500')}>{dates.checkOut ? dateRangeLabel(dates.checkOut) : 'Add dates'}</span>
      </button>
      <span className={clsx('h-8 w-px bg-ink-200', panel && 'opacity-0')} />
      <div className={clsx(segment('guests'), 'flex-[1.2] flex-row items-center justify-between gap-2 pr-2')} onClick={() => setPanel('guests')} role="button" tabIndex={0}>
        <span className="flex min-w-0 flex-col">
          <span className="text-xs font-semibold">Who</span>
          <span className={clsx('truncate text-sm', guests ? 'text-ink-900' : 'text-ink-500')}>{guests ? plural(guests, 'guest') : 'Add guests'}</span>
        </span>
        <button
          type="submit"
          onClick={(event) => event.stopPropagation()}
          className={clsx(
            'flex h-12 items-center justify-center gap-2 rounded-full bg-brand-600 font-semibold text-white transition-all duration-200 hover:bg-brand-700 active:scale-95',
            panel ? 'px-5' : 'w-12',
          )}
          aria-label="Search"
        >
          <Search className="size-[18px] stroke-[2.5]" />
          {panel && <span>Search</span>}
        </button>
      </div>

      {panel && (
        <div
          className={clsx(
            'absolute top-[calc(100%+12px)] z-40 animate-pop-in overflow-hidden rounded-[2rem] bg-white shadow-float ring-1 ring-black/5',
            panel === 'where' && 'left-0 w-[440px] max-h-[460px] overflow-y-auto',
            panel === 'dates' && 'left-1/2 w-[780px] -translate-x-1/2 p-8',
            panel === 'guests' && 'right-0 w-[380px]',
          )}
        >
          {panel === 'where' && <WhereSuggestions text={text} onPick={pick} />}
          {panel === 'dates' && (
            <>
              <DateRangeCalendar
                checkIn={dates.checkIn}
                checkOut={dates.checkOut}
                onChange={(value) => {
                  setDates(value);
                  if (value.checkIn && value.checkOut) setPanel('guests');
                }}
              />
              <div className="mt-4 flex justify-end">
                <button type="button" className="text-sm font-semibold underline" onClick={() => setDates({ checkIn: null, checkOut: null })}>
                  Clear dates
                </button>
              </div>
            </>
          )}
          {panel === 'guests' && <GuestsPanel guests={guests} onChange={setGuests} />}
        </div>
      )}
    </form>
  );
}

/** Compact pill used on non-search pages; clicking jumps to the search page. */
export function CompactSearchPill({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-full py-2 pr-2 pl-5 text-sm font-semibold shadow-[0_2px_10px_rgb(0_0_0/0.08)] ring-1 ring-ink-200 transition hover:shadow-[0_4px_16px_rgb(0_0_0/0.12)]"
    >
      <span>Anywhere</span>
      <span className="h-5 w-px bg-ink-200" />
      <span>Any week</span>
      <span className="h-5 w-px bg-ink-200" />
      <span className="font-normal text-ink-500">Add guests</span>
      <span className="flex size-8 items-center justify-center rounded-full bg-brand-600 text-white">
        <Search className="size-3.5 stroke-[3]" />
      </span>
    </button>
  );
}


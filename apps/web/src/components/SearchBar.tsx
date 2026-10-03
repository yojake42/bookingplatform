import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowRight, CalendarDays, Compass, MapPin, Search, Users, X } from 'lucide-react';
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
      detail: `${plural(destination.count, 'home')} in the collection`,
      bounds: destination.bounds ? padBounds(destination.bounds, 0.15) : null,
    })),
    ...(places.data ?? [])
      .filter((place) => !destinations.data?.some((destination) => destination.label === place.label))
      .slice(0, 5)
      .map((place) => ({
        kind: 'place' as const,
        label: place.label,
        detail: place.type ? `Search near this ${place.type.replace(/_/g, ' ')}` : 'Search near this place',
        bounds: place.bounds
          ? padBounds(place.bounds, 0.12)
          : { north: place.latitude + 0.25, south: place.latitude - 0.25, east: place.longitude + 0.3, west: place.longitude - 0.3 },
      })),
  ];
  return { suggestions, term };
}

function WhereSuggestions({ text, onPick }: { text: string; onPick: (suggestion: Suggestion) => void }) {
  const { suggestions, term } = useSuggestions(text);
  return (
    <div className="py-3">
      <div className="eyebrow px-5 pb-2">{term ? 'Suggestions' : 'Where our homes are'}</div>
      {term && (
        <SuggestionRow icon={<Search className="size-4" />} title={`Search for “${term}”`} detail="Matches home names, towns and regions" onClick={() => onPick({ kind: 'destination', label: term, detail: '', bounds: null })} />
      )}
      {suggestions.map((suggestion) => (
        <SuggestionRow
          key={`${suggestion.kind}:${suggestion.label}`}
          icon={suggestion.kind === 'destination' ? <Compass className="size-4" /> : <MapPin className="size-4" />}
          title={suggestion.label}
          detail={suggestion.detail}
          onClick={() => onPick(suggestion)}
        />
      ))}
      {!term && !suggestions.length && <p className="px-5 py-3 text-sm text-ink-500">Start typing a town, region or address.</p>}
    </div>
  );
}

function SuggestionRow({ icon, title, detail, onClick }: { icon: ReactNode; title: string; detail: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group flex w-full items-center gap-3.5 px-5 py-2.5 text-left transition hover:bg-sand">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-ink-200 bg-white text-pine-700 transition group-hover:border-pine-700">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-semibold text-ink-900">{title}</span>
        {detail && <span className="block text-[13px] text-ink-500">{detail}</span>}
      </span>
    </button>
  );
}

function GuestsPanel({ guests, onChange }: { guests: number; onChange: (value: number) => void }) {
  return (
    <div className="px-6 py-3">
      <Counter label="Guests" description="Adults and children" value={guests} min={0} max={16} zeroLabel="0" onChange={onChange} />
      <p className="pb-2 text-[13px] text-ink-500">Infants under 2 stay free and don't count toward the limit.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

function useSearchDraft(initial: SearchSubmit, onSearch: (value: SearchSubmit) => void) {
  const [text, setText] = useState(initial.place || initial.q);
  const [where, setWhere] = useState<Pick<SearchSubmit, 'q' | 'place' | 'bounds'>>({ q: initial.q, place: initial.place, bounds: initial.bounds });
  const [dates, setDates] = useState({ checkIn: initial.checkIn, checkOut: initial.checkOut });
  const [guests, setGuests] = useState(initial.guests);

  // Stay in sync when the URL changes underneath us (back button, map search).
  useEffect(() => {
    setText(initial.place || initial.q);
    setWhere({ q: initial.q, place: initial.place, bounds: initial.bounds });
    setDates({ checkIn: initial.checkIn, checkOut: initial.checkOut });
    setGuests(initial.guests);
  }, [initial.q, initial.place, initial.bounds, initial.checkIn, initial.checkOut, initial.guests]);

  const submit = (override?: Partial<SearchSubmit>) => {
    const typed = text.trim();
    const whereValue = typed === (where.place || where.q) ? where : { q: typed, place: '', bounds: null };
    onSearch({ ...whereValue, ...dates, guests, ...override });
  };

  const pick = (suggestion: Suggestion) => {
    setText(suggestion.label);
    const next = suggestion.bounds ? { q: '', place: suggestion.label, bounds: suggestion.bounds } : { q: suggestion.label, place: '', bounds: null };
    setWhere(next);
    return next;
  };

  const clearWhere = () => {
    setText('');
    setWhere({ q: '', place: '', bounds: null });
  };

  return { text, setText, where, dates, setDates, guests, setGuests, submit, pick, clearWhere };
}

type Draft = ReturnType<typeof useSearchDraft>;

function MobileSearchSheet({ draft, open, onClose }: { draft: Draft; open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Find a stay"
      size="full"
      bodyClassName="bg-sand p-4 space-y-3"
      footer={
        <div className="flex items-center justify-between">
          <button type="button" className="text-sm font-bold underline underline-offset-4" onClick={() => { draft.clearWhere(); draft.setDates({ checkIn: null, checkOut: null }); draft.setGuests(0); }}>
            Clear all
          </button>
          <Button variant="brand" size="lg" icon={<Search className="size-4" />} onClick={() => { draft.submit(); onClose(); }}>
            Search
          </Button>
        </div>
      }
    >
      <div className="rounded-xl bg-white p-4 ring-1 ring-ink-200">
        <h3 className="display mb-3 text-2xl">Where?</h3>
        <div className="relative">
          <Search className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-500" />
          <input value={draft.text} onChange={(event) => draft.setText(event.target.value)} placeholder="Town, region or address" className="field pl-10" />
        </div>
        <WhereSuggestions text={draft.text} onPick={(suggestion) => draft.pick(suggestion)} />
      </div>
      <div className="rounded-xl bg-white p-4 ring-1 ring-ink-200">
        <h3 className="display mb-3 text-2xl">When?</h3>
        <DateRangeCalendar months={1} checkIn={draft.dates.checkIn} checkOut={draft.dates.checkOut} onChange={draft.setDates} />
      </div>
      <div className="rounded-xl bg-white ring-1 ring-ink-200">
        <h3 className="display px-4 pt-4 text-2xl">Who?</h3>
        <GuestsPanel guests={draft.guests} onChange={draft.setGuests} />
      </div>
    </Modal>
  );
}

function Popover({ panel, align, children }: { panel: Panel; align: 'left' | 'center' | 'right'; children: ReactNode }) {
  return (
    <div
      className={clsx(
        'absolute top-[calc(100%+10px)] z-40 animate-pop-in overflow-hidden rounded-xl bg-paper shadow-float ring-1 ring-ink-200',
        align === 'left' && 'left-0',
        align === 'center' && 'left-1/2 -translate-x-1/2',
        align === 'right' && 'right-0',
        panel === 'where' && 'max-h-[440px] w-[420px] overflow-y-auto',
        panel === 'dates' && 'w-[760px] p-7',
        panel === 'guests' && 'w-[360px]',
      )}
    >
      {children}
    </div>
  );
}

function DatesPanel({ draft, onDone }: { draft: Draft; onDone: () => void }) {
  return (
    <>
      <DateRangeCalendar
        checkIn={draft.dates.checkIn}
        checkOut={draft.dates.checkOut}
        onChange={(value) => {
          draft.setDates(value);
          if (value.checkIn && value.checkOut) onDone();
        }}
      />
      <div className="mt-4 flex justify-end">
        <button type="button" className="text-[13px] font-bold underline underline-offset-4" onClick={() => draft.setDates({ checkIn: null, checkOut: null })}>
          Clear dates
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Control strip (the stays page)
// ---------------------------------------------------------------------------

export function SearchBar({ initial, onSearch }: { initial: SearchSubmit; onSearch: (value: SearchSubmit) => void }) {
  const desktop = useMediaQuery('(min-width: 900px)');
  const draft = useSearchDraft(initial, onSearch);
  const [panel, setPanel] = useState<Panel>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const container = useClickOutside<HTMLFormElement>(() => setPanel(null), panel !== null);
  const input = useRef<HTMLInputElement>(null);
  const datesLabel = draft.dates.checkIn && draft.dates.checkOut ? dateRangeLabel(draft.dates.checkIn, draft.dates.checkOut) : null;

  if (!desktop) {
    return (
      <>
        <button type="button" onClick={() => setMobileOpen(true)} className="flex w-full items-center gap-3 rounded-lg border border-ink-300 bg-white px-3.5 py-2 text-left">
          <Search className="size-4 shrink-0 text-pine-700" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold">{draft.text || 'Anywhere in the collection'}</span>
            <span className="block truncate text-xs text-ink-500">{datesLabel ?? 'Any dates'} · {draft.guests ? plural(draft.guests, 'guest') : 'Any guests'}</span>
          </span>
        </button>
        <MobileSearchSheet draft={draft} open={mobileOpen} onClose={() => setMobileOpen(false)} />
      </>
    );
  }

  const cell = (name: Exclude<Panel, null>) =>
    clsx('relative flex h-full min-w-0 flex-col justify-center px-4 text-left transition-colors', panel === name ? 'bg-sand' : 'hover:bg-ink-50');

  return (
    <form
      ref={container}
      onSubmit={(event) => {
        event.preventDefault();
        setPanel(null);
        draft.submit();
      }}
      className="relative flex h-[52px] w-full max-w-[760px] items-stretch rounded-lg border border-ink-300 bg-white"
    >
      <div className={clsx(cell('where'), 'flex-[1.4] cursor-text rounded-l-lg')} onClick={() => { setPanel('where'); input.current?.focus(); }}>
        <span className="eyebrow text-[10px]!">Destination</span>
        <div className="flex items-center gap-1">
          <input
            ref={input}
            value={draft.text}
            onChange={(event) => { draft.setText(event.target.value); setPanel('where'); }}
            onFocus={() => setPanel('where')}
            placeholder="Anywhere in the collection"
            className="w-full min-w-0 bg-transparent text-sm font-semibold text-ink-900 outline-none placeholder:font-medium placeholder:text-ink-400"
          />
          {draft.text && (
            <button type="button" aria-label="Clear destination" onClick={(event) => { event.stopPropagation(); draft.clearWhere(); input.current?.focus(); }} className="shrink-0 text-ink-400 hover:text-ink-900">
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      <span className="w-px bg-ink-200" />
      <button type="button" className={clsx(cell('dates'), 'flex-1')} onClick={() => setPanel('dates')}>
        <span className="eyebrow text-[10px]!">Dates</span>
        <span className={clsx('truncate text-sm', datesLabel ? 'font-semibold text-ink-900' : 'text-ink-400')}>{datesLabel ?? 'Add dates'}</span>
      </button>
      <span className="w-px bg-ink-200" />
      <button type="button" className={clsx(cell('guests'), 'flex-[0.8]')} onClick={() => setPanel('guests')}>
        <span className="eyebrow text-[10px]!">Guests</span>
        <span className={clsx('truncate text-sm', draft.guests ? 'font-semibold text-ink-900' : 'text-ink-400')}>{draft.guests ? plural(draft.guests, 'guest') : 'Add guests'}</span>
      </button>
      <button type="submit" aria-label="Search" className="m-1 flex items-center gap-2 rounded-md bg-pine-700 px-4 text-[13px] font-bold text-paper transition hover:bg-pine-800">
        Search <ArrowRight className="size-4" />
      </button>

      {panel === 'where' && <Popover panel="where" align="left"><WhereSuggestions text={draft.text} onPick={(suggestion) => { draft.pick(suggestion); setPanel('dates'); }} /></Popover>}
      {panel === 'dates' && <Popover panel="dates" align="center"><DatesPanel draft={draft} onDone={() => setPanel('guests')} /></Popover>}
      {panel === 'guests' && <Popover panel="guests" align="right"><GuestsPanel guests={draft.guests} onChange={draft.setGuests} /></Popover>}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Sentence search (homepage hero)
// ---------------------------------------------------------------------------

function Token({ active, filled, onClick, children, icon }: { active: boolean; filled: boolean; onClick: () => void; children: ReactNode; icon: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'group inline-flex items-baseline gap-2 border-b-2 border-dashed px-0.5 transition',
        active ? 'border-pine-700 text-pine-800' : filled ? 'border-brass text-ink-900 hover:border-pine-700' : 'border-ink-300 text-ink-400 hover:border-pine-700 hover:text-ink-700',
      )}
    >
      <span className="hidden translate-y-[-0.1em] self-center text-brass sm:inline">{icon}</span>
      {children}
    </button>
  );
}

export function SentenceSearch({ onSearch }: { onSearch: (value: SearchSubmit) => void }) {
  const desktop = useMediaQuery('(min-width: 900px)');
  const draft = useSearchDraft({ q: '', place: '', bounds: null, checkIn: null, checkOut: null, guests: 0 }, onSearch);
  const [panel, setPanel] = useState<Panel>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const container = useClickOutside<HTMLDivElement>(() => setPanel(null), panel !== null);
  const input = useRef<HTMLInputElement>(null);
  const datesLabel = draft.dates.checkIn && draft.dates.checkOut ? dateRangeLabel(draft.dates.checkIn, draft.dates.checkOut) : null;

  useEffect(() => {
    if (panel === 'where') input.current?.focus();
  }, [panel]);

  const open = (name: Exclude<Panel, null>) => (desktop ? setPanel(panel === name ? null : name) : setMobileOpen(true));

  return (
    <div ref={container} className="relative">
      <p className="display text-[26px] leading-[1.6] font-light text-ink-700 sm:text-[34px]">
        I&apos;d like to stay{' '}
        <Token active={panel === 'where'} filled={Boolean(draft.text)} onClick={() => open('where')} icon={<MapPin className="size-5" />}>
          {draft.text ? `in ${draft.text.split(',')[0]}` : 'anywhere'}
        </Token>
        ,{' '}
        <Token active={panel === 'dates'} filled={Boolean(datesLabel)} onClick={() => open('dates')} icon={<CalendarDays className="size-5" />}>
          {datesLabel ?? 'any time'}
        </Token>
        , for{' '}
        <Token active={panel === 'guests'} filled={draft.guests > 0} onClick={() => open('guests')} icon={<Users className="size-5" />}>
          {draft.guests ? plural(draft.guests, 'guest') : 'any number of guests'}
        </Token>
        .
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <Button variant="brand" size="lg" icon={<Search className="size-4" />} onClick={() => { setPanel(null); draft.submit(); }}>
          Search the collection
        </Button>
        <span className="text-[13px] text-ink-500">Dates and guests are optional.</span>
      </div>

      {panel === 'where' && (
        <Popover panel="where" align="left">
          <div className="border-b border-ink-200 p-3">
            <div className="relative">
              <Search className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-500" />
              <input ref={input} value={draft.text} onChange={(event) => draft.setText(event.target.value)} placeholder="Town, region or address" className="field pl-10" />
            </div>
          </div>
          <WhereSuggestions text={draft.text} onPick={(suggestion) => { draft.pick(suggestion); setPanel('dates'); }} />
        </Popover>
      )}
      {panel === 'dates' && <Popover panel="dates" align="left"><DatesPanel draft={draft} onDone={() => setPanel('guests')} /></Popover>}
      {panel === 'guests' && <Popover panel="guests" align="left"><GuestsPanel guests={draft.guests} onChange={draft.setGuests} /></Popover>}
      <MobileSearchSheet draft={draft} open={mobileOpen} onClose={() => setMobileOpen(false)} />
    </div>
  );
}

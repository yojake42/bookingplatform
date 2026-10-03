import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { format, parseISO } from 'date-fns';
import { ArrowRight, Bath, BedDouble, CalendarX2, ChevronRight, DoorClosed, DoorOpen, KeyRound, Minus, Plus, Quote, Share2, ShieldCheck, Sparkles, Star, Users } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { amenityGroups, amenities as allAmenities } from '../lib/amenities';
import { addMonthsIso, todayIso } from '../lib/calendar';
import { cancellationPolicies, dateRangeLabel, money, plural, rating, time12h, zoneLabel } from '../lib/format';
import { useClickOutside, useDocumentTitle, useMediaQuery } from '../lib/hooks';
import type { Availability, PublicListing, QuoteResponse, ReviewCategoryKey, ReviewsResponse } from '../lib/types';
import { Footer, PublicHeader } from '../components/layout';
import { GalleryModal, HeroGallery } from '../components/Gallery';
import { DateRangeCalendar } from '../components/DateRangeCalendar';
import { isTopRated, placeShort } from '../components/ListingCard';
import { LocationMap } from '../components/maps';
import { Avatar, Button, Modal, Skeleton, Stars } from '../components/ui';

type StayPatch = { checkIn?: string | null; checkOut?: string | null; guests?: number };

export function ListingPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);

  const checkIn = params.get('checkIn');
  const checkOut = params.get('checkOut');
  const guests = Math.max(1, Number(params.get('guests')) || 1);

  const listing = useQuery({ queryKey: ['listing', id], queryFn: () => api<PublicListing>(`/public/listings/${id}`) });
  const availability = useQuery({
    queryKey: ['availability', id],
    queryFn: () => api<Availability>(`/public/listings/${id}/availability`, { query: { from: todayIso(), to: addMonthsIso(todayIso(), 18) } }),
    enabled: listing.isSuccess,
  });
  useDocumentTitle(listing.data?.title);

  const setStay = (patch: StayPatch) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === undefined || value === '') next.delete(key);
      else next.set(key, String(value));
    }
    setParams(next, { replace: true });
  };

  if (listing.isError) {
    return (
      <div className="flex min-h-dvh flex-col">
        <PublicHeader />
        <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center px-6 text-center">
          <CalendarX2 className="size-10 text-ink-400" />
          <h1 className="display mt-4 text-3xl">This home isn't available</h1>
          <p className="mt-2 text-ink-500">It may have left the collection. Let's find you somewhere else to stay.</p>
          <Button className="mt-6" variant="brand" onClick={() => navigate('/stays')}>
            Browse the collection
          </Button>
        </div>
      </div>
    );
  }

  const data = listing.data;
  const openGallery = (index?: number) => {
    setGalleryIndex(index ?? null);
    setGalleryOpen(true);
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader />
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-5 pt-5 pb-28 md:px-10 lg:pb-20">
        {!data ? (
          <ListingSkeleton />
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between gap-4 text-[13px]">
              <nav className="flex min-w-0 items-center gap-1.5 text-ink-500">
                <Link to="/stays" className="font-semibold hover:text-pine-700">The collection</Link>
                <ChevronRight className="size-3.5 shrink-0" />
                <span className="truncate">{placeShort(data)}</span>
              </nav>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard?.writeText(window.location.href).catch(() => undefined);
                  toast.success('Link copied');
                }}
                className="flex shrink-0 items-center gap-1.5 font-bold hover:text-pine-700"
              >
                <Share2 className="size-4" /> Share
              </button>
            </div>

            <HeroGallery media={data.media} onOpen={openGallery}>
              <p className="eyebrow text-paper/75!">
                {data.propertyType} · {placeShort(data)}
              </p>
              <h1 className="display mt-2 max-w-3xl text-[34px] leading-[1.05] sm:text-[56px]">{data.title}</h1>
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[14px] text-paper/85">
                {data.ratingCount > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Star className="size-4 fill-brass-light text-brass-light" /> {rating(data.ratingAverage)} · {plural(data.ratingCount, 'guest note')}
                  </span>
                )}
                <span>{plural(data.maxGuests, 'guest')}</span>
                <span>{plural(data.bedrooms, 'bedroom')}</span>
                <span>{plural(data.beds, 'bed')}</span>
                <span>{data.bathrooms} bath{data.bathrooms === 1 ? '' : 's'}</span>
              </div>
            </HeroGallery>

            <div className="mt-14 grid gap-14 lg:grid-cols-[1fr_400px]">
              <div className="min-w-0 space-y-16">
                <TheHome listing={data} />
                {data.amenities.length > 0 && (
                  <Section index="02" title="In the house">
                    <Amenities keys={data.amenities} />
                  </Section>
                )}
                <Section
                  index="03"
                  title="Availability"
                  aside={checkIn && checkOut ? `${dateRangeLabel(checkIn, checkOut)} · ${plural(nightsOf(checkIn, checkOut), 'night')}` : data.minNights > 1 ? `${data.minNights}-night minimum` : 'Choose your dates'}
                >
                  <ResponsiveCalendar checkIn={checkIn} checkOut={checkOut} availability={availability.data} onChange={(value) => setStay(value)} />
                </Section>
                <Section index="04" title="Guest notes">
                  <Reviews listingId={data.id} average={data.ratingAverage} count={data.ratingCount} />
                </Section>
                {data.location && (
                  <Section index="05" title="The neighborhood" aside={[data.addressLine1, data.city, data.region].filter(Boolean).join(', ')}>
                    <LocationMap location={data.location} className="h-[400px]" />
                    {data.location.precision === 'APPROXIMATE' && (
                      <p className="mt-3 text-[13px] text-ink-500">The shaded area shows roughly where the home is. You'll get the exact address once your booking is confirmed.</p>
                    )}
                    {data.locationDescription && <p className="mt-5 max-w-2xl text-[16px] leading-relaxed whitespace-pre-line text-ink-700">{data.locationDescription}</p>}
                  </Section>
                )}
                {data.host && (
                  <Section index="06" title="Your host">
                    <div className="flex items-center gap-5 rounded-xl border border-ink-200 bg-white p-6">
                      <Avatar name={data.host.name} className="size-16 text-lg" />
                      <div>
                        <p className="display text-2xl">{data.host.name}</p>
                        <p className="text-[14px] text-ink-500">Looking after Haven homes since {format(parseISO(data.host.since), 'MMMM yyyy')}</p>
                      </div>
                    </div>
                  </Section>
                )}
                <Section index={data.host ? '07' : '06'} title="Good to know">
                  <GoodToKnow listing={data} />
                </Section>
              </div>

              <div className="hidden lg:block">
                <div className="sticky top-24">
                  <ReservationTicket listing={data} availability={availability.data} checkIn={checkIn} checkOut={checkOut} guests={guests} onStayChange={setStay} />
                </div>
              </div>
            </div>

            <MobileReserveBar listing={data} availability={availability.data} checkIn={checkIn} checkOut={checkOut} guests={guests} onStayChange={setStay} />
            <GalleryModal media={data.media} open={galleryOpen} startIndex={galleryIndex} onClose={() => setGalleryOpen(false)} title={data.title} />
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}

function nightsOf(checkIn: string, checkOut: string) {
  return Math.round((parseISO(checkOut).getTime() - parseISO(checkIn).getTime()) / 86_400_000);
}

function Section({ index, title, aside, children }: { index: string; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-7 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-ink-200 pb-4">
        <h2 className="flex items-baseline gap-4">
          <span className="display text-[15px] font-light text-brass">{index}</span>
          <span className="display text-[30px] leading-none">{title}</span>
        </h2>
        {aside && <span className="text-[13px] font-semibold text-ink-500">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

function TheHome({ listing }: { listing: PublicListing }) {
  const [expanded, setExpanded] = useState(false);
  const long = listing.description.length > 600;
  const facts = [
    { icon: Users, label: 'Sleeps', value: listing.maxGuests },
    { icon: DoorClosed, label: 'Bedrooms', value: listing.bedrooms },
    { icon: BedDouble, label: 'Beds', value: listing.beds },
    { icon: Bath, label: 'Baths', value: listing.bathrooms },
  ];
  const notes = [
    listing.amenities.includes('self_check_in') && { icon: KeyRound, text: 'Self check-in with a smart lock or keypad' },
    isTopRated(listing) && { icon: Sparkles, text: 'One of the top-rated homes in the collection' },
    { icon: ShieldCheck, text: `${cancellationPolicies[listing.cancellationPolicy].label} cancellation policy` },
  ].filter(Boolean) as { icon: typeof KeyRound; text: string }[];

  return (
    <Section index="01" title="The home">
      {listing.summary && <p className="display text-[26px] leading-snug font-light text-pine-800 italic">“{listing.summary}”</p>}
      <dl className="mt-8 grid grid-cols-2 border-y border-ink-200 sm:grid-cols-4">
        {facts.map((fact, index) => (
          <div key={fact.label} className={clsx('py-5 text-center', index % 2 === 1 && 'border-l border-ink-200', index === 2 && 'sm:border-l sm:border-ink-200')}>
            <fact.icon className="mx-auto size-5 text-brass" />
            <dd className="display mt-2 text-[28px] leading-none">{fact.value}</dd>
            <dt className="eyebrow mt-1.5">{fact.label}</dt>
          </div>
        ))}
      </dl>
      <div className="relative mt-8">
        <p className={clsx('text-[16px] leading-[1.75] whitespace-pre-line text-ink-700', long && !expanded && 'max-h-[11.5em] overflow-hidden')}>{listing.description}</p>
        {long && !expanded && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-paper to-transparent" />}
      </div>
      {long && (
        <button type="button" onClick={() => setExpanded(!expanded)} className="mt-3 flex items-center gap-1.5 text-[13px] font-bold tracking-[0.08em] text-pine-800 uppercase">
          {expanded ? 'Show less' : 'Keep reading'} <ArrowRight className={clsx('size-4 transition', expanded ? '-rotate-90' : 'rotate-90')} />
        </button>
      )}
      <ul className="mt-8 grid gap-3 sm:grid-cols-3">
        {notes.map((note) => (
          <li key={note.text} className="flex items-start gap-3 rounded-lg bg-sand px-4 py-3.5 text-[14px] leading-snug text-ink-700">
            <note.icon className="mt-0.5 size-4 shrink-0 text-pine-700" />
            {note.text}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Amenities({ keys }: { keys: string[] }) {
  const [showAll, setShowAll] = useState(false);
  const known = allAmenities.filter((amenity) => keys.includes(amenity.key));
  const groups = amenityGroups.map((group) => ({ group, items: known.filter((amenity) => amenity.group === group) })).filter((entry) => entry.items.length);
  const visible = showAll ? groups : groups.slice(0, 2);
  return (
    <div>
      <div className="grid gap-x-12 gap-y-8 sm:grid-cols-2">
        {visible.map(({ group, items }) => (
          <div key={group}>
            <h3 className="eyebrow mb-3">{group}</h3>
            <ul className="space-y-2.5">
              {items.map((amenity) => (
                <li key={amenity.key} className="flex items-center gap-3 text-[15px] text-ink-800">
                  <amenity.icon className="size-[18px] text-pine-700" strokeWidth={1.6} />
                  {amenity.label}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {groups.length > 2 && (
        <button type="button" onClick={() => setShowAll(!showAll)} className="mt-8 flex items-center gap-1.5 text-[13px] font-bold tracking-[0.08em] text-pine-800 uppercase">
          {showAll ? 'Show fewer' : `Everything in the house (${known.length})`} <ArrowRight className={clsx('size-4 transition', showAll ? '-rotate-90' : 'rotate-90')} />
        </button>
      )}
    </div>
  );
}

function ResponsiveCalendar({ checkIn, checkOut, availability, onChange }: { checkIn: string | null; checkOut: string | null; availability?: Availability; onChange: (value: { checkIn: string | null; checkOut: string | null }) => void }) {
  const wide = useMediaQuery('(min-width: 768px)');
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-5 sm:p-7">
      <DateRangeCalendar
        months={wide ? 2 : 1}
        checkIn={checkIn}
        checkOut={checkOut}
        onChange={onChange}
        unavailable={availability?.unavailable}
        minNights={availability?.minNights}
        maxNights={availability?.maxNights}
        today={availability?.today}
      />
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-ink-200 pt-4 text-[13px] text-ink-500">
        <span className="flex items-center gap-4">
          <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm bg-pine-700" /> Your stay</span>
          <span className="flex items-center gap-1.5"><span className="font-semibold text-ink-300 line-through">12</span> Taken</span>
        </span>
        {(checkIn || checkOut) && (
          <button type="button" onClick={() => onChange({ checkIn: null, checkOut: null })} className="font-bold text-ink-900 underline underline-offset-4">
            Clear dates
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reservation ticket
// ---------------------------------------------------------------------------

type BookingProps = {
  listing: PublicListing;
  availability?: Availability;
  checkIn: string | null;
  checkOut: string | null;
  guests: number;
  onStayChange: (patch: StayPatch) => void;
};

function useQuote(listingId: string, checkIn: string | null, checkOut: string | null, guests: number) {
  return useQuery({
    queryKey: ['quote', listingId, checkIn, checkOut, guests],
    queryFn: () => api<QuoteResponse>(`/public/listings/${listingId}/quote`, { query: { checkIn, checkOut, guests } }),
    enabled: Boolean(checkIn && checkOut),
    staleTime: 15_000,
  });
}

function GuestStepper({ value, max, onChange }: { value: number; max: number; onChange: (value: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      <button type="button" aria-label="Fewer guests" disabled={value <= 1} onClick={() => onChange(value - 1)} className="flex size-7 items-center justify-center rounded-md border border-ink-300 text-ink-700 transition hover:border-pine-700 disabled:opacity-30">
        <Minus className="size-3.5" />
      </button>
      <span className="w-5 text-center font-bold tabular-nums">{value}</span>
      <button type="button" aria-label="More guests" disabled={value >= max} onClick={() => onChange(value + 1)} className="flex size-7 items-center justify-center rounded-md border border-ink-300 text-ink-700 transition hover:border-pine-700 disabled:opacity-30">
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

function ReservationTicket({ listing, availability, checkIn, checkOut, guests, onStayChange }: BookingProps) {
  const navigate = useNavigate();
  const [picking, setPicking] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setPicking(false), picking);
  const quote = useQuote(listing.id, checkIn, checkOut, guests);
  const ready = Boolean(checkIn && checkOut && quote.data?.available);

  const proceed = () => {
    if (!checkIn || !checkOut) {
      setPicking(true);
      return;
    }
    navigate(`/book/${listing.id}?checkIn=${checkIn}&checkOut=${checkOut}&guests=${guests}`);
  };

  return (
    <div ref={ref} className="relative rounded-xl border border-ink-300 bg-white shadow-card">
      <div className="px-7 pt-6 pb-5">
        <div className="flex items-center justify-between">
          <span className="eyebrow">Reservation</span>
          {listing.ratingCount > 0 && (
            <span className="flex items-center gap-1 text-[13px] font-semibold">
              <Star className="size-3.5 fill-brass text-brass" /> {rating(listing.ratingAverage)}
            </span>
          )}
        </div>
        <p className="mt-2 text-ink-600">
          <span className="display text-[34px] text-ink-900">{money(listing.nightlyPrice, listing.currency)}</span> / night
        </p>

        <button type="button" onClick={() => setPicking(!picking)} className="mt-5 grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-lg border border-ink-300 p-3 text-left transition hover:border-pine-700">
          <span>
            <span className="eyebrow block text-[10px]!">Arrive</span>
            <span className={clsx('mt-0.5 block text-[15px] font-semibold', !checkIn && 'text-ink-400')}>{checkIn ? format(parseISO(checkIn), 'EEE, MMM d') : 'Add date'}</span>
          </span>
          <ArrowRight className="size-4 text-brass" />
          <span>
            <span className="eyebrow block text-[10px]!">Depart</span>
            <span className={clsx('mt-0.5 block text-[15px] font-semibold', !checkOut && 'text-ink-400')}>{checkOut ? format(parseISO(checkOut), 'EEE, MMM d') : 'Add date'}</span>
          </span>
        </button>
        <div className="mt-3 flex items-center justify-between rounded-lg border border-ink-300 px-3 py-2.5">
          <span>
            <span className="eyebrow block text-[10px]!">Guests</span>
            <span className="text-[13px] text-ink-500">Up to {listing.maxGuests}</span>
          </span>
          <GuestStepper value={guests} max={listing.maxGuests} onChange={(value) => onStayChange({ guests: value })} />
        </div>
      </div>

      <div className="ticket-tear mx-7" />

      <div className="px-7 pt-5 pb-6">
        {ready && quote.data?.quote ? (
          <div className="animate-fade-in">
            <PriceBreakdown quote={quote.data.quote} />
          </div>
        ) : (
          <p className="text-[14px] text-ink-500">
            {quote.data && !quote.data.available ? <span className="font-semibold text-danger-700">{quote.data.reason}</span> : 'Choose dates to see the full price, cleaning included.'}
          </p>
        )}
        <Button variant="brand" size="lg" className="mt-5 w-full" disabled={Boolean(checkIn && checkOut && quote.data && !quote.data.available)} loading={quote.isFetching && !quote.data} onClick={proceed}>
          {checkIn && checkOut ? 'Book these dates' : 'Choose your dates'}
          <ArrowRight className="size-4" />
        </Button>
        <p className="mt-3 text-center text-[12px] text-ink-500">You'll review everything before you pay.</p>
      </div>

      {picking && (
        <div className="absolute top-0 right-[calc(100%+16px)] z-30 w-[720px] animate-pop-in rounded-xl bg-paper p-7 shadow-float ring-1 ring-ink-200">
          <DateRangeCalendar
            checkIn={checkIn}
            checkOut={checkOut}
            unavailable={availability?.unavailable}
            minNights={availability?.minNights}
            maxNights={availability?.maxNights}
            today={availability?.today}
            onChange={(value) => {
              onStayChange(value);
              if (value.checkIn && value.checkOut) setPicking(false);
            }}
          />
          <div className="mt-4 flex justify-end gap-3">
            <Button variant="ghost" size="sm" onClick={() => onStayChange({ checkIn: null, checkOut: null })}>Clear dates</Button>
            <Button size="sm" onClick={() => setPicking(false)}>Done</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function PriceBreakdown({ quote }: { quote: NonNullable<QuoteResponse['quote']> }) {
  return (
    <dl className="space-y-2.5 text-[14px]">
      <div className="flex justify-between text-ink-600">
        <dt>{money(quote.nightlyPrice, quote.currency)} × {plural(quote.nights, 'night')}</dt>
        <dd className="tabular-nums">{money(quote.nightsTotal, quote.currency)}</dd>
      </div>
      {quote.cleaningFee > 0 && (
        <div className="flex justify-between text-ink-600">
          <dt>Cleaning</dt>
          <dd className="tabular-nums">{money(quote.cleaningFee, quote.currency)}</dd>
        </div>
      )}
      <div className="flex items-baseline justify-between border-t border-ink-200 pt-3">
        <dt className="font-bold">Total</dt>
        <dd className="display text-2xl tabular-nums">{money(quote.total, quote.currency)}</dd>
      </div>
      <p className="text-[12px] text-ink-500">No booking or service fees.</p>
    </dl>
  );
}

function MobileReserveBar({ listing, availability, checkIn, checkOut, guests, onStayChange }: BookingProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const quote = useQuote(listing.id, checkIn, checkOut, guests);
  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-4 border-t border-ink-200 bg-paper px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))] lg:hidden">
        <div>
          <div>
            <span className="display text-xl">{money(quote.data?.quote?.total ?? listing.nightlyPrice, listing.currency)}</span>
            <span className="text-[13px] text-ink-600">{quote.data?.quote ? ' total' : ' / night'}</span>
          </div>
          <button type="button" className="text-[13px] font-bold underline underline-offset-2" onClick={() => setOpen(true)}>
            {checkIn && checkOut ? dateRangeLabel(checkIn, checkOut) : 'Choose dates'}
          </button>
        </div>
        <Button
          variant="brand"
          size="lg"
          disabled={Boolean(quote.data && !quote.data.available)}
          onClick={() => (checkIn && checkOut ? navigate(`/book/${listing.id}?checkIn=${checkIn}&checkOut=${checkOut}&guests=${guests}`) : setOpen(true))}
        >
          {checkIn && checkOut ? 'Book these dates' : 'Choose dates'}
        </Button>
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Your dates"
        size="md"
        footer={
          <div className="flex items-center justify-between">
            <button type="button" className="text-sm font-bold underline" onClick={() => onStayChange({ checkIn: null, checkOut: null })}>
              Clear dates
            </button>
            <Button variant="brand" onClick={() => setOpen(false)}>Save</Button>
          </div>
        }
      >
        <DateRangeCalendar
          months={1}
          checkIn={checkIn}
          checkOut={checkOut}
          unavailable={availability?.unavailable}
          minNights={availability?.minNights}
          maxNights={availability?.maxNights}
          today={availability?.today}
          onChange={onStayChange}
        />
        <div className="mt-5 flex items-center justify-between border-t border-ink-200 pt-4">
          <span className="font-semibold">Guests</span>
          <GuestStepper value={guests} max={listing.maxGuests} onChange={(value) => onStayChange({ guests: value })} />
        </div>
        {quote.data && !quote.data.available && <p className="mt-3 text-sm font-medium text-danger-700">{quote.data.reason}</p>}
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Guest notes (reviews)
// ---------------------------------------------------------------------------

const categoryLabels: Record<ReviewCategoryKey, string> = {
  cleanliness: 'Cleanliness',
  accuracy: 'As described',
  checkIn: 'Arrival',
  communication: 'Communication',
  location: 'Location',
  value: 'Value',
};

function Reviews({ listingId, average, count }: { listingId: string; average: number | null; count: number }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const firstPage = useQuery({ queryKey: ['reviews', listingId, 1], queryFn: () => api<ReviewsResponse>(`/public/listings/${listingId}/reviews`) });
  const modalPage = useQuery({
    queryKey: ['reviews', listingId, page],
    queryFn: () => api<ReviewsResponse>(`/public/listings/${listingId}/reviews`, { query: { page } }),
    enabled: open,
  });

  if (!count) {
    return <p className="text-[15px] text-ink-500">No guest notes yet. Guests can share theirs after their stay.</p>;
  }

  const summary = firstPage.data?.summary;
  const [lead, ...others] = firstPage.data?.items ?? [];
  return (
    <div id="reviews" className="scroll-mt-28">
      <div className="grid gap-10 md:grid-cols-[220px_1fr]">
        <div>
          <p className="display text-[72px] leading-none text-pine-800">{rating(average)}</p>
          <div className="mt-2"><Stars value={average ?? 0} /></div>
          <p className="mt-2 text-[13px] text-ink-500">from {plural(count, 'verified stay')}</p>
          {summary && (
            <dl className="mt-6 space-y-2">
              {(Object.keys(categoryLabels) as ReviewCategoryKey[]).map((key) => (
                <div key={key} className="flex items-center justify-between gap-3 text-[13px]">
                  <dt className="text-ink-600">{categoryLabels[key]}</dt>
                  <dd className="flex items-center gap-2 font-bold tabular-nums">
                    <span className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((dot) => (
                        <span key={dot} className={clsx('size-1.5 rounded-full', dot <= Math.round(summary.categories[key] ?? 0) ? 'bg-brass' : 'bg-ink-200')} />
                      ))}
                    </span>
                    {summary.categories[key]?.toFixed(1) ?? '—'}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        <div>
          {lead && (
            <figure className="relative rounded-xl bg-pine-800 p-8 text-paper">
              <Quote className="absolute top-6 right-6 size-10 text-paper/15" />
              <blockquote className="display text-[22px] leading-snug font-light">“{lead.comment}”</blockquote>
              <figcaption className="mt-5 flex items-center gap-3 text-[13px] text-paper/70">
                <Avatar name={lead.authorName} className="size-8 text-[11px]" />
                <span><b className="text-paper">{lead.authorName}</b> · stayed {format(parseISO(lead.stayedAt ?? lead.createdAt), 'MMMM yyyy')}</span>
              </figcaption>
            </figure>
          )}
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            {others.slice(0, 4).map((review) => <ReviewItem key={review.id} review={review} clamp />)}
          </div>
          {count > 5 && (
            <Button variant="secondary" className="mt-8" onClick={() => setOpen(true)}>
              Read all {count} guest notes
            </Button>
          )}
        </div>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title={plural(count, 'guest note')} size="lg">
        <div className="space-y-8">
          {modalPage.data?.items.map((review) => <ReviewItem key={review.id} review={review} />)}
          {modalPage.isPending && <Skeleton className="h-32" />}
        </div>
        {modalPage.data && modalPage.data.total > modalPage.data.pageSize && (
          <div className="mt-8 flex items-center justify-between">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <span className="text-sm text-ink-500">Page {page} of {Math.ceil(modalPage.data.total / modalPage.data.pageSize)}</span>
            <Button variant="secondary" size="sm" disabled={page * modalPage.data.pageSize >= modalPage.data.total} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}

function ReviewItem({ review, clamp }: { review: ReviewsResponse['items'][number]; clamp?: boolean }) {
  return (
    <figure className="border-l-2 border-brass-light pl-5">
      <Stars value={review.rating} size="size-3" />
      <blockquote className={clsx('mt-2 text-[15px] leading-relaxed text-ink-700', clamp && 'line-clamp-4')}>{review.comment}</blockquote>
      <figcaption className="mt-3 text-[13px] text-ink-500">
        <b className="text-ink-800">{review.authorName}</b> · {format(parseISO(review.stayedAt ?? review.createdAt), 'MMMM yyyy')}
      </figcaption>
    </figure>
  );
}

function GoodToKnow({ listing }: { listing: PublicListing }) {
  const rules = listing.houseRules.split('\n').map((rule) => rule.trim()).filter(Boolean);
  return (
    <div className="grid gap-px overflow-hidden rounded-xl border border-ink-200 bg-ink-200 md:grid-cols-3">
      <div className="bg-white p-6">
        <h3 className="eyebrow">Timing</h3>
        <ul className="mt-4 space-y-3 text-[15px] text-ink-700">
          <li className="flex items-center gap-2.5"><DoorOpen className="size-4 text-pine-700" /> Arrive after {time12h(listing.checkInTime)}</li>
          <li className="flex items-center gap-2.5"><DoorClosed className="size-4 text-pine-700" /> Leave by {time12h(listing.checkOutTime)}</li>
        </ul>
        <p className="mt-4 text-[13px] text-ink-500">Local time at the home: {zoneLabel(listing.timeZone)}.</p>
      </div>
      <div className="bg-white p-6">
        <h3 className="eyebrow">House rules</h3>
        <ul className="mt-4 space-y-2 text-[15px] text-ink-700">
          <li>Up to {plural(listing.maxGuests, 'guest')}</li>
          {rules.map((rule) => <li key={rule}>{rule}</li>)}
        </ul>
      </div>
      <div className="bg-white p-6">
        <h3 className="eyebrow">If plans change</h3>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-700">{cancellationPolicies[listing.cancellationPolicy].description}</p>
        <p className="mt-3 text-[13px] text-ink-500">
          {listing.minNights > 1 ? `${listing.minNights}-night minimum` : 'No minimum stay'}
          {listing.maxNights < 365 ? `, up to ${listing.maxNights} nights.` : '.'}
        </p>
        <Link to="/trips" className="mt-3 inline-block text-[13px] font-bold underline underline-offset-4">Manage an existing booking</Link>
      </div>
    </div>
  );
}

function ListingSkeleton() {
  return (
    <div>
      <Skeleton className="aspect-[21/9] rounded-2xl" />
      <div className="mt-14 grid gap-14 lg:grid-cols-[1fr_400px]">
        <div className="space-y-4">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="mt-8 h-40" />
        </div>
        <Skeleton className="hidden h-96 rounded-xl lg:block" />
      </div>
    </div>
  );
}

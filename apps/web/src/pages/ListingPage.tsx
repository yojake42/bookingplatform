import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { format, parseISO } from 'date-fns';
import { Award, CalendarX2, ChevronDown, Clock, DoorOpen, KeyRound, Share, ShieldCheck, Star } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { amenityGroups, amenities as allAmenities } from '../lib/amenities';
import { addMonthsIso, todayIso } from '../lib/calendar';
import { bathsLabel, cancellationPolicies, dateRangeLabel, money, plural, rating, time12h, zoneLabel } from '../lib/format';
import { useClickOutside, useDocumentTitle, useMediaQuery } from '../lib/hooks';
import type { Availability, PublicListing, QuoteResponse, ReviewCategoryKey, ReviewsResponse } from '../lib/types';
import { CompactSearchPill } from '../components/SearchBar';
import { Footer, PublicHeader } from '../components/layout';
import { GalleryGrid, GalleryModal } from '../components/Gallery';
import { DateRangeCalendar } from '../components/DateRangeCalendar';
import { LocationMap } from '../components/maps';
import { Avatar, Button, Counter, Modal, Skeleton, Stars } from '../components/ui';

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

  const setStay = (patch: { checkIn?: string | null; checkOut?: string | null; guests?: number }) => {
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
        <PublicHeader center={<CompactSearchPill onClick={() => navigate('/')} />} />
        <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center px-6 text-center">
          <CalendarX2 className="size-10 text-ink-400" />
          <h1 className="mt-4 text-2xl font-bold">This home isn't available</h1>
          <p className="mt-2 text-ink-500">It may have been unpublished. Let's find you somewhere else to stay.</p>
          <Button className="mt-6" onClick={() => navigate('/')}>
            Explore homes
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
      <PublicHeader center={<div className="hidden md:block"><CompactSearchPill onClick={() => navigate('/')} /></div>} />
      <main className="mx-auto w-full max-w-[1180px] flex-1 px-5 pt-6 pb-28 md:px-10 lg:pb-16">
        {!data ? (
          <ListingSkeleton />
        ) : (
          <>
            <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <h1 className="text-2xl font-bold tracking-tight md:text-[28px]">{data.title}</h1>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard?.writeText(window.location.href).catch(() => undefined);
                  toast.success('Link copied');
                }}
                className="flex w-fit items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold underline underline-offset-4 hover:bg-ink-100"
              >
                <Share className="size-4" /> Share
              </button>
            </div>

            <GalleryGrid media={data.media} onOpen={openGallery} />

            <div className="mt-10 grid gap-16 lg:grid-cols-[1fr_380px]">
              <div className="min-w-0">
                <Overview listing={data} />
                <Section>
                  <Description text={data.description} />
                </Section>
                {data.amenities.length > 0 && (
                  <Section>
                    <Amenities keys={data.amenities} />
                  </Section>
                )}
                <Section>
                  <h2 className="text-[22px] font-semibold">
                    {checkIn && checkOut ? `${plural(nightsOf(checkIn, checkOut), 'night')} in ${data.city || 'this home'}` : 'Select check-in date'}
                  </h2>
                  <p className="mt-1 text-sm text-ink-500">
                    {checkIn && checkOut ? dateRangeLabel(checkIn, checkOut) : data.minNights > 1 ? `Minimum stay: ${data.minNights} nights` : 'Add your travel dates for exact pricing'}
                  </p>
                  <div className="mt-6">
                    <ResponsiveCalendar
                      checkIn={checkIn}
                      checkOut={checkOut}
                      availability={availability.data}
                      onChange={(value) => setStay(value)}
                    />
                  </div>
                </Section>
              </div>

              <div className="hidden lg:block">
                <div className="sticky top-28">
                  <BookingCard listing={data} availability={availability.data} checkIn={checkIn} checkOut={checkOut} guests={guests} onStayChange={setStay} />
                </div>
              </div>
            </div>

            <Section>
              <Reviews listingId={data.id} average={data.ratingAverage} count={data.ratingCount} />
            </Section>

            {data.location && (
              <Section>
                <h2 className="text-[22px] font-semibold">Where you'll be</h2>
                <p className="mt-2 text-[15px] text-ink-700">{[data.addressLine1, data.city, data.region, data.country].filter(Boolean).join(', ')}</p>
                <LocationMap location={data.location} className="mt-6 h-[420px]" />
                {data.location.precision === 'APPROXIMATE' && <p className="mt-3 text-sm text-ink-500">Exact location is provided after booking.</p>}
                {data.locationDescription && <p className="mt-4 max-w-2xl text-[15px] leading-relaxed whitespace-pre-line text-ink-700">{data.locationDescription}</p>}
              </Section>
            )}

            {data.host && (
              <Section>
                <div className="flex items-center gap-4">
                  <Avatar name={data.host.name} className="size-16 text-lg" />
                  <div>
                    <h2 className="text-[22px] font-semibold">Hosted by {data.host.name}</h2>
                    <p className="text-sm text-ink-500">Hosting since {format(parseISO(data.host.since), 'MMMM yyyy')}</p>
                  </div>
                </div>
              </Section>
            )}

            <Section>
              <ThingsToKnow listing={data} />
            </Section>

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

function Section({ children }: { children: React.ReactNode }) {
  return <section className="border-t border-ink-200/80 py-10 first:border-t-0">{children}</section>;
}

function Overview({ listing }: { listing: PublicListing }) {
  const highlights = [
    listing.amenities.includes('self_check_in') && { icon: KeyRound, title: 'Self check-in', text: 'Check yourself in with the smart lock or keypad.' },
    (listing.ratingAverage ?? 0) >= 4.8 && listing.ratingCount >= 3 && { icon: Award, title: 'Guest favorite', text: 'One of the most loved homes, according to guests.' },
    { icon: DoorOpen, title: `Check in after ${time12h(listing.checkInTime)}`, text: `Check out by ${time12h(listing.checkOutTime)}.` },
    { icon: ShieldCheck, title: `${cancellationPolicies[listing.cancellationPolicy].label} cancellation`, text: cancellationPolicies[listing.cancellationPolicy].description },
  ].filter(Boolean) as { icon: typeof KeyRound; title: string; text: string }[];

  return (
    <div className="pb-10">
      <h2 className="text-[22px] font-semibold">
        Entire {listing.propertyType.toLowerCase()} in {[listing.city, listing.region].filter(Boolean).join(', ')}
      </h2>
      <p className="mt-1 text-[15px] text-ink-700">
        {plural(listing.maxGuests, 'guest')} · {plural(listing.bedrooms, 'bedroom')} · {plural(listing.beds, 'bed')} · {bathsLabel(listing.bathrooms)}
      </p>
      {listing.ratingCount > 0 && (
        <a href="#reviews" className="mt-2 inline-flex items-center gap-1.5 text-[15px] font-semibold">
          <Star className="size-4 fill-ink-900" /> {rating(listing.ratingAverage)} · <span className="underline underline-offset-4">{plural(listing.ratingCount, 'review')}</span>
        </a>
      )}
      <div className="mt-8 space-y-6 border-t border-ink-200/80 pt-8">
        {highlights.map((highlight) => (
          <div key={highlight.title} className="flex gap-5">
            <highlight.icon className="mt-0.5 size-6 shrink-0 stroke-[1.5]" />
            <div>
              <div className="font-semibold">{highlight.title}</div>
              <div className="text-[15px] text-ink-500">{highlight.text}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Description({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 420;
  return (
    <div>
      <p className="text-[16px] leading-relaxed whitespace-pre-line text-ink-800">{long ? `${text.slice(0, 420).trimEnd()}…` : text}</p>
      {long && (
        <button type="button" onClick={() => setOpen(true)} className="mt-4 flex items-center gap-1 font-semibold underline underline-offset-4">
          Show more <ChevronDown className="size-4 -rotate-90" />
        </button>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="About this space" size="lg">
        <p className="text-[16px] leading-relaxed whitespace-pre-line text-ink-800">{text}</p>
      </Modal>
    </div>
  );
}

function Amenities({ keys }: { keys: string[] }) {
  const [open, setOpen] = useState(false);
  const known = allAmenities.filter((amenity) => keys.includes(amenity.key));
  return (
    <div>
      <h2 className="text-[22px] font-semibold">What this place offers</h2>
      <div className="mt-6 grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {known.slice(0, 10).map((amenity) => (
          <div key={amenity.key} className="flex items-center gap-4 text-[16px]">
            <amenity.icon className="size-6 stroke-[1.5]" />
            {amenity.label}
          </div>
        ))}
      </div>
      {known.length > 10 && (
        <Button variant="secondary" size="lg" className="mt-8" onClick={() => setOpen(true)}>
          Show all {known.length} amenities
        </Button>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="What this place offers" size="md">
        {amenityGroups.map((group) => {
          const items = known.filter((amenity) => amenity.group === group);
          if (!items.length) return null;
          return (
            <div key={group} className="mb-8 last:mb-0">
              <h3 className="mb-2 text-lg font-semibold">{group}</h3>
              <div className="divide-y divide-ink-100">
                {items.map((amenity) => (
                  <div key={amenity.key} className="flex items-center gap-4 py-4">
                    <amenity.icon className="size-6 stroke-[1.5]" /> {amenity.label}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </Modal>
    </div>
  );
}

function ResponsiveCalendar({ checkIn, checkOut, availability, onChange }: { checkIn: string | null; checkOut: string | null; availability?: Availability; onChange: (value: { checkIn: string | null; checkOut: string | null }) => void }) {
  const wide = useMediaQuery('(min-width: 768px)');
  return (
    <>
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
      {(checkIn || checkOut) && (
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={() => onChange({ checkIn: null, checkOut: null })} className="text-sm font-semibold underline underline-offset-4">
            Clear dates
          </button>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Booking card
// ---------------------------------------------------------------------------

type BookingProps = {
  listing: PublicListing;
  availability?: Availability;
  checkIn: string | null;
  checkOut: string | null;
  guests: number;
  onStayChange: (patch: { checkIn?: string | null; checkOut?: string | null; guests?: number }) => void;
};

function useQuote(listingId: string, checkIn: string | null, checkOut: string | null, guests: number) {
  return useQuery({
    queryKey: ['quote', listingId, checkIn, checkOut, guests],
    queryFn: () => api<QuoteResponse>(`/public/listings/${listingId}/quote`, { query: { checkIn, checkOut, guests } }),
    enabled: Boolean(checkIn && checkOut),
    staleTime: 15_000,
  });
}

function BookingCard({ listing, availability, checkIn, checkOut, guests, onStayChange }: BookingProps) {
  const navigate = useNavigate();
  const [panel, setPanel] = useState<'dates' | 'guests' | null>(null);
  const ref = useClickOutside<HTMLDivElement>(() => setPanel(null), panel !== null);
  const quote = useQuote(listing.id, checkIn, checkOut, guests);
  const ready = Boolean(checkIn && checkOut && quote.data?.available);

  const reserve = () => {
    if (!checkIn || !checkOut) {
      setPanel('dates');
      return;
    }
    navigate(`/book/${listing.id}?checkIn=${checkIn}&checkOut=${checkOut}&guests=${guests}`);
  };

  return (
    <div ref={ref} className="relative rounded-3xl bg-white p-6 shadow-[0_6px_24px_rgb(0_0_0/0.12)] ring-1 ring-ink-200/70">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <span className="text-[22px] font-semibold">{money(listing.nightlyPrice, listing.currency)}</span>
          <span className="text-ink-600"> night</span>
        </div>
        {listing.ratingCount > 0 && (
          <span className="flex items-center gap-1 text-sm">
            <Star className="size-3.5 fill-ink-900" /> <b>{rating(listing.ratingAverage)}</b>
            <span className="text-ink-500">· {plural(listing.ratingCount, 'review')}</span>
          </span>
        )}
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl ring-1 ring-ink-300">
        <button type="button" onClick={() => setPanel(panel === 'dates' ? null : 'dates')} className="grid w-full grid-cols-2 text-left">
          <span className="border-r border-ink-300 px-4 py-2.5">
            <span className="block text-[10px] font-bold tracking-wide uppercase">Check-in</span>
            <span className={clsx('text-sm', !checkIn && 'text-ink-500')}>{checkIn ? format(parseISO(checkIn), 'M/d/yyyy') : 'Add date'}</span>
          </span>
          <span className="px-4 py-2.5">
            <span className="block text-[10px] font-bold tracking-wide uppercase">Checkout</span>
            <span className={clsx('text-sm', !checkOut && 'text-ink-500')}>{checkOut ? format(parseISO(checkOut), 'M/d/yyyy') : 'Add date'}</span>
          </span>
        </button>
        <button type="button" onClick={() => setPanel(panel === 'guests' ? null : 'guests')} className="flex w-full items-center justify-between border-t border-ink-300 px-4 py-2.5 text-left">
          <span>
            <span className="block text-[10px] font-bold tracking-wide uppercase">Guests</span>
            <span className="text-sm">{plural(guests, 'guest')}</span>
          </span>
          <ChevronDown className={clsx('size-5 transition', panel === 'guests' && 'rotate-180')} />
        </button>
      </div>

      {panel === 'dates' && (
        <div className="absolute top-20 right-0 z-30 w-[720px] animate-pop-in rounded-3xl bg-white p-8 shadow-float ring-1 ring-black/5">
          <DateRangeCalendar
            checkIn={checkIn}
            checkOut={checkOut}
            unavailable={availability?.unavailable}
            minNights={availability?.minNights}
            maxNights={availability?.maxNights}
        today={availability?.today}
            onChange={(value) => {
              onStayChange(value);
              if (value.checkIn && value.checkOut) setPanel(null);
            }}
          />
          <div className="mt-4 flex justify-end gap-3">
            <Button variant="ghost" size="sm" onClick={() => onStayChange({ checkIn: null, checkOut: null })}>
              Clear dates
            </Button>
            <Button size="sm" onClick={() => setPanel(null)}>
              Close
            </Button>
          </div>
        </div>
      )}
      {panel === 'guests' && (
        <div className="absolute inset-x-6 top-[184px] z-30 animate-pop-in rounded-2xl bg-white px-5 py-2 shadow-float ring-1 ring-black/5">
          <Counter label="Guests" description={`This home allows up to ${listing.maxGuests}`} value={guests} min={1} max={listing.maxGuests} onChange={(value) => onStayChange({ guests: value })} />
        </div>
      )}

      <Button variant="brand" size="lg" className="mt-4 w-full" disabled={Boolean(checkIn && checkOut && quote.data && !quote.data.available)} loading={quote.isFetching && !quote.data} onClick={reserve}>
        {checkIn && checkOut ? 'Reserve' : 'Check availability'}
      </Button>

      {quote.data && !quote.data.available && <p className="mt-3 text-center text-sm font-medium text-brand-700">{quote.data.reason}</p>}
      {ready && quote.data?.quote && (
        <div className="animate-fade-in">
          <p className="mt-3 text-center text-sm text-ink-500">You won't be charged yet</p>
          <PriceBreakdown quote={quote.data.quote} />
        </div>
      )}
    </div>
  );
}

export function PriceBreakdown({ quote }: { quote: NonNullable<QuoteResponse['quote']> }) {
  return (
    <div className="mt-5 space-y-3 text-[15px]">
      <div className="flex justify-between text-ink-700">
        <span className="underline decoration-ink-300 underline-offset-4">
          {money(quote.nightlyPrice, quote.currency)} × {plural(quote.nights, 'night')}
        </span>
        <span>{money(quote.nightsTotal, quote.currency)}</span>
      </div>
      {quote.cleaningFee > 0 && (
        <div className="flex justify-between text-ink-700">
          <span className="underline decoration-ink-300 underline-offset-4">Cleaning fee</span>
          <span>{money(quote.cleaningFee, quote.currency)}</span>
        </div>
      )}
      <div className="flex justify-between border-t border-ink-200 pt-4 font-semibold">
        <span>Total</span>
        <span>{money(quote.total, quote.currency)}</span>
      </div>
    </div>
  );
}

function MobileReserveBar({ listing, availability, checkIn, checkOut, guests, onStayChange }: BookingProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const quote = useQuote(listing.id, checkIn, checkOut, guests);
  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-4 border-t border-ink-200 bg-white px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))] lg:hidden">
        <div>
          <div>
            <span className="font-semibold">{money(quote.data?.quote?.total ?? listing.nightlyPrice, listing.currency)}</span>
            <span className="text-ink-600">{quote.data?.quote ? ' total' : ' night'}</span>
          </div>
          <button type="button" className="text-sm font-semibold underline underline-offset-2" onClick={() => setOpen(true)}>
            {checkIn && checkOut ? dateRangeLabel(checkIn, checkOut) : 'Add dates'}
          </button>
        </div>
        <Button
          variant="brand"
          size="lg"
          disabled={Boolean(quote.data && !quote.data.available)}
          onClick={() => (checkIn && checkOut ? navigate(`/book/${listing.id}?checkIn=${checkIn}&checkOut=${checkOut}&guests=${guests}`) : setOpen(true))}
        >
          {checkIn && checkOut ? 'Reserve' : 'Check availability'}
        </Button>
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Select dates"
        size="md"
        footer={
          <div className="flex items-center justify-between">
            <button type="button" className="font-semibold underline" onClick={() => onStayChange({ checkIn: null, checkOut: null })}>
              Clear dates
            </button>
            <Button onClick={() => setOpen(false)}>Save</Button>
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
        <div className="mt-4 border-t border-ink-100">
          <Counter label="Guests" value={guests} min={1} max={listing.maxGuests} onChange={(value) => onStayChange({ guests: value })} />
        </div>
        {quote.data && !quote.data.available && <p className="mt-2 text-sm font-medium text-brand-700">{quote.data.reason}</p>}
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

const categoryLabels: Record<ReviewCategoryKey, string> = {
  cleanliness: 'Cleanliness',
  accuracy: 'Accuracy',
  checkIn: 'Check-in',
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
    return (
      <div id="reviews">
        <h2 className="flex items-center gap-2 text-[22px] font-semibold">
          <Star className="size-5 fill-ink-900" /> No reviews yet
        </h2>
        <p className="mt-2 text-ink-500">Guests can leave a review after their stay.</p>
      </div>
    );
  }

  const summary = firstPage.data?.summary;
  return (
    <div id="reviews" className="scroll-mt-28">
      <h2 className="flex items-center gap-2 text-[22px] font-semibold">
        <Star className="size-5 fill-ink-900" /> {rating(average)} · {plural(count, 'review')}
      </h2>
      {summary && (
        <div className="mt-6 grid grid-cols-2 gap-x-10 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
          {(Object.keys(categoryLabels) as ReviewCategoryKey[]).map((key) => (
            <div key={key} className="lg:border-r lg:border-ink-200 lg:pr-4 lg:last:border-r-0">
              <div className="text-sm font-semibold">{categoryLabels[key]}</div>
              <div className="text-lg font-semibold">{summary.categories[key]?.toFixed(1) ?? '—'}</div>
              <div className="mt-1 h-1 rounded-full bg-ink-200">
                <div className="h-1 rounded-full bg-ink-900" style={{ width: `${((summary.categories[key] ?? 0) / 5) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-10 grid gap-x-16 gap-y-10 md:grid-cols-2">
        {firstPage.data?.items.slice(0, 6).map((review) => <ReviewItem key={review.id} review={review} clamp />)}
      </div>
      {count > 6 && (
        <Button variant="secondary" size="lg" className="mt-10" onClick={() => setOpen(true)}>
          Show all {count} reviews
        </Button>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={`${plural(count, 'review')}`} size="lg">
        <div className="space-y-8">
          {modalPage.data?.items.map((review) => <ReviewItem key={review.id} review={review} />)}
          {modalPage.isPending && <Skeleton className="h-32" />}
        </div>
        {modalPage.data && modalPage.data.total > modalPage.data.pageSize && (
          <div className="mt-8 flex items-center justify-between">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <span className="text-sm text-ink-500">
              Page {page} of {Math.ceil(modalPage.data.total / modalPage.data.pageSize)}
            </span>
            <Button variant="secondary" size="sm" disabled={page * modalPage.data.pageSize >= modalPage.data.total} onClick={() => setPage(page + 1)}>
              Next
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}

function ReviewItem({ review, clamp }: { review: ReviewsResponse['items'][number]; clamp?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <Avatar name={review.authorName} className="size-11 text-sm" />
        <div>
          <div className="font-semibold">{review.authorName}</div>
          <div className="text-sm text-ink-500">{review.stayedAt ? `Stayed ${format(parseISO(review.stayedAt), 'MMMM yyyy')}` : format(parseISO(review.createdAt), 'MMMM yyyy')}</div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Stars value={review.rating} size="size-3" />
      </div>
      <p className={clsx('mt-2 text-[15px] leading-relaxed text-ink-800', clamp && 'line-clamp-4')}>{review.comment}</p>
    </div>
  );
}

function ThingsToKnow({ listing }: { listing: PublicListing }) {
  const rules = listing.houseRules.split('\n').map((rule) => rule.trim()).filter(Boolean);
  return (
    <div>
      <h2 className="text-[22px] font-semibold">Things to know</h2>
      <div className="mt-6 grid gap-10 md:grid-cols-3">
        <div>
          <h3 className="font-semibold">House rules</h3>
          <ul className="mt-3 space-y-3 text-[15px] text-ink-700">
            <li className="flex gap-2"><Clock className="size-4 shrink-0 translate-y-0.5" />Check-in after {time12h(listing.checkInTime)}</li>
            <li className="flex gap-2"><Clock className="size-4 shrink-0 translate-y-0.5" />Checkout before {time12h(listing.checkOutTime)}</li>
            <li>{plural(listing.maxGuests, 'guest')} maximum</li>
            {rules.map((rule) => <li key={rule}>{rule}</li>)}
          </ul>
          <p className="mt-4 text-sm text-ink-500">Times are local to the home: {zoneLabel(listing.timeZone)}.</p>
        </div>
        <div>
          <h3 className="font-semibold">Cancellation policy</h3>
          <p className="mt-3 text-[15px] text-ink-700">{cancellationPolicies[listing.cancellationPolicy].description}</p>
          <p className="mt-3 text-[15px] text-ink-700">Deadlines use the home's local time. You can cancel from your booking page.</p>
        </div>
        <div>
          <h3 className="font-semibold">Stay length</h3>
          <p className="mt-3 text-[15px] text-ink-700">
            {listing.minNights > 1 ? `${listing.minNights}-night minimum` : 'No minimum stay'}
            {listing.maxNights < 365 ? `, up to ${listing.maxNights} nights.` : '.'}
          </p>
          <Link to="/trips" className="mt-3 inline-block text-[15px] font-semibold underline underline-offset-4">
            Already booked? Find your booking
          </Link>
        </div>
      </div>
    </div>
  );
}

function ListingSkeleton() {
  return (
    <div>
      <Skeleton className="mb-6 h-9 w-2/3" />
      <Skeleton className="h-[280px] rounded-3xl sm:h-[480px]" />
      <div className="mt-10 grid gap-16 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <Skeleton className="h-7 w-1/2" />
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="mt-8 h-32" />
        </div>
        <Skeleton className="hidden h-80 rounded-3xl lg:block" />
      </div>
    </div>
  );
}


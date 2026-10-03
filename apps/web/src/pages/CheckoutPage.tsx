import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronLeft, Lock, ShieldCheck, Star } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '../lib/api';
import { cancellationPolicies, dateRangeLabel, plural, rating } from '../lib/format';
import { useDocumentTitle } from '../lib/hooks';
import type { PublicListing, QuoteResponse } from '../lib/types';
import { PublicHeader } from '../components/layout';
import { PriceBreakdown } from './ListingPage';
import { Button, Input, Skeleton, Textarea } from '../components/ui';

export function CheckoutPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const checkIn = params.get('checkIn') ?? '';
  const checkOut = params.get('checkOut') ?? '';
  const guests = Math.max(1, Number(params.get('guests')) || 1);
  useDocumentTitle('Confirm and book');

  // One key per checkout visit: retries and double-clicks resolve to the same booking.
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
  const [form, setForm] = useState({ guestName: '', guestEmail: '', guestPhone: '', message: '' });
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);
  const [acceptTerms, setAcceptTerms] = useState(false);

  const listing = useQuery({ queryKey: ['listing', id], queryFn: () => api<PublicListing>(`/public/listings/${id}`) });
  const quote = useQuery({
    queryKey: ['quote', id, checkIn, checkOut, guests],
    queryFn: () => api<QuoteResponse>(`/public/listings/${id}/quote`, { query: { checkIn, checkOut, guests } }),
    enabled: Boolean(checkIn && checkOut),
  });

  const book = useMutation({
    mutationFn: () =>
      api<{ code: string; token: string; status: string; checkoutUrl: string | null }>('/public/bookings', {
        method: 'POST',
        body: { listingId: id, checkIn, checkOut, guests, ...form, acceptTerms, idempotencyKey },
      }),
    onSuccess: (result) => {
      // Dates are now held; hand off to the payment provider's secure checkout page.
      if (result.checkoutUrl) window.location.assign(result.checkoutUrl);
      else navigate(`/trips/${result.token}?confirmed=1`, { replace: true });
    },
    onError: (error) => {
      if (error instanceof ApiError) setFieldErrors(error.fields);
      toast.error(error.message);
      if (error instanceof ApiError && error.status === 409) quote.refetch();
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFieldErrors([]);
    book.mutate();
  };

  const backToListing = `/listings/${id}?checkIn=${checkIn}&checkOut=${checkOut}&guests=${guests}`;
  const data = listing.data;
  const unavailable = quote.data && !quote.data.available;

  return (
    <div className="min-h-dvh">
      <PublicHeader />
      <main className="mx-auto max-w-[1120px] px-5 py-8 md:px-10 md:py-12">
        <div className="mb-8 flex items-center gap-3">
          <Link to={backToListing} className="flex size-10 items-center justify-center rounded-full transition hover:bg-ink-100" aria-label="Back">
            <ChevronLeft className="size-5" />
          </Link>
          <h1 className="text-2xl font-bold tracking-tight md:text-[32px]">Confirm and book</h1>
        </div>

        <div className="grid gap-12 lg:grid-cols-[1fr_440px]">
          <form onSubmit={submit} className="order-2 space-y-10 lg:order-1">
            <section>
              <h2 className="text-[22px] font-semibold">Your trip</h2>
              <div className="mt-5 space-y-5">
                <TripRow label="Dates" value={dateRangeLabel(checkIn, checkOut)} to={backToListing} />
                <TripRow label="Guests" value={plural(guests, 'guest')} to={backToListing} />
              </div>
            </section>

            <section className="border-t border-ink-200 pt-10">
              <h2 className="text-[22px] font-semibold">Your details</h2>
              <p className="mt-1 text-[15px] text-ink-500">We'll use these to send your confirmation and arrival details.</p>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <Input
                  label="Full name"
                  required
                  autoComplete="name"
                  value={form.guestName}
                  error={fieldErrors.includes('guestName') ? 'Enter your full name.' : undefined}
                  onChange={(event) => setForm({ ...form, guestName: event.target.value })}
                />
                <Input
                  label="Email"
                  type="email"
                  required
                  autoComplete="email"
                  value={form.guestEmail}
                  error={fieldErrors.includes('guestEmail') ? 'Enter a valid email.' : undefined}
                  onChange={(event) => setForm({ ...form, guestEmail: event.target.value })}
                />
                <Input
                  label="Phone (optional)"
                  type="tel"
                  autoComplete="tel"
                  value={form.guestPhone}
                  onChange={(event) => setForm({ ...form, guestPhone: event.target.value })}
                  wrapperClassName="sm:col-span-2"
                />
                <Textarea
                  label="Message to your host (optional)"
                  placeholder="Share why you're traveling, who's coming, or anything your host should know."
                  value={form.message}
                  onChange={(event) => setForm({ ...form, message: event.target.value })}
                  wrapperClassName="sm:col-span-2"
                  maxLength={2000}
                />
              </div>
            </section>

            {data && (
              <section className="border-t border-ink-200 pt-10">
                <h2 className="text-[22px] font-semibold">Cancellation policy</h2>
                <p className="mt-3 text-[15px] leading-relaxed text-ink-700">
                  <b>{cancellationPolicies[data.cancellationPolicy].label}.</b> {cancellationPolicies[data.cancellationPolicy].description}
                </p>
              </section>
            )}

            <section className="border-t border-ink-200 pt-10">
              <label className="mb-6 flex cursor-pointer items-start gap-3 rounded-2xl p-4 ring-1 ring-ink-200 transition has-[:checked]:bg-ink-50 has-[:checked]:ring-ink-900">
                <input type="checkbox" checked={acceptTerms} onChange={(event) => setAcceptTerms(event.target.checked)} className="mt-0.5 size-5 shrink-0 accent-ink-900" required />
                <span className="text-sm leading-relaxed text-ink-700">
                  I agree to the{' '}
                  <a href="/terms" target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">Terms of Service</a>, the{' '}
                  <a href="/privacy" target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">Privacy Policy</a>, the house rules and the cancellation policy.
                </span>
              </label>
              <Button type="submit" variant="brand" size="lg" icon={<Lock className="size-4" />} className="w-full sm:w-auto sm:px-10" loading={book.isPending} disabled={!quote.data?.available || !acceptTerms}>
                Continue to payment
              </Button>
              <p className="mt-3 text-sm text-ink-500">
                You'll pay on our payment partner's secure page. Your dates are held for you while you pay.
              </p>
              {unavailable && <p className="mt-3 text-sm font-medium text-brand-700">{quote.data?.reason} <Link to={backToListing} className="underline">Choose new dates</Link></p>}
            </section>
          </form>

          <aside className="order-1 lg:order-2">
            <div className="sticky top-28 rounded-3xl p-6 ring-1 ring-ink-200">
              {!data ? (
                <Skeleton className="h-28" />
              ) : (
                <div className="flex gap-4 border-b border-ink-200 pb-6">
                  {data.media[0] && <img src={data.media.find((media) => media.kind === 'IMAGE')?.thumbUrl ?? data.media[0].thumbUrl} alt="" className="size-28 shrink-0 rounded-xl object-cover" />}
                  <div className="min-w-0">
                    <div className="text-xs text-ink-500">{data.propertyType} in {data.city}</div>
                    <div className="mt-1 line-clamp-2 font-semibold">{data.title}</div>
                    {data.ratingCount > 0 && (
                      <div className="mt-2 flex items-center gap-1 text-sm">
                        <Star className="size-3.5 fill-ink-900" /> {rating(data.ratingAverage)} <span className="text-ink-500">({data.ratingCount})</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <h3 className="mt-6 text-[22px] font-semibold">Price details</h3>
              {quote.data?.quote ? <PriceBreakdown quote={quote.data.quote} /> : <Skeleton className="mt-5 h-24" />}
              <div className="mt-6 flex gap-3 rounded-2xl bg-ink-50 p-4 text-sm text-ink-600">
                <ShieldCheck className="size-5 shrink-0 text-ink-900" />
                Your dates are checked against the live calendar and held the moment you continue, so they can never be double-booked.
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function TripRow({ label, value, to }: { label: string; value: string; to: string }) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <div className="font-semibold">{label}</div>
        <div className="text-[15px] text-ink-600">{value}</div>
      </div>
      <Link to={to} className="font-semibold underline underline-offset-4">
        Edit
      </Link>
    </div>
  );
}

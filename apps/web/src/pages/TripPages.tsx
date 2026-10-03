import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { format, parseISO } from 'date-fns';
import { AlarmClock, CalendarCheck2, CheckCircle2, Clock, Copy, CreditCard, Loader2, Mail, MapPin, MessageSquareHeart, ReceiptText, Users, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { cancellationPolicies, money, plural, zonedClock, zonedDateTime } from '../lib/format';
import { useDocumentTitle } from '../lib/hooks';
import type { ReviewCategoryKey, Trip } from '../lib/types';
import { Footer, PublicHeader } from '../components/layout';
import { LocationMap } from '../components/maps';
import { Button, Card, ConfirmDialog, Input, Skeleton, Stars, Textarea } from '../components/ui';

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

export function TripLookupPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [linksEmail, setLinksEmail] = useState('');
  useDocumentTitle('Find my booking');
  const lookup = useMutation({
    mutationFn: () => api<{ token: string }>('/public/trips/lookup', { method: 'POST', body: { code, email } }),
    onSuccess: (result) => navigate(`/trips/${result.token}`),
  });
  const links = useMutation({ mutationFn: () => api('/public/trips/links', { method: 'POST', body: { email: linksEmail } }) });

  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader />
      <main className="flex flex-1 items-center justify-center px-5 py-16">
        <div className="w-full max-w-md space-y-4">
          <Card className="animate-slide-up p-8">
            <div className="mb-6 flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <CalendarCheck2 className="size-6" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Find your booking</h1>
            <p className="mt-2 text-[15px] text-ink-500">Enter the confirmation code from your booking email and the email you booked with.</p>
            <form
              className="mt-8 space-y-4"
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                lookup.mutate();
              }}
            >
              <Input label="Confirmation code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="e.g. HX7K2M9Q" required className="font-mono tracking-widest uppercase" />
              <Input label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
              {lookup.isError && <p className="text-sm font-medium text-brand-700">{lookup.error.message}</p>}
              <Button type="submit" size="lg" className="w-full" loading={lookup.isPending}>
                Find booking
              </Button>
            </form>
          </Card>
          <Card className="animate-slide-up p-6 [animation-delay:80ms]">
            <h2 className="flex items-center gap-2 font-semibold"><Mail className="size-4" /> Lost your code?</h2>
            {links.isSuccess ? (
              <p className="mt-2 text-sm text-ink-600">If there are bookings for <b>{linksEmail}</b>, we've emailed links to them. Check your inbox.</p>
            ) : (
              <form
                className="mt-3 flex gap-2"
                onSubmit={(event: FormEvent) => {
                  event.preventDefault();
                  links.mutate();
                }}
              >
                <Input type="email" required placeholder="Your email" value={linksEmail} onChange={(event) => setLinksEmail(event.target.value)} wrapperClassName="flex-1" />
                <Button type="submit" variant="secondary" loading={links.isPending}>Email me</Button>
              </form>
            )}
            {links.isError && <p className="mt-2 text-sm text-brand-700">{links.error.message}</p>}
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Manage
// ---------------------------------------------------------------------------

function useCountdown(until: string | undefined) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!until) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [until]);
  if (!until) return null;
  const remaining = Math.max(0, new Date(until).getTime() - now);
  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  return { remaining, label: `${minutes}:${String(seconds).padStart(2, '0')}` };
}

export function TripPage() {
  const { token = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const paymentReturn = params.get('payment');
  const queryClient = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');

  const trip = useQuery({
    queryKey: ['trip', token],
    queryFn: () => api<Trip>(`/public/trips/${token}`),
    // While a payment is being confirmed, keep checking (the API also asks the provider directly).
    refetchInterval: (query) => (query.state.data?.status === 'PENDING_PAYMENT' && paymentReturn === 'success' ? 2000 : query.state.data?.status === 'PENDING_PAYMENT' ? 15000 : false),
  });
  const data = trip.data;
  useDocumentTitle(data ? `Trip to ${data.listing.city}` : 'Your trip');
  const countdown = useCountdown(data?.pendingPayment?.expiresAt);

  useEffect(() => {
    if (data?.status === 'CONFIRMED' && paymentReturn === 'success') {
      toast.success('Payment received — you are booked!');
      setParams({ confirmed: '1' }, { replace: true });
    }
  }, [data?.status, paymentReturn, setParams]);

  const setTrip = (updated: Trip) => {
    queryClient.setQueryData(['trip', token], updated);
    queryClient.invalidateQueries({ queryKey: ['availability', updated.listing.id] });
  };
  const cancel = useMutation({
    mutationFn: () => api<Trip>(`/public/trips/${token}/cancel`, { method: 'POST', body: { reason } }),
    onSuccess: (updated) => {
      setTrip(updated);
      setCancelOpen(false);
      toast.success('Your booking has been cancelled.');
    },
    onError: (error) => toast.error(error.message),
  });
  const abandon = useMutation({
    mutationFn: () => api<Trip>(`/public/trips/${token}/abandon`, { method: 'POST' }),
    onSuccess: (updated) => {
      setTrip(updated);
      setParams({}, { replace: true });
      toast.success('Reservation released.');
    },
    onError: (error) => toast.error(error.message),
  });

  if (trip.isError) {
    return (
      <div className="flex min-h-dvh flex-col">
        <PublicHeader />
        <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <h1 className="text-2xl font-bold">We couldn't find that booking</h1>
          <p className="mt-2 text-ink-500">Check the link, or look it up with your confirmation code.</p>
          <Link to="/trips" className="mt-6">
            <Button>Find my booking</Button>
          </Link>
        </main>
      </div>
    );
  }

  const justBooked = params.get('confirmed') === '1';
  const status = data?.status;
  const tz = data?.listing.timeZone ?? 'UTC';
  const address = data
    ? [data.listing.addressLine1, data.listing.addressLine2, data.listing.city, [data.listing.region, data.listing.postalCode].filter(Boolean).join(' '), data.listing.country].filter(Boolean).join(', ')
    : '';
  const muted = status === 'CANCELLED' || status === 'EXPIRED';

  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 md:px-10">
        {!data ? (
          <Skeleton className="h-96 rounded-3xl" />
        ) : (
          <div className="animate-slide-up">
            {status === 'CONFIRMED' && justBooked && (
              <Banner tone="green" icon={<CheckCircle2 className="size-8" />} title={`You're booked, ${data.guestName.split(' ')[0]}!`}>
                Payment received and your dates are confirmed. A confirmation email is on its way. Bookmark this page — it's how you manage your stay. Your confirmation code is{' '}
                <b className="font-mono tracking-wider">{data.code}</b>.
              </Banner>
            )}

            {status === 'PENDING_PAYMENT' && paymentReturn === 'success' && (
              <Banner tone="neutral" icon={<Loader2 className="size-8 animate-spin" />} title="Confirming your payment…">
                This usually takes a few seconds. You can leave this page open — it updates automatically.
              </Banner>
            )}

            {status === 'PENDING_PAYMENT' && paymentReturn !== 'success' && (
              <Banner tone="amber" icon={<AlarmClock className="size-8" />} title={paymentReturn === 'cancelled' ? 'Payment not completed' : 'Finish paying to confirm your stay'}>
                <p>
                  We're holding these dates for you{countdown && countdown.remaining > 0 ? <> for another <b className="tabular-nums">{countdown.label}</b></> : ''}. If payment isn't completed in time, they're released for other guests.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {data.pendingPayment?.checkoutUrl && (
                    <a href={data.pendingPayment.checkoutUrl}>
                      <Button variant="brand" icon={<CreditCard className="size-4" />}>Complete payment</Button>
                    </a>
                  )}
                  <Button variant="secondary" loading={abandon.isPending} onClick={() => abandon.mutate()}>
                    Release these dates
                  </Button>
                </div>
              </Banner>
            )}

            {status === 'EXPIRED' && (
              <Banner tone="neutral" icon={<XCircle className="size-8" />} title="This reservation expired">
                Payment wasn't completed, so the dates were released and you were not charged.{' '}
                <Link to={`/listings/${data.listing.id}?checkIn=${data.checkIn}&checkOut=${data.checkOut}&guests=${data.guests}`} className="font-semibold underline">
                  Try booking again
                </Link>
                .
              </Banner>
            )}

            <div className="overflow-hidden rounded-3xl ring-1 ring-ink-200">
              <div className="relative h-56 bg-ink-100 sm:h-72">
                {data.listing.coverUrl && <img src={data.listing.coverUrl} alt="" className={clsx('h-full w-full object-cover', muted && 'grayscale')} />}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                <div className="absolute right-6 bottom-6 left-6 text-white">
                  <StatusPill status={data.status} />
                  <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{data.listing.title}</h2>
                  <p className="text-white/85">{data.listing.city}, {data.listing.region}</p>
                </div>
              </div>
              <div className="grid divide-y divide-ink-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                <Fact label="Check-in" value={format(parseISO(data.checkIn), 'EEE, MMM d')} detail={`After ${zonedClock(data.checkInAt, tz)}`} />
                <Fact label="Checkout" value={format(parseISO(data.checkOut), 'EEE, MMM d')} detail={`Before ${zonedClock(data.checkOutAt, tz)}`} />
                <Fact label="Guests" value={plural(data.guests, 'guest')} detail={plural(data.nights, 'night')} />
              </div>
            </div>

            <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_340px]">
              <div className="space-y-10">
                {status === 'CONFIRMED' && (
                  <section>
                    <h3 className="flex items-center gap-2 text-xl font-semibold"><MapPin className="size-5" /> Getting there</h3>
                    <p className="mt-2 text-[15px] text-ink-700">{address}</p>
                    {data.listing.latitude != null && data.listing.longitude != null && (
                      <LocationMap className="mt-4 h-72" location={{ latitude: data.listing.latitude, longitude: data.listing.longitude, precision: 'EXACT', radiusMeters: 0 }} />
                    )}
                  </section>
                )}
                {status === 'PENDING_PAYMENT' && (
                  <p className="rounded-2xl bg-ink-50 p-4 text-sm text-ink-600">The exact address and arrival details appear here once payment is complete.</p>
                )}
                {data.listing.houseRules && (
                  <section>
                    <h3 className="flex items-center gap-2 text-xl font-semibold"><Clock className="size-5" /> House rules</h3>
                    <ul className="mt-3 space-y-2 text-[15px] text-ink-700">
                      {data.listing.houseRules.split('\n').filter(Boolean).map((rule) => <li key={rule}>• {rule}</li>)}
                    </ul>
                    <p className="mt-3 text-sm text-ink-500">All times are local to the home ({data.listing.timeZoneLabel}).</p>
                  </section>
                )}
                {data.canReview && <ReviewForm token={token} />}
                {data.review && (
                  <section className="rounded-3xl bg-ink-50 p-6">
                    <h3 className="text-lg font-semibold">Your review</h3>
                    <div className="mt-2"><Stars value={data.review.rating} /></div>
                    <p className="mt-2 text-[15px] text-ink-700">{data.review.comment}</p>
                  </section>
                )}
              </div>

              <aside className="space-y-4">
                <Card className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold tracking-wide text-ink-500 uppercase">Confirmation code</div>
                      <div className="font-mono text-lg font-bold tracking-widest">{data.code}</div>
                    </div>
                    <button
                      type="button"
                      aria-label="Copy code"
                      onClick={() => {
                        navigator.clipboard?.writeText(data.code);
                        toast.success('Code copied');
                      }}
                      className="flex size-9 items-center justify-center rounded-lg hover:bg-ink-100"
                    >
                      <Copy className="size-4" />
                    </button>
                  </div>
                  <div className="mt-5 space-y-3 border-t border-ink-100 pt-5 text-[15px]">
                    <div className="flex justify-between text-ink-600"><span>{money(data.nightlyPrice, data.currency)} × {plural(data.nights, 'night')}</span><span>{money(data.nightlyPrice * data.nights, data.currency)}</span></div>
                    {data.cleaningFee > 0 && <div className="flex justify-between text-ink-600"><span>Cleaning fee</span><span>{money(data.cleaningFee, data.currency)}</span></div>}
                    <div className="flex justify-between border-t border-ink-100 pt-3 font-semibold"><span>Total</span><span>{money(data.totalPrice, data.currency)}</span></div>
                    {data.payment.amountPaid > 0 && (
                      <div className="flex justify-between text-sm text-emerald-700"><span className="flex items-center gap-1.5"><ReceiptText className="size-4" /> Paid</span><span>{money(data.payment.amountPaid, data.currency)}</span></div>
                    )}
                    {data.payment.amountRefunded > 0 && (
                      <div className="flex justify-between text-sm text-ink-600"><span>Refunded</span><span>−{money(data.payment.amountRefunded, data.currency)}</span></div>
                    )}
                    {data.payment.refundPending > 0 && (
                      <div className="flex justify-between text-sm text-amber-700"><span>Refund processing</span><span>{money(data.payment.refundPending, data.currency)}</span></div>
                    )}
                  </div>
                  <div className="mt-5 flex items-center gap-2 border-t border-ink-100 pt-5 text-sm text-ink-600">
                    <Users className="size-4 shrink-0" /> <span className="truncate">Booked by {data.guestName} · {data.guestEmail}</span>
                  </div>
                </Card>
                {data.canCancel && data.cancellation && (
                  <Card className="p-6">
                    <h3 className="font-semibold">Need to cancel?</h3>
                    <p className="mt-1 text-sm text-ink-500">{cancellationPolicies[data.listing.cancellationPolicy].description}</p>
                    {data.cancellation.fullRefundUntil && (
                      <p className="mt-2 text-sm font-medium text-emerald-700">Full refund until {zonedDateTime(data.cancellation.fullRefundUntil, tz)}.</p>
                    )}
                    <Button variant="danger" className="mt-4 w-full" onClick={() => setCancelOpen(true)}>
                      Cancel booking
                    </Button>
                  </Card>
                )}
                {status === 'CANCELLED' && data.cancelledAt && (
                  <p className="px-2 text-sm text-ink-500">
                    Cancelled {data.cancelledBy === 'host' ? 'by the host ' : ''}on {format(new Date(data.cancelledAt), 'MMM d, yyyy')}. These dates have been released.
                  </p>
                )}
              </aside>
            </div>
          </div>
        )}
      </main>
      <Footer />

      {data?.cancellation && (
        <ConfirmDialog
          open={cancelOpen}
          onClose={() => setCancelOpen(false)}
          onConfirm={() => cancel.mutate()}
          loading={cancel.isPending}
          title="Cancel this booking?"
          description={
            <>
              <span className="block rounded-xl bg-ink-50 p-3 text-ink-800">
                {data.cancellation.policyAmount > 0 ? (
                  <>You'll be refunded <b>{money(data.cancellation.policyAmount, data.currency)}</b> ({data.cancellation.percent}%) to your original payment method.</>
                ) : data.cancellation.hasOnlinePayment ? (
                  <>Under this booking's cancellation policy, <b>no refund</b> applies now.</>
                ) : (
                  <>Your dates will be released.</>
                )}
                <span className="mt-1 block text-xs text-ink-500">{data.cancellation.rule}</span>
              </span>
              <span className="mt-3 block">Your dates will be released immediately. This can't be undone.</span>
            </>
          }
          confirmLabel="Cancel booking"
          destructive
        >
          <Textarea label="Reason (optional)" value={reason} onChange={(event) => setReason(event.target.value)} className="min-h-20" />
        </ConfirmDialog>
      )}
    </div>
  );
}

function Banner({ tone, icon, title, children }: { tone: 'green' | 'amber' | 'neutral'; icon: React.ReactNode; title: string; children: React.ReactNode }) {
  const tones = {
    green: 'bg-emerald-50 ring-emerald-600/15 text-emerald-950 [&_svg]:text-emerald-600',
    amber: 'bg-amber-50 ring-amber-600/20 text-amber-950 [&_svg]:text-amber-600',
    neutral: 'bg-ink-50 ring-ink-200 text-ink-900 [&_svg]:text-ink-500',
  };
  return (
    <div className={clsx('mb-8 flex animate-pop-in items-start gap-4 rounded-3xl p-6 ring-1', tones[tone])}>
      <span className="shrink-0">{icon}</span>
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <div className="mt-1 text-[15px] leading-relaxed opacity-85 [&_svg]:text-current">{children}</div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: Trip['status'] }) {
  const map = {
    CONFIRMED: { label: 'Confirmed', className: 'text-emerald-700', icon: CheckCircle2 },
    PENDING_PAYMENT: { label: 'Awaiting payment', className: 'text-amber-700', icon: AlarmClock },
    CANCELLED: { label: 'Cancelled', className: 'text-brand-700', icon: XCircle },
    EXPIRED: { label: 'Expired', className: 'text-ink-600', icon: XCircle },
  }[status];
  return (
    <span className={clsx('mb-2 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-bold', map.className)}>
      <map.icon className="size-3.5" />
      {map.label}
    </span>
  );
}

function Fact({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="px-6 py-5">
      <div className="text-xs font-semibold tracking-wide text-ink-500 uppercase">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      <div className="text-sm text-ink-500">{detail}</div>
    </div>
  );
}

const reviewCategories: { key: ReviewCategoryKey; label: string }[] = [
  { key: 'cleanliness', label: 'Cleanliness' },
  { key: 'accuracy', label: 'Accuracy' },
  { key: 'checkIn', label: 'Check-in' },
  { key: 'communication', label: 'Communication' },
  { key: 'location', label: 'Location' },
  { key: 'value', label: 'Value' },
];

function ReviewForm({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const [scores, setScores] = useState<Record<string, number>>({ rating: 0, cleanliness: 0, accuracy: 0, checkIn: 0, communication: 0, location: 0, value: 0 });
  const [comment, setComment] = useState('');
  const submit = useMutation({
    mutationFn: () => api(`/public/trips/${token}/review`, { method: 'POST', body: { ...scores, comment } }),
    onSuccess: () => {
      toast.success('Thanks for your review!');
      queryClient.invalidateQueries({ queryKey: ['trip', token] });
    },
    onError: (error) => toast.error(error.message),
  });
  const complete = Object.values(scores).every((value) => value > 0) && comment.trim().length >= 10;

  return (
    <section id="review" className="scroll-mt-28 rounded-3xl p-6 ring-1 ring-ink-200">
      <h3 className="flex items-center gap-2 text-xl font-semibold"><MessageSquareHeart className="size-5" /> How was your stay?</h3>
      <p className="mt-1 text-[15px] text-ink-500">Your review helps future guests and your host.</p>
      <div className="mt-6 flex items-center justify-between rounded-2xl bg-ink-50 px-4 py-3">
        <span className="font-semibold">Overall</span>
        <Stars value={scores.rating} size="size-7" onChange={(value) => setScores({ ...scores, rating: value })} />
      </div>
      <div className="mt-2 grid gap-x-8 sm:grid-cols-2">
        {reviewCategories.map((category) => (
          <div key={category.key} className="flex items-center justify-between border-b border-ink-100 px-1 py-3">
            <span className="text-[15px]">{category.label}</span>
            <Stars value={scores[category.key]} size="size-5" onChange={(value) => setScores({ ...scores, [category.key]: value })} />
          </div>
        ))}
      </div>
      <Textarea wrapperClassName="mt-6" label="Tell future guests about your stay" value={comment} onChange={(event) => setComment(event.target.value)} maxLength={3000} />
      <Button className="mt-4" disabled={!complete} loading={submit.isPending} onClick={() => submit.mutate()}>
        Submit review
      </Button>
    </section>
  );
}

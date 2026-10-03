import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CreditCard, FlaskConical, Lock } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { dateRangeLabel, money, plural } from '../lib/format';
import { useDocumentTitle } from '../lib/hooks';
import { Button, Skeleton } from '../components/ui';

type DevSession = {
  amount: number;
  currency: string;
  status: string;
  expiresAt: string;
  listingTitle: string;
  city: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  guestEmail: string;
  nightlyPrice: number;
  cleaningFee: number;
};

/**
 * Hosted-checkout stand-in for PAYMENT_PROVIDER=fake (local development only). "Pay" goes through the
 * same event pipeline a real provider's webhook would, so the rest of the booking flow is exercised end to end.
 */
export function DevCheckoutPage() {
  const { sessionId = '' } = useParams();
  const [params] = useSearchParams();
  const successUrl = params.get('success') ?? '/';
  const cancelUrl = params.get('cancel') ?? '/';
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');
  useDocumentTitle('Test checkout');
  const session = useQuery({ queryKey: ['dev-checkout', sessionId], queryFn: () => api<DevSession>(`/dev/payments/${sessionId}`), retry: false });
  const data = session.data;

  const pay = async () => {
    setPaying(true);
    setError('');
    try {
      await api(`/dev/payments/${sessionId}/pay`, { method: 'POST' });
      window.location.assign(successUrl);
    } catch (payError) {
      setError(errorMessage(payError));
      setPaying(false);
    }
  };

  return (
    <div className="min-h-dvh bg-ink-50">
      <div className="flex items-center justify-center gap-2 bg-amber-400 px-4 py-2 text-xs font-bold tracking-wide text-amber-950 uppercase">
        <FlaskConical className="size-4" /> Test mode — development payment provider, no real money moves
      </div>
      <div className="mx-auto grid max-w-5xl gap-10 px-5 py-12 md:grid-cols-2 md:py-20">
        <section>
          <a href={cancelUrl} className="inline-flex items-center gap-2 text-sm font-medium text-ink-500 hover:text-ink-900">
            <ArrowLeft className="size-4" /> Back to Haven
          </a>
          {session.isError ? (
            <p className="mt-8 text-ink-600">{errorMessage(session.error)}</p>
          ) : !data ? (
            <Skeleton className="mt-8 h-48" />
          ) : (
            <div className="mt-8 animate-fade-in">
              <p className="text-sm font-medium text-ink-500">Pay Haven</p>
              <p className="mt-1 text-4xl font-bold tracking-tight">{money(data.amount, data.currency, { exact: true })}</p>
              <div className="mt-8 space-y-4 text-sm">
                <div className="flex justify-between gap-4">
                  <div>
                    <div className="font-semibold">{data.listingTitle}</div>
                    <div className="text-ink-500">{dateRangeLabel(data.checkIn, data.checkOut)} · {plural(data.nights, 'night')} · {plural(data.guests, 'guest')}</div>
                  </div>
                  <div className="shrink-0 font-medium">{money(data.nightlyPrice * data.nights, data.currency)}</div>
                </div>
                {data.cleaningFee > 0 && (
                  <div className="flex justify-between"><span>Cleaning fee</span><span className="font-medium">{money(data.cleaningFee, data.currency)}</span></div>
                )}
                <div className="flex justify-between border-t border-ink-200 pt-4 font-semibold"><span>Total due</span><span>{money(data.amount, data.currency)}</span></div>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-3xl bg-white p-8 shadow-card ring-1 ring-ink-200/70">
          <h1 className="text-lg font-semibold">Pay with card</h1>
          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="field-label">Email</span>
              <input className="field" value={data?.guestEmail ?? ''} readOnly />
            </label>
            <label className="block">
              <span className="field-label">Card information</span>
              <div className="overflow-hidden rounded-xl border border-ink-200">
                <div className="flex items-center gap-2 border-b border-ink-200 px-3.5 py-2.5">
                  <input className="w-full bg-transparent text-[15px] outline-none" value="4242 4242 4242 4242" readOnly />
                  <CreditCard className="size-5 text-ink-400" />
                </div>
                <div className="grid grid-cols-2">
                  <input className="border-r border-ink-200 px-3.5 py-2.5 text-[15px] outline-none" value="12 / 34" readOnly />
                  <input className="px-3.5 py-2.5 text-[15px] outline-none" value="123" readOnly />
                </div>
              </div>
            </label>
          </div>
          {data && data.status !== 'PENDING' && <p className="mt-4 rounded-xl bg-ink-50 p-3 text-sm text-ink-600">This checkout is {data.status.toLowerCase()}.</p>}
          {error && <p className="mt-4 rounded-xl bg-danger-50 p-3 text-sm text-danger-800">{error}</p>}
          <Button size="lg" className="mt-6 w-full" icon={<Lock className="size-4" />} loading={paying} disabled={!data || data.status !== 'PENDING'} onClick={() => void pay()}>
            {data ? `Pay ${money(data.amount, data.currency, { exact: true })}` : 'Pay'}
          </Button>
          <a href={cancelUrl} className="mt-4 block text-center text-sm font-medium text-ink-500 hover:text-ink-900">
            Cancel and return
          </a>
        </section>
      </div>
    </div>
  );
}

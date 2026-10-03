import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { format, parseISO } from 'date-fns';
import { CalendarX2, ExternalLink, FileCheck2, HandCoins, Mail, MessageSquare, Phone, RotateCcw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../lib/api';
import { dateRangeLabel, longDate, money, plural } from '../../lib/format';
import { useDebounced, useDocumentTitle } from '../../lib/hooks';
import type { RefundPreview, StaffBooking, StaffBookingDetail } from '../../lib/types';
import { AdminPage } from '../../components/layout';
import { Avatar, Badge, Button, Drawer, EmptyState, Input, Modal, Segmented, Skeleton, Stars, Textarea } from '../../components/ui';
import { EmailDrawer } from './CommsPages';

type View = 'upcoming' | 'current' | 'past' | 'pending' | 'cancelled' | 'all';

export function BookingsPage() {
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<View>('upcoming');
  const [text, setText] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounced(text, 300);
  const openId = params.get('booking');
  useDocumentTitle('Bookings');

  const bookings = useQuery({
    queryKey: ['admin', 'bookings', view, q, page],
    queryFn: () => api<{ items: StaffBooking[]; total: number; page: number; pageSize: number }>('/admin/bookings', { query: { view, q, page } }),
    placeholderData: keepPreviousData,
  });
  const data = bookings.data;

  return (
    <AdminPage title="Bookings" description="Reservations across every listing. Dates and statuses follow each home's local time.">
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="scrollbar-none overflow-x-auto">
          <Segmented
            value={view}
            onChange={(value) => {
              setView(value);
              setPage(1);
            }}
            options={[
              { value: 'upcoming', label: 'Upcoming' },
              { value: 'current', label: 'Staying now' },
              { value: 'past', label: 'Past' },
              { value: 'pending', label: 'Unpaid' },
              { value: 'cancelled', label: 'Cancelled' },
              { value: 'all', label: 'All' },
            ]}
          />
        </div>
        <Input prefix={<Search className="size-4" />} placeholder="Guest, email or code" value={text} onChange={(event) => { setText(event.target.value); setPage(1); }} wrapperClassName="lg:w-80" />
      </div>

      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-ink-200/70">
        {bookings.isPending ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-14" />)}</div>
        ) : !data?.items.length ? (
          <div className="p-6">
            <EmptyState
              icon={<CalendarX2 className="size-6" />}
              title="No bookings here"
              description={q ? 'Nothing matches that search.' : view === 'pending' ? 'Checkouts that are waiting for payment, or that expired unpaid, show up here.' : 'Bookings will appear here as guests reserve.'}
            />
          </div>
        ) : (
          <div className={clsx('overflow-x-auto transition-opacity', bookings.isFetching && 'opacity-60')}>
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-ink-100 bg-ink-50/60 text-xs font-semibold tracking-wide text-ink-500 uppercase">
                <tr>
                  <th className="px-5 py-3">Guest</th>
                  <th className="px-5 py-3">Listing</th>
                  <th className="px-5 py-3">Dates</th>
                  <th className="px-5 py-3">Total</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {data.items.map((booking) => (
                  <tr key={booking.id} onClick={() => setParams({ booking: booking.id })} className="cursor-pointer transition hover:bg-ink-50">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar name={booking.guestName} className="size-9 text-xs" />
                        <div className="min-w-0">
                          <div className="truncate font-medium">{booking.guestName}</div>
                          <div className="font-mono text-xs text-ink-500">{booking.code}</div>
                        </div>
                      </div>
                    </td>
                    <td className="max-w-[240px] truncate px-5 py-3.5 text-ink-700">{booking.listing?.title}</td>
                    <td className="px-5 py-3.5">
                      <div className="font-medium">{dateRangeLabel(booking.checkIn, booking.checkOut)}</div>
                      <div className="text-xs text-ink-500">{plural(booking.nights, 'night')} · {plural(booking.guests, 'guest')}</div>
                    </td>
                    <td className="px-5 py-3.5 font-medium tabular-nums">{money(booking.totalPrice, booking.currency)}</td>
                    <td className="px-5 py-3.5"><StatusBadge booking={booking} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data && data.total > data.pageSize && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-ink-500">{data.total} bookings</span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <Button size="sm" variant="secondary" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </div>
      )}

      <BookingDrawer id={openId} onClose={() => setParams({})} />
    </AdminPage>
  );
}

export function StatusBadge({ booking }: { booking: StaffBooking }) {
  if (booking.status === 'CANCELLED') return <Badge tone="red">Cancelled</Badge>;
  if (booking.status === 'PENDING_PAYMENT') return <Badge tone="amber">Awaiting payment</Badge>;
  if (booking.status === 'EXPIRED') return <Badge>Expired unpaid</Badge>;
  // "Today" at the home, so a guest checking in tonight in Hawaii isn't "staying" yet from London.
  const today = booking.listingToday ?? format(new Date(), 'yyyy-MM-dd');
  if (booking.checkIn <= today && booking.checkOut > today) return <Badge tone="blue">Staying</Badge>;
  if (booking.checkOut <= today) return <Badge>Completed</Badge>;
  return <Badge tone="green">Confirmed</Badge>;
}

const refundTone = { SUCCEEDED: 'green', PENDING: 'amber', FAILED: 'red' } as const;

function BookingDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [cancelling, setCancelling] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [emailId, setEmailId] = useState<string | null>(null);
  const booking = useQuery({ queryKey: ['admin', 'booking', id], queryFn: () => api<StaffBookingDetail>(`/admin/bookings/${id}`), enabled: Boolean(id) });
  const data = booking.data;

  const refresh = (updated?: StaffBookingDetail) => {
    if (updated) queryClient.setQueryData(['admin', 'booking', id], updated);
    else queryClient.invalidateQueries({ queryKey: ['admin', 'booking', id] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'bookings'] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'calendar'] });
  };
  const retryRefund = useMutation({
    mutationFn: (refundId: string) => api(`/admin/refunds/${refundId}/retry`, { method: 'POST' }),
    onSuccess: () => {
      refresh();
      toast.success('Refund resubmitted');
    },
    onError: (error) => toast.error(error.message),
  });

  const active = data?.status === 'CONFIRMED' || data?.status === 'PENDING_PAYMENT';
  const refundable = data ? data.payment.amountPaid - data.payment.amountRefunded - data.payment.refundPending : 0;
  const tz = data?.listing?.timeZone;

  return (
    <Drawer
      open={Boolean(id)}
      onClose={onClose}
      title={data ? `Booking ${data.code}` : 'Booking'}
      footer={
        data && (
          <div className="flex flex-wrap gap-2">
            <a href={`/trips/${data.manageToken}`} target="_blank" rel="noreferrer" className="flex-1">
              <Button variant="secondary" className="w-full" icon={<ExternalLink className="size-4" />}>Guest page</Button>
            </a>
            {data.status === 'CONFIRMED' && refundable > 0 && (
              <Button variant="secondary" className="flex-1" icon={<HandCoins className="size-4" />} onClick={() => setRefunding(true)}>Refund</Button>
            )}
            {active && <Button variant="danger" className="flex-1" onClick={() => setCancelling(true)}>{data.status === 'PENDING_PAYMENT' ? 'Release dates' : 'Cancel booking'}</Button>}
          </div>
        )
      }
    >
      {!data ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar name={data.guestName} className="size-14 text-base" />
            <div>
              <div className="text-lg font-semibold">{data.guestName}</div>
              <StatusBadge booking={data} />
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <a href={`mailto:${data.guestEmail}`} className="flex items-center gap-2 hover:underline"><Mail className="size-4 text-ink-500" />{data.guestEmail}</a>
            {data.guestPhone && <a href={`tel:${data.guestPhone}`} className="flex items-center gap-2 hover:underline"><Phone className="size-4 text-ink-500" />{data.guestPhone}</a>}
          </div>
          <div className="rounded-2xl bg-ink-50 p-4">
            <Link to={`/admin/listings/${data.listing?.id}?tab=calendar`} className="font-semibold hover:underline">{data.listing?.title}</Link>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div><div className="text-ink-500">Check-in</div><div className="font-medium">{longDate(data.checkIn)}</div></div>
              <div><div className="text-ink-500">Checkout</div><div className="font-medium">{longDate(data.checkOut)}</div></div>
              <div><div className="text-ink-500">Guests</div><div className="font-medium">{data.guests}</div></div>
              <div><div className="text-ink-500">Nights</div><div className="font-medium">{data.nights}</div></div>
            </div>
            {tz && <p className="mt-3 text-xs text-ink-500">Home's time zone: {tz}</p>}
          </div>
          {data.message && (
            <div>
              <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold"><MessageSquare className="size-4" /> Message from guest</div>
              <p className="rounded-2xl bg-ink-50 p-4 text-sm leading-relaxed whitespace-pre-line">{data.message}</p>
            </div>
          )}

          <section>
            <h3 className="mb-2 text-sm font-semibold">Payment</h3>
            <div className="space-y-2 rounded-2xl p-4 text-sm ring-1 ring-ink-200">
              <div className="flex justify-between"><span className="text-ink-500">{money(data.nightlyPrice, data.currency)} × {plural(data.nights, 'night')}</span><span>{money(data.nightlyPrice * data.nights, data.currency)}</span></div>
              <div className="flex justify-between"><span className="text-ink-500">Cleaning fee</span><span>{money(data.cleaningFee, data.currency)}</span></div>
              <div className="flex justify-between border-t border-ink-100 pt-2 font-semibold"><span>Total</span><span>{money(data.totalPrice, data.currency)}</span></div>
              {data.payment.payments.length === 0 ? (
                <p className="pt-1 text-xs text-ink-500">
                  {data.source === 'STAFF' ? 'Staff booking — payment handled outside the platform.' : 'No online payment on record (booked before online payments were enabled).'}
                </p>
              ) : (
                <>
                  <div className="flex justify-between text-emerald-700"><span>Paid online</span><span>{money(data.payment.amountPaid, data.currency)}</span></div>
                  {data.payment.amountRefunded > 0 && <div className="flex justify-between"><span className="text-ink-500">Refunded</span><span>−{money(data.payment.amountRefunded, data.currency)}</span></div>}
                  {data.payment.refundPending > 0 && <div className="flex justify-between text-amber-700"><span>Refund processing</span><span>{money(data.payment.refundPending, data.currency)}</span></div>}
                </>
              )}
              {data.payment.payments.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between border-t border-ink-100 pt-2 text-xs text-ink-500">
                  <span className="truncate">{payment.provider} · {payment.providerPaymentId ?? 'no payment yet'}</span>
                  <Badge tone={payment.status === 'SUCCEEDED' ? 'green' : payment.status === 'PENDING' ? 'amber' : 'neutral'}>{payment.status.toLowerCase()}</Badge>
                </div>
              ))}
            </div>
            {data.payment.refunds.length > 0 && (
              <ul className="mt-3 space-y-2">
                {data.payment.refunds.map((refund) => (
                  <li key={refund.id} className="flex items-center gap-3 rounded-xl bg-ink-50 px-3 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">Refund {money(refund.amount, data.currency)}</div>
                      <div className="truncate text-xs text-ink-500">{format(new Date(refund.createdAt), 'MMM d, h:mm a')} · {refund.initiatedBy}{refund.reason ? ` · ${refund.reason}` : ''}</div>
                      {refund.failureMessage && <div className="text-xs text-danger-700">{refund.failureMessage}</div>}
                    </div>
                    <Badge tone={refundTone[refund.status]}>{refund.status.toLowerCase()}</Badge>
                    {refund.status === 'FAILED' && (
                      <Button size="sm" variant="secondary" icon={<RotateCcw className="size-3.5" />} loading={retryRefund.isPending && retryRefund.variables === refund.id} onClick={() => retryRefund.mutate(refund.id)}>Retry</Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {(data.termsVersion || data.privacyVersion) && (
            <section className="flex items-start gap-2 text-xs text-ink-500">
              <FileCheck2 className="mt-0.5 size-4 shrink-0" />
              <span>
                Guest accepted{' '}
                {data.termsVersion && <a className="underline" href={`/terms?version=${data.termsVersion.version}`} target="_blank" rel="noreferrer">Terms v{data.termsVersion.version}</a>}
                {data.termsVersion && data.privacyVersion && ' and '}
                {data.privacyVersion && <a className="underline" href={`/privacy?version=${data.privacyVersion.version}`} target="_blank" rel="noreferrer">Privacy Policy v{data.privacyVersion.version}</a>}
                {' '}when booking.
              </span>
            </section>
          )}

          {data.emails.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold">Emails</h3>
              <ul className="divide-y divide-ink-100 rounded-2xl ring-1 ring-ink-200">
                {data.emails.map((email) => (
                  <li key={email.id}>
                    <button type="button" onClick={() => setEmailId(email.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-ink-50">
                      <span className={clsx('size-2 shrink-0 rounded-full', email.status === 'SENT' ? 'bg-emerald-500' : email.status === 'FAILED' ? 'bg-danger-500' : 'bg-amber-400')} />
                      <span className="min-w-0 flex-1 truncate">{email.subject}</span>
                      <span className="shrink-0 text-xs text-ink-500">{format(new Date(email.createdAt), 'MMM d')}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="space-y-1 border-t border-ink-100 pt-4 text-xs text-ink-500">
            <div>Booked {format(new Date(data.createdAt), 'MMM d, yyyy h:mm a')} via {data.source === 'STAFF' ? `staff (${data.createdBy ?? 'unknown'})` : 'website'}</div>
            {data.confirmedAt && <div>Confirmed {format(new Date(data.confirmedAt), 'MMM d, yyyy h:mm a')}</div>}
            {data.cancelledAt && <div className="text-danger-700">Cancelled {format(new Date(data.cancelledAt), 'MMM d, yyyy h:mm a')} by {data.cancelledBy}{data.cancellationReason ? ` — “${data.cancellationReason}”` : ''}</div>}
          </div>
          {data.review && (
            <div className="rounded-2xl p-4 ring-1 ring-ink-200">
              <div className="flex items-center justify-between"><span className="text-sm font-semibold">Guest review</span><Stars value={data.review.rating} size="size-3.5" /></div>
              <p className="mt-2 text-sm text-ink-700">{data.review.comment}</p>
              <p className="mt-1 text-xs text-ink-400">{format(parseISO(data.review.createdAt), 'MMM d, yyyy')}</p>
            </div>
          )}
        </div>
      )}
      {data && cancelling && <CancelDialog booking={data} onClose={() => setCancelling(false)} onDone={(updated) => { refresh(updated); setCancelling(false); }} />}
      {data && refunding && <RefundDialog booking={data} max={refundable} onClose={() => setRefunding(false)} onDone={(updated) => { refresh(updated); setRefunding(false); }} />}
      <EmailDrawer id={emailId} onClose={() => setEmailId(null)} />
    </Drawer>
  );
}

function CancelDialog({ booking, onClose, onDone }: { booking: StaffBookingDetail; onClose: () => void; onDone: (updated: StaffBookingDetail) => void }) {
  const pending = booking.status === 'PENDING_PAYMENT';
  const preview = useQuery({ queryKey: ['admin', 'refund-preview', booking.id], queryFn: () => api<RefundPreview>(`/admin/bookings/${booking.id}/refund-preview`), enabled: !pending });
  const [choice, setChoice] = useState<'policy' | 'full' | 'none' | 'custom'>('policy');
  const [custom, setCustom] = useState('');
  const [reason, setReason] = useState('');
  const cancel = useMutation({
    mutationFn: () =>
      api<StaffBookingDetail>(`/admin/bookings/${booking.id}/cancel`, {
        method: 'POST',
        body: { reason, refund: choice, refundAmount: choice === 'custom' ? Math.round(Number(custom) * 100) : undefined },
      }),
    onSuccess: (updated) => {
      toast.success(pending ? 'Dates released' : 'Booking cancelled — the guest has been emailed');
      onDone(updated);
    },
    onError: (error) => toast.error(error.message),
  });
  const data = preview.data;
  const options = data?.hasOnlinePayment
    ? [
        { value: 'policy' as const, label: 'Per cancellation policy', amount: data.policyAmount, hint: `${data.percent}% · ${data.rule}` },
        { value: 'full' as const, label: 'Full refund', amount: data.refundable, hint: 'Recommended when the host cancels' },
        { value: 'none' as const, label: 'No refund', amount: 0, hint: '' },
        { value: 'custom' as const, label: 'Custom amount', amount: null, hint: `Up to ${money(data.refundable, booking.currency, { exact: true })}` },
      ]
    : [];

  return (
    <Modal
      open
      onClose={onClose}
      title={pending ? 'Release these dates?' : 'Cancel booking'}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Keep it</Button>
          <Button variant="brand" loading={cancel.isPending} disabled={choice === 'custom' && !(Number(custom) > 0)} onClick={() => cancel.mutate()}>
            {pending ? 'Release dates' : 'Cancel booking'}
          </Button>
        </div>
      }
    >
      {pending ? (
        <p className="text-[15px] text-ink-600">The guest hasn't paid yet. Their checkout will be closed and the nights released immediately.</p>
      ) : (
        <div className="space-y-4">
          <p className="text-[15px] text-ink-600">The nights are released immediately and the guest is emailed.</p>
          {preview.isPending ? (
            <Skeleton className="h-40" />
          ) : options.length ? (
            <div className="space-y-2">
              {options.map((option) => (
                <label key={option.value} className={clsx('flex cursor-pointer items-start gap-3 rounded-xl p-3 ring-1 transition', choice === option.value ? 'bg-ink-50 ring-2 ring-ink-900' : 'ring-ink-200 hover:ring-ink-400')}>
                  <input type="radio" name="refund" checked={choice === option.value} onChange={() => setChoice(option.value)} className="mt-1 accent-ink-900" />
                  <span className="min-w-0 flex-1">
                    <span className="flex justify-between gap-2 text-sm font-semibold">
                      {option.label}
                      {option.amount !== null && <span>{money(option.amount, booking.currency, { exact: true })}</span>}
                    </span>
                    {option.hint && <span className="block text-xs text-ink-500">{option.hint}</span>}
                    {option.value === 'custom' && choice === 'custom' && (
                      <Input wrapperClassName="mt-2" prefix="$" inputMode="decimal" value={custom} onChange={(event) => setCustom(event.target.value.replace(/[^\d.]/g, ''))} autoFocus />
                    )}
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <p className="rounded-xl bg-ink-50 p-3 text-sm text-ink-600">No online payment on this booking, so there's nothing to refund here.</p>
          )}
          <Textarea label="Reason (included in the guest's email)" value={reason} onChange={(event) => setReason(event.target.value)} className="min-h-20" />
        </div>
      )}
    </Modal>
  );
}

function RefundDialog({ booking, max, onClose, onDone }: { booking: StaffBookingDetail; max: number; onClose: () => void; onDone: (updated: StaffBookingDetail) => void }) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const cents = Math.round(Number(amount) * 100);
  const refund = useMutation({
    mutationFn: () => api<StaffBookingDetail>(`/admin/bookings/${booking.id}/refunds`, { method: 'POST', body: { amount: cents, note } }),
    onSuccess: (updated) => {
      toast.success('Refund issued — the guest has been emailed');
      onDone(updated);
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Issue a refund"
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={refund.isPending} disabled={!(cents > 0 && cents <= max)} onClick={() => refund.mutate()}>Refund {cents > 0 ? money(cents, booking.currency, { exact: true }) : ''}</Button>
        </div>
      }
    >
      <p className="text-[15px] text-ink-600">A partial or goodwill refund. The booking stays confirmed.</p>
      <Input wrapperClassName="mt-4" label="Amount" prefix="$" inputMode="decimal" value={amount} hint={`Up to ${money(max, booking.currency, { exact: true })}`} error={cents > max ? 'More than the remaining paid balance.' : undefined} onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ''))} autoFocus />
      <Textarea wrapperClassName="mt-4" label="Note to the guest (optional)" value={note} onChange={(event) => setNote(event.target.value)} className="min-h-20" maxLength={500} />
    </Modal>
  );
}

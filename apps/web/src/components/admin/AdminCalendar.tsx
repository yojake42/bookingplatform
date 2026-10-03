import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { format, parseISO } from 'date-fns';
import { Ban, CalendarPlus, ChevronLeft, ChevronRight, Lock, MousePointerClick, Unlock, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../lib/api';
import { addDaysIso, addMonthsIso, monthGrid, monthKey, todayInZone } from '../../lib/calendar';
import { longDate, money, plural } from '../../lib/format';
import { useMediaQuery } from '../../lib/hooks';
import type { AdminListing, CalendarHold, StaffBookingDetail } from '../../lib/types';
import { Button, Card, ConfirmDialog, Input, Textarea } from '../ui';

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type Selection = { first: string; last: string | null };

export function AdminCalendar({ listing }: { listing: AdminListing }) {
  const queryClient = useQueryClient();
  const wide = useMediaQuery('(min-width: 1280px)');
  const monthsShown = wide ? 2 : 1;
  // The home's own date: a night that has started there can't be blocked or booked.
  const today = todayInZone(listing.timeZone);
  const [viewMonth, setViewMonth] = useState(`${monthKey(today)}-01`);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [activeHold, setActiveHold] = useState<CalendarHold | null>(null);

  const from = viewMonth;
  const to = addMonthsIso(viewMonth, monthsShown);
  const holds = useQuery({
    queryKey: ['admin', 'calendar', listing.id, from, to],
    queryFn: () => api<CalendarHold[]>(`/admin/listings/${listing.id}/calendar`, { query: { from, to } }),
    placeholderData: (previous) => previous,
  });

  const nightOwner = useMemo(() => {
    const map = new Map<string, CalendarHold>();
    for (const hold of holds.data ?? []) {
      for (let day = hold.startDate; day < hold.endDate; day = addDaysIso(day, 1)) map.set(day, hold);
    }
    return map;
  }, [holds.data]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'calendar', listing.id] });
    queryClient.invalidateQueries({ queryKey: ['availability', listing.id] });
  };

  // Selection covers nights `first`..`last` inclusive; the API wants an exclusive end date.
  const range = selection?.last ? ordered(selection.first, selection.last) : null;
  const preview = selection && !selection.last && hovered ? ordered(selection.first, hovered) : null;
  const shown = range ?? preview;
  const rangeIsFree = range ? !Array.from(nightsIn(range[0], range[1])).some((night) => nightOwner.has(night)) : false;

  const onDayClick = (day: string) => {
    const hold = nightOwner.get(day);
    if (hold) {
      setSelection(null);
      setActiveHold(hold);
      return;
    }
    setActiveHold(null);
    if (!selection || selection.last) setSelection({ first: day, last: null });
    else setSelection({ ...selection, last: day });
  };

  const months = Array.from({ length: monthsShown }, (_, index) => addMonthsIso(viewMonth, index));

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <Card className="p-5 sm:p-6">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Previous month" onClick={() => setViewMonth(addMonthsIso(viewMonth, -1))} className="flex size-9 items-center justify-center rounded-full hover:bg-ink-100">
              <ChevronLeft className="size-4" />
            </button>
            <button type="button" aria-label="Next month" onClick={() => setViewMonth(addMonthsIso(viewMonth, 1))} className="flex size-9 items-center justify-center rounded-full hover:bg-ink-100">
              <ChevronRight className="size-4" />
            </button>
            <button type="button" onClick={() => setViewMonth(`${monthKey(today)}-01`)} className="ml-1 rounded-lg px-3 py-1.5 text-sm font-semibold hover:bg-ink-100">
              Today
            </button>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium text-ink-600">
            <Legend className="bg-sky-500" label="Booked" />
            <Legend className="bg-amber-400" label="Awaiting payment" />
            <Legend className="bg-[repeating-linear-gradient(135deg,var(--color-ink-300)_0_3px,var(--color-ink-100)_3px_6px)]" label="Blocked" />
            <Legend className="bg-white ring-1 ring-ink-300" label="Available" />
          </div>
        </div>

        <div className={clsx('grid gap-8', monthsShown === 2 && 'lg:grid-cols-2')} onMouseLeave={() => setHovered(null)}>
          {months.map((month) => (
            <div key={month}>
              <div className="mb-3 text-[15px] font-semibold">{format(parseISO(month), 'MMMM yyyy')}</div>
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
                {weekdays.map((day) => <div key={day} className="pb-1">{day}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {monthGrid(month).map((day, index) => {
                  if (!day) return <div key={`blank-${index}`} />;
                  const hold = nightOwner.get(day);
                  const past = day < today;
                  const inSelection = shown ? day >= shown[0] && day <= shown[1] : false;
                  const startsHere = hold && (hold.startDate === day || index % 7 === 0 || day.endsWith('-01'));
                  const isActive = hold && activeHold?.id === hold.id;
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => onDayClick(day)}
                      onMouseEnter={() => setHovered(day)}
                      disabled={past && !hold}
                      className={clsx(
                        'relative flex h-[68px] flex-col items-start rounded-lg p-1.5 text-left text-xs transition',
                        hold?.kind === 'BOOKING' && hold.booking?.status !== 'PENDING_PAYMENT' && (isActive ? 'bg-sky-600 text-white' : 'bg-sky-500 text-white hover:bg-sky-600'),
                        hold?.kind === 'BOOKING' && hold.booking?.status === 'PENDING_PAYMENT' && (isActive ? 'bg-amber-500 text-white' : 'bg-amber-400 text-amber-950 hover:bg-amber-500'),
                        hold?.kind === 'BLOCK' && 'bg-[repeating-linear-gradient(135deg,var(--color-ink-200)_0_4px,var(--color-ink-50)_4px_8px)] text-ink-700 hover:brightness-95',
                        hold?.kind === 'BLOCK' && isActive && 'ring-2 ring-ink-900',
                        !hold && !past && 'bg-white ring-1 ring-ink-200 hover:ring-ink-900',
                        !hold && past && 'cursor-not-allowed bg-ink-50 text-ink-300',
                        inSelection && !hold && 'bg-ink-900! text-white ring-ink-900',
                        hold && past && 'opacity-60',
                      )}
                    >
                      <span className={clsx('font-semibold', day === today && !hold && !inSelection && 'flex size-5 items-center justify-center rounded-full bg-brand-600 text-white')}>{Number(day.slice(8))}</span>
                      {startsHere && (
                        <span className="mt-auto w-full truncate text-[11px] leading-tight font-semibold">
                          {hold.kind === 'BOOKING' ? hold.booking?.guestName : hold.note || 'Blocked'}
                        </span>
                      )}
                      {!hold && !past && listing.nightlyPrice > 0 && !inSelection && (
                        <span className="mt-auto text-[11px] text-ink-400">{money(listing.nightlyPrice, listing.currency)}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="space-y-4">
        {activeHold ? (
          <HoldPanel hold={activeHold} timeZone={listing.timeZone} onClose={() => setActiveHold(null)} onChanged={() => { setActiveHold(null); refresh(); }} />
        ) : range ? (
          <SelectionPanel
            listing={listing}
            first={range[0]}
            last={range[1]}
            free={rangeIsFree}
            onClear={() => setSelection(null)}
            onDone={() => {
              setSelection(null);
              refresh();
            }}
          />
        ) : (
          <Card className="p-6">
            <div className="flex size-11 items-center justify-center rounded-xl bg-ink-100"><MousePointerClick className="size-5" /></div>
            <h3 className="mt-4 font-semibold">Manage availability</h3>
            <p className="mt-1 text-sm leading-relaxed text-ink-500">
              {selection ? 'Now click the last night of the range.' : 'Click the first night, then the last night, to block dates or add a booking. Click a booking or block to see details.'}
            </p>
            <p className="mt-4 rounded-xl bg-ink-50 p-3 text-xs leading-relaxed text-ink-600">
              Bookings always hold their nights and blocks can never overlap them; the database rejects any overlap, even from simultaneous requests.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="hidden items-center gap-1.5 sm:flex">
      <span className={clsx('size-3 rounded', className)} /> {label}
    </span>
  );
}

function ordered(a: string, b: string): [string, string] {
  return a <= b ? [a, b] : [b, a];
}

function* nightsIn(first: string, last: string) {
  for (let day = first; day <= last; day = addDaysIso(day, 1)) yield day;
}

function SelectionPanel({ listing, first, last, free, onClear, onDone }: { listing: AdminListing; first: string; last: string; free: boolean; onClear: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<'block' | 'booking'>('block');
  const [note, setNote] = useState('');
  const [guest, setGuest] = useState({ guestName: '', guestEmail: '', guestPhone: '', guests: 2 });
  const end = addDaysIso(last, 1);
  const nights = Array.from(nightsIn(first, last)).length;

  const block = useMutation({
    mutationFn: () => api(`/admin/listings/${listing.id}/blocks`, { method: 'POST', body: { startDate: first, endDate: end, note } }),
    onSuccess: () => {
      toast.success(`Blocked ${plural(nights, 'night')}`);
      onDone();
    },
    onError: (error) => toast.error(error.message),
  });
  const book = useMutation({
    mutationFn: () =>
      api<StaffBookingDetail>('/admin/bookings', {
        method: 'POST',
        body: { listingId: listing.id, checkIn: first, checkOut: end, ...guest, guests: Math.min(guest.guests, listing.maxGuests), idempotencyKey: crypto.randomUUID() },
      }),
    onSuccess: (booking) => {
      toast.success(`Booking ${booking.code} created`);
      onDone();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <Card className="animate-pop-in p-6">
      <div className="text-xs font-semibold tracking-wide text-ink-500 uppercase">{plural(nights, 'night')} selected</div>
      <div className="mt-1 font-semibold">{longDate(first)}</div>
      <div className="text-sm text-ink-500">to checkout {longDate(end)}</div>

      {!free ? (
        <p className="mt-4 rounded-xl bg-brand-50 p-3 text-sm text-brand-800">This range overlaps an existing booking or block. Choose only open nights.</p>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-ink-100 p-1">
            {(['block', 'booking'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={clsx('rounded-lg py-1.5 text-sm font-semibold transition', mode === value ? 'bg-white shadow-ring' : 'text-ink-500')}
              >
                {value === 'block' ? 'Block dates' : 'Add booking'}
              </button>
            ))}
          </div>
          {mode === 'block' ? (
            <div className="mt-4 space-y-3">
              <Textarea label="Note (staff only)" placeholder="e.g. Owner stay, maintenance" value={note} onChange={(event) => setNote(event.target.value)} className="min-h-20" maxLength={300} />
              <Button className="w-full" icon={<Lock className="size-4" />} loading={block.isPending} onClick={() => block.mutate()}>
                Block {plural(nights, 'night')}
              </Button>
            </div>
          ) : (
            <form
              className="mt-4 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                book.mutate();
              }}
            >
              <Input label="Guest name" required value={guest.guestName} onChange={(event) => setGuest({ ...guest, guestName: event.target.value })} />
              <Input label="Guest email" type="email" required value={guest.guestEmail} onChange={(event) => setGuest({ ...guest, guestEmail: event.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Phone" value={guest.guestPhone} onChange={(event) => setGuest({ ...guest, guestPhone: event.target.value })} />
                <Input label="Guests" type="number" min={1} max={listing.maxGuests} value={guest.guests} onChange={(event) => setGuest({ ...guest, guests: Number(event.target.value) || 1 })} />
              </div>
              <p className="text-xs text-ink-500">
                Total {money(listing.nightlyPrice * nights + listing.cleaningFee, listing.currency)} · staff bookings may bend minimum-night rules.
              </p>
              <Button type="submit" className="w-full" icon={<CalendarPlus className="size-4" />} loading={book.isPending}>
                Create booking
              </Button>
            </form>
          )}
        </>
      )}
      <button type="button" onClick={onClear} className="mt-4 w-full text-center text-sm font-semibold text-ink-500 hover:text-ink-900">
        Clear selection
      </button>
    </Card>
  );
}

function HoldPanel({ hold, timeZone, onClose, onChanged }: { hold: CalendarHold; timeZone: string; onClose: () => void; onChanged: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const unblock = useMutation({
    mutationFn: () => api(`/admin/blocks/${hold.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Dates released');
      onChanged();
    },
    onError: (error) => toast.error(error.message),
  });
  const cancel = useMutation({
    mutationFn: () => api(`/admin/bookings/${hold.booking!.id}/cancel`, { method: 'POST', body: { reason: 'Cancelled from calendar' } }),
    onSuccess: () => {
      toast.success('Booking cancelled and dates released');
      setConfirming(false);
      onChanged();
    },
    onError: (error) => toast.error(error.message),
  });
  const nights = Array.from(nightsIn(hold.startDate, addDaysIso(hold.endDate, -1))).length;

  return (
    <Card className="animate-pop-in p-6">
      <div className="flex items-start justify-between">
        <div className={clsx('flex size-11 items-center justify-center rounded-xl', hold.kind === 'BOOKING' ? 'bg-sky-100 text-sky-700' : 'bg-ink-100 text-ink-700')}>
          {hold.kind === 'BOOKING' ? <UserRound className="size-5" /> : <Ban className="size-5" />}
        </div>
        <button type="button" onClick={onClose} className="text-sm font-semibold text-ink-500 hover:text-ink-900">Close</button>
      </div>
      <h3 className="mt-4 text-lg font-semibold">{hold.kind === 'BOOKING' ? hold.booking?.guestName : 'Blocked dates'}</h3>
      <p className="text-sm text-ink-500">
        {longDate(hold.startDate)} → {longDate(hold.endDate)} · {plural(nights, 'night')}
      </p>
      {hold.kind === 'BOOKING' && hold.booking ? (
        <>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-ink-500">Code</dt><dd className="font-mono font-semibold">{hold.booking.code}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-500">Guests</dt><dd>{hold.booking.guests}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-500">Total</dt><dd>{money(hold.booking.totalPrice, hold.booking.currency)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-500">Source</dt><dd className="capitalize">{hold.booking.source.toLowerCase()}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-500">Status</dt><dd>{hold.booking.status === 'PENDING_PAYMENT' ? 'Awaiting payment' : 'Confirmed'}</dd></div>
          </dl>
          <div className="mt-5 flex flex-col gap-2">
            <Link to={`/admin/bookings?booking=${hold.booking.id}`}><Button variant="secondary" className="w-full">Open booking</Button></Link>
            {hold.endDate > todayInZone(timeZone) && (
              <Button variant="danger" onClick={() => setConfirming(true)}>{hold.booking.status === 'PENDING_PAYMENT' ? 'Release dates' : 'Cancel booking'}</Button>
            )}
          </div>
        </>
      ) : (
        <>
          {hold.note && <p className="mt-4 rounded-xl bg-ink-50 p-3 text-sm">{hold.note}</p>}
          {hold.createdBy && <p className="mt-2 text-xs text-ink-500">Blocked by {hold.createdBy}</p>}
          <Button className="mt-5 w-full" variant="secondary" icon={<Unlock className="size-4" />} loading={unblock.isPending} onClick={() => unblock.mutate()}>
            Unblock dates
          </Button>
        </>
      )}
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => cancel.mutate()}
        loading={cancel.isPending}
        title="Cancel this booking?"
        description="The guest's nights will be released immediately and become bookable again."
        confirmLabel="Cancel booking"
        destructive
      />
    </Card>
  );
}

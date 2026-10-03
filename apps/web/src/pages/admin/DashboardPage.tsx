import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { ArrowRight, BedDouble, CalendarClock, DoorOpen, Home, Plus, TrendingUp } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { api } from '../../lib/api';
import { dateRangeLabel, money, plural } from '../../lib/format';
import { useDocumentTitle } from '../../lib/hooks';
import type { Dashboard, StaffBooking } from '../../lib/types';
import { AdminPage } from '../../components/layout';
import { Avatar, Badge, Button, Card, Skeleton } from '../../components/ui';

export function DashboardPage() {
  const { user } = useAuth();
  const dashboard = useQuery({ queryKey: ['admin', 'dashboard'], queryFn: () => api<Dashboard>('/admin/dashboard') });
  useDocumentTitle('Dashboard');
  const data = dashboard.data;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <AdminPage
      title={`${greeting}, ${user?.name.split(' ')[0] ?? ''}`}
      description={format(new Date(), 'EEEE, MMMM d')}
      actions={
        <Link to="/admin/listings?new=1">
          <Button icon={<Plus className="size-4" />}>New listing</Button>
        </Link>
      }
    >
      {!data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-32" />)}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat icon={<BedDouble className="size-5" />} label="Guests staying now" value={data.guestsStayingNow} detail={`${plural(data.departingToday, 'checkout')} today`} />
            <Stat icon={<CalendarClock className="size-5" />} label="Upcoming bookings" value={data.upcomingBookings} detail={`${plural(data.arrivals.length, 'arrival')} this week${data.pendingPayments ? ` · ${data.pendingPayments} awaiting payment` : ''}`} />
            <Stat
              icon={<TrendingUp className="size-5" />}
              label="Occupancy, next 30 days"
              value={`${Math.round(data.occupancyNext30 * 100)}%`}
              detail={`${plural(data.bookedNightsNext30, 'booked night')}`}
              meter={data.occupancyNext30}
            />
            <Stat
              icon={<Home className="size-5" />}
              label="Published listings"
              value={data.listings.published}
              detail={data.listings.drafts ? `${plural(data.listings.drafts, 'draft')} in progress` : 'No drafts'}
            />
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <Card className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 font-semibold"><DoorOpen className="size-5" /> Arriving in the next 7 days</h2>
                <Link to="/admin/bookings" className="text-sm font-semibold text-ink-500 hover:text-ink-900">All bookings</Link>
              </div>
              {data.arrivals.length ? (
                <div className="divide-y divide-ink-100">
                  {data.arrivals.map((booking) => <BookingRow key={booking.id} booking={booking} showArrival />)}
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-ink-500">No arrivals this week.</p>
              )}
            </Card>
            <Card className="p-6">
              <h2 className="mb-4 font-semibold">Recent bookings</h2>
              <div className="divide-y divide-ink-100">
                {data.recent.map((booking) => <BookingRow key={booking.id} booking={booking} />)}
              </div>
              {data.revenueNext30.length > 0 && (
                <div className="mt-4 rounded-xl bg-ink-50 p-4 text-sm">
                  <div className="text-ink-500">Booked revenue, arrivals in next 30 days</div>
                  <div className="mt-1 text-xl font-bold">{data.revenueNext30.map((row) => money(row.total, row.currency)).join(' + ')}</div>
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </AdminPage>
  );
}

function Stat({ icon, label, value, detail, meter }: { icon: React.ReactNode; label: string; value: React.ReactNode; detail: string; meter?: number }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-sm font-medium text-ink-500">
        <span className="flex size-8 items-center justify-center rounded-lg bg-ink-100 text-ink-700">{icon}</span>
        {label}
      </div>
      <div className="display mt-4 text-[40px] leading-none tabular-nums">{value}</div>
      {meter !== undefined && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-100">
          <div className="h-full rounded-full bg-ink-900 transition-all duration-700" style={{ width: `${Math.min(100, meter * 100)}%` }} />
        </div>
      )}
      <div className="mt-1.5 text-sm text-ink-500">{detail}</div>
    </Card>
  );
}

function BookingRow({ booking, showArrival }: { booking: StaffBooking; showArrival?: boolean }) {
  return (
    <Link to={`/admin/bookings?booking=${booking.id}`} className="group -mx-2 flex items-center gap-3 rounded-xl px-2 py-3 transition hover:bg-ink-50">
      <Avatar name={booking.guestName} className="size-10 text-xs" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{booking.guestName}</span>
          {booking.status === 'CANCELLED' && <Badge tone="red">Cancelled</Badge>}
          {booking.status === 'PENDING_PAYMENT' && <Badge tone="amber">Awaiting payment</Badge>}
        </div>
        <div className="truncate text-sm text-ink-500">{booking.listing?.title}</div>
      </div>
      <div className="shrink-0 text-right text-sm">
        <div className="font-medium">{showArrival ? format(parseISO(booking.checkIn), 'EEE, MMM d') : dateRangeLabel(booking.checkIn, booking.checkOut)}</div>
        <div className="text-ink-500">{showArrival ? plural(booking.nights, 'night') : money(booking.totalPrice, booking.currency)}</div>
      </div>
      <ArrowRight className="size-4 shrink-0 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-ink-900" />
    </Link>
  );
}


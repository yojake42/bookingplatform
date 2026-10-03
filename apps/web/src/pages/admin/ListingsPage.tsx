import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { formatDistanceToNow } from 'date-fns';
import { CalendarCheck2, Home, ImageOff, Plus, Search, Star } from 'lucide-react';
import { api } from '../../lib/api';
import { money, rating } from '../../lib/format';
import { useDocumentTitle } from '../../lib/hooks';
import type { AdminListing, AdminListingSummary, ListingStatus } from '../../lib/types';
import { AdminPage } from '../../components/layout';
import { Badge, Button, EmptyState, Input, Modal, Segmented, Skeleton } from '../../components/ui';

const statusTone: Record<ListingStatus, 'green' | 'amber' | 'neutral'> = { PUBLISHED: 'green', DRAFT: 'amber', ARCHIVED: 'neutral' };

export function ListingsPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | ListingStatus>('all');
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const creating = params.get('new') === '1';
  useDocumentTitle('Listings');

  const listings = useQuery({ queryKey: ['admin', 'listings'], queryFn: () => api<AdminListingSummary[]>('/admin/listings') });
  const create = useMutation({
    mutationFn: () => api<AdminListing>('/admin/listings', { method: 'POST', body: { title } }),
    onSuccess: (listing) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'listings'] });
      navigate(`/admin/listings/${listing.id}?tab=details`);
    },
  });

  useEffect(() => {
    if (creating) setTitle('');
  }, [creating]);

  const visible = useMemo(() => {
    const term = text.trim().toLowerCase();
    return (listings.data ?? []).filter(
      (listing) =>
        (filter === 'all' || listing.status === filter) &&
        (!term || [listing.title, listing.city, listing.region].some((value) => value.toLowerCase().includes(term))),
    );
  }, [listings.data, filter, text]);

  const counts = (listings.data ?? []).reduce<Record<string, number>>((acc, listing) => ({ ...acc, [listing.status]: (acc[listing.status] ?? 0) + 1 }), {});

  return (
    <AdminPage
      title="Listings"
      description="Every home in the collection, published or not."
      actions={<Button icon={<Plus className="size-4" />} onClick={() => setParams({ new: '1' })}>New listing</Button>}
    >
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: `All ${listings.data?.length ?? ''}` },
            { value: 'PUBLISHED', label: `Published ${counts.PUBLISHED ?? 0}` },
            { value: 'DRAFT', label: `Drafts ${counts.DRAFT ?? 0}` },
            { value: 'ARCHIVED', label: `Archived ${counts.ARCHIVED ?? 0}` },
          ]}
        />
        <Input prefix={<Search className="size-4" />} placeholder="Search listings" value={text} onChange={(event) => setText(event.target.value)} wrapperClassName="sm:w-72" />
      </div>

      {listings.isPending ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-72" />)}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Home className="size-6" />}
          title={listings.data?.length ? 'No listings match' : 'No listings yet'}
          description={listings.data?.length ? 'Try a different filter or search.' : 'Create your first listing to start taking bookings.'}
          action={!listings.data?.length && <Button icon={<Plus className="size-4" />} onClick={() => setParams({ new: '1' })}>New listing</Button>}
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((listing) => (
            <Link key={listing.id} to={`/admin/listings/${listing.id}`} className="group overflow-hidden rounded-2xl bg-white ring-1 ring-ink-200/70 transition hover:-translate-y-0.5 hover:shadow-card">
              <div className="relative aspect-[16/10] bg-ink-100">
                {listing.coverUrl ? (
                  <img src={listing.coverUrl} alt="" className={clsx('h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]', listing.status === 'ARCHIVED' && 'grayscale')} />
                ) : (
                  <div className="flex h-full items-center justify-center text-ink-300"><ImageOff className="size-8" /></div>
                )}
                <Badge tone={statusTone[listing.status]} className="absolute top-3 left-3 bg-white! capitalize shadow-sm">{listing.status.toLowerCase()}</Badge>
              </div>
              <div className="p-4">
                <div className="truncate font-semibold">{listing.title}</div>
                <div className="truncate text-sm text-ink-500">{[listing.propertyType, [listing.city, listing.region].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || 'No location yet'}</div>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span><b>{money(listing.nightlyPrice, listing.currency)}</b> <span className="text-ink-500">/ night</span></span>
                  <span className="flex items-center gap-3 text-ink-500">
                    {listing.ratingAverage != null && <span className="flex items-center gap-1"><Star className="size-3.5 fill-ink-900 text-ink-900" />{rating(listing.ratingAverage)}</span>}
                    <span className="flex items-center gap-1" title="Upcoming bookings"><CalendarCheck2 className="size-3.5" />{listing.upcomingBookings}</span>
                  </span>
                </div>
                <div className="mt-2 text-xs text-ink-400">Updated {formatDistanceToNow(new Date(listing.updatedAt), { addSuffix: true })}</div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <Modal open={creating} onClose={() => setParams({})} title="New listing" size="sm">
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            create.mutate();
          }}
          className="space-y-4"
        >
          <p className="text-[15px] text-ink-500">Start with a name. You'll add photos, location, pricing and everything else next — it stays a draft until you publish.</p>
          <Input label="Listing title" placeholder="e.g. Lakeside cabin with sauna" value={title} onChange={(event) => setTitle(event.target.value)} autoFocus minLength={3} maxLength={120} required />
          {create.isError && <p className="text-sm text-danger-700">{create.error.message}</p>}
          <Button type="submit" size="lg" className="w-full" loading={create.isPending} disabled={title.trim().length < 3}>
            Create draft
          </Button>
        </form>
      </Modal>
    </AdminPage>
  );
}

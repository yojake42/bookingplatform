import { useEffect, useMemo, useState } from 'react';
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { format } from 'date-fns';
import { Archive, ArrowLeft, CalendarDays, Check, ExternalLink, Eye, EyeOff, FileText, ImageIcon, MapPin, MoreHorizontal, Receipt, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '../../lib/api';
import { amenities, amenityGroups, propertyTypes } from '../../lib/amenities';
import { cancellationPolicies } from '../../lib/format';
import { useClickOutside, useDocumentTitle } from '../../lib/hooks';
import type { AdminListing, AdminReview, CancellationPolicy, ListingStatus, Media } from '../../lib/types';
import { AdminCalendar } from '../../components/admin/AdminCalendar';
import { LocationEditor, type LocationValue } from '../../components/admin/LocationEditor';
import { MediaManager } from '../../components/admin/MediaManager';
import { Badge, Button, Card, ConfirmDialog, Counter, Input, Select, Skeleton, Stars, Textarea } from '../../components/ui';

type Draft = Omit<AdminListing, 'id' | 'media' | 'host' | 'ratingAverage' | 'ratingCount' | 'publishedAt' | 'createdAt' | 'updatedAt' | 'publicLocation' | 'status'>;

const editableKeys: (keyof Draft)[] = [
  'title', 'summary', 'description', 'propertyType', 'maxGuests', 'bedrooms', 'beds', 'bathrooms', 'amenities',
  'nightlyPrice', 'cleaningFee', 'currency', 'minNights', 'maxNights', 'checkInTime', 'checkOutTime', 'houseRules', 'cancellationPolicy',
  'addressLine1', 'addressLine2', 'city', 'region', 'postalCode', 'country', 'latitude', 'longitude', 'locationPrecision', 'locationDescription', 'timeZone', 'hostId',
];

function toDraft(listing: AdminListing): Draft {
  return Object.fromEntries(editableKeys.map((key) => [key, listing[key]])) as Draft;
}

const tabs = [
  { id: 'details', label: 'Details', icon: FileText },
  { id: 'photos', label: 'Photos & video', icon: ImageIcon },
  { id: 'location', label: 'Location', icon: MapPin },
  { id: 'pricing', label: 'Pricing & rules', icon: Receipt },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'reviews', label: 'Reviews', icon: Star },
] as const;
type TabId = (typeof tabs)[number]['id'];

const statusTone: Record<ListingStatus, 'green' | 'amber' | 'neutral'> = { PUBLISHED: 'green', DRAFT: 'amber', ARCHIVED: 'neutral' };

export function ListingEditorPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = (tabs.find((item) => item.id === params.get('tab'))?.id ?? 'details') as TabId;
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const listing = useQuery({ queryKey: ['admin', 'listing', id], queryFn: () => api<AdminListing>(`/admin/listings/${id}`) });
  const staff = useQuery({ queryKey: ['admin', 'staff'], queryFn: () => api<{ id: string; name: string }[]>('/admin/staff') });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errorFields, setErrorFields] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useDocumentTitle(listing.data?.title ?? 'Listing');

  useEffect(() => {
    if (listing.data && !draft) setDraft(toDraft(listing.data));
  }, [listing.data, draft]);

  const baseline = useMemo(() => (listing.data ? toDraft(listing.data) : null), [listing.data]);
  const dirtyKeys = useMemo(
    () => (draft && baseline ? editableKeys.filter((key) => JSON.stringify(draft[key]) !== JSON.stringify(baseline[key])) : []),
    [draft, baseline],
  );
  const dirty = dirtyKeys.length > 0;

  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty]);

  const setListing = (data: AdminListing) => {
    queryClient.setQueryData(['admin', 'listing', id], data);
    queryClient.invalidateQueries({ queryKey: ['admin', 'listings'] });
    queryClient.invalidateQueries({ queryKey: ['listing', id] });
    queryClient.invalidateQueries({ queryKey: ['search'] });
  };

  const save = useMutation({
    mutationFn: (extra: { status?: ListingStatus } = {}) => {
      const changes = Object.fromEntries(dirtyKeys.map((key) => [key, draft![key]]));
      return api<AdminListing>(`/admin/listings/${id}`, { method: 'PATCH', body: { ...changes, ...extra } });
    },
    onSuccess: (data, extra) => {
      setListing(data);
      setDraft(toDraft(data));
      setErrorFields([]);
      toast.success(extra.status === 'PUBLISHED' ? 'Listing published' : extra.status === 'DRAFT' ? 'Listing unpublished' : extra.status === 'ARCHIVED' ? 'Listing archived' : 'Changes saved');
    },
    onError: (error) => {
      if (error instanceof ApiError) setErrorFields(error.fields);
      toast.error(error.message);
    },
  });

  const remove = useMutation({
    mutationFn: () => api(`/admin/listings/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'listings'] });
      toast.success('Listing deleted');
      navigate('/admin/listings');
    },
    onError: (error) => {
      setConfirmDelete(false);
      toast.error(error.message);
    },
  });

  if (listing.isError) {
    return <div className="p-10 text-center text-ink-500">{listing.error.message}</div>;
  }
  if (!listing.data || !draft) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 px-8 py-10">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-12" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const data = listing.data;
  const update = (patch: Partial<Draft>) => setDraft((current) => ({ ...current!, ...patch }));
  const fieldError = (key: string) => (errorFields.includes(key) ? 'Check this value' : undefined);
  const photoCount = data.media.filter((media) => media.kind === 'IMAGE' && media.status === 'READY').length;

  return (
    <div className="pb-28">
      <div className="border-b border-ink-200/70 bg-white">
        <div className="mx-auto max-w-6xl px-4 pt-6 md:px-8">
          <Link to="/admin/listings" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-900">
            <ArrowLeft className="size-4" /> All listings
          </Link>
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="size-14 shrink-0 overflow-hidden rounded-xl bg-ink-100">
                {data.media.find((media) => media.kind === 'IMAGE') && <img src={data.media.find((media) => media.kind === 'IMAGE')!.thumbUrl} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="truncate text-2xl font-bold tracking-tight">{data.title}</h1>
                  <Badge tone={statusTone[data.status]} className="capitalize">{data.status.toLowerCase()}</Badge>
                </div>
                <p className="text-sm text-ink-500">
                  {[data.city, data.region].filter(Boolean).join(', ') || 'No location yet'} · Updated {format(new Date(data.updatedAt), 'MMM d, h:mm a')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {data.status === 'PUBLISHED' && (
                <a href={`/listings/${data.id}`} target="_blank" rel="noreferrer">
                  <Button variant="secondary" icon={<ExternalLink className="size-4" />}>View</Button>
                </a>
              )}
              {data.status === 'PUBLISHED' ? (
                <Button variant="secondary" icon={<EyeOff className="size-4" />} loading={save.isPending && save.variables?.status === 'DRAFT'} onClick={() => save.mutate({ status: 'DRAFT' })}>
                  Unpublish
                </Button>
              ) : (
                <Button variant="brand" icon={<Eye className="size-4" />} loading={save.isPending && save.variables?.status === 'PUBLISHED'} onClick={() => save.mutate({ status: 'PUBLISHED' })}>
                  {dirty ? 'Save & publish' : 'Publish'}
                </Button>
              )}
              <MoreMenu
                archived={data.status === 'ARCHIVED'}
                onArchive={() => save.mutate({ status: data.status === 'ARCHIVED' ? 'DRAFT' : 'ARCHIVED' })}
                onDelete={() => setConfirmDelete(true)}
              />
            </div>
          </div>
          <nav className="scrollbar-none -mb-px mt-6 flex gap-6 overflow-x-auto">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setParams({ tab: item.id }, { replace: true })}
                className={clsx(
                  'flex shrink-0 items-center gap-2 border-b-2 pb-3 text-sm font-semibold transition',
                  tab === item.id ? 'border-ink-900 text-ink-900' : 'border-transparent text-ink-500 hover:text-ink-900',
                )}
              >
                <item.icon className="size-4" />
                {item.label}
                {item.id === 'photos' && <span className="rounded-full bg-ink-100 px-1.5 text-xs text-ink-600">{data.media.length}</span>}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div key={tab} className="mx-auto max-w-6xl animate-fade-in px-4 py-8 md:px-8">
        {tab === 'details' && (
          <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
            <Card className="space-y-5 p-6">
              <Input label="Title" value={draft.title} maxLength={120} error={fieldError('title')} onChange={(event) => update({ title: event.target.value })} />
              <Input label="Tagline" hint="One line shown under the title in search and on the listing." value={draft.summary} maxLength={200} onChange={(event) => update({ summary: event.target.value })} />
              <Textarea label="Description" hint="What makes the place special. Line breaks are kept." value={draft.description} className="min-h-56" maxLength={10000} error={fieldError('description')} onChange={(event) => update({ description: event.target.value })} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Select label="Property type" value={draft.propertyType} onChange={(event) => update({ propertyType: event.target.value })}>
                  {propertyTypes.map((type) => <option key={type}>{type}</option>)}
                </Select>
                <Select label="Host shown to guests" value={draft.hostId ?? ''} onChange={(event) => update({ hostId: event.target.value || null })}>
                  <option value="">No host shown</option>
                  {staff.data?.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                </Select>
              </div>
            </Card>
            <Card className="h-fit p-6">
              <h3 className="font-semibold">Capacity</h3>
              <div className="mt-2 divide-y divide-ink-100">
                <Counter label="Guests" value={draft.maxGuests} min={1} max={50} onChange={(maxGuests) => update({ maxGuests })} />
                <Counter label="Bedrooms" value={draft.bedrooms} min={0} max={50} onChange={(bedrooms) => update({ bedrooms })} />
                <Counter label="Beds" value={draft.beds} min={0} max={100} onChange={(beds) => update({ beds })} />
                <Counter label="Bathrooms" value={draft.bathrooms} min={0} max={50} step={0.5} onChange={(bathrooms) => update({ bathrooms })} />
              </div>
            </Card>
            <Card className="p-6 lg:col-span-2">
              <div className="flex items-baseline justify-between">
                <h3 className="font-semibold">Amenities</h3>
                <span className="text-sm text-ink-500">{draft.amenities.length} selected</span>
              </div>
              <div className="mt-4 space-y-6">
                {amenityGroups.map((group) => (
                  <div key={group}>
                    <div className="mb-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">{group}</div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {amenities.filter((amenity) => amenity.group === group).map((amenity) => {
                        const on = draft.amenities.includes(amenity.key);
                        return (
                          <button
                            key={amenity.key}
                            type="button"
                            aria-pressed={on}
                            onClick={() => update({ amenities: on ? draft.amenities.filter((key) => key !== amenity.key) : [...draft.amenities, amenity.key] })}
                            className={clsx(
                              'flex items-center gap-3 rounded-xl px-3.5 py-3 text-left text-sm font-medium ring-1 transition active:scale-[0.98]',
                              on ? 'bg-ink-900 text-white ring-ink-900' : 'bg-white ring-ink-200 hover:ring-ink-400',
                            )}
                          >
                            <amenity.icon className="size-5 shrink-0 stroke-[1.5]" />
                            <span className="flex-1">{amenity.label}</span>
                            {on && <Check className="size-4" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {tab === 'photos' && (
          <Card className="p-6">
            <MediaManager
              listingId={data.id}
              media={data.media}
              onChange={(media: Media[]) => setListing({ ...queryClient.getQueryData<AdminListing>(['admin', 'listing', id])!, media })}
            />
            {photoCount === 0 && <p className="mt-4 text-sm text-ink-500">Add at least one photo before publishing.</p>}
          </Card>
        )}

        {tab === 'location' && (
          <Card className="p-6">
            <LocationEditor value={draft as LocationValue} onChange={(patch) => update(patch)} />
          </Card>
        )}

        {tab === 'pricing' && (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="space-y-5 p-6">
              <h3 className="font-semibold">Pricing</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <MoneyInput label="Nightly price" value={draft.nightlyPrice} onChange={(nightlyPrice) => update({ nightlyPrice })} error={fieldError('nightlyPrice')} />
                <MoneyInput label="Cleaning fee" value={draft.cleaningFee} onChange={(cleaningFee) => update({ cleaningFee })} />
              </div>
              <Select label="Currency" value={draft.currency} onChange={(event) => update({ currency: event.target.value })}>
                {['USD', 'CAD', 'EUR', 'GBP', 'AUD', 'MXN'].map((currency) => <option key={currency}>{currency}</option>)}
              </Select>
              <div className="rounded-xl bg-ink-50 p-4 text-sm text-ink-600">
                A 3-night stay costs guests <b className="text-ink-900">{new Intl.NumberFormat('en-US', { style: 'currency', currency: draft.currency }).format((draft.nightlyPrice * 3 + draft.cleaningFee) / 100)}</b> in total.
              </div>
            </Card>
            <Card className="space-y-5 p-6">
              <h3 className="font-semibold">Stay rules</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Minimum nights" type="number" min={1} max={365} value={draft.minNights} error={fieldError('minNights')} onChange={(event) => update({ minNights: Number(event.target.value) || 1 })} />
                <Input label="Maximum nights" type="number" min={1} max={365} value={draft.maxNights} error={fieldError('maxNights')} onChange={(event) => update({ maxNights: Number(event.target.value) || 1 })} />
                <Input label="Check-in after" type="time" value={draft.checkInTime} onChange={(event) => update({ checkInTime: event.target.value })} />
                <Input label="Checkout before" type="time" value={draft.checkOutTime} onChange={(event) => update({ checkOutTime: event.target.value })} />
              </div>
            </Card>
            <Card className="p-6">
              <h3 className="font-semibold">Cancellation policy</h3>
              <div className="mt-4 space-y-2">
                {(Object.keys(cancellationPolicies) as CancellationPolicy[]).map((policy) => (
                  <button
                    key={policy}
                    type="button"
                    onClick={() => update({ cancellationPolicy: policy })}
                    className={clsx('flex w-full items-start gap-3 rounded-xl p-4 text-left ring-1 transition', draft.cancellationPolicy === policy ? 'bg-ink-50 ring-2 ring-ink-900' : 'ring-ink-200 hover:ring-ink-400')}
                  >
                    <span className={clsx('mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2', draft.cancellationPolicy === policy ? 'border-ink-900' : 'border-ink-300')}>
                      {draft.cancellationPolicy === policy && <span className="size-2.5 rounded-full bg-ink-900" />}
                    </span>
                    <span>
                      <span className="block font-semibold">{cancellationPolicies[policy].label}</span>
                      <span className="text-sm text-ink-500">{cancellationPolicies[policy].description}</span>
                    </span>
                  </button>
                ))}
              </div>
            </Card>
            <Card className="p-6">
              <h3 className="font-semibold">House rules</h3>
              <Textarea wrapperClassName="mt-4" hint="One rule per line." value={draft.houseRules} className="min-h-48" onChange={(event) => update({ houseRules: event.target.value })} />
            </Card>
          </div>
        )}

        {tab === 'calendar' && <AdminCalendar listing={data} />}
        {tab === 'reviews' && <ListingReviews listingId={data.id} />}
      </div>

      {dirty && <SaveBar count={dirtyKeys.length} saving={save.isPending} onDiscard={() => setDraft(toDraft(data))} onSave={() => save.mutate({})} />}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => remove.mutate()}
        loading={remove.isPending}
        title="Delete this listing?"
        description="This permanently removes the listing, its photos and videos. Listings with booking history can only be archived."
        confirmLabel="Delete listing"
        destructive
      />
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onClose={() => blocker.reset?.()}
        onConfirm={() => blocker.proceed?.()}
        title="Discard unsaved changes?"
        description="You have changes on this listing that haven't been saved."
        confirmLabel="Discard"
        destructive
      />
    </div>
  );
}

function SaveBar({ count, saving, onDiscard, onSave }: { count: number; saving: boolean; onDiscard: () => void; onSave: () => void }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 animate-slide-up border-t border-ink-200 bg-white/95 backdrop-blur lg:left-64">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 md:px-8">
        <span className="flex items-center gap-2 text-sm font-medium">
          <span className="size-2 animate-pulse rounded-full bg-amber-500" />
          {count} unsaved {count === 1 ? 'change' : 'changes'}
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onDiscard} disabled={saving}>Discard</Button>
          <Button onClick={onSave} loading={saving}>Save changes</Button>
        </div>
      </div>
    </div>
  );
}

function MoreMenu({ archived, onArchive, onDelete }: { archived: boolean; onArchive: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false), open);
  return (
    <div ref={ref} className="relative">
      <Button variant="secondary" className="px-2.5!" aria-label="More actions" onClick={() => setOpen((value) => !value)}>
        <MoreHorizontal className="size-5" />
      </Button>
      {open && (
        <div className="absolute top-12 right-0 z-30 w-52 animate-pop-in overflow-hidden rounded-xl bg-white py-1.5 text-sm shadow-float ring-1 ring-black/5">
          <button type="button" className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left hover:bg-ink-50" onClick={() => { setOpen(false); onArchive(); }}>
            <Archive className="size-4" /> {archived ? 'Restore to draft' : 'Archive listing'}
          </button>
          <button type="button" className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-brand-700 hover:bg-ink-50" onClick={() => { setOpen(false); onDelete(); }}>
            <Trash2 className="size-4" /> Delete listing
          </button>
        </div>
      )}
    </div>
  );
}

/** Edits a minor-unit amount as a dollars string, committing on every valid keystroke. */
function MoneyInput({ label, value, onChange, error }: { label: string; value: number; onChange: (cents: number) => void; error?: string }) {
  const [text, setText] = useState((value / 100).toString());
  useEffect(() => {
    if (Math.round(Number(text) * 100) !== value) setText((value / 100).toString());
  }, [value]);
  return (
    <Input
      label={label}
      inputMode="decimal"
      prefix="$"
      value={text}
      error={error}
      onChange={(event) => {
        const next = event.target.value.replace(/[^\d.]/g, '');
        setText(next);
        const parsed = Number(next);
        if (next !== '' && Number.isFinite(parsed)) onChange(Math.round(parsed * 100));
      }}
    />
  );
}

function ListingReviews({ listingId }: { listingId: string }) {
  const queryClient = useQueryClient();
  const reviews = useQuery({ queryKey: ['admin', 'reviews', listingId], queryFn: () => api<AdminReview[]>('/admin/reviews', { query: { listingId } }) });
  const moderate = useMutation({
    mutationFn: ({ id, isHidden }: { id: string; isHidden: boolean }) => api(`/admin/reviews/${id}`, { method: 'PATCH', body: { isHidden } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'reviews'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'listing', listingId] });
      queryClient.invalidateQueries({ queryKey: ['reviews', listingId] });
    },
  });
  if (reviews.isPending) return <Skeleton className="h-40" />;
  if (!reviews.data?.length) return <Card className="p-10 text-center text-ink-500">No reviews yet. Guests can review after checkout from their booking page.</Card>;
  return (
    <div className="space-y-3">
      {reviews.data.map((review) => (
        <Card key={review.id} className={clsx('flex flex-col gap-4 p-5 sm:flex-row sm:items-start', review.isHidden && 'opacity-60')}>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <span className="font-semibold">{review.authorName}</span>
              <Stars value={review.rating} size="size-3.5" />
              <span className="text-sm text-ink-500">{format(new Date(review.createdAt), 'MMM d, yyyy')}</span>
              {review.isHidden && <Badge>Hidden</Badge>}
            </div>
            <p className="mt-2 text-[15px] text-ink-700">{review.comment}</p>
            {review.booking && <p className="mt-2 text-xs text-ink-500">Booking {review.booking.code}</p>}
          </div>
          <Button size="sm" variant="secondary" loading={moderate.isPending && moderate.variables?.id === review.id} onClick={() => moderate.mutate({ id: review.id, isHidden: !review.isHidden })}>
            {review.isHidden ? 'Show on listing' : 'Hide'}
          </Button>
        </Card>
      ))}
    </div>
  );
}

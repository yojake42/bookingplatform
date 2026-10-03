import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { format } from 'date-fns';
import { KeyRound, MessageSquareOff, ShieldCheck, Star, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../auth/AuthContext';
import { api } from '../../lib/api';
import { useDocumentTitle } from '../../lib/hooks';
import type { AdminReview, StaffUser, UserRole } from '../../lib/types';
import { AdminPage } from '../../components/layout';
import { Avatar, Badge, Button, Card, EmptyState, Input, Modal, Select, Skeleton, Stars } from '../../components/ui';

const passwordMin = 10;

// ---------------------------------------------------------------------------
// Account settings (password)
// ---------------------------------------------------------------------------

export function AccountPage() {
  const { user } = useAuth();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  useDocumentTitle('Account');
  const change = useMutation({
    mutationFn: () => api('/auth/change-password', { method: 'POST', body: { currentPassword: form.currentPassword, newPassword: form.newPassword } }),
    onSuccess: () => {
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
      toast.success('Password updated', { description: 'Other devices have been signed out.' });
    },
    onError: (error) => toast.error(error.message),
  });
  const mismatch = form.confirm.length > 0 && form.confirm !== form.newPassword;
  const strength = passwordStrength(form.newPassword);

  return (
    <AdminPage title="Account settings" description="Manage how you sign in.">
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card className="h-fit p-6">
          {user && (
            <div className="flex flex-col items-center text-center">
              <Avatar name={user.name} className="size-20 text-2xl" />
              <div className="mt-4 text-lg font-semibold">{user.name}</div>
              <div className="text-sm text-ink-500">{user.email}</div>
              <Badge tone="dark" className="mt-3 capitalize">{user.role.toLowerCase()}</Badge>
            </div>
          )}
        </Card>
        <Card className="p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><KeyRound className="size-5" /> Change password</h2>
          <p className="mt-1 text-sm text-ink-500">Changing your password signs you out everywhere else.</p>
          <form
            className="mt-6 max-w-md space-y-4"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              change.mutate();
            }}
          >
            <Input label="Current password" type="password" autoComplete="current-password" required value={form.currentPassword} onChange={(event) => setForm({ ...form, currentPassword: event.target.value })} />
            <div>
              <Input label="New password" type="password" autoComplete="new-password" required minLength={passwordMin} value={form.newPassword} onChange={(event) => setForm({ ...form, newPassword: event.target.value })} hint={`At least ${passwordMin} characters.`} />
              {form.newPassword && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex flex-1 gap-1">
                    {[0, 1, 2, 3].map((index) => (
                      <span key={index} className={clsx('h-1.5 flex-1 rounded-full transition-colors', index < strength.score ? strength.color : 'bg-ink-200')} />
                    ))}
                  </div>
                  <span className="w-16 text-right text-xs font-medium text-ink-600">{strength.label}</span>
                </div>
              )}
            </div>
            <Input label="Confirm new password" type="password" autoComplete="new-password" required value={form.confirm} error={mismatch ? "Passwords don't match." : undefined} onChange={(event) => setForm({ ...form, confirm: event.target.value })} />
            <Button type="submit" loading={change.isPending} disabled={mismatch || form.newPassword.length < passwordMin || !form.currentPassword}>
              Update password
            </Button>
          </form>
        </Card>
      </div>
    </AdminPage>
  );
}

function passwordStrength(password: string) {
  let score = 0;
  if (password.length >= passwordMin) score += 1;
  if (password.length >= 14) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score += 1;
  const levels = [
    { label: 'Too short', color: 'bg-brand-500' },
    { label: 'Weak', color: 'bg-brand-500' },
    { label: 'Fair', color: 'bg-amber-500' },
    { label: 'Good', color: 'bg-emerald-500' },
    { label: 'Strong', color: 'bg-emerald-600' },
  ];
  return { score, ...levels[password.length < passwordMin ? 0 : score] };
}

// ---------------------------------------------------------------------------
// Staff management (admins)
// ---------------------------------------------------------------------------

export function UsersPage() {
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [resetFor, setResetFor] = useState<StaffUser | null>(null);
  const [form, setForm] = useState({ name: '', email: '', role: 'MANAGER' as UserRole, password: '' });
  const [newPassword, setNewPassword] = useState('');
  useDocumentTitle('Staff');

  const users = useQuery({ queryKey: ['admin', 'users'], queryFn: () => api<StaffUser[]>('/admin/users') });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'staff'] });
  };
  const create = useMutation({
    mutationFn: () => api<StaffUser>('/admin/users', { method: 'POST', body: form }),
    onSuccess: (user) => {
      refresh();
      setAdding(false);
      setForm({ name: '', email: '', role: 'MANAGER', password: '' });
      toast.success(`${user.name} can now sign in`);
    },
    onError: (error) => toast.error(error.message),
  });
  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; role?: UserRole; isActive?: boolean }) => api<StaffUser>(`/admin/users/${id}`, { method: 'PATCH', body }),
    onSuccess: () => refresh(),
    onError: (error) => toast.error(error.message),
  });
  const reset = useMutation({
    mutationFn: () => api(`/admin/users/${resetFor!.id}/password`, { method: 'POST', body: { password: newPassword } }),
    onSuccess: () => {
      toast.success('Password reset', { description: 'Share it with them securely; they can change it in Account settings.' });
      setResetFor(null);
      setNewPassword('');
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <AdminPage
      title="Staff"
      description="People who can sign in and manage listings."
      actions={<Button icon={<UserPlus className="size-4" />} onClick={() => setAdding(true)}>Add staff</Button>}
    >
      <Card className="divide-y divide-ink-100">
        {users.isPending && <div className="p-4"><Skeleton className="h-40" /></div>}
        {users.data?.map((user) => (
          <div key={user.id} className={clsx('flex flex-col gap-4 p-5 sm:flex-row sm:items-center', !user.isActive && 'opacity-55')}>
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar name={user.name} className="size-10 text-xs" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold">{user.name}</span>
                  {user.id === me?.id && <Badge>You</Badge>}
                  {!user.isActive && <Badge tone="red">Deactivated</Badge>}
                </div>
                <div className="truncate text-sm text-ink-500">{user.email} · added {format(new Date(user.createdAt), 'MMM yyyy')}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Select
                aria-label="Role"
                value={user.role}
                disabled={user.id === me?.id}
                onChange={(event) => update.mutate({ id: user.id, role: event.target.value as UserRole })}
                className="h-9 py-0 text-sm"
              >
                <option value="MANAGER">Manager</option>
                <option value="ADMIN">Admin</option>
              </Select>
              <Button size="sm" variant="secondary" onClick={() => setResetFor(user)}>Reset password</Button>
              {user.id !== me?.id && (
                <Button size="sm" variant={user.isActive ? 'danger' : 'secondary'} onClick={() => update.mutate({ id: user.id, isActive: !user.isActive })}>
                  {user.isActive ? 'Deactivate' : 'Reactivate'}
                </Button>
              )}
            </div>
          </div>
        ))}
      </Card>
      <p className="mt-4 flex items-center gap-2 text-sm text-ink-500">
        <ShieldCheck className="size-4" /> Managers can edit listings, calendars and bookings. Admins can also manage staff.
      </p>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add staff member" size="sm">
        <form
          className="space-y-4"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <Input label="Name" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} autoFocus />
          <Input label="Email" type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          <Select label="Role" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as UserRole })}>
            <option value="MANAGER">Manager — listings & bookings</option>
            <option value="ADMIN">Admin — also manages staff</option>
          </Select>
          <Input label="Temporary password" type="text" required minLength={passwordMin} value={form.password} hint={`At least ${passwordMin} characters. They can change it after signing in.`} onChange={(event) => setForm({ ...form, password: event.target.value })} />
          <Button type="submit" className="w-full" size="lg" loading={create.isPending}>Add staff member</Button>
        </form>
      </Modal>

      <Modal open={resetFor !== null} onClose={() => setResetFor(null)} title={`Reset password for ${resetFor?.name ?? ''}`} size="sm">
        <form
          className="space-y-4"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            reset.mutate();
          }}
        >
          <p className="text-sm text-ink-500">They'll be signed out of all devices.</p>
          <Input label="New temporary password" required minLength={passwordMin} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoFocus />
          <Button type="submit" className="w-full" loading={reset.isPending}>Reset password</Button>
        </form>
      </Modal>
    </AdminPage>
  );
}

// ---------------------------------------------------------------------------
// Reviews moderation
// ---------------------------------------------------------------------------

export function ReviewsPage() {
  const queryClient = useQueryClient();
  useDocumentTitle('Reviews');
  const reviews = useQuery({ queryKey: ['admin', 'reviews', 'all'], queryFn: () => api<AdminReview[]>('/admin/reviews') });
  const moderate = useMutation({
    mutationFn: ({ id, isHidden }: { id: string; isHidden: boolean }) => api(`/admin/reviews/${id}`, { method: 'PATCH', body: { isHidden } }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'reviews'] });
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      toast.success(variables.isHidden ? 'Review hidden from the listing' : 'Review visible again');
    },
  });

  return (
    <AdminPage title="Reviews" description="Verified reviews from guests who completed a stay. Hide anything inappropriate.">
      {reviews.isPending ? (
        <Skeleton className="h-64" />
      ) : !reviews.data?.length ? (
        <EmptyState icon={<Star className="size-6" />} title="No reviews yet" description="Guests can review after checkout from their booking page." />
      ) : (
        <div className="space-y-3">
          {reviews.data.map((review) => (
            <Card key={review.id} className={clsx('flex flex-col gap-4 p-5 sm:flex-row sm:items-start', review.isHidden && 'bg-ink-50 opacity-70')}>
              <Avatar name={review.authorName} className="size-10 text-xs" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-semibold">{review.authorName}</span>
                  <Stars value={review.rating} size="size-3.5" />
                  <span className="text-sm text-ink-500">{format(new Date(review.createdAt), 'MMM d, yyyy')}</span>
                  {review.isHidden && <Badge><MessageSquareOff className="size-3" /> Hidden</Badge>}
                </div>
                <Link to={`/admin/listings/${review.listing.id}?tab=reviews`} className="text-sm text-ink-500 hover:underline">{review.listing.title}</Link>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-700">{review.comment}</p>
              </div>
              <Button size="sm" variant="secondary" loading={moderate.isPending && moderate.variables?.id === review.id} onClick={() => moderate.mutate({ id: review.id, isHidden: !review.isHidden })}>
                {review.isHidden ? 'Unhide' : 'Hide'}
              </Button>
            </Card>
          ))}
        </div>
      )}
    </AdminPage>
  );
}

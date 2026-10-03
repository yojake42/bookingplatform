import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { errorMessage } from '../lib/api';
import { useDocumentTitle } from '../lib/hooks';
import { Logo } from '../components/layout';
import { Button, Input } from '../components/ui';

export function LoginPage() {
  const { user, login, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useDocumentTitle('Staff sign in');

  const from = (location.state as { from?: string } | null)?.from ?? '/admin';
  if (!loading && user) return <Navigate to={from} replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (loginError) {
      setError(errorMessage(loginError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-pine-900 p-12 text-paper lg:flex">
        <Logo tone="paper" />
        <div className="arch mx-auto aspect-[4/5] w-full max-w-sm overflow-hidden shadow-float ring-8 ring-paper/5">
          <img src="https://images.unsplash.com/photo-1510798831971-661eb04b3739?w=1000&q=80" alt="" className="h-full w-full object-cover" />
        </div>
        <div>
          <p className="display text-[34px] leading-tight font-light">Every home, every calendar, <em className="text-brass-light">one place.</em></p>
          <p className="mt-3 text-paper/65">Listings, availability, bookings and payments for the Haven collection.</p>
        </div>
      </div>
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <div className="lg:hidden"><Logo /></div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <div className="mb-6 flex size-11 items-center justify-center rounded-lg border border-ink-300 text-pine-700">
            <Lock className="size-5" />
          </div>
          <p className="eyebrow">Staff console</p>
          <h1 className="display mt-2 text-[40px] leading-tight">Welcome back</h1>
          <p className="mt-2 text-ink-500">Sign in to look after listings, calendars and bookings.</p>
          <form onSubmit={submit} className="mt-8 animate-fade-in space-y-4">
            <Input label="Email" type="email" autoComplete="email" required autoFocus value={email} onChange={(event) => setEmail(event.target.value)} />
            <Input label="Password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
            {error && <p className="rounded-lg bg-danger-50 px-4 py-3 text-sm font-medium text-danger-800">{error}</p>}
            <Button type="submit" variant="brand" size="lg" className="w-full" loading={busy}>
              Sign in
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

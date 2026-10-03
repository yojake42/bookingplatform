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
      <div className="relative hidden overflow-hidden lg:block">
        <img src="https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1600&q=80" alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="absolute right-12 bottom-12 left-12 text-white">
          <p className="text-3xl leading-tight font-bold tracking-tight">Every home, every calendar, one place.</p>
          <p className="mt-3 text-white/80">Manage listings, availability and bookings for the Haven collection.</p>
        </div>
      </div>
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Logo />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <div className="mb-6 flex size-12 items-center justify-center rounded-2xl bg-ink-900 text-white">
            <Lock className="size-5" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Staff sign in</h1>
          <p className="mt-2 text-ink-500">Sign in to manage listings, calendars and bookings.</p>
          <form onSubmit={submit} className="mt-8 animate-fade-in space-y-4">
            <Input label="Email" type="email" autoComplete="email" required autoFocus value={email} onChange={(event) => setEmail(event.target.value)} />
            <Input label="Password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
            {error && <p className="rounded-xl bg-brand-50 px-4 py-3 text-sm font-medium text-brand-800">{error}</p>}
            <Button type="submit" size="lg" className="w-full" loading={busy}>
              Sign in
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

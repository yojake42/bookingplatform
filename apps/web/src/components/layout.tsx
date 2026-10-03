import { useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { CalendarCheck2, Home, LayoutDashboard, LogOut, Mail, Menu, Scale, Settings, ShieldCheck, Star, Users, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useClickOutside } from '../lib/hooks';
import { Avatar } from './ui';

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex shrink-0 items-center gap-2 text-brand-600" aria-label="Haven home">
      <svg viewBox="0 0 32 32" className="size-8">
        <rect width="32" height="32" rx="9" fill="currentColor" />
        <path d="M16 7.5 7.5 14.6V24.5h6.1v-5.7h4.8v5.7h6.1V14.6z" fill="#fff" />
      </svg>
      {!compact && <span className="text-[22px] font-extrabold tracking-tight">haven</span>}
    </Link>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false), open);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2.5 rounded-full py-1.5 pr-1.5 pl-3 ring-1 ring-ink-200 transition hover:shadow-[0_2px_8px_rgb(0_0_0/0.12)]"
        aria-label="Menu"
      >
        <Menu className="size-4" />
        {user ? <Avatar name={user.name} className="size-8 text-xs" /> : <span className="flex size-8 items-center justify-center rounded-full bg-ink-500 text-white"><Users className="size-4" /></span>}
      </button>
      {open && (
        <div className="absolute top-[calc(100%+8px)] right-0 z-50 w-60 animate-pop-in overflow-hidden rounded-2xl bg-white py-2 shadow-float ring-1 ring-black/5">
          {user ? (
            <>
              <div className="px-4 py-2">
                <div className="text-sm font-semibold">{user.name}</div>
                <div className="truncate text-xs text-ink-500">{user.email}</div>
              </div>
              <div className="my-1 h-px bg-ink-100" />
              <MenuLink to="/admin" onClick={() => setOpen(false)}>Staff console</MenuLink>
              <MenuLink to="/admin/account" onClick={() => setOpen(false)}>Account settings</MenuLink>
              <div className="my-1 h-px bg-ink-100" />
              <button
                type="button"
                className="w-full px-4 py-2.5 text-left text-sm hover:bg-ink-50"
                onClick={async () => {
                  setOpen(false);
                  await logout();
                  navigate('/');
                }}
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <MenuLink to="/trips" onClick={() => setOpen(false)} strong>Find my booking</MenuLink>
              <div className="my-1 h-px bg-ink-100" />
              <MenuLink to="/login" onClick={() => setOpen(false)}>Staff sign in</MenuLink>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MenuLink({ to, children, onClick, strong }: { to: string; children: ReactNode; onClick: () => void; strong?: boolean }) {
  return (
    <Link to={to} onClick={onClick} className={clsx('block px-4 py-2.5 text-sm hover:bg-ink-50', strong && 'font-semibold')}>
      {children}
    </Link>
  );
}

export function PublicHeader({ center, sticky = true, wide }: { center?: ReactNode; sticky?: boolean; wide?: boolean }) {
  const { user } = useAuth();
  return (
    <header className={clsx('z-30 border-b border-ink-100 bg-white/95 backdrop-blur', sticky && 'sticky top-0')}>
      <div className={clsx('mx-auto flex h-20 items-center gap-4 px-5 md:px-10', wide ? 'max-w-none' : 'max-w-[1440px]')}>
        <div className="hidden flex-1 md:block">
          <Logo />
        </div>
        <div className="md:hidden">
          <Logo compact />
        </div>
        <div className="flex min-w-0 flex-[3] justify-center">{center}</div>
        <div className="flex flex-1 items-center justify-end gap-2">
          {user ? (
            <Link to="/admin" className="hidden rounded-full px-4 py-2.5 text-sm font-semibold transition hover:bg-ink-100 lg:block">
              Manage listings
            </Link>
          ) : (
            <Link to="/trips" className="hidden rounded-full px-4 py-2.5 text-sm font-semibold transition hover:bg-ink-100 lg:block">
              Find my booking
            </Link>
          )}
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-ink-100 bg-ink-50">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-5 py-8 text-sm text-ink-600 md:flex-row md:items-center md:justify-between md:px-10">
        <div className="flex items-center gap-2">
          <span>© {new Date().getFullYear()} Haven Stays</span>
          <span>·</span>
          <Link to="/trips" className="hover:underline">Find my booking</Link>
          <span>·</span>
          <Link to="/terms" className="hover:underline">Terms</Link>
          <span>·</span>
          <Link to="/privacy" className="hover:underline">Privacy</Link>
        </div>
        <Link to="/login" className="hover:underline">Staff sign in</Link>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Staff console
// ---------------------------------------------------------------------------

const adminNav = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/listings', label: 'Listings', icon: Home },
  { to: '/admin/bookings', label: 'Bookings', icon: CalendarCheck2 },
  { to: '/admin/reviews', label: 'Reviews', icon: Star },
  { to: '/admin/emails', label: 'Emails', icon: Mail },
  { to: '/admin/legal', label: 'Legal pages', icon: Scale, adminOnly: true },
  { to: '/admin/users', label: 'Staff', icon: ShieldCheck, adminOnly: true },
  { to: '/admin/account', label: 'Account', icon: Settings },
];

export function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileNav, setMobileNav] = useState(false);
  const items = adminNav.filter((item) => !item.adminOnly || user?.role === 'ADMIN');

  const nav = (
    <nav className="flex flex-col gap-1">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={() => setMobileNav(false)}
          className={({ isActive }) =>
            clsx(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition',
              isActive ? 'bg-ink-900 text-white shadow-sm' : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
            )
          }
        >
          <item.icon className="size-[18px]" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );

  const account = user && (
    <div className="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-ink-200/70">
      <Avatar name={user.name} className="size-9 text-xs" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{user.name}</div>
        <div className="text-xs text-ink-500 capitalize">{user.role.toLowerCase()}</div>
      </div>
      <button
        type="button"
        title="Sign out"
        aria-label="Sign out"
        className="flex size-8 items-center justify-center rounded-lg text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
        onClick={async () => {
          await logout();
          navigate('/login');
        }}
      >
        <LogOut className="size-4" />
      </button>
    </div>
  );

  return (
    <div className="min-h-dvh bg-ink-50/60">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col gap-6 border-r border-ink-200/70 bg-ink-50 px-4 py-5 lg:flex">
        <div className="flex items-center justify-between px-2">
          <Logo />
          <span className="rounded-md bg-ink-900 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-white uppercase">Staff</span>
        </div>
        {nav}
        <div className="mt-auto space-y-3">
          <Link to="/" className="block rounded-xl px-3 py-2 text-sm font-medium text-ink-600 hover:bg-ink-100 hover:text-ink-900">
            ← View public site
          </Link>
          {account}
        </div>
      </aside>

      <div className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-ink-200/70 bg-white/95 px-4 backdrop-blur lg:hidden">
        <Logo />
        <button type="button" aria-label="Open menu" onClick={() => setMobileNav(true)} className="flex size-10 items-center justify-center rounded-xl hover:bg-ink-100">
          <Menu className="size-5" />
        </button>
      </div>
      {mobileNav && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-black/40" onClick={() => setMobileNav(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 animate-fade-in flex-col gap-6 bg-ink-50 p-5 shadow-float">
            <div className="flex items-center justify-between">
              <Logo />
              <button type="button" aria-label="Close menu" onClick={() => setMobileNav(false)} className="flex size-9 items-center justify-center rounded-lg hover:bg-ink-100">
                <X className="size-5" />
              </button>
            </div>
            {nav}
            <div className="mt-auto">{account}</div>
          </div>
        </div>
      )}

      <main key={location.pathname.split('/').slice(0, 3).join('/')} className="animate-fade-in lg:pl-64">
        <Outlet />
      </main>
    </div>
  );
}

export function AdminPage({ title, description, actions, children, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; back?: ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-10">
      {back && <div className="mb-4">{back}</div>}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[28px] font-bold tracking-tight text-ink-900">{title}</h1>
          {description && <p className="mt-1 text-[15px] text-ink-500">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}


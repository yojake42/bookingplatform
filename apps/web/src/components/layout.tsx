import { useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowUpRight, CalendarCheck2, Home, LayoutDashboard, LogOut, Mail, Menu, Scale, Settings, ShieldCheck, Star, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useLockBodyScroll } from '../lib/hooks';
import { Avatar } from './ui';

/** Arched doorway mark: Haven's signature shape. */
export function LogoMark({ className, tone = 'pine' }: { className?: string; tone?: 'pine' | 'paper' }) {
  const outer = tone === 'pine' ? '#224a3d' : '#faf7f2';
  const inner = tone === 'pine' ? '#b07f2c' : '#e9d8b4';
  return (
    <svg viewBox="0 0 28 32" className={className ?? 'h-8 w-7'} aria-hidden>
      <path d="M3 30V13.5a11 11 0 0 1 22 0V30" fill="none" stroke={outer} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M9.5 30V16a4.5 4.5 0 0 1 9 0v14" fill="none" stroke={inner} strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ compact, tone = 'pine' }: { compact?: boolean; tone?: 'pine' | 'paper' }) {
  return (
    <Link to="/" className="group flex shrink-0 items-center gap-2.5" aria-label="Haven home">
      <LogoMark tone={tone} className="h-8 w-7 transition-transform duration-300 group-hover:-translate-y-0.5" />
      {!compact && <span className={clsx('display text-[27px] leading-none font-medium', tone === 'pine' ? 'text-pine-800' : 'text-paper')}>Haven</span>}
    </Link>
  );
}

const publicLinks = [
  { to: '/stays', label: 'The collection' },
  { to: '/trips', label: 'Manage a booking' },
];

export function PublicHeader({ center, sticky = true, wide }: { center?: ReactNode; sticky?: boolean; wide?: boolean }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  useLockBodyScroll(open);

  return (
    <header className={clsx('z-30 border-b border-ink-200 bg-paper/92 backdrop-blur-md', sticky && 'sticky top-0')}>
      <div className={clsx('mx-auto flex h-[72px] items-center gap-4 px-5 md:gap-6 md:px-10', wide ? 'max-w-none' : 'max-w-[1360px]')}>
        <span className={clsx(center && 'hidden sm:block')}><Logo /></span>
        {center && <span className="sm:hidden"><Logo compact /></span>}
        <div className="flex min-w-0 flex-1 justify-center">
          {center ?? (
            <nav className="hidden items-center gap-9 md:flex">
              {publicLinks.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) =>
                    clsx(
                      'relative py-1 text-[13px] font-bold tracking-[0.08em] uppercase transition after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:origin-left after:bg-pine-700 after:transition-transform',
                      isActive ? 'text-pine-800 after:scale-x-100' : 'text-ink-600 after:scale-x-0 hover:text-ink-900 hover:after:scale-x-100',
                    )
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </nav>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {user ? (
            <Link to="/admin" className="hidden items-center gap-1.5 rounded-lg border border-pine-700/30 px-3 py-2 text-[13px] font-bold text-pine-800 transition hover:border-pine-700 md:flex">
              Staff console <ArrowUpRight className="size-3.5" />
            </Link>
          ) : center ? null : (
            <Link to="/stays" className="hidden rounded-lg bg-pine-700 px-4 py-2.5 text-[13px] font-bold text-paper transition hover:bg-pine-800 md:block">
              Find a stay
            </Link>
          )}
          <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" className="flex size-10 items-center justify-center rounded-lg border border-ink-300 md:hidden">
            <Menu className="size-5" />
          </button>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 animate-fade-in bg-paper md:hidden">
          <div className="flex h-[72px] items-center justify-between border-b border-ink-200 px-5">
            <Logo />
            <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="flex size-10 items-center justify-center rounded-lg border border-ink-300">
              <X className="size-5" />
            </button>
          </div>
          <nav className="flex flex-col px-5 py-6">
            {[{ to: '/', label: 'Home' }, ...publicLinks, { to: user ? '/admin' : '/login', label: user ? 'Staff console' : 'Staff sign in' }].map((link, index) => (
              <Link key={link.to} to={link.to} onClick={() => setOpen(false)} className="flex items-baseline gap-4 border-b border-ink-200 py-5">
                <span className="eyebrow w-6">0{index + 1}</span>
                <span className="display text-3xl">{link.label}</span>
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}

export function Footer() {
  const { user } = useAuth();
  return (
    <footer className="bg-pine-900 text-paper">
      <div className="mx-auto max-w-[1360px] px-5 pt-16 pb-10 md:px-10">
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Logo tone="paper" />
            <p className="display mt-6 max-w-sm text-3xl leading-tight font-light text-paper/90">
              A small collection of homes, <em className="text-brass-light">each one looked after</em> by people who know it well.
            </p>
          </div>
          <div>
            <h3 className="text-[11px] font-bold tracking-[0.16em] text-paper/50 uppercase">Explore</h3>
            <ul className="mt-4 space-y-2.5 text-[15px]">
              <li><Link to="/stays" className="text-paper/85 hover:text-paper">The collection</Link></li>
              <li><Link to="/" className="text-paper/85 hover:text-paper">Home</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-[11px] font-bold tracking-[0.16em] text-paper/50 uppercase">Your stay</h3>
            <ul className="mt-4 space-y-2.5 text-[15px]">
              <li><Link to="/trips" className="text-paper/85 hover:text-paper">Manage a booking</Link></li>
              <li><Link to="/terms" className="text-paper/85 hover:text-paper">Terms of Service</Link></li>
              <li><Link to="/privacy" className="text-paper/85 hover:text-paper">Privacy Policy</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-14 flex flex-col gap-3 border-t border-paper/15 pt-6 text-[13px] text-paper/55 md:flex-row md:items-center md:justify-between">
          <span>© {new Date().getFullYear()} Haven Stays. Totals include cleaning, with no booking fees.</span>
          <Link to={user ? '/admin' : '/login'} className="hover:text-paper">{user ? 'Staff console' : 'Staff sign in'}</Link>
        </div>
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
    <nav className="flex flex-col gap-0.5">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={() => setMobileNav(false)}
          className={({ isActive }) =>
            clsx(
              'relative flex items-center gap-3 rounded-md px-3 py-2.5 text-[14px] font-semibold transition',
              isActive
                ? 'bg-paper/10 text-paper before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-brass-light'
                : 'text-paper/60 hover:bg-paper/5 hover:text-paper',
            )
          }
        >
          <item.icon className="size-[17px]" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );

  const account = user && (
    <div className="flex items-center gap-3 rounded-lg bg-paper/5 p-3 ring-1 ring-paper/10">
      <Avatar name={user.name} className="size-9 text-xs" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-paper">{user.name}</div>
        <div className="text-xs text-paper/55 capitalize">{user.role.toLowerCase()}</div>
      </div>
      <button
        type="button"
        title="Sign out"
        aria-label="Sign out"
        className="flex size-8 items-center justify-center rounded-md text-paper/60 transition hover:bg-paper/10 hover:text-paper"
        onClick={async () => {
          await logout();
          navigate('/login');
        }}
      >
        <LogOut className="size-4" />
      </button>
    </div>
  );

  const sidebar = (
    <>
      <div className="flex items-center justify-between px-2">
        <Logo tone="paper" />
        <span className="rounded border border-brass-light/40 px-1.5 py-0.5 text-[9px] font-bold tracking-[0.18em] text-brass-light uppercase">Staff</span>
      </div>
      {nav}
      <div className="mt-auto space-y-3">
        <Link to="/" className="flex items-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-semibold text-paper/60 hover:text-paper">
          View public site <ArrowUpRight className="size-3.5" />
        </Link>
        {account}
      </div>
    </>
  );

  return (
    <div className="min-h-dvh bg-paper">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col gap-8 bg-pine-900 px-4 py-6 lg:flex">{sidebar}</aside>

      <div className="sticky top-0 z-30 flex h-16 items-center justify-between bg-pine-900 px-4 lg:hidden">
        <Logo tone="paper" />
        <button type="button" aria-label="Open menu" onClick={() => setMobileNav(true)} className="flex size-10 items-center justify-center rounded-lg text-paper hover:bg-paper/10">
          <Menu className="size-5" />
        </button>
      </div>
      {mobileNav && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-black/40" onClick={() => setMobileNav(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 animate-fade-in flex-col gap-8 bg-pine-900 p-5 shadow-float">
            <button type="button" aria-label="Close menu" onClick={() => setMobileNav(false)} className="absolute top-5 right-4 flex size-9 items-center justify-center rounded-lg text-paper hover:bg-paper/10">
              <X className="size-5" />
            </button>
            {sidebar}
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
      <div className="mb-8 flex flex-col gap-4 border-b border-ink-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="display text-[34px] leading-tight text-ink-900">{title}</h1>
          {description && <p className="mt-1.5 text-[15px] text-ink-500">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

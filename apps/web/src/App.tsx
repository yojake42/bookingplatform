import type { ReactNode } from 'react';
import { createBrowserRouter, Link, Navigate, Outlet, RouterProvider, ScrollRestoration, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { AdminLayout, PublicHeader } from './components/layout';
import { Button, Spinner } from './components/ui';
import { CheckoutPage } from './pages/CheckoutPage';
import { ListingPage } from './pages/ListingPage';
import { LoginPage } from './pages/LoginPage';
import { SearchPage } from './pages/SearchPage';
import { HomePage } from './pages/HomePage';
import { TripLookupPage, TripPage } from './pages/TripPages';
import { LegalPage } from './pages/LegalPage';
import { DevCheckoutPage } from './pages/DevCheckoutPage';
import { EmailsPage, LegalAdminPage } from './pages/admin/CommsPages';
import { BookingsPage } from './pages/admin/BookingsPage';
import { DashboardPage } from './pages/admin/DashboardPage';
import { ListingEditorPage } from './pages/admin/ListingEditorPage';
import { ListingsPage } from './pages/admin/ListingsPage';
import { AccountPage, ReviewsPage, UsersPage } from './pages/admin/StaffPages';

function Root() {
  return (
    <AuthProvider>
      {/* Back/forward restores position; search and listing pages keep it while their URL params change. */}
      <ScrollRestoration getKey={(location) => (location.pathname === '/stays' || location.pathname.startsWith('/listings/') ? location.pathname : location.key)} />
      <Outlet />
    </AuthProvider>
  );
}

function RequireStaff({ children, adminOnly }: { children: ReactNode; adminOnly?: boolean }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (adminOnly && user.role !== 'ADMIN') return <Navigate to="/admin" replace />;
  return <>{children}</>;
}

function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader />
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="display text-[120px] leading-none font-light text-brass">404</div>
        <h1 className="display mt-4 text-3xl">This door doesn't open</h1>
        <p className="mt-2 text-ink-500">It may have moved, or the link might be wrong.</p>
        <Link to="/" className="mt-6">
          <Button variant="brand">Back to the homepage</Button>
        </Link>
      </div>
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/stays', element: <SearchPage /> },
      { path: '/listings/:id', element: <ListingPage /> },
      { path: '/book/:id', element: <CheckoutPage /> },
      { path: '/trips', element: <TripLookupPage /> },
      { path: '/trips/:token', element: <TripPage /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/terms', element: <LegalPage key="terms" type="terms" /> },
      { path: '/privacy', element: <LegalPage key="privacy" type="privacy" /> },
      { path: '/dev/checkout/:sessionId', element: <DevCheckoutPage /> },
      {
        path: '/admin',
        element: (
          <RequireStaff>
            <AdminLayout />
          </RequireStaff>
        ),
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'listings', element: <ListingsPage /> },
          { path: 'listings/:id', element: <ListingEditorPage /> },
          { path: 'bookings', element: <BookingsPage /> },
          { path: 'reviews', element: <ReviewsPage /> },
          { path: 'emails', element: <EmailsPage /> },
          { path: 'legal', element: <RequireStaff adminOnly><LegalAdminPage /></RequireStaff> },
          { path: 'users', element: <RequireStaff adminOnly><UsersPage /></RequireStaff> },
          { path: 'account', element: <AccountPage /> },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}

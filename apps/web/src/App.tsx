import type { ReactNode } from 'react';
import { createBrowserRouter, Link, Navigate, Outlet, RouterProvider, ScrollRestoration, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { AdminLayout, PublicHeader } from './components/layout';
import { Button, Spinner } from './components/ui';
import { CheckoutPage } from './pages/CheckoutPage';
import { ListingPage } from './pages/ListingPage';
import { LoginPage } from './pages/LoginPage';
import { SearchPage } from './pages/SearchPage';
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
      <ScrollRestoration getKey={(location) => location.pathname} />
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
        <div className="text-7xl font-extrabold tracking-tight text-ink-200">404</div>
        <h1 className="mt-4 text-2xl font-bold">We can't find that page</h1>
        <p className="mt-2 text-ink-500">It may have moved, or the link might be wrong.</p>
        <Link to="/" className="mt-6">
          <Button>Back to homes</Button>
        </Link>
      </div>
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: '/', element: <SearchPage /> },
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

import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import { Spinner } from './ui/index.jsx';
import { cn } from '../lib/utils.js';

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/projects', label: 'Projects' },
  { to: '/quotes', label: 'Quotes' },
  { to: '/invoices', label: 'Invoices' },
  { to: '/request', label: 'New request' },
  { to: '/chat', label: 'Chat' },
];

export function ProtectedRoute() {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner />
      </div>
    );
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <AppLayout />;
}

function AppLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-card)]/95 backdrop-blur md:h-dvh md:border-r md:border-b-0">
        <div className="flex items-center justify-between gap-2 px-4 py-3 md:px-5 md:py-4">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--color-primary)] font-bold text-white">
              K
            </span>
            <span className="font-heading text-lg font-semibold">Klyro</span>
          </div>
          <button
            type="button"
            onClick={logout}
            className="min-h-11 rounded-lg px-3 text-sm text-[var(--color-muted-foreground)] transition-colors duration-150 hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)] md:hidden"
          >
            Sign out
          </button>
        </div>
        <nav
          aria-label="Portal"
          className="flex snap-x gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none] md:flex-col md:overflow-visible md:pb-3 [&::-webkit-scrollbar]:hidden"
        >
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex min-h-11 shrink-0 snap-start items-center whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors duration-150',
                  isActive
                    ? 'bg-[var(--color-primary)]/15 text-[var(--color-primary)]'
                    : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]'
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col">
        <header className="hidden items-center justify-between border-b border-[var(--color-border)] px-6 py-3 md:flex">
          <div className="truncate text-sm text-[var(--color-muted-foreground)]">
            {user?.name ? `Welcome, ${user.name}` : 'Client portal'}
          </div>
          <button
            type="button"
            onClick={logout}
            className="min-h-11 rounded-lg px-3 text-sm text-[var(--color-muted-foreground)] transition-colors duration-150 hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
          >
            Sign out
          </button>
        </header>
        <main className="mx-auto w-full min-w-0 max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

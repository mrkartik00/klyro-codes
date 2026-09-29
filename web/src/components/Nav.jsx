import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Logo } from './Logo.jsx';
import { Button } from './ui/Button.jsx';

const links = [
  { to: '/', label: 'Home' },
  { to: '/work', label: 'Work' },
  { to: '/#services', label: 'Services', hash: true },
  { to: '/#process', label: 'Process', hash: true },
];

export function Nav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => setOpen(false), [location.pathname]);

  // Close the mobile menu on Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-4 sm:pt-4">
      <nav
        aria-label="Primary"
        className={
          'mx-auto flex max-w-6xl items-center justify-between rounded-full border px-3 py-1.5 pl-4 sm:px-4 sm:py-2 sm:pl-5 ' +
          'transition-[background-color,border-color,box-shadow] duration-500 ' +
          (scrolled || open
            ? 'border-white/10 bg-[#0a0a0f]/85 shadow-[0_10px_40px_-15px_rgba(0,0,0,0.7)] backdrop-blur-xl'
            : 'border-transparent bg-transparent')
        }
      >
        <Link to="/" aria-label="Klyro home" className="flex min-h-[44px] items-center">
          <Logo />
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {links.map((l) =>
            l.hash ? (
              <Link
                key={l.to}
                to={l.to}
                className="rounded-full px-4 py-2 text-sm text-[var(--color-muted-foreground)] transition-colors duration-200 hover:bg-white/5 hover:text-[var(--color-foreground)]"
              >
                {l.label}
              </Link>
            ) : (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === '/'}
                className={({ isActive }) =>
                  'rounded-full px-4 py-2 text-sm transition-colors duration-200 hover:bg-white/5 ' +
                  (isActive
                    ? 'text-[var(--color-foreground)]'
                    : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]')
                }
              >
                {l.label}
              </NavLink>
            ),
          )}
        </div>

        <div className="hidden md:block">
          <Button to="/start" className="!min-h-[42px] !px-5 !text-sm" arrow>
            Start a project
          </Button>
        </div>

        <button
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 md:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((v) => !v)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            {open ? (
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            ) : (
              <path d="M4 8h16M4 16h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </nav>

      {open && (
        <div
          id="mobile-menu"
          className="mx-auto mt-2 max-w-6xl origin-top animate-[menu-in_0.22s_var(--ease-out-expo)] rounded-3xl border border-white/10 bg-[#0a0a0f]/95 p-3 backdrop-blur-xl motion-reduce:animate-none md:hidden"
        >
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              onClick={() => setOpen(false)}
              className="flex min-h-[48px] items-center rounded-2xl px-4 font-heading text-lg text-[var(--color-foreground)] hover:bg-white/5"
            >
              {l.label}
            </Link>
          ))}
          <Button to="/start" className="mt-2 w-full" arrow>
            Start a project
          </Button>
        </div>
      )}
    </header>
  );
}

export default Nav;

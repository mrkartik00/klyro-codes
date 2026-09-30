import { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  CalendarClock,
  LayoutDashboard,
  Users,
  Target,
  Send,
  FileText,
  Inbox,
  CheckSquare,
  Kanban,
  ReceiptText,
  Briefcase,
  Settings,
  ScrollText,
  X,
} from 'lucide-react';
import { classNames as cn } from '../../lib/format.js';

export const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/approvals', label: 'Approvals', icon: CheckSquare },
  { to: '/targets', label: 'Lead Sources', icon: Target },
  { to: '/schedules', label: 'Schedules', icon: CalendarClock },
  { to: '/leads', label: 'Leads', icon: Users },
  { to: '/campaigns', label: 'Campaigns', icon: Send },
  { to: '/templates', label: 'Templates', icon: FileText },
  { to: '/deals', label: 'Deals', icon: Kanban },
  { to: '/quotations', label: 'Quotations', icon: ReceiptText },
  { to: '/mailboxes', label: 'Mailboxes', icon: Inbox },
  { to: '/portfolio', label: 'Portfolio', icon: Briefcase },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/audit', label: 'Audit Log', icon: ScrollText },
];

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <span className="grid h-7 w-7 place-items-center rounded-md bg-primary text-sm font-bold text-on-primary">
        K
      </span>
      <span className="font-heading text-lg font-semibold tracking-tight">Klyro</span>
    </div>
  );
}

function NavList({ onNavigate }) {
  return (
    <ul className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex min-h-[44px] items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors md:min-h-[40px]',
                  isActive
                    ? 'bg-primary/15 text-blue-200'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )
              }
            >
              <Icon size={18} aria-hidden="true" />
              {item.label}
            </NavLink>
          </li>
        );
      })}
    </ul>
  );
}

/** Desktop sidebar (md and up). */
export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-[100dvh] w-60 shrink-0 flex-col border-r border-border bg-card md:flex">
      <div className="flex h-14 items-center border-b border-border px-5">
        <Brand />
      </div>
      <nav aria-label="Main" className="flex-1 overflow-y-auto p-3">
        <NavList />
      </nav>
    </aside>
  );
}

/** Off-canvas drawer for phones/tablets (below md). */
export function MobileNav({ open, onClose }) {
  const location = useLocation();

  // Close on route change and on Escape; lock body scroll while open.
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return (
    <div className={cn('fixed inset-0 z-50 md:hidden', open ? '' : 'pointer-events-none')} aria-hidden={!open}>
      <div
        className={cn(
          'absolute inset-0 bg-black/60 transition-opacity duration-200',
          open ? 'opacity-100' : 'opacity-0',
        )}
        onClick={onClose}
      />
      <aside
        id="mobile-nav"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className={cn(
          'absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-border bg-card shadow-2xl transition-transform duration-200 ease-out motion-reduce:transition-none',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <Brand />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="grid h-11 w-11 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <nav aria-label="Main" className="flex-1 overflow-y-auto p-3">
          <NavList onNavigate={onClose} />
        </nav>
      </aside>
    </div>
  );
}

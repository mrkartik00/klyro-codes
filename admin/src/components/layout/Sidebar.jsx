import { NavLink } from 'react-router-dom';
import {
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
} from 'lucide-react';
import { classNames as cn } from '../../lib/format.js';

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/leads', label: 'Leads', icon: Users },
  { to: '/targets', label: 'Targets', icon: Target },
  { to: '/campaigns', label: 'Campaigns', icon: Send },
  { to: '/templates', label: 'Templates', icon: FileText },
  { to: '/mailboxes', label: 'Mailboxes', icon: Inbox },
  { to: '/approvals', label: 'Approvals', icon: CheckSquare },
  { to: '/deals', label: 'Deals', icon: Kanban },
  { to: '/quotations', label: 'Quotations', icon: ReceiptText },
  { to: '/portfolio', label: 'Portfolio', icon: Briefcase },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/audit', label: 'Audit Log', icon: ScrollText },
];

export function Sidebar() {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card md:flex">
      <div className="flex h-14 items-center gap-2 border-b border-border px-5">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-primary text-sm font-bold text-on-primary">
          K
        </span>
        <span className="font-heading text-lg font-semibold tracking-tight">
          Klyro
        </span>
      </div>
      <nav className="flex-1 overflow-y-auto p-3">
        <ul className="flex flex-col gap-1">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'flex min-h-[2.5rem] items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary/15 text-blue-200'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )
                  }
                >
                  <Icon size={18} />
                  {item.label}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}

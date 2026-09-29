import { LogOut, Menu, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.jsx';
import { Button } from '../ui/index.jsx';

export function Topbar({ onMenu, menuOpen = false }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-card/95 px-3 backdrop-blur sm:px-5">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onMenu}
          aria-label="Open navigation"
          aria-controls="mobile-nav"
          aria-expanded={menuOpen}
          className="grid h-11 w-11 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
        >
          <Menu size={20} aria-hidden="true" />
        </button>
        <span className="truncate text-sm text-muted-foreground">Command Center</span>
      </div>
      <div className="flex shrink-0 items-center gap-1 sm:gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/2fa')}
          className="text-muted-foreground"
          aria-label="Two-factor authentication"
        >
          <ShieldCheck size={16} aria-hidden="true" />
          <span className="hidden sm:inline">2FA</span>
        </Button>
        <div className="hidden text-right lg:block">
          <div className="text-sm font-medium">{user?.name || 'Admin'}</div>
          <div className="text-xs text-muted-foreground">{user?.email}</div>
        </div>
        <Button variant="secondary" size="sm" onClick={logout} aria-label="Log out">
          <LogOut size={16} aria-hidden="true" />
          <span className="hidden sm:inline">Logout</span>
        </Button>
      </div>
    </header>
  );
}

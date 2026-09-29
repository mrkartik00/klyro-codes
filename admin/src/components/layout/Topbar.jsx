import { LogOut, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.jsx';
import { Button } from '../ui/index.jsx';

export function Topbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-5">
      <div className="text-sm text-muted-foreground">Command Center</div>
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/2fa')}
          className="text-muted-foreground"
        >
          <ShieldCheck size={16} />
          2FA
        </Button>
        <div className="hidden text-right sm:block">
          <div className="text-sm font-medium">{user?.name || 'Admin'}</div>
          <div className="text-xs text-muted-foreground">{user?.email}</div>
        </div>
        <Button variant="secondary" size="sm" onClick={logout}>
          <LogOut size={16} />
          Logout
        </Button>
      </div>
    </header>
  );
}

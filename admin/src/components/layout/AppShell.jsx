import { useCallback, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar, MobileNav } from './Sidebar.jsx';
import { Topbar } from './Topbar.jsx';

export function AppShell() {
  const [navOpen, setNavOpen] = useState(false);
  const closeNav = useCallback(() => setNavOpen(false), []);

  return (
    <div className="flex min-h-[100dvh] bg-background">
      <Sidebar />
      <MobileNav open={navOpen} onClose={closeNav} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setNavOpen(true)} menuOpen={navOpen} />
        <main className="flex-1 p-4 sm:p-5 lg:p-6">
          <div className="mx-auto w-full max-w-[1400px] min-w-0">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

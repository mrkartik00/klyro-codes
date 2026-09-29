import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Nav } from '../components/Nav.jsx';
import { Footer } from '../components/Footer.jsx';
import { Cursor } from '../components/Cursor.jsx';
import { AppRoutes } from './routes.jsx';
import { useLenis, scrollToTarget } from '../motion/lenis.js';
import { ScrollTrigger } from '../motion/gsap.js';

export function App() {
  const location = useLocation();
  useLenis();

  // Pitch pages are standalone (no marketing chrome).
  const isPitch = location.pathname.startsWith('/pitch/');

  // On route change: go to the hash target if present, otherwise the top.
  useEffect(() => {
    const t = setTimeout(() => {
      if (location.hash) scrollToTarget(location.hash);
      else scrollToTarget(0, { immediate: true });
      ScrollTrigger.refresh();
    }, 50);
    return () => clearTimeout(t);
  }, [location.pathname, location.hash]);

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-black"
      >
        Skip to content
      </a>
      <Cursor />
      <div className="grain" aria-hidden="true" />
      {!isPitch && <Nav />}
      <div id="main-content">
        <AppRoutes />
      </div>
      {!isPitch && <Footer />}
    </>
  );
}

export default App;

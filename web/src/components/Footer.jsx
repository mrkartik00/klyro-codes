import { Link } from 'react-router-dom';
import { Logo } from './Logo.jsx';

const cols = [
  {
    title: 'Studio',
    links: [
      { to: '/work', label: 'Work' },
      { to: '/#services', label: 'Services' },
      { to: '/#process', label: 'Process' },
      { to: '/start', label: 'Start a project' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { to: '/privacy', label: 'Privacy' },
      { to: '/terms', label: 'Terms' },
      { to: '/unsubscribe', label: 'Unsubscribe' },
    ],
  },
  {
    title: 'Connect',
    links: [
      { href: 'mailto:kartik@klyro.codes', label: 'kartik@klyro.codes' },
      { href: 'https://www.linkedin.com/in/kartik-kartik-5a680a229/', label: 'LinkedIn', external: true },
    ],
  },
];

export function Footer() {
  const year = new Date().getFullYear();
  const linkCls = 'text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]';

  return (
    <footer className="relative overflow-hidden border-t border-white/10">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 pt-20 pb-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-5 max-w-xs text-sm leading-relaxed text-[var(--color-muted-foreground)]">
            A product studio building web and mobile software that wins customers. Based in India,
            shipping worldwide.
          </p>
        </div>
        {cols.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <p className="eyebrow">{c.title}</p>
            <ul className="mt-5 space-y-3 text-sm">
              {c.links.map((l) => (
                <li key={l.label}>
                  {l.to ? (
                    <Link to={l.to} className={linkCls}>
                      {l.label}
                    </Link>
                  ) : (
                    <a
                      href={l.href}
                      className={linkCls}
                      {...(l.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    >
                      {l.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div aria-hidden="true" className="pointer-events-none select-none px-6">
        <p className="text-center font-heading text-[clamp(5rem,22vw,20rem)] leading-[0.8] font-bold tracking-[-0.05em] text-transparent [-webkit-text-stroke:1px_rgba(255,255,255,0.08)]">
          KLYRO
        </p>
      </div>

      <div className="mx-auto flex max-w-6xl flex-col gap-2 border-t border-white/10 px-6 py-6 text-xs text-[var(--color-muted-foreground)] sm:flex-row sm:justify-between">
        <p>© {year} Klyro. All rights reserved.</p>
        <p>Udyam Reg. No. UDYAM-UP-61-0055505</p>
      </div>
    </footer>
  );
}

export default Footer;

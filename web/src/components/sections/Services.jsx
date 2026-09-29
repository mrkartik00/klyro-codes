import { useState } from 'react';
import { useScrollReveal } from '../../motion/useScrollReveal.js';
import { SectionHeader } from '../SectionHeader.jsx';

const services = [
  {
    n: '00',
    title: 'Web platforms',
    desc: 'Full-stack web apps on React, Node and MongoDB — dashboards, portals, marketplaces and SaaS.',
    points: ['Custom web apps & SaaS', 'Admin panels & dashboards', 'APIs & integrations', 'Payments & auth'],
  },
  {
    n: '01',
    title: 'Mobile apps',
    desc: 'Cross-platform iOS and Android apps with React Native and Expo, sharing one codebase.',
    points: ['iOS & Android', 'Push notifications', 'Offline-first sync', 'App Store launch'],
  },
  {
    n: '02',
    title: 'Websites that convert',
    desc: 'Fast, SEO-ready marketing sites and landing pages engineered for Core Web Vitals and leads.',
    points: ['Landing pages & funnels', 'SEO & performance', 'CMS & blogs', 'Analytics setup'],
  },
  {
    n: '03',
    title: 'Product design',
    desc: 'Research-led UX and interface design that removes friction and guides users to action.',
    points: ['UX research & flows', 'UI design systems', 'Prototypes', 'Accessibility (WCAG)'],
  },
];

export function Services() {
  const ref = useScrollReveal();
  const [active, setActive] = useState(0);

  return (
    <section ref={ref} id="services" className="scroll-mt-24 px-6 py-32">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          index="01"
          eyebrow="Services"
          title="Everything you need to launch and grow."
          intro="One team from idea to launch. We design, build, ship and keep improving — so you get a single accountable partner instead of five vendors."
        />

        <ul className="border-t border-white/10">
          {services.map((s, i) => {
            const open = active === i;
            return (
              <li key={s.n} data-reveal className="border-b border-white/10">
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={`service-${s.n}`}
                  onClick={() => setActive(i)}
                  onPointerEnter={() => setActive(i)}
                  className="group grid w-full grid-cols-[3rem_1fr_auto] items-center gap-4 py-8 text-left sm:grid-cols-[5rem_1fr_auto] sm:py-10"
                >
                  <span className="font-heading text-sm tabular-nums text-[var(--color-muted-foreground)] transition-colors group-hover:text-[var(--color-brand)]">
                    {s.n}
                  </span>
                  <span
                    className={
                      'font-heading text-[clamp(1.75rem,4.5vw,3.5rem)] leading-none font-semibold transition-[color,transform] duration-500 ' +
                      (open ? 'translate-x-2 text-white' : 'text-white/45 group-hover:text-white/80')
                    }
                  >
                    {s.title}
                  </span>
                  <span
                    aria-hidden="true"
                    className={
                      'flex h-12 w-12 items-center justify-center rounded-full border transition-[transform,background-color,border-color] duration-500 ' +
                      (open
                        ? 'rotate-45 border-[var(--color-brand)] bg-[var(--color-brand)] text-[#050507]'
                        : 'border-white/15 text-white/70')
                    }
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </span>
                </button>

                <div
                  id={`service-${s.n}`}
                  className="grid transition-[grid-template-rows,opacity] duration-500 ease-out"
                  style={{ gridTemplateRows: open ? '1fr' : '0fr', opacity: open ? 1 : 0 }}
                >
                  <div className="overflow-hidden">
                    <div className="grid gap-8 pb-10 sm:grid-cols-[5rem_1fr_1fr]">
                      <span aria-hidden="true" className="hidden sm:block" />
                      <p className="max-w-md text-lg leading-relaxed text-[var(--color-muted-foreground)]">
                        {s.desc}
                      </p>
                      <ul className="grid grid-cols-2 gap-3">
                        {s.points.map((p) => (
                          <li key={p} className="flex items-center gap-2 text-sm text-white/80">
                            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand)]" aria-hidden="true" />
                            {p}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export default Services;

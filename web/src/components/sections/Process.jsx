import { useEffect, useRef } from 'react';
import { useScrollReveal } from '../../motion/useScrollReveal.js';
import { useReducedMotion } from '../../motion/useReducedMotion.js';
import { gsap } from '../../motion/gsap.js';
import { SectionHeader } from '../SectionHeader.jsx';

const steps = [
  { n: '01', title: 'Discovery call', time: 'Week 0', desc: 'A 30-minute call to understand your goals, users and constraints. You get a clear scope and fixed quote within 48 hours.' },
  { n: '02', title: 'Design & prototype', time: 'Weeks 1–2', desc: 'Flows and clickable prototypes you approve before any production code is written — no surprises later.' },
  { n: '03', title: 'Build in sprints', time: 'Weeks 2–6', desc: 'Weekly demos on a live staging URL. You see real progress every week and can steer at any point.' },
  { n: '04', title: 'Launch & grow', time: 'Ongoing', desc: 'We deploy, monitor and keep improving — performance, conversion and new features as you grow.' },
];

export function Process() {
  const ref = useScrollReveal();
  const lineRef = useRef(null);
  const listRef = useRef(null);
  const reduced = useReducedMotion();

  // Progress line fills as you scroll through the steps (scrub-linked).
  useEffect(() => {
    if (reduced || !lineRef.current || !listRef.current) return undefined;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        lineRef.current,
        { scaleY: 0 },
        {
          scaleY: 1,
          ease: 'none',
          scrollTrigger: { trigger: listRef.current, start: 'top 70%', end: 'bottom 60%', scrub: 1 },
        },
      );
    });
    return () => ctx.revert();
  }, [reduced]);

  return (
    <section ref={ref} id="process" className="scroll-mt-24 px-5 py-20 sm:px-6 sm:py-28 lg:py-32">
      <div className="mx-auto grid max-w-6xl gap-16 lg:grid-cols-[1fr_1.3fr]">
        <div className="lg:sticky lg:top-32 lg:self-start">
          <SectionHeader
            index="03"
            eyebrow="Process"
            title="From first call to launch in weeks, not months."
          />
          <p data-reveal className="-mt-8 max-w-sm text-lg leading-relaxed text-[var(--color-muted-foreground)]">
            A simple, transparent process. Fixed quotes, weekly demos, and one team accountable end to end.
          </p>
        </div>

        <ol ref={listRef} className="relative pl-10">
          <span aria-hidden="true" className="absolute top-2 bottom-2 left-[7px] w-px bg-white/10" />
          <span
            ref={lineRef}
            aria-hidden="true"
            className="absolute top-2 bottom-2 left-[7px] w-px origin-top bg-[var(--color-brand)]"
            style={reduced ? { transform: 'scaleY(1)' } : undefined}
          />
          {steps.map((s) => (
            <li key={s.n} data-reveal className="relative pb-16 last:pb-0">
              <span
                aria-hidden="true"
                className="absolute top-1.5 -left-10 h-4 w-4 rounded-full border-2 border-[var(--color-brand)] bg-[var(--color-background)]"
              />
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="font-heading text-sm tabular-nums text-[var(--color-brand)]">{s.n}</span>
                <h3 className="font-heading text-2xl font-semibold sm:text-3xl">{s.title}</h3>
                <span className="rounded-full border border-white/10 px-3 py-0.5 text-xs text-white/60">
                  {s.time}
                </span>
              </div>
              <p className="mt-4 max-w-lg leading-relaxed text-[var(--color-muted-foreground)]">{s.desc}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export default Process;

import { useEffect, useRef } from 'react';
import { Button } from '../ui/Button.jsx';
import { useLocalTime } from '../../hooks/useLocalTime.js';
import { useReducedMotion } from '../../motion/useReducedMotion.js';
import { usePointerFine } from '../../motion/usePointerFine.js';
import { gsap } from '../../motion/gsap.js';

const lines = [
  { text: 'We build', gradient: false },
  { text: 'software that', gradient: false },
  { text: 'wins customers.', gradient: true },
];

const stats = [
  { value: '7+', label: 'Products live in production' },
  { value: 'SIH', label: 'Smart India Hackathon winner' },
  { value: 'US · UK · IN', label: 'Clients across timezones' },
];

export function Hero() {
  const time = useLocalTime();
  const reduced = useReducedMotion();
  const fine = usePointerFine();
  const rootRef = useRef(null);
  const orbA = useRef(null);
  const orbB = useRef(null);

  // Intro timeline: line masks slide up, then supporting content fades in.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || reduced) return undefined;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
      tl.fromTo('[data-line]', { yPercent: 110 }, { yPercent: 0, duration: 1.3, stagger: 0.1 })
        .fromTo('[data-fade]', { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 1, stagger: 0.08 }, '-=0.9')
        .fromTo('[data-orb]', { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 0.55, duration: 2 }, 0);

      // Parallax: orbs drift and the headline lifts as the hero scrolls away.
      gsap.to('[data-orb]', {
        yPercent: 40,
        ease: 'none',
        scrollTrigger: { trigger: root, start: 'top top', end: 'bottom top', scrub: 1 },
      });
      gsap.to('[data-hero-content]', {
        y: -80,
        opacity: 0.2,
        ease: 'none',
        scrollTrigger: { trigger: root, start: 'top top', end: 'bottom top', scrub: 1 },
      });
    }, root);
    return () => ctx.revert();
  }, [reduced]);

  // Ambient glow follows the pointer (desktop only).
  useEffect(() => {
    if (!fine || reduced || !orbA.current || !orbB.current) return undefined;
    const ax = gsap.quickTo(orbA.current, 'x', { duration: 2, ease: 'power3' });
    const ay = gsap.quickTo(orbA.current, 'y', { duration: 2, ease: 'power3' });
    const bx = gsap.quickTo(orbB.current, 'x', { duration: 3, ease: 'power3' });
    const by = gsap.quickTo(orbB.current, 'y', { duration: 3, ease: 'power3' });
    const onMove = (e) => {
      const dx = e.clientX / window.innerWidth - 0.5;
      const dy = e.clientY / window.innerHeight - 0.5;
      ax(dx * 120);
      ay(dy * 90);
      bx(dx * -160);
      by(dy * -110);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [fine, reduced]);

  return (
    <section
      ref={rootRef}
      aria-labelledby="hero-title"
      className="relative isolate flex min-h-[100dvh] flex-col justify-center overflow-hidden px-6 pt-32 pb-12"
    >
      {/* Ambient background */}
      <div aria-hidden="true" className="grid-bg absolute inset-0 -z-10" />
      <div
        aria-hidden="true"
        ref={orbA}
        data-orb
        className="glow-orb -z-10 left-[8%] top-[12%] h-[38rem] w-[38rem] bg-[radial-gradient(circle,#1d5fd1_0%,transparent_65%)]"
      />
      <div
        aria-hidden="true"
        ref={orbB}
        data-orb
        className="glow-orb -z-10 right-[-10%] bottom-[-10%] h-[34rem] w-[34rem] bg-[radial-gradient(circle,#4da3ff_0%,transparent_65%)] !opacity-35"
      />

      <div data-hero-content className="mx-auto w-full max-w-6xl">
        <div
          data-fade
          className="mb-10 inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.03] py-2 pr-4 pl-2 text-sm backdrop-blur"
        >
          <span className="rounded-full bg-[var(--color-brand-soft)] px-2.5 py-0.5 text-xs font-semibold text-[var(--color-brand)]">
            Available
          </span>
          <span className="text-[var(--color-muted-foreground)]">Taking new projects for Q4</span>
          <span className="hidden h-3 w-px bg-white/15 sm:block" aria-hidden="true" />
          <span className="hidden items-center gap-2 sm:inline-flex">
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span className="text-[var(--color-muted-foreground)]">IST</span>
            <span className="tabular-nums text-[var(--color-foreground)]">{time}</span>
          </span>
        </div>

        <h1
          id="hero-title"
          className="font-heading text-[clamp(3rem,9.5vw,8.75rem)] leading-[0.92] font-semibold"
        >
          {lines.map((l) => (
            <span key={l.text} className="split-line">
              <span data-line className={`block ${l.gradient ? 'text-gradient' : ''}`}>
                {l.text}
              </span>
            </span>
          ))}
        </h1>

        <div className="mt-10 flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
          <p
            data-fade
            className="max-w-md text-lg leading-relaxed text-[var(--color-muted-foreground)] text-balance"
          >
            Klyro is a product studio that designs and engineers fast, conversion-focused web
            and mobile apps — from first sketch to launch and beyond.
          </p>
          <div data-fade className="flex flex-wrap items-center gap-3">
            <Button to="/start" arrow>
              Start a project
            </Button>
            <Button to="/work" variant="secondary">
              See our work
            </Button>
          </div>
        </div>

        <dl
          data-fade
          className="mt-20 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-3"
        >
          {stats.map((s) => (
            <div key={s.label} className="bg-[#07070a]/90 px-6 py-5 backdrop-blur">
              <dt className="text-sm text-[var(--color-muted-foreground)]">{s.label}</dt>
              <dd className="mt-1 font-heading text-2xl font-semibold tracking-tight">{s.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <a
        href="#services"
        data-fade
        className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-xs tracking-[0.2em] text-[var(--color-muted-foreground)] uppercase md:flex"
      >
        Scroll
        <span className="relative h-10 w-px overflow-hidden bg-white/10" aria-hidden="true">
          <span className="absolute inset-x-0 top-0 h-4 animate-[scrollcue_1.8s_ease-in-out_infinite] bg-[var(--color-brand)]" />
        </span>
      </a>
      <style>{'@keyframes scrollcue{0%{transform:translateY(-100%)}100%{transform:translateY(250%)}}'}</style>
    </section>
  );
}

export default Hero;

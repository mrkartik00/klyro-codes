import { useEffect } from 'react';
import Lenis from 'lenis';
import { useReducedMotion } from './useReducedMotion.js';
import { gsap, ScrollTrigger } from './gsap.js';

let instance = null;

/** Smooth-scroll to an element or y offset, using Lenis when active. */
export function scrollToTarget(target, { immediate = false } = {}) {
  if (instance) {
    instance.scrollTo(target, { offset: -90, immediate });
  } else if (typeof target === 'string') {
    document.querySelector(target)?.scrollIntoView({ behavior: immediate ? 'auto' : 'smooth' });
  } else {
    window.scrollTo(0, target);
  }
}

// Sets up Lenis smooth scroll wired to GSAP ScrollTrigger.
// Disabled entirely under prefers-reduced-motion (native scroll instead).
export function useLenis() {
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return undefined;

    const lenis = new Lenis({ duration: 1.15, smoothWheel: true, anchors: { offset: -90 } });
    instance = lenis;
    lenis.on('scroll', ScrollTrigger.update);

    const onRaf = (time) => lenis.raf(time * 1000);
    gsap.ticker.add(onRaf);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(onRaf);
      lenis.destroy();
      instance = null;
    };
  }, [reduced]);
}

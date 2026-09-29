import { useEffect, useRef } from 'react';
import { gsap, ScrollTrigger } from './gsap.js';
import { useReducedMotion } from './useReducedMotion.js';

// Reveals elements matching `selector` inside the returned ref on scroll.
// Under reduced motion, elements are left in their final readable state.
export function useScrollReveal(selector = '[data-reveal]') {
  const ref = useRef(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!ref.current) return undefined;
    const els = ref.current.querySelectorAll(selector);
    if (reduced || els.length === 0) return undefined;

    const ctx = gsap.context(() => {
      els.forEach((el) => {
        el.style.willChange = 'transform, opacity';
        gsap.fromTo(
          el,
          { y: 40, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.8,
            ease: 'power3.out',
            scrollTrigger: {
              trigger: el,
              start: 'top 85%',
              toggleActions: 'play none none none',
            },
            onComplete: () => {
              el.style.willChange = '';
            },
          },
        );
      });
    }, ref);

    ScrollTrigger.refresh();
    return () => ctx.revert();
  }, [selector, reduced]);

  return ref;
}

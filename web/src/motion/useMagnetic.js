import { useEffect, useRef } from 'react';
import { gsap } from './gsap.js';
import { usePointerFine } from './usePointerFine.js';
import { useReducedMotion } from './useReducedMotion.js';

/**
 * Magnetic hover: the element eases toward the pointer while hovered and
 * springs back on leave. transform-only (compositor-friendly). Disabled on
 * touch devices and under reduced motion.
 */
export function useMagnetic(strength = 0.35) {
  const ref = useRef(null);
  const fine = usePointerFine();
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || !fine || reduced) return undefined;

    const xTo = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3' });

    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      xTo((e.clientX - (r.left + r.width / 2)) * strength);
      yTo((e.clientY - (r.top + r.height / 2)) * strength);
    };
    const onEnter = () => {
      el.style.willChange = 'transform';
    };
    const onLeave = () => {
      xTo(0);
      yTo(0);
      el.style.willChange = '';
    };

    el.addEventListener('pointerenter', onEnter);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointerenter', onEnter);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      gsap.set(el, { x: 0, y: 0 });
    };
  }, [fine, reduced, strength]);

  return ref;
}

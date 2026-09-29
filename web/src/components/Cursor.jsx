import { useEffect, useRef } from 'react';
import { gsap } from '../motion/gsap.js';
import { usePointerFine } from '../motion/usePointerFine.js';
import { useReducedMotion } from '../motion/useReducedMotion.js';

/**
 * Custom cursor: a small dot that tracks exactly + a trailing ring.
 *
 * Fixes the "two cursors" bug: the native cursor is hidden ONLY while this
 * component is mounted and active (html.has-custom-cursor). On touch devices
 * or under reduced motion nothing renders and the native cursor stays.
 *
 * Hover states via event delegation:
 *   [data-cursor="view"]  → big filled ring with a label ("View")
 *   a, button, [data-cursor="hover"] → enlarged ring
 *   input, textarea       → ring hidden, native text caret shown
 */
export function Cursor() {
  const dotRef = useRef(null);
  const ringRef = useRef(null);
  const labelRef = useRef(null);
  const fine = usePointerFine();
  const reduced = useReducedMotion();
  const active = fine && !reduced;

  useEffect(() => {
    if (!active || !dotRef.current || !ringRef.current) return undefined;

    const root = document.documentElement;
    root.classList.add('has-custom-cursor');

    const dot = dotRef.current;
    const ring = ringRef.current;
    const label = labelRef.current;

    const dotX = gsap.quickTo(dot, 'x', { duration: 0.08, ease: 'power3' });
    const dotY = gsap.quickTo(dot, 'y', { duration: 0.08, ease: 'power3' });
    const ringX = gsap.quickTo(ring, 'x', { duration: 0.45, ease: 'power3' });
    const ringY = gsap.quickTo(ring, 'y', { duration: 0.45, ease: 'power3' });

    let visible = false;
    const onMove = (e) => {
      if (!visible) {
        visible = true;
        gsap.to([dot, ring], { opacity: 1, duration: 0.2 });
      }
      dotX(e.clientX);
      dotY(e.clientY);
      ringX(e.clientX);
      ringY(e.clientY);
    };

    const setState = (target) => {
      ring.classList.remove('is-hover', 'is-view', 'is-text');
      dot.classList.remove('is-hidden');
      if (!target) return;

      const view = target.closest('[data-cursor="view"]');
      if (view) {
        ring.classList.add('is-view');
        dot.classList.add('is-hidden');
        if (label) label.textContent = view.getAttribute('data-cursor-label') || 'View';
        return;
      }
      if (target.closest('input, textarea, select, [contenteditable="true"]')) {
        ring.classList.add('is-text');
        dot.classList.add('is-hidden');
        return;
      }
      if (target.closest('a, button, [role="button"], [data-cursor="hover"], label')) {
        ring.classList.add('is-hover');
      }
    };

    const onOver = (e) => setState(e.target);
    const onLeaveWindow = () => {
      visible = false;
      gsap.to([dot, ring], { opacity: 0, duration: 0.2 });
    };
    const onDown = () => gsap.to(ring, { scale: 0.85, duration: 0.15 });
    const onUp = () => gsap.to(ring, { scale: 1, duration: 0.25, ease: 'back.out(3)' });

    gsap.set([dot, ring], { opacity: 0 });
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerover', onOver, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeaveWindow);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);

    return () => {
      root.classList.remove('has-custom-cursor');
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerover', onOver);
      document.documentElement.removeEventListener('pointerleave', onLeaveWindow);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
    };
  }, [active]);

  if (!active) return null;

  return (
    <>
      <div ref={ringRef} className="cursor-ring" aria-hidden="true">
        <span ref={labelRef} className="cursor-label">View</span>
      </div>
      <div ref={dotRef} className="cursor-dot" aria-hidden="true" />
    </>
  );
}

export default Cursor;

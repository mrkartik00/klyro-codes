import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { classNames as cn } from '../../lib/format.js';

/**
 * Accessible modal. Bottom sheet on phones, centred card on sm+.
 * Escape closes, body scroll locks, focus moves in and is restored on close.
 */
export function Dialog({ open, onClose, title, children, className }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    // Focus the first focusable control inside the panel.
    const t = setTimeout(() => {
      const first = panelRef.current?.querySelector(
        'input, select, textarea, button:not([data-dialog-close]), [href], [tabindex]:not([tabindex="-1"])',
      );
      (first ?? panelRef.current)?.focus();
    }, 0);
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          'relative z-10 max-h-[92dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-2xl border border-border bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl outline-none sm:rounded-2xl sm:p-6',
          'animate-[dialog-in_0.18s_ease-out] motion-reduce:animate-none',
          className
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <button
            type="button"
            data-dialog-close
            onClick={onClose}
            aria-label="Close dialog"
            className="-mt-1 -mr-1 grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

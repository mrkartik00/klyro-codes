import { createContext, useCallback, useContext, useState } from 'react';
import { cn } from '../lib/utils.js';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    ({ title, description, tone = 'default', duration = 4000 }) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev, { id, title, description, tone }]);
      if (duration) setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2"
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              'rounded-lg border p-3 shadow-lg backdrop-blur',
              t.tone === 'success' &&
                'border-[var(--color-success)]/40 bg-[var(--color-card)]',
              t.tone === 'error' &&
                'border-[var(--color-destructive)]/40 bg-[var(--color-card)]',
              t.tone === 'default' &&
                'border-[var(--color-border)] bg-[var(--color-card)]'
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                {t.title ? (
                  <p className="text-sm font-medium">{t.title}</p>
                ) : null}
                {t.description ? (
                  <p className="mt-0.5 text-sm text-[var(--color-muted-foreground)]">
                    {t.description}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                aria-label="Dismiss notification"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

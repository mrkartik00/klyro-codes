import { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

let idSeq = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (message, variant = 'default') => {
      const id = ++idSeq;
      setToasts((t) => [...t, { id, message, variant }]);
      setTimeout(() => remove(id), 4000);
    },
    [remove]
  );

  const toast = {
    success: (m) => push(m, 'success'),
    error: (m) => push(m, 'error'),
    info: (m) => push(m, 'default'),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={
              'min-w-[240px] max-w-sm rounded-lg border px-4 py-3 text-sm shadow-lg ' +
              (t.variant === 'success'
                ? 'border-green-700 bg-green-950 text-green-100'
                : t.variant === 'error'
                  ? 'border-red-700 bg-red-950 text-red-100'
                  : 'border-border bg-card text-foreground')
            }
          >
            {t.message}
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

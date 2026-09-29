import { forwardRef, useId } from 'react';

// Floating-label input / textarea. Works with React Hook Form via ref forwarding.
export const FloatingInput = forwardRef(function FloatingInput(
  { label, as = 'input', error, className = '', id, ...props },
  ref,
) {
  const generatedId = useId();
  const fieldId = id || generatedId;
  const Component = as;

  return (
    <div className="w-full">
      <div className="relative">
        <Component
          ref={ref}
          id={fieldId}
          placeholder=" "
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${fieldId}-error` : undefined}
          className={
            'peer w-full rounded-lg border bg-[var(--color-card)] px-4 pt-6 pb-2 text-[16px] ' +
            'text-[var(--color-foreground)] outline-none transition-colors duration-200 ' +
            'border-[var(--color-border)] focus:border-[var(--color-foreground)] ' +
            (as === 'textarea' ? 'min-h-[140px] resize-y ' : 'min-h-[56px] ') +
            className
          }
          {...props}
        />
        <label
          htmlFor={fieldId}
          className={
            'pointer-events-none absolute left-4 top-2 text-xs text-[var(--color-muted-foreground)] ' +
            'transition-all duration-200 ' +
            'peer-placeholder-shown:top-4 peer-placeholder-shown:text-base ' +
            'peer-focus:top-2 peer-focus:text-xs'
          }
        >
          {label}
        </label>
      </div>
      {error && (
        <p
          id={`${fieldId}-error`}
          role="alert"
          className="mt-1 text-sm text-[var(--color-destructive)]"
        >
          {error}
        </p>
      )}
    </div>
  );
});

export default FloatingInput;

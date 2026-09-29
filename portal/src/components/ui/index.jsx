import { forwardRef } from 'react';
import { cn } from '../../lib/utils.js';

export const Button = forwardRef(function Button(
  { className, variant = 'primary', size = 'md', type = 'button', ...props },
  ref
) {
  const variants = {
    primary:
      'bg-[var(--color-primary)] text-[var(--color-on-primary)] hover:bg-[var(--color-primary-hover)]',
    secondary:
      'bg-[var(--color-muted)] text-[var(--color-foreground)] hover:bg-[var(--color-border)]',
    outline:
      'border border-[var(--color-border)] text-[var(--color-foreground)] hover:bg-[var(--color-muted)]',
    ghost:
      'text-[var(--color-foreground)] hover:bg-[var(--color-muted)]',
    destructive:
      'bg-[var(--color-destructive)] text-white hover:opacity-90',
  };
  const sizes = {
    sm: 'h-9 px-3 text-sm',
    md: 'min-h-11 px-4 text-sm',
    lg: 'min-h-11 px-6 text-base',
  };
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-[background-color,opacity] duration-150 disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
});

export const Input = forwardRef(function Input(
  { className, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={cn(
        'w-full min-w-0 min-h-11 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)] px-3 text-base sm:text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] transition-colors duration-150 focus:border-[var(--color-primary)] focus-visible:outline-none',
        className
      )}
      {...props}
    />
  );
});

export const Textarea = forwardRef(function Textarea(
  { className, ...props },
  ref
) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'w-full min-w-0 min-h-24 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2 text-base sm:text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] transition-colors duration-150 focus:border-[var(--color-primary)] focus-visible:outline-none',
        className
      )}
      {...props}
    />
  );
});

export function Label({ className, ...props }) {
  return (
    <label
      className={cn(
        'mb-1.5 block text-sm font-medium text-[var(--color-foreground)]',
        className
      )}
      {...props}
    />
  );
}

export function FieldError({ children }) {
  if (!children) return null;
  return (
    <p role="alert" className="mt-1 text-sm text-[var(--color-destructive)]">
      {children}
    </p>
  );
}

export function Card({ className, ...props }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5',
        className
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }) {
  return (
    <h3
      className={cn(
        'text-sm font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wide',
        className
      )}
      {...props}
    />
  );
}

const badgeTones = {
  default: 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]',
  primary: 'bg-[var(--color-primary)]/15 text-[var(--color-primary)]',
  success: 'bg-[var(--color-success)]/15 text-[var(--color-success)]',
  warning: 'bg-[var(--color-warning)]/15 text-[var(--color-warning)]',
  destructive: 'bg-[var(--color-destructive)]/15 text-[var(--color-destructive)]',
};

export function Badge({ className, tone = 'default', ...props }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize',
        badgeTones[tone] || badgeTones.default,
        className
      )}
      {...props}
    />
  );
}

export function Spinner({ label = 'Loading…' }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 py-10 text-[var(--color-muted-foreground)]"
    >
      <span
        className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-primary)]"
        aria-hidden="true"
      />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function EmptyState({ title, description }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--color-border)] p-10 text-center">
      <p className="font-medium">{title}</p>
      {description ? (
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          {description}
        </p>
      ) : null}
    </div>
  );
}

const statusTone = {
  draft: 'default',
  sent: 'primary',
  accepted: 'success',
  paid: 'success',
  rejected: 'destructive',
  void: 'destructive',
  expired: 'warning',
  partially_paid: 'warning',
  superseded: 'default',
};

export function StatusBadge({ status }) {
  return (
    <Badge tone={statusTone[status] || 'default'}>
      {String(status || '—').replace(/_/g, ' ')}
    </Badge>
  );
}

import { classNames as cn } from '../../lib/format.js';

export function Button({
  as: Comp = 'button',
  variant = 'primary',
  size = 'md',
  className,
  ...props
}) {
  const variants = {
    primary:
      'bg-primary text-on-primary hover:bg-blue-800 border border-transparent',
    secondary:
      'bg-transparent text-foreground border border-border hover:bg-muted',
    ghost: 'bg-transparent text-foreground hover:bg-muted border border-transparent',
    destructive:
      'bg-destructive text-white hover:bg-red-600 border border-transparent',
    success: 'bg-green-600 text-white hover:bg-green-500 border border-transparent',
  };
  const sizes = {
    sm: 'h-8 px-3 text-xs',
    md: 'h-10 px-4 text-sm',
    icon: 'h-10 w-10',
  };
  return (
    <Comp
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none cursor-pointer min-h-[2.75rem] focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring',
        size === 'sm' ? 'min-h-[2rem]' : '',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-lg border border-input bg-muted px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none transition-colors',
        className
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }) {
  return (
    <textarea
      className={cn(
        'min-h-[80px] w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none transition-colors',
        className
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }) {
  return (
    <select
      className={cn(
        'h-10 w-full rounded-lg border border-input bg-muted px-3 text-sm text-foreground focus:border-ring focus:outline-none transition-colors',
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Label({ className, children, ...props }) {
  return (
    <label
      className={cn('mb-1.5 block text-sm font-medium text-foreground', className)}
      {...props}
    >
      {children}
    </label>
  );
}

export function Card({ className, children, ...props }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card text-card-foreground',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children }) {
  return <div className={cn('p-5 pb-0', className)}>{children}</div>;
}

export function CardTitle({ className, children }) {
  return (
    <h3 className={cn('text-lg font-semibold tracking-tight', className)}>
      {children}
    </h3>
  );
}

export function CardContent({ className, children }) {
  return <div className={cn('p-5', className)}>{children}</div>;
}

const badgeVariants = {
  default: 'bg-muted text-muted-foreground border-border',
  primary: 'bg-blue-950 text-blue-300 border-blue-800',
  success: 'bg-green-950 text-green-300 border-green-800',
  warning: 'bg-amber-950 text-amber-300 border-amber-800',
  destructive: 'bg-red-950 text-red-300 border-red-800',
};

export function Badge({ variant = 'default', className, children }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        badgeVariants[variant] || badgeVariants.default,
        className
      )}
    >
      {children}
    </span>
  );
}

export function Spinner({ className }) {
  return (
    <div
      className={cn(
        'h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent',
        className
      )}
      role="status"
      aria-label="Loading"
    />
  );
}

export function EmptyState({ title, hint }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

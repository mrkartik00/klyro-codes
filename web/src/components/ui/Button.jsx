import { Link } from 'react-router-dom';
import { useMagnetic } from '../../motion/useMagnetic.js';

const base =
  'group relative inline-flex items-center justify-center gap-3 overflow-hidden rounded-full ' +
  'min-h-[48px] px-7 py-3 font-heading text-[15px] font-semibold tracking-tight ' +
  'transition-[background-color,border-color,color,opacity] duration-300 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-ring)] ' +
  'disabled:pointer-events-none disabled:opacity-50';

const variants = {
  primary: 'bg-[var(--color-brand)] text-[#050507] hover:bg-white',
  secondary:
    'border border-white/15 bg-white/[0.03] text-[var(--color-foreground)] backdrop-blur ' +
    'hover:border-white/40 hover:bg-white/[0.07]',
  ghost: 'text-[var(--color-foreground)] hover:text-[var(--color-brand)] px-0 min-h-[44px]',
};

function Arrow() {
  return (
    <span
      aria-hidden="true"
      className="relative flex h-5 w-5 items-center justify-center overflow-hidden"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        className="transition-transform duration-300 group-hover:translate-x-6"
      >
        <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        className="absolute -translate-x-6 transition-transform duration-300 group-hover:translate-x-0"
      >
        <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function Button({
  to,
  href,
  variant = 'primary',
  arrow = false,
  magnetic = true,
  className = '',
  children,
  ...props
}) {
  const magRef = useMagnetic(magnetic && variant !== 'ghost' ? 0.3 : 0);
  const classes = `${base} ${variants[variant] || variants.primary} ${className}`;
  const inner = (
    <>
      <span className="relative">{children}</span>
      {arrow && <Arrow />}
    </>
  );

  if (to) {
    return (
      <Link ref={magRef} to={to} className={classes} {...props}>
        {inner}
      </Link>
    );
  }
  if (href) {
    return (
      <a ref={magRef} href={href} className={classes} {...props}>
        {inner}
      </a>
    );
  }
  return (
    <button ref={magRef} className={classes} {...props}>
      {inner}
    </button>
  );
}

export default Button;

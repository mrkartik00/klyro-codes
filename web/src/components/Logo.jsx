// Klyro logo mark: circuit-trace chevron, drawn from the brand logo.
export function Logo({ className = '', withWordmark = true }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="klyro-mark" x1="2" y1="4" x2="30" y2="28" gradientUnits="userSpaceOnUse">
            <stop stopColor="#1d5fd1" />
            <stop offset="1" stopColor="#4da3ff" />
          </linearGradient>
        </defs>
        <path d="M4 16h13" stroke="url(#klyro-mark)" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M18 5l-9 11 9 11" stroke="url(#klyro-mark)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M17 11h7l4-4" stroke="url(#klyro-mark)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M17 21h7l4 4" stroke="url(#klyro-mark)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="28" cy="7" r="1.8" fill="#4da3ff" />
        <circle cx="28" cy="25" r="1.8" fill="#4da3ff" />
      </svg>
      {withWordmark && (
        <span className="font-heading text-[19px] font-bold tracking-[0.12em] text-[var(--color-foreground)]">
          KLYRO
        </span>
      )}
    </span>
  );
}

export default Logo;

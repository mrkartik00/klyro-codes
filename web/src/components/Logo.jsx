// Klyro logo: a bold "K" clasped by code brackets { K }, drawn from the brand mark.
export function Logo({ className = '', withWordmark = true }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="klyro-mark" x1="4" y1="5" x2="28" y2="27" gradientUnits="userSpaceOnUse">
            <stop stopColor="#4da3ff" />
            <stop offset="1" stopColor="#1d5fd1" />
          </linearGradient>
        </defs>
        {/* left brace */}
        <path
          d="M10 5c-2.4 0-3.2 1.3-3.2 3.4v3.1c0 1.6-.6 2.5-2.3 2.5v2c1.7 0 2.3.9 2.3 2.5v3.1C6.8 25.7 7.6 27 10 27"
          stroke="url(#klyro-mark)"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* K */}
        <path
          d="M14 6v20M14 16l8-10M14 16l8 10"
          stroke="var(--color-foreground)"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {withWordmark && (
        <span className="font-heading text-[20px] font-bold tracking-[0.02em] text-[var(--color-foreground)]">
          Klyro
        </span>
      )}
    </span>
  );
}

export default Logo;

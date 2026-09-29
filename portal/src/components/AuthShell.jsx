export function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--color-primary)] font-bold text-white">
            K
          </span>
          <span className="font-heading text-xl font-semibold">Klyro</span>
        </div>
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6">
          <h1 className="font-heading text-2xl font-semibold">{title}</h1>
          {subtitle ? (
            <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
              {subtitle}
            </p>
          ) : null}
          <div className="mt-6">{children}</div>
        </div>
        {footer ? (
          <div className="mt-4 text-center text-sm text-[var(--color-muted-foreground)]">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

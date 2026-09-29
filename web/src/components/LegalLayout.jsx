export function LegalLayout({ title, children }) {
  return (
    <main className="px-6 pt-32 pb-24">
      <article className="mx-auto max-w-2xl">
        <h1 className="text-4xl font-700">{title}</h1>
        <div className="legal-body mt-8 flex flex-col gap-4 text-[var(--color-muted-foreground)] [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-600 [&_h2]:text-[var(--color-foreground)]">
          {children}
        </div>
      </article>
    </main>
  );
}

export default LegalLayout;

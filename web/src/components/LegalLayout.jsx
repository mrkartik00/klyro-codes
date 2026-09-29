export function LegalLayout({ title, updated, children }) {
  return (
    <main className="px-5 pt-28 pb-20 sm:px-6 sm:pt-32 sm:pb-24">
      <article className="mx-auto max-w-2xl">
        <h1 className="font-heading text-3xl font-bold text-balance sm:text-4xl">{title}</h1>
        {updated && <p className="mt-3 text-sm text-[var(--color-muted-foreground)]">Last updated {updated}</p>}
        <div className="legal-body mt-8 flex flex-col gap-4 leading-relaxed text-[var(--color-muted-foreground)] [&_a]:text-[var(--color-brand)] [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mt-6 [&_h2]:font-heading [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-[var(--color-foreground)] [&_li]:ml-5 [&_li]:list-disc">
          {children}
        </div>
      </article>
    </main>
  );
}

export default LegalLayout;

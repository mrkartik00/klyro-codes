// Consistent section heading: eyebrow index + title + optional intro.
export function SectionHeader({ index, eyebrow, title, intro, align = 'left' }) {
  const center = align === 'center';
  return (
    <div className={`mb-16 ${center ? 'mx-auto max-w-3xl text-center' : 'grid gap-8 lg:grid-cols-[1fr_1.4fr] lg:items-end'}`}>
      <div>
        <p data-reveal className={`eyebrow flex items-center gap-3 ${center ? 'justify-center' : ''}`}>
          {index && <span className="text-[var(--color-brand)]">{index}</span>}
          <span className="h-px w-8 bg-white/20" aria-hidden="true" />
          {eyebrow}
        </p>
        <h2
          data-reveal
          className="mt-5 font-heading text-[clamp(2.25rem,5vw,4rem)] leading-[1] font-semibold text-balance"
        >
          {title}
        </h2>
      </div>
      {intro && (
        <p
          data-reveal
          className={`text-lg leading-relaxed text-[var(--color-muted-foreground)] text-balance ${center ? 'mt-6' : 'max-w-xl lg:justify-self-end'}`}
        >
          {intro}
        </p>
      )}
    </div>
  );
}

export default SectionHeader;

const stack = [
  'React',
  'Next.js',
  'Node.js',
  'Express',
  'MongoDB',
  'PostgreSQL',
  'React Native',
  'Expo',
  'TypeScript',
  'Tailwind',
  'AWS',
  'DigitalOcean',
];

// Infinite tech-stack marquee. CSS animation (transform only); pauses on
// hover and stops under reduced motion (global rule).
export function Marquee() {
  const items = stack.map((t) => (
    <span key={t} className="flex items-center gap-12 whitespace-nowrap">
      <span className="font-heading text-2xl font-medium text-white/40 transition-colors duration-300 hover:text-white sm:text-3xl">
        {t}
      </span>
      <span className="text-[var(--color-brand)]" aria-hidden="true">✦</span>
    </span>
  ));

  return (
    <section aria-label="Technologies we use" className="border-y border-white/5 py-10">
      <div className="marquee">
        <div className="marquee-track">{items}</div>
        <div className="marquee-track" aria-hidden="true">
          {items}
        </div>
      </div>
    </section>
  );
}

export default Marquee;

import { useScrollReveal } from '../../motion/useScrollReveal.js';
import { SectionHeader } from '../SectionHeader.jsx';

// Bento grid of differentiators. Claims are factual (no invented metrics or
// testimonials — fake reviews are an FTC risk for US outreach).
export function WhyKlyro() {
  const ref = useScrollReveal();
  const card = 'relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] p-8';

  return (
    <section ref={ref} className="px-5 py-20 sm:px-6 sm:py-28 lg:py-32">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          index="04"
          eyebrow="Why Klyro"
          title="Senior engineering, without the agency overhead."
          align="center"
        />

        <div className="grid gap-4 md:grid-cols-6">
          <div data-reveal className={`${card} md:col-span-4`}>
            <div
              aria-hidden="true"
              className="glow-orb -top-24 -right-24 h-72 w-72 bg-[radial-gradient(circle,#1d5fd1_0%,transparent_70%)]"
            />
            <p className="eyebrow">Full stack</p>
            <h3 className="mt-4 max-w-md font-heading text-3xl font-semibold">
              One team for web, mobile and backend.
            </h3>
            <p className="mt-4 max-w-md text-[var(--color-muted-foreground)]">
              React, Node, MongoDB and React Native under one roof — no hand-offs between agencies,
              no finger-pointing.
            </p>
            <div className="mt-8 flex flex-wrap gap-2">
              {['React', 'Node.js', 'MongoDB', 'React Native', 'PostgreSQL', 'AWS'].map((t) => (
                <span key={t} className="rounded-full bg-white/5 px-3 py-1.5 text-sm text-white/70">
                  {t}
                </span>
              ))}
            </div>
          </div>

          <div data-reveal className={`${card} md:col-span-2`}>
            <p className="eyebrow">Timezones</p>
            <p className="mt-6 font-heading text-6xl font-semibold text-gradient">24h</p>
            <p className="mt-4 text-[var(--color-muted-foreground)]">
              India-based team — work progresses overnight for US and UK clients.
            </p>
          </div>

          <div data-reveal className={`${card} md:col-span-2`}>
            <p className="eyebrow">Pricing</p>
            <h3 className="mt-4 font-heading text-2xl font-semibold">Fixed quotes</h3>
            <p className="mt-3 text-[var(--color-muted-foreground)]">
              A clear scope and price before we start. Milestone-based payments.
            </p>
          </div>

          <div data-reveal className={`${card} md:col-span-2`}>
            <p className="eyebrow">Transparency</p>
            <h3 className="mt-4 font-heading text-2xl font-semibold">Weekly demos</h3>
            <p className="mt-3 text-[var(--color-muted-foreground)]">
              A live staging link from week one. See progress, give feedback, steer.
            </p>
          </div>

          <div data-reveal className={`${card} md:col-span-2`}>
            <p className="eyebrow">Ownership</p>
            <h3 className="mt-4 font-heading text-2xl font-semibold">Your code, your IP</h3>
            <p className="mt-3 text-[var(--color-muted-foreground)]">
              Full source code and repository handed over. No lock-in.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default WhyKlyro;

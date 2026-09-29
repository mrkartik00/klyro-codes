import { useScrollReveal } from '../../motion/useScrollReveal.js';
import { Button } from '../ui/Button.jsx';

export function CtaBand() {
  const ref = useScrollReveal();
  return (
    <section ref={ref} className="px-6 py-24">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2.5rem] border border-white/10 px-8 py-24 text-center sm:px-16">
        <div aria-hidden="true" className="grid-bg absolute inset-0" />
        <div
          aria-hidden="true"
          className="glow-orb left-1/2 top-1/2 h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(circle,#1d5fd1_0%,transparent_65%)]"
        />
        <div className="relative">
          <p data-reveal className="eyebrow">Let’s talk</p>
          <h2
            data-reveal
            className="mx-auto mt-6 max-w-4xl font-heading text-[clamp(2.5rem,7vw,6rem)] leading-[0.95] font-semibold text-balance"
          >
            Have an idea? <span className="text-gradient">Let’s build it.</span>
          </h2>
          <p data-reveal className="mx-auto mt-6 max-w-lg text-lg text-[var(--color-muted-foreground)]">
            Tell us about your project — you’ll get a scoped plan and a fixed quote within two business days.
          </p>
          <div data-reveal className="mt-10 flex flex-wrap justify-center gap-3">
            <Button to="/start" arrow>
              Start a project
            </Button>
            <Button href="mailto:kartik@klyro.codes" variant="secondary">
              kartik@klyro.codes
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default CtaBand;

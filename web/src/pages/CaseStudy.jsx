import { Link, Navigate, useParams } from 'react-router-dom';
import { projects, slugify } from '../lib/projects.js';
import { Button } from '../components/ui/Button.jsx';
import { LivePreview } from '../components/LivePreview.jsx';
import { CtaBand } from '../components/sections/CtaBand.jsx';
import { useScrollReveal } from '../motion/useScrollReveal.js';

export function CaseStudy() {
  const { slug } = useParams();
  const ref = useScrollReveal();
  const index = projects.findIndex((p) => slugify(p.name) === slug);
  const project = projects[index];

  if (!project) return <Navigate to="/work" replace />;
  const next = projects[(index + 1) % projects.length];

  return (
    <main ref={ref} className="pt-36">
      <div className="mx-auto max-w-6xl px-6">
        <Link to="/work" className="eyebrow inline-flex min-h-[44px] items-center gap-2 hover:text-white">
          <span aria-hidden="true">←</span> All work
        </Link>

        <div className="mt-8 grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:items-end">
          <div>
            <p data-reveal className="eyebrow">{project.category}</p>
            <h1
              data-reveal
              className="mt-5 font-heading text-[clamp(2.4rem,9vw,7rem)] leading-[0.95] font-semibold break-words"
            >
              {project.name}
            </h1>
          </div>
          <p data-reveal className="text-lg leading-relaxed text-[var(--color-muted-foreground)]">
            {project.blurb}
          </p>
        </div>

        <dl
          data-reveal
          className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2 md:grid-cols-3"
        >
          <div className="min-w-0 bg-[#07070a] px-5 py-4 sm:px-6 sm:py-5">
            <dt className="eyebrow">Site</dt>
            <dd className="mt-2 font-heading text-base break-all sm:text-lg">{project.domain}</dd>
          </div>
          <div className="min-w-0 bg-[#07070a] px-5 py-4 sm:px-6 sm:py-5">
            <dt className="eyebrow">Type</dt>
            <dd className="mt-2 font-heading text-base sm:text-lg">{project.category}</dd>
          </div>
          <div className="min-w-0 bg-[#07070a] px-5 py-4 sm:col-span-2 sm:px-6 sm:py-5 md:col-span-1">
            <dt className="eyebrow">Stack</dt>
            <dd className="mt-2 font-heading text-base sm:text-lg">{project.tags.join(' · ')}</dd>
          </div>
        </dl>

        <div data-reveal className="mt-10">
          <LivePreview project={project} className="[&>div:last-child]:aspect-[16/8]" />
        </div>

        {project.url && (
          <div data-reveal className="mt-10 flex justify-center">
            <Button href={project.url} target="_blank" rel="noopener noreferrer" arrow>
              Visit {project.domain}
            </Button>
          </div>
        )}

        <Link
          to={`/work/${slugify(next.name)}`}
          data-cursor="view"
          data-cursor-label="Next"
          className="group mt-20 flex items-end sm:mt-28 justify-between gap-6 border-t border-white/10 pt-10"
        >
          <div>
            <p className="eyebrow">Next project</p>
            <p className="mt-4 font-heading text-[clamp(1.75rem,6vw,5rem)] leading-none font-semibold break-words text-white/50 transition-colors duration-500 group-hover:text-white">
              {next.name}
            </p>
          </div>
          <span aria-hidden="true" className="mb-3 text-3xl transition-transform duration-500 group-hover:translate-x-2">
            →
          </span>
        </Link>
      </div>
      <CtaBand />
    </main>
  );
}

export default CaseStudy;

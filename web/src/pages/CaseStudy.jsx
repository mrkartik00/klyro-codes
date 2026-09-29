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
              className="mt-5 font-heading text-[clamp(3rem,8vw,7rem)] leading-[0.92] font-semibold"
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
          className="mt-14 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 md:grid-cols-3"
        >
          <div className="bg-[#07070a] px-6 py-5">
            <dt className="eyebrow">Site</dt>
            <dd className="mt-2 font-heading text-lg">{project.domain}</dd>
          </div>
          <div className="bg-[#07070a] px-6 py-5">
            <dt className="eyebrow">Type</dt>
            <dd className="mt-2 font-heading text-lg">{project.category}</dd>
          </div>
          <div className="col-span-2 bg-[#07070a] px-6 py-5 md:col-span-1">
            <dt className="eyebrow">Stack</dt>
            <dd className="mt-2 font-heading text-lg">{project.tags.join(' · ')}</dd>
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
          className="group mt-28 flex items-end justify-between gap-6 border-t border-white/10 pt-10"
        >
          <div>
            <p className="eyebrow">Next project</p>
            <p className="mt-4 font-heading text-[clamp(2rem,6vw,5rem)] leading-none font-semibold text-white/50 transition-colors duration-500 group-hover:text-white">
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

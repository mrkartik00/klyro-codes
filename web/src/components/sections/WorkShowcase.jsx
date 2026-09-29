import { Link } from 'react-router-dom';
import { useScrollReveal } from '../../motion/useScrollReveal.js';
import { projects, slugify } from '../../lib/projects.js';
import { LivePreview } from '../LivePreview.jsx';
import { SectionHeader } from '../SectionHeader.jsx';
import { Button } from '../ui/Button.jsx';

function ProjectCard({ project, index }) {
  const featured = project.featured;
  return (
    <Link
      to={`/work/${slugify(project.name)}`}
      data-cursor="view"
      data-cursor-label="View"
      className={
        'group block rounded-3xl border border-white/10 bg-white/[0.02] p-3 transition-[border-color,background-color] duration-500 hover:border-white/20 hover:bg-white/[0.04] ' +
        (featured ? 'md:grid md:grid-cols-[1fr_1.35fr] md:items-center md:gap-4' : '')
      }
    >
      <LivePreview project={project} className={featured ? 'md:order-2' : ''} />
      <div className={'flex items-start justify-between gap-4 px-3 pt-6 pb-3 ' + (featured ? 'md:order-1 md:flex-col md:justify-center md:gap-8 md:p-8' : '')}>
        <div>
          <p className="eyebrow">
            {String(index + 1).padStart(2, '0')} — {project.category}
          </p>
          <h3 className="mt-3 font-heading text-2xl font-semibold sm:text-3xl">{project.name}</h3>
          <p className="mt-3 max-w-md leading-relaxed text-[var(--color-muted-foreground)]">
            {project.blurb}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {project.tags.map((t) => (
              <span
                key={t}
                className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/60"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
        <span
          aria-hidden="true"
          className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 transition-[transform,background-color,border-color,color] duration-500 group-hover:-rotate-45 group-hover:border-[var(--color-brand)] group-hover:bg-[var(--color-brand)] group-hover:text-[#050507]"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
    </Link>
  );
}

export function WorkShowcase({ heading = 'Selected work', limit, showAllLink = true }) {
  const ref = useScrollReveal();
  const items = limit ? projects.slice(0, limit) : projects;

  return (
    <section ref={ref} id="work" className="scroll-mt-24 px-5 py-20 sm:px-6 sm:py-28 lg:py-32">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          index="02"
          eyebrow="Work"
          title={heading}
          intro="Real products, live in production — healthcare, real estate, travel, government and commerce."
        />

        <ul className="grid gap-6 md:grid-cols-2">
          {items.map((p, i) => (
            <li key={p.name} data-reveal className={p.featured ? 'md:col-span-2' : ''}>
              <ProjectCard project={p} index={i} />
            </li>
          ))}
        </ul>

        {showAllLink && limit && limit < projects.length && (
          <div data-reveal className="mt-14 flex justify-center">
            <Button to="/work" variant="secondary" arrow>
              View all {projects.length} projects
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

export default WorkShowcase;

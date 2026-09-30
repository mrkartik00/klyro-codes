import { Link, useParams } from 'react-router-dom';
import { useProject, useProjects } from '../hooks/usePortalData.js';
import {
  Card,
  EmptyState,
  Spinner,
  StatusBadge,
} from '../components/ui/index.jsx';
import { formatDate, formatMoney } from '../lib/utils.js';

export default function Projects() {
  const { id } = useParams();
  if (id) return <ProjectDetail id={id} />;
  return <ProjectList />;
}

function ProjectList() {
  const { data, isLoading, isError } = useProjects();
  const list = Array.isArray(data) ? data : [];

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-semibold">Projects</h1>
      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <EmptyState title="Could not load projects" description="Try again later." />
      ) : list.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Once a project kicks off it will show up here."
        />
      ) : (
        <div className="grid gap-3">
          {list.map((p) => (
            <Link
              key={p._id || p.id}
              to={`/projects/${p._id || p.id}`}
              className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 transition-colors duration-150 hover:border-[var(--color-primary)]"
            >
              <div>
                <p className="font-medium">{p.title || 'Project'}</p>
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  {Number(p.progressPct) || 0}% complete
                </p>
              </div>
              <StatusBadge status={p.status} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectDetail({ id }) {
  const { data, isLoading, isError } = useProject(id);

  if (isLoading) return <Spinner />;
  if (isError || !data) {
    return (
      <EmptyState
        title="Project not found"
        description="It may have been removed or you lack access."
      />
    );
  }

  const milestones = Array.isArray(data.milestones) ? data.milestones : [];
  const project = data.project ?? data;
  const pct = Math.max(0, Math.min(100, Number(project.progressPct) || 0));

  return (
    <div className="space-y-6">
      <Link to="/projects" className="inline-flex min-h-11 items-center text-sm text-[var(--color-primary)]">
        ← All projects
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-semibold break-words">{project.title || 'Project'}</h1>
          {project.stagingUrl ? (
            <a
              href={project.stagingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-sm text-[var(--color-primary)] underline underline-offset-2"
            >
              Preview the work in progress ↗
            </a>
          ) : null}
        </div>
        <StatusBadge status={project.status} />
      </div>

      <Card>
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium">Progress</span>
          <span className="text-[var(--color-muted-foreground)]">{pct}%</span>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-[var(--color-muted)]"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Project progress"
        >
          <div className="h-full rounded-full bg-[var(--color-primary)] transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
      </Card>

      <section>
        <h2 className="mb-3 font-heading text-lg font-semibold">Milestones</h2>
        {milestones.length === 0 ? (
          <EmptyState title="No milestones yet" />
        ) : (
          <ol className="space-y-3">
            {milestones.map((m, i) => (
              <li key={m._id || m.id || i}>
                <Card className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{m.title || `Milestone ${i + 1}`}</p>
                    <p className="text-sm text-[var(--color-muted-foreground)]">
                      {m.amountMinor ? formatMoney(m.amountMinor, m.currency || 'USD') : ''}
                      {m.approvedAt ? ` · approved ${formatDate(m.approvedAt)}` : ''}
                    </p>
                  </div>
                  <StatusBadge status={m.status} />
                </Card>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

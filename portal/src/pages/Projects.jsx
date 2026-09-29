import { Link, useParams } from 'react-router-dom';
import { useProject, useProjects } from '../hooks/usePortalData.js';
import {
  Card,
  EmptyState,
  Spinner,
  StatusBadge,
} from '../components/ui/index.jsx';
import { formatDate } from '../lib/utils.js';

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
                <p className="font-medium">{p.name || p.title || 'Project'}</p>
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  {p.summary || p.description || '—'}
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

  return (
    <div className="space-y-6">
      <Link to="/projects" className="text-sm text-[var(--color-primary)]">
        ← All projects
      </Link>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold">
            {data.name || data.title || 'Project'}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            {data.summary || data.description || '—'}
          </p>
        </div>
        <StatusBadge status={data.status} />
      </div>

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
                    <p className="font-medium">
                      {m.name || m.title || `Milestone ${i + 1}`}
                    </p>
                    <p className="text-sm text-[var(--color-muted-foreground)]">
                      Due {formatDate(m.dueDate || m.due)}
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

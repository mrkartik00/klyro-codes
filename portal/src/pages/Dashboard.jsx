import { Link } from 'react-router-dom';
import { useInvoices, useProjects } from '../hooks/usePortalData.js';
import {
  Card,
  CardTitle,
  EmptyState,
  Spinner,
  StatusBadge,
} from '../components/ui/index.jsx';
import { formatMoney } from '../lib/utils.js';

export default function Dashboard() {
  const projects = useProjects();
  const invoices = useInvoices();

  const projectList = Array.isArray(projects.data) ? projects.data : [];
  const invoiceList = Array.isArray(invoices.data) ? invoices.data : [];

  const outstanding = invoiceList
    .filter((i) => i.status !== 'paid' && i.status !== 'void')
    .reduce((sum, i) => sum + (Number(Math.max(0, (i.amountMinor ?? 0) - (i.paidMinor ?? 0))) || 0), 0);

  const outstandingCurrency = invoiceList[0]?.currency || 'USD';
  const activeProjects = projectList.filter(
    (p) => p.status !== 'delivered' && p.status !== 'closed'
  ).length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          A snapshot of your projects, quotes and invoices.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardTitle>Active projects</CardTitle>
          <p className="mt-2 text-3xl font-semibold">{activeProjects}</p>
        </Card>
        <Card>
          <CardTitle>Total projects</CardTitle>
          <p className="mt-2 text-3xl font-semibold">{projectList.length}</p>
        </Card>
        <Card>
          <CardTitle>Outstanding</CardTitle>
          <p className="mt-2 text-3xl font-semibold">
            {formatMoney(outstanding, outstandingCurrency)}
          </p>
        </Card>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold">
            Recent projects
          </h2>
          <Link
            to="/projects"
            className="text-sm text-[var(--color-primary)]"
          >
            View all
          </Link>
        </div>
        {projects.isLoading ? (
          <Spinner />
        ) : projectList.length === 0 ? (
          <EmptyState
            title="No projects yet"
            description="Your projects will appear here once work begins."
          />
        ) : (
          <div className="grid gap-3">
            {projectList.slice(0, 4).map((p) => (
              <Link
                key={p._id || p.id}
                to={`/projects/${p._id || p.id}`}
                className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 transition-colors duration-150 hover:border-[var(--color-primary)]"
              >
                <div>
                  <p className="font-medium">{p.title || 'Project'}</p>
                  <p className="text-sm text-[var(--color-muted-foreground)]">
                    {p.summary || p.description || '—'}
                  </p>
                </div>
                <StatusBadge status={p.status} />
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold">Invoices</h2>
          <Link to="/invoices" className="text-sm text-[var(--color-primary)]">
            View all
          </Link>
        </div>
        {invoices.isLoading ? (
          <Spinner />
        ) : invoiceList.length === 0 ? (
          <EmptyState title="No invoices yet" />
        ) : (
          <div className="grid gap-3">
            {invoiceList.slice(0, 4).map((inv) => (
              <div
                key={inv._id || inv.id}
                className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4"
              >
                <div>
                  <p className="font-medium">
                    {inv.number || inv.reference || 'Invoice'}
                  </p>
                  <p className="text-sm text-[var(--color-muted-foreground)]">
                    {formatMoney(
                      inv.amountMinor ?? 0,
                      inv.currency || 'USD'
                    )}
                  </p>
                </div>
                <StatusBadge status={inv.status} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

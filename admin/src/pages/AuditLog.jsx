import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import api from '../lib/api.js';
import { formatDate } from '../lib/format.js';
import { PageHeader } from '../components/PageHeader.jsx';
import { Card, Badge, Button, Input, Spinner, EmptyState } from '../components/ui/index.jsx';

const PAGE = 50;

export default function AuditLog() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ['audit-logs', page],
    queryFn: async () => (await api.get('/admin/audit-logs', { params: { page, limit: PAGE } })).data,
    placeholderData: (prev) => prev,
  });

  const all = Array.isArray(data?.data) ? data.data : data?.data?.items || [];
  const needle = q.trim().toLowerCase();
  const rows = needle ? all.filter((l) => JSON.stringify(l).toLowerCase().includes(needle)) : all;
  const pages = Math.max(1, data?.meta?.pages ?? 1);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Audit Log"
        description={`Every privileged action, recorded.${isFetching && !isLoading ? ' Updating…' : ''} Click a row for full details.`}
      />
      <div className="sm:w-72">
        <Input aria-label="Filter this page" placeholder="Filter (action, id, value…)" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : isError ? (
          <div className="p-5">
            <EmptyState title="Could not load audit logs" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No audit entries" />
          </div>
        ) : (
          <div className="-mx-px overflow-x-auto overscroll-x-contain">
            <table className="w-full min-w-[720px] text-sm [&_th]:whitespace-nowrap">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="w-8 px-4 py-3" />
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Target</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((log, i) => {
                  const id = log._id || log.id || i;
                  const expanded = open === id;
                  return (
                    <Fragment key={id}>
                      <tr
                        className="cursor-pointer border-b border-border/60 hover:bg-muted/50"
                        onClick={() => setOpen(expanded ? null : id)}
                        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setOpen(expanded ? null : id)}
                        tabIndex={0}
                        aria-expanded={expanded}
                      >
                        <td className="px-4 py-3">
                          <ChevronRight size={14} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} aria-hidden="true" />
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(log.createdAt || log.timestamp)}</td>
                        <td className="px-4 py-3">{log.actorName || log.actorType || (log.actorId ? String(log.actorId).slice(-6) : 'system')}</td>
                        <td className="px-4 py-3">
                          <Badge variant="primary">{log.action || log.event || '—'}</Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {log.entity || log.target || '—'}
                          {log.entityId ? ` · ${String(log.entityId).slice(-8)}` : ''}
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="border-b border-border/60 bg-muted/30">
                          <td colSpan={5} className="px-4 py-3">
                            <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(log, null, 2)}</pre>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {pages > 1 && (
        <nav className="flex items-center justify-between text-sm" aria-label="Pagination">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-muted-foreground">
            Page {page} of {pages}
          </span>
          <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </nav>
      )}
    </div>
  );
}

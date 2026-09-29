import { useQuery } from '@tanstack/react-query';
import api, { unwrap } from '../lib/api.js';
import { formatDate } from '../lib/format.js';
import { PageHeader } from '../components/PageHeader.jsx';
import { Card, Badge, Spinner, EmptyState } from '../components/ui/index.jsx';

export default function AuditLog() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: () => unwrap(api.get('/admin/audit-logs')),
  });

  const rows = Array.isArray(data) ? data : data?.items || [];

  return (
    <div>
      <PageHeader title="Audit Log" description="Every privileged action, recorded." />

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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Target</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((log, i) => (
                  <tr key={log._id || log.id || i} className="border-b border-border/60">
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(log.createdAt || log.timestamp)}
                    </td>
                    <td className="px-4 py-3">
                      {log.actorName || log.actor || log.userId || 'system'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="primary">{log.action || log.event || '—'}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {log.target || log.resource || log.entity || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

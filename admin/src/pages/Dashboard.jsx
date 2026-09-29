import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import api, { unwrap } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.jsx';
import { Card, CardContent, Spinner, EmptyState } from '../components/ui/index.jsx';

function StatCard({ label, value, sub }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-2 font-heading text-3xl font-semibold">{value}</p>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const summary = useQuery({
    queryKey: ['analytics', 'summary'],
    queryFn: () => unwrap(api.get('/admin/analytics/summary')),
  });

  const funnel = useQuery({
    queryKey: ['analytics', 'funnel'],
    queryFn: () => unwrap(api.get('/admin/analytics/funnel')),
  });

  const s = summary.data || {};
  const cards = [
    { label: 'Total Leads', value: s.totalLeads ?? s.leads ?? '—' },
    { label: 'Active Campaigns', value: s.activeCampaigns ?? s.campaigns ?? '—' },
    { label: 'Open Deals', value: s.openDeals ?? s.deals ?? '—' },
    { label: 'Pending Approvals', value: s.pendingApprovals ?? s.approvals ?? '—' },
  ];

  const funnelData = Array.isArray(funnel.data)
    ? funnel.data.map((d) => ({
        stage: d.stage ?? d.name ?? d.label,
        count: d.count ?? d.value ?? 0,
      }))
    : Array.isArray(funnel.data?.stages)
      ? funnel.data.stages.map((d) => ({
          stage: d.stage ?? d.name,
          count: d.count ?? d.value ?? 0,
        }))
      : [];

  return (
    <div>
      <PageHeader title="Dashboard" description="At-a-glance pipeline health." />

      {summary.isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : summary.isError ? (
        <EmptyState title="Could not load analytics" hint="Check API connectivity." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((c) => (
            <StatCard key={c.label} {...c} />
          ))}
        </div>
      )}

      <Card className="mt-6">
        <CardContent className="p-5">
          <h3 className="mb-4 font-heading text-lg font-semibold">Lead Funnel</h3>
          {funnel.isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : funnelData.length === 0 ? (
            <EmptyState title="No funnel data yet" />
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnelData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="stage" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: '#0c0c0c',
                      border: '1px solid #27272a',
                      borderRadius: 8,
                      color: '#fafafa',
                    }}
                  />
                  <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

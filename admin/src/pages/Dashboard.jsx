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
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import api, { unwrap } from '../lib/api.js';
import { formatMoney } from '../lib/format.js';
import { PageHeader } from '../components/PageHeader.jsx';
import { Card, CardContent, Spinner, EmptyState } from '../components/ui/index.jsx';

function StatCard({ label, value, sub, to, highlight }) {
  return (
    <Link
      to={to}
      className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card className={`h-full transition-colors hover:border-primary/60 ${highlight ? 'border-amber-700' : ''}`}>
        <CardContent className="p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-2 font-heading text-3xl font-semibold tabular-nums">{value}</p>
          {sub && <p className="mt-1 truncate text-xs text-muted-foreground">{sub}</p>}
        </CardContent>
      </Card>
    </Link>
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
  const unpaid = Object.entries(s.unpaidByCurrency || {})
    .filter(([, v]) => v > 0)
    .map(([cur, v]) => formatMoney(v, cur))
    .join(' + ');
  const cards = [
    { label: 'Pending approvals', value: s.pendingApprovals ?? 0, sub: 'Drafts waiting for you', to: '/approvals', highlight: s.pendingApprovals > 0 },
    { label: 'Open deals', value: s.openDeals ?? 0, sub: `${s.wonDeals ?? 0} won so far`, to: '/deals' },
    { label: 'Leads', value: s.leads ?? 0, sub: `+${s.newLeads7d ?? 0} this week`, to: '/leads' },
    { label: 'Active campaigns', value: s.activeCampaigns ?? 0, sub: `${s.sentToday ?? 0} emails sent today`, to: '/campaigns' },
    { label: 'Replies (7 days)', value: s.replies7d ?? 0, sub: 'Inbound emails', to: '/deals' },
    { label: 'Unpaid invoices', value: s.unpaidInvoices ?? 0, sub: unpaid || 'Nothing outstanding', to: '/quotations' },
  ];

  const keys = useQuery({ queryKey: ['api-keys'], queryFn: () => unwrap(api.get('/admin/settings/keys')), staleTime: 60000 });
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

  const problems = (Array.isArray(keys.data) ? keys.data : []).filter((i) => i.configured && i.status && !i.status.ok);

  return (
    <div>
      <PageHeader title="Dashboard" description="What needs your attention today." />
      {problems.length > 0 && (
        <Link to="/keys" className="mb-4 flex items-start gap-2 rounded-lg border border-amber-700/60 bg-amber-950/40 p-3 text-sm text-amber-300 hover:bg-amber-950/60" role="alert">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{problems.map((p) => `${p.name}: ${p.status.reason}`).join(' · ')} — open API keys</span>
        </Link>
      )}

      {summary.isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : summary.isError ? (
        <EmptyState title="Could not load analytics" hint="Check API connectivity." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
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

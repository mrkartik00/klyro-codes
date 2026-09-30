import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { LEAD_STAGES } from '@klyro/shared/enums';
import api, { unwrap } from '../lib/api.js';
import { useToast } from '../hooks/useToast.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import { Card, Button, Input, Label, Select, Badge, Spinner, EmptyState } from '../components/ui/index.jsx';

const stageVariant = (stage) => {
  if (['converted', 'qualified', 'replied'].includes(stage)) return 'success';
  if (['disqualified'].includes(stage)) return 'destructive';
  if (['enrolled', 'enriched'].includes(stage)) return 'primary';
  return 'default';
};
const EMAIL_TONE = { valid: 'success', risky: 'warning', invalid: 'destructive' };
const PAGE = 25;
const EMPTY_LEAD = { name: '', domain: '', email: '', phone: '', country: 'US', category: '' };

/** Flatten a populated lead row for display. */
export function leadRow(l) {
  const org = l.organizationId && typeof l.organizationId === 'object' ? l.organizationId : {};
  const c = l.primaryContactId && typeof l.primaryContactId === 'object' ? l.primaryContactId : {};
  return {
    id: String(l._id || l.id),
    name: org.name || 'Unnamed lead',
    place: [org.category, org.city].filter(Boolean).join(' · '),
    domain: org.domain || '',
    email: c.email || '',
    emailStatus: c.emailStatus,
    stage: l.stage || 'new',
    score: l.score ?? 0,
    source: l.source || '—',
  };
}

function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function Leads() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [stage, setStage] = useState('');
  const [minScore, setMinScore] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_LEAD);
  const search = useDebounced(q);

  useEffect(() => setPage(1), [stage, minScore, search]);

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ['leads', stage, minScore, search, page],
    queryFn: async () => {
      const params = { page, limit: PAGE };
      if (stage) params.stage = stage;
      if (minScore) params.minScore = minScore;
      if (search.trim()) params.q = search.trim();
      const res = await api.get('/admin/leads', { params });
      return res.data; // keep meta for paging
    },
    placeholderData: (prev) => prev,
  });
  const rows = (data?.data || []).map(leadRow);
  const total = data?.meta?.total ?? rows.length;
  const pages = Math.max(1, data?.meta?.pages ?? 1);

  const create = useMutation({
    mutationFn: (body) => unwrap(api.post('/admin/leads', body)),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Lead added');
      setOpen(false);
      setForm(EMPTY_LEAD);
      const id = d?.leadId || d?._id || d?.id || d?.lead?._id;
      if (id) navigate(`/leads/${id}`);
    },
    onError: (e) => toast.error(e.message || 'Could not add lead'),
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Leads"
        description={`${total} lead${total === 1 ? '' : 's'}${isFetching && !isLoading ? ' · updating…' : ''}`}
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus size={16} aria-hidden="true" /> Add lead
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <div className="relative sm:w-72">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input aria-label="Search leads" className="pl-9" placeholder="Search business name…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="sm:w-48">
          <Select aria-label="Filter by stage" value={stage} onChange={(e) => setStage(e.target.value)} className="capitalize">
            <option value="">All stages</option>
            {LEAD_STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
        <div className="sm:w-36">
          <Input aria-label="Minimum score" type="number" inputMode="numeric" placeholder="Min score" value={minScore} onChange={(e) => setMinScore(e.target.value)} />
        </div>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : isError ? (
          <div className="p-5">
            <EmptyState title="Could not load leads" hint="Refresh the page to try again." />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title={search || stage || minScore ? 'No leads match' : 'No leads yet'}
              hint={
                search || stage || minScore ? 'Try clearing the filters.' : 'Run a Google Maps search under Lead Sources, or add one by hand.'
              }
            />
            {!search && !stage && !minScore && (
              <div className="mt-3 flex justify-center">
                <Link to="/targets" className="text-sm text-primary underline">
                  Go to Lead Sources
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="-mx-px overflow-x-auto overscroll-x-contain">
            <table className="w-full min-w-[720px] text-sm [&_th]:whitespace-nowrap">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Business</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3 text-right">Score</th>
                  <th className="px-4 py-3">Source</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    tabIndex={0}
                    onClick={() => navigate(`/leads/${r.id}`)}
                    onKeyDown={(e) => (e.key === 'Enter' ? navigate(`/leads/${r.id}`) : null)}
                    className="cursor-pointer border-b border-border/60 transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium">{r.name}</p>
                      <p className="text-xs text-muted-foreground">{r.place || r.domain || '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      {r.email ? (
                        <span className="flex items-center gap-2">
                          <span className="max-w-[14rem] truncate">{r.email}</span>
                          {r.emailStatus && r.emailStatus !== 'unknown' && <Badge variant={EMAIL_TONE[r.emailStatus] || 'default'}>{r.emailStatus}</Badge>}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={stageVariant(r.stage)}>{r.stage}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.score}</td>
                    <td className="px-4 py-3 capitalize text-muted-foreground">{r.source}</td>
                  </tr>
                ))}
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

      <Dialog open={open} onClose={() => setOpen(false)} title="Add a lead">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const body = Object.fromEntries(Object.entries(form).filter(([, v]) => String(v).trim()));
            create.mutate(body);
          }}
          className="space-y-4"
        >
          <div>
            <Label htmlFor="ln">Business name *</Label>
            <Input id="ln" required value={form.name} onChange={set('name')} placeholder="Acme Dental" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="ld">Website</Label>
              <Input id="ld" value={form.domain} onChange={set('domain')} placeholder="acmedental.com" inputMode="url" />
            </div>
            <div>
              <Label htmlFor="le">Email</Label>
              <Input id="le" type="email" value={form.email} onChange={set('email')} placeholder="hello@acmedental.com" />
            </div>
            <div>
              <Label htmlFor="lp">Phone</Label>
              <Input id="lp" type="tel" value={form.phone} onChange={set('phone')} />
            </div>
            <div>
              <Label htmlFor="lc">Category</Label>
              <Input id="lc" value={form.category} onChange={set('category')} placeholder="dentist" />
            </div>
            <div>
              <Label htmlFor="lco">Country</Label>
              <Select id="lco" value={form.country} onChange={set('country')}>
                <option value="US">United States</option>
                <option value="GB">United Kingdom</option>
              </Select>
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!form.name.trim() || create.isPending}>
              {create.isPending ? 'Adding…' : 'Add lead'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

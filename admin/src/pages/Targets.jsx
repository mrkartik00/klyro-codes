import { useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Play, Upload, Pencil, Pause, Trash2, Square, ExternalLink, CalendarClock } from 'lucide-react';
import api, { unwrap } from '../lib/api.js';
import { SOURCES, SOURCE, srcOf, isPostSource } from '../lib/sources.js';
import { useToast } from '../hooks/useToast.jsx';
import { formatDate } from '../lib/format.js';
import { PageHeader } from '../components/PageHeader.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import { Card, Button, Input, Label, Select, Badge, Spinner, EmptyState, Textarea } from '../components/ui/index.jsx';

const EMPTY = { source: 'maps', group: '', name: '', categories: '', cities: '', country: 'US', maxResults: 100, hasWebsite: 'any', minRating: '', communities: 'forhire, b2bforhire, hireaprogrammer, startups, Entrepreneur, smallbusiness, ecommerce, SaaS', keywords: 'looking for a developer, hire a developer, need an app built, looking for an agency, need a website built, app development company, developer to build', minIntent: 55, maxAgeDays: 14 };
const idOf = (x) => String(x?._id || x?.id || '');
const RUNNING = new Set(['queued', 'running', 'ingesting']);
const JOB_TONE = { queued: 'default', running: 'warning', ingesting: 'warning', enriched: 'success', failed: 'destructive' };

const splitList = (s) =>
  String(s)
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

/** One-line "where" for a saved search. */
export function whereText(t) {
  const s = srcOf(t);
  if (s === 'reddit') return (t.communities || []).map((c) => `r/${c}`).join(', ');
  if (s === 'maps' || s === 'companieshouse') return `${(t.cities || []).join(', ') || 'Whole country'} · ${t.country || 'GB'}`;
  if (s === 'brave') return (t.filters?.sites || ['linkedin.com/posts', 'x.com']).join(', ');
  return SOURCE[s]?.label || s;
}

/** Build the API payload from the simple form. */
export function targetPayload(form) {
  if (form.source === 'reddit') {
    const communities = splitList(form.communities).map((c) => c.replace(/^\/?r\//i, ''));
    const keywords = splitList(form.keywords);
    return {
      source: 'reddit',
      ...(form.group?.trim() ? { group: form.group.trim() } : {}),
      name: form.name.trim() || `Reddit: ${keywords.slice(0, 2).join(', ') || communities.slice(0, 2).join(', ')}`,
      communities,
      keywords,
      maxResults: Math.min(Math.max(Number(form.maxResults) || 50, 1), 500),
      filters: { minIntent: Math.min(Math.max(Number(form.minIntent) || 55, 10), 95) / 100, maxAgeDays: Math.min(Math.max(Number(form.maxAgeDays) || 14, 1), 90) },
    };
  }
  if (!['maps', 'reddit'].includes(form.source)) {
    const keywords = splitList(form.keywords);
    const filters = { minIntent: Math.min(Math.max(Number(form.minIntent) || 55, 10), 95) / 100, maxAgeDays: Math.min(Math.max(Number(form.maxAgeDays) || 3, 1), 90) };
    if (form.source === 'freelancer') Object.assign(filters, { minBudgetUsd: Number(form.minBudgetUsd) || 0, maxBids: Number(form.maxBids) || 80 });
    if (form.source === 'brave') filters.sites = splitList(form.sites);
    if (form.source === 'companieshouse') Object.assign(filters, { days: Number(form.maxAgeDays) || 7 });
    return {
      source: form.source,
      ...(form.group?.trim() ? { group: form.group.trim() } : {}),
      name: form.name.trim() || `${SOURCE[form.source]?.label}: ${keywords.slice(0, 2).join(', ') || 'default'}`,
      keywords,
      cities: splitList(form.cities),
      country: form.source === 'companieshouse' ? 'GB' : form.country,
      maxResults: Math.min(Math.max(Number(form.maxResults) || 25, 1), 500),
      filters,
    };
  }
  const categories = splitList(form.categories);
  const cities = splitList(form.cities);
  const filters = { excludeChains: true };
  if (form.hasWebsite === 'yes') filters.hasWebsite = true;
  if (form.hasWebsite === 'no') filters.hasWebsite = false;
  if (form.minRating !== '' && !Number.isNaN(Number(form.minRating))) filters.minRating = Number(form.minRating);
  return {
    ...(form.group?.trim() ? { group: form.group.trim() } : {}),
    name: form.name.trim() || `${categories.join(', ')} in ${cities.join(', ') || form.country}`,
    country: form.country,
    categories,
    cities,
    maxResults: Math.min(Math.max(Number(form.maxResults) || 100, 1), 1000),
    filters,
  };
}

/** Prefill the form from a saved search (for editing). */
export function formFromTarget(t) {
  const f = t.filters || {};
  return {
    ...EMPTY,
    source: t.source || 'maps',
    group: t.group || '',
    name: t.name || '',
    categories: (t.categories || []).join(', '),
    cities: (t.cities || []).join(', '),
    country: t.country || 'US',
    maxResults: t.maxResults ?? 100,
    hasWebsite: f.hasWebsite === true ? 'yes' : f.hasWebsite === false ? 'no' : 'any',
    minRating: f.minRating ?? '',
    communities: (t.communities || []).join(', '),
    keywords: (t.keywords || []).join(', '),
    minIntent: f.minIntent != null ? Math.round(f.minIntent * 100) : 55,
    maxAgeDays: f.maxAgeDays ?? f.days ?? 14,
    minBudgetUsd: f.minBudgetUsd ?? 150,
    maxBids: f.maxBids ?? 80,
    sites: (f.sites || ['linkedin.com/posts', 'x.com']).join(', '),
  };
}

const STAT_LABEL = { checked: 'Posts read', filtered: 'Not a hire request', duplicates: 'Already saved', notBuyer: 'AI: not a buyer', lowIntent: 'AI: low intent' };

/** One run in full: settings, progress, log and every lead it created. */
function RunDetail({ jobId, onClose }) {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: ['scrape-job', jobId],
    queryFn: () => unwrap(api.get(`/admin/scrape/jobs/${jobId}`)),
    enabled: Boolean(jobId),
    refetchInterval: (x) => (RUNNING.has(x.state.data?.job?.status) ? 4000 : false),
  });
  const stop = useMutation({
    mutationFn: () => unwrap(api.post(`/admin/scrape/jobs/${jobId}/stop`)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scrape-jobs'] });
      qc.invalidateQueries({ queryKey: ['scrape-job', jobId] });
      toast.success('Run stopped');
    },
    onError: (e) => toast.error(e.message || 'Could not stop'),
  });
  const { job, target, leads = [] } = q.data || {};
  const stats = Object.entries(job?.stats || {}).filter(([, v]) => v);
  return (
    <Dialog open={Boolean(jobId)} onClose={onClose} title={target ? `Run — ${target.name}` : 'Run details'} className="max-w-3xl!">
      {q.isLoading || !job ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-5 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={JOB_TONE[job.status] || 'default'}>{job.status === 'enriched' ? 'done' : job.status}</Badge>
            <span className="text-muted-foreground">
              Started {formatDate(job.startedAt || job.createdAt)}
              {job.finishedAt ? ` · finished ${formatDate(job.finishedAt)}` : ''}
            </span>
            {RUNNING.has(job.status) && (
              <Button size="sm" variant="destructive" className="ml-auto" onClick={() => stop.mutate()} disabled={stop.isPending}>
                <Square size={14} aria-hidden="true" /> Stop run
              </Button>
            )}
          </div>
          {job.error && <p className="rounded-lg border border-red-800 bg-red-950/40 p-3 text-red-300">{job.error}</p>}
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Requested', job.requested ?? 0],
              ['Found', job.found ?? 0],
              ['New leads', job.ingested ?? 0],
              ...stats.map(([k, v]) => [STAT_LABEL[k] || k, v]),
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-border p-3">
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="text-lg font-semibold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          {target && (
            <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">Looking for:</span> {[...(target.categories || []), ...(target.keywords || [])].join(', ') || '—'}
              </p>
              <p className="mt-1">
                <span className="font-medium text-foreground">Where:</span>{' '}
                {whereText(target)}
              </p>
            </div>
          )}
          <section>
            <h3 className="mb-2 font-semibold">Leads from this run ({leads.length})</h3>
            {leads.length === 0 ? (
              <p className="text-muted-foreground">No new leads in this run.</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {leads.map((l) => {
                  const org = l.organizationId || {};
                  const c = l.primaryContactId || {};
                  return (
                    <li key={l._id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                      <Link to={`/leads/${l._id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                        {org.name || l.intent?.title || 'Lead'}
                      </Link>
                      <span className="text-xs text-muted-foreground">{[c.email, c.phone || org.phone, org.city].filter(Boolean).join(' · ')}</span>
                      <Badge>{l.score ?? 0}</Badge>
                      {l.sourceUrl && (
                        <a href={l.sourceUrl} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" aria-label="Open original post">
                          <ExternalLink size={14} aria-hidden="true" />
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          {job.log?.length > 0 && (
            <section>
              <h3 className="mb-2 font-semibold">Log</h3>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-3 text-xs">{job.log.join('\n')}</pre>
            </section>
          )}
        </div>
      )}
    </Dialog>
  );
}

/** One saved search: settings, totals, schedules that include it, recent runs. */
function SearchDetail({ id, onClose, onRun, onEdit, onOpenRun }) {
  const q = useQuery({
    queryKey: ['scrape-target', id],
    queryFn: () => unwrap(api.get(`/admin/scrape/targets/${id}`)),
    enabled: Boolean(id),
    refetchInterval: (x) => ((x.state.data?.jobs || []).some((j) => RUNNING.has(j.status)) ? 5000 : false),
  });
  const { target: t, jobs = [], totals, schedules = [] } = q.data || {};
  const f = t?.filters || {};
  const rows = t
    ? !['maps', 'reddit'].includes(srcOf(t))
      ? [
          ['Source', SOURCE[srcOf(t)]?.label],
          ['Phrases', (t.keywords || []).join(', ') || 'defaults'],
          ...(srcOf(t) === 'freelancer' ? [['Min budget', `$${f.minBudgetUsd ?? 150}`], ['Max bids so far', f.maxBids ?? 80]] : []),
          ...(srcOf(t) === 'brave' ? [['Sites', (f.sites || ['linkedin.com/posts', 'x.com']).join(', ')]] : []),
          ['Min buying intent', f.minIntent != null ? `${Math.round(f.minIntent * 100)}%` : '55%'],
          ['Items from last', `${f.maxAgeDays ?? f.days ?? 3} days`],
        ]
      : t.source === 'reddit'
      ? [
          ['Subreddits', (t.communities || []).map((c) => `r/${c}`).join(', ')],
          ['Phrases', (t.keywords || []).join(', ') || 'Hiring boards: [Hiring] posts only'],
          ['Min buying intent', f.minIntent != null ? `${Math.round(f.minIntent * 100)}%` : '55%'],
          ['Posts from last', `${f.maxAgeDays ?? 14} days`],
        ]
      : [
          ['Business types', (t.categories || []).join(', ')],
          ['Cities', `${(t.cities || []).join(', ') || 'Whole country'} · ${t.country}`],
          ['Website', f.hasWebsite === true ? 'Has a website' : f.hasWebsite === false ? 'No website only' : 'Any'],
          ['Min rating', f.minRating ?? 'Any'],
        ]
    : [];
  return (
    <Dialog open={Boolean(id)} onClose={onClose} title={t?.name || 'Search'} className="max-w-3xl!">
      {!t ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-5 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={SOURCE[srcOf(t)]?.tone || 'default'}>{SOURCE[srcOf(t)]?.label}</Badge>
            {t.group && <Badge>{t.group}</Badge>}
            {t.active === false && <Badge>Paused</Badge>}
            <div className="ml-auto flex gap-2">
              <Button size="sm" onClick={() => onRun(idOf(t))}>
                <Play size={14} aria-hidden="true" /> Run now
              </Button>
              <Button size="sm" variant="secondary" onClick={() => onEdit(t)}>
                <Pencil size={14} aria-hidden="true" /> Edit
              </Button>
            </div>
          </div>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {[...rows, ['Max leads per run', t.maxResults], ['Last run', t.lastRunAt ? formatDate(t.lastRunAt) : 'never']].map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="break-words">{String(v ?? '—')}</dd>
              </div>
            ))}
          </dl>
          <dl className="grid grid-cols-3 gap-3">
            {[
              ['Runs', totals?.runs ?? 0],
              ['Found', totals?.found ?? 0],
              ['New leads', totals?.leads ?? 0],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-border p-3">
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="text-lg font-semibold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          <section>
            <h3 className="mb-1 font-semibold">Schedules that run it</h3>
            {schedules.length === 0 ? (
              <p className="text-muted-foreground">
                None — it only runs when you press Run. <Link to="/schedules" className="text-primary hover:underline">Add a schedule</Link>
              </p>
            ) : (
              <ul className="space-y-0.5">
                {schedules.map((s) => (
                  <li key={s._id}>
                    <Link to="/schedules" className="text-primary hover:underline">
                      {s.name}
                    </Link>{' '}
                    <span className="text-xs text-muted-foreground">{s.enabled ? `· next ${formatDate(s.nextRunAt)}` : '· paused'}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h3 className="mb-2 font-semibold">Recent runs</h3>
            {jobs.length === 0 ? (
              <p className="text-muted-foreground">Never run yet.</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {jobs.map((j) => (
                  <li key={idOf(j)}>
                    <button type="button" onClick={() => onOpenRun(idOf(j))} className="flex w-full flex-wrap items-center gap-3 px-3 py-2 text-left hover:bg-muted/50">
                      <Badge variant={JOB_TONE[j.status] || 'default'}>{j.status === 'enriched' ? 'done' : j.status}</Badge>
                      <span className="flex-1 text-xs text-muted-foreground">
                        found {j.found ?? 0} · new {j.ingested ?? 0}
                        {j.scheduleId ? ' · scheduled' : ''}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatDate(j.createdAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Dialog>
  );
}

export default function Targets() {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [csv, setCsv] = useState('');
  const [editId, setEditId] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [runFilter, setRunFilter] = useState('');
  // Saved-search filters
  const [fSource, setFSource] = useState('');
  const [fGroup, setFGroup] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fText, setFText] = useState('');
  // Run filters
  const [rStatus, setRStatus] = useState('');
  const [rSource, setRSource] = useState('');
  const [rPage, setRPage] = useState(1);
  const [tab, setTab] = useState('searches');
  const [sPage, setSPage] = useState(1);
  const [selected, setSelected] = useState(() => new Set());
  const [detailId, setDetailId] = useState(null);
  const fileRef = useRef(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const targets = useQuery({
    queryKey: ['scrape-targets'],
    queryFn: () => unwrap(api.get('/admin/scrape/targets')),
  });
  const jobs = useQuery({
    queryKey: ['scrape-jobs', runFilter, rStatus, rSource, rPage],
    queryFn: async () =>
      (
        await api.get('/admin/scrape/jobs', {
          params: { limit: 25, page: rPage, ...(runFilter ? { targetId: runFilter } : {}), ...(rStatus ? { status: rStatus } : {}), ...(rSource && !runFilter ? { source: rSource } : {}) },
        })
      ).data,
    placeholderData: (prev) => prev,
    // Poll while anything is in flight so progress updates live.
    refetchInterval: (q) => {
      const rows = q.state.data?.data || [];
      return rows.some((j) => RUNNING.has(j.status)) ? 5000 : false;
    },
  });
  const srcStatus = useQuery({ queryKey: ['clip-sources'], queryFn: () => unwrap(api.get('/admin/clip/sources')), staleTime: 60000 });
  const sourceReady = Object.fromEntries((srcStatus.data?.sources || []).map((x) => [x.id, x.ready]));
  const sourceMissing = Object.fromEntries((srcStatus.data?.sources || []).map((x) => [x.id, x.missing]));
  const targetRows = useMemo(() => (Array.isArray(targets.data) ? targets.data : targets.data?.items || []), [targets.data]);
  const jobRows = jobs.data?.data || [];
  const jobPages = Math.max(1, jobs.data?.meta?.pages ?? 1);
  const targetById = Object.fromEntries(targetRows.map((t) => [String(t._id || t.id), t]));
  const shown = useMemo(() => {
    const needle = fText.trim().toLowerCase();
    return targetRows
      .filter((t) => !fSource || srcOf(t) === fSource)
      .filter((t) => !fGroup || (t.group || 'Ungrouped') === fGroup)
      .filter((t) => !fStatus || (fStatus === 'paused' ? t.active === false : t.active !== false))
      .filter(
        (t) =>
          !needle ||
          [t.name, t.group, ...(t.categories || []), ...(t.keywords || []), ...(t.cities || []), ...(t.communities || [])].join(' ').toLowerCase().includes(needle),
      )
      .sort((a, b) => srcOf(a).localeCompare(srcOf(b)) || (a.group || 'Ungrouped').localeCompare(b.group || 'Ungrouped') || a.name.localeCompare(b.name));
  }, [targetRows, fSource, fGroup, fStatus, fText]);
  const counts = { all: targetRows.length, ...Object.fromEntries(SOURCES.map((x) => [x.id, targetRows.filter((t) => srcOf(t) === x.id).length])) };

  const create = useMutation({
    mutationFn: (body) => unwrap(editId ? api.patch(`/admin/scrape/targets/${editId}`, body) : api.post('/admin/scrape/targets', body)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scrape-targets'] });
      toast.success(editId ? 'Search updated' : 'Search saved — press Run to start');
      setOpen(false);
      setEditId(null);
      setForm(EMPTY);
    },
    onError: (e) => toast.error(e.message || 'Could not save target'),
  });
  const run = useMutation({
    mutationFn: (id) => unwrap(api.post(`/admin/scrape/targets/${id}/run`)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scrape-jobs'] });
      toast.success('Scrape started — leads appear as they are found');
    },
    onError: (e) => toast.error(e.message || 'Could not start scrape'),
  });
  const toggle = useMutation({
    mutationFn: ({ id, active }) => unwrap(api.patch(`/admin/scrape/targets/${id}`, { active })),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['scrape-targets'] });
      toast.success(v.active ? 'Search resumed' : 'Search paused — scheduled scans skip it');
    },
    onError: (e) => toast.error(e.message || 'Could not update'),
  });
  const remove = useMutation({
    mutationFn: (id) => unwrap(api.delete(`/admin/scrape/targets/${id}`)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scrape-targets'] });
      toast.success('Search deleted (its leads are kept)');
    },
    onError: (e) => toast.error(e.message || 'Could not delete'),
  });
  const openEdit = (t) => {
    setEditId(String(t._id || t.id));
    setForm(formFromTarget(t));
    setOpen(true);
  };
  const bulk = useMutation({
    mutationFn: (body) => unwrap(api.post('/admin/scrape/targets/bulk', { ids: [...selected], ...body })),
    onSuccess: (d, v) => {
      qc.invalidateQueries({ queryKey: ['scrape-targets'] });
      toast.success(`${v.action === 'delete' ? 'Deleted' : 'Updated'} ${d?.updated ?? 0} search(es)`);
      setSelected(new Set());
    },
    onError: (e) => toast.error(e.message || 'Bulk action failed'),
  });
  const importCsv = useMutation({
    mutationFn: (text) => unwrap(api.post('/admin/scrape/import-csv', { csv: text })),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      toast.success(`Imported ${d?.received ?? 0} rows · ${d?.created ?? 0} new leads`);
      setCsvOpen(false);
      setCsv('');
    },
    onError: (e) => toast.error(e.message || 'Import failed'),
  });

  const payload = targetPayload(form);
  // Hiring boards need no phrases (they're read in full), so only subreddits are required.
  const canSave = form.source === 'reddit' ? payload.communities.length > 0 : form.source === 'maps' ? payload.categories.length > 0 : true;

  const PER_PAGE = 15;
  const pageRows = shown.slice((sPage - 1) * PER_PAGE, sPage * PER_PAGE);
  const sPages = Math.max(1, Math.ceil(shown.length / PER_PAGE));
  const pickCategory = (source, group) => {
    setFSource(source);
    setFGroup(group);
    setSPage(1);
    setSelected(new Set());
  };
  const nav = SOURCES.filter((x) => counts[x.id]).map(({ id: src, label }) => ({
    src,
    label,
    total: counts[src],
    groups: [...new Set(targetRows.filter((t) => srcOf(t) === src).map((t) => t.group || 'Ungrouped'))]
      .sort()
      .map((g) => ({ g, n: targetRows.filter((t) => srcOf(t) === src && (t.group || 'Ungrouped') === g).length })),
  }));
  const allOnPage = pageRows.length > 0 && pageRows.every((t) => selected.has(idOf(t)));
  const toggleSel = (id) =>
    setSelected((s0) => {
      const n = new Set(s0);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const liveRuns = jobRows.some((j) => RUNNING.has(j.status));
  const navBtn = (active) =>
    `flex min-h-9 w-full items-center justify-between rounded-md px-2 text-left text-sm ${active ? 'bg-primary/15 font-medium text-foreground' : 'text-muted-foreground hover:bg-muted'}`;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Lead Sources"
        description="Saved searches for Google Maps and Reddit. Run them by hand, or automate them in Schedules."
        actions={
          <>
            <Button variant="secondary" onClick={() => setCsvOpen(true)}>
              <Upload size={16} aria-hidden="true" /> Import CSV
            </Button>
            <Button
              onClick={() => {
                setEditId(null);
                setForm({ ...EMPTY, source: fSource || 'maps', group: fGroup && fGroup !== 'Ungrouped' ? fGroup : '' });
                setOpen(true);
              }}
            >
              <Plus size={16} aria-hidden="true" /> New search
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2 border-b border-border" role="tablist" aria-label="Lead Sources sections">
        {[
          ['searches', `Searches (${counts.all})`],
          ['runs', 'Runs'],
        ].map(([v, label]) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={tab === v}
            onClick={() => setTab(v)}
            className={`-mb-px min-h-11 border-b-2 px-4 text-sm font-medium ${tab === v ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {label}
            {v === 'runs' && liveRuns && <span className="ml-2 inline-block size-2 rounded-full bg-amber-400 align-middle" aria-label="runs in progress" />}
          </button>
        ))}
        <Link to="/schedules" className="ml-auto flex min-h-11 items-center gap-1 px-2 text-sm text-primary hover:underline">
          <CalendarClock size={14} aria-hidden="true" /> Schedules
        </Link>
      </div>

      {tab === 'searches' ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[15rem_1fr]">
          {/* Category navigation */}
          <nav aria-label="Categories" className="hidden lg:block">
            <Card className="sticky top-4 max-h-[calc(100dvh-2rem)] space-y-3 overflow-y-auto p-2">
              <button type="button" className={navBtn(!fSource && !fGroup)} onClick={() => pickCategory('', '')}>
                <span>All searches</span>
                <span className="text-xs">{counts.all}</span>
              </button>
              {nav.map((sec) => (
                <div key={sec.src}>
                  <button type="button" className={`${navBtn(fSource === sec.src && !fGroup)} font-semibold`} onClick={() => pickCategory(sec.src, '')}>
                    <span>{sec.label}</span>
                    <span className="text-xs">{sec.total}</span>
                  </button>
                  <ul className="ml-2 border-l border-border pl-2">
                    {sec.groups.map(({ g, n }) => (
                      <li key={g}>
                        <button type="button" className={navBtn(fSource === sec.src && fGroup === g)} onClick={() => pickCategory(sec.src, g)}>
                          <span className="truncate">{g}</span>
                          <span className="text-xs">{n}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </Card>
          </nav>

          <div className="min-w-0 space-y-3">
            {/* Mobile category picker + filters */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Select
                aria-label="Category"
                className="lg:hidden"
                value={`${fSource}|${fGroup}`}
                onChange={(e) => {
                  const [src, g] = e.target.value.split('|');
                  pickCategory(src, g);
                }}
              >
                <option value="|">All searches ({counts.all})</option>
                {nav.map((sec) => [
                  <option key={sec.src} value={`${sec.src}|`}>
                    {sec.label} — all ({sec.total})
                  </option>,
                  ...sec.groups.map(({ g, n }) => (
                    <option key={`${sec.src}${g}`} value={`${sec.src}|${g}`}>
                      {sec.label} · {g} ({n})
                    </option>
                  )),
                ])}
              </Select>
              <Input
                aria-label="Search saved searches"
                placeholder="Search name, niche, city, subreddit…"
                value={fText}
                onChange={(e) => {
                  setFText(e.target.value);
                  setSPage(1);
                }}
                className="sm:col-span-1 lg:col-span-2"
              />
              <Select
                aria-label="Filter by status"
                value={fStatus}
                onChange={(e) => {
                  setFStatus(e.target.value);
                  setSPage(1);
                }}
              >
                <option value="">Active and paused</option>
                <option value="active">Active only</option>
                <option value="paused">Paused only</option>
              </Select>
            </div>

            {selected.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-card p-3 text-sm" role="region" aria-label="Bulk actions">
                <span className="font-medium">{selected.size} selected</span>
                <Button size="sm" variant="secondary" onClick={() => bulk.mutate({ action: 'pause' })} disabled={bulk.isPending}>
                  Pause
                </Button>
                <Button size="sm" variant="secondary" onClick={() => bulk.mutate({ action: 'resume' })} disabled={bulk.isPending}>
                  Resume
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={bulk.isPending}
                  onClick={() => {
                    const g = window.prompt('Move to category', fGroup && fGroup !== 'Ungrouped' ? fGroup : '');
                    if (g?.trim()) bulk.mutate({ action: 'group', group: g.trim() });
                  }}
                >
                  Move to category
                </Button>
                <Button size="sm" variant="destructive" disabled={bulk.isPending} onClick={() => window.confirm(`Delete ${selected.size} search(es)? Their leads are kept.`) && bulk.mutate({ action: 'delete' })}>
                  Delete
                </Button>
                <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>
                  Clear
                </Button>
              </div>
            )}

            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5 text-sm">
                <span className="font-semibold">
                  {fGroup || (fSource ? SOURCE[fSource]?.label : 'All searches')}
                  <span className="ml-2 font-normal text-muted-foreground">{shown.length} search{shown.length === 1 ? '' : 'es'}</span>
                </span>
                <span className="text-xs text-muted-foreground">Click a search for details</span>
              </div>
              {targets.isLoading ? (
                <div className="flex justify-center py-12">
                  <Spinner />
                </div>
              ) : shown.length === 0 ? (
                <div className="p-5">
                  <EmptyState title={targetRows.length ? 'No searches match' : 'No searches yet'} hint={targetRows.length ? 'Try another category or clear the filters.' : 'Create one with New search.'} />
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  <li className="flex items-center gap-3 bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      className="size-4"
                      aria-label="Select all on this page"
                      checked={allOnPage}
                      onChange={() =>
                        setSelected((s0) => {
                          const n = new Set(s0);
                          pageRows.forEach((t) => (allOnPage ? n.delete(idOf(t)) : n.add(idOf(t))));
                          return n;
                        })
                      }
                    />
                    <span className="flex-1">Search</span>
                    <span className="hidden w-28 sm:block">Last run</span>
                    <span className="w-44 text-right">Actions</span>
                  </li>
                  {pageRows.map((t) => {
                    const id = idOf(t);
                    const what = [...(t.categories || []), ...(t.keywords || [])].join(', ') || (t.source === 'reddit' ? '[Hiring] posts' : isPostSource(srcOf(t)) ? 'default buyer phrases' : '—');
                    const where = whereText(t);
                    return (
                      <li key={id} className={`flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 ${t.active === false ? 'opacity-60' : ''}`}>
                        <input type="checkbox" className="size-4" aria-label={`Select ${t.name}`} checked={selected.has(id)} onChange={() => toggleSel(id)} />
                        <button type="button" onClick={() => setDetailId(id)} className="min-w-0 flex-1 text-left">
                          <span className="flex items-center gap-2">
                            <span className="truncate font-medium hover:underline">{t.name}</span>
                            {!fSource && <Badge variant={SOURCE[srcOf(t)]?.tone || 'default'}>{SOURCE[srcOf(t)]?.short}</Badge>}
                            {t.active === false && <Badge>Paused</Badge>}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {what} · {where} · max {t.maxResults}
                          </span>
                        </button>
                        <span className="hidden w-28 shrink-0 text-xs text-muted-foreground sm:block">{t.lastRunAt ? formatDate(t.lastRunAt) : 'never'}</span>
                        <div className="flex w-44 shrink-0 justify-end gap-1">
                          <Button size="sm" onClick={() => run.mutate(id)} disabled={run.isPending && run.variables === id} aria-label={`Run ${t.name}`}>
                            <Play size={14} aria-hidden="true" /> Run
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => openEdit(t)} aria-label={`Edit ${t.name}`}>
                            <Pencil size={14} aria-hidden="true" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => toggle.mutate({ id, active: t.active === false })} aria-label={t.active === false ? `Resume ${t.name}` : `Pause ${t.name}`}>
                            {t.active === false ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => window.confirm(`Delete "${t.name}"? Leads it found are kept.`) && remove.mutate(id)} aria-label={`Delete ${t.name}`}>
                            <Trash2 size={14} aria-hidden="true" />
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {sPages > 1 && (
                <nav className="flex items-center justify-between border-t border-border px-4 py-2.5 text-sm" aria-label="Searches pagination">
                  <Button variant="secondary" size="sm" disabled={sPage <= 1} onClick={() => setSPage((p0) => p0 - 1)}>
                    Previous
                  </Button>
                  <span className="text-muted-foreground">
                    Page {sPage} of {sPages}
                  </span>
                  <Button variant="secondary" size="sm" disabled={sPage >= sPages} onClick={() => setSPage((p0) => p0 + 1)}>
                    Next
                  </Button>
                </nav>
              )}
            </Card>
          </div>
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-1 gap-2 border-b border-border p-3 sm:grid-cols-3">
            <Select
              aria-label="Filter runs by search"
              value={runFilter}
              onChange={(e) => {
                setRunFilter(e.target.value);
                setRPage(1);
              }}
            >
              <option value="">All searches</option>
              {[...targetRows]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((t) => (
                  <option key={idOf(t)} value={idOf(t)}>
                    {t.name}
                  </option>
                ))}
            </Select>
            <Select
              aria-label="Filter runs by source"
              value={rSource}
              disabled={Boolean(runFilter)}
              onChange={(e) => {
                setRSource(e.target.value);
                setRPage(1);
              }}
            >
              <option value="">All sources</option>
              <option value="maps">Google Maps</option>
              <option value="reddit">Reddit</option>
            </Select>
            <Select
              aria-label="Filter runs by status"
              value={rStatus}
              onChange={(e) => {
                setRStatus(e.target.value);
                setRPage(1);
              }}
            >
              <option value="">Any status</option>
              <option value="running">Running / queued</option>
              <option value="enriched">Done</option>
              <option value="failed">Failed / stopped</option>
            </Select>
          </div>
          {jobs.isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : jobRows.length === 0 ? (
            <div className="p-5">
              <EmptyState title={runFilter || rStatus || rSource ? 'No runs match these filters' : 'No runs yet'} hint="Runs show here with live progress." />
            </div>
          ) : (
            <div className="-mx-px overflow-x-auto overscroll-x-contain">
              <table className="w-full min-w-[720px] text-sm [&_th]:whitespace-nowrap">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3">Search</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Found</th>
                    <th className="px-4 py-3">New leads</th>
                    <th className="px-4 py-3">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {jobRows.map((j) => {
                    const t = targetById[String(j.scrapeTargetId)];
                    return (
                      <tr
                        key={idOf(j)}
                        className="cursor-pointer border-b border-border/60 hover:bg-muted/50"
                        onClick={() => setJobId(idOf(j))}
                        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setJobId(idOf(j))}
                        tabIndex={0}
                        aria-label="Open run details"
                      >
                        <td className="px-4 py-3">
                          {t?.name || 'Deleted search'}
                          {j.scheduleId && <span className="ml-2 text-xs text-muted-foreground">(scheduled)</span>}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={SOURCE[srcOf(t)]?.tone || 'default'}>{SOURCE[srcOf(t)]?.short || 'Deleted'}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={JOB_TONE[j.status] || 'default'}>{j.status === 'enriched' ? 'done' : j.status}</Badge>
                          {j.error && <p className="mt-1 max-w-xs text-xs text-destructive">{j.error}</p>}
                        </td>
                        <td className="px-4 py-3">{j.found ?? 0}</td>
                        <td className="px-4 py-3">{j.ingested ?? 0}</td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(j.createdAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {jobPages > 1 && (
            <nav className="flex items-center justify-between border-t border-border px-4 py-3 text-sm" aria-label="Runs pagination">
              <Button variant="secondary" size="sm" disabled={rPage <= 1} onClick={() => setRPage((p0) => p0 - 1)}>
                Previous
              </Button>
              <span className="text-muted-foreground">
                Page {rPage} of {jobPages}
              </span>
              <Button variant="secondary" size="sm" disabled={rPage >= jobPages} onClick={() => setRPage((p0) => p0 + 1)}>
                Next
              </Button>
            </nav>
          )}
        </Card>
      )}

      <SearchDetail
        id={detailId}
        onClose={() => setDetailId(null)}
        onRun={(id) => run.mutate(id)}
        onEdit={(t) => {
          setDetailId(null);
          openEdit(t);
        }}
        onOpenRun={(jid) => setJobId(jid)}
      />

      <RunDetail jobId={jobId} onClose={() => setJobId(null)} />

      <Dialog open={open} onClose={() => setOpen(false)} title={editId ? 'Edit lead search' : 'New lead search'}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSave) create.mutate(payload);
          }}
          className="space-y-4"
        >
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Where to look</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup">
              {SOURCES.map(({ id: v, label, hint }) => (
                <label
                  key={v}
                  className={`cursor-pointer rounded-lg border p-3 text-sm transition-colors ${form.source === v ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'}`}
                >
                  <input type="radio" name="source" value={v} checked={form.source === v} onChange={set('source')} className="sr-only" />
                  <span className="block font-medium">{label}</span>
                  <span className="block text-xs text-muted-foreground">{hint}</span>
                  {sourceReady[v] === false && <span className="mt-1 block text-xs text-amber-400">Needs setup: {(sourceMissing[v] || []).join(', ')}</span>}
                </label>
              ))}
            </div>
          </fieldset>

          {!['maps', 'reddit'].includes(form.source) ? (
            <>
              {form.source !== 'companieshouse' && form.source !== 'tenders' && (
                <div>
                  <Label htmlFor="kw2">Phrases buyers use</Label>
                  <Textarea id="kw2" rows={2} value={form.keywords} onChange={set('keywords')} placeholder="leave empty for the default buyer phrases" />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {form.source === 'freelancer' ? 'Project search words, e.g. website, mobile app, shopify.' : 'Exact phrases, comma-separated, e.g. looking for a developer, need an app built.'}
                  </p>
                </div>
              )}
              {form.source === 'freelancer' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="minBudget">Min budget (USD)</Label>
                    <Input id="minBudget" type="number" min="0" value={form.minBudgetUsd ?? 150} onChange={set('minBudgetUsd')} />
                  </div>
                  <div>
                    <Label htmlFor="maxBids">Skip projects with more bids than</Label>
                    <Input id="maxBids" type="number" min="1" value={form.maxBids ?? 80} onChange={set('maxBids')} />
                  </div>
                </div>
              )}
              {form.source === 'brave' && (
                <div>
                  <Label htmlFor="sites">Sites to search</Label>
                  <Input id="sites" value={form.sites ?? 'linkedin.com/posts, x.com'} onChange={set('sites')} />
                  <p className="mt-1 text-xs text-muted-foreground">Also works: threads.net, facebook.com/groups, indiehackers.com, quora.com</p>
                </div>
              )}
              {form.source === 'companieshouse' && (
                <div>
                  <Label htmlFor="chcity">Town / city (optional)</Label>
                  <Input id="chcity" value={form.cities} onChange={set('cities')} placeholder="Manchester" />
                </div>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {form.source !== 'companieshouse' && (
                  <div>
                    <Label htmlFor="minIntent2">Min buying intent %</Label>
                    <Input id="minIntent2" type="number" min="10" max="95" value={form.minIntent} onChange={set('minIntent')} />
                  </div>
                )}
                <div>
                  <Label htmlFor="age2">{form.source === 'companieshouse' ? 'Incorporated in last (days)' : 'Items from last (days)'}</Label>
                  <Input id="age2" type="number" min="1" max="90" value={form.maxAgeDays} onChange={set('maxAgeDays')} />
                </div>
                <div>
                  <Label htmlFor="max2">Max leads per run</Label>
                  <Input id="max2" type="number" min="1" max="500" value={form.maxResults} onChange={set('maxResults')} />
                </div>
              </div>
              <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">{SOURCE[form.source]?.hint}. The AI keeps only real buyers and drafts a reply for Approvals — nothing is posted for you.</p>
            </>
          ) : form.source === 'reddit' ? (
            <>
              <div>
                <Label htmlFor="keywords">Phrases buyers use</Label>
                <Textarea id="keywords" rows={2} value={form.keywords} onChange={set('keywords')} />
                <p className="mt-1 text-xs text-muted-foreground">
                  Comma-separated, searched in each subreddit. Hiring boards (r/forhire, r/b2bforhire, r/hireaprogrammer) are read
                  in full — only [Hiring] posts for websites/apps are kept.
                </p>
              </div>
              <div>
                <Label htmlFor="communities">Subreddits *</Label>
                <Input id="communities" value={form.communities} onChange={set('communities')} placeholder="smallbusiness, Entrepreneur" />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="minIntent">Min buying intent %</Label>
                  <Input id="minIntent" type="number" min="10" max="95" inputMode="numeric" value={form.minIntent} onChange={set('minIntent')} />
                </div>
                <div>
                  <Label htmlFor="maxAgeDays">Posts from last (days)</Label>
                  <Input id="maxAgeDays" type="number" min="1" max="90" inputMode="numeric" value={form.maxAgeDays} onChange={set('maxAgeDays')} />
                </div>
                <div>
                  <Label htmlFor="maxResultsR">Max leads per run</Label>
                  <Input id="maxResultsR" type="number" min="1" max="500" inputMode="numeric" value={form.maxResults} onChange={set('maxResults')} />
                </div>
              </div>
              <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                Runs every 30 minutes. Only people who want to <strong>hire</strong> someone to build a website, web app or
                Android/iOS app are kept — developers, agencies, job seekers and do-it-yourself questions are dropped. Each lead
                includes the post, the author&apos;s profile and a reply draft for you to post (Approvals).
              </p>
            </>
          ) : (
          <>
          <div>
            <Label htmlFor="categories">Business types *</Label>
            <Input id="categories" required value={form.categories} onChange={set('categories')} placeholder="dentist, plumber" />
            <p className="mt-1 text-xs text-muted-foreground">Separate with commas.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Label htmlFor="cities">Cities</Label>
              <Input id="cities" value={form.cities} onChange={set('cities')} placeholder="Austin, Dallas" />
            </div>
            <div>
              <Label htmlFor="country">Country</Label>
              <Select id="country" value={form.country} onChange={set('country')}>
                <option value="US">United States</option>
                <option value="GB">United Kingdom</option>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="website">Website</Label>
              <Select id="website" value={form.hasWebsite} onChange={set('hasWebsite')}>
                <option value="any">Any</option>
                <option value="yes">Has a website</option>
                <option value="no">No website</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="minRating">Min rating</Label>
              <Input id="minRating" type="number" min="0" max="5" step="0.1" inputMode="decimal" value={form.minRating} onChange={set('minRating')} placeholder="e.g. 4" />
            </div>
            <div>
              <Label htmlFor="maxResults">Max leads</Label>
              <Input id="maxResults" type="number" min="1" max="1000" inputMode="numeric" value={form.maxResults} onChange={set('maxResults')} />
            </div>
          </div>
          </>
          )}
          <div>
            <Label htmlFor="group">Category (optional)</Label>
            <Input id="group" list="target-groups" value={form.group} onChange={set('group')} placeholder="e.g. Home services" />
            <datalist id="target-groups">
              {[...new Set(targetRows.map((t) => t.group).filter(Boolean))].sort().map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </div>
          <div>
            <Label htmlFor="name">Name (optional)</Label>
            <Input id="name" value={form.name} onChange={set('name')} placeholder={payload.name || 'Austin dentists'} />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSave || create.isPending}>
              {create.isPending ? 'Saving…' : editId ? 'Save changes' : 'Save search'}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={csvOpen} onClose={() => setCsvOpen(false)} title="Import leads from CSV">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (csv.trim()) importCsv.mutate(csv);
          }}
          className="space-y-4"
        >
          <p className="text-sm text-muted-foreground">
            First row must be headers. Supported columns: <code>name, website, email, phone, city, country, category</code>.
            Duplicates are merged automatically.
          </p>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              id="csvfile"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setCsv(await f.text());
              }}
            />
            <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
              <Upload size={16} aria-hidden="true" /> Choose file
            </Button>
          </div>
          <div>
            <Label htmlFor="csvtext">…or paste CSV</Label>
            <Textarea id="csvtext" rows={6} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={'name,website,email\nAcme Dental,acmedental.com,hello@acmedental.com'} />
            {csv && <p className="mt-1 text-xs text-muted-foreground">{Math.max(csv.trim().split('\n').length - 1, 0)} rows</p>}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setCsvOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!csv.trim() || importCsv.isPending}>
              {importCsv.isPending ? 'Importing…' : 'Import'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

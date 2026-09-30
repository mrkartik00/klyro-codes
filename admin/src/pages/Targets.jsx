import { Fragment, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Play, Upload, Pencil, Pause, Trash2, Square, ExternalLink } from 'lucide-react';
import api, { unwrap } from '../lib/api.js';
import { useToast } from '../hooks/useToast.jsx';
import { formatDate } from '../lib/format.js';
import { PageHeader } from '../components/PageHeader.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import { Card, Button, Input, Label, Select, Badge, Spinner, EmptyState, Textarea } from '../components/ui/index.jsx';

const EMPTY = { source: 'maps', group: '', name: '', categories: '', cities: '', country: 'US', maxResults: 100, hasWebsite: 'any', minRating: '', communities: 'forhire, b2bforhire, hireaprogrammer, startups, Entrepreneur, smallbusiness, ecommerce, SaaS', keywords: 'looking for a developer, hire a developer, need an app built, looking for an agency, need a website built, app development company, developer to build', minIntent: 55, maxAgeDays: 14 };
const RUNNING = new Set(['queued', 'running', 'ingesting']);
const JOB_TONE = { queued: 'default', running: 'warning', ingesting: 'warning', enriched: 'success', failed: 'destructive' };

const splitList = (s) =>
  String(s)
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

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
    maxAgeDays: f.maxAgeDays ?? 14,
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
                {target.source === 'reddit'
                  ? (target.communities || []).map((c) => `r/${c}`).join(', ')
                  : `${(target.cities || []).join(', ') || 'Whole country'} · ${target.country}`}
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
  const targetRows = Array.isArray(targets.data) ? targets.data : targets.data?.items || [];
  const jobRows = jobs.data?.data || [];
  const jobPages = Math.max(1, jobs.data?.meta?.pages ?? 1);
  const targetById = Object.fromEntries(targetRows.map((t) => [String(t._id || t.id), t]));
  const targetName = Object.fromEntries(targetRows.map((t) => [String(t._id || t.id), t.name]));
  const srcOf = (t) => (t?.source === 'reddit' ? 'reddit' : 'maps');
  const groups = useMemo(
    () => [...new Set(targetRows.filter((t) => !fSource || srcOf(t) === fSource).map((t) => t.group || 'Ungrouped'))].sort(),
    [targetRows, fSource],
  );
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
  const counts = { all: targetRows.length, maps: targetRows.filter((t) => srcOf(t) === 'maps').length, reddit: targetRows.filter((t) => srcOf(t) === 'reddit').length };

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
  const canSave = form.source === 'reddit' ? payload.communities.length > 0 : payload.categories.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lead Sources"
        description="Find businesses on Google Maps, people asking for help on Reddit, or import your own list."
        actions={
          <>
            <Button variant="secondary" onClick={() => setCsvOpen(true)}>
              <Upload size={16} aria-hidden="true" /> Import CSV
            </Button>
            <Button
              onClick={() => {
                setEditId(null);
                setForm(EMPTY);
                setOpen(true);
              }}
            >
              <Plus size={16} aria-hidden="true" /> New search
            </Button>
          </>
        }
      />

      <Card className="overflow-hidden">
        <div className="space-y-3 border-b border-border px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold">
              Saved searches <span className="font-normal text-muted-foreground">· {shown.length} shown</span>
            </span>
            <div className="flex rounded-lg border border-border p-0.5 text-xs" role="tablist" aria-label="Source">
              {[
                ['', `All (${counts.all})`],
                ['maps', `Google Maps (${counts.maps})`],
                ['reddit', `Reddit (${counts.reddit})`],
              ].map(([v, label]) => (
                <button
                  key={v || 'all'}
                  type="button"
                  role="tab"
                  aria-selected={fSource === v}
                  onClick={() => {
                    setFSource(v);
                    setFGroup('');
                  }}
                  className={`min-h-9 rounded-md px-3 ${fSource === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Input aria-label="Search saved searches" placeholder="Search name, niche, city, subreddit…" value={fText} onChange={(e) => setFText(e.target.value)} />
            <Select aria-label="Filter by category" value={fGroup} onChange={(e) => setFGroup(e.target.value)}>
              <option value="">All categories</option>
              {groups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </Select>
            <Select aria-label="Filter by status" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
              <option value="">Active and paused</option>
              <option value="active">Active only</option>
              <option value="paused">Paused only</option>
            </Select>
          </div>
        </div>
        {targets.isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : targetRows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No searches yet"
              hint='Create one like "dentist" in "Austin, Dallas" and press Run.'
            />
          </div>
        ) : (
          <div className="-mx-px overflow-x-auto overscroll-x-contain">
            <table className="w-full min-w-[720px] text-sm [&_th]:whitespace-nowrap">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Search</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Looking for</th>
                  <th className="px-4 py-3">Where</th>
                  <th className="px-4 py-3">Max</th>
                  <th className="px-4 py-3">Last run</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      No searches match these filters.
                    </td>
                  </tr>
                )}
                {shown.map((t, i) => {
                  const id = String(t._id || t.id);
                  const header = `${srcOf(t)}|${t.group || 'Ungrouped'}`;
                  const prev = shown[i - 1];
                  const newGroup = !prev || `${srcOf(prev)}|${prev.group || 'Ungrouped'}` !== header;
                  return (
                    <Fragment key={id}>
                    {newGroup && (
                      <tr className="border-b border-border bg-muted/40">
                        <th colSpan={7} scope="colgroup" className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {srcOf(t) === 'reddit' ? 'Reddit' : 'Google Maps'} · {t.group || 'Ungrouped'}
                        </th>
                      </tr>
                    )}
                    <tr className={`border-b border-border/60 ${t.active === false ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-3 font-medium">
                        <button type="button" className="text-left hover:underline" onClick={() => setRunFilter(id)} title="Show this search's runs">
                          {t.name}
                        </button>
                        {t.active === false && (
                          <Badge className="ml-2">Paused</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={t.source === 'reddit' ? 'warning' : 'primary'}>{t.source === 'reddit' ? 'Reddit' : 'Google Maps'}</Badge>
                      </td>
                      <td className="max-w-[16rem] truncate px-4 py-3">{[...(t.categories || []), ...(t.keywords || [])].join(', ') || (t.source === 'reddit' ? '[Hiring] posts' : '—')}</td>
                      <td className="max-w-[14rem] truncate px-4 py-3">
                        {t.source === 'reddit'
                          ? (t.communities || []).map((c) => `r/${c}`).join(', ') || 'r/smallbusiness'
                          : `${(t.cities || []).join(', ') || 'Whole country'} · ${t.country}`}
                      </td>
                      <td className="px-4 py-3">{t.maxResults}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{t.lastRunAt ? formatDate(t.lastRunAt) : 'never'}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" onClick={() => run.mutate(id)} disabled={run.isPending && run.variables === id} aria-label={`Run ${t.name}`}>
                            <Play size={14} aria-hidden="true" /> Run
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => openEdit(t)} aria-label={`Edit ${t.name}`}>
                            <Pencil size={14} aria-hidden="true" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => toggle.mutate({ id, active: t.active === false })}
                            aria-label={t.active === false ? `Resume ${t.name}` : `Pause ${t.name}`}
                            title={t.active === false ? 'Resume' : 'Pause'}
                          >
                            {t.active === false ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => window.confirm(`Delete "${t.name}"? Leads it found are kept.`) && remove.mutate(id)}
                            aria-label={`Delete ${t.name}`}
                          >
                            <Trash2 size={14} aria-hidden="true" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="space-y-3 border-b border-border px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold">
              Recent runs <span className="font-normal text-muted-foreground">· click a run for details</span>
            </span>
            {jobRows.some((j) => RUNNING.has(j.status)) && (
              <span className="text-xs text-muted-foreground" aria-live="polite">
                Updating live…
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
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
                  <option key={String(t._id || t.id)} value={String(t._id || t.id)}>
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
            <table className="w-full min-w-[640px] text-sm [&_th]:whitespace-nowrap">
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
                {jobRows.map((j) => (
                  <tr
                    key={String(j._id || j.id)}
                    className="cursor-pointer border-b border-border/60 hover:bg-muted/50"
                    onClick={() => setJobId(String(j._id || j.id))}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setJobId(String(j._id || j.id))}
                    tabIndex={0}
                    aria-label="Open run details"
                  >
                    <td className="px-4 py-3">{targetName[String(j.scrapeTargetId)] || 'Deleted search'}</td>
                    <td className="px-4 py-3">
                      <Badge variant={srcOf(targetById[String(j.scrapeTargetId)]) === 'reddit' ? 'warning' : 'primary'}>
                        {srcOf(targetById[String(j.scrapeTargetId)]) === 'reddit' ? 'Reddit' : 'Maps'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={JOB_TONE[j.status] || 'default'}>
                        {j.status === 'enriched' ? 'done' : j.status}
                      </Badge>
                      {j.error && <p className="mt-1 max-w-xs text-xs text-destructive">{j.error}</p>}
                    </td>
                    <td className="px-4 py-3">{j.found ?? 0}</td>
                    <td className="px-4 py-3">{j.ingested ?? 0}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(j.createdAt)}</td>
                  </tr>
                ))}
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
            <div className="grid grid-cols-2 gap-2" role="radiogroup">
              {[
                ['maps', 'Google Maps', 'Local businesses by type & city'],
                ['reddit', 'Reddit', 'People hiring someone to build a website or app'],
              ].map(([v, label, hint]) => (
                <label
                  key={v}
                  className={`cursor-pointer rounded-lg border p-3 text-sm transition-colors ${form.source === v ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'}`}
                >
                  <input type="radio" name="source" value={v} checked={form.source === v} onChange={set('source')} className="sr-only" />
                  <span className="block font-medium">{label}</span>
                  <span className="block text-xs text-muted-foreground">{hint}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {form.source === 'reddit' ? (
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

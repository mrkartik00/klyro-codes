import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Play, Pause, Pencil, Trash2, CalendarClock } from 'lucide-react';
import api, { unwrap } from '../lib/api.js';
import { useToast } from '../hooks/useToast.jsx';
import { formatDate } from '../lib/format.js';
import { PageHeader } from '../components/PageHeader.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import { Card, Button, Input, Label, Select, Badge, Spinner, EmptyState } from '../components/ui/index.jsx';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TIMEZONES = ['Asia/Kolkata', 'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London'];
const JOB_TONE = { queued: 'default', running: 'warning', ingesting: 'warning', enriched: 'success', failed: 'destructive' };
const EMPTY = {
  name: '',
  enabled: true,
  type: 'daily',
  everyValue: 30,
  everyUnit: 'minutes',
  times: '03:30',
  days: [1, 2, 3, 4, 5],
  dayOfMonth: 1,
  cron: '0 */6 * * *',
  timezone: 'Asia/Kolkata',
  mode: 'group',
  source: 'maps',
  groups: [],
  targetIds: [],
  perRun: 1,
  maxResults: '',
};

const idOf = (x) => String(x?._id || x?.id || '');
const splitTimes = (s) =>
  String(s)
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (/^\d:\d\d$/.test(t) ? `0${t}` : t));

/** Human text for a frequency, e.g. "Mon, Thu at 03:30". */
export function describeFrequency(f = {}, tz) {
  const at = (f.times || []).join(', ');
  const zone = tz ? ` (${tz})` : '';
  switch (f.type) {
    case 'interval': {
      const m = f.everyMinutes || 60;
      return m % 1440 === 0 ? `Every ${m / 1440} day(s)` : m % 60 === 0 ? `Every ${m / 60} hour(s)` : `Every ${m} minutes`;
    }
    case 'weekly':
      return `${(f.days || []).map((d) => DAYS[d]).join(', ')} at ${at}${zone}`;
    case 'monthly':
      return `Day ${f.dayOfMonth || 1} of each month at ${at}${zone}`;
    case 'cron':
      return `Cron "${f.cron}"${zone}`;
    default:
      return `Daily at ${at}${zone}`;
  }
}

function toPayload(f) {
  const frequency = { type: f.type };
  if (f.type === 'interval') frequency.everyMinutes = Math.round(Number(f.everyValue || 0) * (f.everyUnit === 'hours' ? 60 : f.everyUnit === 'days' ? 1440 : 1));
  else if (f.type === 'cron') frequency.cron = f.cron.trim();
  else {
    frequency.times = splitTimes(f.times);
    if (f.type === 'weekly') frequency.days = [...f.days].sort();
    if (f.type === 'monthly') frequency.dayOfMonth = Number(f.dayOfMonth) || 1;
  }
  return {
    name: f.name.trim(),
    enabled: f.enabled,
    frequency,
    timezone: f.timezone,
    mode: f.mode,
    source: f.source,
    groups: f.mode === 'group' ? f.groups : [],
    targetIds: f.mode === 'pick' ? f.targetIds : [],
    perRun: Math.max(0, Number(f.perRun) || 0),
    maxResults: f.maxResults === '' ? null : Number(f.maxResults),
  };
}

function fromSchedule(s) {
  const fr = s.frequency || {};
  const m = fr.everyMinutes || 60;
  const unit = m % 1440 === 0 ? 'days' : m % 60 === 0 ? 'hours' : 'minutes';
  return {
    ...EMPTY,
    name: s.name,
    enabled: s.enabled !== false,
    type: fr.type || 'daily',
    everyValue: unit === 'days' ? m / 1440 : unit === 'hours' ? m / 60 : m,
    everyUnit: unit,
    times: (fr.times || ['03:30']).join(', '),
    days: fr.days || [1],
    dayOfMonth: fr.dayOfMonth || 1,
    cron: fr.cron || EMPTY.cron,
    timezone: s.timezone || 'Asia/Kolkata',
    mode: s.mode || 'group',
    source: s.source || 'any',
    groups: s.groups || [],
    targetIds: (s.targetIds || []).map(String),
    perRun: s.perRun ?? 1,
    maxResults: s.maxResults ?? '',
  };
}

function useDebounced(value, ms = 400) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function ScheduleForm({ open, initial, editId, targets, onClose }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState(EMPTY);
  const [pickFilter, setPickFilter] = useState('');
  useEffect(() => {
    if (open) setF(initial || EMPTY);
  }, [open, initial]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const payload = toPayload(f);
  const debounced = useDebounced(JSON.stringify(payload));
  const preview = useQuery({
    queryKey: ['schedule-preview', debounced],
    queryFn: () => unwrap(api.post('/admin/schedules/preview', JSON.parse(debounced))),
    enabled: open,
  });
  const save = useMutation({
    mutationFn: (body) => unwrap(editId ? api.patch(`/admin/schedules/${editId}`, body) : api.post('/admin/schedules', body)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedules'] });
      toast.success(editId ? 'Schedule saved' : 'Schedule created');
      onClose();
    },
    onError: (e) => toast.error(e.message || 'Save failed'),
  });

  const srcOf = (t) => (t.source === 'reddit' ? 'reddit' : 'maps');
  const groups = useMemo(
    () => [...new Set(targets.filter((t) => f.source === 'any' || srcOf(t) === f.source).map((t) => t.group).filter(Boolean))].sort(),
    [targets, f.source],
  );
  const pickable = targets
    .filter((t) => f.source === 'any' || srcOf(t) === f.source)
    .filter((t) => !pickFilter || `${t.name} ${t.group}`.toLowerCase().includes(pickFilter.toLowerCase()))
    .sort((a, b) => (a.group || '').localeCompare(b.group || '') || a.name.localeCompare(b.name));
  const toggleIn = (key, v) => setF((x) => ({ ...x, [key]: x[key].includes(v) ? x[key].filter((y) => y !== v) : [...x[key], v] }));
  const p = preview.data;

  return (
    <Dialog open={open} onClose={onClose} title={editId ? 'Edit schedule' : 'New schedule'} className="max-w-3xl!">
      <form
        className="space-y-5 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(payload);
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <Label htmlFor="s-name">Name *</Label>
            <Input id="s-name" required value={f.name} onChange={set('name')} placeholder="e.g. Maps — home services, nightly" />
          </div>
          <label className="flex min-h-10 items-center gap-2">
            <input type="checkbox" checked={f.enabled} onChange={set('enabled')} className="size-4" /> Enabled
          </label>
        </div>

        <fieldset className="space-y-3 rounded-lg border border-border p-3">
          <legend className="px-1 font-semibold">When</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="s-type">Frequency</Label>
              <Select id="s-type" value={f.type} onChange={set('type')}>
                <option value="interval">Every X minutes / hours / days</option>
                <option value="daily">Daily at set times</option>
                <option value="weekly">Weekly on chosen days</option>
                <option value="monthly">Monthly</option>
                <option value="cron">Custom cron expression</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="s-tz">Timezone</Label>
              <Select id="s-tz" value={f.timezone} onChange={set('timezone')}>
                {[...new Set([f.timezone, ...TIMEZONES])].map((z) => (
                  <option key={z}>{z}</option>
                ))}
              </Select>
            </div>
          </div>
          {f.type === 'interval' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="s-every">Every</Label>
                <Input id="s-every" type="number" min="1" inputMode="numeric" value={f.everyValue} onChange={set('everyValue')} />
              </div>
              <div>
                <Label htmlFor="s-unit">Unit</Label>
                <Select id="s-unit" value={f.everyUnit} onChange={set('everyUnit')}>
                  <option value="minutes">minutes (min 5)</option>
                  <option value="hours">hours</option>
                  <option value="days">days</option>
                </Select>
              </div>
            </div>
          )}
          {['daily', 'weekly', 'monthly'].includes(f.type) && (
            <div>
              <Label htmlFor="s-times">Times (24h, comma-separated)</Label>
              <Input id="s-times" value={f.times} onChange={set('times')} placeholder="03:30, 15:00" />
            </div>
          )}
          {f.type === 'weekly' && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Days">
              {DAYS.map((d, i) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={f.days.includes(i)}
                  onClick={() => toggleIn('days', i)}
                  className={`min-h-10 min-w-12 rounded-md border px-3 ${f.days.includes(i) ? 'border-primary bg-primary/15' : 'border-border hover:bg-muted'}`}
                >
                  {d}
                </button>
              ))}
            </div>
          )}
          {f.type === 'monthly' && (
            <div className="w-40">
              <Label htmlFor="s-dom">Day of month (1–28)</Label>
              <Input id="s-dom" type="number" min="1" max="28" value={f.dayOfMonth} onChange={set('dayOfMonth')} />
            </div>
          )}
          {f.type === 'cron' && (
            <div>
              <Label htmlFor="s-cron">Cron (minute hour day month weekday)</Label>
              <Input id="s-cron" className="font-mono" value={f.cron} onChange={set('cron')} placeholder="0 */6 * * *" />
              <p className="mt-1 text-xs text-muted-foreground">
                Examples: <code>0 */6 * * *</code> every 6 hours · <code>30 2 * * 1-5</code> weekdays 02:30 · <code>0 9,21 * * *</code> 09:00 and 21:00
              </p>
            </div>
          )}
        </fieldset>

        <fieldset className="space-y-3 rounded-lg border border-border p-3">
          <legend className="px-1 font-semibold">What to run</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="s-source">Source</Label>
              <Select id="s-source" value={f.source} onChange={(e) => setF((x) => ({ ...x, source: e.target.value, groups: [], targetIds: [] }))}>
                <option value="maps">Google Maps</option>
                <option value="reddit">Reddit</option>
                <option value="any">Both</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="s-mode">Searches</Label>
              <Select id="s-mode" value={f.mode} onChange={set('mode')}>
                <option value="group">By category (new searches included automatically)</option>
                <option value="pick">Hand-picked searches</option>
              </Select>
            </div>
          </div>
          {f.mode === 'group' ? (
            <div>
              <p className="mb-2 text-xs text-muted-foreground">Categories — none selected means all.</p>
              <div className="flex flex-wrap gap-2">
                {groups.map((g) => (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={f.groups.includes(g)}
                    onClick={() => toggleIn('groups', g)}
                    className={`min-h-9 rounded-full border px-3 text-xs ${f.groups.includes(g) ? 'border-primary bg-primary/15' : 'border-border hover:bg-muted'}`}
                  >
                    {g}
                  </button>
                ))}
                {groups.length === 0 && <span className="text-xs text-muted-foreground">No categories for this source yet.</span>}
              </div>
            </div>
          ) : (
            <div>
              <Input aria-label="Filter searches" placeholder="Filter searches…" value={pickFilter} onChange={(e) => setPickFilter(e.target.value)} className="mb-2" />
              <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                {pickable.map((t) => (
                  <li key={idOf(t)}>
                    <label className="flex min-h-10 cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-muted/50">
                      <input type="checkbox" className="size-4" checked={f.targetIds.includes(idOf(t))} onChange={() => toggleIn('targetIds', idOf(t))} />
                      <span className="flex-1 truncate">{t.name}</span>
                      <span className="text-xs text-muted-foreground">{t.group || ''}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-muted-foreground">{f.targetIds.length} selected</p>
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="s-per">Searches per run (0 = all)</Label>
              <Input id="s-per" type="number" min="0" max="100" inputMode="numeric" value={f.perRun} onChange={set('perRun')} />
              <p className="mt-1 text-xs text-muted-foreground">Runs rotate: the searches that ran longest ago go first.</p>
            </div>
            <div>
              <Label htmlFor="s-max">Max leads per search (optional)</Label>
              <Input id="s-max" type="number" min="1" max="1000" inputMode="numeric" value={f.maxResults} onChange={set('maxResults')} placeholder="use each search's own" />
            </div>
          </div>
        </fieldset>

        <section className="rounded-lg border border-border bg-muted/30 p-3" aria-live="polite">
          <h3 className="mb-2 font-semibold">Preview</h3>
          {preview.isFetching && !p ? (
            <Spinner />
          ) : p?.error ? (
            <p className="text-red-400">{p.error}</p>
          ) : p ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">Next runs (your local time)</p>
                <ul className="mt-1 space-y-0.5">
                  {p.runs.map((r) => (
                    <li key={r}>{formatDate(r)}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  {p.matching} matching search{p.matching === 1 ? '' : 'es'} · next run does:
                </p>
                <ul className="mt-1 list-disc pl-4">
                  {p.next.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                  {p.next.length === 0 && <li className="text-red-400">nothing — no active searches match</li>}
                </ul>
              </div>
            </div>
          ) : null}
        </section>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending || !f.name.trim() || Boolean(p?.error)}>
            {save.isPending ? 'Saving…' : editId ? 'Save changes' : 'Create schedule'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function ScheduleDetail({ id, onClose }) {
  const q = useQuery({
    queryKey: ['schedule', id],
    queryFn: () => unwrap(api.get(`/admin/schedules/${id}`)),
    enabled: Boolean(id),
    refetchInterval: 10000,
  });
  const d = q.data;
  const s = d?.schedule;
  const last = s?.lastResult;
  return (
    <Dialog open={Boolean(id)} onClose={onClose} title={s?.name || 'Schedule'} className="max-w-3xl!">
      {!d ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-5 text-sm">
          <p className="text-muted-foreground">{describeFrequency(s.frequency, s.timezone)}</p>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Runs', s.runCount ?? 0],
              ['Searches started', s.stats.runs],
              ['New leads', s.stats.leads],
              ['Failed searches', s.stats.failed],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-border p-3">
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="text-lg font-semibold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <section>
              <h3 className="mb-1 font-semibold">Upcoming</h3>
              <ul className="space-y-0.5">{s.enabled ? d.upcoming.map((r) => <li key={r}>{formatDate(r)}</li>) : <li className="text-muted-foreground">Paused</li>}</ul>
            </section>
            <section>
              <h3 className="mb-1 font-semibold">Rotation order ({d.queue.length})</h3>
              <ol className="max-h-40 list-decimal overflow-y-auto pl-5">
                {d.queue.map((t, i) => (
                  <li key={t.name + i} className={i < (s.perRun || d.queue.length) ? 'font-medium' : 'text-muted-foreground'}>
                    {t.name} <span className="text-xs text-muted-foreground">· {t.lastRunAt ? formatDate(t.lastRunAt) : 'never run'}</span>
                  </li>
                ))}
              </ol>
            </section>
          </div>
          {last && (
            <section>
              <h3 className="mb-1 font-semibold">
                Last run {last.manual ? '(manual)' : ''} · {formatDate(last.startedAt)} {last.finishedAt ? '' : '· still running'}
              </h3>
              <ul className="space-y-0.5">
                {(last.started || []).map((x) => (
                  <li key={x.jobId}>✓ {x.name}</li>
                ))}
                {(last.skipped || []).map((x, i) => (
                  <li key={i} className="text-muted-foreground">
                    – {x.name}: {x.reason}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section>
            <h3 className="mb-2 font-semibold">Recent searches run by this schedule</h3>
            {d.jobs.length === 0 ? (
              <p className="text-muted-foreground">None yet.</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {d.jobs.map((j) => (
                  <li key={j._id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate">{j.scrapeTargetId?.name || 'Deleted search'}</span>
                    <Badge variant={JOB_TONE[j.status] || 'default'}>{j.status === 'enriched' ? 'done' : j.status}</Badge>
                    <span className="text-xs text-muted-foreground">
                      found {j.found ?? 0} · new {j.ingested ?? 0} · {formatDate(j.createdAt)}
                    </span>
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

export default function Schedules() {
  const qc = useQueryClient();
  const toast = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [initial, setInitial] = useState(null);
  const [detailId, setDetailId] = useState(null);

  const list = useQuery({ queryKey: ['schedules'], queryFn: () => unwrap(api.get('/admin/schedules')), refetchInterval: 30000 });
  const targets = useQuery({ queryKey: ['scrape-targets'], queryFn: () => unwrap(api.get('/admin/scrape/targets', { params: { limit: 500 } })) });
  const rows = Array.isArray(list.data) ? list.data : [];
  const targetRows = Array.isArray(targets.data) ? targets.data : targets.data?.items || [];

  const act = useMutation({
    mutationFn: ({ method, url, body }) => unwrap(api[method](`/admin/schedules${url}`, body)),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['schedules'] });
      toast.success(v.done);
    },
    onError: (e) => toast.error(e.message || 'Action failed'),
  });
  const openNew = () => {
    setEditId(null);
    setInitial(EMPTY);
    setFormOpen(true);
  };
  const openEdit = (s) => {
    setEditId(idOf(s));
    setInitial(fromSchedule(s));
    setFormOpen(true);
  };
  // Uses the time the list was fetched (refreshes every 30 s), not Date.now() during render.
  const running = (s) => s.heartbeatAt && list.dataUpdatedAt - new Date(s.heartbeatAt).getTime() < 5 * 60 * 1000;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Schedules"
        description="Cron jobs that run your saved lead searches automatically. Checked every minute; searches run one at a time per source."
        actions={
          <>
          <Button
            variant="secondary"
            onClick={() => act.mutate({ method: 'post', url: '/digest/send', body: { hours: 24 }, done: 'Digest sent to Telegram' })}
            title="The best leads of the last 24 h — also sent automatically every day at 07:30"
          >
            Send morning digest now
          </Button>
          <Button onClick={openNew}>
            <Plus size={16} aria-hidden="true" /> New schedule
          </Button>
          </>
        }
      />
      <Card className="overflow-hidden">
        {list.isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No schedules" hint="Create one to run searches automatically." />
          </div>
        ) : (
          <div className="-mx-px overflow-x-auto overscroll-x-contain">
            <table className="w-full min-w-[900px] text-sm [&_th]:whitespace-nowrap">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Schedule</th>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Runs</th>
                  <th className="px-4 py-3">Next run</th>
                  <th className="px-4 py-3">Last run</th>
                  <th className="px-4 py-3">Leads</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const id = idOf(s);
                  return (
                    <tr key={id} className={`border-b border-border/60 ${s.enabled ? '' : 'opacity-60'}`}>
                      <td className="px-4 py-3">
                        <button type="button" className="text-left font-medium hover:underline" onClick={() => setDetailId(id)}>
                          {s.name}
                        </button>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <Badge variant={s.source === 'reddit' ? 'warning' : 'primary'}>{s.source === 'reddit' ? 'Reddit' : s.source === 'maps' ? 'Google Maps' : 'Both'}</Badge>
                          {!s.enabled && <Badge>Paused</Badge>}
                          {running(s) && <Badge variant="warning">Running</Badge>}
                        </div>
                      </td>
                      <td className="max-w-[16rem] px-4 py-3 text-muted-foreground">{describeFrequency(s.frequency, s.timezone)}</td>
                      <td className="max-w-[16rem] px-4 py-3 text-muted-foreground">
                        {s.perRun ? `${s.perRun} per run` : 'all'} ·{' '}
                        {s.mode === 'pick' ? `${(s.targetIds || []).length} picked` : s.groups?.length ? s.groups.join(', ') : 'all categories'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">{s.enabled && s.nextRunAt ? formatDate(s.nextRunAt) : '—'}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{s.lastRunAt ? formatDate(s.lastRunAt) : 'never'}</td>
                      <td className="px-4 py-3 tabular-nums">{s.stats?.leads ?? 0}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" onClick={() => act.mutate({ method: 'post', url: `/${id}/run`, done: 'Running now — see details for progress' })} disabled={running(s)} aria-label={`Run ${s.name} now`}>
                            <Play size={14} aria-hidden="true" /> Run now
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => openEdit(s)} aria-label={`Edit ${s.name}`}>
                            <Pencil size={14} aria-hidden="true" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => act.mutate({ method: 'patch', url: `/${id}`, body: { enabled: !s.enabled }, done: s.enabled ? 'Schedule paused' : 'Schedule resumed' })}
                            aria-label={s.enabled ? `Pause ${s.name}` : `Resume ${s.name}`}
                          >
                            {s.enabled ? <Pause size={14} aria-hidden="true" /> : <CalendarClock size={14} aria-hidden="true" />}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => window.confirm(`Delete schedule "${s.name}"? Searches and leads are kept.`) && act.mutate({ method: 'delete', url: `/${id}`, done: 'Schedule deleted' })}
                            aria-label={`Delete ${s.name}`}
                          >
                            <Trash2 size={14} aria-hidden="true" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <ScheduleForm open={formOpen} initial={initial} editId={editId} targets={targetRows} onClose={() => setFormOpen(false)} />
      <ScheduleDetail id={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}

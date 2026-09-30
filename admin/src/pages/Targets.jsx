import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Play, Upload } from 'lucide-react';
import api, { unwrap } from '../lib/api.js';
import { useToast } from '../hooks/useToast.jsx';
import { formatDate } from '../lib/format.js';
import { PageHeader } from '../components/PageHeader.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import { Card, Button, Input, Label, Select, Badge, Spinner, EmptyState, Textarea } from '../components/ui/index.jsx';

const EMPTY = { source: 'maps', name: '', categories: '', cities: '', country: 'US', maxResults: 100, hasWebsite: 'any', minRating: '', communities: 'forhire, b2bforhire, hireaprogrammer, startups, Entrepreneur, smallbusiness, ecommerce, SaaS', keywords: 'looking for a developer, hire a developer, need an app built, looking for an agency, need a website built, app development company, developer to build', minIntent: 55, maxAgeDays: 14 };
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
      name: form.name.trim() || `Reddit: ${keywords.slice(0, 2).join(', ')}`,
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
    name: form.name.trim() || `${categories.join(', ')} in ${cities.join(', ') || form.country}`,
    country: form.country,
    categories,
    cities,
    maxResults: Math.min(Math.max(Number(form.maxResults) || 100, 1), 1000),
    filters,
  };
}

export default function Targets() {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [csv, setCsv] = useState('');
  const fileRef = useRef(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const targets = useQuery({
    queryKey: ['scrape-targets'],
    queryFn: () => unwrap(api.get('/admin/scrape/targets')),
  });
  const jobs = useQuery({
    queryKey: ['scrape-jobs'],
    queryFn: () => unwrap(api.get('/admin/scrape/jobs')),
    // Poll while anything is in flight so progress updates live.
    refetchInterval: (q) => {
      const rows = Array.isArray(q.state.data) ? q.state.data : q.state.data?.items || [];
      return rows.some((j) => RUNNING.has(j.status)) ? 5000 : false;
    },
  });
  const targetRows = Array.isArray(targets.data) ? targets.data : targets.data?.items || [];
  const jobRows = Array.isArray(jobs.data) ? jobs.data : jobs.data?.items || [];
  const targetName = Object.fromEntries(targetRows.map((t) => [String(t._id || t.id), t.name]));

  const create = useMutation({
    mutationFn: (body) => unwrap(api.post('/admin/scrape/targets', body)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scrape-targets'] });
      toast.success('Target saved — press Run to start scraping');
      setOpen(false);
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
  const canSave = form.source === 'reddit' ? payload.keywords.length > 0 && payload.communities.length > 0 : payload.categories.length > 0;

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
            <Button onClick={() => setOpen(true)}>
              <Plus size={16} aria-hidden="true" /> New search
            </Button>
          </>
        }
      />

      <Card className="overflow-hidden">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold">Saved searches</div>
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
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {targetRows.map((t) => {
                  const id = String(t._id || t.id);
                  return (
                    <tr key={id} className="border-b border-border/60">
                      <td className="px-4 py-3 font-medium">{t.name}</td>
                      <td className="px-4 py-3">
                        <Badge variant={t.source === 'reddit' ? 'warning' : 'primary'}>{t.source === 'reddit' ? 'Reddit' : 'Google Maps'}</Badge>
                      </td>
                      <td className="max-w-[16rem] truncate px-4 py-3">{[...(t.categories || []), ...(t.keywords || [])].join(', ') || '—'}</td>
                      <td className="max-w-[14rem] truncate px-4 py-3">
                        {t.source === 'reddit'
                          ? (t.communities || []).map((c) => `r/${c}`).join(', ') || 'r/smallbusiness'
                          : `${(t.cities || []).join(', ') || 'Whole country'} · ${t.country}`}
                      </td>
                      <td className="px-4 py-3">{t.maxResults}</td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          onClick={() => run.mutate(id)}
                          disabled={run.isPending && run.variables === id}
                          aria-label={`Run ${t.name}`}
                        >
                          <Play size={14} aria-hidden="true" /> Run
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-semibold">Recent runs</span>
          {jobRows.some((j) => RUNNING.has(j.status)) && (
            <span className="text-xs text-muted-foreground" aria-live="polite">
              Updating live…
            </span>
          )}
        </div>
        {jobs.isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : jobRows.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No runs yet" hint="Runs show here with live progress." />
          </div>
        ) : (
          <div className="-mx-px overflow-x-auto overscroll-x-contain">
            <table className="w-full min-w-[640px] text-sm [&_th]:whitespace-nowrap">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Search</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Found</th>
                  <th className="px-4 py-3">New leads</th>
                  <th className="px-4 py-3">Started</th>
                </tr>
              </thead>
              <tbody>
                {jobRows.map((j) => (
                  <tr key={String(j._id || j.id)} className="border-b border-border/60">
                    <td className="px-4 py-3">{targetName[String(j.scrapeTargetId)] || '—'}</td>
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
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} title="New lead search">
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
                <Label htmlFor="keywords">Phrases buyers use *</Label>
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
            <Label htmlFor="name">Name (optional)</Label>
            <Input id="name" value={form.name} onChange={set('name')} placeholder={payload.name || 'Austin dentists'} />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSave || create.isPending}>
              {create.isPending ? 'Saving…' : 'Save search'}
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

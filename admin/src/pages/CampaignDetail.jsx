import { useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Play, Pause, Search, Pencil, Trash2, Square } from 'lucide-react';
import api, { unwrap } from '../lib/api.js';
import { useToast } from '../hooks/useToast.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { formatDate } from '../lib/format.js';
import { Card, CardContent, Button, Input, Label, Select, Badge, Spinner, EmptyState } from '../components/ui/index.jsx';

const REASONS = {
  already_enrolled: 'already in a campaign',
  no_valid_email: 'no valid email',
  suppressed: 'unsubscribed / suppressed',
  uk_not_incorporated: 'UK sole trader (not allowed)',
  disqualified: 'disqualified',
  lead_missing: 'not found',
};

/** Summarise enroll outcomes for a toast: "3 enrolled · 2 skipped (no valid email)". */
export function summariseEnroll(outcomes = []) {
  const ok = outcomes.filter((o) => o.enrolled).length;
  const skipped = outcomes.filter((o) => !o.enrolled);
  if (!skipped.length) return `${ok} enrolled`;
  const why = [...new Set(skipped.map((o) => REASONS[o.reason] || o.reason))].join(', ');
  return `${ok} enrolled · ${skipped.length} skipped (${why})`;
}

const idOf = (x) => String(x?._id || x?.id || '');

export default function CampaignDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();

  const [step, setStep] = useState({ templateId: '', delayDays: 3, channel: 'email' });
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState(() => new Set());

  const detail = useQuery({
    queryKey: ['campaign', id],
    queryFn: () => unwrap(api.get(`/admin/outreach/campaigns/${id}`)),
  });
  const templates = useQuery({
    queryKey: ['templates'],
    queryFn: () => unwrap(api.get('/admin/outreach/templates')),
  });
  const leads = useQuery({
    queryKey: ['leads', 'enroll-picker', search],
    queryFn: () => unwrap(api.get('/admin/leads', { params: { limit: 50, q: search || undefined } })),
  });
  const enrollments = useQuery({
    queryKey: ['enrollments', id],
    queryFn: () => unwrap(api.get('/admin/enrollments', { params: { campaignId: id, limit: 100 } })),
  });

  const campaign = detail.data?.campaign ?? detail.data;
  const steps = detail.data?.steps ?? [];
  const tplRows = Array.isArray(templates.data) ? templates.data : templates.data?.items || [];
  const tplName = Object.fromEntries(tplRows.map((t) => [idOf(t), t.name]));
  const leadRows = Array.isArray(leads.data) ? leads.data : leads.data?.items || [];
  const enrRows = Array.isArray(enrollments.data) ? enrollments.data : enrollments.data?.items || [];
  const enrolledLeadIds = useMemo(() => new Set(enrRows.map((e) => String(e.leadId))), [enrRows]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['campaign', id] });
    qc.invalidateQueries({ queryKey: ['campaigns'] });
    qc.invalidateQueries({ queryKey: ['enrollments', id] });
  };

  const addStep = useMutation({
    mutationFn: (body) => unwrap(api.post(`/admin/outreach/campaigns/${id}/steps`, body)),
    onSuccess: () => {
      refresh();
      toast.success('Step added');
      setStep({ templateId: '', delayDays: 3, channel: 'email' });
    },
    onError: (e) => toast.error(e.message || 'Could not add step'),
  });
  const setStatus = useMutation({
    mutationFn: (status) => unwrap(api.patch(`/admin/outreach/campaigns/${id}`, { status })),
    onSuccess: (_d, status) => {
      refresh();
      toast.success(status === 'active' ? 'Campaign is live' : 'Campaign paused');
    },
    onError: (e) => toast.error(e.message || 'Could not update campaign'),
  });
  const enroll = useMutation({
    mutationFn: (ids) => unwrap(api.post(`/admin/outreach/campaigns/${id}/enroll`, { leadIds: ids })),
    onSuccess: (outcomes) => {
      refresh();
      setPicked(new Set());
      const text = summariseEnroll(Array.isArray(outcomes) ? outcomes : []);
      if (text.startsWith('0 enrolled')) toast.error(text);
      else toast.success(text);
    },
    onError: (e) => toast.error(e.message || 'Enroll failed'),
  });

  const manage = useMutation({
    mutationFn: ({ method, url, body }) => unwrap(api[method](`/admin/manage${url}`, body)),
    onSuccess: (_d, v) => {
      qc.invalidateQueries();
      toast.success(v.done || 'Saved');
      if (v.after) v.after();
    },
    onError: (e) => toast.error(e.message || 'Action failed'),
  });

  if (detail.isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }
  if (detail.isError || !campaign) {
    return <EmptyState title="Campaign not found" hint="It may have been deleted." />;
  }

  const live = campaign.status === 'active';
  const togglePick = (lid) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(lid)) n.delete(lid);
      else n.add(lid);
      return n;
    });
  const selectable = leadRows.filter((l) => !enrolledLeadIds.has(idOf(l)));

  return (
    <div className="space-y-6">
      <PageHeader
        title={campaign.name}
        description={`${steps.length} step${steps.length === 1 ? '' : 's'} · ${enrRows.length} enrolled`}
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/campaigns')}>
              <ArrowLeft size={16} aria-hidden="true" /> Back
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                const name = window.prompt('Campaign name', campaign.name);
                if (name?.trim() && name.trim() !== campaign.name) manage.mutate({ method: 'patch', url: `/campaigns/${id}`, body: { name: name.trim() }, done: 'Renamed' });
              }}
            >
              <Pencil size={16} aria-hidden="true" /> Rename
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                window.confirm('Delete this campaign? All active enrollments stop and their pending drafts are rejected.') &&
                manage.mutate({ method: 'delete', url: `/campaigns/${id}`, done: 'Campaign deleted', after: () => navigate('/campaigns') })
              }
              aria-label="Delete campaign"
            >
              <Trash2 size={16} aria-hidden="true" />
            </Button>
            {live ? (
              <Button variant="secondary" onClick={() => setStatus.mutate('paused')} disabled={setStatus.isPending}>
                <Pause size={16} aria-hidden="true" /> Pause
              </Button>
            ) : (
              <Button
                onClick={() => setStatus.mutate('active')}
                disabled={setStatus.isPending || steps.length === 0}
                title={steps.length === 0 ? 'Add at least one step first' : undefined}
              >
                <Play size={16} aria-hidden="true" /> Activate
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant={live ? 'success' : 'default'}>{campaign.status || 'draft'}</Badge>
        <span className="text-muted-foreground">
          {live
            ? 'Drafts are written automatically and wait for your approval before sending.'
            : 'Add steps, enroll leads, then activate.'}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ---------------- Steps ---------------- */}
        <Card>
          <CardContent className="p-5">
            <h2 className="mb-4 text-base font-semibold">1. Email sequence</h2>
            {steps.length === 0 ? (
              <EmptyState title="No steps yet" hint="Step 1 is the first email; later steps are follow-ups." />
            ) : (
              <ol className="space-y-2">
                {steps.map((s) => (
                  <li key={idOf(s)} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                    <div className="min-w-0">
                      <p className="font-medium">
                        Step {s.order}: {tplName[String(s.templateId)] || 'Template'}{' '}
                        <span className="text-xs font-normal text-muted-foreground">· {s.channel === 'email' || !s.channel ? 'Email' : s.channel === 'x' ? 'X DM' : 'LinkedIn'}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {s.order === 1 ? 'Sent first' : `${s.delayDays} business day${s.delayDays === 1 ? '' : 's'} after the previous step`}
                        {s.stopOnReply ? ' · stops on reply' : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Select
                        aria-label={`Template for step ${s.order}`}
                        value={String(s.templateId)}
                        onChange={(e) => manage.mutate({ method: 'patch', url: `/steps/${idOf(s)}`, body: { templateId: e.target.value }, done: 'Step updated' })}
                        className="h-8 w-36 text-xs"
                      >
                        {tplRows.map((t) => (
                          <option key={idOf(t)} value={idOf(t)}>
                            {t.name}
                          </option>
                        ))}
                      </Select>
                      {s.order > 1 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const d = window.prompt('Business days after the previous step', String(s.delayDays ?? 0));
                            if (d != null && d !== '' && !Number.isNaN(Number(d))) manage.mutate({ method: 'patch', url: `/steps/${idOf(s)}`, body: { delayDays: Number(d) }, done: 'Delay updated' });
                          }}
                          aria-label={`Change delay for step ${s.order}`}
                        >
                          <Pencil size={14} aria-hidden="true" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => window.confirm(`Remove step ${s.order}?`) && manage.mutate({ method: 'delete', url: `/steps/${idOf(s)}`, done: 'Step removed' })}
                        aria-label={`Remove step ${s.order}`}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ol>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!step.templateId) return;
                addStep.mutate({
                  order: steps.length + 1,
                  templateId: step.templateId,
                  channel: step.channel,
                  delayDays: steps.length === 0 ? 0 : Math.max(0, Number(step.delayDays) || 0),
                });
              }}
              className="mt-5 space-y-3 border-t border-border pt-5"
            >
              {tplRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  You need an email template first.{' '}
                  <Link to="/templates" className="text-primary underline">
                    Create a template
                  </Link>
                </p>
              ) : (
                <>
                  <div>
                    <Label htmlFor="ch">Step {steps.length + 1} channel</Label>
                    <Select id="ch" value={step.channel} onChange={(e) => setStep({ ...step, channel: e.target.value })}>
                      <option value="email">Email (sent automatically after you approve)</option>
                      <option value="linkedin">LinkedIn message (you send it — task in Approvals)</option>
                      <option value="x">X / Twitter DM (you send it — task in Approvals)</option>
                    </Select>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      <Label htmlFor="tpl">Template for step {steps.length + 1}</Label>
                      <Select id="tpl" value={step.templateId} onChange={(e) => setStep({ ...step, templateId: e.target.value })}>
                        <option value="">Choose a template…</option>
                        {tplRows.map((t) => (
                          <option key={idOf(t)} value={idOf(t)}>
                            {t.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="delay">Wait (days)</Label>
                      <Input
                        id="delay"
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={steps.length === 0 ? 0 : step.delayDays}
                        disabled={steps.length === 0}
                        onChange={(e) => setStep({ ...step, delayDays: e.target.value })}
                      />
                    </div>
                  </div>
                  <Button type="submit" disabled={!step.templateId || addStep.isPending}>
                    <Plus size={16} aria-hidden="true" /> {addStep.isPending ? 'Adding…' : 'Add step'}
                  </Button>
                </>
              )}
            </form>
          </CardContent>
        </Card>

        {/* ---------------- Enroll ---------------- */}
        <Card>
          <CardContent className="p-5">
            <h2 className="mb-4 text-base font-semibold">2. Add leads</h2>
            <div className="relative mb-3">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                aria-label="Search leads"
                className="pl-9"
                placeholder="Search by business name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {leads.isLoading ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : selectable.length === 0 ? (
              <EmptyState title="No leads to add" hint="Find leads under Lead Sources, or they are all enrolled." />
            ) : (
              <>
                <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                  <button
                    type="button"
                    className="min-h-[2.25rem] underline"
                    onClick={() => setPicked(new Set(selectable.map(idOf)))}
                  >
                    Select all {selectable.length}
                  </button>
                  <span>{picked.size} selected</span>
                </div>
                <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                  {selectable.map((l) => {
                    const lid = idOf(l);
                    const org = l.organizationId || {};
                    const email = l.primaryContactId?.email;
                    return (
                      <li key={lid}>
                        <label className="flex min-h-[2.75rem] cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/50">
                          <input
                            type="checkbox"
                            className="h-5 w-5 shrink-0 accent-[var(--color-primary)]"
                            checked={picked.has(lid)}
                            onChange={() => togglePick(lid)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{org.name || 'Unnamed lead'}</span>
                            <span className={`block truncate text-xs ${email ? 'text-muted-foreground' : 'text-amber-400'}`}>
                              {email || 'no email yet'} · score {l.score ?? 0}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <Button className="mt-3 w-full" disabled={!picked.size || enroll.isPending} onClick={() => enroll.mutate([...picked])}>
                  {enroll.isPending ? 'Enrolling…' : `Enroll ${picked.size || ''} lead${picked.size === 1 ? '' : 's'}`}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---------------- Enrolled ---------------- */}
      <Card className="overflow-hidden">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold">3. Enrolled leads</div>
        {enrRows.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Nobody enrolled yet" hint="Pick leads above." />
          </div>
        ) : (
          <div className="-mx-px overflow-x-auto overscroll-x-contain">
            <table className="w-full min-w-[560px] text-sm [&_th]:whitespace-nowrap">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Lead</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Step</th>
                  <th className="px-4 py-3">Next due</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {enrRows.map((e) => (
                  <tr key={idOf(e)} className="border-b border-border/60">
                    <td className="px-4 py-3">
                      <Link to={`/leads/${e.leadId}`} className="text-primary underline-offset-2 hover:underline">
                        View lead
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={e.status === 'active' ? 'primary' : e.status === 'replied' ? 'success' : 'default'}>{e.status}</Badge>
                    </td>
                    <td className="px-4 py-3">{e.currentStep}</td>
                    <td className="px-4 py-3 text-muted-foreground">{e.nextDueAt ? formatDate(e.nextDueAt) : '—'}</td>
                    <td className="px-4 py-3 text-right">
                      {e.status === 'active' ? (
                        <Button size="sm" variant="ghost" onClick={() => manage.mutate({ method: 'patch', url: `/enrollments/${idOf(e)}`, body: { status: 'stopped' }, done: 'Stopped for this lead' })}>
                          <Square size={14} aria-hidden="true" /> Stop
                        </Button>
                      ) : e.status === 'stopped' ? (
                        <Button size="sm" variant="ghost" onClick={() => manage.mutate({ method: 'patch', url: `/enrollments/${idOf(e)}`, body: { status: 'active' }, done: 'Resumed for this lead' })}>
                          <Play size={14} aria-hidden="true" /> Resume
                        </Button>
                      ) : null}
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

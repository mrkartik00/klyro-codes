import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, AlertTriangle, PlugZap } from 'lucide-react';
import api, { unwrap } from '../lib/api.js';
import { useToast } from '../hooks/useToast.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import { Card, CardContent, Button, Input, Label, Badge, Spinner, EmptyState } from '../components/ui/index.jsx';

const STATUS_VARIANT = { active: 'success', paused: 'warning', restricted: 'destructive' };

export default function LinkedIn() {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ accountId: '', displayName: '', profileUrl: '', dailyCap: 20 });

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['linkedin-accounts'],
    queryFn: () => unwrap(api.get('/admin/linkedin/accounts')),
  });
  const { data: queue } = useQuery({
    queryKey: ['linkedin-queue'],
    queryFn: () => unwrap(api.get('/admin/linkedin/queue')),
    refetchInterval: 30000,
  });

  const rows = Array.isArray(accounts) ? accounts : accounts?.items || [];

  const create = useMutation({
    mutationFn: (body) => unwrap(api.post('/admin/linkedin/accounts', body)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['linkedin-accounts'] });
      toast.success('LinkedIn account added (paused). Enable it to start sending.');
      setOpen(false);
      setForm({ accountId: '', displayName: '', profileUrl: '', dailyCap: 20 });
    },
    onError: (e) => toast.error(e.message || 'Create failed'),
  });
  const update = useMutation({
    mutationFn: ({ id, body }) => unwrap(api.patch(`/admin/linkedin/accounts/${id}`, body)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['linkedin-accounts'] });
      toast.success('Updated');
    },
    onError: (e) => toast.error(e.message || 'Update failed'),
  });
  const remove = useMutation({
    mutationFn: (id) => unwrap(api.delete(`/admin/linkedin/accounts/${id}`)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['linkedin-accounts'] });
      toast.success('Removed');
    },
    onError: (e) => toast.error(e.message || 'Remove failed'),
  });
  const test = useMutation({
    mutationFn: () => unwrap(api.post('/admin/linkedin/test', {})),
    onSuccess: (d) => {
      if (!d.configured) return toast.error('Unipile not configured — add UNIPILE_API_KEY in API keys.');
      toast.success(`Connected — ${d.accounts.length} account(s): ${d.accounts.map((a) => `${a.type}:${a.status}`).join(', ')}`);
    },
    onError: (e) => toast.error(e.message || 'Test failed'),
  });

  return (
    <div>
      <PageHeader
        title="LinkedIn"
        description="Send personalised LinkedIn DMs via Unipile. Drafts are reviewed in Approvals before sending."
        actions={
          <>
            <Button variant="outline" onClick={() => test.mutate()} disabled={test.isPending}>
              <PlugZap size={16} aria-hidden="true" /> Test connection
            </Button>
            <Button onClick={() => setOpen(true)}>
              <Plus size={16} aria-hidden="true" /> Add account
            </Button>
          </>
        }
      />

      {/* Safety / ToS warning — LinkedIn automation can get an account restricted. */}
      <div
        role="alert"
        className="mb-5 flex gap-3 rounded-lg border border-amber-800 bg-amber-950/50 p-4 text-sm text-amber-200"
      >
        <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-medium">Use carefully — LinkedIn automation carries account risk.</p>
          <p className="mt-1 text-amber-200/80">
            Keep sends to 20–25/day with 5-minute gaps. If LinkedIn restricts the account, pause it
            immediately and wait 48–72 hours before resuming at half the volume. Sending is{' '}
            {queue?.sendingEnabled ? 'ENABLED' : 'OFF (set LINKEDIN_SENDING_ENABLED to enable)'}.
          </p>
        </div>
      </div>

      {/* Queue summary */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent>
            <p className="text-xs text-muted-foreground">Ready to send</p>
            <p className="mt-1 text-2xl font-semibold">{queue?.ready ?? '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xs text-muted-foreground">Sent today</p>
            <p className="mt-1 text-2xl font-semibold">{queue?.sentToday ?? '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xs text-muted-foreground">Sending</p>
            <p className="mt-1 text-2xl font-semibold">{queue?.sendingEnabled ? 'On' : 'Off'}</p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title="No LinkedIn accounts" hint="Add a connected Unipile account to start." />
      ) : (
        <div className="grid gap-3">
          {rows.map((a) => (
            <Card key={a._id}>
              <CardContent>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{a.displayName || a.accountId}</span>
                      <Badge variant={STATUS_VARIANT[a.status] || 'default'}>{a.status}</Badge>
                      <Badge>{a.channel}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {a.sentToday}/{a.dailyCap} today · {Math.round((a.sendGapMs || 0) / 60000)}-min gap
                      {a.lastSentAt ? ` · last ${new Date(a.lastSentAt).toLocaleString()}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {a.status === 'active' ? (
                      <Button variant="outline" onClick={() => update.mutate({ id: a._id, body: { status: 'paused' } })}>
                        Pause
                      </Button>
                    ) : (
                      <Button onClick={() => update.mutate({ id: a._id, body: { status: 'active' } })}>Enable</Button>
                    )}
                    <Button variant="ghost" onClick={() => remove.mutate(a._id)}>
                      Remove
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="Add LinkedIn account">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate({ ...form, channel: 'linkedin', dailyCap: Number(form.dailyCap) });
          }}
          className="space-y-4"
        >
          <div>
            <Label htmlFor="accountId">Unipile account ID</Label>
            <Input id="accountId" value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })} placeholder="e.g. Q85ugAiuRAaDIQqqjsnp4w" required />
            <p className="mt-1 text-xs text-muted-foreground">Use “Test connection” to list your connected accounts and copy the LinkedIn one.</p>
          </div>
          <div>
            <Label htmlFor="displayName">Display name</Label>
            <Input id="displayName" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="e.g. Kartik (personal)" />
          </div>
          <div>
            <Label htmlFor="dailyCap">Daily cap</Label>
            <Input id="dailyCap" type="number" min={1} max={100} value={form.dailyCap} onChange={(e) => setForm({ ...form, dailyCap: e.target.value })} />
            <p className="mt-1 text-xs text-muted-foreground">Recommended 20/day for a fresh account.</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Adding…' : 'Add account'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { MAILBOX_STATUSES } from '@klyro/shared/enums';
import api, { unwrap } from '../lib/api.js';
import { useToast } from '../hooks/useToast.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import {
  Card,
  Button,
  Input,
  Label,
  Spinner,
  EmptyState,
} from '../components/ui/index.jsx';

export default function Mailboxes() {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: '', fromName: '', dailyCap: 40 });

  const { data, isLoading } = useQuery({
    queryKey: ['mailboxes'],
    queryFn: () => unwrap(api.get('/admin/outreach/mailboxes')),
  });

  const rows = Array.isArray(data) ? data : data?.items || [];

  const create = useMutation({
    mutationFn: (body) => unwrap(api.post('/admin/outreach/mailboxes', body)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mailboxes'] });
      toast.success('Mailbox added');
      setOpen(false);
      setForm({ email: '', fromName: '', dailyCap: 40 });
    },
    onError: (e) => toast.error(e.message || 'Create failed'),
  });

  const update = useMutation({
    mutationFn: ({ id, body }) =>
      unwrap(api.patch(`/admin/outreach/mailboxes/${id}`, body)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mailboxes'] });
      toast.success('Mailbox updated');
    },
    onError: (e) => toast.error(e.message || 'Update failed'),
  });

  return (
    <div>
      <PageHeader
        title="Mailboxes"
        description="Sending accounts and warm-up caps."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus size={16} /> Add mailbox
          </Button>
        }
      />

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No mailboxes" hint="Add a sending account." />
          </div>
        ) : (
          <div className="-mx-px overflow-x-auto overscroll-x-contain">
            <table className="w-full min-w-[640px] text-sm [&_th]:whitespace-nowrap">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">From name</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Daily cap</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => {
                  const id = m._id || m.id;
                  return (
                    <tr key={id} className="border-b border-border/60">
                      <td className="px-4 py-3">{m.email}</td>
                      <td className="px-4 py-3">{m.fromName || '—'}</td>
                      <td className="px-4 py-3">
                        <select
                          value={m.status || 'warming'}
                          onChange={(e) =>
                            update.mutate({ id, body: { status: e.target.value } })
                          }
                          className="rounded-md border border-input bg-muted px-2 py-1 text-xs"
                        >
                          {MAILBOX_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          defaultValue={m.dailyCap ?? 40}
                          onBlur={(e) =>
                            update.mutate({
                              id,
                              body: { dailyCap: Number(e.target.value) },
                            })
                          }
                          className="w-20 rounded-md border border-input bg-muted px-2 py-1 text-xs"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} title="Add mailbox">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate({ ...form, dailyCap: Number(form.dailyCap) });
          }}
          className="space-y-4"
        >
          <div>
            <Label htmlFor="mbemail">Email</Label>
            <Input
              id="mbemail"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="mbname">From name</Label>
            <Input
              id="mbname"
              value={form.fromName}
              onChange={(e) => setForm({ ...form, fromName: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="mbcap">Daily cap</Label>
            <Input
              id="mbcap"
              type="number"
              value={form.dailyCap}
              onChange={(e) => setForm({ ...form, dailyCap: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Adding…' : 'Add'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil } from 'lucide-react';
import api, { unwrap } from '../lib/api.js';
import { useToast } from '../hooks/useToast.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import {
  Card,
  CardContent,
  Button,
  Input,
  Label,
  Textarea,
  Badge,
  Spinner,
  EmptyState,
} from '../components/ui/index.jsx';

export default function Templates() {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [channel, setChannel] = useState('email');
  const [variants, setVariants] = useState([{ subject: '', body: '' }]);
  const [editId, setEditId] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: () => unwrap(api.get('/admin/outreach/templates')),
  });

  const rows = Array.isArray(data) ? data : data?.items || [];

  const create = useMutation({
    mutationFn: (body) => unwrap(editId ? api.patch(`/admin/manage/templates/${editId}`, body) : api.post('/admin/outreach/templates', body)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] });
      toast.success(editId ? 'Template saved' : 'Template created');
      reset();
    },
    onError: (e) => toast.error(e.message || 'Create failed'),
  });

  const remove = useMutation({
    mutationFn: (id) => unwrap(api.delete(`/admin/manage/templates/${id}`)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Template deleted');
    },
    onError: (e) => toast.error(e.message || 'Delete failed'),
  });
  const openEdit = (t) => {
    setEditId(String(t._id || t.id));
    setName(t.name || '');
    setChannel(t.channel || 'email');
    setVariants((t.variants || []).length ? t.variants.map((v) => ({ label: v.label, subject: v.subject || '', body: v.body || '', weight: v.weight ?? 1 })) : [{ subject: '', body: '' }]);
    setOpen(true);
  };
  const reset = () => {
    setEditId(null);
    setOpen(false);
    setName('');
    setChannel('email');
    setVariants([{ subject: '', body: '' }]);
  };

  return (
    <div>
      <PageHeader
        title="Templates"
        description="Reusable outreach message variants."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus size={16} /> New template
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title="No templates" hint="Create one with A/B variants." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rows.map((t) => (
            <Card key={t._id || t.id}>
              <CardContent className="p-5">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="font-semibold">{t.name}</h3>
                  <Badge variant="primary">{t.channel || 'email'}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {(t.variants || []).length} variant
                  {(t.variants || []).length === 1 ? '' : 's'}
                </p>
                {(t.variants || []).map((v, i) => (
                  <div key={i} className="mt-2 rounded-md border border-border/60 p-2 text-sm">
                    {v.subject && <p className="font-medium">{v.subject}</p>}
                    <p className="line-clamp-4 whitespace-pre-wrap text-muted-foreground">{v.body}</p>
                  </div>
                ))}
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => openEdit(t)}>
                    <Pencil size={14} aria-hidden="true" /> Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => window.confirm(`Delete template "${t.name}"?`) && remove.mutate(String(t._id || t.id))} aria-label={`Delete ${t.name}`}>
                    <Trash2 size={14} aria-hidden="true" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onClose={reset} title={editId ? 'Edit template' : 'New template'} className="max-w-2xl!">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate({ name, channel, variants });
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="tname">Name</Label>
              <Input
                id="tname"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="tchannel">Channel</Label>
              <select
                id="tchannel"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className="h-10 w-full rounded-lg border border-input bg-muted px-3 text-sm"
              >
                <option value="email">Email</option>
                <option value="linkedin">LinkedIn</option>
                <option value="reddit">Reddit</option>
                <option value="discord">Discord</option>
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="mb-0">Variants</Label>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setVariants([...variants, { subject: '', body: '' }])}
              >
                <Plus size={14} /> Add
              </Button>
            </div>
            {variants.map((v, i) => (
              <div key={i} className="rounded-lg border border-border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Variant {i + 1}</span>
                  {variants.length > 1 && (
                    <button
                      type="button"
                      aria-label="Remove variant"
                      onClick={() => setVariants(variants.filter((_, j) => j !== i))}
                      className="cursor-pointer text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <Input
                  placeholder="Subject"
                  value={v.subject}
                  onChange={(e) => {
                    const next = [...variants];
                    next[i] = { ...next[i], subject: e.target.value };
                    setVariants(next);
                  }}
                  className="mb-2"
                />
                <Textarea
                  placeholder="Body"
                  value={v.body}
                  onChange={(e) => {
                    const next = [...variants];
                    next[i] = { ...next[i], body: e.target.value };
                    setVariants(next);
                  }}
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={reset}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Saving…' : editId ? 'Save' : 'Create'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

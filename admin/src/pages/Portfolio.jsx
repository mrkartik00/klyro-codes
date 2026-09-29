import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2 } from 'lucide-react';
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
  Spinner,
  EmptyState,
} from '../components/ui/index.jsx';

const emptyItem = () => ({ title: '', url: '', description: '', tags: '' });

export default function Portfolio() {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyItem());

  const { data, isLoading } = useQuery({
    queryKey: ['portfolio'],
    queryFn: () => unwrap(api.get('/admin/portfolio')),
  });
  const rows = Array.isArray(data) ? data : data?.items || [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ['portfolio'] });

  const create = useMutation({
    mutationFn: (body) => unwrap(api.post('/admin/portfolio', body)),
    onSuccess: () => {
      invalidate();
      toast.success('Project added');
      close();
    },
    onError: (e) => toast.error(e.message || 'Failed'),
  });

  const update = useMutation({
    mutationFn: ({ id, body }) => unwrap(api.patch(`/admin/portfolio/${id}`, body)),
    onSuccess: () => {
      invalidate();
      toast.success('Project updated');
      close();
    },
    onError: (e) => toast.error(e.message || 'Failed'),
  });

  const remove = useMutation({
    mutationFn: (id) => unwrap(api.delete(`/admin/portfolio/${id}`)),
    onSuccess: () => {
      invalidate();
      toast.success('Project removed');
    },
    onError: (e) => toast.error(e.message || 'Failed'),
  });

  const close = () => {
    setOpen(false);
    setEditingId(null);
    setForm(emptyItem());
  };

  const openEdit = (item) => {
    setEditingId(item._id || item.id);
    setForm({
      title: item.title || '',
      url: item.url || '',
      description: item.description || '',
      tags: (item.tags || []).join(', '),
    });
    setOpen(true);
  };

  const submit = (e) => {
    e.preventDefault();
    const body = {
      title: form.title,
      url: form.url,
      description: form.description,
      tags: form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    };
    if (editingId) update.mutate({ id: editingId, body });
    else create.mutate(body);
  };

  return (
    <div>
      <PageHeader
        title="Portfolio"
        description="Case studies shown on the marketing site."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus size={16} /> Add project
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title="No portfolio items" hint="Add your best work." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rows.map((item) => {
            const id = item._id || item.id;
            return (
              <Card key={id}>
                <CardContent className="p-5">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <h3 className="font-semibold">{item.title}</h3>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        aria-label="Edit"
                        onClick={() => openEdit(item)}
                        className="grid h-8 w-8 place-items-center cursor-pointer rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        aria-label="Delete"
                        onClick={() => remove.mutate(id)}
                        className="grid h-8 w-8 place-items-center cursor-pointer rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                  {item.url && (
                    <p className="text-xs text-accent">{item.url}</p>
                  )}
                  <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                    {item.description}
                  </p>
                  {(item.tags || []).length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {item.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog
        open={open}
        onClose={close}
        title={editingId ? 'Edit project' : 'Add project'}
      >
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="ptitle">Title</Label>
            <Input
              id="ptitle"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="purl">URL</Label>
            <Input
              id="purl"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="pdesc">Description</Label>
            <Textarea
              id="pdesc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="ptags">Tags (comma-separated)</Label>
            <Input
              id="ptags"
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={create.isPending || update.isPending}
            >
              {editingId ? 'Save' : 'Add'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

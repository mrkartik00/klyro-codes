import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import api, { unwrap } from '../lib/api.js';
import { useToast } from '../hooks/useToast.jsx';
import { formatDate } from '../lib/format.js';
import { PageHeader } from '../components/PageHeader.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import {
  Card,
  Button,
  Input,
  Label,
  Select,
  Badge,
  Spinner,
  EmptyState,
} from '../components/ui/index.jsx';

export default function Targets() {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ query: '', location: '', source: 'google_maps' });

  const { data, isLoading } = useQuery({
    queryKey: ['scrape-targets'],
    queryFn: () => unwrap(api.get('/admin/scrape/targets')),
  });

  const rows = Array.isArray(data) ? data : data?.items || [];

  const create = useMutation({
    mutationFn: (body) => unwrap(api.post('/admin/scrape/targets', body)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scrape-targets'] });
      toast.success('Target created');
      setOpen(false);
      setForm({ query: '', location: '', source: 'google_maps' });
    },
    onError: (e) => toast.error(e.message || 'Create failed'),
  });

  return (
    <div>
      <PageHeader
        title="Scrape Targets"
        description="Sources to discover new leads."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus size={16} /> New target
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
            <EmptyState title="No scrape targets" hint="Create one to start discovery." />
          </div>
        ) : (
          <div className="-mx-px overflow-x-auto overscroll-x-contain">
            <table className="w-full min-w-[640px] text-sm [&_th]:whitespace-nowrap">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Query</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t._id || t.id} className="border-b border-border/60">
                    <td className="px-4 py-3">{t.query || t.name || '—'}</td>
                    <td className="px-4 py-3">{t.location || '—'}</td>
                    <td className="px-4 py-3">{t.source || '—'}</td>
                    <td className="px-4 py-3">
                      <Badge>{t.status || 'queued'}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(t.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} title="New scrape target">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(form);
          }}
          className="space-y-4"
        >
          <div>
            <Label htmlFor="query">Search query</Label>
            <Input
              id="query"
              required
              value={form.query}
              onChange={(e) => setForm({ ...form, query: e.target.value })}
              placeholder="e.g. plumbers"
            />
          </div>
          <div>
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="e.g. London, UK"
            />
          </div>
          <div>
            <Label htmlFor="source">Source</Label>
            <Select
              id="source"
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
            >
              <option value="google_maps">Google Maps</option>
              <option value="linkedin">LinkedIn</option>
              <option value="reddit">Reddit</option>
              <option value="directory">Directory</option>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

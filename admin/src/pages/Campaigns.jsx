import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, ChevronRight } from 'lucide-react';
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
  Badge,
  Spinner,
  EmptyState,
} from '../components/ui/index.jsx';

export default function Campaigns() {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => unwrap(api.get('/admin/outreach/campaigns')),
  });

  const rows = Array.isArray(data) ? data : data?.items || [];

  const create = useMutation({
    mutationFn: (body) => unwrap(api.post('/admin/outreach/campaigns', body)),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign created');
      setOpen(false);
      setName('');
      const id = created?._id || created?.id;
      if (id) navigate(`/campaigns/${id}`);
    },
    onError: (e) => toast.error(e.message || 'Create failed'),
  });

  return (
    <div>
      <PageHeader
        title="Campaigns"
        description="Multi-step outreach sequences."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus size={16} /> New campaign
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title="No campaigns" hint="Create a sequence to enroll leads." />
      ) : (
        <div className="space-y-3">
          {rows.map((c) => {
            const id = c._id || c.id;
            return (
              <Card
                key={id}
                className="cursor-pointer transition-colors hover:border-accent"
                onClick={() => navigate(`/campaigns/${id}`)}
              >
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{c.name}</span>
                      <Badge variant={c.status === 'active' ? 'success' : 'default'}>
                        {c.status || 'draft'}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {(c.steps || []).length} steps · {c.enrolledCount ?? 0} enrolled
                    </p>
                  </div>
                  <ChevronRight size={18} className="text-muted-foreground" />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="New campaign">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate({ name });
          }}
          className="space-y-4"
        >
          <div>
            <Label htmlFor="cname">Campaign name</Label>
            <Input
              id="cname"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
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

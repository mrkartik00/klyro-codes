import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import api, { unwrap } from '../lib/api.js';
import { useToast } from '../hooks/useToast.jsx';
import { formatDate } from '../lib/format.js';
import { PageHeader } from '../components/PageHeader.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import {
  Card,
  CardContent,
  Button,
  Textarea,
  Badge,
  Spinner,
  EmptyState,
} from '../components/ui/index.jsx';

export default function Approvals() {
  const qc = useQueryClient();
  const toast = useToast();
  const [selected, setSelected] = useState(new Set());
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['approvals'],
    queryFn: () => unwrap(api.get('/admin/outreach/approvals')),
  });

  const rows = Array.isArray(data) ? data : data?.items || [];

  const decide = useMutation({
    mutationFn: ({ id, decision, editedDraft }) =>
      unwrap(
        api.post(`/admin/outreach/approvals/${id}/decide`, {
          decision,
          editedDraft,
        })
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approvals'] });
      toast.success('Decision recorded');
      setEditing(null);
    },
    onError: (e) => toast.error(e.message || 'Failed'),
  });

  const bulk = useMutation({
    mutationFn: ({ ids, decision }) =>
      unwrap(
        api.post('/admin/outreach/approvals/bulk', {
          ids,
          decision,
        })
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approvals'] });
      toast.success('Bulk decision applied');
      setSelected(new Set());
    },
    onError: (e) => toast.error(e.message || 'Bulk failed'),
  });

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openEdit = (item) => {
    setEditing(item);
    setDraft(item.draft || item.body || item.editedDraft || '');
  };

  return (
    <div>
      <PageHeader
        title="Approvals"
        description="Review AI-drafted outbound messages."
        actions={
          selected.size > 0 && (
            <div className="flex gap-2">
              <Button
                variant="success"
                size="sm"
                onClick={() =>
                  bulk.mutate({ ids: [...selected], decision: 'approve' })
                }
              >
                <Check size={16} /> Approve {selected.size}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() =>
                  bulk.mutate({ ids: [...selected], decision: 'reject' })
                }
              >
                <X size={16} /> Reject {selected.size}
              </Button>
            </div>
          )
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title="No pending approvals" hint="You're all caught up." />
      ) : (
        <div className="space-y-3">
          {rows.map((item) => {
            const id = item._id || item.id;
            return (
              <Card key={id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selected.has(id)}
                      onChange={() => toggle(id)}
                      aria-label="Select for bulk action"
                      className="mt-1 h-4 w-4 cursor-pointer"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="font-medium">
                          {item.leadName || item.to || item.recipient || 'Recipient'}
                        </span>
                        <Badge>{item.channel || 'email'}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(item.createdAt)}
                        </span>
                      </div>
                      {item.subject && (
                        <p className="text-sm font-medium">{item.subject}</p>
                      )}
                      <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                        {item.draft || item.body || item.editedDraft || '—'}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="success"
                          onClick={() => decide.mutate({ id, decision: 'approve' })}
                        >
                          <Check size={14} /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => decide.mutate({ id, decision: 'reject' })}
                        >
                          <X size={14} /> Reject
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => openEdit(item)}
                        >
                          Edit draft
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Edit draft & approve"
        className="max-w-2xl"
      >
        <div className="space-y-4">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="min-h-[200px]"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              variant="success"
              disabled={decide.isPending}
              onClick={() =>
                decide.mutate({
                  id: editing._id || editing.id,
                  decision: 'approve',
                  editedDraft: draft,
                })
              }
            >
              Approve with edits
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

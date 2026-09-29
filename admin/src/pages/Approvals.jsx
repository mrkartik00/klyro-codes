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
  Label,
  Input,
} from '../components/ui/index.jsx';

import { draftOf } from '../lib/drafts.js';

export default function Approvals() {
  const qc = useQueryClient();
  const toast = useToast();
  const [selected, setSelected] = useState(new Set());
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({ subject: '', body: '' });

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
    const d = draftOf(item);
    setEditing(item);
    setDraft({ subject: d.subject, body: d.body });
  };

  return (
    <div>
      <PageHeader
        title="Approvals"
        description="Review AI-drafted outbound messages."
        actions={
          selected.size > 0 && (
            <div className="flex flex-wrap gap-2">
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
            const d = draftOf(item);
            return (
              <Card key={id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <label className="-m-2 grid h-10 w-10 shrink-0 cursor-pointer place-items-center">
                      <input
                        type="checkbox"
                        checked={selected.has(id)}
                        onChange={() => toggle(id)}
                        aria-label="Select for bulk action"
                        className="h-4 w-4 cursor-pointer"
                      />
                    </label>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="min-w-0 truncate font-medium">
                          {item.leadName || item.to || item.recipient || `Step ${item.stepOrder ?? ''}`.trim() || 'Recipient'}
                        </span>
                        <Badge>{item.channel || 'email'}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(item.createdAt)}
                        </span>
                      </div>
                      {d.subject && <p className="text-sm font-medium break-words">{d.subject}</p>}
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                        {d.body || '—'}
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
          <div>
            <Label htmlFor="draft-subject">Subject</Label>
            <Input
              id="draft-subject"
              value={draft.subject}
              onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="draft-body">Body</Label>
            <Textarea
              id="draft-body"
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              className="min-h-[200px]"
            />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
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
                  editedDraft: { subject: draft.subject, body: draft.body },
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

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import api, { unwrap } from '../lib/api.js';
import { useToast } from '../hooks/useToast.jsx';
import { formatDate } from '../lib/format.js';
import { PageHeader } from '../components/PageHeader.jsx';
import {
  Card,
  CardContent,
  Button,
  Input,
  Textarea,
  Label,
  Badge,
  Spinner,
  EmptyState,
} from '../components/ui/index.jsx';

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();

  const { data: lead, isLoading, isError } = useQuery({
    queryKey: ['lead', id],
    queryFn: () => unwrap(api.get(`/admin/leads/${id}`)),
  });

  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (lead) {
      setTags((lead.tags || []).join(', '));
      setNotes(lead.notes || '');
    }
  }, [lead]);

  const mutation = useMutation({
    mutationFn: (body) => unwrap(api.patch(`/admin/leads/${id}`, body)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead', id] });
      toast.success('Lead updated');
    },
    onError: (e) => toast.error(e.message || 'Update failed'),
  });

  const save = () => {
    mutation.mutate({
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      notes,
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }
  if (isError || !lead) {
    return <EmptyState title="Lead not found" />;
  }

  const messages = lead.messages || lead.timeline || [];

  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate('/leads')}
        className="mb-4"
      >
        <ArrowLeft size={16} /> Back to leads
      </Button>

      <PageHeader
        title={lead.companyName || lead.company || lead.name || 'Lead'}
        description={lead.email || ''}
        actions={<Badge variant="primary">{lead.stage || 'new'}</Badge>}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-5">
              <h3 className="mb-4 font-heading text-lg font-semibold">
                Message Timeline
              </h3>
              {messages.length === 0 ? (
                <EmptyState title="No messages yet" />
              ) : (
                <ul className="space-y-3">
                  {messages.map((m, i) => (
                    <li
                      key={m._id || m.id || i}
                      className="rounded-lg border border-border bg-muted/40 p-3"
                    >
                      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{m.channel || m.direction || 'message'}</span>
                        <span>{formatDate(m.createdAt || m.sentAt)}</span>
                      </div>
                      <p className="text-sm">{m.body || m.text || m.subject || '—'}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardContent className="p-5">
              <h3 className="mb-4 font-heading text-lg font-semibold">Tags & Notes</h3>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="tags">Tags (comma-separated)</Label>
                  <Input
                    id="tags"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
                <Button
                  onClick={save}
                  disabled={mutation.isPending}
                  className="w-full"
                >
                  {mutation.isPending ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

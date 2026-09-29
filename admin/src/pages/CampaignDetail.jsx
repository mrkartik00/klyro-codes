import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus } from 'lucide-react';
import api, { unwrap } from '../lib/api.js';
import { useToast } from '../hooks/useToast.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
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

export default function CampaignDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();

  const [step, setStep] = useState({ dayOffset: 0, subject: '', body: '' });
  const [leadIds, setLeadIds] = useState('');

  const { data: campaign, isLoading, isError } = useQuery({
    queryKey: ['campaign', id],
    queryFn: () => unwrap(api.get(`/admin/outreach/campaigns/${id}`)),
  });

  const addStep = useMutation({
    mutationFn: (body) =>
      unwrap(api.post(`/admin/outreach/campaigns/${id}/steps`, body)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaign', id] });
      toast.success('Step added');
      setStep({ dayOffset: 0, subject: '', body: '' });
    },
    onError: (e) => toast.error(e.message || 'Failed to add step'),
  });

  const enroll = useMutation({
    mutationFn: (ids) =>
      unwrap(api.post(`/admin/outreach/campaigns/${id}/enroll`, { leadIds: ids })),
    onSuccess: () => {
      toast.success('Leads enrolled');
      setLeadIds('');
    },
    onError: (e) => toast.error(e.message || 'Enroll failed'),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }
  if (isError || !campaign) return <EmptyState title="Campaign not found" />;

  const steps = campaign.steps || [];

  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate('/campaigns')}
        className="mb-4"
      >
        <ArrowLeft size={16} /> Back to campaigns
      </Button>

      <PageHeader
        title={campaign.name || 'Campaign'}
        actions={
          <Badge variant={campaign.status === 'active' ? 'success' : 'default'}>
            {campaign.status || 'draft'}
          </Badge>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-5">
              <h3 className="mb-4 font-heading text-lg font-semibold">Steps</h3>
              {steps.length === 0 ? (
                <EmptyState title="No steps yet" />
              ) : (
                <ol className="space-y-3">
                  {steps.map((st, i) => (
                    <li
                      key={st._id || st.id || i}
                      className="rounded-lg border border-border p-3"
                    >
                      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                        <span>Step {i + 1}</span>
                        <span>Day +{st.dayOffset ?? 0}</span>
                      </div>
                      <p className="text-sm font-medium">{st.subject || '(no subject)'}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{st.body}</p>
                    </li>
                  ))}
                </ol>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addStep.mutate({ ...step, dayOffset: Number(step.dayOffset) });
                }}
                className="mt-5 space-y-3 border-t border-border pt-5"
              >
                <h4 className="text-sm font-semibold">Add step</h4>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="day">Day offset</Label>
                    <Input
                      id="day"
                      type="number"
                      value={step.dayOffset}
                      onChange={(e) => setStep({ ...step, dayOffset: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="subj">Subject</Label>
                    <Input
                      id="subj"
                      value={step.subject}
                      onChange={(e) => setStep({ ...step, subject: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="body">Body</Label>
                  <Textarea
                    id="body"
                    value={step.body}
                    onChange={(e) => setStep({ ...step, body: e.target.value })}
                  />
                </div>
                <Button type="submit" disabled={addStep.isPending}>
                  <Plus size={16} /> Add step
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardContent className="p-5">
              <h3 className="mb-4 font-heading text-lg font-semibold">Enroll leads</h3>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const ids = leadIds
                    .split(/[\s,]+/)
                    .map((x) => x.trim())
                    .filter(Boolean);
                  if (ids.length) enroll.mutate(ids);
                }}
                className="space-y-3"
              >
                <Label htmlFor="leadIds">Lead IDs (comma or newline separated)</Label>
                <Textarea
                  id="leadIds"
                  value={leadIds}
                  onChange={(e) => setLeadIds(e.target.value)}
                  placeholder="id1, id2, id3"
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={enroll.isPending}
                >
                  {enroll.isPending ? 'Enrolling…' : 'Enroll'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

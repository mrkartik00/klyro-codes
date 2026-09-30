import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, Mail, Phone, MapPin, Star } from 'lucide-react';
import { LEAD_STAGES } from '@klyro/shared/enums';
import api, { unwrap } from '../lib/api.js';
import { useToast } from '../hooks/useToast.jsx';
import { formatDate } from '../lib/format.js';
import { PageHeader } from '../components/PageHeader.jsx';
import { Card, CardContent, Button, Input, Label, Select, Textarea, Badge, Spinner, EmptyState } from '../components/ui/index.jsx';

const ISSUE_LABEL = {
  'no-website': 'No website',
  unreachable: 'Website down',
  'no-ssl': 'No HTTPS',
  'no-viewport': 'Not mobile-friendly',
  'slow-mobile': 'Slow on mobile',
  'no-title': 'Missing page title',
  'no-meta-description': 'No meta description',
  'stale-copyright': 'Outdated footer',
  'no-email-found': 'No email on site',
  'email-no-mx': 'Email domain has no mail server',
  'heavy-page': 'Very heavy page',
};
const EMAIL_TONE = { valid: 'success', risky: 'warning', invalid: 'destructive', unknown: 'default' };

const CHANNEL_LABEL = { linkedin: 'LinkedIn', x: 'X (Twitter)', reddit: 'Reddit', instagram: 'Instagram', facebook: 'Facebook', youtube: 'YouTube', tiktok: 'TikTok' };

/** Every way to reach this lead, each with Open + Copy — so you can contact them yourself. */
function ContactChannels({ org, contact, lead, website }) {
  const toast = useToast();
  const plain = (o) => (o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).filter(([k, v]) => v && !k.startsWith('_'))) : {});
  const socials = { ...plain(org.socials), ...plain(contact.socials) };
  if (contact.linkedinUrl && !socials.linkedin) socials.linkedin = contact.linkedinUrl;
  const handles = plain(contact.handles);
  const rows = [];
  if (contact.email) rows.push({ label: 'Email', value: contact.email, href: `mailto:${contact.email}` });
  if (contact.phone || org.phone) rows.push({ label: 'Phone', value: contact.phone || org.phone, href: `tel:${contact.phone || org.phone}` });
  if (website) rows.push({ label: 'Website', value: org.domain || website, href: website });
  for (const [k, url] of Object.entries(socials)) rows.push({ label: CHANNEL_LABEL[k] || k, value: handles[k] || url.replace(/^https?:\/\/(www\.)?/, ''), href: url });
  if (lead.sourceUrl && !rows.some((r) => r.href === lead.sourceUrl)) rows.push({ label: 'Found at', value: lead.sourceUrl.replace(/^https?:\/\/(www\.)?/, ''), href: lead.sourceUrl });

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied');
    } catch {
      toast.error('Copy failed');
    }
  };

  return (
    <Card>
      <CardContent className="p-5">
        <h3 className="mb-3 text-base font-semibold">Contact channels</h3>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No contact details yet. Add a link or email in Notes, or re-run enrichment.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {rows.map((r) => (
              <li key={`${r.label}-${r.href}`} className="flex items-center gap-3 px-3 py-2">
                <span className="w-24 shrink-0 text-xs text-muted-foreground">{r.label}</span>
                <a href={r.href} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-sm text-primary hover:underline">
                  {r.value}
                </a>
                <Button size="sm" variant="ghost" onClick={() => copy(r.value.startsWith('http') ? r.href : r.value)} aria-label={`Copy ${r.label}`}>
                  Copy
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['lead', id],
    queryFn: () => unwrap(api.get(`/admin/leads/${id}`)),
  });
  // API: { lead (populated organizationId, primaryContactId, auditId), messages }
  const lead = data?.lead ?? data;
  const messages = data?.messages ?? [];
  const org = (lead?.organizationId && typeof lead.organizationId === 'object' ? lead.organizationId : null) || {};
  const contact = (lead?.primaryContactId && typeof lead.primaryContactId === 'object' ? lead.primaryContactId : null) || {};
  const audit = (lead?.auditId && typeof lead.auditId === 'object' ? lead.auditId : null) || null;

  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');
  const [stage, setStage] = useState('');

  useEffect(() => {
    if (lead) {
      setTags((lead.tags || []).join(', '));
      setNotes(lead.notes || '');
      setStage(lead.stage || 'new');
    }
  }, [lead]);

  const mutation = useMutation({
    mutationFn: (body) => unwrap(api.patch(`/admin/leads/${id}`, body)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead', id] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Lead updated');
    },
    onError: (e) => toast.error(e.message || 'Update failed'),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }
  if (isError || !lead) return <EmptyState title="Lead not found" hint="It may have been merged or deleted." />;

  const website = org.domain ? `https://${org.domain}` : audit?.url;
  const reasons = lead.scoreBreakdown?.reasons || [];

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate('/leads')}>
        <ArrowLeft size={16} aria-hidden="true" /> Back to leads
      </Button>

      <PageHeader
        title={org.name || 'Lead'}
        description={[org.category, org.city, org.country].filter(Boolean).join(' · ')}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="primary">{lead.stage || 'new'}</Badge>
            <Badge>score {lead.score ?? 0}</Badge>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardContent className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
              <div className="space-y-2 text-sm">
                <h3 className="text-base font-semibold">Business</h3>
                {website ? (
                  <a href={website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 break-all text-primary hover:underline">
                    <ExternalLink size={14} aria-hidden="true" /> {org.domain || website}
                  </a>
                ) : (
                  <p className="text-muted-foreground">No website</p>
                )}
                {org.phone && (
                  <a href={`tel:${org.phone}`} className="flex items-center gap-2 hover:underline">
                    <Phone size={14} aria-hidden="true" /> {org.phone}
                  </a>
                )}
                {org.address && (
                  <p className="flex items-start gap-2 text-muted-foreground">
                    <MapPin size={14} className="mt-0.5 shrink-0" aria-hidden="true" /> {org.address}
                  </p>
                )}
                {typeof org.rating === 'number' && (
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Star size={14} aria-hidden="true" /> {org.rating} ({org.reviewCount ?? 0} reviews)
                  </p>
                )}
              </div>
              <div className="space-y-2 text-sm">
                <h3 className="text-base font-semibold">Contact</h3>
                {contact.email ? (
                  <p className="flex flex-wrap items-center gap-2">
                    <Mail size={14} aria-hidden="true" />
                    <a href={`mailto:${contact.email}`} className="break-all hover:underline">
                      {contact.email}
                    </a>
                    <Badge variant={EMAIL_TONE[contact.emailStatus] || 'default'}>{contact.emailStatus || 'unknown'}</Badge>
                  </p>
                ) : (
                  <p className="text-muted-foreground">No email found yet</p>
                )}
                {contact.name && <p>{contact.name}</p>}
                {reasons.length > 0 && (
                  <p className="text-xs text-muted-foreground">Score reasons: {reasons.join(', ')}</p>
                )}
              </div>
            </CardContent>
          </Card>

          <ContactChannels org={org} contact={contact} lead={lead} website={website} />

          {lead.intent?.externalId && (
            <Card>
              <CardContent className="space-y-3 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-semibold">Where we found them</h3>
                  <Badge variant="warning">
                    {lead.intent.community} · intent {Math.round((lead.intent.score ?? 0) * 100)}%
                  </Badge>
                </div>
                <p className="text-sm font-medium">{lead.intent.title}</p>
                {lead.intent.need && <p className="text-sm text-muted-foreground">Needs: {lead.intent.need}</p>}
                {lead.intent.text && (
                  <blockquote className="max-h-60 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/40 p-3 text-sm">
                    {lead.intent.text}
                  </blockquote>
                )}
                <p className="text-xs text-muted-foreground">
                  Posted by {lead.intent.author}
                  {lead.intent.postedAt ? ` · ${formatDate(lead.intent.postedAt)}` : ''}
                </p>
                {lead.sourceUrl && (
                  <a href={lead.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm text-primary hover:underline">
                    <ExternalLink size={14} aria-hidden="true" /> Open the post
                  </a>
                )}
              </CardContent>
            </Card>
          )}

          {audit && (
            <Card>
              <CardContent className="space-y-3 p-5">
                <h3 className="text-base font-semibold">Website audit</h3>
                {(audit.issues || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No obvious problems found.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {audit.issues.map((i) => (
                      <Badge key={i} variant="warning">
                        {ISSUE_LABEL[i] || i}
                      </Badge>
                    ))}
                  </div>
                )}
                <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-muted-foreground">HTTPS</dt>
                    <dd>{audit.hasSsl == null ? '—' : audit.hasSsl ? 'Yes' : 'No'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Mobile</dt>
                    <dd>{audit.mobileFriendly == null ? '—' : audit.mobileFriendly ? 'Yes' : 'No'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Speed score</dt>
                    <dd>{audit.mobileScore ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Built with</dt>
                    <dd className="truncate">{(audit.techStack || []).slice(0, 2).join(', ') || '—'}</dd>
                  </div>
                </dl>
                {audit.socials && Object.keys(audit.socials).length > 0 && (
                  <div className="flex flex-wrap gap-3 text-sm">
                    {Object.entries(audit.socials).map(([k, url]) => (
                      <a key={k} href={url} target="_blank" rel="noopener noreferrer" className="capitalize text-primary hover:underline">
                        {k}
                      </a>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-5">
              <h3 className="mb-4 text-base font-semibold">Messages</h3>
              {messages.length === 0 ? (
                <EmptyState title="No messages yet" hint="Emails and replies appear here." />
              ) : (
                <ul className="space-y-3">
                  {messages.map((m, i) => (
                    <li key={m._id || m.id || i} className="rounded-lg border border-border bg-muted/40 p-3">
                      <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span className="capitalize">
                          {m.direction === 'inbound' ? 'Reply' : 'Sent'} · {m.status}
                          {m.replyClass ? ` · ${m.replyClass.replace(/_/g, ' ')}` : ''}
                        </span>
                        <span>{formatDate(m.sentAt || m.createdAt)}</span>
                      </div>
                      {m.subject && <p className="text-sm font-medium">{m.subject}</p>}
                      <p className="whitespace-pre-wrap break-words text-sm">{m.body || m.snippet || '—'}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardContent className="space-y-4 p-5">
            <h3 className="text-base font-semibold">Manage</h3>
            <div>
              <Label htmlFor="stage">Stage</Label>
              <Select id="stage" value={stage} onChange={(e) => setStage(e.target.value)} className="capitalize">
                {LEAD_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="tags">Tags (comma-separated)</Label>
              <Input id="tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="hot, follow-up" />
            </div>
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <Button
              className="w-full"
              disabled={mutation.isPending}
              onClick={() =>
                mutation.mutate({
                  stage,
                  tags: tags
                    .split(',')
                    .map((t) => t.trim())
                    .filter(Boolean),
                  notes,
                })
              }
            >
              {mutation.isPending ? 'Saving…' : 'Save changes'}
            </Button>
            <p className="text-xs text-muted-foreground">Added {formatDate(lead.createdAt)}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

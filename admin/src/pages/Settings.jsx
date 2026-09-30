import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { unwrap } from '../lib/api.js';
import { useToast } from '../hooks/useToast.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { Card, CardContent, Button, Input, Label, Textarea, Spinner } from '../components/ui/index.jsx';

/** Settings come back as [{ key, value, encrypted }]. */
export function readSetting(rows, key, fallback = '') {
  const found = Array.isArray(rows) ? rows.find((r) => r.key === key) : rows?.[key];
  return found?.value ?? fallback;
}

const EMPTY_PROFILE = { name: '', email: '', phone: '', address: '', website: '', taxId: '' };

export default function Settings() {
  const qc = useQueryClient();
  const toast = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => unwrap(api.get('/admin/settings')),
  });
  const integrations = useQuery({
    queryKey: ['integrations'],
    queryFn: () => unwrap(api.get('/admin/settings/integrations')),
    refetchInterval: 30000,
  });
  const test = useMutation({
    mutationFn: (key) => unwrap(api.post(`/admin/settings/integrations/${key}/test`)),
    onSuccess: (d) => toast.success(d?.message || 'Test passed'),
    onError: (e) => toast.error(e.message || 'Test failed'),
  });

  const save = useMutation({
    mutationFn: ({ key, value }) => unwrap(api.put(`/admin/settings/${key}`, { value })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Saved');
    },
    onError: (e) => toast.error(e.message || 'Save failed'),
  });

  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [bank, setBank] = useState('');
  useEffect(() => {
    if (!data) return;
    const p = readSetting(data, 'businessProfile', null);
    setProfile({ ...EMPTY_PROFILE, ...(p && typeof p === 'object' ? p : {}) });
    setBank(String(readSetting(data, 'bankDetails', '') || ''));
  }, [data]);
  const set = (k) => (e) => setProfile((p) => ({ ...p, [k]: e.target.value }));

  const intRows = Array.isArray(integrations.data) ? integrations.data : [];

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Your business details appear on quotes, invoices and client emails." />

      <Card>
        <CardContent className="max-w-2xl space-y-4 p-5">
          <h2 className="text-base font-semibold">Business profile</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="bn">Business name</Label>
              <Input id="bn" value={profile.name} onChange={set('name')} placeholder="Klyro" />
            </div>
            <div>
              <Label htmlFor="be">Billing email</Label>
              <Input id="be" type="email" value={profile.email} onChange={set('email')} placeholder="billing@klyro.codes" />
            </div>
            <div>
              <Label htmlFor="bp">Phone</Label>
              <Input id="bp" type="tel" value={profile.phone} onChange={set('phone')} />
            </div>
            <div>
              <Label htmlFor="bw">Website</Label>
              <Input id="bw" value={profile.website} onChange={set('website')} placeholder="https://klyro.codes" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="ba">Address</Label>
              <Textarea id="ba" rows={2} value={profile.address} onChange={set('address')} />
            </div>
            <div>
              <Label htmlFor="bt">Tax / GST / VAT number</Label>
              <Input id="bt" value={profile.taxId} onChange={set('taxId')} />
            </div>
          </div>
          <Button onClick={() => save.mutate({ key: 'businessProfile', value: profile })} disabled={save.isPending}>
            Save profile
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="max-w-2xl space-y-4 p-5">
          <div>
            <h2 className="text-base font-semibold">Payment details</h2>
            <p className="text-sm text-muted-foreground">Printed at the bottom of every invoice PDF (bank transfer / UPI / PayPal).</p>
          </div>
          <Textarea
            id="bank"
            aria-label="Payment details"
            rows={5}
            value={bank}
            onChange={(e) => setBank(e.target.value)}
            placeholder={'Bank: …\nAccount name: …\nAccount no / IBAN: …\nIFSC / SWIFT: …'}
          />
          <Button onClick={() => save.mutate({ key: 'bankDetails', value: bank })} disabled={save.isPending}>
            Save payment details
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5">
          <div>
            <h2 className="text-base font-semibold">Integrations</h2>
            <p className="text-sm text-muted-foreground">
              Live status. Emails send only on weekdays, 9am–5pm in each lead&apos;s timezone, and only after you approve the draft.
            </p>
          </div>
          {integrations.isLoading ? (
            <Spinner />
          ) : intRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Could not load integration status.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {intRows.map((i) => (
                <li key={i.key} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <span
                        className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${i.ok ? 'bg-green-500' : 'bg-amber-500'}`}
                        aria-hidden="true"
                      />
                      {i.name}
                      <span className="sr-only">{i.ok ? '(working)' : '(needs attention)'}</span>
                    </p>
                    <p className="mt-0.5 break-words pl-[18px] text-xs text-muted-foreground">{i.detail}</p>
                  </div>
                  {i.test && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="sm:shrink-0"
                      onClick={() => test.mutate(i.key)}
                      disabled={test.isPending && test.variables === i.key}
                    >
                      {test.isPending && test.variables === i.key ? 'Testing…' : 'Send test'}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            Add, replace or test API keys on the <a href="/keys" className="underline">API keys</a> page. The n8n editor is at{' '}
            <a href="https://n8n.klyro.codes" target="_blank" rel="noopener noreferrer" className="underline">
              n8n.klyro.codes
            </a>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

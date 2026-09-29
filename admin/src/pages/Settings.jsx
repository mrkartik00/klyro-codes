import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { unwrap } from '../lib/api.js';
import { useToast } from '../hooks/useToast.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { Tabs } from '../components/ui/Tabs.jsx';
import {
  Card,
  CardContent,
  Button,
  Input,
  Label,
} from '../components/ui/index.jsx';

function readSetting(settings, key, fallback = '') {
  const found = Array.isArray(settings)
    ? settings.find((s) => s.key === key)
    : settings?.[key];
  return found?.value ?? found ?? fallback;
}

export default function Settings() {
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState('business');

  const { data } = useQuery({
    queryKey: ['settings'],
    queryFn: () => unwrap(api.get('/admin/settings')),
  });

  const save = useMutation({
    mutationFn: ({ key, value }) => unwrap(api.put(`/admin/settings/${key}`, { value })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Setting saved');
    },
    onError: (e) => toast.error(e.message || 'Save failed'),
  });

  // Business profile
  const [profile, setProfile] = useState({ businessName: '', supportEmail: '', website: '' });
  useEffect(() => {
    if (!data) return;
    setProfile({
      businessName: readSetting(data, 'businessName'),
      supportEmail: readSetting(data, 'supportEmail'),
      website: readSetting(data, 'website'),
    });
  }, [data]);

  // API keys — write-only, masked
  const [apiKeys, setApiKeys] = useState({ sendgrid: '', openai: '', hunter: '' });

  // Send windows
  const [sendWindow, setSendWindow] = useState({ start: '09:00', end: '17:00', timezone: 'Europe/London' });
  useEffect(() => {
    if (!data) return;
    const w = readSetting(data, 'sendWindow', null);
    if (w && typeof w === 'object') setSendWindow((prev) => ({ ...prev, ...w }));
  }, [data]);

  const tabs = [
    { value: 'business', label: 'Business profile' },
    { value: 'keys', label: 'API keys' },
    { value: 'windows', label: 'Send windows' },
  ];

  return (
    <div>
      <PageHeader title="Settings" description="Configure the platform." />

      <Tabs tabs={tabs} value={tab} onChange={setTab} className="mb-6" />

      {tab === 'business' && (
        <Card>
          <CardContent className="max-w-xl space-y-4 p-5">
            <div>
              <Label htmlFor="bn">Business name</Label>
              <Input
                id="bn"
                value={profile.businessName}
                onChange={(e) => setProfile({ ...profile, businessName: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="se">Support email</Label>
              <Input
                id="se"
                type="email"
                value={profile.supportEmail}
                onChange={(e) => setProfile({ ...profile, supportEmail: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="ws">Website</Label>
              <Input
                id="ws"
                value={profile.website}
                onChange={(e) => setProfile({ ...profile, website: e.target.value })}
              />
            </div>
            <Button
              onClick={() => {
                save.mutate({ key: 'businessName', value: profile.businessName });
                save.mutate({ key: 'supportEmail', value: profile.supportEmail });
                save.mutate({ key: 'website', value: profile.website });
              }}
              disabled={save.isPending}
            >
              Save profile
            </Button>
          </CardContent>
        </Card>
      )}

      {tab === 'keys' && (
        <Card>
          <CardContent className="max-w-xl space-y-4 p-5">
            <p className="text-sm text-muted-foreground">
              Keys are write-only. Existing values are masked and never returned by the
              API. Leave blank to keep the current key.
            </p>
            {[
              { k: 'sendgridApiKey', label: 'SendGrid API key', state: 'sendgrid' },
              { k: 'openaiApiKey', label: 'OpenAI API key', state: 'openai' },
              { k: 'hunterApiKey', label: 'Hunter API key', state: 'hunter' },
            ].map((f) => (
              <div key={f.k}>
                <Label htmlFor={f.k}>{f.label}</Label>
                <div className="flex gap-2">
                  <Input
                    id={f.k}
                    type="password"
                    placeholder="••••••••  (masked)"
                    value={apiKeys[f.state]}
                    onChange={(e) =>
                      setApiKeys({ ...apiKeys, [f.state]: e.target.value })
                    }
                  />
                  <Button
                    variant="secondary"
                    disabled={!apiKeys[f.state] || save.isPending}
                    onClick={() => {
                      save.mutate({ key: f.k, value: apiKeys[f.state] });
                      setApiKeys({ ...apiKeys, [f.state]: '' });
                    }}
                  >
                    Save
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {tab === 'windows' && (
        <Card>
          <CardContent className="max-w-xl space-y-4 p-5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="start">Start</Label>
                <Input
                  id="start"
                  type="time"
                  value={sendWindow.start}
                  onChange={(e) => setSendWindow({ ...sendWindow, start: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="end">End</Label>
                <Input
                  id="end"
                  type="time"
                  value={sendWindow.end}
                  onChange={(e) => setSendWindow({ ...sendWindow, end: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="tz">Timezone</Label>
              <Input
                id="tz"
                value={sendWindow.timezone}
                onChange={(e) => setSendWindow({ ...sendWindow, timezone: e.target.value })}
              />
            </div>
            <Button
              onClick={() => save.mutate({ key: 'sendWindow', value: sendWindow })}
              disabled={save.isPending}
            >
              Save send window
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

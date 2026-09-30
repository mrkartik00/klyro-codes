import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound, ExternalLink, Pencil, Trash2, PlayCircle, CheckCircle2, AlertTriangle, CircleDashed } from 'lucide-react';
import api, { unwrap } from '../lib/api.js';
import { useToast } from '../hooks/useToast.jsx';
import { formatDate } from '../lib/format.js';
import { PageHeader } from '../components/PageHeader.jsx';
import { Card, CardContent, Button, Input, Label, Badge, Spinner } from '../components/ui/index.jsx';

const SOURCE_BADGE = { admin: ['Set here', 'success'], env: ['From server .env', 'primary'] };

function StatusLine({ integration: i }) {
  const s = i.status;
  if (!i.configured) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <CircleDashed size={16} aria-hidden="true" /> Not set up
      </p>
    );
  }
  if (!s) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <CircleDashed size={16} aria-hidden="true" /> Configured — not used yet. Press Test.
      </p>
    );
  }
  return s.ok ? (
    <p className="flex items-start gap-2 text-sm text-emerald-400">
      <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>
        Working{s.detail ? ` — ${s.detail}` : ''} <span className="text-xs text-muted-foreground">· {formatDate(s.at)}</span>
      </span>
    </p>
  ) : (
    <p className="flex items-start gap-2 rounded-md border border-amber-700/60 bg-amber-950/40 p-2 text-sm text-amber-300" role="status">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>
        <span className="font-medium">Problem:</span> {s.reason} <span className="text-xs text-amber-200/70">· {formatDate(s.at)}</span>
      </span>
    </p>
  );
}

function KeyRow({ k, onSave, onRemove, busy }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [badge, tone] = SOURCE_BADGE[k.source] || ['Not set', 'default'];
  const id = `key-${k.name}`;
  return (
    <li className="space-y-2 px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{k.label}</span>
        <code className="text-xs text-muted-foreground">{k.name}</code>
        <Badge variant={tone}>{badge}</Badge>
        {k.count > 1 && <Badge>{k.count} keys</Badge>}
        <div className="ml-auto flex gap-1">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setValue(k.secret ? '' : k.preview);
              setEditing((e) => !e);
            }}
          >
            <Pencil size={14} aria-hidden="true" /> {k.set ? 'Replace' : 'Add'}
          </Button>
          {k.source === 'admin' && (
            <Button size="sm" variant="ghost" onClick={() => window.confirm(`Remove ${k.label}? The server .env value (if any) is used instead.`) && onRemove(k.name)} disabled={busy} aria-label={`Remove ${k.label}`}>
              <Trash2 size={14} aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
      <p className="break-all font-mono text-xs text-muted-foreground">{k.set ? k.preview || '••••' : '—'}</p>
      {k.updatedAt && <p className="text-xs text-muted-foreground">Changed {formatDate(k.updatedAt)}</p>}
      {k.hint && <p className="text-xs text-muted-foreground">{k.hint}</p>}
      {editing && (
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim()) onSave(k.name, value.trim(), () => setEditing(false));
          }}
        >
          <Label htmlFor={id} className="sr-only">
            New value for {k.label}
          </Label>
          <Input
            id={id}
            type={k.secret ? 'password' : 'text'}
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={k.secret ? 'Paste the new key' : ''}
            className="font-mono"
          />
          <Button type="submit" disabled={busy || !value.trim()}>
            Save
          </Button>
          <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </form>
      )}
    </li>
  );
}

export default function ApiKeys() {
  const qc = useQueryClient();
  const toast = useToast();
  const list = useQuery({ queryKey: ['api-keys'], queryFn: () => unwrap(api.get('/admin/settings/keys')), refetchInterval: 60000 });
  const refresh = () => qc.invalidateQueries({ queryKey: ['api-keys'] });

  const save = useMutation({
    mutationFn: ({ name, value }) => unwrap(api.put(`/admin/settings/keys/${name}`, { value })),
    onSuccess: (_d, v) => {
      refresh();
      toast.success('Saved — active within 30 seconds. Press Test to check it.');
      v.done?.();
    },
    onError: (e) => toast.error(e.message || 'Save failed'),
  });
  const remove = useMutation({
    mutationFn: (name) => unwrap(api.delete(`/admin/settings/keys/${name}`)),
    onSuccess: (d) => {
      refresh();
      toast.success(d?.fallback === 'env' ? 'Removed — using the server .env value again' : 'Removed');
    },
    onError: (e) => toast.error(e.message || 'Remove failed'),
  });
  const test = useMutation({
    mutationFn: (id) => unwrap(api.post(`/admin/settings/keys/${id}/test`)),
    onSuccess: (d) => {
      refresh();
      if (d.ok) toast.success(d.message);
      else toast.error(d.message);
    },
    onError: (e) => toast.error(e.message || 'Test failed'),
  });

  const rows = Array.isArray(list.data) ? list.data : [];
  const problems = rows.filter((i) => i.configured && i.status && !i.status.ok);

  return (
    <div className="space-y-6">
      <PageHeader
        title="API keys"
        description="Every outside service Klyro uses. Replace a key here when it expires — no server access needed. Keys are stored encrypted and never shown in full."
      />
      {problems.length > 0 && (
        <p className="flex items-center gap-2 rounded-lg border border-amber-700/60 bg-amber-950/40 p-3 text-sm text-amber-300" role="alert">
          <AlertTriangle size={16} aria-hidden="true" /> {problems.length} integration{problems.length > 1 ? 's need' : ' needs'} attention: {problems.map((p) => p.name).join(', ')}
        </p>
      )}
      {list.isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {rows.map((i) => (
            <Card key={i.id}>
              <CardContent className="space-y-3 p-5">
                <div className="flex flex-wrap items-start gap-2">
                  <KeyRound size={18} className="mt-0.5 text-muted-foreground" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-base font-semibold">{i.name}</h2>
                    <p className="text-xs text-muted-foreground">{i.use}</p>
                  </div>
                  <a href={i.url} target="_blank" rel="noopener noreferrer" className="flex min-h-9 items-center gap-1 text-xs text-primary hover:underline">
                    Get / manage key <ExternalLink size={12} aria-hidden="true" />
                  </a>
                  {i.configured && (
                    <Button size="sm" variant="secondary" onClick={() => test.mutate(i.id)} disabled={test.isPending && test.variables === i.id}>
                      <PlayCircle size={14} aria-hidden="true" /> {test.isPending && test.variables === i.id ? 'Testing…' : 'Test'}
                    </Button>
                  )}
                </div>
                <StatusLine integration={i} />
                {i.usage && (
                  <p className="text-xs text-muted-foreground">
                    This month: {i.usage.used ?? 0} / {i.usage.cap} {i.id === 'x' ? 'paid post reads' : 'searches'}
                    {i.usage.perKey?.length > 1 ? ` (${i.usage.perKey.map((n, x) => `key ${x + 1}: ${n}`).join(', ')})` : ''}
                  </p>
                )}
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {i.keys.map((k) => (
                    <KeyRow
                      key={k.name}
                      k={k}
                      busy={save.isPending || remove.isPending}
                      onSave={(name, value, done) => save.mutate({ name, value, done })}
                      onRemove={(name) => remove.mutate(name)}
                    />
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Gmail sending and PageSpeed run inside n8n and are managed at{' '}
        <a href="https://n8n.klyro.codes" target="_blank" rel="noopener noreferrer" className="underline">
          n8n.klyro.codes
        </a>{' '}
        (Credentials). Every change here is recorded in the Audit Log.
      </p>
    </div>
  );
}

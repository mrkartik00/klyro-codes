import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import api, { unwrap } from '../lib/api.js';
import { useToast } from '../hooks/useToast.jsx';
import { useAuth } from '../hooks/useAuth.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import {
  Card,
  CardContent,
  Button,
  Input,
  Label,
} from '../components/ui/index.jsx';

export default function TwoFactor() {
  const toast = useToast();
  const { logout } = useAuth();
  const [setup, setSetup] = useState(null); // { otpauth, secret }
  const [code, setCode] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const begin = useMutation({
    mutationFn: () => unwrap(api.post('/auth/2fa/setup')),
    onSuccess: (data) => {
      const otpauth = data.otpauth || data.otpauthUrl || data.uri;
      let secret = data.secret || data.base32;
      try {
        secret = secret || new URL(otpauth).searchParams.get('secret');
      } catch {
        /* ignore */
      }
      setSetup({ otpauth, secret });
    },
    onError: (e) => toast.error(e.message || 'Setup failed'),
  });

  const confirm = useMutation({
    mutationFn: () => unwrap(api.post('/auth/2fa/confirm', { token: code })),
    onSuccess: () => {
      setConfirmed(true);
      toast.success('2FA enabled — sign in again to continue');
      // The current token was issued before 2FA existed; force a fresh login.
      setTimeout(() => logout(), 1500);
    },
    onError: (e) => toast.error(e.message || 'Invalid code'),
  });

  return (
    <div>
      <PageHeader
        title="Two-Factor Authentication"
        description="Add a TOTP authenticator to your admin account."
      />

      <Card className="max-w-xl">
        <CardContent className="space-y-5 p-6">
          {!setup ? (
            <>
              <p className="text-sm text-muted-foreground">
                Generate a TOTP secret, then add it to an authenticator app such as
                Google Authenticator, 1Password, or Authy.
              </p>
              <Button onClick={() => begin.mutate()} disabled={begin.isPending}>
                {begin.isPending ? 'Generating…' : 'Start 2FA setup'}
              </Button>
            </>
          ) : confirmed ? (
            <div className="rounded-lg border border-green-800 bg-green-950 p-4 text-sm text-green-200">
              Two-factor authentication is now enabled. You will be asked for a code at
              next sign-in.
            </div>
          ) : (
            <>
              <div>
                <Label>Authenticator URI (otpauth)</Label>
                <p className="mt-1 break-all rounded-lg border border-border bg-muted p-3 font-mono text-xs">
                  {setup.otpauth || '—'}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Paste this <code>otpauth://</code> URI into your authenticator app, or
                  enter the secret manually. (We intentionally do not render a QR image
                  from a third-party service.)
                </p>
              </div>

              {setup.secret && (
                <div>
                  <Label>Secret</Label>
                  <p className="mt-1 select-all rounded-lg border border-border bg-muted p-3 font-mono text-sm tracking-widest">
                    {setup.secret}
                  </p>
                </div>
              )}

              <div>
                <Label htmlFor="code">Enter 6-digit code to confirm</Label>
                <div className="flex gap-2">
                  <Input
                    id="code"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="123456"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  />
                  <Button
                    onClick={() => confirm.mutate()}
                    disabled={code.length !== 6 || confirm.isPending}
                  >
                    Confirm
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

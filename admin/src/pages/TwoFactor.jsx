import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import QRCode from 'qrcode';
import api, { unwrap } from '../lib/api.js';
import { useToast } from '../hooks/useToast.jsx';
import { useAuth } from '../hooks/useAuth.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { Card, CardContent, Button, Input, Label } from '../components/ui/index.jsx';

/** Group a base32 secret in blocks of 4 so it's easy to type by hand. */
const groupSecret = (s) => String(s || '').replace(/(.{4})/g, '$1 ').trim();

export default function TwoFactor() {
  const toast = useToast();
  const { logout } = useAuth();
  const [setup, setSetup] = useState(null); // { otpauth, secret }
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [showKey, setShowKey] = useState(false);

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

  // QR is drawn locally in the browser — the secret never goes to a third party.
  useEffect(() => {
    if (!setup?.otpauth) return undefined;
    let alive = true;
    QRCode.toDataURL(setup.otpauth, { width: 240, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
      .then((url) => alive && setQr(url))
      .catch(() => alive && setQr(''));
    return () => {
      alive = false;
    };
  }, [setup?.otpauth]);

  const confirm = useMutation({
    mutationFn: () => unwrap(api.post('/auth/2fa/confirm', { token: code })),
    onSuccess: () => {
      setConfirmed(true);
      toast.success('2FA enabled — sign in again to continue');
      // The current token was issued before 2FA existed; force a fresh login.
      setTimeout(() => logout(), 1500);
    },
    onError: (e) => toast.error(e.message || 'That code did not match — use the newest code in your app'),
  });

  const copySecret = async () => {
    try {
      await navigator.clipboard.writeText(setup.secret);
      toast.success('Setup key copied');
    } catch {
      setShowKey(true);
    }
  };

  return (
    <div>
      <PageHeader title="Two-Factor Authentication" description="Protect the admin panel with a code from your phone." />

      <Card className="max-w-xl">
        <CardContent className="space-y-6 p-6">
          {!setup ? (
            <>
              <p className="text-sm text-muted-foreground">
                You&apos;ll need an authenticator app on your phone — Google Authenticator, Microsoft Authenticator, Authy or
                1Password all work.
              </p>
              <Button onClick={() => begin.mutate()} disabled={begin.isPending}>
                {begin.isPending ? 'Generating…' : 'Start 2FA setup'}
              </Button>
            </>
          ) : confirmed ? (
            <div role="status" className="rounded-lg border border-green-800 bg-green-950 p-4 text-sm text-green-200">
              Two-factor authentication is on. Signing you out — sign back in with your password and the code from your app.
            </div>
          ) : (
            <>
              <ol className="space-y-6">
                <li>
                  <p className="mb-3 text-sm font-medium">1. Scan this QR code with your authenticator app</p>
                  <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                    <div className="grid h-[248px] w-[248px] shrink-0 place-items-center rounded-xl bg-white p-1">
                      {qr ? (
                        <img src={qr} width={240} height={240} alt="QR code for your authenticator app" className="rounded-lg" />
                      ) : (
                        <span className="text-sm text-neutral-500">Drawing QR…</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      In the app tap <strong>+</strong> → <strong>Scan a QR code</strong>. It will add “Klyro” with a 6-digit code
                      that changes every 30 seconds.
                    </p>
                  </div>
                </li>

                {setup.secret && (
                  <li>
                    <p className="mb-2 text-sm font-medium">Can&apos;t scan? Enter this setup key instead</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="select-all break-all rounded-lg border border-border bg-muted px-3 py-2 font-mono text-sm tracking-wider">
                        {showKey ? groupSecret(setup.secret) : '•••• •••• •••• ••••'}
                      </code>
                      <Button size="sm" variant="secondary" onClick={() => setShowKey((v) => !v)}>
                        {showKey ? 'Hide' : 'Show'}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={copySecret}>
                        Copy
                      </Button>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">Choose “time based”. Spaces don&apos;t matter.</p>
                  </li>
                )}

                <li>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (code.length === 6) confirm.mutate();
                    }}
                  >
                    <Label htmlFor="code">2. Type the 6-digit code shown in the app</Label>
                    <div className="flex gap-2">
                      <Input
                        id="code"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="[0-9]*"
                        maxLength={6}
                        placeholder="000000"
                        className="max-w-[10rem] text-center font-mono text-lg tracking-[0.3em]"
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      />
                      <Button type="submit" disabled={code.length !== 6 || confirm.isPending}>
                        {confirm.isPending ? 'Checking…' : 'Turn on 2FA'}
                      </Button>
                    </div>
                  </form>
                </li>
              </ol>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

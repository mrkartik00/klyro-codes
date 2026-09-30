import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import api from '../lib/api.js';
import { AuthShell } from '../components/AuthShell.jsx';
import { Button, FieldError, Input, Label } from '../components/ui/index.jsx';
import { useToast } from '../components/Toast.jsx';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

export default function VerifyEmail() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [serverError, setServerError] = useState('');

  const [resending, setResending] = useState(false);
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: location.state?.email || '' },
  });

  async function onSubmit(values) {
    setServerError('');
    try {
      await api.post('/auth/verify', {
        email: values.email,
        code: values.code,
      });
      toast({
        title: 'Email verified',
        description: 'You can now sign in.',
        tone: 'success',
      });
      navigate('/login');
    } catch (err) {
      setServerError(
        err.response?.data?.error?.message ||
          'Verification failed. Check the code and try again.'
      );
    }
  }

  async function resend() {
    const email = String(getValues('email') || '').trim();
    if (!email) {
      setServerError('Enter your email first.');
      return;
    }
    setResending(true);
    setServerError('');
    try {
      await api.post('/auth/verify/resend', { email });
      toast({ title: 'New code sent', description: 'Check your inbox (and spam folder).', tone: 'success' });
    } catch (err) {
      setServerError(err.response?.data?.error?.message || 'Could not resend right now. Try again shortly.');
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthShell
      title="Verify your email"
      subtitle="Enter the 6-digit code we emailed you."
      footer={
        <Link className="text-[var(--color-primary)]" to="/login">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            aria-invalid={Boolean(errors.email)}
            {...register('email')}
          />
          <FieldError>{errors.email?.message}</FieldError>
        </div>
        <div>
          <Label htmlFor="code">Verification code</Label>
          <Input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="6-digit code"
            aria-invalid={Boolean(errors.code)}
            {...register('code')}
          />
          <FieldError>{errors.code?.message}</FieldError>
        </div>

        {serverError ? (
          <p role="alert" className="text-sm text-[var(--color-destructive)]">
            {serverError}
          </p>
        ) : null}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Verifying…' : 'Verify email'}
        </Button>
        <button
          type="button"
          onClick={resend}
          disabled={resending}
          className="min-h-11 w-full text-sm text-[var(--color-primary)] underline-offset-2 hover:underline disabled:opacity-60"
        >
          {resending ? 'Sending…' : "Didn't get a code? Send a new one"}
        </button>
      </form>
    </AuthShell>
  );
}

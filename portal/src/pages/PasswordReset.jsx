import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../lib/api.js';
import { AuthShell } from '../components/AuthShell.jsx';
import { Button, FieldError, Input, Label } from '../components/ui/index.jsx';
import { useToast } from '../components/Toast.jsx';

const forgotSchema = z.object({ email: z.string().trim().email('Enter a valid email') });
const resetSchema = z
  .object({
    password: z.string().min(12, 'Use at least 12 characters').max(200),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });

/** /forgot — request a reset link. Always shows the same result (no account enumeration). */
export function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(forgotSchema) });

  async function onSubmit({ email }) {
    setError('');
    try {
      await api.post('/auth/forgot', { email });
      setSent(true);
    } catch (err) {
      setError(err.response?.status === 429 ? 'Too many requests. Try again in a few minutes.' : 'Something went wrong. Please try again.');
    }
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle={sent ? 'Check your inbox.' : "Enter your email and we'll send you a reset link."}
      footer={
        <Link className="text-[var(--color-primary)]" to="/login">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <p role="status" className="text-sm text-[var(--color-muted-foreground)]">
          If an account exists for that email, a reset link is on its way. It works for 1 hour — check your spam folder
          if you don't see it.
        </p>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" aria-invalid={Boolean(errors.email)} {...register('email')} />
            <FieldError>{errors.email?.message}</FieldError>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-[var(--color-destructive)]">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

/** /reset?token=…&email=… — choose a new password from the emailed link. */
export function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const token = params.get('token') || '';
  const email = params.get('email') || '';
  const [error, setError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(resetSchema) });

  async function onSubmit({ password }) {
    setError('');
    try {
      await api.post('/auth/reset', { email, token, password });
      toast({ title: 'Password updated', description: 'Sign in with your new password.', tone: 'success' });
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error?.message || 'This link is invalid or has expired. Request a new one.');
    }
  }

  if (!token || !email) {
    return (
      <AuthShell title="Link incomplete" subtitle="Open the link from your email again, or request a new one." footer={null}>
        <Link className="text-[var(--color-primary)]" to="/forgot">
          Request a new reset link
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Choose a new password"
      subtitle={`For ${email}`}
      footer={
        <Link className="text-[var(--color-primary)]" to="/forgot">
          Request a new link
        </Link>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
        <div>
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={Boolean(errors.password)}
            aria-describedby="pw-hint"
            {...register('password')}
          />
          {errors.password ? (
            <FieldError>{errors.password.message}</FieldError>
          ) : (
            <p id="pw-hint" className="mt-1 text-xs text-[var(--color-muted-foreground)]">
              At least 12 characters.
            </p>
          )}
        </div>
        <div>
          <Label htmlFor="confirm">Confirm password</Label>
          <Input id="confirm" type="password" autoComplete="new-password" aria-invalid={Boolean(errors.confirm)} {...register('confirm')} />
          <FieldError>{errors.confirm?.message}</FieldError>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-[var(--color-destructive)]">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Update password'}
        </Button>
      </form>
    </AuthShell>
  );
}

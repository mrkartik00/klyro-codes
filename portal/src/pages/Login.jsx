import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import { AuthShell } from '../components/AuthShell.jsx';
import { Button, FieldError, Input, Label } from '../components/ui/index.jsx';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
  totp: z
    .string()
    .optional()
    .refine((v) => !v || /^\d{6}$/.test(v), 'Enter the 6-digit code'),
  website_url: z.string().max(0).optional(), // honeypot
});

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState('');
  const from = location.state?.from?.pathname || '/';

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema) });

  async function onSubmit(values) {
    if (values.website_url) return; // bot
    setServerError('');
    try {
      await login({
        email: values.email,
        password: values.password,
        totp: values.totp || undefined,
      });
      navigate(from, { replace: true });
    } catch (err) {
      setServerError(
        err.response?.data?.error?.message ||
          'Unable to sign in. Check your credentials.'
      );
    }
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Access your Klyro client portal."
      footer={
        <>
          No account?{' '}
          <Link className="text-[var(--color-primary)]" to="/register">
            Create one
          </Link>
        </>
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
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={Boolean(errors.password)}
            {...register('password')}
          />
          <FieldError>{errors.password?.message}</FieldError>
        </div>
        <div>
          <Label htmlFor="totp">
            Authenticator code{' '}
            <span className="text-[var(--color-muted-foreground)]">
              (optional)
            </span>
          </Label>
          <Input
            id="totp"
            inputMode="numeric"
            maxLength={6}
            placeholder="123456"
            {...register('totp')}
          />
          <FieldError>{errors.totp?.message}</FieldError>
        </div>

        {/* Honeypot — visually hidden, not for humans */}
        <div aria-hidden="true" className="absolute left-[-9999px]">
          <label htmlFor="website_url">Leave this field empty</label>
          <input
            id="website_url"
            tabIndex={-1}
            autoComplete="off"
            {...register('website_url')}
          />
        </div>

        {serverError ? (
          <p role="alert" className="text-sm text-[var(--color-destructive)]">
            {serverError}
          </p>
        ) : null}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthShell>
  );
}

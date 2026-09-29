import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import { Button, Input, Label, Card, CardContent } from '../components/ui/index.jsx';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
  totp: z
    .string()
    .optional()
    .refine((v) => !v || /^\d{6}$/.test(v), 'TOTP must be 6 digits'),
  // honeypot
  website_url: z.string().max(0).optional(),
});

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { website_url: '' } });

  if (user) return <Navigate to="/" replace />;

  const onSubmit = async (values) => {
    setServerError('');
    if (values.website_url) return; // bot
    try {
      await login({
        email: values.email,
        password: values.password,
        totp: values.totp,
      });
      navigate('/');
    } catch (e) {
      setServerError(e?.response?.data?.error?.message || e.message || 'Login failed');
    }
  };

  return (
    <div className="grid min-h-[100dvh] place-items-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-8">
          <div className="mb-6 flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-sm font-bold text-on-primary">
              K
            </span>
            <span className="font-heading text-xl font-semibold">Klyro Admin</span>
          </div>
          <h1 className="mb-1 font-heading text-xl font-semibold">Sign in</h1>
          <p className="mb-6 text-sm text-muted-foreground">
            Command center access.
          </p>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                {...register('email')}
              />
              {errors.email && (
                <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                {...register('password')}
              />
              {errors.password && (
                <p className="mt-1 text-xs text-destructive">
                  {errors.password.message}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="totp">2FA code (if enabled)</Label>
              <Input
                id="totp"
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                {...register('totp')}
              />
              {errors.totp && (
                <p className="mt-1 text-xs text-destructive">{errors.totp.message}</p>
              )}
            </div>

            {/* Honeypot */}
            <div className="hidden" aria-hidden="true">
              <label htmlFor="website_url">Website</label>
              <input
                id="website_url"
                tabIndex={-1}
                autoComplete="off"
                {...register('website_url')}
              />
            </div>

            {serverError && (
              <p className="text-sm text-destructive" role="alert">
                {serverError}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

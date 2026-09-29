import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api.js';
import { AuthShell } from '../components/AuthShell.jsx';
import { Button, FieldError, Input, Label } from '../components/ui/index.jsx';
import { useToast } from '../components/Toast.jsx';

const schema = z.object({
  name: z.string().min(2, 'Enter your name'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Use at least 8 characters'),
  website_url: z.string().max(0).optional(), // honeypot
});

export default function Register() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema) });

  async function onSubmit(values) {
    if (values.website_url) return;
    setServerError('');
    try {
      await api.post('/auth/register', {
        name: values.name,
        email: values.email,
        password: values.password,
      });
      toast({
        title: 'Account created',
        description: 'Check your email for a verification code.',
        tone: 'success',
      });
      navigate('/verify', { state: { email: values.email } });
    } catch (err) {
      setServerError(
        err.response?.data?.error?.message ||
          'Unable to register. Please try again.'
      );
    }
  }

  return (
    <AuthShell
      title="Create account"
      subtitle="Start managing your projects with Klyro."
      footer={
        <>
          Already have an account?{' '}
          <Link className="text-[var(--color-primary)]" to="/login">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div>
          <Label htmlFor="name">Full name</Label>
          <Input
            id="name"
            autoComplete="name"
            aria-invalid={Boolean(errors.name)}
            {...register('name')}
          />
          <FieldError>{errors.name?.message}</FieldError>
        </div>
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
            autoComplete="new-password"
            aria-invalid={Boolean(errors.password)}
            {...register('password')}
          />
          <FieldError>{errors.password?.message}</FieldError>
        </div>

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
          {isSubmitting ? 'Creating…' : 'Create account'}
        </Button>
      </form>
    </AuthShell>
  );
}

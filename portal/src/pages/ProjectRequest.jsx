import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.jsx';
import { useToast } from '../components/Toast.jsx';
import {
  Button,
  Card,
  FieldError,
  Input,
  Label,
  Textarea,
} from '../components/ui/index.jsx';

const schema = z.object({
  name: z.string().min(2, 'Enter your name'),
  email: z.string().email('Enter a valid email'),
  company: z.string().optional(),
  message: z.string().min(10, 'Tell us a bit more (min 10 characters)'),
  website_url: z.string().max(0).optional(), // honeypot
});

export default function ProjectRequest() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: user?.name || '',
      email: user?.email || '',
    },
  });

  async function onSubmit(values) {
    if (values.website_url) return;
    setServerError('');
    try {
      await api.post('/public/enquiries', {
        name: values.name,
        email: values.email,
        company: values.company || undefined,
        message: values.message,
        website_url: '',
      });
      toast({
        title: 'Request sent',
        description: 'Our team will reach out shortly.',
        tone: 'success',
      });
      reset({ name: values.name, email: values.email, company: '', message: '' });
    } catch (err) {
      setServerError(
        err.response?.data?.error?.message ||
          'Unable to send your request. Please try again.'
      );
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">New request</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Tell us about your project and we'll prepare a proposal.
        </p>
      </div>

      <Card>
        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" {...register('name')} />
              <FieldError>{errors.name?.message}</FieldError>
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...register('email')} />
              <FieldError>{errors.email?.message}</FieldError>
            </div>
          </div>
          <div>
            <Label htmlFor="company">
              Company{' '}
              <span className="text-[var(--color-muted-foreground)]">
                (optional)
              </span>
            </Label>
            <Input id="company" {...register('company')} />
          </div>
          <div>
            <Label htmlFor="message">Project details</Label>
            <Textarea
              id="message"
              rows={6}
              aria-invalid={Boolean(errors.message)}
              {...register('message')}
            />
            <FieldError>{errors.message?.message}</FieldError>
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

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Sending…' : 'Submit request'}
          </Button>
        </form>
      </Card>
    </div>
  );
}

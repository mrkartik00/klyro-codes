import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FloatingInput } from '../ui/FloatingInput.jsx';
import { Button } from '../ui/Button.jsx';
import { useToast } from '../ui/Toast.jsx';
import { api } from '../../lib/api.js';
import { useScrollReveal } from '../../motion/useScrollReveal.js';

const PROJECT_TYPES = ['Web app', 'Mobile app', 'Website', 'Redesign', 'Other'];
const BUDGETS = ['< $5k', '$5k–15k', '$15k–40k', '$40k+'];

const schema = z.object({
  name: z.string().min(2, 'Please enter your name'),
  email: z.string().email('Enter a valid email'),
  company: z.string().optional(),
  projectType: z.string().optional(),
  budgetRange: z.string().optional(),
  message: z.string().min(10, 'Tell us a little more (10+ characters)'),
  // Honeypot: must stay empty. Real users never see or fill this.
  website_url: z.string().max(0).optional().or(z.literal('')),
});

function ChipGroup({ legend, name, options, register, value }) {
  return (
    <fieldset>
      <legend className="mb-3 text-sm text-[var(--color-muted-foreground)]">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const checked = value === o;
          return (
            <label
              key={o}
              className={
                'flex min-h-[44px] cursor-pointer items-center rounded-full border px-4 text-sm transition-colors duration-200 ' +
                'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--color-ring)] ' +
                (checked
                  ? 'border-[var(--color-brand)] bg-[var(--color-brand)] text-[#050507]'
                  : 'border-white/15 text-white/75 hover:border-white/40')
              }
            >
              <input type="radio" value={o} className="sr-only" {...register(name)} />
              {o}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function Contact() {
  const notify = useToast();
  const ref = useScrollReveal();
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting, isSubmitSuccessful },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', company: '', message: '', website_url: '', projectType: '', budgetRange: '' },
  });

  const onSubmit = async (values) => {
    if (values.website_url) {
      reset();
      return;
    }
    const prefix = [
      values.projectType && `Project type: ${values.projectType}`,
      values.budgetRange && `Budget: ${values.budgetRange}`,
    ]
      .filter(Boolean)
      .join(' · ');
    try {
      await api.post('/public/enquiries', {
        name: values.name,
        email: values.email,
        company: values.company || undefined,
        budgetRange: values.budgetRange || undefined,
        message: prefix ? `${prefix}\n\n${values.message}` : values.message,
        website_url: '',
      });
      notify('Thanks — we’ll reply within one business day.');
      reset();
    } catch {
      notify('Something went wrong. Please try again or email kartik@klyro.codes.', 'error');
    }
  };

  return (
    <section ref={ref} id="contact" className="scroll-mt-24 px-5 py-20 sm:px-6 sm:py-28 lg:py-32">
      <div className="mx-auto grid max-w-6xl gap-16 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <p data-reveal className="eyebrow flex items-center gap-3">
            <span className="text-[var(--color-brand)]">05</span>
            <span className="h-px w-8 bg-white/20" aria-hidden="true" />
            Contact
          </p>
          <h2
            data-reveal
            className="mt-5 font-heading text-[clamp(2.25rem,5vw,4rem)] leading-[1] font-semibold"
          >
            Tell us what you’re building.
          </h2>
          <p data-reveal className="mt-6 max-w-sm text-lg leading-relaxed text-[var(--color-muted-foreground)]">
            Share a few details and we’ll come back with next steps, a timeline and a fixed quote.
          </p>

          <dl data-reveal className="mt-12 space-y-6">
            <div>
              <dt className="eyebrow">Email</dt>
              <dd className="mt-2">
                <a href="mailto:kartik@klyro.codes" className="font-heading text-xl hover:text-[var(--color-brand)]">
                  kartik@klyro.codes
                </a>
              </dd>
            </div>
            <div>
              <dt className="eyebrow">Response time</dt>
              <dd className="mt-2 font-heading text-xl">Within 1 business day</dd>
            </div>
            <div>
              <dt className="eyebrow">Based in</dt>
              <dd className="mt-2 font-heading text-xl">India · working with US, UK &amp; IN</dd>
            </div>
          </dl>
        </div>

        <form
          data-reveal
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="relative flex flex-col gap-6 rounded-3xl border border-white/10 bg-white/[0.02] p-6 sm:p-10"
        >
          <ChipGroup legend="What are you building?" name="projectType" options={PROJECT_TYPES} register={register} value={watch('projectType')} />

          <div className="grid gap-5 sm:grid-cols-2">
            <FloatingInput label="Your name" autoComplete="name" error={errors.name?.message} {...register('name')} />
            <FloatingInput label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
          </div>
          <FloatingInput label="Company (optional)" autoComplete="organization" error={errors.company?.message} {...register('company')} />
          <FloatingInput label="Tell us about the project" as="textarea" error={errors.message?.message} {...register('message')} />

          <ChipGroup legend="Budget range" name="budgetRange" options={BUDGETS} register={register} value={watch('budgetRange')} />

          {/* Honeypot: visually hidden, off tab order, not announced. */}
          <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
            <label htmlFor="website_url">Leave this field empty</label>
            <input id="website_url" type="text" tabIndex={-1} autoComplete="off" {...register('website_url')} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <p className="text-sm text-[var(--color-muted-foreground)]" role="status">
              {isSubmitSuccessful ? 'Sent — talk soon.' : 'No spam. We never share your details.'}
            </p>
            <Button type="submit" disabled={isSubmitting} arrow>
              {isSubmitting ? 'Sending…' : 'Send enquiry'}
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}

export default Contact;

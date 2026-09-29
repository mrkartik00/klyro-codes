import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LegalLayout } from '../components/LegalLayout.jsx';

export function Unsubscribe() {
  const [params] = useSearchParams();
  const email = params.get('email') || '';
  const [done, setDone] = useState(false);

  return (
    <LegalLayout title="Unsubscribe">
      {done ? (
        <p className="text-[var(--color-foreground)]">
          You have been unsubscribed. You will no longer receive outreach from
          Klyro.
        </p>
      ) : (
        <>
          <p>
            We are sorry to see you go. Confirm below to stop receiving all
            outreach emails from Klyro
            {email ? ` at ${email}` : ''}.
          </p>
          <button
            type="button"
            onClick={() => setDone(true)}
            className="mt-4 inline-flex min-h-[44px] items-center justify-center self-start rounded-lg border border-[var(--color-border)] px-6 py-3 font-semibold text-[var(--color-foreground)] transition-[transform,opacity] duration-200 hover:border-[var(--color-foreground)]"
          >
            Confirm unsubscribe
          </button>
        </>
      )}
    </LegalLayout>
  );
}

export default Unsubscribe;

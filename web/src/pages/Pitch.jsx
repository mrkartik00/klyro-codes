import { useEffect, useMemo, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

function sessionId() {
  let id = sessionStorage.getItem('pitchSessionId');
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem('pitchSessionId', id);
  }
  return id;
}

export function Pitch() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const token = params.get('t') || '';
  const firedRef = useRef(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['pitch', slug, token],
    enabled: Boolean(slug) && Boolean(token),
    queryFn: async () => {
      const res = await api.get(
        `/public/pitch/${encodeURIComponent(slug)}`,
        { params: { t: token } },
      );
      return res.data?.data ?? res.data;
    },
    retry: false,
  });

  const sid = useMemo(() => sessionId(), []);

  useEffect(() => {
    if (!slug || !token || !data || firedRef.current) return;
    firedRef.current = true;
    api
      .post(`/public/pitch/${encodeURIComponent(slug)}/events`, {
        t: token,
        type: 'view',
        sessionId: sid,
      })
      .catch(() => {});
  }, [slug, token, data, sid]);

  if (!token) {
    return (
      <Centered>
        <h1 className="text-2xl font-semibold">Invalid link</h1>
        <p className="mt-2 text-[var(--color-muted-foreground)]">
          This pitch link is missing its access token.
        </p>
      </Centered>
    );
  }

  if (isLoading) {
    return (
      <Centered>
        <p className="text-[var(--color-muted-foreground)]">Loading pitch…</p>
      </Centered>
    );
  }

  if (isError || !data) {
    return (
      <Centered>
        <h1 className="text-2xl font-semibold">Pitch unavailable</h1>
        <p className="mt-2 text-[var(--color-muted-foreground)]">
          This link may have expired. Please contact your Klyro representative.
        </p>
      </Centered>
    );
  }

  const sections = Array.isArray(data.sections) ? data.sections : [];

  return (
    <main className="px-5 pt-28 pb-20 sm:px-6 sm:pt-32 sm:pb-24">
      <div className="mx-auto max-w-3xl">
        <header className="flex items-center gap-4">
          {data.logoUrl && (
            <img
              src={data.logoUrl}
              alt={`${data.businessName || 'Business'} logo`}
              className="h-14 w-14 rounded-lg object-contain"
              loading="lazy"
            />
          )}
          <div>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              A proposal from Klyro for
            </p>
            <h1 className="text-3xl font-bold">
              {data.businessName || 'Your business'}
            </h1>
          </div>
        </header>

        <div className="mt-12 flex flex-col gap-10">
          {sections.map((s, i) => (
            <section key={s.id || s.title || i}>
              {s.title && (
                <h2 className="text-2xl font-semibold">{s.title}</h2>
              )}
              {s.body && (
                <p className="mt-3 whitespace-pre-line text-[var(--color-muted-foreground)]">
                  {s.body}
                </p>
              )}
            </section>
          ))}
          {sections.length === 0 && (
            <p className="text-[var(--color-muted-foreground)]">
              This proposal has no content yet.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

function Centered({ children }) {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center px-6 text-center">
      <div>{children}</div>
    </main>
  );
}

export default Pitch;

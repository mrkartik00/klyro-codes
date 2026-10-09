import { describe, it, expect, vi, afterEach } from 'vitest';
import { businessQueries } from '../../src/services/intent.service.js';

describe('businessQueries', () => {
  it('expands categories × cities with full country name', () => {
    const q = businessQueries({ country: 'US', cities: ['Austin, TX'], categories: ['dentist', 'plumber'] });
    expect(q).toContain('dentist in Austin, TX, USA');
    expect(q).toContain('plumber in Austin, TX, USA');
  });

  it('falls back to country-only when no cities', () => {
    const q = businessQueries({ country: 'GB', categories: ['law firm'] });
    expect(q).toEqual(['law firm in UK']);
  });

  it('caps the number of queries', () => {
    const cats = Array.from({ length: 30 }, (_, i) => `cat${i}`);
    const q = businessQueries({ country: 'US', cities: ['A', 'B'], categories: cats }, 10);
    expect(q.length).toBe(10);
  });

  it('dedupes repeated terms', () => {
    const q = businessQueries({ country: 'US', cities: ['X'], categories: ['dentist', 'dentist'] });
    expect(q.filter((s) => s === 'dentist in X, USA').length).toBe(1);
  });
});

describe('webfetch provider selection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.doUnmock('../../src/config/secrets.js');
  });

  it('uses Firecrawl first when its key is set', async () => {
    vi.resetModules();
    vi.doMock('../../src/config/secrets.js', () => ({ cfg: (n) => (n === 'FIRECRAWL_API_KEY' ? 'fc-key' : '') }));
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ data: { markdown: 'hello', links: ['mailto:a@b.com'] } }),
    });
    const { fetchSite } = await import('../../src/integrations/webfetch/index.js');
    const r = await fetchSite('example.com');
    expect(r.provider).toBe('firecrawl');
    expect(r.markdown).toBe('hello');
    expect(spy.mock.calls[0][0]).toContain('firecrawl.dev');
  });

  it('reports not ready when no provider key/url is set', async () => {
    vi.resetModules();
    vi.doMock('../../src/config/secrets.js', () => ({ cfg: () => '' }));
    const { webfetchReady } = await import('../../src/integrations/webfetch/index.js');
    expect(webfetchReady()).toBe(false);
  });
});

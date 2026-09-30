import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/integrations/gemini/index.js', () => ({ generateJson: vi.fn(async () => null) }));
const { authorFromUrl, prefilter, sourceStatus } = await import('../../src/services/intent.service.js');

describe('authorFromUrl', () => {
  it.each([
    ['https://x.com/janedoe/status/123', { platform: 'x', handle: '@janedoe' }],
    ['https://www.linkedin.com/posts/john-smith-123_need-a-website-activity-7', { platform: 'linkedin', handle: 'john-smith-123' }],
    ['https://www.linkedin.com/in/jane', { platform: 'linkedin', url: 'https://www.linkedin.com/in/jane' }],
    ['https://www.threads.net/@bakery/post/abc', { platform: 'threads', handle: '@bakery' }],
    ['https://www.reddit.com/user/bob', { platform: 'reddit', handle: 'u/bob' }],
    ['https://www.facebook.com/groups/123/posts/456', { platform: 'facebook' }],
    ['https://bsky.app/profile/a.bsky.social/post/x', { platform: 'bluesky', handle: '@a.bsky.social' }],
  ])('%s', (url, want) => expect(authorFromUrl(url)).toMatchObject(want));
});

describe('prefilter', () => {
  const p = (title, extra = {}) => ({ title, text: '', ...extra });
  it('trusts marketplace posts that are about building something', () => {
    expect(prefilter(p('Modern Website Design for Accounting Firm', { trusted: true, platform: 'freelancer' }))).toBe(true);
    expect(prefilter(p('UGC Video Content for Finance promo', { trusted: true, platform: 'freelancer' }))).toBe(false);
  });
  it('needs a hire signal on open networks', () => {
    expect(prefilter(p('Looking for a developer to build our booking app', { platform: 'bluesky' }))).toBe(true);
    expect(prefilter(p('I just launched my new app!', { platform: 'bluesky' }))).toBe(false);
    expect(prefilter(p("I'm a web developer available for work", { platform: 'x' }))).toBe(false);
  });
  it('blocks gambling, spyware and hardware work', () => {
    for (const t of ['Android Color Prediction Game', 'Silent Android Screenshot Service', 'BMS Firmware Developer With iPhone app', 'Casino website build'])
      expect(prefilter(p(t, { trusted: true, platform: 'freelancer' }))).toBe(false);
  });
  it('keeps software tenders even without web words', () => {
    expect(prefilter(p('Case management software platform', { trusted: true, platform: 'tenders' }))).toBe(true);
  });
});

describe('sourceStatus', () => {
  it('reports keys needed per source', () => {
    const s = Object.fromEntries(sourceStatus().map((x) => [x.id, x]));
    expect(s.freelancer.ready).toBe(true);
    expect(s.bluesky.missing).toEqual(expect.arrayContaining(['BSKY_HANDLE']));
  });
});

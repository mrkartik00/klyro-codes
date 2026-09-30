import { describe, it, expect } from 'vitest';
import { parseSocialUrl, socialsFromLinks } from '../../src/utils/socialLinks.js';

describe('parseSocialUrl', () => {
  it.each([
    ['https://x.com/janedoe/status/123', 'x', '@janedoe', 'post'],
    ['twitter.com/JaneDoe', 'x', '@JaneDoe', 'profile'],
    ['https://www.linkedin.com/in/jane-doe-123/', 'linkedin', 'in/jane-doe-123', 'profile'],
    ['https://uk.linkedin.com/company/acme-dental', 'linkedin', 'company/acme-dental', 'company'],
    ['https://www.reddit.com/user/throwaway_owner', 'reddit', 'u/throwaway_owner', 'profile'],
    ['https://old.reddit.com/r/smallbusiness/comments/abc123/need_a_website/', 'reddit', null, 'post'],
    ['instagram.com/acme.bakery', 'instagram', '@acme.bakery', 'profile'],
    ['https://m.facebook.com/AcmePlumbing', 'facebook', 'AcmePlumbing', 'profile'],
  ])('%s', (url, platform, handle, kind) => {
    const r = parseSocialUrl(url);
    expect(r).toMatchObject({ platform, handle, kind });
    expect(r.url.startsWith('https://')).toBe(true);
  });

  it('ignores non-social and junk links', () => {
    expect(parseSocialUrl('https://acme.com/contact')).toBeNull();
    expect(parseSocialUrl('not a url at all')).toBeNull();
    expect(parseSocialUrl('')).toBeNull();
  });

  it('does not treat share/intent links as profiles', () => {
    expect(parseSocialUrl('https://twitter.com/intent/tweet?text=hi').handle).toBeNull();
    expect(parseSocialUrl('https://www.facebook.com/sharer/sharer.php?u=x').handle).toBeNull();
  });
});

describe('socialsFromLinks', () => {
  it('keeps the first link per platform', () => {
    expect(
      socialsFromLinks({ a: 'https://twitter.com/acme', b: 'https://www.linkedin.com/company/acme', c: 'https://x.com/other' }),
    ).toEqual({ x: 'https://x.com/acme', linkedin: 'https://www.linkedin.com/company/acme' });
  });
});

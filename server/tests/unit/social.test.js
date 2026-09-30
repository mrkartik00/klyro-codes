import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/integrations/gemini/index.js', () => ({ generateJson: vi.fn(async () => null) }));
const { parseRedditFeed, looksLikeBuyer, heuristicIntent } = await import('../../src/services/social.service.js');

const now = new Date().toISOString();
const FEED = `<?xml version="1.0"?><feed>
<entry><author><name>/u/bakery_owner</name></author><category term="smallbusiness" label="r/smallbusiness"/>
<content type="html">&lt;div&gt;&lt;p&gt;I run a small bakery and need a website with online orders. Budget around $1500. Any recommendations?&lt;/p&gt;&lt;/div&gt; submitted by /u/bakery_owner [link] [comments]</content>
<id>t3_abc123</id><link href="https://www.reddit.com/r/smallbusiness/comments/abc123/need_a_website/" /><published>${now}</published>
<title>Need a website for my bakery &amp; online orders</title></entry>
<entry><id>t1_comment</id><title>a comment</title></entry>
</feed>`;

describe('parseRedditFeed', () => {
  it('extracts posts only, with author, link, community and clean text', () => {
    const posts = parseRedditFeed(FEED);
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      id: 't3_abc123',
      author: 'bakery_owner',
      community: 'smallbusiness',
      title: 'Need a website for my bakery & online orders',
      url: 'https://www.reddit.com/r/smallbusiness/comments/abc123/need_a_website/',
    });
    expect(posts[0].text).toMatch(/online orders/);
    expect(posts[0].text).not.toMatch(/<p>|submitted by/);
  });
});

describe('looksLikeBuyer', () => {
  const base = { author: 'x', postedAt: now, text: '' };
  it('keeps people asking for help', () => {
    expect(looksLikeBuyer({ ...base, title: 'Looking for someone to build a booking website' })).toBe(true);
  });
  it('drops sellers and self-promotion', () => {
    expect(looksLikeBuyer({ ...base, title: '[For Hire] I build websites — DM me for a quote' })).toBe(false);
    expect(looksLikeBuyer({ ...base, title: "I'm a web developer, check out my portfolio" })).toBe(false);
  });
  it('drops off-topic, deleted and old posts', () => {
    expect(looksLikeBuyer({ ...base, title: 'Quarterly taxes question' })).toBe(false);
    expect(looksLikeBuyer({ ...base, author: '[deleted]', title: 'need a website' })).toBe(false);
    expect(looksLikeBuyer({ ...base, postedAt: '2020-01-01T00:00:00Z', title: 'need a website' }, { maxAgeDays: 14 })).toBe(false);
  });
});

describe('heuristicIntent', () => {
  it('scores explicit, budgeted requests higher', () => {
    const strong = heuristicIntent({ title: 'Need a website, budget $2k?', text: 'looking for a developer' });
    const weak = heuristicIntent({ title: 'thoughts on web design trends', text: '' });
    expect(strong).toBeGreaterThan(weak);
    expect(strong).toBeLessThanOrEqual(0.95);
  });
});

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/integrations/gemini/index.js', () => ({ generateJson: vi.fn(async () => null) }));
const { parseRedditFeed, looksLikeBuyer, heuristicIntent } = await import('../../src/services/social.service.js');

const now = new Date().toISOString();
const FEED = `<?xml version="1.0"?><feed>
<entry><author><name>/u/bakery_owner</name></author><category term="smallbusiness" label="r/smallbusiness"/>
<content type="html">&lt;div&gt;&lt;p&gt;I run a small bakery and need a website with online orders. Budget around $1500.&lt;/p&gt;&lt;/div&gt; submitted by /u/bakery_owner [link] [comments]</content>
<id>t3_abc123</id><link href="https://www.reddit.com/r/smallbusiness/comments/abc123/need_a_website/" /><published>${now}</published>
<title>Looking for a developer to build a website for my bakery &amp; online orders</title></entry>
<entry><id>t1_comment</id><title>a comment</title></entry>
</feed>`;

describe('parseRedditFeed', () => {
  it('extracts posts only, with author, link, community and clean text', () => {
    const posts = parseRedditFeed(FEED);
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ id: 't3_abc123', author: 'bakery_owner', community: 'smallbusiness' });
    expect(posts[0].title).toBe('Looking for a developer to build a website for my bakery & online orders');
    expect(posts[0].text).toMatch(/online orders/);
    expect(posts[0].text).not.toMatch(/<p>|submitted by/);
  });
});

const post = (title, extra = {}) => ({ author: 'someone', postedAt: now, text: '', community: 'startups', ...title, ...extra });

describe('looksLikeBuyer — keeps people who want to hire', () => {
  it.each([
    ['Looking for a developer to build our booking website'],
    ['Need an iOS and Android app built for my gym — budget $8k'],
    ['Can anyone recommend an agency to build a Shopify store?'],
    ['Hiring a freelancer to build an MVP web app'],
    ['How much would it cost to build an app like Uber for my city?'],
  ])('%s', (title) => {
    expect(looksLikeBuyer(post({ title }))).toBe(true);
  });

  it('on hiring boards, only [Hiring] posts about building count', () => {
    expect(looksLikeBuyer(post({ title: '[Hiring] React Native developer for a fitness app' }, { community: 'forhire' }))).toBe(true);
    expect(looksLikeBuyer(post({ title: '[For Hire] Full-stack developer, 5 yrs' }, { community: 'forhire' }))).toBe(false);
    expect(looksLikeBuyer(post({ title: '[Hiring] Appointment setter $25/hr' }, { community: 'forhire' }))).toBe(false);
  });
});

describe('looksLikeBuyer — drops developers, agencies, job seekers and DIY', () => {
  it.each([
    ['How do I get clients that need a website?'],
    ["I'm a web developer looking for new clients"],
    ["I'm struggling to understand the free work for portfolio strategy for my web dev business"],
    ['We build websites and apps — DM me'],
    ['Looking for a job as a junior app developer'],
    ['Shopify, Wix, Squarespace, Big Cartel, other...?'],
    ['How do I get people to use my website?'],
    ['Hiring an appointment setter'],
  ])('%s', (title) => {
    expect(looksLikeBuyer(post({ title }))).toBe(false);
  });

  it('drops deleted and old posts', () => {
    expect(looksLikeBuyer(post({ title: 'Looking for a developer to build my app' }, { author: '[deleted]' }))).toBe(false);
    expect(looksLikeBuyer(post({ title: 'Looking for a developer to build my app' }, { postedAt: '2020-01-01T00:00:00Z' }))).toBe(false);
  });
});

describe('heuristicIntent (AI unavailable)', () => {
  it('scores hiring + budget high, sellers and DIY low', () => {
    expect(heuristicIntent({ title: '[Hiring] Flutter developer for delivery app, budget $5k', text: '' })).toBeGreaterThanOrEqual(0.75);
    expect(heuristicIntent({ title: 'How do I get clients that need a website?', text: '' })).toBeLessThan(0.55);
    expect(heuristicIntent({ title: 'Where to build a website for a small business', text: '' })).toBeLessThan(0.55);
  });
});

import { describe, expect, it } from 'vitest';
import { checkDraft } from '../../src/services/drafting.service.js';

const facts = { businessName: 'Bright Smile Dental', city: 'Austin' };

describe('drafting guardrails', () => {
  it('accepts a personalized, clean draft', () => {
    const r = checkDraft(
      { subject: 'Idea for Bright Smile Dental', body: 'Hi Bright Smile Dental in Austin, quick idea to help.' },
      facts,
    );
    expect(r.ok).toBe(true);
  });

  it('flags an unpersonalized draft', () => {
    const r = checkDraft({ subject: 'Hi', body: 'We build websites for businesses.' }, facts);
    expect(r.issues).toContain('not_personalized');
  });

  it('flags placeholders and spam words', () => {
    const r = checkDraft({ subject: 'Hi', body: 'Hello [Name], free money guarantee!' }, facts);
    expect(r.issues).toContain('placeholder');
    expect(r.issues).toContain('spam_words');
  });

  it('flags missing fields', () => {
    expect(checkDraft({ subject: 'x' }, facts).issues).toContain('missing_fields');
  });

  describe('LinkedIn channel', () => {
    it('does not require a subject for a social DM', () => {
      const r = checkDraft(
        { body: 'Loved your post on Bright Smile Dental growth in Austin — we help clinics turn site visits into bookings. Open to a quick call?' },
        { ...facts, channel: 'linkedin' },
      );
      expect(r.issues).not.toContain('missing_fields');
      expect(r.ok).toBe(true);
    });

    it('flags a body over 300 characters on LinkedIn', () => {
      const long = `Bright Smile Dental ${'x'.repeat(320)}`;
      const r = checkDraft({ body: long }, { ...facts, channel: 'linkedin' });
      expect(r.issues).toContain('too_long');
    });

    it('still flags an unpersonalized LinkedIn DM', () => {
      const r = checkDraft({ body: 'We build websites for businesses.' }, { ...facts, channel: 'linkedin' });
      expect(r.issues).toContain('not_personalized');
    });
  });
});

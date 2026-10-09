import { describe, it, expect } from 'vitest';
import { checkDraft, stripPitchReferences } from '../../src/services/drafting.service.js';

describe('stripPitchReferences', () => {
  it('removes a line containing a /pitch/ link', () => {
    const body = 'Hi there,\nI made a short page: https://klyro.codes/pitch/acme-ab12?t=xyz\nWorth a chat?';
    expect(stripPitchReferences(body)).toBe('Hi there,\nWorth a chat?');
  });

  it('removes preview/proposal sentences', () => {
    const body = 'Hello.\nI put together a short preview showing what a new site could look like.\nReply?';
    const out = stripPitchReferences(body);
    expect(out).not.toMatch(/preview/i);
    expect(out).toContain('Hello.');
  });

  it('leaves normal text untouched', () => {
    const body = 'Hi,\nYour website has no SSL.\nKartik';
    expect(stripPitchReferences(body)).toBe(body);
  });

  it('removes a dangling preview lead-in while keeping greeting and CTA', () => {
    const body = 'Hi there,\n\nI came across Plumbsy in the US. Since you already have a website, I wanted to share a quick concept we put together.\n\nWorth a 10-minute chat this week?\n\nKartik, Klyro';
    const out = stripPitchReferences(body);
    expect(out).not.toMatch(/wanted to share|concept we put together/i);
    expect(out).toContain('Hi there,');
    expect(out).toContain('Worth a 10-minute chat this week?');
    expect(out).toContain('I came across Plumbsy in the US.');
  });
});

describe('checkDraft bad_pitch_link guardrail', () => {
  const facts = { businessName: 'Acme', city: 'Austin' };

  it('flags a pitch link when none was provided', () => {
    const r = checkDraft({ subject: 'Hi Acme', body: 'See https://klyro.codes/pitch/acme-ab12?t=xyz for Acme' }, facts);
    expect(r.ok).toBe(false);
    expect(r.issues).toContain('bad_pitch_link');
  });

  it('allows the exact valid pitch link', () => {
    const url = 'https://klyro.codes/pitch/acme-ab12?t=xyz';
    const r = checkDraft({ subject: 'Hi Acme', body: `Preview for Acme: ${url}` }, { ...facts, pitchUrl: url });
    expect(r.issues).not.toContain('bad_pitch_link');
  });

  it('flags a pitch link that differs from the valid one', () => {
    const r = checkDraft(
      { subject: 'Hi Acme', body: 'See https://klyro.codes/pitch/other-9999?t=zzz for Acme' },
      { ...facts, pitchUrl: 'https://klyro.codes/pitch/acme-ab12?t=xyz' },
    );
    expect(r.issues).toContain('bad_pitch_link');
  });
});

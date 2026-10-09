import { describe, it, expect } from 'vitest';
import { extractContact } from '../../src/services/intent.service.js';

describe('extractContact', () => {
  it('finds an email', () => {
    expect(extractContact('Reach me at jane.doe@example.com please')).toEqual({ email: 'jane.doe@example.com', phone: null });
  });

  it('finds an international phone number', () => {
    const r = extractContact('Call +1 (415) 555-0199 for details');
    expect(r.phone).toBe('+1 (415) 555-0199');
    expect(r.email).toBeNull();
  });

  it('finds both email and phone', () => {
    const r = extractContact('email: me@site.io or whatsapp 9876543210');
    expect(r.email).toBe('me@site.io');
    expect(r.phone).toBe('9876543210');
  });

  it('returns null when neither is present', () => {
    expect(extractContact('I need a website for my new cafe, budget flexible')).toBeNull();
  });

  it('does not treat a short budget number as a phone', () => {
    expect(extractContact('Budget is 500 dollars')).toBeNull();
  });
});

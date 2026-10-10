import { describe, expect, it } from 'vitest';
import { linkedinIdentifier } from '../../src/integrations/unipile/index.js';

describe('unipile linkedinIdentifier', () => {
  it('extracts the public identifier from a profile URL', () => {
    expect(linkedinIdentifier('https://www.linkedin.com/in/kartik-5a680a229')).toBe('kartik-5a680a229');
  });
  it('handles a trailing slash', () => {
    expect(linkedinIdentifier('https://linkedin.com/in/janesmith/')).toBe('janesmith');
  });
  it('returns null for empty input', () => {
    expect(linkedinIdentifier('')).toBe(null);
    expect(linkedinIdentifier(null)).toBe(null);
  });
});

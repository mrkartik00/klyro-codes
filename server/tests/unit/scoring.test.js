import { describe, expect, it } from 'vitest';
import { scoreLead } from '../../src/services/scoring.service.js';

describe('scoreLead', () => {
  it('scores a high-need lead highly', () => {
    const { score, reasons } = scoreLead({
      organization: { domain: null, rating: 4.6, reviewCount: 120, category: 'Dentist' },
      contact: { email: 'a@b.com', emailStatus: 'valid' },
      audit: {},
    });
    expect(score).toBeGreaterThanOrEqual(65);
    expect(reasons).toContain('noWebsite');
    expect(reasons).toContain('hasEmail');
  });

  it('caps at 100', () => {
    const { score } = scoreLead({
      organization: { domain: null, rating: 5, reviewCount: 999, category: 'lawyer' },
      contact: { email: 'a@b.com' },
      audit: { mobileScore: 10, hasSsl: false },
    });
    expect(score).toBe(100);
  });

  it('scores a well-served business low', () => {
    const { score } = scoreLead({
      organization: { domain: 'good.com', rating: 3.2, reviewCount: 3, category: 'cafe' },
      contact: {},
      audit: { mobileScore: 95, hasSsl: true, reachable: true },
    });
    expect(score).toBe(0);
  });
});

import { describe, it, expect } from 'vitest';
import { projects, slugify } from './projects.js';

describe('web projects data', () => {
  it('slugify makes url-safe slugs', () => {
    expect(slugify('AYUSH Startup Portal')).toBe('ayush-startup-portal');
    expect(slugify('Janki Care')).toBe('janki-care');
  });
  it('every project has the required fields', () => {
    expect(projects.length).toBeGreaterThan(0);
    for (const p of projects) {
      expect(p.name).toBeTruthy();
      expect(p.url).toMatch(/^https?:\/\//);
      expect(typeof p.embed).toBe('boolean');
    }
  });
  it('offline projects are not embedded', () => {
    for (const p of projects) {
      if (p.preview === null) expect(p.embed).toBe(false);
    }
  });
});

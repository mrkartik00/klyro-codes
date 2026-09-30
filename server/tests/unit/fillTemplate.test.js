import { describe, it, expect } from 'vitest';
import { fillTemplate, auditHighlight } from '../../src/services/drafting.service.js';

describe('fillTemplate', () => {
  it('fills known placeholders and drops unknown ones', () => {
    const out = fillTemplate('Hi {{firstName}}, about {{company}} {{nope}}.', { firstName: 'Ann', company: 'Acme' });
    expect(out).toBe('Hi Ann, about Acme.');
  });
  it('never leaves raw {{ }} in the text', () => {
    expect(fillTemplate('{{a}} {{ b }} x', {})).not.toMatch(/\{\{|\}\}/);
  });
});

describe('auditHighlight', () => {
  it('turns the first known issue into a human sentence', () => {
    expect(auditHighlight(['heavy-page', 'no-ssl'])).toMatch(/not secure/);
  });
  it('has a neutral default', () => {
    expect(auditHighlight([])).toMatch(/quick wins/);
  });
});

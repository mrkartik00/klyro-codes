import { describe, expect, it } from 'vitest';
import { assertTransition, canTransition } from '../../src/utils/stateMachine.js';
import { ApiError } from '../../src/utils/ApiError.js';

describe('stateMachine', () => {
  it('allows a valid deal transition', () => {
    expect(assertTransition('deal', 'new', 'contacted')).toBe('contacted');
  });

  it('rejects an illegal deal transition with 409', () => {
    try {
      assertTransition('deal', 'new', 'won');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect(err.statusCode).toBe(409);
      expect(err.code).toBe('ILLEGAL_TRANSITION');
    }
  });

  it('rejects an unknown entity', () => {
    expect(() => assertTransition('nope', 'a', 'b')).toThrow(ApiError);
  });

  it('canTransition returns booleans', () => {
    expect(canTransition('invoice', 'sent', 'paid')).toBe(true);
    expect(canTransition('invoice', 'paid', 'draft')).toBe(false);
  });
});

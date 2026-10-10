import { describe, expect, it } from 'vitest';
import { isDeliveryFailure } from '../../src/services/reply.service.js';

describe('isDeliveryFailure (DSN/bounce detection)', () => {
  it('flags a Delivery Status Notification subject', () => {
    expect(isDeliveryFailure({ subject: 'Delivery Status Notification (Failure)' })).toBe(true);
  });
  it('flags an undeliverable subject', () => {
    expect(isDeliveryFailure({ subject: 'Undeliverable: Quick question' })).toBe(true);
  });
  it('flags a mailer-daemon sender', () => {
    expect(isDeliveryFailure({ subject: 're: hi', from: 'MAILER-DAEMON@google.com' })).toBe(true);
  });
  it('flags an SMTP 5.x.x code in the body', () => {
    expect(isDeliveryFailure({ subject: 'returned', body: 'said: 550 5.1.1 user unknown' })).toBe(true);
  });
  it('does not flag a normal human reply', () => {
    expect(isDeliveryFailure({ subject: 'Re: Quick question', body: 'Sure, happy to chat tomorrow.', contactEmail: 'jane@acme.com' })).toBe(false);
  });
});

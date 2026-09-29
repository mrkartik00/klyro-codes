// Single source of truth for enum values used by the API, n8n contracts and all frontends.
// Status transitions themselves are enforced server-side in utils/stateMachine.js.

export const ROLES = Object.freeze(['super_admin', 'admin', 'client', 'freelancer']);

export const CHANNELS = Object.freeze([
  'email',
  'reddit',
  'linkedin',
  'discord',
  'portal_chat',
]);

export const CURRENCIES = Object.freeze(['USD', 'GBP', 'INR']);

export const COMPANY_TYPES = Object.freeze(['ltd', 'llp', 'plc', 'sole_trader', 'unknown']);

export const LEAD_STAGES = Object.freeze([
  'new',
  'enriched',
  'qualified',
  'enrolled',
  'replied',
  'converted',
  'disqualified',
]);

export const DEAL_STAGES = Object.freeze([
  'new',
  'contacted',
  'replied',
  'call',
  'quote',
  'won',
  'lost',
]);

export const EMAIL_STATUSES = Object.freeze(['valid', 'risky', 'invalid', 'unknown']);

export const MAILBOX_STATUSES = Object.freeze(['warming', 'active', 'paused']);

export const ENROLLMENT_STATUSES = Object.freeze([
  'active',
  'replied',
  'completed',
  'stopped',
  'bounced',
]);

export const SCRAPE_JOB_STATUSES = Object.freeze([
  'queued',
  'running',
  'ingesting',
  'enriched',
  'failed',
]);

export const QUOTATION_STATUSES = Object.freeze([
  'draft',
  'sent',
  'accepted',
  'rejected',
  'expired',
  'superseded',
]);

export const INVOICE_STATUSES = Object.freeze([
  'draft',
  'sent',
  'partially_paid',
  'paid',
  'void',
]);

export const REPLY_CLASSES = Object.freeze([
  'interested',
  'question',
  'objection',
  'not_now',
  'not_interested',
  'out_of_office',
  'referral',
  'unsubscribe',
  'needs_review',
]);

export const SUPPRESSION_TYPES = Object.freeze(['email', 'domain', 'phone']);

// Allowed status transitions, consumed by utils/stateMachine.js.
export const TRANSITIONS = Object.freeze({
  deal: {
    new: ['contacted', 'lost'],
    contacted: ['replied', 'lost'],
    replied: ['call', 'quote', 'lost'],
    call: ['quote', 'lost'],
    quote: ['won', 'lost'],
    won: [],
    lost: [],
  },
  quotation: {
    draft: ['sent'],
    sent: ['accepted', 'rejected', 'expired', 'superseded'],
    accepted: [],
    rejected: ['superseded'],
    expired: ['superseded'],
    superseded: [],
  },
  invoice: {
    draft: ['sent'],
    sent: ['partially_paid', 'paid', 'void'],
    partially_paid: ['paid', 'void'],
    paid: [],
    void: [],
  },
  enrollment: {
    active: ['replied', 'completed', 'stopped', 'bounced'],
    replied: ['completed', 'stopped'],
    completed: [],
    stopped: [],
    bounced: [],
  },
});

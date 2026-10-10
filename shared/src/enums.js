// Single source of truth for enum values used by the API, n8n contracts and all frontends.
// Status transitions themselves are enforced server-side in utils/stateMachine.js.

export const ROLES = Object.freeze(['super_admin', 'admin', 'client', 'freelancer']);

export const CHANNELS = Object.freeze([
  'email',
  'reddit',
  'linkedin',
  'x',
  'instagram',
  'discord',
  'portal_chat',
]);

// Where a lead was found. Social ones are contacted by hand (manual channels).
export const LEAD_PLATFORMS = Object.freeze(['maps', 'reddit', 'linkedin', 'x', 'instagram', 'facebook', 'inbound', 'csv', 'manual']);
export const MANUAL_CHANNELS = Object.freeze(['reddit', 'linkedin', 'x', 'instagram']);

// Channels that can be sent automatically via a connected social account (Unipile).
export const SOCIAL_CHANNELS = Object.freeze(['linkedin', 'instagram', 'whatsapp']);
export const SOCIAL_ACCOUNT_STATUSES = Object.freeze(['active', 'paused', 'restricted']);

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

export const SUPPRESSION_TYPES = Object.freeze(['email', 'domain', 'phone', 'linkedin']);

// Allowed status transitions, consumed by utils/stateMachine.js.
export const TRANSITIONS = Object.freeze({
  // Deals are moved by hand on the board, so any open stage can go to any
  // other; lost deals can be reopened; won is final (money/project exist).
  deal: {
    new: ['contacted', 'replied', 'call', 'quote', 'won', 'lost'],
    contacted: ['new', 'replied', 'call', 'quote', 'won', 'lost'],
    replied: ['new', 'contacted', 'call', 'quote', 'won', 'lost'],
    call: ['new', 'contacted', 'replied', 'quote', 'won', 'lost'],
    quote: ['new', 'contacted', 'replied', 'call', 'won', 'lost'],
    won: [],
    lost: ['new', 'contacted', 'replied', 'call', 'quote'],
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

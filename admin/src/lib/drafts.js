// The API stores approval drafts as { subject, body }; tolerate legacy strings.
export function draftOf(item = {}) {
  const d = item.draft;
  if (d && typeof d === 'object') return { subject: d.subject || '', body: d.body || '' };
  return { subject: item.subject || '', body: d || item.body || '' };
}

// Deal value is { amountMinor, currency } from the API; older data may be a number.
export function dealValueMinor(deal = {}) {
  const v = deal.value;
  if (v == null) return null;
  if (typeof v === 'object') return v.amountMinor ? { minor: v.amountMinor, currency: v.currency || 'USD' } : null;
  return { minor: Number(v) || 0, currency: deal.currency || 'USD' };
}

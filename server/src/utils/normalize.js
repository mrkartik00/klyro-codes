import { parsePhoneNumberFromString } from 'libphonenumber-js';

export function normalizePhone(raw, country) {
  if (!raw) return null;
  const parsed = parsePhoneNumberFromString(String(raw), country);
  return parsed?.isValid() ? parsed.number : null; // E.164
}

export function registrableDomain(input) {
  if (!input) return null;
  let host = String(input).trim().toLowerCase();
  host = host.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split('?')[0];
  if (!host.includes('.')) return null;
  return host;
}

const PLACEHOLDER_DOMAINS = new Set(['example.com', 'sentry.io', 'wix.com', 'godaddy.com', 'squarespace.com']);

export function isUsableEmail(email) {
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return false;
  const domain = email.split('@')[1].toLowerCase();
  return !PLACEHOLDER_DOMAINS.has(domain);
}

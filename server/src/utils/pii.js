// Data minimisation for AI calls (B17). Strips quoted history, signatures and
// obvious personal identifiers before reply text is sent to Gemini, per the
// plan's rule that Google may use prompts for training.

const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE = /(\+?\d[\d\s().-]{7,}\d)/g;
const URL = /\bhttps?:\/\/\S+/g;

/** Remove quoted history and common signature blocks from an email reply. */
export function stripQuotedAndSignature(text = '') {
  let out = String(text);

  // Cut everything from the first quoted-history marker onward.
  const markers = [
    /^On .+ wrote:$/m, // Gmail
    /^-{2,}\s*Original Message\s*-{2,}$/im, // Outlook
    /^From:\s.+$/im, // forwarded header block
    /^_{5,}$/m, // Outlook divider
    /^>{1,}/m, // quoted lines
  ];
  let cut = out.length;
  for (const m of markers) {
    const idx = out.search(m);
    if (idx !== -1 && idx < cut) cut = idx;
  }
  out = out.slice(0, cut);

  // Trim a trailing signature after a "-- " delimiter or "Regards,"-style sign-off.
  const sig = out.search(/\n-- \n|\n(?:regards|thanks|best|cheers|sincerely)[,!]?\s*\n/i);
  if (sig !== -1) out = out.slice(0, sig);

  return out.trim();
}

/** Redact emails, phone numbers and URLs from free text. */
export function redactPii(text = '') {
  return String(text)
    .replace(EMAIL, '[email]')
    .replace(PHONE, '[phone]')
    .replace(URL, '[link]');
}

/** Full minimisation pipeline for a reply body before it goes to the model. */
export function minimiseForAi(text = '', { maxLen = 1500 } = {}) {
  return redactPii(stripQuotedAndSignature(text)).slice(0, maxLen);
}

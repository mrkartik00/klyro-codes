import { generateJson } from '../integrations/gemini/index.js';
import { draftPrompt, classifyPrompt } from '../integrations/gemini/prompts.js';

const SPAM_WORDS = ['free money', 'guarantee', 'act now', 'risk-free', 'winner', 'click here'];

/** Validate a draft against guardrails. Returns { ok, issues }. */
export function checkDraft(draft, facts) {
  const issues = [];
  if (!draft?.subject || !draft?.body) issues.push('missing_fields');
  const body = (draft?.body ?? '').toLowerCase();
  if (body.length > 900) issues.push('too_long');
  if (/\[[a-z ]+\]/i.test(draft?.body ?? '')) issues.push('placeholder');
  if (SPAM_WORDS.some((w) => body.includes(w))) issues.push('spam_words');
  // Must reference at least one real fact (name or city) to be personalized.
  const refs = [facts.businessName, facts.city].filter(Boolean).map((s) => s.toLowerCase());
  if (refs.length && !refs.some((r) => body.includes(r))) issues.push('not_personalized');
  return { ok: issues.length === 0, issues };
}

/** Produce a validated draft. Falls back to a template-based draft if AI fails. */
export async function draftEmail({ business, audit, template, tone }) {
  const facts = {
    businessName: business.name,
    city: business.city,
    category: business.category,
  };
  const ai = await generateJson(draftPrompt({ business, audit, template, tone }));
  if (ai) {
    const check = checkDraft(ai, facts);
    if (check.ok) return { ...ai, source: 'ai' };
    return { ...ai, source: 'ai', guardrailIssues: check.issues };
  }
  // Deterministic fallback so the pipeline never stalls without AI.
  return {
    subject: `Quick idea for ${business.name}`,
    body: `Hi, I came across ${business.name}${business.city ? ` in ${business.city}` : ''} and had a quick idea to help you win more customers online. Worth a short reply?`,
    personalizationNotes: 'fallback',
    source: 'fallback',
  };
}

export async function classifyReply({ replyText }) {
  const ai = await generateJson(classifyPrompt({ replyText }));
  const allowed = [
    'interested',
    'question',
    'objection',
    'not_now',
    'not_interested',
    'out_of_office',
    'referral',
    'unsubscribe',
  ];
  if (!ai || !allowed.includes(ai.class) || (ai.confidence ?? 0) < 0.4) {
    return { class: 'needs_review', confidence: ai?.confidence ?? 0, suggestedReply: ai?.suggestedReply };
  }
  return ai;
}

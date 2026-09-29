import { generateJson } from '../integrations/gemini/index.js';
import { draftPrompt, classifyPrompt } from '../integrations/gemini/prompts.js';
import { minimiseForAi } from '../utils/pii.js';

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
  // B17 — strip quoted history, signature and PII before the model sees it.
  const minimised = minimiseForAi(replyText ?? '');
  const ai = await generateJson(classifyPrompt({ replyText: minimised }));
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

/**
 * F41 — qualify an inbound enquiry/project request. Returns a tier + summary.
 * Falls back to a neutral 'review' tier if AI is unavailable. Only non-personal
 * project details are sent to the model.
 */
export async function qualifyEnquiry({ message, budget, projectType }) {
  const minimised = minimiseForAi(message ?? '', { maxLen: 800 });
  const prompt = `Qualify this inbound web/app project enquiry for a dev studio. Return strict JSON:
{"tier": one of ["hot","warm","cold","spam"], "summary": string (<=140 chars), "reasoning": string}
Budget hint: ${budget ?? 'unknown'}. Project type: ${projectType ?? 'unknown'}.
Enquiry: """${minimised}"""`;
  const ai = await generateJson(prompt);
  const tiers = ['hot', 'warm', 'cold', 'spam'];
  if (!ai || !tiers.includes(ai.tier)) {
    return { tier: 'warm', summary: (message ?? '').slice(0, 140), reasoning: 'fallback' };
  }
  return ai;
}

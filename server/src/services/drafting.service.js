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
  if (/\[[a-z ]+\]/i.test(draft?.body ?? '') || /\{\{\s*\w+\s*\}\}/.test(`${draft?.subject ?? ''} ${draft?.body ?? ''}`)) {
    issues.push('placeholder');
  }
  if (SPAM_WORDS.some((w) => body.includes(w))) issues.push('spam_words');
  // A /pitch/ link must be exactly the valid pitchUrl we provided. Any other
  // (or any pitch link when none was provided) means a broken/empty-page link.
  const pitchLinks = `${draft?.subject ?? ''} ${draft?.body ?? ''}`.match(/https?:\/\/\S*\/pitch\/\S+/gi) || [];
  if (pitchLinks.some((l) => l.replace(/[.,)]+$/, '') !== facts.pitchUrl)) issues.push('bad_pitch_link');
  // Must reference at least one real fact (name or city) to be personalized.
  const refs = [facts.businessName, facts.city].filter(Boolean).map((s) => s.toLowerCase());
  if (refs.length && !refs.some((r) => body.includes(r))) issues.push('not_personalized');
  return { ok: issues.length === 0, issues };
}

const ISSUE_TEXT = {
  'no-ssl': 'the site is not secure (no HTTPS), so browsers warn visitors',
  'no-viewport': "the site isn't set up for phones",
  'slow-mobile': 'the site loads slowly on phones',
  unreachable: "the website wasn't loading when I checked",
  'no-website': "I couldn't find a website for you",
  'stale-copyright': 'the site looks like it has not been updated in a while',
  'no-meta-description': "the site isn't set up well for Google search",
  'no-title': "the site isn't set up well for Google search",
};

/** A short, human sentence about the biggest website problem (or a neutral line). */
export function auditHighlight(issues = []) {
  for (const i of issues) if (ISSUE_TEXT[i]) return ISSUE_TEXT[i];
  return 'there are a few quick wins that could bring you more enquiries';
}

/**
 * Replace {{var}} placeholders. Personal values (first name) are filled here,
 * server-side, after the AI step — they are never sent to the model.
 * Unknown variables are removed rather than shown to the recipient.
 */
export function fillTemplate(text, vars) {
  return String(text ?? '')
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => (vars[k] != null && vars[k] !== '' ? String(vars[k]) : ''))
    .replace(/[ \t]+([,.!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ');
}

/**
 * Remove any sentence/line that references a pitch/preview page or links to a
 * /pitch/ URL. Used as a safety net when there is no valid pitch URL so an
 * email can never point a prospect to an empty page.
 */
export function stripPitchReferences(text) {
  return String(text ?? '')
    .split(/\n/)
    .filter((line) => !/https?:\/\/\S*\/pitch\//i.test(line) && !/\b(preview|proposal|mock-?up|short page|sample (site|page))\b/i.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Produce a validated draft. Falls back to a template-based draft if AI fails. */
export async function draftEmail({ business, audit, template, tone, channel = 'email', vars: extraVars = {} }) {
  const vars = {
    company: business.name,
    city: business.city,
    category: business.category,
    auditHighlight: auditHighlight(audit?.issues),
    firstName: 'there',
    ...Object.fromEntries(Object.entries(extraVars).filter(([, v]) => v != null && v !== '')),
  };
  const finish = (d) => {
    let subject = fillTemplate(d.subject, vars);
    let body = fillTemplate(d.body, vars);
    // Safety net: if there's no valid pitch URL, remove any pitch reference the
    // model or template may have produced, so we never link an empty page.
    if (!vars.pitchUrl) {
      body = stripPitchReferences(body);
      subject = stripPitchReferences(subject);
    }
    const out = { ...d, subject, body };
    const check = checkDraft(out, { businessName: business.name, city: business.city, pitchUrl: vars.pitchUrl });
    return check.ok ? out : { ...out, guardrailIssues: [...new Set([...(d.guardrailIssues ?? []), ...check.issues])] };
  };
  const d = finish(await draftRaw({ business, audit, template, tone, channel, hasPitch: Boolean(vars.pitchUrl) }));
  // LinkedIn connection notes max out at 300 characters.
  if (channel === 'linkedin' && d.body.length > 300) d.body = `${d.body.slice(0, 297).replace(/\s+\S*$/, '')}…`;
  return d;
}

async function draftRaw({ business, audit, template, tone, channel, hasPitch }) {
  const facts = {
    businessName: business.name,
    city: business.city,
    category: business.category,
  };
  void facts;
  const ai = await generateJson(draftPrompt({ business, audit, template, tone, hasPitch, channel }));
  if (ai?.subject && ai?.body) return { ...ai, source: 'ai' };
  // Deterministic fallback so the pipeline never stalls without AI: use the
  // template itself (placeholders are filled by the caller), else a safe line.
  // Only when the template is itself personalised ({{company}} or the name).
  const personalised = (t) => /\{\{\s*company\s*\}\}/.test(t) || (business.name && t.includes(business.name));
  if (template?.body && personalised(template.body)) {
    return {
      subject: template.subject || 'Quick idea for {{company}}',
      body: template.body,
      personalizationNotes: 'template (AI unavailable)',
      source: 'template',
    };
  }
  if (channel !== 'email') {
    return {
      subject: `${channel} message`,
      body: `Hi {{firstName}}, I came across {{company}}${business.city ? ' in {{city}}' : ''} — noticed {{auditHighlight}}. I help local businesses with that at Klyro. Open to a quick chat?`,
      personalizationNotes: 'fallback',
      source: 'fallback',
    };
  }
  return {
    subject: 'Quick idea for {{company}}',
    body: `Hi {{firstName}},\n\nI came across {{company}}${business.city ? ' in {{city}}' : ''} and noticed {{auditHighlight}}.${hasPitch ? '\n\nI made a short page showing what a new site could look like: {{pitchUrl}}' : ''}\n\nWorth a quick reply?\n\nKartik\nKlyro`,
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

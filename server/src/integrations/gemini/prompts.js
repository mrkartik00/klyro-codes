export function draftPrompt({ business, audit, template, tone = 'friendly, concise, professional', hasPitch = false, channel = 'email' }) {
  // Only business (non-personal) facts are sent to the model.
  const facts = {
    businessName: business.name,
    category: business.category,
    city: business.city,
    country: business.country,
    hasWebsite: Boolean(business.domain),
    websiteIssues: audit?.issues ?? [],
    mobileScore: audit?.mobileScore ?? null,
  };
  const format =
    channel === 'linkedin'
      ? 'a LinkedIn direct message: max 300 characters, no subject needed (use "LinkedIn message"), no links, no line breaks, no emojis. ' +
        'Open with a specific reference to a real detail (their headline, stated focus, or a recent post) — never "I noticed", "I came across", or "I hope this finds you well". ' +
        'One sentence on what you do and for whom, then one clear call to action (a short call or a specific question).'
      : channel === 'x' || channel === 'instagram'
        ? `a short, friendly ${channel === 'x' ? 'X (Twitter) DM' : 'Instagram DM'}: max 60 words, no links, no subject needed`
        : 'a short B2B cold email: max 120 words, one clear call to action (reply or book a call)';
  return `You write outreach for Klyro, a web/app development studio. Write ${format}.
Tone: ${tone}.
Use ONLY these facts; do not invent details:
${JSON.stringify(facts, null, 2)}

Template guidance (may be empty): ${template?.body ?? ''}

Return strict JSON: {"subject": string, "body": string, "personalizationNotes": string}.
The body must reference at least one specific fact above.
Start with "Hi {{firstName}}," exactly (it is filled in later). Sign off as "Kartik, Klyro".${
    hasPitch ? '\nInclude the literal token {{pitchUrl}} once, where a link to a personalised preview page goes.' : ''
  }
Do not use any other placeholders ([Name], {{anything else}}).`;
}

export function classifyPrompt({ replyText }) {
  return `Classify this cold-email reply for a sales pipeline. Return strict JSON:
{"class": one of ["interested","question","objection","not_now","not_interested","out_of_office","referral","unsubscribe"],
 "confidence": number 0-1, "reasoning": string, "suggestedReply": string}
If unclear, use low confidence. Reply text:
"""${replyText}"""`;
}

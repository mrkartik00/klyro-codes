export function draftPrompt({ business, audit, template, tone = 'friendly, concise, professional', hasPitch = false }) {
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
  return `You write short B2B cold emails for Klyro, a web/app development studio.
Tone: ${tone}. Max 120 words. One clear call to action (reply or book a call).
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

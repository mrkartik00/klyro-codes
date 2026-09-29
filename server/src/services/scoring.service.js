// Table-driven lead scoring (0–100). Weights are overridable per workspace via
// Settings; defaults live here. Pure function → easy to unit test.
export const DEFAULT_WEIGHTS = Object.freeze({
  hasEmail: 25,
  noWebsite: 20, // no site or a bad one = more need for our services
  poorMobileScore: 15, // mobileScore < 50
  noSsl: 10,
  highRating: 10, // rating >= 4.0
  manyReviews: 10, // reviewCount >= 50
  highValueCategory: 10,
});

const HIGH_VALUE = new Set(['dentist', 'lawyer', 'law firm', 'clinic', 'real estate', 'contractor', 'accountant']);

export function scoreLead({ organization = {}, audit = {}, contact = {}, weights = DEFAULT_WEIGHTS }) {
  let score = 0;
  const reasons = [];
  const add = (key, cond) => {
    if (cond && weights[key]) {
      score += weights[key];
      reasons.push(key);
    }
  };

  add('hasEmail', Boolean(contact.email) && contact.emailStatus !== 'invalid');
  add('noWebsite', !organization.domain || audit.reachable === false);
  add('poorMobileScore', typeof audit.mobileScore === 'number' && audit.mobileScore < 50);
  add('noSsl', audit.hasSsl === false);
  add('highRating', typeof organization.rating === 'number' && organization.rating >= 4.0);
  add('manyReviews', typeof organization.reviewCount === 'number' && organization.reviewCount >= 50);
  add('highValueCategory', HIGH_VALUE.has(String(organization.category ?? '').toLowerCase()));

  return { score: Math.min(100, score), reasons };
}

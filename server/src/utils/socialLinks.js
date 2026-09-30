// Recognise social profile / post links and pull out a clean handle.
// Used for links found on business websites and for "Add lead from link".

const RULES = [
  // Reddit: user profile or a post (the author is filled in from the API).
  { platform: 'reddit', re: /^(?:www\.|old\.|new\.)?reddit\.com$/, handle: (p) => (p[0] === 'user' || p[0] === 'u') && p[1] ? `u/${p[1]}` : null, kind: (p) => (p[0] === 'r' && p[2] === 'comments' ? 'post' : p[0] === 'user' || p[0] === 'u' ? 'profile' : 'community') },
  { platform: 'x', re: /^(?:www\.|mobile\.)?(?:x|twitter)\.com$/, handle: (p) => (p[0] && !RESERVED_X.has(p[0].toLowerCase()) ? `@${p[0]}` : null), kind: (p) => (p[1] === 'status' ? 'post' : 'profile') },
  { platform: 'linkedin', re: /^(?:[a-z]{2,3}\.)?linkedin\.com$/, handle: (p) => (['in', 'company', 'school'].includes(p[0]) && p[1] ? `${p[0]}/${p[1]}` : null), kind: (p) => (p[0] === 'company' ? 'company' : p[0] === 'in' ? 'profile' : p[0] === 'posts' || p[0] === 'feed' ? 'post' : 'other') },
  { platform: 'instagram', re: /^(?:www\.)?instagram\.com$/, handle: (p) => (p[0] && !['p', 'reel', 'explore', 'stories'].includes(p[0]) ? `@${p[0]}` : null), kind: (p) => (['p', 'reel'].includes(p[0]) ? 'post' : 'profile') },
  { platform: 'facebook', re: /^(?:www\.|m\.|web\.)?facebook\.com$/, handle: (p) => (p[0] && !['sharer', 'sharer.php', 'tr', 'plugins', 'dialog', 'profile.php'].includes(p[0]) ? p[0] : null), kind: () => 'profile' },
  { platform: 'youtube', re: /^(?:www\.|m\.)?youtube\.com$/, handle: (p) => (p[0]?.startsWith('@') ? p[0] : p[0] === 'c' || p[0] === 'channel' ? p[1] : null), kind: () => 'profile' },
  { platform: 'tiktok', re: /^(?:www\.)?tiktok\.com$/, handle: (p) => (p[0]?.startsWith('@') ? p[0] : null), kind: (p) => (p[1] === 'video' ? 'post' : 'profile') },
];
const RESERVED_X = new Set(['home', 'search', 'explore', 'intent', 'share', 'i', 'hashtag', 'login', 'signup', 'settings', 'messages', 'notifications']);

/**
 * parseSocialUrl('https://x.com/janedoe/status/1') →
 *   { platform: 'x', handle: '@janedoe', kind: 'post', url: 'https://x.com/janedoe/status/1' }
 * Returns null for anything that isn't a recognised social link.
 */
export function parseSocialUrl(input) {
  if (!input || typeof input !== 'string') return null;
  let s = input.trim();
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  let u;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split('/').filter(Boolean).map((x) => decodeURIComponent(x));
  for (const r of RULES) {
    if (!r.re.test(host)) continue;
    u.hash = '';
    // Drop tracking params; keep the path.
    const clean = `${u.protocol}//${host.replace(/^(mobile|m|web|old|new)\./, 'www.').replace(/^twitter\.com$/, 'x.com')}${u.pathname.replace(/\/+$/, '')}`;
    return { platform: r.platform, handle: r.handle(parts) || null, kind: r.kind(parts), url: clean };
  }
  return null;
}

/** Split website-found socials into organization links (by platform). */
export function socialsFromLinks(links = {}) {
  const out = {};
  for (const url of Object.values(links)) {
    const p = parseSocialUrl(url);
    if (p && !out[p.platform]) out[p.platform] = p.url;
  }
  return out;
}

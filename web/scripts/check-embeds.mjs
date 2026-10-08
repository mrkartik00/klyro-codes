// Checks that every project marked `embed: true` really allows klyro.codes to
// frame it. A site that blocks framing renders as an empty card, so run this
// after adding a project or when a client changes their server headers:
//   node web/scripts/check-embeds.mjs
import { projects } from '../src/lib/projects.js';

const ORIGIN = 'https://klyro.codes';
let bad = 0;
for (const p of projects.filter((x) => x.embed)) {
  let res;
  try {
    res = await fetch(p.url, { redirect: 'follow', signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'Mozilla/5.0 (klyro embed check)' } });
  } catch (err) {
    console.log(`✗ ${p.name}: unreachable (${err.message}) — set embed: false`);
    bad += 1;
    continue;
  }
  const xfo = (res.headers.get('x-frame-options') || '').toLowerCase();
  const fa = (res.headers.get('content-security-policy') || '').match(/frame-ancestors([^;]*)/i)?.[1]?.trim() ?? null;
  // frame-ancestors overrides X-Frame-Options in modern browsers.
  const allowed = fa !== null ? fa.split(/\s+/).some((s) => s === '*' || s === ORIGIN || s === 'https:') : !/deny|sameorigin/.test(xfo);
  console.log(`${allowed ? '✓' : '✗'} ${p.name}: ${fa !== null ? `frame-ancestors ${fa}` : xfo ? `X-Frame-Options ${xfo}` : 'no framing restriction'}`);
  if (!allowed) bad += 1;
}
if (bad) {
  console.log(`\n${bad} project(s) block framing. Either set embed: false in web/src/lib/projects.js, or add this to the site's nginx server block:\n  add_header Content-Security-Policy "frame-ancestors 'self' ${ORIGIN} https://www.klyro.codes" always;\n  (and remove any "add_header X-Frame-Options ...")`);
  process.exit(1);
}

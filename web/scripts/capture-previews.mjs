/**
 * Capture real full-page screenshots of each live project for the portfolio
 * "running site" previews. Uses headless Chrome via the DevTools Protocol.
 *
 * For each site: load the homepage, discover same-origin internal links,
 * capture the homepage + up to (PAGES-1) other pages as tall WebP images,
 * and write web/public/previews/<slug>/manifest.json.
 *
 * Usage: node web/scripts/capture-previews.mjs [slug ...]
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'previews');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VIEW_W = 1280; // CSS width we render the site at
const VIEW_H = 800;
const DSF = 2;   // device scale factor → retina-sharp captures
const SCALE = 1; // capture at full CSS width
const MAX_H = 5200; // cap captured height (CSS px) to keep files small
const PAGES = 4;

const SITES = [
  { slug: 'estate100', url: 'https://estate100.com' },
  { slug: 'janki-care', url: 'https://janki.care' },
  { slug: 'villagestay', url: 'https://villagestay.live' },
  { slug: 'ayush-startup-portal', url: 'https://ayushstartup.aiia.gov.in' },
  { slug: 'shyam-yatra', url: 'https://shyamyatra.in' },
  { slug: 'snacktrack', url: 'https://snacktrack.me' },
  { slug: 'toshvik', url: 'https://toshvik.in' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openBrowser() {
  const port = 9400 + Math.floor(Math.random() * 400);
  const proc = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
    `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/klyro-capture-${port}`, 'about:blank',
  ], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 60 && !target; i++) {
    try {
      target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page');
    } catch { /* starting */ }
    if (!target) await sleep(200);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  const send = (method, params = {}, timeout = 60000) =>
    new Promise((resolve, reject) => {
      const i = ++id;
      const t = setTimeout(() => { pending.delete(i); reject(new Error(`${method} timed out`)); }, timeout);
      pending.set(i, (m) => { clearTimeout(t); m.error ? reject(new Error(m.error.message)) : resolve(m.result); });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const evaluate = async (expression) =>
    (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value;
  return { send, evaluate, close: () => { ws.close(); proc.kill(); } };
}

async function loadPage(b, url) {
  await b.send('Page.navigate', { url });
  await sleep(4500); // let SPA render
  // Scroll through the page to trigger lazy-loaded images, then return to top.
  await b.evaluate(`(async () => {
    const h = Math.min(document.documentElement.scrollHeight, ${MAX_H});
    for (let y = 0; y < h; y += 500) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 180)); }
    window.scrollTo(0, 0);
    // Hide common cookie / chat overlays so they don't cover the capture.
    document.querySelectorAll('[id*="cookie" i],[class*="cookie" i],[class*="consent" i],iframe[src*="chat" i],[id*="tawk" i]').forEach(el => el.style.display = 'none');
    await new Promise(r => setTimeout(r, 800));
    return true;
  })()`);
}

async function capture(b, file) {
  const height = await b.evaluate(`Math.min(Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0), ${MAX_H})`);
  const h = Math.max(VIEW_H, height || VIEW_H);
  const shot = await b.send('Page.captureScreenshot', {
    format: 'webp',
    quality: 92,
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: VIEW_W, height: h, scale: SCALE },
  }, 90000);
  writeFileSync(file, Buffer.from(shot.data, 'base64'));
  return { width: VIEW_W, height: h };
}

async function captureSite(site) {
  const b = await openBrowser();
  try {
    await b.send('Page.enable');
    await b.send('Emulation.setDeviceMetricsOverride', { width: VIEW_W, height: VIEW_H, deviceScaleFactor: DSF, mobile: false });

    await loadPage(b, site.url);
    const origin = await b.evaluate('location.origin');
    if (!origin || origin === 'null') throw new Error('page did not load');

    // Discover distinct same-origin internal pages.
    const links = await b.evaluate(`(() => {
      const seen = new Set([location.pathname.replace(/\\/$/, '') || '/']);
      const out = [];
      for (const a of document.querySelectorAll('a[href]')) {
        let u; try { u = new URL(a.href, location.href); } catch { continue; }
        if (u.origin !== location.origin) continue;
        if (/\\.(pdf|jpg|jpeg|png|zip|webp|svg)$/i.test(u.pathname)) continue;
        if (/(login|logout|signin|signup|register|cart|checkout|admin|account|wp-)/i.test(u.pathname)) continue;
        const key = u.pathname.replace(/\\/$/, '') || '/';
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(u.origin + u.pathname);
      }
      return out.slice(0, 12);
    })()`);

    const dir = join(ROOT, site.slug);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });

    const pages = [];
    const queue = [origin + '/', ...links];
    for (const url of queue) {
      if (pages.length >= PAGES) break;
      try {
        if (pages.length > 0) await loadPage(b, url);
        const path = await b.evaluate('location.pathname');
        // Skip pages that redirected to an auth screen.
        if (pages.length > 0 && /(login|signin|sign-in|auth)/i.test(path)) { console.log(`  ↷ ${site.slug} ${url} → ${path} (auth, skipped)`); continue; }
        const file = `${pages.length}.webp`;
        const dims = await capture(b, join(dir, file));
        if (dims.height < 300) continue;
        pages.push({ src: `/previews/${site.slug}/${file}`, path: path || '/', ...dims });
        console.log(`  ✓ ${site.slug} ${path} (${dims.width}x${dims.height})`);
      } catch (err) {
        console.log(`  ✗ ${site.slug} ${url}: ${err.message}`);
      }
    }
    if (pages.length === 0) throw new Error('no pages captured');
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ host: new URL(origin).host, pages }, null, 2));
    return pages.length;
  } finally {
    b.close();
  }
}

const only = process.argv.slice(2);
const results = {};
for (const site of SITES.filter((s) => only.length === 0 || only.includes(s.slug))) {
  console.log(`→ ${site.url}`);
  try {
    results[site.slug] = await captureSite(site);
  } catch (err) {
    results[site.slug] = `failed: ${err.message}`;
    console.log(`  ✗ ${site.slug}: ${err.message} (will use drawn fallback)`);
  }
}
console.log('\nRESULTS', JSON.stringify(results));
process.exit(0);

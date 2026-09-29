/*!
 * Klyro live-preview helper — add to YOUR OWN sites to let klyro.codes show
 * them running in a portfolio window with gentle auto-scroll.
 *
 *   <script src="https://klyro.codes/klyro-preview.js" defer></script>
 *
 * It does nothing unless the page is (1) inside an iframe and (2) opened with
 * ?klyro_preview=1, so normal visitors are never affected.
 * The site's server must also allow framing by klyro.codes:
 *   Content-Security-Policy: frame-ancestors 'self' https://klyro.codes
 * (and remove `X-Frame-Options: SAMEORIGIN`, which would still block it).
 */
(function () {
  try {
    if (window.top === window.self) return;
    if (!/[?&]klyro_preview=1\b/.test(window.location.search)) return;
  } catch {
    /* cross-origin top access throws → we're framed; continue */
  }

  var SPEED = 45; // px per second
  var PAUSE_TOP = 1800;
  var PAUSE_BOTTOM = 1500;
  var y = 0;
  var dir = 1;
  var last = 0;
  var pausedUntil = performance.now() + 2500; // let the page settle first

  function maxScroll() {
    var d = document.documentElement;
    return Math.max(0, Math.max(d.scrollHeight, document.body ? document.body.scrollHeight : 0) - window.innerHeight);
  }

  function frame(t) {
    if (!last) last = t;
    var dt = Math.min(64, t - last);
    last = t;
    if (t >= pausedUntil) {
      var max = maxScroll();
      y += dir * SPEED * (dt / 1000) * (dir < 0 ? 4 : 1); // rewind faster
      if (y >= max) {
        y = max;
        dir = -1;
        pausedUntil = t + PAUSE_BOTTOM;
      } else if (y <= 0) {
        y = 0;
        dir = 1;
        pausedUntil = t + PAUSE_TOP;
      }
      window.scrollTo(0, y);
    }
    requestAnimationFrame(frame);
  }

  // Hide cookie banners / chat widgets inside the preview only.
  var style = document.createElement('style');
  style.textContent =
    'html{scroll-behavior:auto!important}' +
    '[id*="cookie" i],[class*="cookie" i],[class*="consent" i],iframe[src*="chat" i]{display:none!important}';
  (document.head || document.documentElement).appendChild(style);

  requestAnimationFrame(frame);
})();

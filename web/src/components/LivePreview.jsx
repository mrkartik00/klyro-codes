import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../motion/useReducedMotion.js';
import { ProjectPreview } from './ProjectPreview.jsx';

const SITE_W = 1280; // CSS width the live site is rendered at, then scaled down
const SITE_H = 800;
const PAGE_MS = 14000; // dwell per live page before cycling to the next
const SCROLL_PX_PER_S = 38; // capture auto-scroll speed (rendered px/sec)

const manifestCache = new Map();
function loadManifest(slug) {
  if (!manifestCache.has(slug)) {
    manifestCache.set(
      slug,
      fetch(`/previews/${slug}/manifest.json`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    );
  }
  return manifestCache.get(slug);
}

/** True once the element scrolls near the viewport (stays true after). */
function useNearViewport(ref, rootMargin = '400px') {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return undefined;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin]);
  return near;
}

function useWidth(ref) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/** Auto-scrolling reel of captured real pages (fallback when not live yet). */
function CaptureReel({ pages, width, reduced, onPage }) {
  const [index, setIndex] = useState(0);
  const imgRef = useRef(null);
  const page = pages[index % pages.length];
  const frameH = width * (SITE_H / SITE_W);

  useEffect(() => {
    onPage?.(page.path);
  }, [page, onPage]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img || !width || reduced) return undefined;
    const renderedH = width * (page.height / page.width);
    const shift = Math.max(0, renderedH - frameH);
    const scrollMs = Math.max(4000, (shift / SCROLL_PX_PER_S) * 1000);
    const hold = 1600;
    const total = hold + scrollMs + hold;
    const anim = img.animate(
      [
        { transform: 'translate3d(0,0,0)', offset: 0 },
        { transform: 'translate3d(0,0,0)', offset: hold / total },
        { transform: `translate3d(0,${-shift}px,0)`, offset: (hold + scrollMs) / total },
        { transform: `translate3d(0,${-shift}px,0)`, offset: 1 },
      ],
      { duration: total, easing: 'linear', fill: 'forwards' },
    );
    anim.onfinish = () => setIndex((i) => (i + 1) % pages.length);
    return () => anim.cancel();
  }, [page, width, frameH, reduced, pages.length]);

  return (
    <img
      key={page.src}
      ref={imgRef}
      src={page.src}
      alt=""
      width={page.width}
      height={page.height}
      decoding="async"
      loading="lazy"
      className="absolute inset-0 block w-full animate-[preview-in_0.5s_ease-out] select-none"
      draggable="false"
    />
  );
}

/**
 * A project window that shows the REAL site running inside a browser chrome.
 * For embeddable sites it loads the live site in a scaled, non-interactive,
 * sandboxed iframe that auto-cycles through pages (auto-scroll if the site
 * includes /klyro-preview.js). Until the live frame is ready — or if the site
 * blocks framing / is offline — it shows auto-scrolling real-page captures,
 * then a drawn mockup as a last resort. Live frames mount only once the card
 * nears the viewport, so the page stays fast.
 */
export function LivePreview({ project, className = '' }) {
  const rootRef = useRef(null);
  const viewportRef = useRef(null);
  const near = useNearViewport(rootRef);
  const width = useWidth(viewportRef);
  const reduced = useReducedMotion();

  const [manifest, setManifest] = useState(null);
  const [liveReady, setLiveReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [index, setIndex] = useState(0);
  const [path, setPath] = useState('/');

  useEffect(() => {
    let alive = true;
    if (project.preview) loadManifest(project.preview).then((m) => alive && setManifest(m));
    return () => {
      alive = false;
    };
  }, [project.preview]);

  const pages = manifest?.pages ?? [];
  const paths = pages.length ? pages.map((p) => p.path) : ['/'];
  const canEmbed = Boolean(project.embed && project.url && near && !reduced && !failed);

  // Cycle pages once the current live frame is ready.
  useEffect(() => {
    if (!canEmbed || !liveReady) return undefined;
    const t = setTimeout(() => {
      setLiveReady(false);
      setIndex((i) => (i + 1) % paths.length);
    }, PAGE_MS);
    return () => clearTimeout(t);
  }, [canEmbed, liveReady, paths.length]);

  const currentPath = paths[index % paths.length] || '/';
  useEffect(() => {
    if (canEmbed) setPath(currentPath);
  }, [canEmbed, currentPath]);

  // No live + no captures + no url → drawn mockup.
  if (!project.preview && !project.embed) {
    return <ProjectPreview project={project} className={className} />;
  }

  const scale = width ? width / SITE_W : 0;
  const host = manifest?.host ?? project.domain;
  const isLive = canEmbed && liveReady;
  const showCaptures = pages.length > 0 && !isLive;

  return (
    <div ref={rootRef} className={`browser-frame ${className}`}>
      <div className="flex items-center gap-2 border-b border-white/5 bg-white/[0.02] px-4 py-3" aria-hidden="true">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]/70" />
        <span className="ml-3 flex min-w-0 flex-1 items-center gap-2 rounded-md bg-white/5 px-3 py-1 text-[11px] text-white/45">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="shrink-0">
            <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2" />
            <path d="M8 11V8a4 4 0 118 0v3" stroke="currentColor" strokeWidth="2" />
          </svg>
          <span className="truncate">
            {host}
            <span className="text-white/30">{path === '/' ? '' : path}</span>
          </span>
        </span>
        {isLive && (
          <span className="flex items-center gap-1.5 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-red-300 uppercase">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
            Live
          </span>
        )}
      </div>

      <div
        ref={viewportRef}
        className="relative aspect-[16/10] overflow-hidden bg-[#0b0b10]"
        role="img"
        aria-label={`Live preview of ${project.name}`}
      >
        {showCaptures && (
          <CaptureReel pages={pages} width={width} reduced={reduced} onPage={setPath} />
        )}
        {!showCaptures && !isLive && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-white/30">
            Loading {host}…
          </div>
        )}

        {canEmbed && scale > 0 && (
          <iframe
            key={currentPath}
            title={`${project.name} — live`}
            src={`${project.url.replace(/\/$/, '')}${currentPath}${currentPath.includes('?') ? '&' : '?'}klyro_preview=1`}
            width={SITE_W}
            height={SITE_H}
            loading="lazy"
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            tabIndex={-1}
            aria-hidden="true"
            onLoad={() => setLiveReady(true)}
            onError={() => setFailed(true)}
            className="pointer-events-none absolute top-0 left-0 origin-top-left border-0 transition-opacity duration-700"
            style={{
              width: SITE_W,
              height: SITE_H,
              transform: `scale(${scale})`,
              opacity: liveReady ? 1 : 0,
            }}
          />
        )}

        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/40 to-transparent" />
      </div>
    </div>
  );
}

export default LivePreview;

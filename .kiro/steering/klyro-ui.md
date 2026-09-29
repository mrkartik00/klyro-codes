# Klyro UI rules

Applies to every UI task in `web/`, `portal/`, `admin/`.

## Sources of truth (in order)
1. `design-system/klyro/pages/<app-or-page>.md` — page/app overrides (`admin.md`, `portal.md`)
2. `design-system/klyro/MASTER.md` — global tokens (colors, type, spacing, effects)
3. UI UX Pro Max skill (`.kiro/steering/ui-ux-pro-max/`) — query before building a component:
   `python3 .kiro/steering/ui-ux-pro-max/scripts/search.py "<topic>" --stack react`
   `python3 .kiro/steering/ui-ux-pro-max/scripts/search.py "<topic>" --domain ux`
4. "Website UI Tech Stack Analysis" PDF (knowledge base) — motion and performance rules below.

## Stack
- React 19 + Vite + Tailwind v4, React Hook Form + Zod (schemas in `shared/schemas`), TanStack Query.
- `web/` (klyro.codes + pitch pages): Lenis, GSAP + ScrollTrigger (`scrub: 1`) + Flip, Motion for UI state,
  custom cursor via `gsap.quickTo` only under `(pointer: fine)`.
- `portal/`, `admin/`: shadcn/ui (Radix), TanStack Table, dnd-kit, Recharts, Lucide icons.
  No smooth scroll, no custom cursor, no scroll-scrub. Motion only for dialogs/toasts/list reordering (150–250 ms).

## Non-negotiable rendering rules
- Animate only `transform` and `opacity`. Apply `will-change` just before an animation, remove after. Never globally.
- `100dvh`, not `100vh`. Container queries for cards. `-webkit-font-smoothing: antialiased` globally.
- Scale-up hover elements: render at max size, start at `scale(<1)`.
- Self-hosted variable fonts; `font-display: swap`.
- Images: AVIF/WebP + `srcset`, lazy below the fold, from the Spaces CDN.

## Accessibility (WCAG 2.2 AA)
- `prefers-reduced-motion`: disable Lenis, parallax and scrub; render final states; fades only.
- `(pointer: coarse)`: no cursor or hover-only UI; 44×44 px targets (24×24 minimum everywhere).
- Every swipe/drag has a button alternative. Visible focus rings. Contrast ≥ 4.5:1. No emoji icons.

## Forms
- Floating labels, minimal fields, RHF + Zod on both client and server.
- Spam: honeypot field + Cloudflare Turnstile + server rate limit.
- Never sign requests in the browser with a secret; HMAC is server-to-server only.

## Done checklist
- Lighthouse (web): performance ≥ 90, accessibility ≥ 95, CLS < 0.05.
- Tested at 375, 768, 1024, 1440 px, keyboard-only, and with reduced motion on.

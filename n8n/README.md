# n8n workflows

Exported workflow JSONs live in `workflows/`, one file per workflow, committed after every change (a GitHub Action also exports nightly). Credentials are never exported; `credentials.md` lists credential names only.

## Rules for every Klyro workflow
- n8n never writes to MongoDB or Google Sheets. All reads/writes go through the Klyro API (`/api/v1/internal/*`) using the "Klyro API" sub-workflow, which signs requests (HMAC + timestamp) and sends an `Idempotency-Key`.
- Free services only (see `IMPLEMENTATION_PLAN.md` §1a). No Apify, Decodo, Firecrawl, Instantly, Unipile or paid verifiers.
- Every AI node returns strict JSON; if parsing fails, route to `needs_review` instead of guessing.
- Send business data only to Gemini (free tier); strip personal names, emails, phone numbers and signatures first.
- Errors go to the global error workflow → Telegram alert.

## Workflow catalogue and reference templates

The templates are free community workflows used as starting points. Import one, take the useful part, then replace its Google Sheets / Slack / OpenAI nodes with Klyro API calls, Telegram and Gemini.

| ID | Workflow | Reference templates (free) | What we take from them |
|---|---|---|---|
| H1a | `maps-scrape` — scrape target → gosom scraper → batch ingest | [#2605 Generate leads with Google Maps](https://n8n.io/workflows/2605), [#8406 B2B leads from any city & business type](https://n8n.io/workflows/8406) | Loop over city × category, dedupe, hand off to email finding. Replace Places API with the self-hosted gosom scraper |
| H1b | `enrich-lead` — crawl site for emails, PSI audit, MX/catch-all check, Companies House, score | [#6307 Maps leads with email extraction](https://n8n.io/workflows/6307) (crawl part only; skip its Apify step) | Direct HTTP crawl with browser-like headers, regex extraction, drop image/placeholder matches, "not found" status. Extend to /contact, /about, footer links, max 5 pages |
| H2 | `draft-step` — due steps → Gemini draft → approval queue | [#15849 B2B cold email outreach with Gemini](https://n8n.io/workflows/15849), [#11283 B2B follow-up with Gemini](https://n8n.io/workflows/11283) | Website-summary → personal opener prompt; drafts go to our approval queue, never sent directly |
| H3 | `send-via-mailbox` — claim → Gmail node per mailbox → result | [#2137 Gmail campaign sender](https://n8n.io/workflows/2137) | Hidden campaign tag per email, follow-up only if no reply in thread, no weekend sends. State lives in MongoDB, not a sheet |
| H4 | `reply-watcher` — Gmail trigger → strip quotes → Gemini classify → API | [#17502 Classify cold email replies with Gemini](https://n8n.io/workflows/17502), [#5506 Auto-stop sequences on reply](https://n8n.io/workflows/5506) | Label filter with `-from:me`, remove quoted history before classifying, JSON output with "needs manual review" fallback, suggested reply |
| H5 | `pitch-visit-alert` — pitch event webhook → Telegram | — | Built from scratch |
| H6 | `inbound-enquiry` — form webhook → Gemini qualify → Brevo auto-reply → deal → alert | [#18616 Draft and label Gmail sales replies](https://n8n.io/workflows/18616) | Classification + draft pattern |
| H7/H8 | `quote-followup`, `invoice-reminder` | [#9108 4-stage follow-up with AI](https://n8n.io/workflows/9108) | Stage-based timing |
| H9 | `reddit-intent` — subreddit poll → pre-filter → Gemini intent + draft → approval | [#6337 Reddit lead generation with AI](https://n8n.io/workflows/6337), [#9426 AI Reddit lead generation with scoring](https://n8n.io/workflows/9426) | Keyword pre-filter before AI, intent score threshold, reply draft, human posts. Uses the official Reddit API only |
| H10 | `linkedin-tasks` — LinkedIn steps → Gemini drafts → manual task cards | — | Manual-assist, no automation of LinkedIn itself |
| H11 | `health-check` — ping API, workers, scraper → Telegram on failure | — | Built from scratch |
| H12 | `weekly-report` — metrics → Telegram + Brevo email | — | Built from scratch |
| W1 | `mailbox-warmup` — mailboxes exchange emails, open, mark important, reply | — | Free replacement for paid warmup tools |

## Not used
- #7406 (paid, $25): same technique as H1b, built ourselves.
- #19529 (Reddit via Apify): bypasses Reddit API approval and breaks Reddit's terms.
- Any template whose core depends on Apify, Decodo, HasData, Firecrawl, Instantly or OpenAI-only features.

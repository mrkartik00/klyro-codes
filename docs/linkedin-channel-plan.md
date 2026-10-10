# LinkedIn Outreach Channel — Implementation Plan (Phase 2)

Add LinkedIn as a first-class outreach channel in Klyro using **Unipile** for
profile pull + message send, reusing the existing enroll → draft → approve →
send pipeline, plus a dedicated **"LinkedIn"** page and sidebar entry in the
admin panel.

Status: PLAN ONLY — no code written yet. Awaiting go-ahead + Unipile credentials.

---

## 1. Goal & scope

**In scope**
- Unipile integration (pull profile/posts, send DM) stored deploy-proof in the admin secret store.
- LinkedIn as a `channel` on campaigns/steps/approvals/messages (the enum already includes `linkedin`).
- A "LinkedIn account" concept mirroring `Mailbox` (daily cap, pacing, status) so sends are throttled and auditable.
- Drafts generated with the Alias-AI prompt rules (<300 chars, specific reference, one CTA), flowing through the **existing Approvals UI**.
- A dedicated **admin sidebar button → `/linkedin`** page: connect/manage the LinkedIn account, see queue/sent, health, and daily usage.
- Reuse send window, suppression, idempotency, analytics, enrollment advance.

**Out of scope (later)**
- Auto-discovery of LinkedIn leads via Sales Navigator (kept manual/CSV for now).
- Multi-account rotation beyond a simple pool.
- Reply/inbox sync from LinkedIn (phase 3).

**Risk note (must surface in UI):** LinkedIn automation violates LinkedIn ToS and
can get the account restricted. Enforce 20–25 sends/day, ≥5-min gaps, business-hours
only. Show this warning on the LinkedIn page. The README from the starter kit says
the same. This is a product decision the user owns.

---

## 2. How this maps onto existing Klyro architecture

The email pipeline (verified in code) is:

```
autoEnroll ──> Enrollment(active, nextDueAt)
dueSteps (A2, n8n polls /internal/steps/due)
  └─> draftStep (A3)  -> Gemini draft -> Approval(status: pending)   [human approves in Approvals UI]
readySends (/internal/sends/ready)  -> picks approved + due + unsent
claimSend  (/internal/sends/claim)  -> reserves a Mailbox slot (daily cap), returns send payload
  └─> n8n performs the actual SMTP send
recordSendResult (/internal/sends/result) -> mark sent/failed, advanceEnrollment
```

LinkedIn slots in as a **parallel channel** at three branch points:
1. **Draft** — `draftStep` already passes `channel` to `draftEmail`; add a LinkedIn-specific prompt/template and shape (no subject, body ≤300 chars).
2. **Claim** — `claimSend` is email-only today (`channel: 'email'`, requires `contact.email`, reserves a `Mailbox`). Generalize: branch on the step/approval `channel`; for `linkedin`, require `contact.linkedin`, reserve a **LinkedInAccount** slot instead of a Mailbox, skip the pitch-link/email checks that don't apply.
3. **Send transport** — email send runs in n8n. For LinkedIn we have two options (see §4). Recommendation: **in-process BullMQ worker calling Unipile**, because the LinkedIn send is a single HTTP call and we want the 5-min spacing controlled by us, not n8n.

Everything else (suppression, send window, idempotency per (enrollment, step),
enrollment advance, analytics `recordEvent`) is channel-agnostic and reused as-is.

---

## 3. Data model changes

### 3.1 New model: `LinkedInAccount` (mirrors `Mailbox`)
`server/src/models/LinkedInAccount.js`
```
{
  workspaceId, provider: 'unipile',
  unipileAccountId,          // send account id (Unipile)
  unipilePullAccountId,      // optional separate pull account
  displayName, profileUrl,
  status: 'active'|'paused'|'restricted',   // mirror MAILBOX_STATUSES
  dailyCap: Number (default 20),
  sentToday: Number (default 0),
  sendGapMs: Number (default 300000),       // 5-min spacing
  lastSentAt: Date,
  deletedAt: Date|null,
}
```
Reset `sentToday` in the existing `dailyReset` queue (add LinkedInAccount to that job).

### 3.2 `Message` — allow linkedin
- `channel` already a free string defaulting to `email`; set `channel: 'linkedin'`.
- Add optional `linkedinAccountId` (ref) alongside `mailboxId`.
- `providerMessageId` reused for Unipile message id; `threadId` reused.

### 3.3 `Approval`, `Campaign.SequenceStep`, `Template`
- No schema change needed — `channel` enum already includes `linkedin`.
- `Template` gets LinkedIn variants (channel: 'linkedin', body only, ≤300 chars).

### 3.4 `Contact`
- `linkedin` URL field already exists (confirmed: Contact.js references linkedin).
- Add `linkedinProviderId` (Unipile internal id) cached after first pull.

### 3.5 Suppression
- Reuse `suppression` with `type: 'linkedin'` keyed on profile URL for opt-outs/do-not-contact.

---

## 4. Unipile integration

`server/src/integrations/unipile/index.js`
```
pullProfile(linkedinUrl)        -> { providerId, headline, bio, company, recentPosts[] }
sendLinkedInMessage({ accountId, providerId, text }) -> { providerMessageId, threadId }
```
- Base URL + API key from the **admin secret store** (`cfg('UNIPILE_API_KEY')`, `cfg('UNIPILE_BASE_URL')`), same deploy-proof pattern we used for the scraper keys. Account ids live on the `LinkedInAccount` doc.
- Lift the fetch calls from the starter's `activities.ts` (`/api/v1/linkedin/profiles/:id`, `/posts`, `POST /api/v1/linkedin/messages`). Add timeout + a typed error wrapper matching Klyro's `integrations` logging (`integration: 'unipile'`).
- Rate-limit handling: on 429/5xx, mark the attempt failed (do NOT refund the daily slot — same policy as email).

### Send transport decision
**Chosen: in-process BullMQ worker** (`linkedinSend` queue), not n8n:
- The send is one HTTP call to Unipile — no SMTP/n8n branch needed.
- We need strict ≥5-min spacing per account; a repeatable worker that claims one
  ready LinkedIn send per tick (respecting `sendGapMs` since `lastSentAt`) gives us
  that cleanly, reusing `claimSend`/`recordSendResult`.
- Flow:
  ```
  linkedinSend (repeat every 1 min):
    for each active LinkedInAccount under cap AND now - lastSentAt >= sendGapMs:
      pick one ready linkedin send (readySends extended with channel param)
      claimSend({channel:'linkedin'})   // reserves the account slot (atomic $inc)
      pullProfile if providerId missing  // cache on contact
      sendLinkedInMessage(...)
      recordSendResult(...)              // advances enrollment, records analytics
  ```

---

## 5. Service-layer changes (server)

| File | Change |
|---|---|
| `send.service.js` | Generalize `readySends({channel})` and `claimSend` to branch email vs linkedin: linkedin requires `contact.linkedin`, reserves `LinkedInAccount` (atomic `$inc sentToday` under cap), skips pitch/email-only guards, keeps send-window + suppression + idempotency. |
| `send.service.js` | `recordSendResult`: `recordEvent({channel})` instead of hard-coded `'email'`; set `linkedinAccountId`. |
| `pipeline.service.js` | `draftStep`: when `step.channel==='linkedin'`, call a `draftLinkedIn()` path (no subject, ≤300 chars, Alias prompt). Approval stores `draft.body` only. |
| `drafting.service.js` | Add `draftLinkedIn()` using the ported prompt (see §7). Reuse guardrails + 300-char hard clamp. |
| `queues/index.js` | Register `linkedinSend` repeatable worker (every 1 min); add `LinkedInAccount` to `dailyReset`. |
| `services/linkedin.service.js` (new) | CRUD for LinkedInAccount, connect/test (calls Unipile `GET accounts`), queue/sent/health summaries for the admin page. |

---

## 6. API routes (admin + internal)

Admin (`routes/manage.routes.js` or new `routes/linkedin.routes.js`):
```
GET    /admin/linkedin/accounts            list
POST   /admin/linkedin/accounts            add (unipileAccountId, displayName, dailyCap, sendGapMs)
PATCH  /admin/linkedin/accounts/:id        update (status/cap/gap)
DELETE /admin/linkedin/accounts/:id        soft delete
POST   /admin/linkedin/accounts/:id/test   ping Unipile (verify key + account live)
GET    /admin/linkedin/queue               ready + sent-today + failures summary
```
Secret (`routes/internal.routes.js`) — only if we keep any n8n involvement; with the
in-process worker we don't need new internal routes (worker calls services directly).

All admin routes behind existing admin auth; all mutations `writeAudit`.

---

## 7. The draft prompt (ported from the starter kit)

Port `src/prompts.ts` rules into `draftLinkedIn()`:
- Under 300 chars (hard clamp at 297 + "…", enforced in code regardless of model).
- Open with a specific real reference (a recent post / headline / stated focus) — never "I noticed" / "I came across" / "hope this finds you well".
- One sentence: the problem we solve + for whom.
- One CTA (short call or specific question).
- No bullets, no line breaks, no emojis, don't mention AI.
- Feed the model: contact name, headline, bio, company, website, last 3 posts, buying signal.
- Keep Klyro's data-minimisation: personal values go into placeholders post-generation where possible.

Side benefit: adopt the same "no generic opener" rules for the **email** prompt to
fix the current "I came across…" openings (separate quick win, not required here).

---

## 8. Admin UI — dedicated sidebar button + page

### 8.1 Sidebar (`admin/src/components/layout/Sidebar.jsx`)
Add to `NAV_ITEMS` (import `Linkedin` from `lucide-react`), place after Mailboxes:
```
{ to: '/linkedin', label: 'LinkedIn', icon: Linkedin },
```
Both desktop `Sidebar` and `MobileNav` render from `NAV_ITEMS`, so one line covers both.

### 8.2 Route (`admin/src/app/routes.jsx`)
```
const LinkedIn = lazy(() => import('../pages/LinkedIn.jsx'));
<Route path="/linkedin" element={<Page><LinkedIn /></Page>} />
```

### 8.3 Page (`admin/src/pages/LinkedIn.jsx`)
Mirror `Mailboxes.jsx` structure (PageHeader + Card + Dialog + TanStack Query):
- **Account card(s):** display name, profile URL, status badge, `sentToday/dailyCap`, send-gap, last sent. Add / pause / edit cap / remove / "Test connection".
- **Connect dialog:** Unipile account id, display name, daily cap (default 20), send gap (default 5 min). (The Unipile API key itself is set in API keys/Settings → secret store.)
- **Queue panel:** ready-to-send count, sent today, recent failures (reason).
- **Prominent ToS/safety warning banner** (amber Alert): 20–25/day, 5-min gaps, stop 48–72h if restricted.
- Uses existing `ui` components; follows `klyro-ui.md` (shadcn/Radix, motion only for dialog, 44px targets, contrast ≥4.5:1).

---

## 9. Shared/enums
- `CHANNELS` already includes `linkedin` — no change.
- Add `LINKEDIN_ACCOUNT_STATUSES` (reuse `MAILBOX_STATUSES` shape) in `shared/src/enums.js`.

---

## 10. Testing

Unit:
- `drafting.test` — `draftLinkedIn` clamps to 300, strips emojis/line breaks, obeys no-generic-opener.
- `send.test` — `claimSend({channel:'linkedin'})`: reserves account under cap, blocks over cap, requires `contact.linkedin`, respects send window + suppression + idempotency.
- `linkedin.service.test` — account CRUD + daily reset.

Integration:
- Full enroll→draftLinkedIn→approve→claim→record happy path with a mocked Unipile.
- Over-cap and ≥5-min-gap pacing honored by the worker (fake timers).

Manual (staging, with a throwaway LinkedIn + Unipile sandbox):
- Connect account → Test connection 200.
- One real send end-to-end, verify spacing + Approvals review + analytics event.

---

## 11. Rollout

1. Backend models + Unipile integration + service branches (behind the data; no sends yet).
2. `linkedinSend` worker **disabled by default** (env/secret flag `LINKEDIN_SENDING_ENABLED`).
3. Admin page + sidebar button; connect account; "Test connection".
4. Seed 1 campaign with a LinkedIn step; draft + approve a few; keep sending flag OFF → verify queue populates and Approvals shows LinkedIn drafts.
5. Flip flag ON for a tiny batch (cap 5/day) on a throwaway account; watch for restriction.
6. Raise cap gradually to 20–25/day.

---

## 12. Deliverables checklist

- [ ] `models/LinkedInAccount.js` (+ dailyReset wiring)
- [ ] `integrations/unipile/index.js` (pullProfile, sendLinkedInMessage)
- [ ] `services/linkedin.service.js` (CRUD, test, summaries)
- [ ] `send.service.js` channel branch (readySends/claimSend/recordSendResult)
- [ ] `pipeline.service.js` + `drafting.service.js` LinkedIn draft path + prompt
- [ ] `queues/index.js` `linkedinSend` worker (flagged)
- [ ] admin routes (`/admin/linkedin/*`)
- [ ] `shared/enums.js` LINKEDIN_ACCOUNT_STATUSES
- [ ] Sidebar `NAV_ITEMS` + route + `pages/LinkedIn.jsx`
- [ ] secrets: `UNIPILE_API_KEY`, `UNIPILE_BASE_URL` in admin secret store
- [ ] tests (unit + integration) green; lint clean
- [ ] safety warning banner in UI

---

## 13. What I need from you to build it

1. **Unipile account** with LinkedIn connected, and:
   - `UNIPILE_API_KEY`, `UNIPILE_BASE_URL` (added via admin → API keys, deploy-proof)
   - send account id (and optional separate pull account id)
2. Confirm the **daily cap** (default 20) and that you accept the **ToS/restriction risk**.
3. Confirm transport choice: **in-process worker** (recommended) vs n8n branch.
```

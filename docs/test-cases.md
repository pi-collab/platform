# Regression Test Checklist

> Re-run after the redesign, before the app build, and pre-launch.
> Organized by feature area. **SECURITY / RLS checks are at the bottom — those are CRITICAL.**

## Testing Setup

- [ ] Multi-identity testing requires ISOLATED browser sessions: normal window + incognito + a different browser. Two windows of the same browser share cookies and silently test one identity.
- [ ] Verify `supabase_realtime` publication includes all 5 tables in the target environment: `SELECT tablename FROM pg_publication_tables WHERE pubname='supabase_realtime';` — must show: deals, messages, notifications, deal_deliverable_items, invoices.

---

## 1. Deal Loop

### Offer
- [ ] Brand creates a structured offer (title, deliverables, price, timeline, revision limit, usage rights, payment terms, items).
- [ ] Creator receives notification (offer_sent).
- [ ] Offer appears in creator's deal inbox.

### Accept / Decline
- [ ] Creator accepts → deal status: negotiating → agreed. Brand notified (deal_agreed).
- [ ] Creator declines → deal status: negotiating → declined. Brand notified (offer_declined). Decline reason logged as a message.
- [ ] Cannot accept/decline a non-negotiating deal (server-enforced).

### Submit Deliverables
- [ ] Creator submits link per item → item_status: pending → submitted.
- [ ] "Submit all for review" → deal status: agreed → delivered. Only allowed when ALL items are submitted/approved (none pending/revision).
- [ ] Brand notified (deliverable_submitted).
- [ ] Cannot submit when deal is not agreed/revision.

### Approve / Request Revision
- [ ] Brand approves all items → deal status: delivered → approved. Creator notified.
- [ ] Brand requests revision on item → item_status: submitted → revision (with revision_note). Deal status: delivered → revision. Creator notified.
- [ ] Revision count increments per review round (deal delivered → revision transition), not per item.
- [ ] Warn-but-allow when revision limit exceeded (warning text shown, revision still proceeds).

### Fee Correctness
- [ ] on_top mode: brand pays base + fee; creator receives full base.
- [ ] deducted mode: brand pays base; creator receives base minus fee.
- [ ] Fee snapshot taken at deal creation from brand's CURRENT platform_fee_percent + fee_mode.

### Revision Overage
- [ ] Extra revisions beyond limit: overage = extra count x price_per_extra_revision_paise.
- [ ] Overage reflected in invoice amounts (brand_pays + creator_receives).

### Invoice (gated on posted)
- [ ] Invoice BLOCKED when deal is approved but NOT posted: generate button hidden, message shown ("Mark the content as posted before invoicing").
- [ ] Invoice UNLOCKS after creator marks content as posted (is_posted = true).
- [ ] Server-enforced: generateInvoice rejects with clear message if is_posted is false (not just UI hiding).
- [ ] Server-enforced: issueInvoice rejects with clear message if is_posted is false.
- [ ] Sequence: approved → mark posted (+ live URL) → generate invoice → issue → brand accepts → paid.
- [ ] Creator generates invoice (lazy-create, draft status) — only when deal is approved AND posted.
- [ ] Invoice snapshots: base, overage, fee, brand_pays, creator_receives.
- [ ] Creator issues invoice (draft → issued). Brand notified (invoice_issued).
- [ ] Brand accepts invoice (issued → accepted). Creator notified.
- [ ] Cannot generate duplicate invoice for same deal.
- [ ] NOTE: All current deal types involve a creator post. If a no-post deal type is added later (licensing/UGC-only), a requires_post flag must bypass this gate.

### Payment + Completion
- [ ] Brand marks deal paid → deal status: approved → paid. Creator notified.
- [ ] Invoice status: accepted → paid.
- [ ] Deal can transition to complete after paid.

---

## 2. Creator as User

### Signup + Auth
- [ ] Creator signup via phone + OTP.
- [ ] Stub-match/claim: creator signing up links to existing ops-created stub row (matched by phone/handle), inheriting products, deal history, vetting status.
- [ ] Creator login works after signup.
- [ ] **Staging OTP bypass**: with `STAGING_OTP_BYPASS=true` set, codes `000000` and `123456` accepted on staging (`VERCEL_ENV !== 'production'`).
- [ ] **Bypass rejected without flag**: with `STAGING_OTP_BYPASS` unset, `000000` and `123456` are rejected — normal OTP path unchanged.
- [ ] **Bypass rejected on prod**: even with `STAGING_OTP_BYPASS=true`, bypass codes rejected when `VERCEL_ENV === 'production'`.
- [ ] **Real OTP path unchanged**: real 6-digit codes from `phone_verifications` still work normally regardless of bypass flag.

### OTP SMS Delivery (MSG91 Flow API)
Delivery only — generation and verification stay in `phone_verifications`. MSG91's own
OTP endpoints are deliberately unused. All three entry points (signup, `sendLoginOTP`,
`sendOfferOTP`) funnel through `sendOTP`, so these cover all three.
- [x] **Wire format**: POST `/api/v5/flow` with `authkey` header, `template_id` = MSG91's
      flow id (24-hex, NOT the numeric DLT id), `realTimeResponse: "1"`, `mobiles` as
      `91XXXXXXXXXX` (no `+`), variable key from `MSG91_SMS_VAR_NAME` (= `number`, per the
      `##number##` template preview). No `short_url`. *(verified against a mock endpoint)*
- [x] **Kill switch off (dark deploy)**: `MSG91_SMS_ENABLED` unset → NO HTTP request at all,
      returns `sent`, code logged with masked phone. This is the pre-DLT-Active state.
- [x] **Switch must be exactly `'true'`** — any other value counts as off.
- [x] **Staging bypass wins over SMS**: bypass on + SMS enabled → no send, no metered
      message burned. To test real delivery on staging, turn `STAGING_OTP_BYPASS` off.
- [x] **HTTP 200 is not success**: MSG91 error bodies (`type: 'error'`) and
      `hasError: true` alongside `status: 'success'` are both treated as failures.
- [x] **Failure surfaces to the user**: a definitive send failure returns an error rather
      than a false "code sent" — for OTP the SMS *is* the flow.
- [x] **Failed sends do not consume the rate limit**: the limit counts unused, unexpired
      codes, so an undelivered code held a slot for 10 min — 3 failures locked a creator
      out having received nothing, and fixing SMS did not release them. Undelivered codes
      are now marked used. Genuine limit (3 *successful* sends) still blocks.
- [x] **Timeout bounded** at 4s; never throws, never blocks login.
- [x] **The code is never logged or stored outside `phone_verifications`** — not in
      `[sms]` logs, not in the `events` row. Verified no 6-digit value in event detail.
- [x] **Audit**: every attempt writes `notification.sms_sent` / `notification.sms_failed`
      to `events` (null `deal_id`) with masked phone and MSG91 request id.
- [ ] **LIVE, once DLT PE-TM chain is Active**: flip `MSG91_SMS_ENABLED=true`, send to a
      real handset, confirm the received text matches the approved template
      character-for-character and the header reads GUAPD.
- [ ] **LIVE**: confirm MSG91's real success-response shape and tighten the parser if it
      differs from the mock (`{ message, type }`).

### Vetting Gate
- [ ] Unvetted creator blocked from receiving deals.
- [ ] Vetted creator (is_vetted = true) can receive and manage deals.

### Creator Dashboard
- [ ] Earnings show paid-only amounts (not approved, not pending).
- [ ] Earnings are fee-mode-aware (shows what creator actually receives).

### Creator Payments Record
- [ ] Read-only view of payment history.
- [ ] No payout PII exposed (bank details etc.).

### Messaging
- [ ] Messages are deal-scoped (tied to a deal, not freeform).
- [ ] Terminal-lock: cannot send messages on declined/cancelled/complete deals.

---

## 3. Notifications

### Correct Party Receives Notification
- [ ] offer_sent → creator
- [ ] deal_agreed (accept) → brand
- [ ] offer_declined (decline) → brand
- [ ] deliverable_submitted → brand
- [ ] invoice_issued → brand
- [ ] deal_approved → creator
- [ ] revision_requested → creator
- [ ] invoice_accepted → creator
- [ ] deal_paid → creator
- [ ] new message → OTHER party (not sender)
- [ ] offer-link accept/decline → brand

### Channels
- [ ] WhatsApp (creators) — accepted ≠ delivered; reconcile via `request_id`.
- [ ] Email (brands) — Resend.
- [ ] SMS (OTP only) — see *OTP SMS Delivery* above. Not used for deal notifications.

### Self-Notification Guard
- [ ] Sender does NOT receive a notification for their own action.

### Bell + Read
- [ ] Bell shows unread count.
- [ ] Mark single notification as read.
- [ ] Mark all notifications as read.
- [ ] Deep-link from notification lands on an accessible deal page.

---

## 4. Realtime

### Live Updates
- [ ] Messages appear live (no refresh needed).
- [ ] Own message shows ONCE — dedupe guard (no double from optimistic + realtime).
- [ ] Deal status updates live on deal page.
- [ ] Item approval reflects live on deal page.
- [ ] Invoice status changes reflect live.
- [ ] Dashboard updates live.
- [ ] Bell notification count updates live.
- [ ] Guap sound plays on INCOMING notification only (not own actions).

### Environment Prerequisite
- [ ] Verify supabase_realtime publication includes: deals, messages, notifications, deal_deliverable_items, invoices. Silent failure if missing ("only updates after clicking elsewhere").

---

## 5. Robustness / Idempotency

- [ ] mark_deal_paid: atomic + idempotent — double-click produces one payment, one notification.
- [ ] mark_deal_paid: ownership-guarded — non-owner brand rejected; creator rejected.
- [ ] request_deal_revision: atomic counter — concurrent revisions don't lose a count.
- [ ] approve: double-notify guard — approving doesn't send duplicate notifications.
- [ ] createDeal: double-submit guard — rapid clicks don't create duplicate deals.

---

## 6. Upload

### Link Path
- [ ] Link submission (paste URL) still works as before.

### File Upload
- [ ] Upload option available alongside links.
- [ ] Private bucket — no public URL.
- [ ] Signed-URL reads work for deal parties.
- [ ] Upload scoped to my_creator_id (INSERT policy).
- [ ] Size reject: files > 50MB rejected (until Supabase Pro, then 500MB).
- [ ] Type reject: disallowed file types rejected.
- [ ] Failed upload doesn't corrupt item state (item stays in previous status).
- [ ] Versioned re-upload: new version replaces old, version number increments.
- [ ] View-file link persists post-approval (signed URL still works).

---

## 7. Rights + Shipment + Posted

### Content Rights
- [ ] reel_type per item (collab / non_collab).
- [ ] boosting_rights per item (yes/no + duration in months).
- [ ] Mixed deal: one item boosted, one not — both display correctly.
- [ ] usage_rights_end_date per deal.
- [ ] rights_confirmed event on accept captures FULL per-item snapshot (reel_type, boosting_rights, boosting_duration_months) — survives later edits/extensions.

### Shipment
- [ ] requires_shipment flag — no shipment UI for non-product deals.
- [ ] Brand-only: markShipped / markDelivered (creator cannot call these).
- [ ] Creator sees tracking link + carrier note live.
- [ ] Shipment status progression: pending → shipped → delivered.

### Posted
- [ ] Creator-only action (brand cannot mark posted).
- [ ] Unlocks at approved status (not before).
- [ ] Server-side URL validation (must be valid http/https URL).
- [ ] Posted status surfaced in: deal timeline, deals list, posted filter, dashboard metric.

---

## 8. Campaigns

### Phase 1 — Campaign CRUD + Grouping
- [ ] Create campaign (name, description, optional budget).
- [ ] Edit campaign (name, description, budget, status).
- [ ] Assign existing deal to campaign. Unassign deal from campaign.
- [ ] Rollup: paid = paid/complete deals only (NOT approved). Est. spend = drafts + committed deals.
- [ ] Budget bar: progress, est. spend, paid, to allocate (budget minus est. spend).

### Phase 2a — Draft Roster
- [ ] Add vetted creators to campaign roster. Unvetted creators rejected.
- [ ] Per-creator placement editor: select from creator's products, set placements + pricing.
- [ ] Fee freshness: fee re-snapshot from brand's CURRENT settings on each save.
- [ ] Draft vs Ready gate: draft = no placements or price 0; ready = placements + price > 0.
- [ ] No ₹0 or empty-placement deals can be sent.
- [ ] Budget vs est-spend vs to-allocate updates with draft changes.
- [ ] NOTHING is sent to creators in Phase 2a — drafts only.

### Phase 2b — Bulk Send
- [ ] Select ready drafts (checkboxes). Draft-status rows: checkbox disabled.
- [ ] Select-all: only selects Ready drafts, skips Draft ones.
- [ ] Send proposals → each creator gets:
  - [ ] A real deal (via createDeal — fresh fee snapshot, items, notifications).
  - [ ] Notification (offer_sent).
  - [ ] Shared message as opening thread message in deal chat.
- [ ] Un-vetted creator FAILS with reason ("Creator is no longer vetted"). Other drafts succeed.
- [ ] Partial-failure: per-creator result report. Failed drafts retained for retry. Successful drafts deleted.
- [ ] Double-submit protection (3 layers):
  - [ ] Client: button disabled during send.
  - [ ] Server: re-fetches drafts — deleted ones skipped.
  - [ ] Existing-deal check: creator already has deal in campaign → draft skipped (not duplicated).
- [ ] Fee re-snapshot at send time (not draft's stale fee).
- [ ] Draft internal note carried to deal's internal_note on send.
- [ ] Bulk remove: select drafts → Remove → confirm → deleted.

### Phase 2c — Campaign Brief
- [ ] Brief tab on campaign detail: brand can edit pitch + creative guidelines (plain text).
- [ ] Save brief → persists. Refresh confirms.
- [ ] Creator with a deal in the campaign sees brief read-only on their deal page.
- [ ] Creator sees ONLY brief (name, pitch, guidelines) — NOT budget, drafts, other creators, prices.
- [ ] Campaign with no brief → creator's deal page shows no brief section (clean omit).
- [ ] "Include campaign brief in message" checkbox in Send Proposals modal:
  - [ ] Checked by default when brief exists.
  - [ ] Not shown when no brief set.
  - [ ] When checked, pitch + guidelines appended to shared message.

### Internal Notes
- [ ] Brand can add/edit internal note on draft rows (pre-send).
- [ ] Brand can add/edit internal note on deal rows (post-send, any time).
- [ ] Internal notes never shown to creators.

### Creator Deals — Brand Filter
- [ ] Dropdown appears when creator has deals with 2+ brands.
- [ ] Selecting a brand filters deals list + updates status/posted counts.
- [ ] Hidden when creator has deals with only 1 brand.

### Deal Ref (GD-####)
- [ ] New deals auto-assigned deal_ref (GD-1001, GD-1002, ...) via Postgres trigger.
- [ ] Existing deals backfilled with deal_ref in creation order (migration 021).
- [ ] deal_ref is unique (constraint enforced).
- [ ] deal_ref shown on: brand deals list (Ref column), brand deal detail header, creator deal detail header, creator deals list (next to title), brand invoice card, creator invoice card.
- [ ] Search by deal_ref works on brand deals list (e.g. "GD-1003").

### Search + Pagination (Brand Deals List)
- [ ] Search bar: searches deal_ref, title, deliverables via server-side ILIKE.
- [ ] Search query sanitized: only alphanumeric, space, hyphen allowed. Special chars stripped.
- [ ] Status filter pills use URL params (?status=agreed). Bookmarkable/shareable.
- [ ] Pagination: 20 deals per page. Prev/Next controls. Page count shown.
- [ ] Page resets to 1 when search or status filter changes.
- [ ] Posted sub-filter remains client-side (within current page).
- [ ] Empty state: "No deals match this filter" when search/filter yields 0.
- [ ] Total count shown in header reflects server-side filtered total.

### Search Injection Safety
- [ ] PostgREST filter-grammar injection blocked: query `q` is sanitized to `[a-zA-Z0-9 -]` before interpolation into `.or()` filter string. Characters like `,`, `.`, `(`, `)`, `%` in user input are stripped.
- [ ] Status filter validated against a known set — arbitrary strings rejected.

---

## 9. Creator Storefront

### Public Page (/c/[slug])
- [ ] Published + vetted storefront renders at /c/{slug}.
- [ ] Unpublished storefront returns 404 (not a data error).
- [ ] Unvetted creator's storefront returns 404 (even if is_published = true).
- [ ] Invalid slug format (special chars, too short) returns 404.
- [ ] Page is cached (60s ISR revalidation). Stale-while-revalidate works.
- [ ] OG metadata includes display_name and headline.

### Public Data Whitelist
- [ ] Function returns ONLY: slug, display_name, headline, bio, portrait_path, categories, stats, platform_links, content_items, (conditional: packages, past_collabs).
- [ ] Function NEVER returns: creator_id, phone, handle, user_id, auth_id, rate_card, niche, profile_photo_url.
- [ ] portrait_path: storefront bucket path only, no fallback to creators.profile_photo_url (which is an external URL).
- [ ] Bio: storefront-authored only, no fallback to ops-entered creators.bio.
- [ ] Categories: creator-controlled storefront field, not ops-entered niche.

### Packages Display
- [ ] show_rates = true AND display_price = true: package appears with price.
- [ ] show_rates = true AND display_price = false: package hidden entirely (not shown with null price).
- [ ] show_rates = false: ALL packages hidden (section not rendered).
- [ ] No internal product UUIDs exposed in package objects.

### Past Collabs Display
- [ ] show_past_collabs = true + brand.allow_public_attribution = true + deal.status = 'complete': brand name appears.
- [ ] show_past_collabs = true + brand.allow_public_attribution = false: brand name hidden (even with complete deals).
- [ ] show_past_collabs = true + deal.status NOT 'complete' (approved/paid): brand name hidden.
- [ ] show_past_collabs = false: past collabs section not rendered.
- [ ] Only brand name exposed — no deal details, prices, IDs, categories.

### Pitch Panel
- [ ] "Send a pitch" button opens PitchPanel modal.
- [ ] Unauthenticated user: fills form → submits → redirected to /login?next=/c/{slug}.
- [ ] Pitch draft preserved in sessionStorage (title, deliverables, message) across login redirect.
- [ ] After login, returning to /c/{slug} restores draft from sessionStorage.
- [ ] Authenticated brand member: pitch creates a real deal with source='storefront'.
- [ ] Pitch message inserted as first thread message.
- [ ] Creator notified (offer_sent).
- [ ] Non-brand user (creator, no brand_members row): clear error "Only brand members can send pitches."
- [ ] Unapproved brand: clear error "Your brand account is pending approval."
- [ ] Slug → creator_id resolution happens server-side (creator_id never sent to client).

### Creator Editor (/creator/storefront)
- [ ] Creator can create a new storefront (upsert — insert if none exists).
- [ ] Creator can edit existing storefront (upsert — update).
- [ ] Slug validated: 3-30 chars, lowercase alphanumeric + hyphens, starts/ends with letter/number.
- [ ] Reserved slugs rejected at server action level (clear error message).
- [ ] Reserved slugs rejected at DB level (CHECK constraint — safety net).
- [ ] Duplicate slug rejected with "already taken" error.
- [ ] Slug availability check (debounced) shows available/taken indicator.

### Write-Time Validation (JSONB)
- [ ] platform_links: HTTPS only, domain allowlist (instagram/youtube/twitter/linkedin/tiktok). Non-HTTPS rejected.
- [ ] platform_links: max 10 entries.
- [ ] content_items: links must be HTTPS from allowed domains. Max 20 entries.
- [ ] content_items[].image_path: must start with 'storefront/' and not contain '..'. Arbitrary paths rejected.
- [ ] portrait_path: same storage path validation as image_path.
- [ ] stats.followers: non-negative integer. Negative or float rejected.
- [ ] stats.avg_views: non-negative integer.
- [ ] stats.engagement_rate: 0-100. Out-of-range rejected.
- [ ] stats: no unexpected keys accepted.
- [ ] categories: max 10, non-empty strings.

### Dashboard Storefront Card
- [ ] No storefront row: card shows "Set up your Storefront" with explainer, links to /creator/storefront.
- [ ] Exists but is_published = false: card shows "Your Storefront isn't live yet" with Edit button.
- [ ] Published: card shows live URL (guapd.com/c/{slug}), Copy link button, View link (opens /c/{slug}), Edit link.
- [ ] Copy link produces the full absolute URL (https://guapd.com/c/{slug}).
- [ ] Copy link works on mobile web (fallback execCommand for insecure contexts).

### Creator Nav
- [ ] "Storefront" appears in the creator sidebar navigation, links to /creator/storefront.

### Slug Picker
- [ ] Slug field is the first and most prominent section of the editor.
- [ ] Live URL preview: "guapd.com/c/" prefix visually distinct from editable input.
- [ ] Pre-filled from creator name on first visit (no existing storefront).
- [ ] Live availability check (debounced 400ms) — server action, not client guess.
- [ ] Validation messages are specific:
  - [ ] Too short/long: "3-30 characters"
  - [ ] Bad characters: "Letters, numbers and hyphens only"
  - [ ] Reserved word: "This URL isn't available"
  - [ ] Taken: "Someone already has this one"
- [ ] Available state: green check + "Available" text.
- [ ] Immutability warning shown BEFORE publish: "Once you publish, guapd.com/c/{slug} becomes permanent and can't be changed."
- [ ] After publish: slug field becomes read-only with explanation. Copy link button appears next to it.
- [ ] Slug immutability enforced server-side: upsertStorefront rejects slug change when is_published = true.
- [ ] Race condition: two sessions claim same slug simultaneously — one succeeds, one gets clean "already taken" error (DB unique constraint).
- [ ] Client-side validation bypassed (direct server action call) — still rejected by server validation.
- [ ] Slug change attempted after publish via direct server action call — rejected with clear error.

### Editor Creates Row on First Save
- [ ] No separate "create" step — editor saves via upsert (insert if no row, update if exists).
- [ ] First save creates the storefront row with the chosen slug.
- [ ] Publish is a deliberate checkbox action, not a side effect of saving.

### Rate Limiting (GAP — noted, fix before first storefront goes public)
- [ ] KNOWN GAP: in-memory rate limiting doesn't work on serverless (instances don't share memory). Currently using 60s ISR cache only. Need @vercel/edge rate-limit or Supabase-backed counter before storefronts go public.

---

## 10. Fee Resolution at Deal Creation

### Three-tier resolution order
- [ ] No pair rate, no per-deal override: fee_percent = brand's platform_fee_percent.
- [ ] Pair rate exists, no per-deal override: fee_percent = pair rate's fee_pct.
- [ ] Both pair rate and per-deal override set: fee_percent = per-deal override (override wins).
- [ ] Per-deal override set, no pair rate: fee_percent = per-deal override.
- [ ] A different creator on the same brand (no pair rate for them): fee_percent = brand's standard rate.

### Snapshot immutability
- [ ] Changing the brand's platform_fee_percent afterwards does NOT alter existing deals' fee_percent.
- [ ] Changing a pair rate afterwards does NOT alter existing deals' fee_percent — only future deals move.
- [ ] Two deals on the same brand, one with pair rate one without: each holds its own snapshotted rate.

### Creator net amount display (all three surfaces)
- [ ] Creator deal page (`/creator/deals/[id]`): "You receive" shows net amount computed from snapshotted fee_percent (not brand rate).
- [ ] Web accept-page (`/offer/[token]`): offer card shows net amount using deal's fee_percent.
- [ ] Invoice card (creator side): creator_receives_paise computed from the deal's snapshotted fee, not recomputed from brand.

### Invoice and payment path
- [ ] generateInvoice reads fee_percent and fee_mode from the deal — snapshot is the source of truth.
- [ ] Invoice brand_pays_paise and creator_receives_paise match the deal's snapshotted fee (not the brand's current rate).
- [ ] mark_deal_paid (Postgres function) does not touch fee — transitions invoice/deal status only.

> Per-deal fee exception tests (setDealFeeOverride action, UI) are in Section 11 — Ops Portal.

---

## 12. Brand-Creator Pair Rates

### Setting and updating
- [ ] Setting a pair rate: brand_creator_rates row created with fee_pct, reason, set_by.
- [ ] Updating a pair rate: existing row updated (not duplicated). UNIQUE(brand_id, creator_id) constraint holds.
- [ ] Removing a pair rate: row deleted. Future deals for this pair fall back to brand standard rate.
- [ ] Fee percent must be 0–100 — negative or >100 rejected.
- [ ] Reason is required — empty reason rejected server-side.

### Audit trail
- [ ] Setting a pair rate writes an ops_events entry with action, actor, brand_id, creator_id, reason, after fee_pct.
- [ ] Updating a pair rate writes an ops_events entry with before/after fee_pct.
- [ ] Removing a pair rate writes an ops_events entry with before fee_pct.

### Access control / RLS
- [ ] Brands cannot read brand_creator_rates (deny-all RLS policy).
- [ ] Creators cannot read brand_creator_rates (deny-all RLS policy).
- [ ] Authenticated non-ops user: SELECT on brand_creator_rates returns 0 rows.
- [ ] Only ops (setBrandCreatorRate action, verifyOpsAccess) can write pair rates.
- [ ] /ops/api/brands returns 403 for non-ops users.

### Ops UI (creator detail page, Fee Rates tab)
- [ ] Existing pair rates listed with brand name, pair rate %, standard rate %, reason, set_by, date.
- [ ] Edit button opens inline form pre-filled with existing values.
- [ ] Add button opens form with brand picker (fetched from /ops/api/brands).
- [ ] Clearing the fee field and submitting removes the pair rate.
- [ ] Preview text shows what new deals will use.

---

## 11. Ops Portal

### Access control
- [ ] Non-allowlisted email: blocked at layout (sees access-denied UI, not ops console).
- [ ] Non-allowlisted email: blocked at each page (deals, deals/[id], offers, creators, creators/new, creators/[id], creators/[id]/edit, brands, brands/[id]/edit, access).
- [ ] Non-allowlisted email: every server action (addCreator, editCreator, vetCreator, rejectCreator, deleteCreator, addProduct, editProduct, approveBrand, rejectBrand, editBrand, setDealFeeOverride, setBrandCreatorRate, generateOfferLink) returns "Not authorized".
- [ ] Removed address (projectinfluencer2026@gmail.com) is denied at layout and actions.
- [ ] contact@guapd.com is granted access.
- [ ] Unset/empty OPS_ALLOWED_EMAILS denies all (fails closed).

### Audit trail
- [ ] Every ops write produces a correctly attributed ops_events entry (actor_email, actor_auth_id, action, target_table, target_id, detail).
- [ ] vetCreator/rejectCreator: detail includes before/after is_vetted, is_rejected.
- [ ] approveBrand/rejectBrand: detail includes before/after brand_status.
- [ ] editBrand: detail includes before/after platform_fee_percent, fee_mode.
- [ ] setDealFeeOverride: detail includes before/after fee_percent + fee_pct_override + reason.
- [ ] setDealFeeOverride: ALSO writes a deal-scoped events entry (deal.fee_override) visible in deal timeline.
- [ ] deleteCreator: audit entry written BEFORE the delete (so the row ID is recorded).
- [ ] Audit write failure surfaces as an error to the ops user (not silently swallowed).

### Fee override (ops UI)
- [ ] Fee override form visible on ops deal detail page for negotiating deals.
- [ ] Fee override form shows immutability message for non-negotiating deals.
- [ ] Reason field is required — empty reason rejected server-side.
- [ ] Override set pre-acceptance: deal snapshot uses the override; brand's own rate unchanged.
- [ ] Two deals on same brand, one overridden — each holds its own snapshotted rate.
- [ ] Brand's rate changed afterwards: neither existing deal moves.
- [ ] Override attempted AFTER creator acceptance: rejected server-side (call action directly, not just UI).
- [ ] Overridden deal: invoice total and mark_deal_paid both use snapshotted fee, not recomputed brand rate.
- [ ] Creator's net amount matches the snapshot on offer card, web accept-page, and creator deal page.
- [ ] Override produces both ops_events entry (actor + reason) and deal timeline event.
- [ ] Brands and creators cannot read fee_pct_override through the app or the API.
- [ ] Clearing override (empty input) restores brand's current rate.

### RLS — ops_events
- [ ] Authenticated user (non-ops): SELECT on ops_events returns 0 rows.
- [ ] Anon: SELECT on ops_events returns 0 rows.
- [ ] Ops reads ops_events via service-role only.

---

## CRITICAL: Security / RLS Checks

> Run these after ANY change to queries, auth, or a new client.
> A failure here is a data breach — treat as P0.

### Anon Access (no auth)
- [ ] Anon gets 0 rows from: creators, creator_products, invoices, deal_deliverable_items, phone_verifications, notifications, campaigns, campaign_drafts.
- [ ] Creator phone number NOT exposed in any anon-reachable query.

### Cross-Creator Isolation
- [ ] Creator A cannot see Creator B's deals.
- [ ] Creator A cannot see Creator B's invoices.
- [ ] Creator A cannot see Creator B's products.
- [ ] Creator A cannot see Creator B's payments.
- [ ] Creator A cannot see Creator B's notifications.

### Cross-Brand Isolation
- [ ] Brand A cannot see Brand B's deals.
- [ ] Brand A cannot see Brand B's campaigns.
- [ ] Brand A cannot see Brand B's campaign_drafts.
- [ ] Brand A cannot see Brand B's campaign brief.

### Notification Write Isolation
- [ ] User can only update their OWN notification's read_at (WITH CHECK policy).
- [ ] User cannot modify another user's notifications.
- [ ] User cannot change fields other than read_at.

### Invoice Write Isolation (MONEY TABLE)
- [ ] Only CREATOR can INSERT an invoice (brand INSERT attempt rejected by RLS).
- [ ] Creator can UPDATE their own deal's invoice (draft → issued).
- [ ] Brand can UPDATE their deal's invoice (issued → accepted).
- [ ] Creator A cannot insert/update an invoice on Creator B's deal.
- [ ] Brand A cannot insert/update an invoice on Brand B's deal.
- [ ] No stale/duplicate invoice policies in DB (run: `SELECT policyname FROM pg_policies WHERE tablename='invoices'` — expect exactly: invoices_read, invoices_insert_creator, invoices_update_creator, invoices_update_brand, invoices_deny_delete).

### Action Ownership Guards
- [ ] mark_deal_paid: only the deal's BRAND can call it. Creator rejected. Other brand rejected.
- [ ] Request revision: only the deal's brand can request.
- [ ] Submit deliverable: only the deal's creator can submit.

### Storage / Upload Isolation
- [ ] A creator's uploaded file is NOT reachable by a non-party (no public URL).
- [ ] getSignedUrl rejects non-party requests.
- [ ] A creator cannot upload into another creator's deal path.

### Campaign Brief Isolation
- [ ] Creator sees ONLY brief fields (pitch, guidelines) via server action — NOT the campaign's budget, drafts, other creators, or prices.
- [ ] No creator row-level read policy on campaigns table.
- [ ] getCampaignBriefForCreator uses admin client with explicit 3-field select (name, brief_pitch, brief_guidelines).

### Team Management
- [ ] Admin can invite a new member by email (createInvite returns invite URL).
- [ ] Non-admin cannot invite (server returns "Only admins can invite team members").
- [ ] Invite creates a pending invite with crypto-random 64-char hex token.
- [ ] Duplicate invite for same email+brand returns existing active link (no new row).
- [ ] Re-invite after expiry/revocation creates a new invite (partial unique index allows it).
- [ ] Stale pending invites (past expires_at) are marked expired before new invite insert.
- [ ] Invite link (/invite/{token}) shows brand name and "Sign in with Google".
- [ ] Unauthenticated user on invite link → Google login → returns to /invite/{token} via next param.
- [ ] Email mismatch: user signed in as wrong email → clear error, not attached.
- [ ] Already-belongs-to-another-brand → blocked with clear message, not attached.
- [ ] Already a member of THIS brand → redirected to /deals (idempotent).
- [ ] Expired invite (>7 days) → clear error message, status set to 'expired'.
- [ ] Revoked invite → clear error message.
- [ ] Used/accepted invite → clear error message.
- [ ] Accepted invite attaches user to CORRECT brand (brand_id from invite record) as is_admin=false.
- [ ] Accepted invite sets invite status to 'accepted' + accepted_by.
- [ ] Admin can remove a team member.
- [ ] Admin can toggle member role (admin ↔ member).
- [ ] Cannot remove the last admin (server-enforced).
- [ ] Cannot demote the last admin (server-enforced, including self-demote).
- [ ] Non-admin cannot remove/toggle/revoke (server-enforced, not just UI).
- [ ] New member sees all existing brand deals/campaigns/invoices immediately (brand-scoped RLS).
- [ ] Non-admin sees team list read-only (no invite/remove/toggle controls).
- [ ] Pending invites shown only to admins in UI (not to members).
- [ ] Auth callback next param: only accepts paths starting with / (no // or external URLs).

### Cross-Brand Security (Team)
- [ ] Invite token from Brand A cannot attach a user to Brand B (brand_id comes from invite, not user input).
- [ ] Member of Brand A cannot see Brand B's invites (brand_invites RLS: brand_id = my_brand_id()).
- [ ] Accept-invite for Brand A doesn't leak Brand B data.
- [ ] One-brand-per-user enforced: user with brand_members row blocked from accepting any invite.

### Storefront RLS + Anonymous Access
- [ ] Anonymous caller: get_public_storefront(slug) returns whitelisted JSON only — no creator_id, no phone, no handle.
- [ ] Anonymous caller: direct SELECT on creator_storefronts returns 0 rows (no anon read policy).
- [ ] Anonymous caller: direct SELECT on creators returns 0 rows (existing policy requires auth).
- [ ] Creator A cannot read Creator B's storefront via RLS (only own via my_creator_id()).
- [ ] Creator A cannot update Creator B's storefront (UPDATE policy scoped to my_creator_id()).
- [ ] No DELETE allowed on creator_storefronts (deny_delete policy).
- [ ] get_public_storefront: returns NULL for unpublished storefront (no data leak).
- [ ] get_public_storefront: returns NULL for unvetted creator (no data leak).
- [ ] Pitch panel: slug → creator_id resolution is server-side only (admin client). Creator_id never exposed to anonymous/brand client.
- [ ] brands.allow_public_attribution default false — new brands don't auto-appear on storefronts.
- [ ] Verify: no broad PERMISSIVE anon policy added to creators or deals tables (permissive-OR would widen access).

### BUT-DID-IT-BREAK Checks (locking too hard)
- [ ] Authenticated brand still sees vetted creators on /browse (minus phone).
- [ ] Authenticated brand can still create deals with vetted creators.
- [ ] Creator still sees their OWN deals, invoices, products, notifications.
- [ ] Creator still sees their OWN deliverable items and uploaded files.

---

## 13. Legal Pages, Cookie Consent & Analytics

### Privacy Policy + Terms of Service
- [ ] `/privacy` loads unauthenticated — renders full privacy policy with Nav (public marketing nav, no app shell) and Footer.
- [ ] `/terms` loads unauthenticated — renders full terms of service with Nav and Footer.
- [ ] Both pages are server components (no client-side data fetching).
- [ ] Footer on `/privacy` and `/terms` includes links to Privacy Policy, Terms, and Cookie preferences.

### Footer Legal Links
- [ ] Public pages (`/`, `/brands`, `/creators`, `/privacy`, `/terms`) render Footer with `/privacy` and `/terms` links.
- [ ] `/privacy` link navigates to the privacy policy page.
- [ ] `/terms` link navigates to the terms of service page.
- [ ] "Cookie preferences" link in footer clears consent and re-shows the cookie banner.
- [ ] Authenticated app-shell pages (deals, dashboard, creator, campaigns) do NOT have the marketing Footer (by design — app nav pattern). Legal pages are accessible by direct URL.
- [ ] Storefront `/c/[slug]` has its own "Powered by Guapd" footer; PitchPanel links to `/terms` and `/privacy` inline.

### Signup Terms Checkbox
- [ ] Brand onboarding (`/onboarding`): terms checkbox required — form submit blocked without it.
- [ ] Brand onboarding: checkbox label links to `/terms` and `/privacy` (open in new tab).
- [ ] Brand onboarding: server action validates `terms_accepted` — rejects if false/missing.
- [ ] Brand onboarding: on success, `users.terms_accepted_at` is set to current timestamp, `users.terms_version` is set to `'2026-07-23'`.
- [ ] Creator signup (`/signup/creator`): terms checkbox required — submit blocked without it.
- [ ] Creator signup: checkbox label links to `/terms` and `/privacy`.
- [ ] Creator signup: server action writes `terms_accepted_at` and `terms_version` on users row.

### Brand Auth (Email+Password + Google)
- [ ] Brand signup via email+password: creates auth user, sends confirmation email.
- [ ] Brand login via email+password: session established, redirects to `/deals` (or `/onboarding` if no brand yet).
- [ ] Brand login via Google OAuth: unchanged, still works.
- [ ] **Both auth methods produce identical account state**: `users` row with `auth_id`, `email`, `role: 'brand_member'` — via shared `ensureBrandUserRow()`.
- [ ] Wrong password → "Invalid email or password" (no email enumeration).
- [ ] Unconfirmed email → "Please confirm your email first."
- [ ] Password reset sends email (or shows success message regardless, to prevent enumeration).
- [ ] Password minimum: 8 characters enforced client-side; Supabase enforces server-side.

### Brand Deal Emails (Resend)

> Brand-only by design — creators are notified by WhatsApp and must NEVER
> receive these. Channel is chosen by role in `notifyDealParty`: an `email`
> spec passed for `'creator'` is ignored, a `whatsapp` spec for `'brand'` is
> ignored.
>
> **Env:** `RESEND_API_KEY`, `EMAIL_FROM`, optional `EMAIL_REPLY_TO`
> (intentionally UNSET — see below), and the opt-in switch `EMAIL_ENABLED`
> (must be exactly `'true'`). **Keep it OFF locally** — `.env.local` points at
> the shared Supabase project holding real brand addresses.

**Event → email (7 types, 11 call sites)**
- [ ] Creator accepts → "accepted your offer", amount = deal value. Fires from BOTH `creator/deals/[id]/actions.ts` and the web offer page `offer/[token]/actions.ts`.
- [ ] Creator declines → "declined your offer", NO amount. Both paths.
- [ ] Creator counters → "sent a counter offer", amount = **countered total** (not the deal's stored price, which is unchanged at that point).
- [ ] Creator submits deliverables → "submitted deliverables for review", no amount. Both the item flow (`submitForReview`) and file flow (`submitDeliverable`).
- [ ] Creator posts content → "posted the content", no amount. Both paths.
- [ ] Creator issues invoice → "sent you an invoice", amount = amount due.
- [ ] Creator sends payment reminder → "is waiting on payment", amount from the INVOICE (`brand_pays_paise`), which can include revision overage the deal price doesn't carry.
- [ ] `shipping_address_submitted` sends NO email (deferred by scope) but still writes its in-app row.

**Recipients — a brand is a team**
- [ ] ALL brand members receive the in-app notification (one row each) AND the email (single Resend call, all addresses).
- [ ] Regression: previously `.limit(1).single()` with no `ORDER BY` notified exactly ONE non-deterministically chosen member.
- [ ] **Single-member brand still works** — one row, one recipient.
- [ ] A member with a null/malformed `users.email` still gets the in-app row; only their address is skipped, and it's logged. One bad address must not suppress the others.
- [ ] Brand with no usable emails at all → `reason=no_brand_member_emails`, logged, in-app rows still written.

**Amounts — brands see what they PAY**
- [ ] Amounts are gross (`calculateFee(...).brand_pays_paise`), never `creator_receives_paise`. With `fee_mode: 'deducted'` the brand's figure is HIGHER than the creator's WhatsApp figure for the same deal — verify both on one deal.
- [ ] Computed once in `notifyDealParty` (`ctx.brandPaysPaise` / `ctx.brandPaysFor`) so no call site re-derives it.

**Template**
- [ ] Table layout, inline styles, no `<style>` block (Gmail strips it), no remote images (clients block them).
- [ ] Plain-text alternative always present.
- [ ] CTA links to **`/deals/{id}`** — the BRAND route. `/creator/deals/{id}` would bounce a brand user to creator login.
- [ ] Brand-authored deal titles are HTML-escaped (`<script>` renders as text, not markup).
- [ ] Footer says "This is an automated notification — manage this deal in your dashboard at guapd.com" and does NOT invite replies.
- [ ] `reply_to` is omitted entirely; replies fall back to the From address.

**Failure isolation**
- [ ] Resend 500 → deal action still SUCCEEDS, in-app rows intact, error logged.
- [ ] Resend 200 with `{name:"validation_error"}` and no `id` → treated as failure (status code alone is not a success signal).
- [ ] Resend hangs → aborts at ~4s; deal action still succeeds.
- [ ] Missing/invalid `RESEND_API_KEY` → no throw.
- [ ] **NO silent failure paths** — every non-ok return logs via `fail()` first. Regression-check `not_configured`, `no_valid_recipients`, `empty_content`.
- [ ] API key and full addresses never logged (addresses masked as `fo*****@acme.com`).

**Dedupe + rate limiting**
- [ ] `Idempotency-Key` is the notification row UUID — a replayed send delivers once. Two genuinely distinct events still send two emails (two counter-offers = two emails).
- [ ] **Payment reminder cooldown is SERVER-side**: a second reminder on the same deal within 24h is refused with a clear message. Regression: the only previous guard was `remindedIds` React state, which reset on refresh — unbounded once it emails.
- [ ] Existing state guards still hold (`res.already` on payment, conditional-update row counts on approve).

**Kill switch**
- [ ] `EMAIL_ENABLED` unset or not exactly `'true'` → **zero HTTP requests** to Resend (verify no call is made at all, not merely that it fails).
- [ ] Creators never receive brand emails, on any event.

### WhatsApp Notifications (MSG91)

> Creator-only by design — brands are never sent WhatsApp. Four event-triggered
> templates; the two scheduled ones (deliverable_reminder, deliverable_overdue)
> are a separate cron task and are NOT wired.
>
> **Env:** `MSG91_AUTH_KEY`, `MSG91_WHATSAPP_NUMBER`, `MSG91_WHATSAPP_LANG`
> (must match the approved template language exactly), optional
> `MSG91_WHATSAPP_NAMESPACE`, `MSG91_WHATSAPP_URL`, and the opt-in switch
> `MSG91_WHATSAPP_ENABLED` (must be exactly `'true'`; anything else = no sends).
> **Keep the switch OFF on staging** so testing never messages a real creator.

**Event → template → variables**
- [ ] Brand sends offer (`/deals` builder) → `new_offer_received`; body = creator name, brand name, amount; button = **offer TOKEN**.
- [ ] Storefront pitch (`/c/{slug}`) → same `new_offer_received`; amount reads "Amount to be discussed" (pitch inserts `price_paise: 0`, so "₹0" would be misleading).
- [ ] Brand requests revision → `revision_requested`; body = creator, brand, deal label; button = deal UUID.
- [ ] Payment marked paid → `payment_released`; body = creator, amount, deal label; button = deal UUID.
- [ ] All items approved → `deliverables_approved`; body = creator, deal label; button = deal UUID.

**Deal label (`buildDealLabel`)** — creators don't recognise `GD-1056`, and brand-authored titles are unbounded free text, so messages carry both:
- [ ] Title + ref → `Test WA again (GD-1056)`.
- [ ] Title longer than 40 chars is truncated with an ellipsis before the ref.
- [ ] Newlines/repeated whitespace in a title are collapsed — WhatsApp REJECTS parameters containing newlines.
- [ ] Missing ref → title alone; missing title → ref alone; both missing → `your deal` (never blank; WhatsApp rejects empty parameters).

**Button value — the link must actually open**
- [ ] `new_offer_received` button value is an HMAC token that resolves at `/offer/{token}`; pasting it after the base gives a working offer page. A deal UUID here would NOT authorize — regression-check this specifically.
- [ ] The other three button values are bare deal UUIDs resolving at `/creator/deals/{id}`.
- [ ] Button value is the SUFFIX ONLY — never a full URL (the base is baked into the approved template; a full URL would double the base).
- [ ] Offer token TTL is 7 days — a `new_offer_received` button tapped on day 8 shows "Link invalid or expired". **Any future offer-reminder template must mint a fresh token, not reuse a stored link.**

**Amounts (creator sees net, not gross)**
- [ ] `fee_mode: 'deducted'` → `new_offer_received` amount equals `creator_receives_paise`, NOT `price_paise`.
- [ ] `payment_released` amount equals `invoices.creator_receives_paise`.
- [ ] Formatting is Indian grouping via `lib/money.ts` (₹60,000; ₹12,50,000). Raw paise never appear in a message.

**Failure isolation — the critical property**
- [ ] MSG91 returns HTTP 500 → deal action still SUCCEEDS; in-app notification still created; error logged.
- [ ] MSG91 returns HTTP 200 with `{"type":"error"}` → treated as failure (status code alone is not a success signal); deal action still succeeds.
- [ ] MSG91 returns HTTP 200 with `{"status":"error","hasError":true}` → ALSO treated as failure. This is the LIVE response shape; the original code only checked `type`, which is absent from real responses, so error bodies were logged as successes.
- [ ] **`✓ accepted` means QUEUED, not delivered.** MSG91 validates the template only after queuing, so a wrong template name or language returns `hasError:false` and fails later. Confirm delivery on the handset or in MSG91's delivery report — never from our log alone.
- [ ] Wrong `MSG91_WHATSAPP_LANG` (template approved as `en_GB`/`en_US`, sent as `en`) → MSG91 accepts, delivery report says "template name does not exist in {lang}". Known trap: costs a real message to discover.
- [ ] Recipient country must be unblocked in the MSG91 account — a blocked country code fails at delivery, not at the API call.
- [ ] MSG91 hangs → send aborts at ~4s; deal action still succeeds.
- [ ] Missing/invalid `MSG91_AUTH_KEY` → no throw, deal action succeeds.
- [ ] Creator has NULL phone → send skipped + logged; in-app notification still fires.
- [ ] **International recipients are supported.** A `+44`/`+1`/`+61` number normalises and sends — WhatsApp is global and MSG91 delivers internationally. An India-only rule silently dropped every foreign number, including founders' own numbers during testing.
- [ ] Bare 10-digit number (no `+`) still assumes India → `91XXXXXXXXXX`; trunk-prefixed `0XXXXXXXXXX` likewise.
- [ ] Junk input (`123`, empty, non-numeric) → skipped with `reason=unusable_phone`, logged not silent.
- [ ] **NO failure path is silent.** Every non-ok return routes through `fail()` and logs before returning. Regression-check `unusable_phone`, `empty_body_var`, `not_configured` specifically — all three originally returned with no log at all, so three triggered events produced no message and no trace.
- [ ] The dispatch site logs the send result rather than discarding it.
- [ ] Creator is an unclaimed ops stub (no `users` row) → no in-app row is possible, but WhatsApp still fires (it is their only channel for a first offer).
- [ ] Auth key, recipient phone, and message variables never appear in logs.

**Dedupe — one event, one message**
- [ ] Approving items one by one fires exactly ONE `deliverables_approved` (gated on the real `delivered/revision → approved` transition).
- [ ] Requesting revision on 3 items in one round fires exactly ONE `revision_requested` (gated on the actual transition into `revision`; the in-app notification remains per-item).
- [ ] Calling `markAsPaid` twice fires exactly ONE `payment_released` (`mark_deal_paid` returns `already`).

**Kill switch**
- [ ] `MSG91_WHATSAPP_ENABLED` unset or not exactly `'true'` → zero HTTP requests to MSG91 (verify no outbound call is made at all, not merely that it fails).
- [ ] Controlled first live test goes to a founder's own number before any real creator.

### Creator Deep Links Through Login (WhatsApp notification return path)

> WhatsApp opens links in its own in-app browser with a separate cookie jar, so a
> creator tapping a deal notification is normally LOGGED OUT. Five of the six
> creator templates (revision requested, payment released, deliverables approved,
> deliverable reminder, overdue) point at `/creator/deals/{id}` — if the
> destination is not preserved through login they all land on the deals list.

- [ ] Logged-out creator opens `https://guapd.com/creator/deals/{id}` → 307 to `/login/creator?next=%2Fcreator%2Fdeals%2F{id}` (destination preserved, URL-encoded).
- [ ] Signs in via **phone OTP** → lands on THAT deal, not the deals list.
- [ ] Signs in via **Google** → lands on THAT deal, not the deals list.
- [ ] Already-signed-in creator opening `/login/creator?next=/creator/deals/{id}` is sent straight to that deal.
- [ ] `next` survives the whole chain: page → `/login/creator` → OAuth → `/auth/creator/callback` → deal page.
- [ ] Other creator routes preserve destination too (`/creator/payments`, `/creator/inbox`, `/creator/notifications`) — the `/creator` layout gate supplies `next` from the `x-pathname` middleware header.
- [ ] Creator with NO destination (direct visit to `/login/creator`) still defaults to `/creator/deals`.
- [ ] **Offer flow unchanged**: `/offer/{token}` still renders publicly with NO login redirect; sign-in from the offer card still returns to `/offer/{token}`; tampered token still shows "Link invalid or expired".
- [ ] Session refresh still works while signed in (middleware now rewrites request headers — confirm no silent sign-outs after the access token expires).

**SECURITY — open redirect (`lib/safe-next.ts`):** each of these must fall back to `/creator/deals` and never leave guapd.com:
- [ ] `?next=https://evil.com` (absolute URL)
- [ ] `?next=//evil.com` (protocol-relative)
- [ ] `?next=/\evil.com` (backslash — browsers normalise to `//`)
- [ ] `?next=///evil.com`
- [ ] `?next=javascript:alert(1)`
- [ ] Same validation enforced on `/auth/creator/callback?next=...` (attacker-reachable via the OAuth redirect URL).
- [ ] Phone-OTP `next` is re-validated **server-side** in `verifyAndSignIn` — a tampered client value cannot redirect off-site.

### Password Reset — completion (brand only)

> Creators are unaffected: they log in with phone+OTP and their password is a
> random internal value rotated on every login. The "Forgot password?" link
> exists only on the brand `/login`.
>
> **Requires two Supabase dashboard settings** — `/auth/confirm` on the redirect
> allowlist, and the Reset Password email template sending `{{ .TokenHash }}`.
> Without both, the link fails before reaching the app.

**Happy path**
- [ ] `/login` → "Forgot password?" → email arrives with a link to `/auth/confirm?token_hash=…&type=recovery&next=/reset-password`.
- [ ] Clicking it lands on `/reset-password` showing the account's email, NOT on `/deals`.
- [ ] Setting a valid password succeeds; success screen offers "Go to login".
- [ ] **New password works; old password is rejected.** (The original bug was a silent no-op — verify the change actually took.)

**CROSS-DEVICE — the reason for the token_hash flow**
- [ ] Request the reset on desktop, open the email on a **phone** → works. Under the old `/auth/callback` PKCE code flow this fails ("both auth code and code verifier should be non-empty") because the code_verifier cookie lives in the requesting browser.

**Guards — form must NOT render, and the action must refuse**
- [ ] `/reset-password` with no session → "This link is no longer valid".
- [ ] `/reset-password` with a forged `guapd_pw_recovery` cookie but no session → refused.
- [ ] `/reset-password` while signed in NORMALLY (no recovery marker) → refused. Prevents someone at an unattended signed-in browser changing the password without knowing the current one.
- [ ] Calling the `setNewPassword` server action directly without the marker → `expired`. The page render is not the security gate; the action re-checks.
- [ ] Expired, already-used, and tampered tokens all show the SAME message — never reveal which, or whether the account exists.

**Token handling**
- [ ] Token is single-use: clicking the same link twice fails the second time (`verifyOtp` consumes it).
- [ ] Recovery marker cookie is `httpOnly` (not readable by page scripts) and expires in 15 min.
- [ ] Marker is cleared after a successful change — one link, one password change.

**Validation (shared `lib/password.ts`, client AND server)**
- [ ] Under 8 chars rejected; mismatched confirmation rejected; both enforced server-side even if the client check is bypassed.
- [ ] Signup and reset report identical messages — they call the same validator.

**Session revocation + success CTA**
- [ ] ALL sessions are revoked on success, including the current device (`scope: 'global'`). Sign in on a second browser first, then reset — both sessions are dead.
- [ ] Success screen's "Go to login" lands on `/login` and **renders the login form**. Regression: while only *other* sessions were revoked, the user stayed authenticated, so `/login` (login/page.tsx:19-42 redirects authenticated users) bounced them to `/deals` or `/ops` and the CTA looked broken.
- [ ] The CTA is a real `<a href>` doing a FULL page load, not `router.push` — the client router cache still holds the pre-signout authenticated RSC payload, so a soft navigation can render stale state.
- [ ] If revocation fails, the password change still reports success (it did change) and the failure is logged.

**REGRESSION — `/auth/callback` must be untouched**
- [ ] Brand Google OAuth still works.
- [ ] Brand signup email confirmation still works.
- [ ] Creator Google sign-in from `/offer/{token}` still works and still returns to the offer.
- [ ] `/auth/confirm` refuses non-recovery types (`type=signup` → `/login?error=unsupported_link_type`), so it cannot become an alternative way to establish a session.

### Login Feedback + Double-Submit Guard
- [ ] Brand email+password: button shows "Please wait..." and is disabled during login; double-click does not fire two attempts.
- [ ] Brand Google OAuth: button shows "Redirecting to Google..." and is disabled; double-click blocked.
- [ ] Creator OTP send: button shows "Sending..." and is disabled.
- [ ] Creator OTP verify: button shows "Verifying..." / "Signing in..." and is disabled.
- [ ] Creator Google OAuth: button shows "Redirecting to Google..." and is disabled.
- [ ] On auth error, button re-enables and error message is displayed.
- [ ] Brand deals page (`/deals`) shows loading skeleton during data fetch (no blank screen).

### Cookie Consent Banner
- [ ] Cookie banner appears on first visit (no prior consent in localStorage).
- [ ] Cookie banner appears on `/c/[slug]` storefront pages (first visit).
- [ ] "Accept" sets `localStorage.guapd_analytics_consent = 'granted'`, dismisses banner.
- [ ] "Decline" sets `localStorage.guapd_analytics_consent = 'denied'`, dismisses banner.
- [ ] Banner does NOT re-appear after choice is made (persists across page loads).
- [ ] "Cookie preferences" in footer clears localStorage consent value and re-shows banner.
- [ ] Banner includes link to `/privacy`.

### PostHog / Analytics Consent Gating
- [ ] No PostHog network calls before consent is granted (check Network tab — no `posthog` requests on first load).
- [ ] After "Accept": PostHog initializes, `window.__posthog` is set, `trackEvent()` calls fire.
- [ ] After "Decline": PostHog does NOT initialize, `window.__posthog` is undefined, `trackEvent()` is a no-op.
- [ ] Choice persists across page reloads — PostHog state matches stored consent without re-prompting.
- [ ] Revoking consent via footer "Cookie preferences" → page reloads automatically and PostHog is fully gone. posthog-js cannot unload in-page, so the reload is the teardown, not a convenience.

### Session Replay Masking (verify in a REAL recording, not just config)

> Replay masks INPUTS by default but NOT text. Config alone is not evidence —
> open an actual recording in PostHog and look.

- [ ] Password fields on `/login` and `/reset-password` show masked, never the typed value.
- [ ] Creator OTP input (`PhoneLogin`) is masked — it's `type="text"` with `inputMode="numeric"`, so it relies on `maskAllInputs`, not on being a password field. **Highest-risk field; check first.**
- [ ] Email and phone inputs masked (`maskInputOptions.email/tel`).
- [ ] `data-ph-mask` surfaces are hidden in replay: `/ops` creator phone (list + detail), team member emails, brand/creator sidebar signed-in email.
- [ ] Deal amounts on brand/creator deal pages — decide whether these need masking too; currently NOT masked.
- [ ] No replay recorded at all before consent.

### User Identification
- [ ] `identify()` is called with the `users.id` UUID — never an email, phone, or name. Check the person's distinct ID in PostHog is a UUID.
- [ ] Brand identified via `BrandNav`, creator via `/creator` layout, each once per session.
- [ ] `reset()` fires on sign-out — sign out, sign in as a different user, confirm events do NOT attach to the previous person.
- [ ] Anonymous pre-signup events merge onto the person on identify (this is what preserves first-touch attribution).

### Acquisition / First-Touch Attribution
- [ ] Land with `?utm_source=x&utm_medium=y&utm_campaign=z`, accept consent → UTMs appear on the event.
- [ ] `$initial_utm_source` is set as a PERSON property and does NOT change on later visits from a different source.
- [ ] First-touch survives signup: land via UTM → sign up → the person retains the original `$initial_utm_*`.
- [ ] Referrer captured automatically (`$referrer` / `$initial_referrer`).
- [ ] A user who DECLINES consent has no attribution at all — expected, not a bug.

### Pageviews (App Router)
- [ ] Exactly ONE `$pageview` on first load — `capture_pageview: false` plus a manual capture in init; verify it isn't double-counted.
- [ ] Client-side navigation between routes emits a new `$pageview`. Without this every funnel would show one pageview per session.
- [ ] No `$pageview` before consent.

### Deal Lifecycle Events (client-side by design)
> Fired from the CLIENT after the server action returns, never server-side:
> consent lives in the browser, so a server-side capture could not know whether
> it was granted. Trade-off accepted: an event is lost if the user navigates away
> mid-action.

- [ ] `offer_sent` on deal creation, with `price_bucket` (a RANGE, never exact paise), `deal_number`, `repeat_creator`.
- [ ] `deal_2_started` fires from the brand's 2nd deal onward, carrying `deal_number`; filter `deal_number === 2` for the strict cohort.
- [ ] `offer_accepted` / `offer_declined` fire from BOTH surfaces, tagged `surface: 'app'` vs `surface: 'web'` (the no-download doorway).
- [ ] `offer_countered` with item count.
- [ ] `deliverable_submitted` from both flows, tagged `flow: 'items'` vs `flow: 'file'`.
- [ ] `deliverable_approved` on brand approval.
- [ ] `payment_released` AND `deal_completed` both fire on payment (one transaction completes the deal).
- [ ] `brand_signed_up`, `creator_onboarded`.
- [ ] **No event carries PII** — inspect properties: no names, emails, phones, no exact amounts.
- [ ] Every event is a no-op when consent is not granted.

### Storefront Funnel Events
- [ ] `storefront_viewed` fires on `/c/[slug]` page mount (once per mount, with slug property).
- [ ] `pitch_started` fires when "Send a pitch" button is clicked (with slug property).
- [ ] `pitch_started` fires when package "+" button is clicked (with slug + package property).
- [ ] `pitch_send_attempted` fires on pitch form submit (before server action).
- [ ] `deal_created_from_storefront` fires on successful deal creation from pitch.
- [ ] All events are no-ops when analytics consent is not granted.

### PitchPanel Legal
- [ ] PitchPanel shows "By sending this pitch you agree to the Terms of Service and Privacy Policy" with links to `/terms` and `/privacy` before the submit button.
- [ ] Links open in new tabs.

### Net-of-Fee Creator Visibility (§7 Terms compliance)
- [ ] Web accept-page (`/offer/[token]`): "You receive" line shows net amount after fee deduction (deducted mode), with breakdown (deal value − fee).
- [ ] Creator deal page (`/creator/deals/[id]`): "You receive" shows creator's net amount.
- [ ] Creator invoice card: "You receive" row shows `creator_receives_paise`.
- [ ] DealForm preview (brand side): shows "Creator receives" with computed net amount.
- [ ] Campaign roster: shows `creator_receives_paise` per creator.

---

## Run Schedule

### Creator Profile Photo (Avatar)

#### Upload
- [ ] Creator uploads JPEG from dashboard → photo appears in sidebar, dashboard, and storefront (if no separate portrait_path)
- [ ] Creator uploads PNG, WebP, GIF → all accepted
- [ ] Upload a non-image file (e.g. .pdf, .txt) → rejected with "Invalid file type" error
- [ ] Upload an image > 5 MB → rejected with "File too large" error
- [ ] Upload replaces previous avatar (upsert, not duplicate)
- [ ] Creator removes photo → falls back to initials everywhere

#### Display consistency
- [ ] Avatar renders on creator sidebar (desktop + mobile)
- [ ] Avatar renders on creator dashboard (upload section)
- [ ] Avatar renders on public storefront /c/[slug] when portrait_path is null (falls back to profile_photo_url)
- [ ] Storefront uses portrait_path when set, ignoring profile_photo_url (portrait_path takes priority)
- [ ] Avatar renders in brand's deal thread for a creator they share a deal with (via creators.profile_photo_url in the deals join)
- [ ] Avatar renders in brand's deals list, deal detail, and campaign views

#### Access boundary
- [ ] A brand CAN see the photo of a vetted creator (via browse/deal builder — creators_read policy allows is_vetted = true)
- [ ] A brand CAN see the photo of an unvetted creator they share a deal with (creators_read policy allows deal partner)
- [ ] A brand CANNOT see the photo (or any data) of an UNVETTED creator they have NO deal with (unvetted + non-partner = hidden by creators_read policy)
- [ ] No new RLS policy was added or widened for this feature — existing creators_read policy is sufficient
- [ ] Photo URL is a public storage URL (storefronts bucket) — no storage-level policy change needed

---

## 16. Welcome Email (first signup)

Sent once per account by `lib/welcome-email.ts`. Never blocks signup — every
failure path returns rather than throws, and the caller does not await a result
it acts on.

### Brand
- [ ] Complete brand onboarding with a fresh account → welcome email arrives at the account's email
- [ ] Subject reads "Welcome to Guapd"; CTA is "Create your first deal" and lands on `/deals/new`
- [ ] Copy addresses the brand (offers, locked terms, tracked approvals and payment), not the creator
- [ ] An `account.welcome_sent` event is written with the user id and `audience: 'brand'`

### Creator
- [ ] Complete creator signup **with no email on the account** → NO welcome sent, signup still succeeds, no error surfaces
- [ ] Complete creator signup where the auth user HAS an email → welcome arrives, CTA "Open your dashboard" → `/creator/dashboard`
- [ ] Copy addresses the creator (one inbox, accept/counter/decline, free for creators, fee paid on top by the brand)

### Sent once
- [ ] Reaching the end of signup twice (e.g. claiming a stub, retrying a failed step) sends exactly ONE welcome
- [ ] The guard is keyed to `users.id`, not the email address — changing the address later does not re-trigger it
- [ ] A FAILED send writes no `account.welcome_sent` row, so a later completion can still send it

### Never blocks
- [ ] With `EMAIL_ENABLED` unset: signup and onboarding complete normally, a warning is logged, no email
- [ ] With an invalid `RESEND_API_KEY`: signup and onboarding still complete; the failure is logged only
- [ ] Nothing in this path can throw into the signup transaction — the account exists before it runs

---

## 17. Marketing Site (landing, brands, creators, footer)

Added after the design ports. These are visual/behavioural checks that the
measurements in the port commits assert; re-run after any re-port.

### Landing page (`/`)
- [ ] Header floats over the hero artwork with no white band above or below it
- [ ] Hero headline holds TWO lines from 900px to 1920px
- [ ] "How it works" pinned sequence advances through all four cards on scroll
- [ ] "Everything, in one place": heading holds at the top while cards stack beneath it, cards do not scroll away
- [ ] The header fades out while the expanding-card section owns the viewport, and returns after
- [ ] Both "Book demo" buttons (hero, page foot) open the demo dialog
- [ ] Scroll-progress bar is the brand neon, not black
- [ ] No horizontal scrollbar at 1440, 1080, 820, 520, 390

### Header
- [ ] Landing only: "Log in" and "Get access" open menus (Creator / Brand) — on hover, on click, and on Enter
- [ ] Escape and an outside click close them; choosing an item navigates and closes
- [ ] `/brands` and `/creators` show plain links, no dropdowns
- [ ] Creators page "Log in" goes to `/login/creator`, brands page to `/login/brand`
- [ ] Nothing is marked current on the landing page; `/brands` and `/creators` mark their own link

### Footer (renders on `/`, `/brands`, `/creators`, `/privacy`, `/terms`)
- [ ] Rounded top corners reveal the section above, not a white wedge
- [ ] Contact opens the contact dialog — including on `/privacy` and `/terms`, which do not load brands-page.css
- [ ] Cookie preferences still clears consent and reloads

### Forms
- [ ] Book demo: submit → row in `events` (`demo.requested`) BEFORE any email; team email reply-to is the requester; requester gets a confirmation
- [ ] Contact: submit → row in `events` (`contact.submitted`); team email reply-to is the sender; sender gets a confirmation
- [ ] Both: with email unconfigured the row is still written and the form reports success
- [ ] Both: an over-long paste is rejected with a readable message, not a 500

### SEO
- [ ] `/`, `/brands`, `/creators`, `/privacy`, `/terms` each have a self-referencing canonical — NOT the homepage
- [ ] Every title is unique and does not repeat the brand name twice
- [ ] Every page emits an og:image (a page-level `openGraph` REPLACES the layout's, so each must set it)
- [ ] `sitemap.xml` lists all five indexable pages
- [ ] Exactly one H1 per page, no skipped heading levels, no image missing an `alt` attribute
- [ ] App routes (`/dashboard`, `/ops`, `/login/*`, `/signup/*`, `/onboarding`) stay `index: false`

### 18. Creator signup — audience size

- [ ] The creator onboarding form asks for followers/subscribers after the handle, as a dropdown with six bands: Under 20k, 20k–50k, 50k–100k, 100k–500k, 500k–1M, 1M+
- [ ] The submit button stays disabled until a band is picked (name, handle, band and the terms tick are all required)
- [ ] The band is saved into `creators.social_accounts[0].follower_range`, and `follower_count` stays null — one is self-reported, the other is a verified number, and they must not be conflated
- [ ] `saveOnboarding` called directly with a band outside the list is rejected — the action is directly callable, so the list is enforced server-side, not just in the form
- [ ] Every creator has a truthful option — the bands start at "Under 20k", so nobody is forced to over-report (this was a real gap while the lowest band was 50k)

### 19. Marketing nav — phone

- [ ] Landing header CTA reads "Get access" and opens the audience modal; /brands reads "Join as a brand"; /creators reads "Join as creator"
- [ ] The modal's two options go to `/signup/creator` and `/signup/brand`
- [ ] The modal renders ABOVE the cookie consent bar and both options are tappable. It is portalled to `document.body` because `.mnav-wrap` is `position: sticky` with a z-index and therefore a stacking context — a modal rendered inside it is trapped under the bar (z-index 9999) no matter how high its own z-index goes
- [ ] Same portal check for the Book demo and Contact modals, which are now opened from the nav too
- [ ] Every drawer carries "Contact us"; the /brands drawer also carries "Book demo"; the /creators drawer does NOT (the demo is of the brand workflow)
- [ ] Escape closes each modal, and the backdrop tap closes it

### 20. Mobile input sizing (iOS)

- [ ] Every input on `/login/creator`, `/login/brand`, `/signup/creator`, `/signup/brand` computes to ≥16px at phone widths
- [ ] On a real iPhone, focusing a field does NOT zoom the page. Safari zooms any focused input under 16px, and the zoomed page then pans to keep the caret visible — which reads to a user as the screen shifting sideways when the keyboard opens. This is not a layout bug and will not reproduce in a desktop browser

### 21. Creator signup — OTP verify

- [ ] A number whose auth user already exists (any retried signup) completes rather than failing. `normalizePhone` yields `+91…` but GoTrue stores `auth.users.phone` WITHOUT the plus, so the fallback lookup is tried both ways — querying only the plus form leaves that number permanently unable to sign up
- [ ] Failure messages carry a code (E1–E5) identifying which step failed, and the matching `[SIGNUP]` line is in the server log
- [ ] The `phone_verifications` row is still marked `used` after a successful verify (it is now awaited at the end rather than mid-action, so confirm the write still lands)
- [ ] A verified code cannot be replayed
- [ ] No `getUserById` round trip in the verify path — the address it read was the synthetic `@auth.guapd.internal` one, which cannot receive mail
- [ ] iOS: tapping the SMS code suggestion above the keyboard fills all six boxes, not one. The full code arrives in a single event on whichever box has focus, so any box accepting >1 digit fills the whole row

### 22. Follower range in ops

- [ ] `/ops/creators` shows an Audience column carrying the band the creator picked
- [ ] `/ops/creators/[id]` shows it on the meta line beside handle and niches
- [ ] The "creator awaiting vetting" email includes an Audience line
- [ ] A creator who signed up before the field existed shows "—" in ops and "not answered" in the email, rather than breaking the page or the send
- [ ] The value is read from `social_accounts[].follower_range` through `followerRangeOf()` — jsonb written by several paths, so anything unexpected must read as "not answered", never throw inside a page render or an email

### 23. Brand creation authorization (SECURITY)

- [ ] A user with `users.role = 'creator'` calling `submitOnboarding` is refused. This is not theoretical — it happened on production within hours of launch and produced a brand whose contact was `creator_<phone>@auth.guapd.internal`
- [ ] A brand signing up with a work email via Google still completes (ensureBrandUserRow creates the row with `role = 'brand_member'`, so the check passes)
- [ ] A free-inbox address (gmail, outlook…) is refused by `validateWorkEmail` on this path, not only in `/auth/callback`
- [ ] An `@auth.guapd.internal` address is refused explicitly. `validateWorkEmail` is a BLOCKLIST of free providers, so our synthetic domain passes it — the explicit check is what stops phone-only accounts, not the work-email rule
- [ ] The invite accept flow still works for a genuine teammate
- [ ] A creator-role user opening a valid brand-team invite is refused ("This is a creator account"); the invite stays valid for the right person

### 24. Creator PII column privileges (SECURITY)

- [ ] `authenticated` and `anon` CANNOT select `phone`, `contact_email` or `rate_card` from `creators` — verify with `has_column_privilege`, and confirm `select *` fails outright
- [ ] `service_role` still reads every column (ops, creator settings, email/notification senders, the offer OTP lookup all depend on it)
- [ ] These user-scoped queries still work: `campaigns/[id]/page.tsx`, `creator/layout.tsx`, `creator/storefront/page.tsx`, `lib/creator-auth.ts`, `auth/creator/callback`
- [ ] The creator's own settings page still shows their phone and contact email (it reads through the admin client, so it is unaffected)
- [ ] Adding a column to `creators` does NOT grant it automatically — new columns are unreadable by `authenticated` until added to the GRANT in `rls.sql`. That is the intended fail-closed direction; remember it when adding a column meant to be public

### 25. my_brand_id() with two memberships

- [ ] A user holding `brand_members` rows for two brands can still use the app — before the fix every brand-side policy raised "more than one row returned by a subquery" at once, locking them out of everything
- [ ] The brand resolved is the OLDEST membership (`ORDER BY created_at`), consistently across queries
- [ ] KNOWN GAP: the second brand is invisible rather than supported. If one account should ever span two brands, this function and every policy calling it need rethinking; if never, `brand_members` wants `UNIQUE (user_id)`

### 26. The role boundary is closed on every path (SECURITY)

Only three paths can make someone a brand member. All three are now guarded:

- [ ] `submitOnboarding` — refuses `role = 'creator'` (section 23)
- [ ] invite accept — refuses `role = 'creator'`, and already refused a second brand
- [ ] **self-service role change** — `users.role` is no longer writable by its owner. This was the one that mattered: `users_update_own` is `USING (auth_id = auth.uid())` with no `WITH CHECK`, so it constrains which ROW you may update and says nothing about which COLUMNS. A creator could set their own role to `brand_member` and then walk through the check in `submitOnboarding`. Verify with `has_column_privilege('authenticated','public.users','role','UPDATE')` → false
- [ ] `role` is still READABLE by authenticated (the app reads it), and `service_role` still writes it (every signup path does)
- [ ] `full_name`, `preferences`, `phone` remain writable — ordinary profile fields
- [ ] `brand_members` has no INSERT policy, so no client can create a membership directly; both inserts are server-side with the service role
- [ ] REGRESSION TRAP: `REVOKE UPDATE (col)` is a NO-OP while a table-level UPDATE grant exists. Migration 0471 did exactly that, reported success, and changed nothing. Always revoke at table level then grant columns back, and verify with `has_column_privilege` rather than trusting the migration ran

### 27. Contact channels in ops

- [ ] `/ops/creators/[id]` shows a "How to reach them" card: signup phone, WhatsApp number, and notification email
- [ ] A channel the creator opted OUT of is labelled "(opted out)" rather than hidden — the number is still there, it just should not be used for platform notifications
- [ ] A creator who opted into nothing shows the warning line
- [ ] The email shown is `creators.contact_email` (the address they asked to be notified on), falling back to `users.email` (the one they signed in with) — these differ for a creator who signed in with Google
- [ ] Values come from `users.preferences` (`notify_email`, `notify_whatsapp`, `whatsapp_phone`), which nothing in ops read before

### 28. WhatsApp number prefill at signup

- [ ] Ticking the WhatsApp toggle prefills the number field with the signup phone and sets the dial code to +91
- [ ] It does NOT overwrite a number already typed, or one restored from a previous save
- [ ] "Same as the number I signed up with" still works after clearing the field
- [ ] Prefilling the number is not the same as pre-ticking the box: the tick is the recorded choice, the number is a replaceable default

### 29. REGRESSION — column grants vs the browse page

- [ ] `/browse` lists creators for a brand and still shows rate cards. It selects `rate_card`, which migration 0470 withheld from the anon key, so it now uses the service role
- [ ] It filters `is_vetted = true` EXPLICITLY. RLS was enforcing that and the service role bypasses RLS — without the filter, every brand would see unvetted creators
- [ ] No user-scoped query anywhere selects `phone`, `contact_email` or `rate_card` from `creators`. Check per QUERY, not per file: a file can import the admin client for one query and use the session client for another, which is exactly how this one was missed

### 30. Every "Book demo" opens the modal

- [ ] Landing desktop: all three (banner hero, animated hero, closing section) open it. The reduced-motion copy of the closing section counts — it was a `<span>` in a `<div>`, not interactive at all
- [ ] Brands desktop: both open it. `BookDemoModal` was imported, `demoOpen` declared and both buttons wired to `openDemo` — but the modal was NEVER RENDERED, so the click set state nothing read
- [ ] Landing mobile: the closing CTA and the header Get access modal both work
- [ ] CHECKING METHOD: audit by the tag IMMEDIATELY wrapping the text and by whether the modal is rendered. Looking backwards for "the nearest `<button`" gives false passes — it finds an unrelated earlier tag, which is how the brands one was missed twice

### 31. Deal builder ghost text

- [ ] `/brands` desktop: the input cycles placeholder briefs, typing forward then deleting
- [ ] `/brands` mobile: same. The element existed but rendered no `{ghost}` and the file had no effect at all — the converter's ghost substitution reached the desktop file only
- [ ] Typing in the box stops the cycling and clears the ghost

### 32. Navigation progress bar (marketing pages)

- [ ] A fast navigation (`/` → `/brands`, already prefetched) shows NO bar. This is the common case and a bar here would read as jank
- [ ] A navigation slower than 150ms shows a thin neon bar at the top of the viewport
- [ ] The bar clears when the new page renders (the component unmounts on pathname change)
- [ ] An in-page anchor (`href="#..."`) never triggers it — it navigates nothing and would leave the bar running until the 8s giveaway timer
- [ ] Modified clicks (cmd/ctrl/shift/alt, middle-click, `target=_blank`, `download`) never trigger it — those are the browser's to handle
- [ ] Under `prefers-reduced-motion` the bar still appears but does not slide
- [ ] It sits above the cookie bar (z-index 10001 vs 9999); both are fixed to the viewport edge
- [ ] TESTING NOTE: two obvious tests are invalid here. Clicking a real `<a>` starts a full page navigation, so `page.evaluate` throws "execution context destroyed" and every sample comes back null — which looks like the bar never appeared. And Next PREFETCHES nav links, so a "slow navigation" test against `/brands` is instant and proves nothing. Test the show logic with navigation suppressed (`preventDefault` from a listener attached after the component's)

### 33. Ops link must not appear on public pages (SECURITY-adjacent)

- [ ] `/terms` and `/privacy` render NO link to `/ops`, on desktop or mobile, including after opening the Log in dropdown and the mobile drawer
- [ ] These two pages use `components/Nav.tsx`, NOT MarketingNav — a different, older nav. Check both when changing site-wide navigation
- [ ] The link never granted access (`/ops` is gated by `OPS_ALLOWED_EMAILS`), but these pages are public and indexed, so it advertised the internal console to anyone reading the legal pages

### 34. Legal page layout

- [ ] The `<h1>` on `/terms` and `/privacy` sits BELOW the nav, not under it. `.nav` is `position: fixed`, so the page must reserve `var(--nav-height)` — it previously had only 3rem against a 64px bar and the heading was clipped

### 35. Brand signup notifies ops

- [ ] Completing brand onboarding emails `OPS_NOTIFY_EMAIL` with the brand's name, industry, website, Instagram, company size, location and contact
- [ ] Missing fields read "not given" rather than being omitted — "no website" is itself a signal when judging a signup
- [ ] Sent ONCE per brand (guarded by an `ops.brand_signup_notified` event), and only AFTER the brand_members row exists, so a signup that failed halfway is never announced as complete
- [ ] A failed send never fails signup

### 36. Domain health in the brand signup notice

- [ ] The signup email carries an "About <domain>" block when the website has no working HTTPS, sits on registrar parking nameservers, has no MX record, or does not resolve
- [ ] A healthy domain adds NOTHING — no empty section, no "all clear" line
- [ ] It is a SIGNAL, NOT A GATE. Every one of these has an innocent explanation: a real company mid-setup has no TLS yet, a small brand can sit on parked nameservers for a week. Blocking on them would reject genuine signups
- [ ] Signup NEVER fails or hangs because of it: every lookup is capped at 4s and every failure degrades to "unknown"
- [ ] Verified against real production signups — zero2host.com and sclout.com (both deleted as fake) flag on HTTPS and parking; ergonstyle.com and gigmatic.ai (both genuine) stay silent

### 37. Creator dashboard — empty state and tab bar

- [ ] A creator with NO deals ever sees the empty dashboard: "Hey, <name>", the Overview grid reading zero with per-stat copy ("No deals yet", "Nothing pending", "None in progress", "Not yet"), Get started, Up next, Performance, Your reach
- [ ] The zero-deal check is NOT period-filtered. A creator whose only deal was last year must see the real dashboard, not a first-run screen they already finished
- [ ] The handle line shows `@handle`, or a prompt to finish the profile when there is none. It never invents a follower count
- [ ] Bottom tab bar on phones: Dashboard, Deals, Inbox, Payments, Profile. The current tab is marked by BOTH colour and the neon underline — colour alone fails anyone who cannot separate the two greys
- [ ] The tab stays current on child routes (`/creator/deals/<id>` still highlights Deals)
- [ ] The tab bar sits ABOVE the cookie banner (z-index 10000 vs 9999). Both are fixed to the bottom edge, and navigation a creator cannot reach until they answer a consent prompt is worse than a prompt sitting slightly higher
- [ ] Only ONE navigation shows at a time: below 768px the sidebar's mobile top bar is hidden and the tab bar shows; at 768px and above the reverse
- [ ] Notifications and Storefront are reachable from the dashboard header (bell + Shopfront pill) — they are the two links the drawer used to carry that the five tabs do not
- [ ] Cards have depth: 20px radius and a TWO-layer shadow (1px contact + wide soft). A flat white rectangle means the .mcard class lost its definition
- [ ] The lime `secline` rule appears under each section heading — it is the only place the brand colour appears on this screen
- [ ] REGRESSION TRAP: the converter drops the export's 50KB stylesheet but the markup keeps its classNames. The page still renders, which is what makes it dangerous — it just renders flat. Any class the markup uses must exist in creator-app.css; check with `grep -oE 'className="[^"]+"'` on the generated component
- [ ] The greeting header scrolls away. It is sticky in the export because that lives in a fixed-height phone frame; on a real page the same rule pins it to the viewport and it reprints over the content

### 38. Creator notifications — empty state

- [ ] A creator with no notifications sees the designed empty screen: back arrow, "Notifications", a tiled bell, "You're all caught up", and the explanation line
- [ ] It REPLACES the screen rather than sitting inside the feed. NotificationFeed draws its own header and toolbar, so an empty list would otherwise render chrome over blank space
- [ ] The back arrow goes to /creator/dashboard — notifications is reached from the dashboard bell, not the tab bar, so the five tabs give no way back
- [ ] A creator WITH notifications still gets the full feed, unchanged
- [ ] The tab bar renders on this screen too, and no tab is marked current (notifications is not a tab)
- [ ] CreatorEmptyState takes its copy as props. "You're all caught up" is right here and wrong for deals — an empty state that says nothing specific is a shrug

### 39. Creator deals — empty state

- [ ] A creator with no deals sees: back arrow, "My deals", the three-up counters all reading 0, a briefcase tile, "No deals yet", and a "Set up your shopfront" CTA going to /creator/storefront
- [ ] It REPLACES the screen. CreatorDealsTable renders a toolbar, headers and filters — chrome for a list that does not exist
- [ ] The CTA is lime with near-black ink (--lime-400 on --lime-950), not black-on-lime from the marketing palette
- [ ] The counters are muted grey, not full contrast. A zero drawn in black reads as a real figure worth attention
- [ ] DELIBERATE OMISSION: the export also draws a search field and seven filter chips, all reading zero. They are not built. Search and filters are controls for a list that does not exist — the export disables its own search input for that reason, and seven chips saying 0 is decoration pretending to be a feature. Restore them with the populated design, where they do something
- [ ] A creator WITH deals still gets the full table, unchanged

### 40. Creator payments — empty state and UPI ID

- [ ] TOTAL EARNED leads the screen, above LAST PAYOUT — it is the figure a creator opens this page to see
- [ ] Every control is REACHABLE. The page reserves room for the tab bar AND the cookie banner (~210px); reserving only the bar leaves the last control on the page — the Add UPI ID button — under the banner and un-tappable
- [ ] A creator with no invoices sees: "Payments", a tinted LAST PAYOUT card reading ₹0, "Nothing's landed yet", a "Browse brand deals" button, and the payout row
- [ ] The payout card shows a GRADIENT, not flat white. It needs both --sec and --sec-2; if either is missing the whole declaration is invalid and CSS drops it silently — there is no fallback colour
- [ ] With no UPI saved the row reads "No payout method yet" with an "Add UPI ID" button; with one saved it reads "UPI · <id> · not verified yet" with "Change"
- [ ] It NEVER says "verified". Verifying a UPI ID means a penny-drop through a payment aggregator, which v1 stays out of — the word would be a lie in the one place a creator most needs the truth about their money
- [ ] Valid: `utkarsh@upi`, `palak.jain@okhdfcbank`, `9876543210@ybl`. Rejected: `not-a-upi`, `@upi`, `user@`, `user@123`, `user name@upi`
- [ ] Saved lowercased — UPI handles are case-insensitive, and two casings of one address look like two accounts in ops
- [ ] `creators.upi_id` is withheld from anon/authenticated like phone (migration 0476). Both read and write go through the service role
- [ ] The audit event records THAT a UPI was saved, never the value — events is readable in more places than the column is
- [ ] The input is 16px, so Safari does not zoom the page on focus

### 41. Creator profile (mobile)

- [ ] The Profile tab goes to /creator/profile and shows: identity card with initial and name, storefront prompt, DEALS DONE / PAID THIS YEAR / TURNAROUND, then the menu
- [ ] SIGN OUT IS PRESENT. The export has no sign out at all, and the tab bar replaced the drawer that used to carry it — without this there is no way to sign out on a phone
- [ ] Notifications is in the menu too, for the same reason
- [ ] Sign out is separated from the menu rows and is the only red on the screen — it ends the session rather than navigating, and grouping it with four links is how it gets tapped by accident
- [ ] It is REACHABLE at the bottom of the page, clear of the tab bar and cookie banner
- [ ] The storefront prompt only appears when there ISN'T one
- [ ] NO follower count. The export prints "@handle · 0 followers"; nothing counts followers, and showing 0 to someone with an audience is worse than showing nothing
- [ ] TURNAROUND shows an em dash, not "0 days" — it needs completed deals to average, and a zero would claim a speed nobody measured
- [ ] The avatar border is DASHED — it says "no photo yet" rather than presenting an initial as a finished avatar

### 42. Creator screen header spacing

- [ ] 14px between the page title and the first card, on every screen using CreatorPageHeader (deals, payments, profile, notifications). Measure it — at 0px the card touches the heading and reads as a rendering fault rather than a tight layout
- [ ] REGRESSION SOURCE: the export declares `padding-bottom: 14px` in the SAME rule as `position: sticky`. Removing sticky (correct — it pins to the viewport on a real page) silently removes the spacing with it

### 43. Shopfront wording, dismissible welcome, and mobile editing

- [ ] User-visible copy says "shopfront", not "storefront". Routes (/creator/storefront), table names (creator_storefronts), event types and component names deliberately keep the old word — renaming those is a refactor with a migration attached and no user benefit
- [ ] KNOWN: the privacy policy still has a "Storefronts" section heading. It is a legal document, so the wording is yours to change, not mine
- [ ] The welcome panel is DISMISSIBLE via "Okay, let me look around first". Before this it covered the sample shopfront it was describing, with no way past it except starting to edit
- [ ] Dismissing reveals the sample, and the bar that replaces it still offers the edit action — the way in is never lost
- [ ] Mobile editing works: below 900px the editor's content/preview split collapses to one column, and below 560px the two- and three-up field grids do too. At 390px a three-column row gives each field ~100px, narrower than its own label
- [ ] The live preview moves BELOW the fields on a phone rather than being hidden — someone editing a shopfront needs to see what they are changing

### 44. Creator inbox — empty state

- [ ] A creator with no message threads sees the header ("Inbox", back to dashboard) and the empty state, not two blank columns of CreatorInboxView chrome
- [ ] All five tabs now show a header on their empty state. The dashboard is the exception by design — it has its own greeting header rather than the back-arrow one

### 45. Shopfronts in ops

- [ ] `/ops/creators` has a Shopfront column: a link to `/c/<slug>` when published, "Draft" when not, "—" when there is none
- [ ] A DRAFT is named but NOT linked — the public URL 404s until it is published, and a link that 404s looks checkable and is not
- [ ] `/ops/creators/[id]` shows a Shopfront panel: status, URL, last updated, and a filled/empty checklist for Photo, Headline, Bio, Categories, Work samples and Rates
- [ ] The checklist is the point. Each empty item is a specific thing to coach — "no photo, no work samples" beats "improve your profile". Verified against staging: both live shopfronts are missing exactly those two
- [ ] "Not started" says so plainly, since that is the first thing worth nudging
- [ ] The column count on the list still matches (8 headers / 8 cells) — adding a column and forgetting its cell shifts every row from that point on, which happened once already

### 46. Dashboard checklist and fixed-element clearance

- [ ] Get started is the FIRST section, above Overview — it is what a creator with no deals should act on
- [ ] Both "Set up" pills are guap green, as is the Shopfront pill in the header. Ink-coloured there read as one more row rather than the thing to press
- [ ] "Connect your socials" flips to a green Done tick once a social account carries a HANDLE. The row exists from signup, so its mere presence would mark the step complete before the creator did anything
- [ ] "Set up your shopfront" flips to Done once a creator_storefronts row exists
- [ ] SHOPFRONT PAGE: the welcome sheet and the draft/published status bar both clear the creator tab bar. Both were fixed to bottom:0 and bottom:24 behind a tab bar fixed at bottom:0 with z-index 10000, so their buttons could not be tapped. Raising z-index alone would only hide the tabs instead — they are lifted above the bar's height

### 47. Profile menu destinations and the shopfront link

- [ ] Every row goes somewhere real: Edit profile → /creator/settings, Notifications → /creator/notifications, Payments → /creator/payments, Settings → /creator/settings, Help & support → the CONTACT DIALOG (not a settings page that answers nothing), Sign out → signs out
- [ ] Payments is in the menu — a creator looking for their saved UPI details looks here first
- [ ] With NO shopfront: a guap-green "Set up your shopfront" row
- [ ] With one PUBLISHED: "YOUR SHOPFRONT /c/<slug>" plus a green Copy button and an arrow that opens it in a new tab
- [ ] Copy puts the full URL on the clipboard and the button confirms "Copied" for ~2s. The URL is built from the browser origin, so a link copied on staging points at staging
- [ ] There are THREE controls: copy, EDIT (pencil → /creator/storefront), open. Edit was missing, so the only route back to the editor was via the dashboard or the shopfront tab
- [ ] All three fit beside the slug at 390px. Below 380px the copy LABEL hides and its icon carries it — three controls plus a long slug will not fit otherwise
- [ ] Each control has an aria-label, since two of the three are icon-only on a narrow screen
- [ ] An UNPUBLISHED shopfront passes no slug — its public URL 404s, and handing someone a link to copy that does not work is worse than none. The row offers "Finish it" instead
- [ ] Clipboard access can be refused (plain http, or permission). The fallback is to stay un-copied rather than claim success

### 48. Shopfront editor on a phone

- [ ] Age breakdown stays TWO-up. Those are compact pairs — a band and a percentage — and stacking turns three rows into six for no gain
- [ ] The top age band carries the brand tint, not a flat grey
- [ ] Every text field is ≥16px, or Safari zooms on focus and scrolls the field out from under the thumb mid-edit
- [ ] The gender slider has a 22px hit area — 6px is fine to look at and unreliable to drag
- [ ] Nothing inside the welcome sheet exceeds the viewport (measured 468px wide in a 390px window before the cap)

### 49. Creator settings has two tabs, not three

- [ ] Tabs are Profile and Account only. The Payments tab is GONE — it was a mockup: hardcoded literals for payout schedule and invoice preferences, empty GST and bank fields, and a `handleSave` that never read any of them. It marked the form dirty and showed a Save bar that saved nothing, so a creator could type their bank details and lose them
- [ ] Real payments live at /creator/payments (UPI ID), reachable from the profile menu
- [ ] A stale `?tab=payments` deep link falls back to Profile rather than erroring
- [ ] Profile menu: "Edit profile" opens the Profile tab, "Settings" opens the Account tab. Both pointed at the page default before, so one of them appeared to do nothing

### 50. Shopfront on a phone (public /c/<slug>, /browse/<id>, and the editor preview)

All three render the same component, so check one and the others follow — but the responsive CSS must be imported by the COMPONENT, not a page, or only the editor gets it.

- [ ] Audience block stacks: Age breakdown, then Gender, then Top locations, each full width. It was a fixed `1.55fr 1fr` split with no collapse — the right column got ~130px and its contents ran off-screen with the percentages cut off
- [ ] Grid columns are `minmax(0,...)`, not bare `fr`. A grid item's default `min-width: auto` lets a wide child (the donut, the location rows) push its track past its share even when the fraction is right
- [ ] No heading or paragraph crosses the right edge. Check "Build your deal" specifically: its subtitle is `white-space: nowrap` by design on desktop, which forced the block to 441px on a 390px screen and dragged the heading out with it
- [ ] Hero stats are one row of three with dividers, not a wrapped 2+1
- [ ] Hero has ONE full-width primary button; "View rates" is a quiet link beneath it. Two 180px pills stacked left-aligned neither filled the row nor centred in it
- [ ] Horizontal scrollers (`.sf-exprow`) are exempt — they overflow on purpose. Measure page overflow and clipped text, not raw bounding boxes, or every card in a carousel reads as a bug

### 51. Settings is a single-section screen on a phone

- [ ] "Edit profile" opens ONLY the Profile section, titled "Edit profile"; "Settings" opens ONLY the Account section, titled "Settings". Neither shows the tab strip — two menu rows leading to one tabbed page is why they felt identical
- [ ] Back goes to /creator/profile, the tab it was opened from. It used to go to /creator/dashboard, dropping a creator somewhere they were never navigating from
- [ ] The header is full-bleed and matches deals / payments / notifications, not inset inside the page padding
- [ ] Desktop is UNCHANGED at ≥768px: side nav visible, breadcrumb header visible, mobile header absent. Check this explicitly — the section content is shared, so a mobile rule that leaks up strips the desktop page of its navigation
- [ ] Every field is ≥16px. There were 11 under it on the Profile tab, which is the "screen slides sideways when the keyboard opens" report

### 52. Back arrows follow the door you came in by

- [ ] Notifications and Payments each have two entry points — the profile menu and the dashboard — so their back arrow reads `?from=profile` rather than assuming
- [ ] From the profile menu: back returns to /creator/profile. From the dashboard (or the Payments tab): back returns to /creator/dashboard
- [ ] An absent or unrecognised `from` falls back to the dashboard rather than erroring
- [ ] This keeps CreatorPageHeader's rule that `backHref` is stated by the caller and never guessed — the guessing just moved to the link, where the answer is actually known

### 53. Profile photo upload actually works

Before this, `AvatarUpload` was wired to real upload/remove actions but rendered NOWHERE, and the settings screen drew two inert `<span>`s labelled "Upload photo" and "Remove". There was no working way to set a photo anywhere in the app.

- [ ] Settings → Edit profile: "Upload photo" is a real `<button>` with a hidden file input, not a span
- [ ] Shopfront editor → About you: the same control, placed first. The photo is the largest element on the published shopfront, so it belongs in the editor that builds it
- [ ] Uploading refreshes the route, so the shopfront preview shows the new photo without a manual reload
- [ ] Rejects anything that is not JPEG/PNG/WebP/GIF, and anything over 5 MB, with the reason shown
- [ ] Once a photo exists the button reads "Change photo" and a "Remove" appears beside it
- [ ] Storage path is `avatars/{creatorId}/` and is re-checked against that prefix after being built
- [ ] The DB write goes through the SESSION client, so it depends on the `creators_update_own` RLS policy and on table-level UPDATE grants surviving. Migration 0472 revoked table-level UPDATE on `public.users` — confirm it never gets extended to `creators` without granting `profile_photo_url` back, or uploads will store the file and silently fail to save the URL

### 54. Phone-OTP sign-in must not send email (prod bounce incident)

Supabase flagged a high bounce rate on production. Source: `admin.updateUserById(id, { password, email: syntheticEmail })` in the creator login and offer-OTP paths. GoTrue treats ANY `email` in an admin update as an email-change request and mails a confirmation link to it — here `creator_<phone>@auth.guapd.internal`, a domain with no MX record. Every creator login produced a hard bounce, and with "Secure email change" on it produces two (old address and new).

- [ ] Creator logs in by phone OTP: NO email is sent. The address is already correct, so `email` is not written at all
- [ ] When the address genuinely must be written (no email on the row, or a stale synthetic from an old number), `email_confirm: true` accompanies it so GoTrue marks it confirmed instead of mailing a link
- [ ] Same on the offer-link OTP path — it had the identical bug
- [ ] Signup is NOT a source and never was: both `createUser` calls pass `email_confirm: true`, which pre-confirms and suppresses
- [ ] `isPlausibleEmail` REJECTS `@auth.guapd.internal`. It matches a plain email regex, so without naming it explicitly any code path passing a synthetic address to Resend would send and bounce
- [ ] Watch the bounce rate in the Supabase dashboard after deploying. Existing bounces are historical and will age out; what matters is that the rate stops climbing

### 55. Creator packages — self-serve rate card

Packages were enterable ONCE, at signup, and after that only by ops. This is the creator-facing editor.

**Placement — three doors, one screen**
- [ ] Profile menu → Packages
- [ ] Dashboard "Get started" → "Set your packages", ABOVE the shopfront step. Packages are a prerequisite for receiving deals; a shopfront is not, so the order reflects which one blocks money
- [ ] Shopfront editor → Rate card section links out. It does NOT duplicate the editor — one table, one owner
- [ ] Back arrow honours `?from=` (profile / shopfront / dashboard)
- [ ] The step flips to Done when at least one ACTIVE package exists

**Per channel**
- [ ] Packages group under each connected channel; a creator with Instagram and YouTube has two rate cards, because the table is keyed by platform + handle
- [ ] The deliverable list is filtered per platform. Switching channel resets a deliverable the new platform does not offer (Sponsored Reel → YouTube Integration)
- [ ] The server validates the channel against the creator's OWN social_accounts. There is no FK (social_accounts is JSONB), so nothing at the DB level stops a package being filed under someone else's handle
- [ ] No channels at all → a screen that sends them to add one, not an unusable form

**Price modes — TWO are offered**
- [ ] The form offers only **Starting from** and **Price on request**, with Starting from preselected. A minimum already answers what a fixed price answers, and a range asks a creator to commit to a ceiling that is really the negotiation
- [ ] The hint under Starting from carries the disclaimer: brands see "From ₹60,000" AND the creator will not be shown deals below it
- [ ] `exact` and `range` remain in `PRICE_MODES` for validation. Packages priced before the narrowing still hold them, and dropping them makes editing one fail on a value its creator never picked
- [ ] Editing such a package keeps its mode SELECTED and offered. Otherwise no button is pressed and saving silently reprices it
- [ ] Display is unchanged for legacy rows: Fixed → "₹60,000" · Starting from → "From ₹60,000" · Range → "₹60,000–₹90,000" (en dash) · On request → "On request", no figure

**Selects must look like selects**
- [ ] Every `select` in the packages screen shows a chevron. `.pk-input` sets `appearance: none` to control its border and radius, which also removes the native arrow — leaving a dropdown indistinguishable from a text field
- [ ] It is a background SVG with `padding-right` to match, so a long option never runs under the arrow and there is no wrapper element to mis-click
- [ ] Live preview shows the exact line a brand will read
- [ ] Range with top ≤ bottom is refused, and previews as "—" rather than a backwards span
- [ ] On request stores price_paise = 0 — DB-enforced. Read access is wider than the shopfront (any authenticated user can select active products of a vetted creator), so hidden must mean absent, not merely unrendered
- [ ] price_max_paise is non-null for range and NULL for everything else, DB-enforced. Otherwise switching a range back to fixed leaves a stale maximum behind
- [ ] display_price is DERIVED from the mode, never set independently — legacy consumers read it and must agree

**The running total on the shopfront**
- [ ] On-request items are EXCLUDED from the total, not counted as zero. A total that silently omits a priced line is a quote a brand would hold the creator to
- [ ] Selecting any "from" or "range" item prefixes the total with "From"
- [ ] Selecting an on-request item appends "+ items priced on request"

**Removal**
- [ ] Remove sets is_active = false. The table denies client DELETE by policy, and past deals reference what was offered at the time
- [ ] Save and remove are pinned to ctx.creatorId, so a guessed id belonging to another creator matches no row

### 56. Price modes reach the brand side and ops (not just the shopfront)

A price mode is useless if only the shopfront honours it. Every surface that reads `creator_products` must fetch `price_mode` and `price_max_paise` — a query that omits them makes `normalizePriceMode` fall back to `exact`, and a range renders as a fixed price with NO error anywhere.

- [ ] Every `creator_products` select carries both columns: creator storefront, packages, deals/new, ops creator page, campaigns, browse, and the public /c/<slug> action. Re-check this whenever a new consumer appears
- [ ] **Brand offer builder** (`/deals/new`): a "from" or "range" package gives an EDITABLE price field prefilled with the creator's floor. It previously keyed off `display_price`, which is true for a range, so it presented a floor as a settled price the brand could not adjust
- [ ] Only `exact` is treated as fixed. `on_request` still requires the brand to type a figure, and the deal cannot be sent without one
- [ ] Same on the campaign placement editor
- [ ] The line total and the running total use the same rule as the field — no surface should show a total built from a number the brand cannot see

**Ops**
- [ ] The product form has a price-mode dropdown, and a "To (₹)" field appears only for a range
- [ ] The old "Show price publicly" checkbox is GONE. `on_request` is that checkbox unticked; keeping both gave one fact two controls that could disagree
- [ ] Ops writes go through `priceModeFields()`, which derives `display_price` and nulls `price_max_paise` outside a range. Without it, an ops price edit on a creator's range could be REJECTED by the CHECK constraint (new price above the stale maximum) or leave a maximum behind
- [ ] A caller supplying no mode falls back to what `display_price` meant, not to `exact`
- [ ] The ops list shows the mode label and the formatted price, so ops sees what the brand sees

### 57. Package handles are not stored consistently — normalise before comparing

Found by querying staging rather than by reading code: 23 of 25 `creator_products` rows store the handle WITH its leading "@", while `creators.social_accounts` stores it stripped. Comparing them raw matched 0 of 25, so every existing package was invisible on the packages screen while sitting perfectly happily in the table.

- [ ] Grouping strips "@" and lowercases BOTH sides before comparing, and compares platform case-insensitively too
- [ ] A package whose handle carries "@" groups under the matching channel
- [ ] Editing such a package preselects ITS OWN channel. Building the select key from the stored handle produces a key no `<option>` carries, and the dropdown silently falls back to the first channel — which would re-file the package on save
- [ ] Packages matching NO connected channel appear under "Not on a connected channel" with a Remove button. They still render on the shopfront, so hiding them here would leave a creator unable to see or delete something brands can see
- [ ] Seeded data is not a substitute for production shapes: a harness with tidy handles passes while every real row fails

### 58a. Shopfront CTAs land in the rate card, not past it

- [ ] "Create an offer" (hero) and "Start a deal with <name>" (footer) SCROLL to the Build your deal section. They do not navigate
- [ ] Both previously called `onDealClick({})` — an empty selection — so a brand reached /deals/new with nothing chosen and had to rebuild the order they had just been reading
- [ ] "Proceed to create deal", at the foot of the rate card, is the button that moves on, and it carries the selection
- [ ] A shopfront with NO rate card falls through to the deal builder instead of scrolling, or the CTA would do nothing at all
- [ ] Works at 390px and 1280px — the section lands flush at the top of the viewport in both

### 58. Shopfront → offer survives login (brand acquisition path)

The live path is `/c/<slug>` → `PublicStorefront` → "Create an offer" → `/deals/new?creator=<id>&items=<pkg:qty,...>` → `verifyBrand()`. NOT the PitchPanel flow — see the dead-code note below.

- [ ] Logged-out brand clicking "Create an offer" lands on `/login/brand?next=…` with the FULL query preserved — both `creator` and `items`. Losing the query loses which creator and which packages they picked
- [ ] After signing in with a password, they land on that destination, not `/dashboard`
- [ ] Same via Google: the destination rides in `redirectTo=/auth/callback?next=…`, which the callback already validates
- [ ] A brand with no account: `?view=signup` forwards `next` to `/signup/brand`, which forwards it to `/onboarding`, which lands on it at the end. This is the NEW brand — exactly who a shared shopfront link is meant to convert
- [ ] A signed-in brand mid-onboarding keeps the destination too — all three `redirect('/onboarding')` calls in `verifyBrand` carry it
- [ ] An already-signed-in brand hitting `/login/brand?next=…` is forwarded, not dumped on the dashboard
- [ ] Open-redirect refused: `?next=https://evil.com`, `//evil.com`, `/\evil.com` all fall back to `/dashboard`. The value may appear in Next's internal RSC routing tree — that is the raw URL being echoed, not a link. Check `href`/`action` attributes, not raw page text
- [ ] `x-pathname` (set in middleware) carries pathname AND search — that is what makes the query survive. Anything that trims it to the path silently breaks this

**Dead code — now removed**
- `app/c/[slug]/StorefrontPage.tsx`, `PitchPanel.tsx` and `createDealFromStorefront` were referenced by nothing and have been deleted. `page.tsx` renders `PublicStorefront`, which is the only path
- They implemented a plausible pitch flow with sessionStorage draft-saving, and reading them gave a confident, wrong picture of what happens — enough to send a fix to the wrong file
- `app/c/[slug]/actions.ts` now exports only the two read functions the page uses

### 59. Public shopfront on a phone

**The rate card — the one that was actually broken**
- [ ] Package NAME and DESCRIPTION are visible. The desktop grid is `48px minmax(0,1fr) 110px auto`; at 390px the fixed tracks plus three 20px gaps exceeded the row, so the 1fr resolved to **0px** and the name had no width at all. Verify by reading `gridTemplateColumns` — it must not contain `0px`
- [ ] It reads as two rows on a phone: icon + name/description, then price + stepper beneath
- [ ] Desktop is unchanged — four columns, name ~690px at 1280px, price still right-aligned
- [ ] This is the failure mode to watch for generally: a collapsed `1fr` looks like a spacing problem, not a broken column, because everything ELSE still lines up

**Handles**
- [ ] No "@@" anywhere. 17 of 21 handles in `social_accounts` are stored WITH a leading "@" (and 23 of 25 in `creator_products`), so anything that prepends one must strip first
- [ ] Platform links resolve: `instagram.com/<handle>` and `youtube.com/@<handle>` — NOT `youtube.com/@@<handle>`, which is a dead link
- [ ] All of it goes through `lib/handle.ts` (`atHandle`, `profileUrl`). Five other files still carry their own `startsWith('@')` variant — deals, DealForm, ops — worth folding in next time one is touched

**The rest of the page**
- [ ] Zero horizontal page overflow across all 8 screens at 390px, and no heading, paragraph or button crossing the right edge outside a deliberate scroller
- [ ] The brand marquee overflows ON PURPOSE and is clipped by its container — measure page overflow, not raw bounding boxes, or every tile reads as a bug
- [ ] Quantity steppers are 30px. Below the 44px guideline but paired (− and +) inside a 42px control; acceptable, and worth revisiting if anyone reports mis-taps

### 60. The shopfront is sized by its CONTAINER, not the viewport

The editor renders `ShopfrontPreview` inside a 340px pane on a desktop screen (`sf-editor-shell` is `minmax(0,1fr) 340px`). A viewport media query is blind to that, so the phone layout never applied there and the rate card looked broken while the browser was, as far as CSS knew, 1280px wide.

- [ ] `.sf-root` has `container-type: inline-size` and every responsive rule exists TWICE — once as `@media`, once as `@container shopfront`. The media queries stay as the fallback for browsers without container query support, where the public page still needs to be right
- [ ] Test by squeezing the container, not the window: at a 1280px viewport, force `.sf-root { width: 340px }` and the phone layout must engage
- [ ] Any new responsive rule in `shopfront-preview.css` needs both forms, or it will work on a phone and fail in the editor preview

**Rate card rows use FLEX below the breakpoint, not grid**
- [ ] A grid track is charged against every row, so a fixed 110px stepper column plus the icon plus gaps starved the name — it measured 0px at 340px even after the first fix
- [ ] Flex with wrapping asks it the right way round: icon and name take the first line, the stepper wraps beneath and pushes right, and the name grows into whatever the row actually has
- [ ] Check the NAME WIDTH at 340px and 390px, not just that nothing overflows. A starved column overflows nothing — it simply disappears

**Stat cards pair up**
- [ ] The four stat cards are two per row on a phone. `minmax(min(100%,220px),1fr)` needs 460px for two columns, so every phone got one card per row — four near-empty cards down a whole screen
- [ ] This matches the patterns already in use: hero stats three-up with dividers, age bands two-up, profile stat strip three-up. Reach for an existing pattern before inventing a layout

### 61. Creator status changes reach the creator (WhatsApp + email)

Before this, approving a creator sent an email — which skips silently when there is no address — and nothing else. Most creators sign up by phone. On staging, email alone reached **1 of 16** creators; WhatsApp reaches **16 of 16**.

- [ ] Approving in ops sends BOTH `notifyCreatorApproved` (email) and the `status_update` WhatsApp template
- [ ] Rejecting sends both too. The template says an update EXISTS rather than announcing the outcome — kinder than a rejection over WhatsApp, and reusable for the growth tier without a new approval queue
- [ ] Only fires on a real transition (`!before.is_vetted` / `!before.is_rejected`), so re-clicking approve does not re-notify
- [ ] A failed send NEVER fails the ops action — the decision is already recorded, and a creator who hears nothing is recoverable where a half-applied approval is not

**Which number**
- [ ] `users.preferences.whatsapp_phone` (nominated on the under-review screen) WINS over `creators.phone`, which is the login identity and often not where they read WhatsApp
- [ ] `notify_whatsapp === false` is honoured. ABSENT means opted in — every creator predates the setting, and treating absent as "no" would silence the whole roster
- [ ] A stub creator with no `users` row still gets the message; for them WhatsApp is the only channel
- [ ] These rules used to live inside `notifyDealParty`, which is exactly why account-level messages reached nobody. They are in `lib/creator-whatsapp.ts` now — put any new rule there, not back in the deal path

**The link**
- [ ] Button value is the URL SUFFIX `creator/dashboard`, never a full URL — the base is baked into the approved template, and a full URL yields `https://guapd.com/https://guapd.com/…`
- [ ] That one URL serves every status: rejected → rejection screen, pending → under-review page, approved → dashboard, logged out → login and back again. Verify all four before changing it

**Audit**
- [ ] Every attempt writes an event: `creator.status_whatsapp_sent` / `_failed` / `_skipped`, with the reason and a MASKED number — the events table is readable in more places than the phone column

### 62. Post-approval questionnaire (creator) + ops insights

**The gate — only NEW approvals**
- [ ] `vetCreator` writes a `creator.onboarding_questions_due` event on approval. The questionnaire shows only when that event exists AND no response row does
- [ ] Creators approved BEFORE this shipped have no such event, so they go straight to the dashboard. Gating on "no answers yet" instead would ambush the whole existing roster mid-task and produce noisier answers than they are worth
- [ ] "Go to dashboard" on the approval screen goes to `/creator/welcome`, not the dashboard
- [ ] `/creator/dashboard` ALSO redirects to `/creator/welcome` when due-and-unanswered. Without this backstop, closing the tab means never seeing it again — and all three questions are required
- [ ] `/creator/welcome` redirects straight to the dashboard once answered, so a bookmark or the back button cannot re-show it

**A MODAL over the dashboard, not its own route**
- [ ] It renders on `/creator/dashboard`, over whichever state that page is in (empty or populated). There is no `/creator/welcome` route — a page under `/creator` inherits the app nav, so the questions arrived under a header full of destinations the creator could not use yet
- [ ] The dashboard is VISIBLE behind it, blurred (`backdrop-filter: blur(7px)`). What they were promised should be behind what is being asked
- [ ] NON-DISMISSABLE: no close control, Escape does nothing, clicking the scrim does nothing. Verify all three — all answers are required, and a dismissable required form is one people dismiss
- [ ] Body scroll is locked while it is up, and released on unmount
- [ ] The creator TAB BAR is hidden while it is open (`body.wq-modal-open .creator-tabbar`). Left visible under a blur it is legible enough to invite taps that go nowhere
- [ ] Portalled to `<body>`. The creator layout renders pages in a `z-index: 1` stacking context whose SIBLING is the tab bar at `z-index: 10000` — rendered in place, the modal would be painted under the very navigation it needs to cover. Hit-test the CTA, do not just measure it
- [ ] On mobile the CTA is visible without scrolling, pinned above the safe area

**The form — ONE question per screen**
- [ ] Four screens: Q1, Q2, Q3, then the optional note. A single scroll holding all three reads as a form to fill in; one large question at a time reads as being asked something
- [ ] The question is set in the display face at 31px desktop / 22px mobile — it is the only large thing on screen
- [ ] There is NO second heading above it. A page title competes with the question, which is the thing that should carry the screen
- [ ] Selecting an option does NOT auto-advance. A mis-tap would move the screen before it could be corrected, and the follow-up box on "Something else" would vanish before it could be typed in
- [ ] The CTA is disabled until an option is chosen, and enables on selection
- [ ] CTA reads "Continue" on Q1–Q3 and "Start Guapping" on the last screen
- [ ] On mobile the action bar is FIXED to the bottom of the viewport, with the stage padded so the last option is never trapped under it. There is no tab bar on this route — it sits outside the creator app shell
- [ ] Back appears from Q2 onward and preserves previous answers
- [ ] The free-text box appears under Q1 only when "Something else" is chosen, and is stored only when that answer is selected
- [ ] Textareas are 16px, or Safari zooms on focus mid-sentence

### 62a. Under-review card must not clip its own panel

- [ ] The notify-preferences panel has a bottom margin matching its top and sides. It was 0, which put the last row flush against the card's bottom edge — and since `.onboard-card--flush` sets `overflow: hidden` for the rounded corners, the WhatsApp row was sliced by the corner radius
- [ ] Measure the gap between the panel's bottom and the card's bottom. Flush (0–1px) is the bug; it looks like tight spacing rather than clipping, which is why it survived

**The data**
- [ ] Answers are stored as CODES, never display strings. This is what keeps the aggregate comparable across copy edits
- [ ] `CHECK` constraints reject an unknown code (verified: 23514), and `UNIQUE (creator_id)` rejects a second row (verified: 23505)
- [ ] A unique violation on submit is treated as SUCCESS — it means they already answered in another tab, which is the desired end state; failing would lock someone out of their own dashboard
- [ ] RLS: SELECT/INSERT own row only; UPDATE and DELETE denied. A roster that can rewrite its own answers is not a dataset worth drawing conclusions from

**Ops**
- [ ] `/ops/insights` shows the distribution per question with bars and percentages, plus the free-text responses attributed by name
- [ ] Every code maps to a label — watch for `UNMAPPED` in the output, which means the form and the aggregate have drifted
- [ ] A creator's own answers appear on their ops detail page under a "Questionnaire" tab
- [ ] Labels come from `lib/creator-onboarding-labels.ts` (client-safe) which the server-only gate re-exports — ops renders in a client component, so a single `server-only` module would not have worked
- [ ] Logged out, `/ops/insights` renders the ops sign-in card and leaks NOTHING but the page title. Verify with a creator name, not just an HTTP status

### 63. The creator dashboard is not a phone column on a desktop

`CreatorDashboardEmpty` was transcribed from a mobile export, and `.creator-app__inner` capped it at **480px from 720px upward** — so on a 1280px monitor a creator got a phone-width strip floating mid-page. It went unnoticed until a modal sat over it and there was nothing recognisable behind.

- [ ] At ≥768px the dashboard is 1080px wide and its sections lay out TWO-UP
- [ ] Cards size to their own content (`align-items: start`), rather than stretching to match the tallest in the row — that stretch is what makes a two-up grid look padded out
- [ ] Between 720px and 767.98px the 480px column REMAINS. The tab bar is still visible there and is itself capped at 480; widening the content but not the bar would leave them disagreeing
- [ ] Below 720px nothing changes — the column is right at that width
- [ ] Only `CreatorDashboardEmpty` uses `.creator-app__inner`, so the width change reaches nothing else. Re-check that before reusing the class
- [ ] The general lesson: a screen ported from a mobile export is not responsive because it fits a phone. Open every one at 1280px before calling it done

### 64. Empty states are MOBILE designs — desktop keeps its own screens

The five creator empty states were transcribed from files named `... Empty - Mobile.html`. They were then returned EARLY from the route, and that early return fires at every width — so a creator on a desktop with no deals got the phone card instead of the deals screen, and the desktop design was never reached. Nothing was deleted; the desktop path was simply skipped.

- [ ] Desktop (≥768px) with an empty list shows the ORIGINAL screen — `CreatorDealsTable`, `NotificationFeed`, `PaymentsClient`, the real dashboard — rendering empty
- [ ] Mobile (<768px) shows the transcribed empty design, unchanged
- [ ] Exactly ONE of the two is visible at any width. Verify at 1440px and 390px
- [ ] A populated list is unaffected at every width — the gate only applies when the list is empty
- [ ] `/creator/profile` is NOT affected: it is a new route with no desktop predecessor and is not linked from the desktop sidebar
- [ ] The lesson: an early return is a routing decision, not a layout one. A design that exists only for one width must be gated by width, not returned from the route

### 65. Desktop creator dashboard empty state

Ported from "Creator Dashboard - Empty State.html". A separate design from the mobile one — not a resized copy — so both components exist and WIDTH decides which renders.

- [ ] At ≥768px an approved creator with no deals gets the desktop design: the four-figure strip, "Three steps to your first deal", Deals in motion, How it's going, Your reach, Brands you've worked with
- [ ] At <768px the mobile design is unchanged
- [ ] The populated dashboard is hidden when empty (`creator-hide-always`) — both widths have a drawn empty state, so it has nothing to show

**Scoping — the part that would break the site**
- [ ] Every selector in `dashboard-desktop.css` starts with `.cdash-desk`. The export ships `body`, `a`, `a:hover` and TEN `:root` blocks holding 286 custom properties; unscoped, those repaint the entire site
- [ ] Verify by reading `--ink` and `--neon` INSIDE the wrapper and checking `document.body`'s font is untouched. A leak shows up as the marketing site quietly changing colour, nowhere near this file
- [ ] `@font-face` blocks are dropped — next/font already serves Schibsted Grotesk and Instrument Serif, and 78 more declarations refetch the same faces

**Converter traps**
- [ ] The payload is a JSON string inside `<script type="__bundler/template">`. Reading the file as HTML finds almost nothing
- [ ] Collapse `<rect ...></rect>` pairs BEFORE self-closing void elements. A blanket pass produces `<rect ... /></rect>`, and the JSX error lands far from the cause
- [ ] `sc-camel-view-box` must be restored BEFORE the SVG attribute pass, or that pass rewrites the tail and this stops matching — silently
- [ ] Check the UNMAPPED LINKS report every run. Two design links pointed at marketing pages and one checklist row was `href="#"`

### 66. Login with an unknown number continues into signup

The login page used to answer an unknown number with "No account yet" and a link to `/signup/creator` — where the first thing asked for was the number just typed.

- [ ] Entering a number with NO account sends a SIGNUP code and goes straight to the same code screen. No dead end, no retyping
- [ ] Entering the code creates the account and lands in onboarding, exactly as signing up directly would
- [ ] An existing account is unchanged: login code, sign in, honour `?next=`
- [ ] `unclaimed` KEEPS its own screen. That account exists — ops created it — and the wording explaining that is worth more than saving a tap
- [ ] `multi_stub` (several ops stubs match the number) surfaces its message rather than pushing to a route that does not exist for them
- [ ] The signup path is reused, not duplicated — one place mints, stores and rate-limits a code. Check that when changing either flow

**Security note, in both directions**
- [ ] This REMOVES account enumeration from the login page: the reply to a known and an unknown number is now identical. It used to confirm which numbers had accounts to anyone who asked
- [ ] It also means an unknown number typed into LOGIN now spends an OTP. The rate limiting in signup's `sendOTP` is what bounds that — confirm it still applies before widening this pattern anywhere else

### 67. OTP autofill on a phone

- [ ] `autocomplete="one-time-code"` sits on the FIRST box only, `off` on the other five. Declared on all six, some browsers put the whole code in every box and others decline to fill at all
- [ ] A six-digit value arriving in ONE box spreads across all six. iOS delivers the entire code to whichever box is focused, and taking the last character turns "123456" into "6" — which reads as the keyboard suggestion doing nothing
- [ ] `inputMode="numeric"` on every box, so the numeric keypad opens

**iOS — works today.** Safari matches the message by heuristic; no SMS format is required. Our text ("482913 is your Guapd verification code…") fits it.

**Android — cannot work yet, and it is not a code problem.** WebOTP only fires when the SMS ENDS with `@<host> #<code>`. Our DLT-approved template is fixed character-for-character:

    {#num#} is your Guapd verification code. Do not share it with anyone.

Changing it means a NEW DLT approval, which is an Indian regulatory queue, not a deploy.

- [ ] The WebOTP listener is wired and dormant: it aborts on unmount, swallows a decline, and starts working the day the template changes — with no code change
- [ ] It must NOT re-request on every keystroke. Re-running the effect cancels the outstanding request and re-prompts
- [ ] Codes delivered over WhatsApp will never autofill on either platform. Both mechanisms read SMS

### 68. Q1 is multi-select

- [ ] Q1 takes SEVERAL answers and says so ("Pick as many as apply"). Its marks are SQUARE — a circle promises exactly one
- [ ] Tapping a chosen option removes it. Without a toggle there is no way to correct a mis-tap
- [ ] The CTA enables on one or more, and Q2/Q3 stay single-select
- [ ] Stored as `text[]` in `biggest_pains` — RENAMED from `biggest_pain`, because a singular name on an array reads as one value to everyone who meets it later
- [ ] The DB rejects an unknown code inside the array (23514) and rejects an EMPTY array
- [ ] Duplicates are removed before saving, so a double-tap cannot push a valid answer past the length bound

**The empty-array trap, worth knowing generally**
- [ ] `array_length(col, 1) BETWEEN 1 AND 5` ACCEPTS `'{}'` — array_length returns NULL for an empty array, NULL BETWEEN is NULL, and a CHECK only fails on FALSE. The bound let through exactly the case it existed to catch
- [ ] `coalesce(array_length(col, 1), 0)` is the fix. Test a constraint by trying to violate it; reading it is how this survived being written twice

**Ops**
- [ ] BOTH ops queries select `biggest_pains`. The rename in 0479 left the per-creator query on `biggest_pain`; it errored, returned null, and the tab rendered "No response" — which looks exactly like a creator who has not answered
- [ ] That query logs its error instead of swallowing it. A failed read and an unanswered questionnaire must not look the same
- [ ] After ANY column rename, grep the whole tree for the old name. Two of three call sites were updated by the type checker complaining; the third was a string inside `.select()`, which no compiler checks
- [ ] Per-creator view joins the labels with a separator rather than printing one
- [ ] The aggregate counts RESPONDENTS per option, so the percentages sum to over 100% — and the section says so, or the page reads as broken arithmetic
- [ ] EVERY option is listed, including ones with zero picks. Omitting the unchosen reads as "not offered" rather than "offered and refused", and which options fall flat is half of what the question was asked to find out
- [ ] Zero rows are greyed, not hidden. Nobody picking an option is a result
- [ ] A creator who picks three options appears in three bars

### 69. Questionnaire modal sizing

- [ ] Card is 760px wide, up from 620px. The longest option — "Managing deals across WhatsApp / DMs / email is chaotic" — wrapped to two lines, which made five options read as eight
- [ ] Question is 27px on desktop / 20px on mobile, down from 31/22. It should lead the card, not fill it
- [ ] Backdrop blur is 10px. Enough to push the dashboard back without hiding that it is a dashboard

**The card must not flash between questions**
- [ ] The `.wq-panel` element is REUSED across steps — no `key={step}`. Keying it remounts the whole card on every answer: React tears the panel down, builds a new one, and any entrance animation replays, which reads as a flash
- [ ] Verify by tagging the node (`dataset`) and checking it survives the step, plus a MutationObserver counting `.wq-panel` removals. Both must show zero churn — watching it is not a test
- [ ] There is no entrance animation on the panel. The progress bar's width transition carries the sense of movement

**The card must not move between questions**
- [ ] On desktop, height and position are IDENTICAL across all four steps. Measure them; do not eyeball it. Unpinned they went 564 → 432 → 362 → 327, and since the card is vertically centred it slid down the screen with each step, moving the options out from under the cursor
- [ ] `min-height` must clear the TALLEST step, which is Q1 — five options plus the multi-select hint. Set below that, the tallest step still sets its own height and the card keeps moving
- [ ] It is a MIN, not a fixed height: if copy outgrows it the card expands rather than clipping the answers
- [ ] The final step's textarea FILLS the reserved height, or a fixed card leaves a screen of empty white under one short field
- [ ] Mobile is deliberately NOT pinned. The card is top-anchored and the CTA is fixed to the viewport, so nothing moves as it shrinks — forcing a height there would only add empty space
- [ ] The question uses the dashboard's h2 exactly: `var(--font-display)`, weight 600, `clamp(23px, 2.2vw, 26px)`, `-0.02em`. The modal sits over that screen, so a different weight reads as a different product

### 70. Desktop dashboard checklist matches mobile's steps

- [ ] Desktop lists FOUR steps: Connect your socials, Set your packages, Set up your shopfront, Receive your first brief. Packages was missing — mobile has had it since the packages feature shipped
- [ ] The heading counts them ("Four steps to your first deal"), so adding a step means updating the copy the export drew
- [ ] Pills read **Done** for completed steps, **Set up** for the rest. The export drew every row as "Set up" regardless, which tells a creator to do something they have already done
- [ ] MOBILE IS UNCHANGED. Its checklist and design are not touched by any of this

**The font bug this surfaced**
- [ ] Headings render in the `next/font` face, not system-ui. Check the computed `font-family` resolves to a hashed `__Schibsted_Grotesk_*` name
- [ ] The export's scoped CSS must NOT declare `--font-display` / `--font-ui` / `--font-serif`. It names the families literally ("Schibsted Grotesk"), which only resolves via its own `@font-face` blocks — and those are dropped on import because next/font already serves them. Declared, they override the app's tokens with a name nothing loads, and every heading silently falls back to system-ui
- [ ] The converter strips those tokens, so a re-import cannot reintroduce it

### 71. Get started: payment method step, progress, and hiding when done

Applies to BOTH the mobile and desktop dashboards.

- [ ] Five steps: Connect your socials, Set your packages, Set up your shopfront, **Add a payment method**, Receive your first brief
- [ ] "Add a payment method" links to `/creator/payments?from=dashboard` and is Done when `creators.upi_id` is set
- [ ] `upi_id` is read through the ADMIN client — it is withheld from client roles as PII — and only the boolean leaves the page, never the value
- [ ] The heading shows "N% complete", with a FULL-WIDTH progress bar beneath it
- [ ] The bar spans the same width as the step rows it measures. On desktop the heading sits in a 320px flex column, so a bar placed under it inherits that and stops a third of the way across — it belongs above the steps, not under the heading
- [ ] Fill width matches the stated percentage, and `role="progressbar"` carries `aria-valuenow`
- [ ] The width transitions rather than jumping, so completing a step is visible
- [ ] The percentage counts FOUR steps, not five. "Receive your first brief" is what happens when the others are done, not a task — counting it would pin a finished creator at 80% for reasons outside their control
- [ ] At 4/4 the whole Get started section DISAPPEARS on both. A checklist with nothing left on it is a row of ticks taking the top of the screen
- [ ] Verify all four combinations: desktop and mobile, part-done and all-done. Both must agree
- [ ] The desktop heading counts the steps in words ("Five steps to your first deal"), so adding another means editing that copy too

### 72. Deliverable lists per platform

- [ ] Instagram offers: Reel · Static/Carousel · Story · Other / Custom
- [ ] YouTube offers: Shorts · Long form · Integration · Other / Custom
- [ ] Ops reads the SAME source (`PRODUCT_TYPES_BY_PLATFORM`), so its product form offers the same lists — check both after any change
- [ ] Switching channel mid-form resets a deliverable the new platform does not offer

**Retired names must keep working**
- [ ] The old names (Sponsored Reel, YouTube Integration, Carousel Post…) remain in `PRODUCT_TYPES`. `savePackage` validates against that list, so removing them makes EDITING a pre-existing package fail on a value its creator never chose
- [ ] Opening a package whose type is retired keeps that type SELECTED and listed first. Without it in the options the select falls to the first entry, and saving silently retypes someone's package — a data change nobody asked for and nobody would notice
- [ ] Retired names are only offered on the package that already uses one; new packages never see them
- [ ] "Other / Custom" keeps its spacing. Writing "Other/Custom" would create a second bucket that splits the aggregate

### 73. Shopfront editor: age bands, labels, and the creator's own preview

**Age breakdown**
- [ ] The LAST band (45+) is READ-ONLY and derived: 100 minus the three above it. Four numbers that must total 100 is arithmetic homework
- [ ] The four can never total more than 100 — each input is clamped by what the others already take
- [ ] Typing 45 into a field showing 0 gives "45", not "045". The old field was `type="number"` with a numeric value: typing produces the string "045", parseInt gives 45, React sees its value prop unchanged at 45 and never rewrites the DOM, so the stray zero stays on screen. It is a controlled STRING now
- [ ] Non-digits are stripped and input is capped at 3 characters
- [ ] The derived band is floored at zero — a shopfront saved before the clamp existed can hold bands that overflow 100

**Labels**
- [ ] "Repeat brands" reads "Deals per month" in BOTH the editor field and the published highlight

**The creator's own preview**
- [ ] "Create an offer" and "Start a deal with…" do NOT appear in the editor preview. They are a brand's actions; on the creator's own screen they invite someone to make an offer to themselves
- [ ] They DO still appear on the public `/c/<slug>` page — verify there after any change here, since both surfaces render the same component

### Content showcase — cover, video, and the link out

**Editing (desktop and phone — same control)**
- [ ] Upload an image on a showcase item; it appears on the card in the preview
- [ ] Upload an MP4; the card shows the clip, not a placeholder gradient
- [ ] Upload a video BIGGER than 6 MB. This is the case that was broken: the
      file must not pass through a server action, whose body cap is 6 MB
- [ ] Try a 60 MB video — rejected with the size named, not "upload failed"
- [ ] Try a .pdf — rejected by type
- [ ] Bucket check after any environment rebuild: `storefronts` must allow
      video/mp4, video/quicktime, video/webm at 50 MB. It shipped image-only at
      5 MB, so no application limit could make a clip work (migration 0481)
- [ ] Reorder two items AFTER uploading covers to both; each keeps its own cover.
      (Paths are UUIDs, not positions, precisely so this holds)
- [ ] "Remove" clears the cover and the card falls back to the gradient

**Published `/c/<slug>`**
- [ ] Tapping a card with a link opens it in a new tab
- [ ] Tapping a card with NO link does nothing, and does not look tappable
- [ ] On a video card, the play control starts the clip and does NOT navigate —
      this is the regression to watch: the card is an anchor, so play must call
      both preventDefault and stopPropagation
- [ ] Video is muted on load and unmutes on the first press of play

**In the editor's own preview**
- [ ] Tapping a card does NOT navigate away from the editor

**Phone layout (<=768px, and in any narrow render of the component)**
- [ ] Views and engagement are VISIBLE without hovering. The desktop card hides
      them behind a hover accordion, which on touch meant they never appeared
- [ ] Cards scroll horizontally and snap; media is 9/13

### Minted phone-signup addresses are never shown

A phone-only creator has `creator_<phone>@auth.guapd.internal` in GoTrue. It is
a routing artefact, not their address.

- [ ] Sign in as a phone-only creator. The desktop profile dropdown shows the
      name and NO email line
- [ ] `/creator/settings` — the Email field is EMPTY, not pre-filled with the
      minted address (it is editable; a pre-fill would have saved it back as
      though the creator had entered it)
- [ ] The signup notify screen does not offer to email them at that address
- [ ] A Google-signed-in creator DOES still see their real address in both places
- [ ] Nothing is ever sent to `@auth.guapd.internal` (lib/email.ts and
      lib/synthetic-email.ts share one list — check both if the domain changes)

### Careers — per-role application questions

**Ops (`/ops/careers/<id>`)**
- [ ] Add a question, mark it Required, save, reopen — it is still there and still required
- [ ] Add several, "Move up" reorders them, and the application form matches that order
- [ ] Remove a question; applications already received still show its answer in the
      email that was sent (answers are recorded with the PROMPT, not the id, precisely
      so a deleted question does not orphan an answer)
- [ ] Click "Add a question", leave it blank, save — the blank is dropped, the role
      still saves, and the other edits are NOT lost
- [ ] Ten questions is the cap; the button disables

**Applicant (`/careers/<slug>`)**
- [ ] Questions appear in ops order, each with a text box
- [ ] Optional ones are labelled "(optional)"; required ones block submit when empty
- [ ] A role with NO questions looks exactly as it did before

**Security — the browser is not the boundary**
- [ ] Call submitApplication directly with the required question's field omitted.
      It must be REJECTED. Questions are re-read from the database inside the
      action; a posted list would let a caller decide what was required
- [ ] Post 3000 characters into an answer — rejected at 2000
- [ ] Post `application_questions` as a non-array to updateRole — rejected by the
      action, and by the DB CHECK behind it

**Data**
- [ ] `job_roles.application_questions` defaults to `[]` for existing roles, so a
      role written before this feature still opens and saves

### Shopfront on a phone — past collaborations carousel

The desktop marquee renders every brand TWICE so its loop wraps without a seam.
On a phone the same DOM becomes a hand-scrolled carousel, where a second copy is
simply the list repeated.

- [ ] Each brand appears EXACTLY ONCE on a phone. Scroll to the end and count
- [ ] Desktop still auto-scrolls, still seamless, still pauses on hover
- [ ] A screen reader announces each brand once, on BOTH sizes (the duplicates
      carry aria-hidden)
- [ ] The last card can be scrolled fully into view — no edge fade clipping it
- [ ] Cards snap, are ~68% of the screen wide, and the logo panel is 110px
- [ ] With ONE collaboration: desktop marquee still works, phone shows one card

### Shopfront: two renderings, one page

Below 768px the page renders ShopfrontMobile (generated from the mobile export);
at or above it, ShopfrontPreview's own markup. Both are in the DOM; CSS chooses.

**The regression this design exists to prevent**
- [ ] Open /c/<slug> on a DESKTOP browser. The desktop layout must appear —
      not the mobile one. An early return would have broken this at every width,
      which is how the desktop empty states were replaced once already
- [ ] Resize across 768px. The layout swaps with no reload
- [ ] Hard-reload on a phone. No flash of the desktop layout first (the choice is
      CSS, so the server sends both and neither is wrong on arrival)

**Mobile rendering works, not just renders**
- [ ] Rate card +/- changes quantities AND the total label
- [ ] "Create an offer" carries the CURRENT selection into /deals/new — not an
      empty one. Select two items, tap it, confirm they are pre-filled
- [ ] Instagram / YouTube tabs switch the audience block
- [ ] Share copies the shopfront link and the label confirms it
- [ ] Instagram and YouTube links open the creator's REAL profiles (the export
      hardcodes sample handles)
- [ ] No link navigates to a *.dc.html design file

**In the editor preview**
- [ ] Tapping "Create an offer" does NOT navigate the creator off the editor
- [ ] The narrow preview pane shows the MOBILE rendering (container query, since
      @media sees a wide viewport there)

**Scoping**
- [ ] The marketing site, dashboard and ops screens are unchanged. The export
      shipped 10 :root blocks and 32 custom properties; all are scoped to .sfm

### Package names carry their platform

New packages are named "Instagram Reel", "YouTube Shorts" and so on. The bare
names are RETIRED, not deleted — savePackage validates against the same list, so
removing them would fail an edit on a value the creator never chose.

- [ ] Create a package on Instagram: the type list offers Instagram Reel /
      Instagram Static/Carousel / Instagram Story / Other
- [ ] YouTube offers YouTube Shorts / YouTube Long form / YouTube Integration
- [ ] Open a package created BEFORE this change (type "Reel"). It still loads,
      still shows "Reel", and still SAVES — this is the case the retired list
      exists for
- [ ] The phone rate card shows each name once, not "Instagram Instagram Reel"
      (it prefixes legacy names at display time and skips those already prefixed)
- [ ] Brand side and ops show the same names as the creator set

### Collab & boosting add-ons — MONEY, test adversarially

**Creator rates (`/creator/packages`, per channel)**
- [ ] Set collab as a % on Instagram and a FIXED amount on YouTube. Both persist
      independently — rates are per channel, not per creator
- [ ] Enter 10.5% — stored as 1050 basis points, redisplays as 10.5
- [ ] Try 101% — rejected by the action AND by the DB CHECK
- [ ] Set a type with no amount — rejected (half-set rates cannot be priced)
- [ ] Clear a rate; the brand-side control for that channel disappears entirely

**Offer builder (brand)**
- [ ] Collab/Boosting appear ONLY for channels where the creator set that rate
- [ ] 10% collab on a ₹40,000 Short shows ₹4,000; on a ₹60,000 Reel, ₹6,000 —
      the percentage is of THAT deliverable's price
- [ ] Both on one deliverable: they stack
- [ ] Quantity 2 with collab = two collab charges
- [ ] Type a manual price override: collab/boosting controls DISAPPEAR, and the
      saved items carry no add-on columns even if toggles were set beforehand
- [ ] The header total matches the sum of the deliverable lines exactly

**Rounding (the reason this feature is risky)**
- [ ] Boosting ₹10,000/30 days for 17 days = ₹5,666.67, NOT 17 × ₹333 (₹5,661).
      Per-day is displayed only; the charge rounds once
- [ ] A deal's stored total equals the sum of its stored line amounts, to the
      paise. Never recomputed from the rate — on a three-line worked example the
      two approaches differ by ₹16.67
- [ ] Every stored amount is an integer; no column ever holds a fraction

**Tamper check (server is the boundary)**
- [ ] Call createDeal directly with `collab_charge_paise` set to 1 while sending
      a real rate. The STORED value must be the recomputed amount, not the 1

**Invoice / breakdown (deal detail pages, both sides)**
- [ ] Brand and creator see the same figures — literally one component, so a
      difference means one page's SELECT is missing the add-on columns
- [ ] A deal with NO add-ons shows no breakdown block at all (hasAddons gate)
- [ ] Boosting shows "N days · ₹X/day"; collab shows "10% of ₹60,000"
- [ ] Lines add to the deliverable total; deliverable totals add to the deal total
- [ ] Platform fee is calculated on the FULL total, add-ons included

**Compatibility**
- [ ] A deal created before this change shows no add-on lines and its total is
      unchanged
- [ ] A campaign draft's total includes add-on columns when placements carry
      them (draft-actions), so a draft cannot quote less than the deal charges

**RLS**
- [ ] A brand can READ a vetted creator's addon rates (needed to price an offer)
- [ ] A brand CANNOT write them
- [ ] Rates for a non-vetted creator are not readable by other users
- [ ] Rates do NOT appear on the public `/c/<slug>` payload

### Revisions are ONE policy per creator (migration 0486)

A revision is a ROUND of feedback: revisions_used increments once per
delivered -> revision transition, however many deliverables that round touches.
Terms therefore live on the creator, not the package.

- [ ] `/creator/packages` shows ONE "Revisions" block, above the channels — not
      one per package
- [ ] Off means unlimited and free, and the block says so
- [ ] The offer builder shows that creator's free count regardless of WHICH
      packages are selected
- [ ] THE BUG THIS FIXES: select a generous package and a stingy one together.
      The deal must NOT drop to the stingiest allowance — the old min() across
      packages could take a three-deliverable deal to zero rounds
- [ ] Send back three items in one review round: revisions_used goes up by ONE

**Backfill (0486)**
- [ ] Each creator's policy equals the MAX included and MAX per-extra across
      their active packages — a migration must never shrink terms a brand was
      already offered
- [ ] A creator with no active packages comes out disabled (unlimited)
- [ ] Deals created before this are untouched: their terms are already
      snapshotted on the deal row

### Package revisions (superseded by 0486 — kept for the columns' history)

`included_revisions` and `price_per_extra_revision_paise` existed since 0080 but
were editable from OPS ONLY — a creator was never asked, so every package
silently offered one free revision.

- [ ] A NEW package opens with revisions OFF; ticking it reveals the two fields
- [ ] An EXISTING package opens with revisions ON — migration 0485 backfills
      true, so nothing a creator already published changes behaviour
- [ ] Save with revisions off, reopen: still off, and both figures are zero
- [ ] Try to store `revisions_enabled = false` with `included_revisions = 3`
      directly — the DB CHECK must refuse it
- [ ] Leading zeros cannot be typed into either field

**Offer builder revisions control**
- [ ] The free count is READ from the selected packages and is not editable —
      a brand choosing "1 included" when the creator gives 2 was choosing away
      something already theirs
- [ ] +/- adds extra revisions on top; it cannot go below the free count
- [ ] With a per-extra price set, adding 2 extra shows "2 × ₹X = ₹Y, charged
      only if used" — and the DEAL TOTAL does not change. Revisions are billed
      on the invoice from actual usage; adding them to the price here would
      charge twice
- [ ] Selecting packages with no revision terms shows "Unlimited", not "0 free"

**No revision terms means unlimited and free**
- [ ] Build a deal from a package with revisions OFF. The deal reads "Unlimited",
      NOT "0 included" — nothing was agreed, so nothing is being exceeded
- [ ] Request several revisions on that deal: no over-limit warning, and the
      invoice overage is ₹0
- [ ] A package with 0 included AND a per-extra price still reads as chargeable
      from the first revision — that IS an agreed term and must not be confused
      with the case above
- [ ] Brand screen, creator screen and the offer card all use one label helper,
      so they cannot describe the same deal differently

**Offer builder consequence (no code change — this is why disable zeroes)**
- [ ] Select only a package with revisions OFF: the deal's revision terms come
      out 0 free, ₹0 per extra
- [ ] Select one package with 2 free and one with revisions off: the deal offers
      min(2, 0) = 0 free — the stricter package wins, which is the safe direction

### creators uses a COLUMN-LEVEL SELECT allowlist — read this before adding a column

0470 revoked blanket SELECT on public.creators and granted an explicit column
list. A column added without being granted makes every query naming it fail with
"permission denied for table creators" — the WHOLE query, not just that column.

- [ ] After ANY migration adding a column to creators: grant it in the same
      migration, and add it to the allowlist in rls.sql
- [ ] Regression check, as a real signed-in creator (not the admin client):
      `select id, full_name, vetting_status from creators where user_id = <own>`
      must return the row. Admin-client tests CANNOT catch this — they bypass
      grants entirely
- [ ] Symptom to recognise: every creator is redirected to
      /signup/creator/onboarding. That is the layout's `!creatorName` branch
      firing because the read failed, not a routing bug

### Packages are editable from the shopfront editor, without leaving it

The rate card step used to LINK to /creator/packages, so tapping it mid-edit
discarded everything typed since the last save. The same PackageForm now opens
in place.

- [ ] Fill several wizard cards, add a package, close the form: the wizard work
      is all still there and the new package is listed
- [ ] Edit an existing package from the shopfront; the change shows on
      /creator/packages too
- [ ] Add one on /creator/packages; it appears in the shopfront editor
      (savePackage revalidates both paths)
- [ ] Both screens offer the same channels, price modes and validation — it is
      one component, so a difference means one of them is passing bad props
- [ ] Collab & boosting and Revisions are editable from the shopfront rate card
      step too. The step is the WHOLE rate card, not just the packages
- [ ] Set a collab rate in the shopfront; /creator/packages shows it, and the
      reverse. Same components, same tables — a divergence is a props bug
- [ ] The shopfront page reads these through the RLS-scoped client, so this is
      also the regression check for the creators column grant (0489)

#### Packages

- [ ] A creator can ADD a package. This was broken outright from 0485 until
      0491: included_revisions defaults to 1 while revisions_enabled defaults to
      false, and 0485's coherence CHECK rejects that combination, so every
      insert failed with "Could not save that. Please try again."
- [ ] It failed silently for existing creators: 0485 backfilled existing rows to
      enabled = true, so nothing on the table violated the constraint and only
      the next NEW package did
- [ ] Test on EVERY channel and price mode, not just Instagram exact: the
      constraint has nothing to do with either, so one case proves the rest
- [ ] Editing an existing package still saves
- [ ] Run 0491 BEFORE relying on the app fix alone. The action writes both
      columns now, but any other insert path still takes the column defaults

### Brand dashboard, empty state

- [ ] A brand with zero deals sees the drawn empty dashboard: hero, period
      selector, four zeroed stat cards, the three-step getting started, and the
      empty Deals / Campaigns / Spend / Track record / Reach / Creators sections
- [ ] ApprovalNotice and HeldNotice still render ABOVE it. A brand whose first
      deal is sitting unsent needs to know before it reads the dashboard, and
      the drawn state has nowhere to put a status banner
- [ ] The export's own page wrapper and empty <header> are dropped; there is one
      background and one top nav, not two
- [ ] The marketing CTA at the end of the export is NOT shipped. A brand reading
      its own dashboard has already signed up
- [ ] Every figure on it is genuinely zero. This renders only when the brand has
      no deals, so nothing here is a placeholder awaiting real data
- [ ] "Complete your profile" goes to /settings, the brand profile. The export
      shipped it as href="#", a dead link on the first step of a getting-started
- [ ] "Browse creators & send a brief" goes to /browse
- [ ] The third step has no button: it describes what happens after a creator
      accepts, which is not something the brand can go and do
- [ ] Internal links are next/link, not <a>. An <a> to an app route is a full
      document reload
- [ ] ALL EIGHT sections render. The export hides .sr elements at opacity 0 and
      reveals them with an inline script that the converter strips, so seven of
      eight were invisible and the page looked like one section and blank space.
      The scoped CSS overrides .sr to visible, and that override must stay LAST
      in the file: it beats the generated rules at equal specificity, so order
      is what decides it
- [ ] Re-running the converter REWRITES that CSS and drops the override. Re-add
      it, then confirm all eight sections are still on screen
- [ ] Nothing outside /dashboard changes appearance: all CSS scoped under
      .bdash-desk. Same checks as the other ports, no leaks, no self-nesting, no
      comments inside selectors, tokens reachable from the wrapper

### Creator inbox, empty state, desktop

- [ ] A creator with no conversations on a DESKTOP sees the drawn empty state:
      the workspace card, an inert search, four filter chips, ghost rows down
      the left, and the "No messages yet" panel on the right
- [ ] On a PHONE the existing CreatorEmptyState renders, UNCHANGED. Same icon,
      same title, same body. Only its width gating changed
- [ ] The page no longer EARLY-RETURNS the empty state. It rendered at every
      width, which is why desktop showed the phone screen. Third time this
      codebase has had that bug: dashboard, deals, now inbox
- [ ] The filter chips read All / Unread / Active / Completed, the same four
      CreatorInboxView shows. The screen must not change vocabulary when the
      first message arrives
- [ ] The chips ARE styled. The export writes them as style="{{ f.style }}", a
      whole-value binding every converter drops, so they arrive with no styling
- [ ] Search is genuinely not typeable
- [ ] Ghost rows are decorative only, aria-hidden, and carry no text
- [ ] No template bindings or sc-for loops survive in the markup
- [ ] Nothing outside /creator/inbox changes appearance; all CSS is scoped under
      .cinbox-desk. Same checks as the deals port: no leaks, no self-nesting,
      no comments inside selectors, tokens reachable from the wrapper

### Creator deals, empty state, desktop

- [ ] A creator with no deals on a DESKTOP sees the drawn empty state, not
      CreatorDealsTable rendering a toolbar and seven filters around nothing
- [ ] A creator with no deals on a PHONE still sees CreatorDealsEmpty. Both are
      rendered and CSS picks; returning one early fires at every width
- [ ] The two are different drawings, not one scaled. Desktop keeps the search
      field, sort control and seven chips (inert, as the export ships them);
      the phone version drops them because seven chips reading 0 crowd out the
      message on a small screen
- [ ] Search and sort are genuinely NOT clickable. `disabled=""` from the export
      is `disabled={""}` in JSX, which is FALSY, so they shipped interactive
- [ ] Only ONE page background and ONE top bar. The export's outer page div and
      its empty sticky header are dropped; the creator layout supplies both

**The CSS must stay in its box** (this is where the port nearly went wrong)
- [ ] Nothing outside /creator/deals changes appearance. The export ships `*`,
      `body`, bare `a` and ten :root blocks
- [ ] Every rule is under .cdeals-desk, INCLUDING minified ones. A line-based
      scoper misses `.g-card{...}` entirely: 41 rules leaked that way
- [ ] No rule reads `.cdeals-desk .cdeals-desk`. A leading comment left in the
      prelude gets split on the commas inside it and prefixed, producing a
      descendant selector that needs the wrapper inside itself and never
      matches. That silently killed all ten token blocks
- [ ] The design's custom properties actually RESOLVE, i.e. they are defined by
      a rule that targets the wrapper. Checking that a definition exists
      somewhere in the file does not prove this
- [ ] No @font-face rules ship; next/font already serves these faces
- [ ] Fonts match the rest of the creator app, i.e. the export's font tokens are
      dropped so the app's cascade in

## Guapd Growth — the third vetting outcome

vetting_status (pending | deals_approved | growth | rejected) is the SINGLE
source of truth; is_vetted and is_rejected are derived by trigger.

**The encoding is what keeps Growth away from brands**
- [ ] A growth creator has is_vetted = false and is_rejected = false
- [ ] They do NOT appear in /browse, the storefront RPC, or any brand's creator
      picker — no new gating was added, so if one leaks the encoding is wrong
- [ ] A brand cannot send them an offer

**Single source of truth**
- [ ] Write `is_vetted = true` directly on a growth creator: the trigger must
      overwrite it back to false. A surviving old code path is a no-op, not a
      corruption
- [ ] grep the tree: NO code writes is_vetted/is_rejected. Only vetting_status

**Ops**
- [ ] Three actions on a creator: Approve for Deals / Move to Growth / Reject
- [ ] Each is offered only where it would change something (no "Move to Growth"
      on a creator already in Growth)
- [ ] Re-applying the same outcome sends NO second notification
- [ ] Every decision writes an ops_events row with before/after status

**Creator experience**
- [ ] A growth creator lands on /creator/growth, not the under-review page
- [ ] /creator/growth actually RENDERS. It lives under the creator layout, so an
      unconditional redirect there made the page redirect to itself
- [ ] It renders WITHOUT the sidebar/tab bar: a Growth creator is not in the
      Deals flow, and those links would bounce them back to this same page
- [ ] Any other /creator/* path still redirects them here
- [ ] THE APPEAL BOX DOES NOT RENDER for them — growth is checked before the
      rejection branch. Appealing a non-rejection would junk the appeal queue
- [ ] A non-growth creator who types /creator/growth is redirected away
- [ ] WhatsApp: the same neutral status_update; the link routes by status
- [ ] Email: "You've been approved for Guapd Growth" — positive, not a softened
      rejection. Page heading and email heading say the same thing

**Copy must not read as a consolation prize**
- [ ] Guapd Growth is NOT framed as learning-only. A Growth creator is told
      brand deals are coming to them, not that they are locked out of deals
- [ ] Page, tiers and email all say deals are on the way. Nothing says "when
      you're good enough" or implies the track is a waiting room
- [ ] Guapd Deals tier still reads "Locked", but its body is "Opens up for you
      as you grow", not "when you're approved"
- [ ] The Deals tier does NOT say a creator can "send" offers. Brands send,
      creators receive. What the tier offers is running the deal directly
- [ ] The wait is stated as a forward promise ("soon", "we're lining up"), never
      as deals being available now. Growth creators are invisible to brands by
      construction, so present tense would be a false claim

**Desktop**
- [ ] At >=768px the page has a top nav: guapd wordmark left, Dashboard and
      Profile centred, avatar and Sign out right. Shaped like the creator top
      nav so Growth reads as the same app
- [ ] The nav carries ONLY Dashboard, Profile and sign out. No Deals, Payments
      or Shopfront: every one of them redirects back to this page
- [ ] The bottom tab bar is HIDDEN on desktop and present on a phone. It was
      fixed at every width, because this page has no sidebar to host navigation
- [ ] Only ONE sign out is visible per width: the header's on desktop, the
      Profile tab's on a phone
- [ ] Header bar is 1280px wide, the SAME as the creator top nav. Padding,
      radius, gap and shadow already matched; only the width did not
- [ ] Help & support is reachable at BOTH widths: in the profile menu on
      desktop, as a row on the Profile tab on a phone
- [ ] It opens the real contact dialog (ContactLink/ContactModal), the same one
      the footer opens. NOT a link to /creator/settings, which Deals uses and a
      Growth creator cannot reach -- that would be a link into a redirect loop
- [ ] The dialog still writes its events row, i.e. ContactLink was reused rather
      than the modal being rewired by hand
- [ ] Cards, tiers and profile rows are at desktop sizes, not phone sizes. Every
      one of them was transcribed from a phone export and never scaled up
- [ ] The top nav is rendered at every width and hidden by CSS, NOT gated in JS.
      A width read is wrong during the server render and flickers on the client
- [ ] The quiz modal still covers the top nav (scrim 10100 vs nav 30)

**Type matches the rest of the creator app**
- [ ] Growth page and BOTH quiz modals render in Schibsted Grotesk, the same as
      the Deals dashboard. Not Sora/Inter
- [ ] "Hey, <name>" is in Instrument Serif italic, not the Georgia fallback
- [ ] Why this breaks: the tokens live on .creator-main. The Growth page is
      handed through bare by the layout, and every modal is portalled to <body>,
      so both are outside it and fall back to :root, where --font-serif does not
      exist at all. Any new surface outside .creator-main needs the same block

**Header**
- [ ] Before the quiz: "You've been approved for Guapd Growth" plus the lede
- [ ] After the quiz: "Hey, <name>" in the Deals dashboard's serif italic, then
      the Coming soon card, then the tiers. A dashboard that re-announces the
      vetting decision on every visit reads like a holding pen
- [ ] The Coming soon body is three lines, not a paragraph

**The waiting message appears ONLY after the quiz**
- [ ] Before answering: neither the page nor the email says the tools are
      unbuilt. Telling someone it is not ready is an invitation to skip the
      questions that decide what gets built
- [ ] After answering: the Dashboard tab shows "Coming soon" with what is being
      built
- [ ] The Growth EMAIL does not say "coming soon" either

**Tiers (Dashboard tab, after the quiz)**
- [ ] Two tiers listed: Guapd Growth marked "Coming soon", Guapd Deals marked
      "Locked" with a lock icon
- [ ] Guapd Deals is SHOWN dimmed, not hidden — the point is that the creator
      can see the rung above them and what reaches it
- [ ] Neither tier is a link. Nothing here is clickable yet

**Copy rules that apply everywhere**
- [ ] Never "Growth" on its own in anything a person reads — always "Guapd
      Growth". Covers the page, the email, and the ops buttons
- [ ] Never "first brand deals" — just "brand deals"
- [ ] No em dashes in any email, WhatsApp message or on-site copy, including
      `&mdash;` entities. Code comments are out of scope
- [ ] A lone dash used as a "no value" placeholder (ops tables, empty stats) is
      a hyphen, NOT a comma — a blanket em-dash sweep turns these into ", "

**Tabs**
- [ ] Two tabs only, Dashboard and Profile — no Deals, Payments or Shopfront,
      which would bounce back to this page
- [ ] Profile shows name, phone and channels, read-only
- [ ] Sign out is on the Profile tab and lands on /login/creator — NOT the brand
      sign-in page, which would offer to set up a brand for them

**Quiz is a MODAL over the dashboard, same as the Deals welcome flow**
- [ ] It renders OVER the Growth page, not in place of it and not on its own
      route. What they were approved for is visible behind what is being asked
- [ ] Portalled to <body>. Rendered in place it would paint UNDER the tab bar,
      which is a sibling at z-index 10000 of a z-index:1 stacking context
- [ ] The Growth tab bar is hidden while it is up (`body.wq-modal-open
      .gr-tabs`), and comes back on unmount. welcome.css only hides
      `.creator-tabbar`, which this page does not use
- [ ] Non-dismissable: no close control, Escape does nothing, the scrim ignores
      clicks
- [ ] The page behind does not scroll while it is open
- [ ] On finishing, the modal unmounts and the dashboard is revealed WITHOUT a
      reload
- [ ] Behind the scrim before answering: badge, heading and lede only. NOT the
      tiers and NOT "Coming soon"

**Quiz**
- [ ] FOUR questions, one per screen. Q1 posting frequency, Q2 goal, Q3 niche,
      Q4 "Anything else you'd like us to know?"
- [ ] Q1-Q3 are required: Continue stays disabled until an option is chosen
- [ ] Q4 is OPTIONAL — Finish is enabled with the box empty, and an empty box
      stores null rather than an empty string
- [ ] Q3 "Other" still reveals its own text box
- [ ] Progress reads "1 of 4" through "4 of 4"
- [ ] Shows ONCE — gated on the response row existing, not a separate flag
- [ ] Submitting twice (double-tap, stale tab) is not an error
- [ ] An unknown code is refused by the CHECK
- [ ] UPDATE and DELETE are denied by RLS

**social_accounts must be MERGED, never rebuilt**
- [ ] Save the profile in creator settings, then check the creator still appears
      under their follower band in ops. Settings kept only platform and handle,
      so it deleted follower_range, the trigger nulled creators.follower_band,
      and the creator silently left every band filter
- [ ] Same after an ops edit: SocialAccountEntry has no follower_range either
- [ ] The storefront's per-channel numbers (follower_count, avg_views,
      interactions, views, watch_time) survive both saves
- [ ] Removing a channel still removes it; adding one starts it bare
- [ ] KNOWN LIMIT: renaming a handle does not carry that channel's extras.
      Matching is on (platform, handle), and guessing which old entry a renamed
      one was would risk attaching one channel's range to another
- [ ] Any NEW writer of social_accounts goes through mergeSocialAccounts. The
      column accumulates keys owned by four different screens, and rebuilding it
      from one screen's fields deletes the other three's

**Creator list filters**
- [ ] Status filters on vetting_status, multi-select, all four values
- [ ] Shopfront is a RADIO: Any / Has one / None. "None" is a real question and
      an unchecked box cannot distinguish it from "do not care"
- [ ] Filters combine: status + shopfront + band together
- [ ] The summary line AGREES with the table. Its counts run through the same
      filter as the list; they previously carried only the bands, so filtering by
      status gave a breakdown that did not add up to the total above it
- [ ] Pagination keeps every filter, not just the bands
- [ ] Clear appears when ANY filter is set, not only a band
- [ ] Shopfront=Has one with zero storefronts anywhere returns nothing rather
      than erroring: .in() with an empty list is a syntax error, not an empty set
- [ ] An invented ?status=whatever is dropped, not passed to the database

**Deciding from the creators LIST**
- [ ] Each row carries Deals / Growth / Reject, and the detail page still has
      its own copy. Working a queue should not mean opening every profile
- [ ] Both surfaces call the SAME server actions, so decideVetting stays the
      single writer of vetting_status and the emails and ops_events are
      identical whichever one is used
- [ ] A button only appears where it would CHANGE something, keyed on
      vetting_status. A Growth creator is is_vetted false, so a boolean test
      would offer to approve someone already decided on
- [ ] Every action confirms first, including from a row. Reject emails the
      creator, and a misclick in a dense table is easier than on a profile page
      opened deliberately
- [ ] The row's status badge updates without a manual reload
- [ ] Header and body cell counts still match after adding the column

**Ops shows the vetting state, all four of them**
- [ ] A Growth creator reads "Vetted for growth", NOT "Pending". This is the bug:
      a Growth creator is is_vetted false AND is_rejected false by construction
      (0487), so every `is_vetted ? ... : is_rejected ? ... : 'Pending'` fell
      through to Pending and reported an approved creator as un-reviewed
- [ ] Same badge on all three ops surfaces: creator list, creator detail,
      creator edit. All three had their own copy of that ternary
- [ ] Labels: "Vetted for deals", "Vetted for growth", "Pending", "Rejected"
- [ ] The list summary counts growth separately. It was inside `pending`, which
      is the number the vetting queue is worked from
- [ ] Every query behind a badge SELECTs vetting_status. Without it the fallback
      cannot tell growth from pending, because the booleans do not encode it
- [ ] Move a creator Growth -> Deals and back; the badge follows on all three

**Ops can see the answers**
- [ ] /ops/creators/[id] → Questionnaire tab shows the Growth answers for a
      Growth creator, badged "Guapd Growth", with the date
- [ ] A creator answers the Deals questions OR the Growth quiz, never both, so
      the tab shows whichever exists. A Growth creator must NOT sit permanently
      on "No response"
- [ ] "Their words for the niche" appears only when they picked Other
- [ ] Blank "Anything else" is omitted, not shown as an empty row
- [ ] /ops/insights has a Guapd Growth section below the Deals one, with a
      distribution per coded question and the free text underneath
- [ ] Its denominator is creators with vetting_status = 'growth', NOT
      is_vetted — Growth creators are is_vetted false by construction (0487),
      so the approved count would be the wrong denominator
- [ ] The two cohorts are NOT merged into one distribution: different questions,
      different population
- [ ] Options nobody picked still show, greyed, at 0%
- [ ] Free-text quotes are attributed by creator name

**Migration 0490 (Q1 replaced, Q4 added)**
- [ ] Applied to staging BEFORE the deploy: the action inserts
      posting_frequency, so an unmigrated DB fails every submission
- [ ] Rows answering the OLD Q1 are deleted, not mapped. A follower band cannot
      become a posting cadence, and deleting re-opens the quiz for them —
      correct, since they have not answered the question now asked
- [ ] Re-running the migration deletes nothing (no row has a null frequency)
- [ ] follower_band is dropped from the QUIZ table only. creators.follower_band
      (0474) is a different column and the ops band filter still works

**growth -> deals_approved**
- [ ] Promoting a growth creator sends the normal approval email AND queues the
      post-approval onboarding questions, exactly as a fresh approval does

---

| When | What to run |
|------|-------------|
| After any query/auth/RLS change | CRITICAL: Security / RLS Checks (full) |
| After redesign (Chandreyee) | Full checklist (all sections) |
| Before app build (Expo) | Full checklist — confirms web parity baseline |
| Pre-pilot | Full checklist + realtime environment check |
| Pre-launch | Full checklist + performance under load |

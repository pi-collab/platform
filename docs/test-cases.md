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

---

| When | What to run |
|------|-------------|
| After any query/auth/RLS change | CRITICAL: Security / RLS Checks (full) |
| After redesign (Chandreyee) | Full checklist (all sections) |
| Before app build (Expo) | Full checklist — confirms web parity baseline |
| Pre-pilot | Full checklist + realtime environment check |
| Pre-launch | Full checklist + performance under load |

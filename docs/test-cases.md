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
- [ ] "Accept" sets `localStorage.guapd_analytics_consent = 'yes'`, dismisses banner.
- [ ] "Decline" sets `localStorage.guapd_analytics_consent = 'no'`, dismisses banner.
- [ ] Banner does NOT re-appear after choice is made (persists across page loads).
- [ ] "Cookie preferences" in footer clears localStorage consent value and re-shows banner.
- [ ] Banner includes link to `/privacy`.

### PostHog / Analytics Consent Gating
- [ ] No PostHog network calls before consent is granted (check Network tab — no `posthog` requests on first load).
- [ ] After "Accept": PostHog initializes, `window.__posthog` is set, `trackEvent()` calls fire.
- [ ] After "Decline": PostHog does NOT initialize, `window.__posthog` is undefined, `trackEvent()` is a no-op.
- [ ] Choice persists across page reloads — PostHog state matches stored consent without re-prompting.
- [ ] Revoking consent via footer "Cookie preferences" → PostHog stops (page reload required for full teardown).

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

| When | What to run |
|------|-------------|
| After any query/auth/RLS change | CRITICAL: Security / RLS Checks (full) |
| After redesign (Chandreyee) | Full checklist (all sections) |
| Before app build (Expo) | Full checklist — confirms web parity baseline |
| Pre-pilot | Full checklist + realtime environment check |
| Pre-launch | Full checklist + performance under load |

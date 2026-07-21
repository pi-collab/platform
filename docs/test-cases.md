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

### BUT-DID-IT-BREAK Checks (locking too hard)
- [ ] Authenticated brand still sees vetted creators on /browse (minus phone).
- [ ] Authenticated brand can still create deals with vetted creators.
- [ ] Creator still sees their OWN deals, invoices, products, notifications.
- [ ] Creator still sees their OWN deliverable items and uploaded files.

---

## Run Schedule

| When | What to run |
|------|-------------|
| After any query/auth/RLS change | CRITICAL: Security / RLS Checks (full) |
| After redesign (Chandreyee) | Full checklist (all sections) |
| Before app build (Expo) | Full checklist — confirms web parity baseline |
| Pre-pilot | Full checklist + realtime environment check |
| Pre-launch | Full checklist + performance under load |

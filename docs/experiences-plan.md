# Guapd Experiences — implementation plan (approved 2026-10-04)

Configurable deal settings; first template "Experience — UGC Day Shoot" (Kiro Beauty).
Phases run in order, each reviewed before the next. Phase 0 (security + truth fixes) is done.

## Locked decisions
- **Two legs.** An Experience is a parent linking **Leg 1** (brand ↔ Guapd, a service
  contract) and **Leg 2+** (Guapd ↔ each creator, a vendor engagement). Each leg reuses
  the existing deal UI for its party.
- **Payment model: Guapd is the principal.** Brand pays Guapd (service invoice); Guapd
  pays creators/crew as its vendors, from its own funds. No brand → creator money on the
  platform. `route_split` stays disabled (not built) until Razorpay Route is confirmed.
- **Portal boundary at the data layer.** Brand reads Leg 1 only: never Leg 2, vendor
  payouts, rates, margin or internal notes. Creator reads only their own Leg 2.
- **No date of birth.** Age bracket (incl. Under 18) stays. City/state stay.
- **GST provisional/editable**: GST/TDS fields present, not computed; GSTIN/ARN editable.
- Existing deals are backfilled `payment_flow = brand_pays_creator_direct`.

## Margin model (store each number separately; never double-count)
In the principal model there is no "fee deducted" on the brand side. There is a
**service price** (what the brand pays Guapd) and a **vendor cost** (what Guapd pays
the creator). Margin is the gap. The 30% sizes the creator payout and equals Guapd's
margin on that creator.

Stored per creator (Leg 2) and rolled up per Experience:
| Field | Meaning |
|---|---|
| `brand_service_total_paise` | Leg 1: the one service price the brand pays (built from per-deliverable × count + billable cost lines) |
| `creator_gross_paise` | Leg 2: the creator's rate (e.g. day rate × days) |
| `platform_pct` | Leg 2: 30 (default), snapshotted |
| `creator_net_paise` | `creator_gross − round(creator_gross × platform_pct / 100)` = the vendor payout |
| `guapd_margin_paise` | per creator: `creator_gross − creator_net`; Experience total also includes `brand_service_total − Σ creator_gross − Σ other vendor costs` |

Shown per audience:
- **Brand (Leg 1 invoice):** ONE service price. No Guapd fee / 30% line, no creator rates.
- **Creator (Leg 2):** rate → 30% platform fee → net (₹10,000 → 30% → ₹7,000), same as Growth.
- **Ops P&L (internal):** brand price; each creator's gross, 30%, net payout; margin per
  creator and in total; other vendor costs. Built in Phase 3/4.

## Payouts: real messages only from real money
- `lib/payouts/` exposes a `PayoutProvider` interface. v1 = `manual` provider (ops records
  the transfer and its UTR/reference). `razorpayx` provider is stubbed behind it.
- **The creator "payment released / paid" message and the real UTR fire ONLY from
  RazorpayX's payout-success webhook** (`payout.processed`), never from a button or stub.
  Under the manual provider, the message fires when ops records a payout as paid with its
  bank reference, and says exactly that ("Guapd paid you ₹X · ref …").
- Idempotency key per payout; approval step before transfer; every action writes
  `logOpsEvent`.
- To activate RazorpayX: RazorpayX account on a company current account + KYC;
  `RAZORPAYX_KEY_ID`, `RAZORPAYX_KEY_SECRET`, `RAZORPAYX_ACCOUNT_NUMBER`, webhook secret;
  a contact + fund account per vendor; webhook route; funded account.

## Isolation: existing deals must not change
- Experience margin code lives on the two-leg path only. Existing brand↔creator deals
  never call `resolveDealFee` with Experience settings and never reach the two-leg branch;
  the margin calculation is a separate function, not a new rung on the existing ladder.
- **Guard:** `scripts/test-fee-golden.ts` holds a 123-case baseline of today's
  `calculateFee` and `resolveDealFee`, captured 2026-10-05 before any Experience code.
  It must pass, byte-identical, after Phase 2 and after every later phase. Re-baselining
  is allowed only for a deliberate fee change, never to clear a diff.
- **Guard:** `scripts/walk-deal-guard.ts` (45 transitions) re-runs on staging after each
  phase; every legit move must still be allowed.

## Razorpay is ADDITIVE; the manual flow stays
- The `razorpayx` provider is built alongside, behind `PayoutProvider`. The existing
  manual "mark as paid" flow (marketplace deals) and the manual payout provider
  (Experiences) are NOT removed or altered. They keep working until Razorpay is live and
  verified, and remain as the fallback after.
- The real "paid" WhatsApp and reference fire from Razorpay's payout-success webhook only.
  Until then the manual path stands, with its truthful wording.
- **KYC:** done with Razorpay for each creator/vendor where required, as part of the
  Razorpay integration (not before).

## Two separate settings schemas (never merged)
Brand settings are for INVOICING the brand. Creator settings are for PAYING the creator.

**Brand company / tax settings: needed SOONER (we invoice Kiro now).** Build with the
service invoice work (Phase 4), not with Razorpay:
- legal entity name, billing address, state (drives IGST vs CGST+SGST), GSTIN, PAN;
- optional verification uploads: GST certificate, certificate of incorporation. Stored,
  non-blocking;
- Guapd's own GSTIN on the invoice is marked provisional until our GST registration comes
  through.
- **Never collect brand bank-account details.** Money flows brand → Guapd → creator; we
  never debit a brand to pay a creator. Holding brand bank details would be
  payment-aggregator risk.

**Creator payout settings: later, in the RazorpayX phase:**
- bank account number, IFSC, PAN, GST-registered yes/no (and KYC via Razorpay);
- today only `creators.upi_id` exists. It expands into `vendor_payout_details`
  (service-role only, off `creators`) at that point.

## Phases (strict order; stop and review after each)
0. ✅ Security + truth fixes (0520, 0521; copy; legal pages factual + "pending legal review").
1. Schema + RLS, migrations 0520+ → actually **0522+**, run by hand, verified via
   `information_schema`, ledger kept with `supabase migration repair`:
   `deal_templates`; deal settings snapshotted onto deals (+ backfill); Experience parent
   linking Leg 1 / Leg 2+; `deal_deliverable_items.visible_to_creator`, `added_by`;
   `deal_cost_lines`; `vendors` + `vendor_payout_details` (service-role only, off
   `creators`); `service_invoices` (many per Experience, numbered, GST/TDS fields,
   GSTIN/ARN editable); `vendor_payouts`; `deal_follow_ons`; shared creator roster
   (brand accept/reject, guapd-add, locked); `creator_private` (PAN, day rate); the margin
   fields above. `rls.sql` in the same commits; security test cases prove the boundary.
2. `lib/`: `deal-settings` (enums, validator, `resolveDealSettings`), `deal-flow`
   (incl. `on_shoot_done`), `payouts/` (interface + manual; razorpayx stub), margin
   calculation (brand price − vendor payouts). `resolveDealFee` ladder untouched.
3. Guapd account + ops control room: create from template, deliverables (visibility),
   cost sheet, roster, internal notes, mark shoot done, roster → Leg 2, deliverables →
   brand, **margin / P&L view**.
4. Money: service invoices (initial / additional / follow-on), record brand payment +
   reference; vendor payouts (manual) with approval, reference, idempotency; affiliate
   follow-on (sales entered/verified, creator invoices Guapd, pays creator % − 30%).
5. Creator side (Leg 2): "Brand · Managed by Guapd", day-rate counter, visible-only
   deliverables, no upload step, rate / 30% / net, payout details (UPI + bank/IFSC/PAN),
   affiliate invoice, real paid status.
6. Brand side (Leg 1): request + deliverable builder, creator pre-selection, shared roster
   (accept/reject, profiles not rates), negotiation, one service price, pay Guapd, chat,
   receive/approve deliverables, post links + analytics.
7. Per-day rate on packages page; city/state filter on `/browse`; age bracket on
   Experience creators.

## Phase 2.5 — brand-end Experience report (SCOPED, not built; awaits review)
A read-only report for the brand on its Experience, with its own RLS surface:
- **Shows:** the brand's service invoice(s) (number, kind, per-video × count + misc,
  totals, status, payment reference); the roster as **names and profile links only**;
  deliverables (visible items: label, status, delivered link); content analytics where
  posted (views/reach from the creator's connected Instagram snapshot, aggregated).
- **Never shows:** any creator rate, gross, platform %, net, payout, cost line, margin,
  internal note, or Leg 2 row.
- **Data surface:** a dedicated SECURITY DEFINER function (or view) returning exactly the
  report columns for `my_brand_id()`, so roster names come through WITHOUT granting
  brands broader read on `creators`; explicit column lists everywhere, no `select *`.
- **Tests:** the brand can read its report; the report payload contains no money field
  other than its own invoices; another brand gets nothing; a creator gets nothing.

## Separate workstreams (not Experiences)
- `lib/fee.ts calculateFee` float rounding: an exact half paisa can round DOWN on
  non-integer rates (33.3% of 7,500p). Fixing it changes 2 baseline cases, so it needs a
  deliberate decision and a re-baseline. Experiences use integer track rates and are
  unaffected.
- Fee collection on marketplace (direct-pay) deals: nothing collects Guapd's fee today.
- Margin definition: Palak specified brand − Σ creator gross − Σ costs; the cash view
  (− Σ creator NET) is also computed. Confirm which is "margin" for the P&L.
- Legal: lawyer finalises /privacy and /terms; /terms §7 fee wording.
- Playbook copy (Palak).
- Remaining pre-existing bugs from the investigation (counters dropping add-ons, campaign
  send losing add-on columns, client-trusted totals, fee-override reset, preview fee mode,
  Growth billing on held deals, held-deal offer links, audit actor, campaign FK).

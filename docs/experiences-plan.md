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

## Separate workstreams (not Experiences)
- Fee collection on marketplace (direct-pay) deals: nothing collects Guapd's fee today.
- Legal: lawyer finalises /privacy and /terms; /terms §7 fee wording.
- Playbook copy (Palak).
- Remaining pre-existing bugs from the investigation (counters dropping add-ons, campaign
  send losing add-on columns, client-trusted totals, fee-override reset, preview fee mode,
  Growth billing on held deals, held-deal offer links, audit actor, campaign FK).

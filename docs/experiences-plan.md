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
| `guapd_margin_paise` | per creator: `creator_gross − creator_net` (the platform fee kept). Experience total = `brand_service_total − Σ creator_net − Σ other vendor costs` (DECIDED 2026-10-07, see "Margin: definition"); `brand_service_total − Σ creator_gross − Σ costs` is only the sub-total |

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

## Margin: definition (DECIDED, Palak 2026-10-07) and access (to build with it)

**Definition, decided:** `guapd_margin = brand_paid − Σ creator NET − Σ costs`. This is
the true cash Guapd keeps. On the staging test data: ₹3,02,500 in, ₹2,20,999.98 paid out
to creators, ₹0 costs → **margin ₹81,500.02**.

- **₹42,500.02 is the SUB-TOTAL only:** brand_paid − Σ creator GROSS − Σ costs. It is
  never called margin.
- **The P&L shows one margin, two ways, both reconciling to the same number:**
  sub-total ₹42,500.02 + platform fee kept ₹39,000 = **margin ₹81,500.02**. The fee kept
  is a reconciling line between the sub-total and the margin. It is NEVER added to a
  separate total, and no screen shows a second "margin" figure.
- The platform fee kept is always summed PER LEG at each leg's own % (5 Growth + 2 Deals
  at ₹10k → ₹18,000, never a blanket 30%).
- **Stored:** the single net-based value (₹81,500.02 here) as `guapd_margin`, gated
  behind financial access (below). This replaces Phase 2's "derived, never stored" for
  margin only: the stored value is an ops-only P&L snapshot, never an invoice input.
  Sub-total and fee kept stay derived for display.
- This unblocks the P&L view (Phase 3).

**Access: OPERATIONAL vs FINANCIAL, enforced in the database:**
| Who | Sees |
|---|---|
| Brand, creator | never margin, payouts or costs (already enforced, Phase 1 RLS) |
| Outreach (incl. the Cloutflow contractor) | nothing on Experiences (no capability) |
| Operational, per person | deliverables, dates, roster, messages, creator payouts. NOT margin / P&L |
| Financial, OPT-IN per person | the P&L: brand paid, costs, fee kept, margin. Never default-on, not even for admins or managers |

Why a role check in app code is not enough: ops server code uses the service role,
which bypasses every grant and policy, so "hide it in the UI" or "check the role in the
action" both fail open to any future service-role query. Design:
- `staff_access` table (user, `experiences_operational`, `experiences_financial`,
  granted_by, granted_at), service-role-written by an admin action that writes
  ops_events, no user access. Financial is false for everyone until set per person.
- The P&L is reachable ONLY through a SECURITY DEFINER function (e.g.
  `experience_pnl(experience_id)`) called with the CALLER's session, not the service
  role. It checks `staff_access.experiences_financial` for `auth.uid()` in Postgres
  and raises otherwise. Margin inputs/outputs are never selected by service-role code
  paths for display.
- Operational payout views go through the same pattern with `experiences_operational`.
- Guard rail: a repo test fails if any app code selects margin/P&L tables or calls the
  P&L maths outside that function's server action, so a new service-role read cannot
  quietly reopen it. Honest limit: the service role can still read raw tables; this
  makes doing so deliberate and visible, not impossible.
- Tests: outreach session → refused; operational session → payouts yes, P&L refused;
  financial session → P&L; brand/creator → refused.

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

## Later phase — Experience budgeting (SCOPED ONLY, not scheduled)
- Once the brand's fund is received, allocate it across categories on the Experience
  portal (creators, travel, makeup, editing, buffer, …) as PROVISIONAL amounts; work
  against them during the project; after finalisation enter FINAL actuals.
- Show budget vs actual (variance) per category, and provisional vs final margin.
- Same access rule: financial, opt-in per person.
- **Schema flag (not changed now):** `experience_cost_lines` is FINAL-ONLY today: one
  `quantity`, `unit_rate_paise`, `total_paise` per line. Provisional vs final needs
  either a `stage` column (provisional | final) with a line per stage, or paired
  `provisional_*` / `final_*` columns. Budgeting will need a migration for this; flagged
  per Palak's instruction, not altered in Phase 2.

## Separate workstreams (not Experiences)
- ✅ FIXED 2026-10-05: `calculateFee` float rounding (an exact half paisa rounded down on
  fractional rates). One rule now in `lib/money-round.ts`, shared with Experience money;
  baseline byte-identical without re-baselining.
- Fee collection on marketplace (direct-pay) deals: nothing collects Guapd's fee today.
- Legal: lawyer finalises /privacy and /terms; /terms §7 fee wording.
- Playbook copy (Palak).
- Remaining pre-existing bugs from the investigation (counters dropping add-ons, campaign
  send losing add-on columns, client-trusted totals, fee-override reset, preview fee mode,
  Growth billing on held deals, held-deal offer links, audit actor, campaign FK).

### Plan reconciliation rule (PJ, 2026-10-06), for Stage 3

The request is a uniform per-creator plan ("N creators, each doing the same thing"), locked at quote acceptance as `experiences.agreed_plan` (0531): creators, per-creator rows, totals per type, plan videos and videos SOLD. Each creator leg STARTS from the per-creator template; staff may adjust an individual creator (one does 3 videos, another 1) without touching the agreed plan. The integrity check is against the agreed TOTAL: the sum of all creators' actual deliverables must equal what the brand bought (`videos_sold`, and the per-type totals). It must NOT require each creator to match the template. Mixed plans are handled per creator in Stage 3, not by request-level groups.

## Stage 3b: creator shoot package + creator legs (APPROVED 2026-10-07; BUILT 2026-10-08, staging)

**Scope:** the two are built together because a leg's price comes from the package.
1. The creator sets a per-day shoot package on their rate card and sees it on their own
   side.
2. Staff send each locked, accepted creator their own creator leg (Leg 2), priced from
   that package, with that leg's deliverable scope.

Built end to end, desktop and mobile. **No money moves:** no payout, no invoice and no paid
state; those are Phase 4. Affiliate is scope only: the affiliate follow-on invoice is
Phase 4 and nothing here touches it.

This pulls two items forward: Phase 7's "per-day rate on packages page", and the creator
leg screens from Phase 5. Phase 5 keeps payout details, the affiliate invoice and the
real paid status.

### 1. Schema: migrations 0533 and 0534, run by hand
**0533: the shoot package on `creator_products`**
- New lookup table `package_pricing_types (id text PRIMARY KEY, label, created_at)`,
  seeded with `per_deliverable` (every existing package) and `per_day`.
- New column `creator_products.pricing_type text NOT NULL DEFAULT 'per_deliverable'
  REFERENCES package_pricing_types (id)`. Existing rows backfill to `per_deliverable` via
  the default (not a CHECK plus backfill; see the 0516 trap).
- **A new pricing type is then a row, not a migration.** The app handles types with an
  exhaustive switch, and anything it doesn't recognise is treated as "not sendable, not
  shown to brands".
- `price_paise` keeps its meaning: the price per unit of the pricing type. For `per_day`
  that is the day rate (₹10,000/day = 10,00,000 paise).
- Shape rules, written as constraints that apply only to `per_day`, so existing rows are
  untouched:
  - `price_mode = 'exact'`, `price_max_paise IS NULL`, `revisions_enabled = false`,
    `price_paise > 0`;
  - `platform` and `handle` become nullable, with a CHECK that `per_deliverable` rows
    still require both. A shoot day isn't tied to one platform;
  - `product_type` is fixed to `'Shoot day'`;
  - at most one active `per_day` package per creator (partial unique index).
- Packages are never deleted (`creator_products_deny_delete`), so a leg can point at its
  package for provenance.

**0534: the creator legs**
- `experience_creator_terms` gets:
  - `product_id` (FK to `creator_products`), `pricing_type`, `day_rate_paise` and `days`.
    `days` already exists; all of these are frozen by `t_ect_freeze`;
  - a new CHECK `ect_gross_formula`: when `pricing_type = 'per_day'`,
    `creator_gross_paise = round(day_rate_paise × days)`. The database then proves gross
    as well as net (`ect_net_formula` already does net).
- `experience_roster` gets the leg draft: `leg_product_id`, `leg_days`,
  `leg_deliverables` (starts as a copy of `planned_deliverables`), `leg_affiliate_count`,
  `leg_deal_id`, `leg_sent_at`. None of these go into the brand's 0523 column grant.
- The staff-gated functions in §4, the reconciliation in §5, and the creator-leg guards.
- `rls.sql` is updated in the same commits.

### 2. How the package shows on the creator's side
- `/creator/packages` gets a "Shoot day rate" section, separate from the per-deliverable
  packages: set a day rate, edit it, pause it. The text says plainly that it is used when
  Guapd books them for a managed shoot, that **brands never see it**, and that Guapd keeps
  the platform fee for their track. A worked example uses their own figures: "₹10,000 a
  day → 30% Growth fee → ₹7,000 to you".
- The page is one responsive component (`PackagesClient`, with breakpoints in
  `packages.css`). Desktop and mobile are both checked.
- Creator surfaces that preview what brands see leave the shoot package out: the
  storefront editor and `ShopfrontPreview`, plus the "packages" setup task and dashboard
  CTA. A day rate doesn't make a creator bookable in the marketplace.
- Ops admin sees it on `/ops/creators/[id]` and can set it for a creator who has no login
  (a stub), with an `ops_events` entry. Outreach never sees it (§6).

### 3. Leg money: one maths path, the existing one
For one creator leg:
- `track = trackForCreator(creatorId)`: Growth → 30, Deals → 15, read at send.
- `creatorLegTerms({ dayRatePaise, days, track })` in `lib/experience-money.ts`:
  - `gross = round_half_up(dayRate × days)`, with days > 0 and at most two decimals;
  - `fee = platformFeePaise(gross, pct)`, using `percentOfPaise` from
    `lib/money-round.ts`;
  - `net = gross − fee`.
- Example: ₹10,000 × 2 days = ₹20,000; Growth 30% = ₹6,000; net ₹14,000.
- No new fee code. `resolveDealFee` and `calculateFee` are never called for a leg, and
  `test-fee-golden.ts` stays byte-identical.
- The send function re-derives the track inside Postgres from `creators.vetting_status`,
  reads the day rate itself from the package row, and refuses if the server action's
  computed figures differ. The browser never supplies a price, a % or a track.
- The database checks the result twice: `ect_gross_formula` and `ect_net_formula`.
- Frozen at send: changing the package or the track later never moves a sent leg
  (`t_ect_freeze`).

### 4. Leg actions when the house brand has no members
- A creator leg is a `deals` row on the house brand. The house brand has **no members**
  (`check-house-hidden.ts`), so `can_access_deal` is false for everyone on the brand
  side, and no session can act "as the brand".
- **Every Guapd-side leg action is a staff-gated `SECURITY DEFINER` function**, called
  from the staff member's own session. It is gated by `experience_console_require()`
  (Experiences operational access) and audited to `ops_events`. Brand membership is
  never consulted. This is 3a's pattern:
  - `experience_console_leg_options(roster_id)`: the creator's active `per_day` package
    and track, for the send form. Explicit columns;
  - `experience_console_leg_draft(roster_id, product_id, days, deliverables,
    affiliate_count)`: save the draft, subject to the reconciliation in §5;
  - `experience_console_leg_send(roster_id)`, one transaction:
    1. insert the leg deal (status `negotiating`, house brand,
       `guapd_principal_vendor_payout`);
    2. insert its `deal_deliverable_items` (`added_by = 'guapd'`, visible to the creator,
       no per-item price);
    3. write and lock the terms;
    4. set `leg_deal_id` and `leg_sent_at`;
    5. write `ops_events` and a deal-scoped `events` row.
- **"Reuse the normal deal-send flow"** means the same deal row, the same deliverable
  items, the same `events` trigger, the same creator notification path and the same
  creator accept/decline screen. Only the sender changes: a staff function instead of a
  brand-session action. The brand offer builder (`/deals/new`) is not used, because it
  needs a brand member.
- Later on the same pattern, not in 3b: staff chat on a leg (thread read and write
  functions, messages shown as "Guapd", the audit logs message length only) and staff
  marking deliverables done.
- Notifications that would go to "the brand" on a leg go to staff with Experiences access
  instead, never into an empty member list.

### 5. Reconciliation when one creator is adjusted
- The count moves from the roster to the legs. For each creator not declined: their
  `leg_deliverables`, or the frozen items once sent. The 3a roster plan stays as the
  record of what the brand accepted.
- **A hard ceiling inside the draft and send functions:** an edit or send that would make
  the total exceed what was sold is refused:
  - per type when the brand bought the plan's count;
  - combined videos when the sold count was negotiated away from the plan (the 3a /
    `c1c4d80` rule);
  - the affiliate total against the agreed affiliate total.
- On each leg, affiliate can't exceed that leg's videos (the 0531 rule, applied per
  creator).
- **Below the total is allowed while drafting, and shown** ("2 videos still to place").
  To move a video from A to B, lower A, then raise B.
- **Days don't count toward deliverables:** changing one creator's days changes only
  their own gross.
- **Sent is frozen.** In 3b a sent leg changes only by the creator declining; change
  orders are later. A decline frees that creator's videos for someone else (3a already
  allows adding a creator after lock).
- The Experience can't move past Confirmed until the creators who accepted add up exactly
  to what was sold.

### 6. Data-layer gating: who is refused what
- **Brands (including Kiro), other creators and the public** cannot read `per_day`
  packages:
  - `creator_products_read` is rewritten so a non-owner sees only
    `pricing_type = 'per_deliverable'`. It is an allowlist, so a future type is hidden by
    default;
  - most readers use the admin client, which skips row security, so each brand-facing
    and public read also filters explicitly: `/browse`, `/browse/[id]`, `/c/[slug]`,
    `/deals/new`, the campaign page, pool and draft actions, AI search `loadCandidates`,
    and growth-state counts;
  - the brand offer and campaign server actions refuse a `per_day` product id, so a
    hand-edited URL or form fails;
  - new guard `scripts/check-package-gating.ts` fails if any `creator_products` read
    lacks the filter, except the named exceptions: the creator's own packages page, ops
    admin, and the leg functions.
- **Kiro cannot see creator legs at all:** a leg's `brand_id` is the house brand. Nor can
  it see roster leg columns (no grant), terms or margin.
- **Creators** read only their own leg, their own terms row and their own
  `creator_leg_context(deal_id)`. That function returns only the Experience brand's name
  and logo, the shoot date and city, and the brief. Never `experiences`, the brand
  price, the roster, other creators' terms, costs or margin.
- **Outreach:** has no Experiences capability, and `/ops/creators/[id]` filters
  `per_day` out unless the viewer is an admin.
- **Direct URLs:** `/experiences-admin/*` is staff-gated in the layout and again in every
  function. A creator opening another creator's leg URL gets not-found (row security). A
  brand opening a leg deal URL gets not-found.
- **No `select *`:** explicit column lists everywhere, including inside definer
  functions.

### 7. What the creator sees on a leg (deal page, list, dashboard; desktop and mobile)
- "**Kiro Beauty · Managed by Guapd**", from `creator_leg_context`.
- Money from their own terms: "₹10,000/day × 2 days = ₹20,000 → 30% Growth fee →
  ₹14,000 to you", then "Guapd pays you after the shoot". No paid state.
- Their scope: deliverable types and counts, how many carry the affiliate link, and
  ad-rights and boost months. Shoot date and city.
- Accept / decline. Hidden on a leg: counter, invoice and GST invoice, PaymentBreakup, the
  posted card, the shipping address, and upload/submit. The last two are refused on the
  server as well.
- One helper, `creatorLegMoney`, feeds every surface: the deal page, the inbox and list,
  the dashboard cards and notification text. No creator screen can fall through to the
  marketplace fee maths.

### 8. Tests and checks
- **`scripts/test-creator-shoot-package.ts`:**
  - a creator creates, edits and pauses their own day rate;
  - the shape rules hold, and only one active day rate is allowed;
  - another creator, a brand, outreach and anonymous are refused, both through row
    security and through every brand-facing page path;
  - a brand offer or campaign carrying a `per_day` id is refused;
  - the gating guard passes.
- **`scripts/test-experience-legs-send.ts`:**
  - every function is refused for no-access, a brand, a creator, anonymous and the
    service role;
  - send writes exactly the leg, items and locked terms, and both formula CHECKs hold;
  - the track % comes from the creator; a tampered figure is refused;
  - an over-sold or over-affiliate edit is refused; uneven creators with the right total
    pass;
  - a decline frees its videos;
  - the creator sees only their own context and terms;
  - every step writes `ops_events`.
- **Regressions:** `test-fee-golden.ts` byte-identical, `walk-deal-guard.ts` 45/45, the
  3a roster tests, `check-house-hidden.ts` and `check-pnl-isolation.ts`.
- **`docs/test-cases.md`:** functional, security, desktop and mobile checks, in the same
  commits.

### Answers (Palak, 2026-10-07), as built
1. Affiliate is a FLAG ON VIDEOS: a leg has N videos and `affiliate_count ≤ N` carry the link. Never a separate deliverable.
2. Leg deliverables are the LEG TOTAL, never multiplied by days. Days drive money only.
3. Every creator can set a shoot day rate (normal rate-card item); staff with Experiences access can set or edit it on a creator's behalf, audited.
4. Accept / decline only in 3b; the creator counter is Phase 5.
5. Leg offers: in-app + email only. WhatsApp OFF for legs.

### DECIDED: the shoot day rate is never shown to brands (Palak, 2026-10-08)
Hidden on Experiences AND across the marketplace. Experiences: it is what
Guapd pays the creator, so showing it exposes the margin and invites going
direct (non-negotiable). Marketplace: also hidden, because a brand that saw a
creator's shoot rate there could later back into what Guapd pays them on an
Experience. The shoot package stays non-bookable and off the storefront.
If a creator day-rate product for direct marketplace bookings is ever wanted,
it is a NEW pricing type with its own price, never the Experience shoot rate
exposed. Keep the two distinct.

Kept on file only, NOT to be actioned: the places that would have to change
to show it are the
`creator_products_read` allowlist (0533, rls.sql), the explicit
`pricing_type = 'per_deliverable'` filters on brand-facing reads (listed by
`scripts/check-package-gating.ts`), and `get_public_storefront` (0535).
Decide first whether brands may see it on Experiences only or on the
marketplace too, since it reveals what Guapd pays a creator per day.

### To-do: leg WhatsApp template (MSG91)
A leg-specific template ("<brand> · Managed by Guapd: a shoot offer, ₹<net> to you") needs drafting and MSG91/Meta approval. Until then `lib/experience-leg-notify.ts` sends no WhatsApp. Do not reuse the marketplace offer template: its amount is computed the marketplace way.

### Deviations from the plan, as built
- Migration 0535 added: `get_public_storefront` lists `per_deliverable` packages only and skips Experience legs in past collabs; a `per_day` package can never be price-displayed (CHECK).
- Creator lists show a leg at the creator's take-home (net), not gross: they label the figure as what the creator receives and sum it as earnings.
- Staff chat on legs is not in 3b; creator messages on a leg are refused by trigger until it lands.

### Original open questions (answered above)
1. Does "per day shoot: 5 UGC + 5 affiliate" mean **5 UGC videos, all 5 carrying the
   affiliate link** (5 deliverables)? That is how the agreed plan already models
   affiliate: a count of videos that carry the link. Or are they 10 separate
   deliverables?
2. Is a leg's deliverable scope the **total for the leg**, set by staff, rather than
   automatically multiplied by the number of days?
3. Can **every creator** set a shoot day rate, or only creators staff invite to
   Experiences? And if a creator has no day rate when staff want to send, should staff
   ask them to add one, or may an ops admin set it for them?
4. Should creators only **accept or decline** in 3b, with the day-rate counter in a
   later stage?
5. The existing WhatsApp offer template states an amount worked out the marketplace way.
   Should leg offers notify **in-app and by email only** until a leg-specific template is
   approved?

## Release 2026-10-08: the send-deals slice is on production
- Code: `main` = `c5839cb` (staging merged; creator-pool branch and 0536 held; storefront build-a-deal files held, identical to the previous production copy). Deployment `dpl_2BS2vzHjnxv9hidNmmvzMnoCbKhz`.
- Prod migrations 0515–0535 applied by hand, in order, each verified: niches/bio backup re-verified by checksum immediately before 0517–0519; 0527 recorded as applied without re-running (its objects were already live); 0520/0521 applied ~2 minutes after the deploy went live.
- Rollback kit (outside the repo): `~/guapd-backups/prod-2026-10-08/` (backup.json, restore-prod.sql, rollback-0520-0521.sql). Previous good deployment: `dpl_DWh3spE38ufNHEGo9NVEMNvruVKX` (`0ab1960`).
- Post-deploy: prod schema matches staging (except held 0536); deal guard tested on all 3 live deals as their real brand and creator, inside rolled-back transactions (24/24); brands and other creators see no shoot day rate; every staff function refuses non-staff.
- Before the first real send: grant Experiences access on prod, then the creator-leg visual check on prod (needs one test leg).

## Stage 3c: cost sheet + margin / P&L view (APPROVED + BUILT 2026-10-08, staging only)
Answers (Palak): (a) revenue = INVOICED (issued; honest ₹0 "revenue pending invoice" until Phase 4, the agreed price never substituted); (b) only ACCEPTED legs count, unanswered/declined are footnotes; (c) the BRAND PRICE is financial-only, so operational staff (creator payouts + costs) cannot derive the margin — quoting therefore needs financial access; (d) costs after Complete need an explicit, audited reopen (finance) → add → complete again.
Built in migration 0537 + console CostSheetPanel / PnlPanel; tests in scripts/test-experience-costs-pnl.ts (docs/test-cases.md §104).
Full plan delivered in chat on 2026-10-08. Headlines:
- **Bug to fix first (from 3b):** `compute_experience_pnl` counts legs with `locked_at IS NOT NULL`; since 0534 a leg is locked at SEND, so unanswered and declined legs are subtracted from the margin. Count only legs the creator accepted (deal status agreed onward); show awaiting and declined as footnotes.
- Migration 0537: cost-line soft delete + shape checks (Phase 4 columns blocked); a generated `guapd_margin_paise` on `experience_pnl_snapshots`, refreshed by triggers on every input and frozen at Complete; costs summed in one helper; categories `per_video`/`day_rate`/`retainer` refused on cost lines (creator pay lives on legs).
- Staff-gated cost functions (operational) with audit; P&L only via `experience_pnl()` (financial). No budgeting stage column yet.
- Open questions: revenue basis for "brand_paid" (invoiced / received / agreed until Phase 4); awaiting legs out of the margin; operational staff can compute margin by hand; late costs after Complete.

## Stage 3d: the shoot, deliverables, deliverables → brand (APPROVED + BUILT 2026-10-08, staging only)
Answers (Palak, 2026-10-08):
1. **Kiro = Guapd provides the deliverables** (staff attach); the creator's work ends at shoot done. The approved template is unchanged. BOTH paths are built and the template decides: `deliverables_owner: guapd` → staff attach; `deliverables_owner: creator` (+ `completion_trigger: on_delivery_accepted`, enforced by the validator) → the creator submits on their deal page. A future creator-submit Experience is a new template version, not a rebuild.
2. **Minimal brand page `/experiences/[id]`**, released deliverables only, enforced in the database (`brand_experience_deliverables`). The first piece of the brand-facing side; the full brand portal stays Phase 6.
3. **Brand decisions recorded by staff** with the channel (as the roster); brand self-service is Phase 6.
4. **Creator payment eligibility** (`experience_leg_work_complete`, mirrored in `lib/deal-flow.ts`): Guapd provides → shoot done; creator submits → shoot done AND Guapd approved every item on their leg. Nothing pays in this stage (Phase 4 reads it).

Built in migration 0538 + console ShootPanel / DeliverablesPanel, the creator's LegDeliverables, and the brand page; tests in scripts/test-experience-deliverables.ts (docs/test-cases.md §105).
- **Shoot:** confirm (Confirmed → Shoot scheduled, staff) → per-creator outcome from the shoot date (Shot / Did not shoot + reason; undo with a reason until that creator's content is shared) → Shoot done automatically → Delivering on the first release → Complete (3c, unchanged). Unanswered offers can be withdrawn (reason; creator told in-app + email). "Did not shoot" leaves the counted P&L creators (operational outcome, not a financial edit).
- **Deliverables:** one item per unit from 3b; Guapd reviews (approve / ask for changes). Files go to the private `deliverables` bucket at a path the database names; signed links only. Guapd's notes on its own content are staff-only; in creator-submit mode the note is the creator's revision note.
- **Releases:** `experience_deliverable_releases`, no user access. Staff choose which approved items to share ("shared X · sold Y", over-share warned, not blocked). A release snapshots the version; a newer version supersedes it on re-share; withdraw with a reason until the brand approves; approval is final.
- **Readiness:** `experience_deliverables_progress` = brand-approved releases cover what was sold. Shown on the console; does NOT gate Complete. The later completion piece gates Complete on it + invoices cleared (Phase 4) + the brand's "mark done" (new), with the 3c Complete as Guapd's half.
- **Also:** the seven 3a functions rewritten without `SELECT *` (none left in `public`); ships to prod with this stage.
- **Still deferred:** leg WhatsApp template (in-app + email cover every message here); staff chat on legs (review notes cover deliverable feedback; creators still have no message channel on a leg); re-sending a declined or withdrawn offer; Guapd-made extras not tied to one creator.
- **Ships to prod** in a later release together with 3c (0537), the creator pool (0536) and the storefront.

## 0539: NULL means no + the creator boundary (BUILT 2026-10-08, staging only)
Asked by Palak after the third three-valued-logic slip (0528 CHECK, the commented-out revoke filter, the 0538 `can_submit` predicate): audit every security-critical boolean in the Experience DB functions and make each DENY on NULL; verify a creator reads only their own leg.
- **Audited:** all 82 Experience functions and triggers on staging, plus the RLS policies on the Experience tables and the `deliverables` bucket policy. WHERE / FILTER / EXISTS already deny on NULL; the risk was IF / CASE / RETURN / CHECK.
- **Hardened (39 functions, migration 0539):** gates `IS NOT TRUE`; guards `IS DISTINCT FROM` and `x IS NULL OR x NOT IN`; roster/legs reconcile and readiness no longer ok-by-default on a missing plan number (`coalesce(v_ok, true)` and `bool_and` skipping NULL rows were the real fail-opens); untyped deliverables refused; cost category NULL is a no; locked / is_guapd block unless FALSE; payment eligibility needs positive approval. Bodies otherwise identical; grants unchanged.
- **Creator boundary:** holds at the data layer (63-check live test, §106). One tightening: creators can no longer upload straight into the bucket under an Experience leg (only via the service-role slot).
- **House style from here** (memory `sql-null-boolean-trap`): gates `IS NOT TRUE`, guards `IS DISTINCT FROM`, computed ok/ready default false, and a "the NULL alone is refused" test per new gate.

## Phase 4 plan: brand invoices + creator payouts (DRAFT 2026-10-08, awaiting Palak's review; staging only)
Full plan delivered in chat. Headlines:
- **Brand invoice** (financial access only): staff-entered brand billing profile (legal name, address, state, GSTIN, PAN; optional certificates), snapshotted at issue. Draft → Issued (gapless number per financial year, frozen, PDF stored) → Paid; void with a reason (never a paid one; numbers never reused). Payments recorded offline (date, method, UTR, amount, TDS deducted by the brand, proof file in a private bucket); many payments per invoice. The brand sees its issued invoices on `/experiences/[id]`.
- **Creator payouts** (manual provider): eligible = `experience_leg_work_complete` and the creator shot; amount = the locked creator net (not editable); TDS field editable, not computed. Request → approve → record paid outside (date, method, UTR, proof) → creator told in-app + email "Guapd paid you ₹X · ref …". Moves into staff-gated definer functions (today's `lib/payouts/service.ts` uses the admin client).
- **The 30% fee:** a line on the creator's payout statement (gross → platform fee → net), never on the brand invoice (locked decision), unless Palak decides otherwise.
- **P&L flip:** revenue = Σ issued + paid invoice subtotals ex-GST (already the 3c rule), so "revenue pending invoice" ends when the first invoice is issued; GST shown as a liability, never revenue; received / outstanding and paid-out / due shown beside the accrual margin.
- **Out of scope:** Razorpay / RazorpayX, payment links, computed GST/TDS, brand self-pay (Phase 6), creator bank details (Phase 5); affiliate follow-on proposed as 4b.

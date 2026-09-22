# Guapd Growth — brand side

> **Status: approved, not built.** Written 22 Sep 2026. This is the build plan for
> exposing Growth creators to brands and letting brands run Growth campaigns.
> Every high-cost architectural decision below is LOCKED — they are recorded
> here because changing them after there is live data is expensive, and the
> reasoning is the part that gets lost.

---

## The model in one paragraph

There are two creator tracks. **Deals** creators are established, priced high,
and work as individual negotiated deals. **Growth** creators are emerging/UGC,
sell fixed **packages**, and are grouped into a campaign that must clear a
minimum. Both are visible to every brand — there is **no visibility gating**,
because price already self-selects who can afford a Deals creator, and charging
a premium to see *cheaper* creators makes no sense. The track is chosen at
campaign creation and shown everywhere as a tag; it is never a global mode.

The only structural difference between the two campaign types is **what counts
as one billable unit**: a Deals campaign of 5 creators is 5 billable deals; a
Growth campaign of 5 creators is 1 billable campaign — plus 5 per-creator
records underneath, because delivery and payment are always tracked per creator.

---

## LOCKED decisions

| Decision | Choice | Why it is locked |
|---|---|---|
| Participation record | **A `deals` row.** No parallel participations table | Changing later means migrating live deals, messages, invoices and audit events |
| Growth creator visibility | **Additive `is_bookable`**, derived. `is_vetted` is never flipped | Flipping and unwinding means auditing 5 RLS policies and ~23 files twice, with brand-visible leakage in between |
| Entitlements | **`brand_entitlements` table**, source-agnostic | Booleans on `brands` become a rewrite of every check when subscriptions land |
| Billing record | **`usage_events` row written at send time** | Computing from live rows cannot survive a dispute or a row that later changed |
| Growth fee | **30%, `deducted` from the creator**, `fee_basis = 'growth_standard'` | No markup on the brand; transparent creator-set rates |
| Growth minimum | **Both columns exist; `min_creators` enforced at launch**, metric + threshold ops-configurable | Switching metric must be config, not a migration |
| Growth negotiation | **Accept / decline only.** No counter, no price edit | Per-deal negotiation makes "one billable unit" incoherent |

---

## 1. What exists today (Deals campaigns)

A campaign is purely an organisational container over N independent deals.

| Table | Role |
|---|---|
| `campaigns` | `brand_id`, `name`, `description`, `budget_paise`, `status`, brief + attachments |
| `campaign_drafts` | **one per creator** — `placements` JSONB, `total_price_paise`, preview fee snapshot, `note`. The staging area before anything is sent |
| `deals` | the real object, with nullable `campaign_id` |

Flow: `startCampaignWithCreators` → `addCreatorsToCampaign` (drafts) →
`DraftPlacementEditor` (brand prices placements) → **`bulkSendCampaignDrafts`**,
which loops drafts, calls `createDeal({ campaign_id })`, deletes the draft and
posts an opening message.

Gates inside that loop — Growth changes each one:

- `is_vetted = true` re-check per creator
- placements non-empty, `total_price_paise > 0`
- skip if the creator already has a deal in this campaign (double-submit guard)
- fee **re-resolved and snapshotted per deal** by `resolveDealFee`
- `payment_terms` forced to net-30 (the builder does not collect it yet)

`invoices.deal_id` is **UNIQUE** — one invoice per deal.

---

## 2. Growth campaign data model

### The participation record is a `deals` row

A participation needs a status lifecycle, a message thread, versioned
deliverables, an invoice, payment status and an audit trail. `deals` has all of
it, including the `audit_deal` trigger that writes the `events` history — the
moat. A parallel table would mean re-implementing the lifecycle, re-pointing
`messages` / `deliverables` / `invoices` (all FK'd to `deals`), a second audit
trigger, a second set of RLS policies, and a second rendering of the creator's
inbox, deal screen, upload flow and payment screen. That is most of the product,
built twice.

### New columns

```sql
campaigns.track            text NOT NULL DEFAULT 'deals' CHECK (track IN ('deals','growth'))
campaigns.min_creators     int                  -- snapshot of the config at creation
campaigns.min_value_paise  bigint               -- snapshot of the config at creation
deals.track                text NOT NULL DEFAULT 'deals' CHECK (track IN ('deals','growth'))
```

**Naming:** `track`, not `tier` — `brands.tier` already exists as the
subscription-plan stub (`CHECK (tier IN ('free'))`). Two columns called tier
meaning plan-vs-track is the kind of collision that produces a wrong join.

**Why `deals.track` is denormalised** rather than joined through `campaign_id`:
standalone deals have no campaign; the deals-list filter needs it indexed; and
the track at creation is a historical fact that must not move if the campaign is
edited later. Same reasoning as the fee snapshot.

**Why the minima are snapshotted onto the campaign** even though ops owns the
live config: a campaign sent under a 5-creator minimum was sent under a
5-creator minimum. Raising the platform minimum next month must not retroactively
make a past campaign look invalid.

### ⚠️ The money model — put this in the schema comment

> **"Billed per campaign" is a COUNTING rule, never a pooled payment.**
> Invoices stay PER-DEAL. Each creator is paid DIRECTLY by the brand. A Growth
> campaign is one unit for entitlement counting and platform billing ONLY.
> If this ever becomes "the brand pays Guapd once and we split it," that is
> fund-splitting — Razorpay Route, per-creator KYC, RBI payment-aggregator
> territory — which is the #1 deferred timeline-killer in CLAUDE.md. The phrase
> "billed per campaign" reads naturally as the dangerous version, which is
> exactly why it is written down here.

### Billing record — `usage_events`

Written at send time, never computed from live rows:

```sql
usage_events (
  id           uuid PRIMARY KEY,
  brand_id     uuid NOT NULL REFERENCES brands(id),
  unit_type    text NOT NULL CHECK (unit_type IN ('deal','growth_campaign')),
  ref_id       uuid NOT NULL,        -- the deal id, or the campaign id
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  detail       jsonb NOT NULL DEFAULT '{}'  -- creator count, totals, fee basis
)
```

One row per billable unit: one per deal on a Deals campaign or a standalone
deal, exactly one per Growth campaign at send. Immutable. A deal later cancelled
does not erase the row — what was counted was counted, and an adjustment is its
own row. This is the table a billing dispute is answered from.

---

## 3. Entitlements

```sql
brand_entitlements (
  brand_id   uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  key        text NOT NULL,          -- 'growth_campaigns', later 'max_deals_per_month'
  value      jsonb NOT NULL,         -- true, or 25 — one mechanism for flags and limits
  source     text NOT NULL,          -- 'ops' | 'subscription' | 'trial'
  granted_by uuid,                   -- the ops user, when source = 'ops'
  expires_at timestamptz,
  PRIMARY KEY (brand_id, key)
)
```

`lib/entitlements.ts` exposes `hasEntitlement(brandId, key)` and
`entitlementValue(brandId, key)`. **Nothing in the app ever reads `source`** —
that is the entire point. When subscriptions arrive, the webhook writes rows with
`source = 'subscription'` and every check keeps working unchanged.

`value` as jsonb rather than a boolean column is what lets volume limits share
the mechanism later instead of needing a second one.

**Checked at** — the server action is the boundary, the UI is a courtesy:

- `createCampaign` when `track = 'growth'`
- `addCreatorsToCampaign` and `bulkSendCampaignDrafts` (a grant can be revoked mid-flow)
- the "New campaign" UI hides or disables the Growth option
- ops gets a grant/revoke screen writing `ops_events`

RLS: a brand reads its own rows, service role writes. Into `rls.sql` at creation.

---

## 4. Ops-configurable minimum

Global platform setting, tunable without a deploy.

```sql
platform_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_by  uuid,
  updated_at  timestamptz NOT NULL DEFAULT now()
)
```

First entry:

```json
"growth_campaign_minimum": { "metric": "creators", "min_creators": 5, "min_value_paise": 2000000 }
```

- **`metric`** selects which is enforced — `"creators"` or `"value"`. Both numbers
  are stored either way, so switching metric is one ops edit.
- Ops screen at `/ops/settings` (or a section of the existing ops config):
  the metric as a radio, the threshold as a number. Writes `ops_events` with
  before/after, per the standing rule.
- **The builder reads it** to display the requirement ("Add at least 5 creators"
  / "Reach ₹20,000") and the server re-reads it to enforce at send.
- **Snapshotted onto the campaign** at creation (§2), so a later change to the
  platform minimum does not retroactively invalidate a sent campaign.
- Global now. Per-brand later is an additive lookup — brand override first,
  platform default second — when subscription tiers need different minimums.

RLS: service-role write; readable by authenticated (the builder needs it).

---

## 5. Making Growth creators visible — the dangerous part

Migration `0487` states the constraint plainly:

> *Encoding growth as not-vetted makes Growth creators invisible to brands
> without touching a single one of them. The alternative — a new condition added
> in 26 places — is 26 chances to miss one.*

`is_vetted` is **derived by trigger** from `vetting_status`, read in ~23 files
and **5 RLS policies**. It is load-bearing precisely *because* Growth creators
are `is_vetted = false`.

**Never flip Growth creators to `is_vetted = true`.** That drops them into the
Deals roster everywhere at once — browse, the storefront RPC, offer creation, the
verified badge, product and add-on-rate reads.

**Add a second derived column** from the same trigger:

```sql
creators.is_bookable boolean   -- vetting_status IN ('deals_approved','growth')
```

Change **only the three brand-facing read predicates** from `is_vetted = true`
to `is_bookable = true`:

| Location | Policy |
|---|---|
| `rls.sql:210` | `creators_read` |
| `rls.sql:444` | `creator_products` read-others |
| `rls.sql:887` | `creator_addon_rates_read_vetted` |

Everything else keeps reading `is_vetted`, and that is **correct, not an
oversight**: the storefront RPC and the verified badge stay Deals-only, because
Growth creators have packages, not storefronts.

### ⚠️ The GRANT allowlist

`is_bookable` **must** be added to `GRANT SELECT (...) ON public.creators`
(`rls.sql:853`). The file's own comment records what happens otherwise —
`vetting_status` was added without it and the creator layout could not read its
own row **at all**, because a missing column grant fails the whole query, not
just that column.

### Track-aware gates

- `/browse` swaps `.eq('is_vetted', true)` for `.eq('is_bookable', true)`
- `bulkSendCampaignDrafts` requires `vetting_status = 'deals_approved'` for a
  Deals campaign and `'growth'` for a Growth campaign
- `addCreatorsToCampaign` rejects a track mismatch at add time, so a campaign can
  never mix tracks

---

## 6. The package model

**`creator_products` already is it.** No new table:

```
platform, handle, product_type, description, price_paise, display_price, is_active
```

`campaign_drafts.placements` **already carries an optional `product_id`**, so
"add a package to a campaign" is a draft with one placement referencing that
product at the product's price.

The Growth builder differs from the Deals builder by being *less* capable:
price locked to the product, no free-form placement editing, no counter-offer.
A prop on the existing editor, not a second editor.

---

## 7. Tags and filters

Tier is shown, never inferred from context, and never a global mode.

Extend `lib/vetting-status.ts`, which already holds `VETTING_LABEL` and
`VETTING_TONE` — Growth is indigo (`#eef2ff` / `#4338ca`), the colour ops already
uses, so brand-side and ops-side read as the same thing.

- **`TrackTag`** — a pill, on creator cards and rows, campaign cards, deal rows
- **`TrackFilter`** — chips: **All** (default) · Deals · Growth, on `/browse`,
  the campaigns list and the deals list

The browse filter does the job a global switch would: narrowing to Growth
creators while building a Growth campaign is a filter, not a mode. This is why
`deals.track` is a column and not a join — the filter runs on a list that is
already doing work.

---

## 8. New vs reused

**Reused unchanged:** `campaigns`, `campaign_drafts`, `deals` + lifecycle + audit
trigger, `messages`, `deliverables`, `invoices`, `payments`, `creator_products`,
the fee engine, offer accept/decline, the whole creator app, the campaign builder
and roster UI.

**New:**

- `campaigns.track`, `deals.track`, `campaigns.min_creators` / `min_value_paise`
- `creators.is_bookable` + 3 RLS predicate changes + **the GRANT line**
- `brand_entitlements` + `lib/entitlements.ts` + RLS + ops grant UI
- `platform_settings` + the ops minimum config screen
- `usage_events` + a write at send time
- a `growth_standard` rung in `resolveDealFee` — **30%, `deducted`**
- `TrackTag` + `TrackFilter`, used in three places
- the Growth campaign builder as a *mode* of the existing one (locked prices,
  minimum check, no counter)

---

## 9. Sequence, and the creator-side blocker

1. **Brand side** (this document) — buildable now, in full.
2. **Creator-side routing** — DEFERRED, and it is a hard prerequisite for the
   feature to *function*. `apps/web/app/creator/layout.tsx:116` redirects any
   creator with `vetting_status = 'growth'` to `/creator/growth` and keeps them
   there, so **a Growth creator cannot reach `/creator/packages` and cannot set
   the prices a brand would be buying.** Brand-side can be built and tested
   against ops-seeded packages; Growth does not work end-to-end until this opens.
3. **End-to-end** — a real Growth campaign, brief → accept → deliver → paid.

---

## 10. Traps

1. **`is_vetted` is load-bearing** in 5 RLS policies and ~23 files. Additive only.
2. **The column GRANT allowlist** — a missing grant fails the entire query.
3. **Fund splitting** — "one billable campaign" is counting, never a pooled payment.
4. **`invoices.deal_id` is UNIQUE** — fine because participations are deals.
5. **The `deals` audit trigger** comes free with reuse; a parallel table would
   have lost the event history, which is the moat.
6. **The fee rung is mandatory.** Without `growth_standard` in `resolveDealFee`,
   the brand's `platform_fee_percent` (15, `on_top`) applies silently and every
   Growth deal is priced wrong in the brand's favour.
7. **`brands.tier` is taken** by the subscription stub — hence `track`.
8. **Minimums must be re-checked after the draft refetch** in
   `bulkSendCampaignDrafts`; drafts can be removed between validation and send.
9. **A campaign must never mix tracks** — enforced at add time and at send.

---

## 11. On build

- Test cases into `docs/test-cases.md` **in the same commit**, including the RLS
  checks for `brand_entitlements`, `usage_events` and `platform_settings`, and an
  adversarial check that a brand without the entitlement cannot create a Growth
  campaign by calling the action directly.
- Every new table's policies into `supabase/rls.sql` at creation, with
  `DROP POLICY IF EXISTS` before each `CREATE POLICY`.
- Every new ops action writes `ops_events` via `logOpsEvent()`.
- Migrations start at `0506`.
- **Playbook:** this is a brand-facing capability, so Part 13 and the Appendix
  get an entry — **ask after it is built, not now.**

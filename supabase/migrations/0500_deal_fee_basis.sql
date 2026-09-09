-- Migration 0500: record WHY a deal's fee is what it is
--
-- ── What was wrong ─────────────────────────────────────────────────────────
-- CreatorOfferMobile renders "0% · first deal from your storefront" for ANY
-- zero fee, because the amount is all it has. A zero that came from an ops
-- pair rate, a per-deal override, or a brand on 0% told the creator a story
-- about a storefront referral that never happened — and implied the next deal
-- would be charged, when the reason it was free may well still apply.
--
-- resolveDealFee already knows which rung of the ladder decided the fee. It
-- just had nowhere to put the answer. This is that column.
--
-- ── Why a column and not a re-derivation ───────────────────────────────────
-- The same reason fee_percent is snapshotted: the inputs move. An ops pair
-- rate added next month, or a second deal consuming the exemption, would
-- change what a re-derived answer says about a deal agreed long before. The
-- basis is a fact about the moment the deal was created.
--
-- ── Nullable, no default, NULL allowed by the CHECK ────────────────────────
-- Deliberate. Existing rows predate the column and have no honest value to
-- backfill — a deal created before the exemption existed was not decided by
-- any of these rungs. A backfill plus a NOT NULL CHECK is exactly the shape
-- that passes its own run and then rejects every future INSERT that omits the
-- column (see 0491, and 0485 before it). NULL reads as "unrecorded", and the
-- UI treats it as such rather than asserting a reason it does not have.

ALTER TABLE deals ADD COLUMN IF NOT EXISTS fee_basis text;

ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_fee_basis_chk;
ALTER TABLE deals ADD CONSTRAINT deals_fee_basis_chk CHECK (
  fee_basis IS NULL OR fee_basis IN (
    'brand_standard',        -- brands.platform_fee_percent
    'ops_pair_rate',         -- brand_creator_rates.fee_pct
    'storefront_first_deal', -- the 0% exemption
    'deal_override'          -- fee_pct_override on this deal
  )
);

COMMENT ON COLUMN deals.fee_basis IS
  'Which rung of the precedence ladder in lib/deal-fee.ts set fee_percent, '
  'snapshotted at creation alongside it. NULL = created before the column '
  'existed. Never re-derived: the inputs move, the deal does not.';

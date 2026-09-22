-- Guapd Growth, brand side: the campaign track, and what one campaign IS.
--
-- Two creator tracks now reach brands. Deals creators are negotiated one deal
-- at a time. Growth creators sell fixed packages and are grouped into a
-- campaign that must clear a minimum. Both are visible to every brand — price
-- already decides who can afford a Deals creator, so hiding anyone adds
-- nothing.
--
-- ── "track", not "tier" ─────────────────────────────────────────────────────
-- brands.tier already exists as the subscription-plan stub (CHECK tier IN
-- ('free')). A second column called tier, meaning something else, is the kind
-- of collision that produces a wrong join.
--
-- ═══ THE MONEY MODEL — read before changing anything here ══════════════════
--
-- A Growth campaign is ONE BILLABLE UNIT. That is a COUNTING rule and nothing
-- else. It means one row in usage_events, for entitlement counting and platform
-- billing. It does NOT mean one payment.
--
--   * Invoices stay PER DEAL (invoices.deal_id is UNIQUE).
--   * Each creator is paid DIRECTLY by the brand.
--   * Guapd never holds, pools, or splits the money.
--
-- If "billed per campaign" is ever implemented as "the brand pays Guapd once
-- and we split it across creators", that is fund-splitting: Razorpay Route,
-- per-creator KYC, RBI payment-aggregator territory. CLAUDE.md names it the #1
-- timeline killer and v1 deliberately excludes it. The phrase reads naturally
-- as the dangerous version, which is exactly why this comment exists.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── campaigns.track ─────────────────────────────────────────────────────────
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS track text NOT NULL DEFAULT 'deals';

ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_track_chk;
ALTER TABLE campaigns
  ADD CONSTRAINT campaigns_track_chk CHECK (track IN ('deals', 'growth'));

CREATE INDEX IF NOT EXISTS campaigns_track_idx ON campaigns (track);

-- ── The minimum, SNAPSHOT at creation ───────────────────────────────────────
-- Ops tunes the live minimum in platform_settings (migration 0509). These two
-- columns hold what the minimum WAS when this campaign was created.
--
-- Snapshotted for the same reason the fee is: a campaign sent under a
-- five-creator minimum was sent under a five-creator minimum. Raising the
-- platform figure next month must not retroactively make a past campaign look
-- invalid, and a brand mid-build must not have the goalposts moved.
--
-- Both columns exist on every campaign; which one is ENFORCED is decided by the
-- metric in the same snapshot. Switching metric is then an ops edit, never a
-- migration.
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS min_metric      text,
  ADD COLUMN IF NOT EXISTS min_creators    int,
  ADD COLUMN IF NOT EXISTS min_value_paise bigint;

ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_min_metric_chk;
ALTER TABLE campaigns
  ADD CONSTRAINT campaigns_min_metric_chk
  CHECK (min_metric IS NULL OR min_metric IN ('creators', 'value'));

-- ── Deliverable mode ────────────────────────────────────────────────────────
-- How the brand picks what each creator makes.
--
--   uniform      one deliverable type for the whole campaign; each creator's
--                OWN price for that type applies. Prices differ per creator
--                because each sets their own rates — the TYPE is what is
--                uniform, never the price.
--   per_creator  each creator's package chosen individually. A mixed campaign.
--
-- Defaulted to per_creator because that is what an existing Deals campaign
-- already does, so no historical row changes meaning.
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS deliverable_mode text NOT NULL DEFAULT 'per_creator',
  ADD COLUMN IF NOT EXISTS uniform_product_type text;

ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_deliverable_mode_chk;
ALTER TABLE campaigns
  ADD CONSTRAINT campaigns_deliverable_mode_chk
  CHECK (deliverable_mode IN ('uniform', 'per_creator'));

-- A uniform campaign without a type is a campaign nobody can be added to.
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_uniform_type_chk;
ALTER TABLE campaigns
  ADD CONSTRAINT campaigns_uniform_type_chk
  CHECK (deliverable_mode <> 'uniform' OR uniform_product_type IS NOT NULL);

-- ── deals.track ─────────────────────────────────────────────────────────────
-- DENORMALISED rather than joined through campaign_id, for three reasons:
-- standalone deals have no campaign; the deals-list filter needs it indexed on
-- a list already doing work; and the track at creation is a historical fact
-- that must not move if the campaign is edited afterwards. Same reasoning as
-- the fee snapshot.
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS track text NOT NULL DEFAULT 'deals';

ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_track_chk;
ALTER TABLE deals
  ADD CONSTRAINT deals_track_chk CHECK (track IN ('deals', 'growth'));

CREATE INDEX IF NOT EXISTS deals_track_idx ON deals (track);

COMMENT ON COLUMN campaigns.track IS
  'deals | growth. Decides what one billable unit is: a deals campaign bills per DEAL, a growth campaign bills per CAMPAIGN. Counting only — invoices stay per-deal and creators are paid directly. See the header of migration 0506.';

COMMENT ON COLUMN campaigns.min_creators IS
  'SNAPSHOT of the platform minimum at campaign creation, not the live value. The live one is platform_settings.growth_campaign_minimum, which ops can change.';

COMMENT ON COLUMN campaigns.uniform_product_type IS
  'The one deliverable type for a uniform campaign. The TYPE is uniform; the PRICE is each creator''s own, from creator_products.';

COMMENT ON COLUMN deals.track IS
  'Denormalised from the campaign at creation. Standalone deals are ''deals''. Never re-derived — a deal''s track is what it was sent as.';

-- ── fee_basis has to learn the new rung ─────────────────────────────────────
-- deals.fee_basis carries a CHECK of the allowed rungs (migration 0500). The
-- growth rate is a new rung, and without this line every Growth deal insert
-- fails on the constraint — at send time, after the brand has committed.
ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_fee_basis_chk;
ALTER TABLE deals ADD CONSTRAINT deals_fee_basis_chk CHECK (
  fee_basis IS NULL OR fee_basis IN (
    'brand_standard',        -- brands.platform_fee_percent
    'ops_pair_rate',         -- brand_creator_rates.fee_pct
    'storefront_first_deal', -- the 0% exemption
    'growth_standard',       -- 30%, deducted, the growth track's own rate
    'deal_override'          -- fee_pct_override on this deal
  )
);

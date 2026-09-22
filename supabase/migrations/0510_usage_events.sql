-- What was billable, recorded WHEN it happened.
--
-- ── Why not count live rows ─────────────────────────────────────────────────
-- "How many units did this brand use in September" could be a COUNT over deals
-- and campaigns. It should not be. Rows change: a deal is cancelled, a campaign
-- is archived, a creator is removed. A count taken in October over rows that
-- have moved since is not the same number the brand was billed for, and a
-- billing dispute is exactly the moment that difference surfaces.
--
-- So a unit is WRITTEN at the moment it is incurred, and never updated.
--
-- ── One row per billable unit ───────────────────────────────────────────────
--   deals campaign or standalone deal → one row PER DEAL, at send
--   growth campaign                   → ONE row for the CAMPAIGN, at send
--
-- That asymmetry is the entire commercial difference between the two tracks,
-- and it lives here rather than being inferred anywhere else.
--
-- ═══ Again, because it is worth repeating where someone will read it ═══════
-- "One unit" is COUNTING. It is not one payment. Invoices stay per deal, each
-- creator is paid directly, and Guapd never pools or splits funds — that would
-- be Razorpay Route / RBI payment-aggregator territory. See migration 0506.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS usage_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    uuid NOT NULL REFERENCES brands (id) ON DELETE RESTRICT,
  unit_type   text NOT NULL CHECK (unit_type IN ('deal', 'growth_campaign')),
  -- The deal id, or the campaign id. Not a FK: the row must outlive whatever it
  -- refers to. A deleted campaign does not un-bill the brand.
  ref_id      uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  -- Creator count, totals, fee basis — whatever is needed to explain the charge
  -- later without re-reading rows that may have changed.
  detail      jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- One unit per thing, enforced rather than trusted: a double-submitted send
-- must not bill twice.
CREATE UNIQUE INDEX IF NOT EXISTS usage_events_unit_uniq
  ON usage_events (unit_type, ref_id);

CREATE INDEX IF NOT EXISTS usage_events_brand_time_idx
  ON usage_events (brand_id, occurred_at DESC);

COMMENT ON TABLE usage_events IS
  'Immutable billing ledger. One row per billable unit at the moment it is incurred: one per deal on the deals track, ONE PER CAMPAIGN on the growth track. Never updated, never deleted — an adjustment is its own row. ON DELETE RESTRICT on brand_id because a brand with billing history is not deletable.';

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- A brand reads its own usage — this is what a future usage screen shows.
-- Nothing writes from a client role: a ledger a brand can write is not a
-- ledger. Service role only, from the send action.

ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS usage_events_read_own ON usage_events;
CREATE POLICY usage_events_read_own
  ON usage_events FOR SELECT
  TO authenticated
  USING (brand_id = my_brand_id());

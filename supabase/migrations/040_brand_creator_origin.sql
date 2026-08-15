-- Migration 040: Brand↔creator origin attribution (capture only)
--
-- Records HOW a brand came to work with a given creator. Set once, never
-- recomputed. This is the signal a future fee rule will read
-- (creator-brought/storefront = 0%, Guapd-sourced = 15%) — but NO fee or
-- commission logic reads it yet, deliberately. Capture now so it isn't lost.
--
-- PER PAIR, not per brand. A brand arriving via Creator A's storefront is
-- storefront-origin with A only. If that same brand later works with Creator B
-- through Guapd discovery, that is a separate pair with its own origin.
--
-- NOT stored on brand_creator_rates: that table is an OPS-SET FEE OVERRIDE
-- (fee_pct, reason and set_by are all NOT NULL). Origin has no fee decision
-- attached at capture time, and conflating the two would make the eventual fee
-- rule read from a table that already means something else.

CREATE TABLE IF NOT EXISTS brand_creator_origin (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id      uuid NOT NULL REFERENCES brands(id)   ON DELETE CASCADE,
  creator_id    uuid NOT NULL REFERENCES creators(id) ON DELETE CASCADE,

  -- 'storefront' = the brand arrived through this creator's storefront link
  -- 'guapd'      = the pair began through Guapd (browse, ops, direct)
  origin        text NOT NULL CHECK (origin IN ('storefront', 'guapd')),

  -- Provenance for audit: { slug } for storefront, { via } for guapd.
  source_detail jsonb,

  created_at    timestamptz NOT NULL DEFAULT now(),

  -- IMMUTABILITY: this constraint plus insert-only access (never UPDATE) is
  -- what makes the origin set-once. Writers use ON CONFLICT DO NOTHING, so a
  -- later write can never overwrite an earlier one.
  UNIQUE (brand_id, creator_id)
);

CREATE INDEX IF NOT EXISTS idx_bco_creator ON brand_creator_origin (creator_id);

COMMENT ON TABLE brand_creator_origin IS
  'Set-once origin of each brand-creator relationship. Written with ON CONFLICT DO NOTHING and never UPDATEd. Capture only — no fee logic reads this yet.';

-- Brand-level signup fact, separate from the pair fact above. Answers "which
-- creator brought this brand to Guapd at all", which the pair table cannot
-- (a brand has many pairs, only one signup).
ALTER TABLE brands ADD COLUMN IF NOT EXISTS signup_origin_creator_id uuid
  REFERENCES creators(id) ON DELETE SET NULL;

COMMENT ON COLUMN brands.signup_origin_creator_id IS
  'Creator whose storefront the brand signed up through, if any. Set once at onboarding, never recomputed.';

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- No brand or creator reads this directly in v1; it is ops/server-role only.
-- Enabling RLS with no permissive policy denies all client access by default,
-- which is the correct posture for a commercial-terms signal.
ALTER TABLE brand_creator_origin ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bco_deny_all ON brand_creator_origin;
CREATE POLICY bco_deny_all ON brand_creator_origin FOR ALL USING (false);

-- What a brand is allowed to do, kept separate from HOW it was allowed.
--
-- ── The point of the shape ──────────────────────────────────────────────────
-- Growth-campaign access is granted by ops today and will be granted by a
-- subscription later. The app must not care which. So the app asks
-- hasEntitlement(brand, 'growth_campaigns') and NOTHING in it ever reads
-- `source`. When subscriptions arrive, the webhook writes rows with
-- source = 'subscription' and every check keeps working unchanged.
--
-- A boolean column on brands would have been smaller today and a rewrite of
-- every check later.
--
-- ── value is jsonb, not boolean ─────────────────────────────────────────────
-- Because the next entitlements are volume limits — max deals per month, max
-- creators per campaign — and a boolean column cannot hold 25. One mechanism
-- for flags and limits, or two mechanisms six weeks apart.

CREATE TABLE IF NOT EXISTS brand_entitlements (
  brand_id   uuid NOT NULL REFERENCES brands (id) ON DELETE CASCADE,
  key        text NOT NULL,
  value      jsonb NOT NULL,
  source     text NOT NULL CHECK (source IN ('ops', 'subscription', 'trial')),
  -- The ops user who granted it, when source = 'ops'. ops_events holds the
  -- full record; this is here so the row itself is answerable.
  granted_by uuid REFERENCES users (id) ON DELETE SET NULL,
  -- NULL means it does not expire. A trial sets one.
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (brand_id, key)
);

CREATE INDEX IF NOT EXISTS brand_entitlements_key_idx ON brand_entitlements (key);

CREATE TRIGGER t_brand_entitlements_touch
  BEFORE UPDATE ON brand_entitlements
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

COMMENT ON TABLE brand_entitlements IS
  'What a brand may do, independent of how it was granted. The app reads key/value and NEVER source — that is what lets subscriptions replace ops grants with no app change.';
COMMENT ON COLUMN brand_entitlements.value IS
  'jsonb so one table serves flags (true) and limits (25). Read through lib/entitlements.ts, never directly.';

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- A brand reads its own entitlements; the builder needs to know whether to
-- offer a Growth campaign. NOBODY writes from a client role: an entitlement a
-- brand could grant itself is not an entitlement.

ALTER TABLE brand_entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS brand_entitlements_read_own ON brand_entitlements;
CREATE POLICY brand_entitlements_read_own
  ON brand_entitlements FOR SELECT
  TO authenticated
  USING (brand_id = my_brand_id());

-- No INSERT, UPDATE or DELETE policy exists, which denies all three to every
-- client role. Writes are service-role only, through ops.

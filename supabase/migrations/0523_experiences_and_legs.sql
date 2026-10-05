-- Experiences: the parent record and its legs (Phase 1 of 3 migrations).
-- RUN BY HAND after 0522. Verify with docs/test-cases.md §93.
--
-- ── Shape ───────────────────────────────────────────────────────────────────
-- One Experience, many legs. Legs ARE ordinary deals carrying experience_id +
-- leg_role, so both parties reuse the existing deal UI and its RLS:
--
--   Leg 1  brand_leg    deals.brand_id = the client brand (Kiro)
--                       deals.creator_id = Guapd's house CREATOR row
--   Leg 2+ creator_leg  deals.brand_id = Guapd's house BRAND row
--                       deals.creator_id = the real creator
--
-- Guapd's special account is the hinge on both. Because deals_read scopes by
-- brand_id / creator_id, Kiro can never even see a Leg 2 row, and a creator can
-- never see Leg 1 — the boundary falls out of the existing policy, and the
-- money that is NOT on a deal row lives in tables below with no user access or
-- with column-level grants.
--
-- The house rows themselves are NOT created here: they would appear in ops
-- lists before the filters that hide them exist. Phase 3 seeds them together
-- with those filters. Only the flags, the lookup helpers and the integrity
-- check that uses them are added now.
--
-- ── Money (stored separately, never derived into one field) ─────────────────
--   experiences.brand_service_total_paise           (brand may read: its price)
--   experience_creator_terms.creator_gross_paise    (creator may read: own)
--   experience_creator_terms.platform_pct           (creator may read: own)
--   experience_creator_terms.creator_net_paise      (creator may read: own)
--   experience_creator_terms.guapd_margin_paise     (NO user may read)
--   experience_finance.*  (totals, internal notes)  (NO user may read)
-- Margin is computed by its own function on the two-leg path (Phase 2), never
-- by resolveDealFee. The fee baseline (scripts/test-fee-golden.ts) guards that.

-- ── Guapd special account ───────────────────────────────────────────────────
ALTER TABLE brands   ADD COLUMN IF NOT EXISTS is_guapd boolean NOT NULL DEFAULT false;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS is_guapd boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS brands_one_guapd   ON brands   (is_guapd) WHERE is_guapd;
CREATE UNIQUE INDEX IF NOT EXISTS creators_one_guapd ON creators (is_guapd) WHERE is_guapd;

COMMENT ON COLUMN brands.is_guapd IS
  'The one Guapd house brand row: the brand side of every Experience creator leg. At most one (partial unique index).';
COMMENT ON COLUMN creators.is_guapd IS
  'The one Guapd house creator row: the creator side of every Experience brand leg. At most one. Never bookable.';

CREATE OR REPLACE FUNCTION guapd_brand_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT id FROM brands WHERE is_guapd LIMIT 1
$$;

CREATE OR REPLACE FUNCTION guapd_creator_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT id FROM creators WHERE is_guapd LIMIT 1
$$;

-- ── experiences ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS experiences (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id                  uuid NOT NULL REFERENCES brands (id),
  title                     text NOT NULL,
  status                    text NOT NULL DEFAULT 'draft' CHECK (status IN (
                              'draft', 'requested', 'rostering', 'confirmed',
                              'shoot_scheduled', 'shoot_done', 'delivering', 'complete', 'cancelled')),
  template_id               uuid REFERENCES deal_templates (id),
  template_version          int,
  settings_snapshot         jsonb,
  brand_service_total_paise bigint NOT NULL DEFAULT 0 CHECK (brand_service_total_paise >= 0),
  shoot_date                date,
  shoot_city                text,
  created_by                uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS experiences_brand_idx ON experiences (brand_id);

COMMENT ON TABLE experiences IS
  'Parent of an Experience (Guapd-run content production). Links Leg 1 (brand_leg deal) and Leg 2+ (creator_leg deals). '
  'Brand reads ONLY the granted columns of its own rows; settings_snapshot is withheld. Internal notes and margin live in experience_finance.';
COMMENT ON COLUMN experiences.brand_service_total_paise IS
  'The ONE service price the brand pays Guapd. Margin is built in and never shown to the brand.';

ALTER TABLE experiences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON experiences FROM anon, authenticated;
GRANT SELECT (id, brand_id, title, status, brand_service_total_paise, shoot_date, shoot_city, created_at, updated_at)
  ON experiences TO authenticated;

-- ── Legs on deals ───────────────────────────────────────────────────────────
ALTER TABLE deals ADD COLUMN IF NOT EXISTS experience_id uuid REFERENCES experiences (id);
ALTER TABLE deals ADD COLUMN IF NOT EXISTS leg_role      text;
ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_leg_role_check;
ALTER TABLE deals ADD CONSTRAINT deals_leg_role_check
  CHECK (leg_role IS NULL OR leg_role IN ('brand_leg', 'creator_leg'));
ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_leg_pairing;
ALTER TABLE deals ADD CONSTRAINT deals_leg_pairing
  CHECK ((experience_id IS NULL) = (leg_role IS NULL));
-- One brand leg per Experience; one creator leg per (Experience, creator).
CREATE UNIQUE INDEX IF NOT EXISTS deals_one_brand_leg
  ON deals (experience_id) WHERE leg_role = 'brand_leg';
CREATE UNIQUE INDEX IF NOT EXISTS deals_one_creator_leg_per_creator
  ON deals (experience_id, creator_id) WHERE leg_role = 'creator_leg';
CREATE INDEX IF NOT EXISTS deals_experience_idx ON deals (experience_id) WHERE experience_id IS NOT NULL;

-- A leg must have the right parties, and Experience legs are always the
-- principal flow. Enforced in the database so no code path can build a leg
-- that puts the brand and the creator on the same deal.
CREATE OR REPLACE FUNCTION check_experience_leg()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  exp_brand uuid;
BEGIN
  IF NEW.experience_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT brand_id INTO exp_brand FROM experiences WHERE id = NEW.experience_id;
  IF exp_brand IS NULL THEN
    RAISE EXCEPTION 'Experience % does not exist', NEW.experience_id;
  END IF;
  IF NEW.payment_flow <> 'guapd_principal_vendor_payout' THEN
    RAISE EXCEPTION 'Experience legs use payment_flow guapd_principal_vendor_payout';
  END IF;
  IF NEW.leg_role = 'brand_leg' THEN
    IF NEW.brand_id <> exp_brand OR guapd_creator_id() IS NULL OR NEW.creator_id <> guapd_creator_id() THEN
      RAISE EXCEPTION 'A brand leg is between the Experience brand and the Guapd house creator';
    END IF;
  ELSE
    IF guapd_brand_id() IS NULL OR NEW.brand_id <> guapd_brand_id() THEN
      RAISE EXCEPTION 'A creator leg is between the Guapd house brand and a creator';
    END IF;
    IF NEW.creator_id = guapd_creator_id() THEN
      RAISE EXCEPTION 'A creator leg needs a real creator, not the Guapd house account';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS t_deals_01_experience_leg ON deals;
CREATE TRIGGER t_deals_01_experience_leg
  BEFORE INSERT OR UPDATE OF experience_id, leg_role, brand_id, creator_id, payment_flow ON deals
  FOR EACH ROW EXECUTE FUNCTION check_experience_leg();

-- ── experience_finance (internal; no user access) ───────────────────────────
CREATE TABLE IF NOT EXISTS experience_finance (
  experience_id             uuid PRIMARY KEY REFERENCES experiences (id) ON DELETE CASCADE,
  vendor_cost_total_paise   bigint NOT NULL DEFAULT 0 CHECK (vendor_cost_total_paise >= 0),
  guapd_margin_total_paise  bigint NOT NULL DEFAULT 0,
  internal_note             text,
  updated_at                timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE experience_finance IS
  'Ops-only P&L for an Experience: vendor cost total, Guapd margin total, internal notes. No brand or creator access, ever.';
ALTER TABLE experience_finance ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON experience_finance FROM anon, authenticated;

-- ── experience_creator_terms (one per creator leg) ──────────────────────────
CREATE TABLE IF NOT EXISTS experience_creator_terms (
  deal_id             uuid PRIMARY KEY REFERENCES deals (id) ON DELETE CASCADE,
  experience_id       uuid NOT NULL REFERENCES experiences (id) ON DELETE CASCADE,
  creator_id          uuid NOT NULL REFERENCES creators (id),
  day_rate_paise      bigint CHECK (day_rate_paise IS NULL OR day_rate_paise >= 0),
  days                numeric(6,2) CHECK (days IS NULL OR days > 0),
  creator_gross_paise bigint NOT NULL DEFAULT 0 CHECK (creator_gross_paise >= 0),
  platform_pct        numeric(5,2) NOT NULL DEFAULT 30 CHECK (platform_pct >= 0 AND platform_pct <= 100),
  creator_net_paise   bigint NOT NULL DEFAULT 0 CHECK (creator_net_paise >= 0),
  guapd_margin_paise  bigint NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ect_net_le_gross CHECK (creator_net_paise <= creator_gross_paise)
);
CREATE INDEX IF NOT EXISTS ect_experience_idx ON experience_creator_terms (experience_id);
CREATE INDEX IF NOT EXISTS ect_creator_idx ON experience_creator_terms (creator_id);
COMMENT ON TABLE experience_creator_terms IS
  'A creator''s money on their leg: rate, 30% platform fee, net (= the vendor payout). The creator reads their own row '
  'EXCEPT guapd_margin_paise (column not granted). Brands have no access at all.';

-- creator_id decides who may READ this row, so it must be the leg's own
-- creator, on a creator leg of the same Experience. Otherwise a mistyped row
-- would show one creator another's money.
CREATE OR REPLACE FUNCTION check_creator_terms()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM deals d
    WHERE d.id = NEW.deal_id
      AND d.leg_role = 'creator_leg'
      AND d.experience_id = NEW.experience_id
      AND d.creator_id = NEW.creator_id
  ) THEN
    RAISE EXCEPTION 'Creator terms must belong to that creator''s own leg of this Experience';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS t_ect_check ON experience_creator_terms;
CREATE TRIGGER t_ect_check
  BEFORE INSERT OR UPDATE ON experience_creator_terms
  FOR EACH ROW EXECUTE FUNCTION check_creator_terms();

ALTER TABLE experience_creator_terms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON experience_creator_terms FROM anon, authenticated;
GRANT SELECT (deal_id, experience_id, creator_id, day_rate_paise, days, creator_gross_paise, platform_pct, creator_net_paise, created_at, updated_at)
  ON experience_creator_terms TO authenticated;

-- ── experience_roster (shared roster; brand decides, Guapd adds and locks) ──
CREATE TABLE IF NOT EXISTS experience_roster (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id   uuid NOT NULL REFERENCES experiences (id) ON DELETE CASCADE,
  creator_id      uuid NOT NULL REFERENCES creators (id),
  added_by        text NOT NULL CHECK (added_by IN ('brand', 'guapd')),
  brand_decision  text NOT NULL DEFAULT 'pending' CHECK (brand_decision IN ('pending', 'accepted', 'rejected')),
  locked          boolean NOT NULL DEFAULT false,
  decided_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (experience_id, creator_id)
);
COMMENT ON TABLE experience_roster IS
  'Creators proposed for an Experience. The brand reads its own roster (profiles, never rates: no money columns here) '
  'and decides via server actions; Guapd adds and locks. Creators have no access.';
ALTER TABLE experience_roster ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON experience_roster FROM anon, authenticated;
GRANT SELECT (id, experience_id, creator_id, added_by, brand_decision, locked, decided_at, created_at, updated_at)
  ON experience_roster TO authenticated;

-- ── Read policies (mirrored in rls.sql) ─────────────────────────────────────
DROP POLICY IF EXISTS experiences_read_brand ON experiences;
CREATE POLICY experiences_read_brand ON experiences FOR SELECT
  USING (brand_id = my_brand_id() AND brand_id IS DISTINCT FROM guapd_brand_id());

DROP POLICY IF EXISTS ect_read_own_creator ON experience_creator_terms;
CREATE POLICY ect_read_own_creator ON experience_creator_terms FOR SELECT
  USING (creator_id = my_creator_id() AND creator_id IS DISTINCT FROM guapd_creator_id());

DROP POLICY IF EXISTS roster_read_brand ON experience_roster;
CREATE POLICY roster_read_brand ON experience_roster FOR SELECT
  USING (EXISTS (SELECT 1 FROM experiences e WHERE e.id = experience_id AND e.brand_id = my_brand_id()));

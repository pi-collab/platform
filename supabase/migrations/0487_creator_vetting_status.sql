-- Migration 0487: vetting becomes a status, and gains a third outcome
--
-- Vetting has been two booleans encoding three states:
--
--   pending    is_vetted false, is_rejected false
--   approved   is_vetted true,  is_rejected false
--   rejected   is_vetted false, is_rejected true
--
-- Guapd Growth is a fourth. Adding a third boolean would give eight
-- combinations for four real states, and the four that mean nothing are the
-- ones a bug eventually writes.
--
-- ── The booleans stay, and stop being writable in practice ───────────────────
-- is_vetted is read in 26 files and 5 RLS policies. Dropping it would be a
-- rewrite of the brand-facing surface area to change a vetting decision. So it
-- stays — DERIVED, by a trigger, from vetting_status.
--
-- The trigger is the point. A status column plus two booleans that can disagree
-- is worse than either alone: it puts the truth in two places and lets them
-- drift. Deriving on every write means ops actions, raw SQL and any future
-- admin tool all land consistent, and a code path that still writes is_vetted
-- directly becomes a no-op rather than a corruption.
--
-- ── Why growth implies is_vetted = false ────────────────────────────────────
-- Every brand-facing surface already filters on is_vetted: the RLS policies on
-- creator_products and creator_addon_rates, /browse, the storefront RPC, offer
-- creation. Encoding growth as not-vetted makes Growth creators invisible to
-- brands without touching a single one of them. The alternative — a new
-- condition added in 26 places — is 26 chances to miss one.

ALTER TABLE creators
  ADD COLUMN IF NOT EXISTS vetting_status text NOT NULL DEFAULT 'pending';

-- Backfill from the booleans BEFORE the constraint, so an unexpected
-- combination surfaces here rather than failing the whole migration.
UPDATE creators
SET vetting_status = CASE
  WHEN is_rejected = true THEN 'rejected'
  WHEN is_vetted = true   THEN 'deals_approved'
  ELSE 'pending'
END;

ALTER TABLE creators
  DROP CONSTRAINT IF EXISTS creators_vetting_status_chk;
ALTER TABLE creators
  ADD CONSTRAINT creators_vetting_status_chk
  CHECK (vetting_status IN ('pending', 'deals_approved', 'growth', 'rejected'));

-- The future Growth product filters on this: "growth creators, by size, by
-- niche". Indexed now so that query is cheap when it arrives.
CREATE INDEX IF NOT EXISTS creators_vetting_status_idx ON creators (vetting_status);

-- ── The booleans are derived, always ────────────────────────────────────────
CREATE OR REPLACE FUNCTION sync_creator_vetting_flags()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Deliberately ignores whatever NEW.is_vetted / NEW.is_rejected were set to.
  -- vetting_status is the single source of truth; a caller that still writes a
  -- boolean directly gets it overwritten rather than silently splitting the
  -- truth in two.
  NEW.is_vetted   := (NEW.vetting_status = 'deals_approved');
  NEW.is_rejected := (NEW.vetting_status = 'rejected');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS creators_sync_vetting_flags ON creators;
CREATE TRIGGER creators_sync_vetting_flags
  BEFORE INSERT OR UPDATE ON creators
  FOR EACH ROW
  EXECUTE FUNCTION sync_creator_vetting_flags();

COMMENT ON COLUMN creators.vetting_status IS
  'The vetting decision. pending | deals_approved | growth | rejected. SINGLE SOURCE OF TRUTH — is_vetted and is_rejected are derived from it by trigger and must never be written directly.';
COMMENT ON COLUMN creators.is_vetted IS
  'DERIVED from vetting_status by creators_sync_vetting_flags. Do not write. Kept because 26 files and 5 RLS policies read it; growth creators are is_vetted = false, which is what keeps them invisible to brands.';

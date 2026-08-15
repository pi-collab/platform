-- Migration 039: Brand approval gate on FIRST SEND (not on dashboard access)
--
-- Replaces the old model where an unapproved brand was bounced out of the
-- dashboard entirely. A brand can now sign up, explore, browse vetted creators
-- and build drafts freely; the gate moves to the moment they first try to send
-- a deal to a creator. That first send is HELD, ops reviews the brand once, and
-- on approval every held deal is released automatically.
--
-- The gate is on the BRAND, not the deal — once approved, no further review.

-- ── 1. brand_status: new state machine ───────────────────────────────────────
--   unreviewed     → signed up, can explore, has never attempted a send
--   pending_review → attempted a first send; deal(s) held awaiting ops
--   approved       → cleared; sends go straight through, forever
--   rejected       → blocked from NEW sends; see §3 for why that is the only
--                    thing rejection blocks
--
-- Named `unreviewed`, not `unverified`, to avoid collision with EMAIL
-- verification — an adjacent concept that is handled by Supabase auth and is
-- already required before dashboard access.
ALTER TABLE brands DROP CONSTRAINT IF EXISTS brands_brand_status_check;

-- Existing 'pending' rows predate this model. Only those that have ACTUALLY
-- TRANSACTED are cleared: the justification for auto-approving is "don't strand
-- live deals mid-flight", which by definition only applies to a brand with
-- deals. A never-reviewed brand with zero deals has nothing to strand, and
-- auto-approving it on the very migration that introduces the review gate would
-- defeat the gate for exactly the account it was built to catch.
--
-- Untransacted 'pending' rows fall through to the new 'unreviewed' default and
-- get reviewed on first send, like any new brand.
UPDATE brands SET brand_status = 'approved'
WHERE brand_status = 'pending'
  AND EXISTS (SELECT 1 FROM deals WHERE deals.brand_id = brands.id);

-- Everything still 'pending' has never transacted. Map it explicitly to
-- 'unreviewed' — REQUIRED, not cosmetic: 'pending' is not in the new CHECK set
-- below, so leaving any row on it makes ADD CONSTRAINT fail and aborts the
-- whole migration. The column default only applies to new rows.
UPDATE brands SET brand_status = 'unreviewed' WHERE brand_status = 'pending';

ALTER TABLE brands
  ADD CONSTRAINT brands_brand_status_check
  CHECK (brand_status IN ('unreviewed', 'pending_review', 'approved', 'rejected'));

ALTER TABLE brands ALTER COLUMN brand_status SET DEFAULT 'unreviewed';

-- Reason shown to the brand when ops rejects. Held deals are NOT deleted on
-- rejection — the brand keeps seeing its work alongside the reason.
ALTER TABLE brands ADD COLUMN IF NOT EXISTS rejection_reason text;

-- ── 2. tier: stub for future paid plans ──────────────────────────────────────
-- Every brand is free. NO gating logic reads this yet; it exists so paid tiers
-- slot in later without a migration on live data.
ALTER TABLE brands ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'free'
  CHECK (tier IN ('free'));

-- ── 3. deals.held_at: the hold marker ────────────────────────────────────────
-- Deliberately NOT a new deal_status enum value. A held deal IS 'negotiating';
-- the hold is orthogonal to lifecycle. A separate nullable timestamp avoids
-- auditing every status switch, query and UI branch in the codebase, and makes
-- "held" unambiguous and indexable.
--
-- NULL = deliverable to the creator. NOT NULL = withheld, never delivered.
ALTER TABLE deals ADD COLUMN IF NOT EXISTS held_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_deals_held
  ON deals (brand_id)
  WHERE held_at IS NOT NULL;

COMMENT ON COLUMN deals.held_at IS
  'Set when a deal was created by a brand not yet approved to send. While non-null the deal is invisible to the creator (enforced in RLS, not app code) and no notification has fired. Cleared by ops approval, which then sends it.';

-- ── 4. RLS: held deals are invisible to creators ─────────────────────────────
-- THIS is the isolation guarantee, not app-level filtering. A held deal is
-- unreachable from any creator query, in any code path, including ones not yet
-- written. The brand still sees its own held deals.
--
-- Mirrored in supabase/rls.sql (single source of truth for policies).
DROP POLICY IF EXISTS deals_read   ON deals;
DROP POLICY IF EXISTS deals_update ON deals;

CREATE POLICY deals_read
  ON deals FOR SELECT
  USING (
    brand_id = my_brand_id()
    OR (creator_id = my_creator_id() AND held_at IS NULL)
  );

CREATE POLICY deals_update
  ON deals FOR UPDATE
  USING (
    brand_id = my_brand_id()
    OR (creator_id = my_creator_id() AND held_at IS NULL)
  );

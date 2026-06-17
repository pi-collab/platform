-- =============================================================================
-- Migration 002: Enrich creators, add campaign_id hook, add brand_status
-- Additive only — no columns altered or dropped.
-- RLS is ON: all new columns inherit existing row-level policies (Postgres RLS
-- is row-level, not column-level — no new policies needed).
-- =============================================================================

-- ── 1. Creators: rich profile columns ───────────────────────────────────────

ALTER TABLE creators ADD COLUMN bio              text;
ALTER TABLE creators ADD COLUMN profile_photo_url text;
ALTER TABLE creators ADD COLUMN worked_with       jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE creators ADD COLUMN portfolio_links   jsonb NOT NULL DEFAULT '[]'::jsonb;

-- social_accounts: structured array of social platform entries.
-- Shape (enforced by app code, documented here):
-- [
--   {
--     "platform":       "instagram",                           -- instagram | youtube | twitter | linkedin | other
--     "handle":         "@rohanfinance",                       -- display handle (string)
--     "url":            "https://instagram.com/rohanfinance",  -- full profile URL (string, nullable)
--     "follower_count": 180000,                                -- self-entered integer (nullable)
--     "verified":       false                                  -- default false; true = connected & verified via API (future)
--   }
-- ]
ALTER TABLE creators ADD COLUMN social_accounts  jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ── 2. Deals: campaign grouping hook ────────────────────────────────────────
-- Nullable stub — no campaigns table yet. Deals can be grouped later by
-- adding a campaigns table and populating this FK. Same cheap-nullable-stub
-- pattern as managed_by on users.

ALTER TABLE deals ADD COLUMN campaign_id uuid;

-- ── 3. Brands: approval status gate ─────────────────────────────────────────
-- Using text (not enum) to avoid a CREATE TYPE + future ALTER TYPE dance for
-- what is effectively a simple state field. Valid values: pending, approved, rejected.

ALTER TABLE brands ADD COLUMN brand_status text NOT NULL DEFAULT 'pending'
  CHECK (brand_status IN ('pending', 'approved', 'rejected'));

-- Backfill: all existing brands were created through the onboarding flow and
-- are implicitly approved. Set them to 'approved' so they aren't locked out.
-- New brands created after this migration default to 'pending'.
UPDATE brands SET brand_status = 'approved' WHERE brand_status = 'pending';

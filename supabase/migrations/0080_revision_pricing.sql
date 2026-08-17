-- Revision pricing: creator defaults on products, deal-level snapshot on deals.
-- Purely additive — existing rows get safe defaults (1 included, 0 per extra = free extras).
-- Uses IF NOT EXISTS pattern for idempotency.

-- Creator products: default revision terms per product
ALTER TABLE creator_products
  ADD COLUMN IF NOT EXISTS included_revisions int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS price_per_extra_revision_paise bigint NOT NULL DEFAULT 0;

-- Deals: per-deal revision pricing (snapshot from offer, brand can adjust)
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS price_per_extra_revision_paise bigint NOT NULL DEFAULT 0;

-- Drop the constraint that prevents revisions_used > revision_limit.
-- We use warn-but-allow: overages are tracked and priced, not blocked.
-- The unnamed table-level CHECK may be auto-named deals_check, deals_check1, etc.
-- Drop all possible names to be safe.
ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_revisions_used_check;
ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_check;
ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_check1;

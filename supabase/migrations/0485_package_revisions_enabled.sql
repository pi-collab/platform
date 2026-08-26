-- Migration 0485: revisions are something a creator turns ON
--
-- creator_products has carried included_revisions (default 1) and
-- price_per_extra_revision_paise (default 0) since 0080, editable from ops and
-- nowhere else. A creator has never been asked about either, so every package
-- silently offers one free revision and charges nothing beyond it.
--
-- There is no way to express "this package does not do revisions", because the
-- columns are NOT NULL with defaults: zero included revisions is
-- indistinguishable from a creator who never thought about it. Hence a flag.
--
-- ── Why existing rows are backfilled TRUE ───────────────────────────────────
-- Defaulting everything to false would change what today's packages offer: the
-- offer builder prefills a deal's revision terms from the selected products, so
-- every live package would quietly stop including its revision. Existing rows
-- keep behaving exactly as they do now; only NEW packages start switched off,
-- which is what "ask the creator" means.

ALTER TABLE creator_products
  ADD COLUMN IF NOT EXISTS revisions_enabled boolean NOT NULL DEFAULT false;

-- Everything that exists today already behaves as though revisions were on.
UPDATE creator_products
SET revisions_enabled = true
WHERE revisions_enabled = false;

-- Zero included revisions with a per-extra price is coherent (every revision is
-- chargeable). A per-extra price on a DISABLED package is not — it is a number
-- nothing can ever read.
ALTER TABLE creator_products
  DROP CONSTRAINT IF EXISTS creator_products_revisions_coherent;
ALTER TABLE creator_products
  ADD CONSTRAINT creator_products_revisions_coherent
  CHECK (
    revisions_enabled = true
    OR (included_revisions = 0 AND price_per_extra_revision_paise = 0)
  );

COMMENT ON COLUMN creator_products.revisions_enabled IS
  'Whether this package offers revisions at all. False means the two revision columns are zeroed and no revision terms are offered to a brand. Backfilled true in 0485 so existing packages kept their behaviour.';

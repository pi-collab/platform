-- Migration 0491: a package could not be created at all
--
-- ── What broke ───────────────────────────────────────────────────────────────
-- 0080 gave creator_products.included_revisions a DEFAULT of 1.
-- 0485 added revisions_enabled with a DEFAULT of false, plus:
--
--   CHECK (revisions_enabled = true
--          OR (included_revisions = 0 AND price_per_extra_revision_paise = 0))
--
-- An INSERT that names none of the three therefore takes 1 / 0 / false, which
-- fails the check. That is every insert the app makes, so adding a package has
-- been rejected outright since 0485 shipped:
--
--   new row for relation "creator_products" violates check constraint
--   "creator_products_revisions_coherent"
--
-- It went unnoticed because 0485 BACKFILLED existing rows to enabled = true.
-- Nothing already on the table violated the constraint; only the next new row
-- did, and the app reported it as "Could not save that. Please try again."
--
-- ── The fix ─────────────────────────────────────────────────────────────────
-- The default becomes 0, so the columns agree with revisions_enabled's own
-- default instead of contradicting it. A DEFAULT of 1 dated from when every
-- package included one revision; 0485 made "does this package do revisions at
-- all" an explicit choice, and a default that silently answers yes is exactly
-- what the flag was added to stop.
--
-- The constraint stays. It is correct: a per-extra price on a package that
-- offers no revisions is a number nothing can read. The defaults were the half
-- of the change that was missed.
--
-- The app now writes both columns explicitly too, so this is belt and braces.
-- 0486 moved revision terms onto the CREATOR, so these columns are vestigial:
-- the point here is that a vestigial column must not be able to block a write.

ALTER TABLE creator_products
  ALTER COLUMN included_revisions SET DEFAULT 0;

ALTER TABLE creator_products
  ALTER COLUMN price_per_extra_revision_paise SET DEFAULT 0;

-- No UPDATE of existing rows. Every one of them satisfies the constraint
-- already, and rewriting revision terms a brand may have been shown is not
-- something a defaults fix should do.

COMMENT ON COLUMN creator_products.included_revisions IS
  'VESTIGIAL since 0486, which moved revision terms to creators. Kept as the source that migration backfilled FROM. Defaults to 0 (was 1) because a nonzero default contradicts revisions_enabled defaulting to false and fails creator_products_revisions_coherent on every new insert.';

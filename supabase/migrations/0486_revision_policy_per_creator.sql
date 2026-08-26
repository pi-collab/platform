-- Migration 0486: revision terms belong to the creator, not the package
--
-- ── Why this moves ───────────────────────────────────────────────────────────
-- A revision is a ROUND of feedback on a delivery, not a property of one
-- deliverable. review-actions increments revisions_used only on the deal's
-- delivered -> revision transition; sending three items back in the same round
-- counts once, deliberately.
--
-- So per-package terms described a unit nothing counts. A deal containing a
-- Reel with "2 revisions" and a YouTube video with "1" has no coherent answer,
-- and the offer builder papered over it with min() across the selected
-- packages — which meant adding one stingy deliverable silently reduced the
-- whole deal's allowance to zero. That was never a policy anyone chose.
--
-- One policy per creator. Not per channel, the way collab and boosting rates
-- are: a round of feedback spans channels by definition, so per-channel would
-- recreate the same mismatch one level up.
--
-- ── The package columns stay ─────────────────────────────────────────────────
-- included_revisions and price_per_extra_revision_paise are left on
-- creator_products, untouched. Nothing new reads them. They are the source this
-- backfills FROM, and dropping them would destroy the evidence for a migration
-- that has to be right the first time. Retire them once this has run in
-- production for a while.

ALTER TABLE creators
  ADD COLUMN IF NOT EXISTS revisions_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS included_revisions int NOT NULL DEFAULT 0
    CHECK (included_revisions >= 0 AND included_revisions <= 20),
  ADD COLUMN IF NOT EXISTS price_per_extra_revision_paise bigint NOT NULL DEFAULT 0
    CHECK (price_per_extra_revision_paise >= 0);

-- ── Backfill ────────────────────────────────────────────────────────────────
-- MAX of each, on purpose:
--
--   included    the most generous allowance the creator already offered
--               anywhere. Taking min would shrink what some brands were
--               already being given, which is the one direction a migration
--               must not move terms.
--
--   per-extra   the highest rate they had set. Taking min would quietly
--               discount work they had priced.
--
-- Where a creator's packages disagreed, this is a judgement — and it is now
-- visible in one editable place, which is the whole point. Previously these
-- numbers existed only in ops and no creator could see them at all.
UPDATE creators c
SET
  revisions_enabled = true,
  included_revisions = LEAST(20, GREATEST(0, sub.max_included)),
  price_per_extra_revision_paise = GREATEST(0, sub.max_extra)
FROM (
  SELECT
    creator_id,
    COALESCE(MAX(included_revisions), 0) AS max_included,
    COALESCE(MAX(price_per_extra_revision_paise), 0) AS max_extra
  FROM creator_products
  WHERE is_active = true
    AND COALESCE(revisions_enabled, true) = true
  GROUP BY creator_id
) AS sub
WHERE c.id = sub.creator_id;

-- A per-extra price on a creator who offers no revisions is a number nothing
-- can read — the same coherence rule 0485 applied per package.
ALTER TABLE creators
  DROP CONSTRAINT IF EXISTS creators_revisions_coherent;
ALTER TABLE creators
  ADD CONSTRAINT creators_revisions_coherent
  CHECK (
    revisions_enabled = true
    OR (included_revisions = 0 AND price_per_extra_revision_paise = 0)
  );

COMMENT ON COLUMN creators.revisions_enabled IS
  'Whether this creator offers revisions at all. False means unlimited and free: with a limit of 0 and no per-extra price the overage is zero however many rounds are requested — see lib/revisions.';
COMMENT ON COLUMN creators.included_revisions IS
  'Free rounds of feedback per DEAL, not per deliverable. A revision is one delivered -> revision transition however many items it touches.';

-- No RLS change: creators policies already scope this row, and these are terms
-- a brand must be able to read on a vetted creator, exactly like a rate.

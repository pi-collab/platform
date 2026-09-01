-- Migration 0494: verified performance on a delivered post
--
-- A creator marks a deliverable posted and gives us the permalink. If they have
-- connected Instagram, that post is theirs, so we can read its insights and show
-- a brand what the thing they paid for actually did.
--
-- ── On the ITEM, not the deal ───────────────────────────────────────────────
-- A deal can carry several deliverables and each is its own post with its own
-- numbers. deals.posted_url exists as a convenience for the single-item case and
-- is not the right home for per-post performance.
--
-- ── Why a match STATUS and not just a nullable id ───────────────────────────
-- "No media id" has four different meanings and a brand deserves to be told
-- which: the creator has not connected, the URL matched nothing on their
-- account, the platform is not one we can read, or we simply have not looked
-- yet. Collapsing those into NULL produces a screen that says nothing when it
-- could say something true.
--
--   pending       not resolved yet
--   resolved      matched to a media id on the creator's own account
--   not_found     no post on their account has that shortcode. Wrong account,
--                 deleted, or a typo — we genuinely cannot tell which
--   not_connected the creator has no Instagram connection
--   unsupported   not an Instagram permalink we can read (YouTube, a story)
--
-- Insights are NEVER inferred. A post with no numbers shows a thumbnail and a
-- link; it does not show zero.

ALTER TABLE deal_deliverable_items
  ADD COLUMN IF NOT EXISTS ig_media_id       text,
  ADD COLUMN IF NOT EXISTS ig_match_status   text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS ig_insights       jsonb,
  ADD COLUMN IF NOT EXISTS ig_thumbnail_url  text,
  ADD COLUMN IF NOT EXISTS ig_last_synced_at timestamptz;

-- The DEFAULT and the CHECK are added together, and the default is a value the
-- check accepts. A CHECK whose column default violates it passes its own
-- migration and then fails every future INSERT, because a migration never
-- exercises the defaults it just declared (see 0485/0491).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ddi_ig_match_status_check'
  ) THEN
    ALTER TABLE deal_deliverable_items
      ADD CONSTRAINT ddi_ig_match_status_check
      CHECK (ig_match_status IN ('pending', 'resolved', 'not_found', 'not_connected', 'unsupported'));
  END IF;
END $$;

-- The refresh job selects resolved items by how stale they are and how long ago
-- they were posted, so both live in the index.
CREATE INDEX IF NOT EXISTS ddi_ig_refresh_idx
  ON deal_deliverable_items (ig_last_synced_at, posted_at)
  WHERE ig_match_status = 'resolved';

COMMENT ON COLUMN deal_deliverable_items.ig_match_status IS
  'pending | resolved | not_found | not_connected | unsupported. Never collapse these to NULL: a brand is owed the reason a post has no numbers.';
COMMENT ON COLUMN deal_deliverable_items.ig_insights IS
  'Last read from /{media-id}/insights: reach, likes, comments, saved, total_interactions, views. Absent metrics are ABSENT, never zero.';
COMMENT ON COLUMN deal_deliverable_items.ig_thumbnail_url IS
  'Our stored copy. Instagram serves thumbnails from a signed CDN URL that expires, so the source link is never persisted.';

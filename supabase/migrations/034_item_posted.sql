-- Migration: Per-item posted URL and timestamp
-- Each deliverable item gets its own posted_url so creators can mark
-- each deliverable as posted independently (e.g. separate reels).

ALTER TABLE deal_deliverable_items
  ADD COLUMN IF NOT EXISTS posted_url  text,
  ADD COLUMN IF NOT EXISTS posted_at   timestamptz;

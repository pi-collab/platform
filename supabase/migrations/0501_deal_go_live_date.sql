-- Migration 0501: the date the content goes live
--
-- ── What this adds ─────────────────────────────────────────────────────────
-- A deal already carries timeline_date ("Deliver by" - when the creator hands
-- the work over) and posted_at (stamped when they mark it live). What it never
-- carried is the date both sides AGREED it would go live. That is the date a
-- brand plans a campaign around, and the one a creator is actually held to.
-- Deriving it from the other two is not possible: delivery is not publication,
-- and posted_at is a record of what happened, not a term that was agreed.
--
-- ── Why usage_rights is NOT dropped ────────────────────────────────────────
-- It stops being collected and stops appearing on new deals, but the column
-- stays and existing values keep rendering. 69 deals were agreed with usage
-- terms in them; some are complete. Dropping the column would erase what those
-- two parties actually agreed, from the one place either can still read it.
-- Every read site already guards on `usage_rights &&`, so a new deal writing
-- NULL hides the row on its own - no screen needed a condition added to stop
-- showing a term nobody agreed.
--
-- Nullable and no default: a deal whose go-live date is still being negotiated
-- has no honest value, and NULL says that. Do not backfill it from
-- timeline_date - that would assert an agreement about publication that was
-- never made.

ALTER TABLE deals ADD COLUMN IF NOT EXISTS go_live_date date;

COMMENT ON COLUMN deals.go_live_date IS
  'The agreed date the content goes live. Distinct from timeline_date (hand-over) and posted_at (when it actually went live). NULL = not agreed.';

COMMENT ON COLUMN deals.usage_rights IS
  'LEGACY as of 0501: no longer collected on new deals. Retained and still displayed where present, because it records terms real deals were agreed under.';

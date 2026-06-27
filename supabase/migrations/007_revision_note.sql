-- Add revision_note column to deal_deliverable_items.
-- Stores brand feedback when requesting a revision; cleared on creator resubmit.

ALTER TABLE deal_deliverable_items
  ADD COLUMN IF NOT EXISTS revision_note text;

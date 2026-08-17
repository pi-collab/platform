-- Add paid_at column to invoices.
-- This column was added manually in prod but was never captured in a migration.
-- The mark_deal_paid() function (010_robustness_functions.sql) sets this column
-- on payment — it would fail at runtime without it.

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_at timestamptz;

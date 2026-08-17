-- Create the notifications table.
-- This table was created manually in prod but was never captured in a migration.
-- rls.sql depends on this table existing (enables RLS + creates 3 policies).
--
-- Schema matches prod exactly as of 2026-07-26.

CREATE TABLE IF NOT EXISTS notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id),
  deal_id    uuid REFERENCES deals(id),
  type       text NOT NULL,
  body       text NOT NULL,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user
  ON notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_deal
  ON notifications(deal_id)
  WHERE deal_id IS NOT NULL;

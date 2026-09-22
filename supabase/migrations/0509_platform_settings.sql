-- Platform-wide settings ops can change without a deploy.
--
-- First tenant: the Growth campaign minimum. We do not yet know whether the
-- right threshold is five creators or twenty thousand rupees, and finding out
-- means changing it repeatedly while the pilot runs. A constant in the code
-- would make every experiment a deploy.
--
-- Deliberately a generic key/value table rather than a growth_settings table:
-- the second setting is already foreseeable, and a table per setting is how a
-- schema fills up with one-row tables.

CREATE TABLE IF NOT EXISTS platform_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_by uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE platform_settings IS
  'Global settings ops can change without a deploy. Read through lib/platform-settings.ts, which supplies a default for every key so a missing row is never a broken page.';

-- ── The Growth minimum ──────────────────────────────────────────────────────
-- metric decides which number is ENFORCED; both are stored either way, so
-- switching is one ops edit rather than a migration.
--
-- Seeded at five creators, which is a starting guess and expected to move.
INSERT INTO platform_settings (key, value)
VALUES (
  'growth_campaign_minimum',
  '{"metric": "creators", "min_creators": 5, "min_value_paise": 2000000}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Readable by any signed-in user: the campaign builder has to SHOW the
-- requirement ("add at least 5 creators") before it can enforce it, and a brand
-- being able to read a threshold that is about to be applied to them is the
-- point rather than a leak. Writes are service-role only, through ops.

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_settings_read ON platform_settings;
CREATE POLICY platform_settings_read
  ON platform_settings FOR SELECT
  TO authenticated
  USING (true);

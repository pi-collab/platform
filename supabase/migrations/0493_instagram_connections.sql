-- Migration 0493: Instagram connections
--
-- A creator connects their Instagram professional account so the storefront can
-- show measured figures instead of typed ones. This is a DATA connection, not a
-- login method: creators still sign in with phone OTP.
--
-- ── Why its own table ───────────────────────────────────────────────────────
-- creators.social_accounts already holds the handle, and it is a jsonb array
-- whose keys are owned by four different screens. Two writers were destroying
-- each other's keys there as recently as this week (see mergeSocialAccounts).
-- A row carrying an access token, an expiry and a sync status does not belong
-- in an array with that history.
--
-- ── not_connected is the ABSENCE of a row ───────────────────────────────────
-- Four stored states, five UI states. Storing 'not_connected' would mean a row
-- for every creator who never connected, kept in sync with nothing.
--
-- ── The token ───────────────────────────────────────────────────────────────
-- Encrypted with AES-256-GCM before it ever reaches this table
-- (lib/instagram-token.ts). The ciphertext, iv and auth tag are stored
-- separately, plus a key_version so the key can be rotated without a migration.
--
-- Encryption protects a database dump, a backup leak, and anyone reading the
-- table in the Supabase dashboard. It does NOT protect against app compromise:
-- the key sits in the same environment as the service-role key. That is a
-- deliberate limit, not an oversight.

CREATE TABLE IF NOT EXISTS creator_instagram_connections (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- One connection per creator. Reconnecting updates this row rather than
  -- accumulating history: a superseded token is a liability, not a record.
  creator_id        uuid NOT NULL UNIQUE REFERENCES creators (id) ON DELETE CASCADE,

  -- The Instagram professional account id (`user_id` from /me), NOT the
  -- app-scoped `id`. Insights are addressed by this one.
  ig_user_id        text NOT NULL,
  -- The app-scoped id (`id` from /me), which is NOT ig_user_id. Meta's
  -- deauthorize and data-deletion callbacks identify the user by this one, so
  -- without it a callback cannot find the row it is meant to act on.
  ig_app_scoped_id  text,
  username          text,

  -- BUSINESS | MEDIA_CREATOR | PERSONAL, as returned by /me. Re-read on every
  -- sync: a creator can switch their account back to personal at any time, and
  -- insights stop working when they do.
  account_type      text,

  status            text NOT NULL DEFAULT 'connected'
    CHECK (status IN ('connected', 'expired', 'needs_reconnect', 'personal_account')),

  token_ciphertext  text NOT NULL,
  token_iv          text NOT NULL,
  token_tag         text NOT NULL,
  key_version       int  NOT NULL DEFAULT 1,

  -- Long-lived tokens last 60 days. The cron refreshes well before this; if it
  -- passes, status becomes 'expired' and the creator must reconnect.
  token_expires_at  timestamptz NOT NULL,
  last_refreshed_at timestamptz,

  scopes            text[],

  -- The measured figures, read by the storefront. Stored rather than fetched on
  -- render: Instagram retains user insights for 90 days, rate limits apply, and
  -- a public page must not depend on a third-party API being up.
  snapshot          jsonb,
  last_synced_at    timestamptz,
  -- The last failure, so a stale snapshot can explain itself instead of just
  -- being old.
  sync_error        text,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- The cron selects on these two.
-- Callbacks arrive keyed on the app-scoped id.
CREATE INDEX IF NOT EXISTS ig_conn_app_scoped_idx ON creator_instagram_connections (ig_app_scoped_id);
CREATE INDEX IF NOT EXISTS ig_conn_expiry_idx ON creator_instagram_connections (token_expires_at)
  WHERE status = 'connected';
CREATE INDEX IF NOT EXISTS ig_conn_synced_idx ON creator_instagram_connections (last_synced_at)
  WHERE status = 'connected';

COMMENT ON TABLE creator_instagram_connections IS
  'One Instagram data connection per creator. NO client may read this table: RLS denies everything and all access goes through server actions using the service role. The absence of a row means not connected.';
COMMENT ON COLUMN creator_instagram_connections.ig_user_id IS
  'The Instagram professional account id (user_id from /me), not the app-scoped id. Insights are addressed by this.';
COMMENT ON COLUMN creator_instagram_connections.snapshot IS
  'Last successful sync: followers_count, media_count, name, biography, profile_picture_url, age/gender/city demographics, reach. NOT avg views, which Instagram does not return at account level.';

-- ── RLS: deny everything ────────────────────────────────────────────────────
-- Not a column allowlist. RLS is row-level and cannot hide the token columns,
-- and the allowlist pattern used on `creators` (0470) is precisely what broke
-- the creator layout when a column was added without a matching GRANT (0489).
-- Nothing client-side reads this table at all; the UI gets status and snapshot
-- through a server action that selects explicit non-token columns.

ALTER TABLE creator_instagram_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ig_conn_deny_select ON creator_instagram_connections;
DROP POLICY IF EXISTS ig_conn_deny_insert ON creator_instagram_connections;
DROP POLICY IF EXISTS ig_conn_deny_update ON creator_instagram_connections;
DROP POLICY IF EXISTS ig_conn_deny_delete ON creator_instagram_connections;

CREATE POLICY ig_conn_deny_select ON creator_instagram_connections FOR SELECT USING (false);
CREATE POLICY ig_conn_deny_insert ON creator_instagram_connections FOR INSERT WITH CHECK (false);
CREATE POLICY ig_conn_deny_update ON creator_instagram_connections FOR UPDATE USING (false);
CREATE POLICY ig_conn_deny_delete ON creator_instagram_connections FOR DELETE USING (false);

-- Belt and braces: even a future policy mistake cannot expose the token if the
-- role was never granted the table.
REVOKE ALL ON creator_instagram_connections FROM anon, authenticated;

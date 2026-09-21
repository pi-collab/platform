-- Remember whether a creator has already been told their Instagram connection
-- broke, so the telling happens ONCE per break.
--
-- ── Why this is state on the connection, not a query over notifications ─────
-- The obvious alternative is "have we already written a notifications row of
-- this type?". That answers a slightly different question and answers it
-- wrongly: notifications are keyed to users.id, and a creator who was added by
-- ops and has never claimed their profile has no user row at all. Those
-- creators can still have a connection and can still break, and a lookup
-- keyed to a user that does not exist reads as "never notified" every night.
--
-- Holding it here also makes the reset free. `removeConnection` DELETES the
-- row on a deauthorize, a data-deletion request or a creator disconnecting,
-- so the memory of having notified them goes with it — which is correct, since
-- the next break after a fresh connect is a genuinely new event.
--
-- ── Nullable, no default, no backfill ───────────────────────────────────────
-- NULL means "not yet told about the current break". Every existing row is
-- either healthy (nothing to tell) or broke before this feature existed, and
-- for the second group NULL is the honest value: they were never notified.
-- The first cron run after this ships will notify them, which is the intended
-- behaviour rather than a side effect — they are exactly the silently-broken
-- creators this feature exists to find.
-- ── No GRANT needed here, and that is checked, not assumed ──────────────────
-- Migration 0489 exists because `creators` carries a COLUMN-level SELECT
-- allowlist (0470): any column added there without a matching GRANT makes
-- every query naming it fail with "permission denied for table creators", and
-- service-role testing cannot catch it because service_role bypasses grants.
--
-- This table is different, verified on staging before writing this: its only
-- grantees are postgres and service_role, and both hold TABLE-level SELECT and
-- UPDATE rather than per-column grants. Table-level grants extend to columns
-- added later, so these two need nothing. No client role has any grant at all,
-- which is what makes "nothing but the admin client reads this table" true.
ALTER TABLE creator_instagram_connections
  ADD COLUMN IF NOT EXISTS broken_notified_at timestamptz,
  -- Not read by anything yet. The 7-day reminder is a deliberate fast-follow,
  -- and it needs its own query: connectionsDueForSync() filters on
  -- status = 'connected', so a broken row is invisible to the nightly pass and
  -- nothing would ever revisit it to send a reminder. The column ships now so
  -- the reset in the connect upsert is written once, not twice.
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;

-- The reminder pass will ask "which broken connections were notified more than
-- N days ago and not yet reminded". Partial, because healthy rows are the vast
-- majority and none of them can ever match.
CREATE INDEX IF NOT EXISTS idx_ig_connections_broken_notified
  ON creator_instagram_connections (broken_notified_at)
  WHERE status IN ('expired', 'needs_reconnect', 'personal_account');

-- Migration 0496: who has read what, per person
--
-- The chat panel on a deal tracks its own read state in localStorage, which is
-- enough for a bar on the page you are already looking at. A badge in the header
-- is not that: it spans every deal, it has to survive a reload, and it has to
-- agree with itself on a phone and a laptop. That needs a row.
--
-- ── Per USER, not per party ─────────────────────────────────────────────────
-- A brand can have several team members and they do not read the same things.
-- Keying on 'brand' would mark a thread read for a colleague who never opened
-- it, which is worse than no badge: it hides a message rather than merely
-- failing to count it.
--
-- ── A timestamp, not a message id ───────────────────────────────────────────
-- An id would need the message to still exist to compare against. A timestamp
-- keeps working when one is deleted, and "everything before this moment" is the
-- question being asked anyway.

CREATE TABLE IF NOT EXISTS message_reads (
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  deal_id      uuid NOT NULL REFERENCES deals (id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, deal_id)
);

-- The badge counts across every deal for one person, so that is the index.
CREATE INDEX IF NOT EXISTS message_reads_user_idx ON message_reads (user_id);

COMMENT ON TABLE message_reads IS
  'Per-user, per-deal read marker for the header unread badge. Deliberately per USER and not per party: a brand team does not read as one person, and marking a thread read for a colleague hides a message rather than miscounting it.';

-- ── RLS: your own rows, nobody else's ───────────────────────────────────────
-- A read marker says when someone was last paying attention to a deal. It is
-- not sensitive in the way a token is, but there is no reason for one party to
-- see the other's, and "has the brand read my message yet" is a question this
-- table would answer if it were readable across the boundary.

ALTER TABLE message_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS message_reads_select_own ON message_reads;
DROP POLICY IF EXISTS message_reads_insert_own ON message_reads;
DROP POLICY IF EXISTS message_reads_update_own ON message_reads;

CREATE POLICY message_reads_select_own ON message_reads
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY message_reads_insert_own ON message_reads
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY message_reads_update_own ON message_reads
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- No DELETE policy: there is no reason to remove a read marker, and the row
-- goes with the deal or the user through the cascades above.

GRANT SELECT, INSERT, UPDATE ON message_reads TO authenticated;

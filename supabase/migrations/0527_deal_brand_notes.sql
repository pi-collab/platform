-- The brand's private deal note, moved out of deals. RUN BY HAND, in two pieces,
-- with the app deploy BETWEEN them. Verify with scripts/test-internal-note-rls.ts.
--
-- ── Why ─────────────────────────────────────────────────────────────────────
-- deals.internal_note (0220) was documented "brand-only, never shown to
-- creator", but nothing enforced it: the creator on a deal can SELECT their own
-- deals row, and with it the note (proved on staging 2026-10-05 with a real
-- creator login). Realtime pushes the full row too. A column grant cannot fix it,
-- because brand and creator sessions are the same Postgres role (authenticated).
-- So the note leaves the deals table for its own table that only the deal's
-- brand can read.
--
-- Order matters: piece A, then deploy the app (which reads and writes the new
-- table), then piece B (which drops the old column). Running B before the deploy
-- breaks the campaign page that still selects deals.internal_note.

-- ── A. New table, brand-only read, server-only writes; copy existing notes ──
CREATE TABLE IF NOT EXISTS deal_brand_notes (
  deal_id     uuid PRIMARY KEY REFERENCES deals (id) ON DELETE CASCADE,
  note        text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE deal_brand_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON deal_brand_notes FROM anon, authenticated;
GRANT SELECT ON deal_brand_notes TO authenticated;
DROP POLICY IF EXISTS deal_brand_notes_read_brand ON deal_brand_notes;
CREATE POLICY deal_brand_notes_read_brand ON deal_brand_notes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM deals d WHERE d.id = deal_brand_notes.deal_id AND d.brand_id = my_brand_id()));
INSERT INTO deal_brand_notes (deal_id, note)
  SELECT id, internal_note FROM deals WHERE internal_note IS NOT NULL AND btrim(internal_note) <> ''
  ON CONFLICT (deal_id) DO NOTHING;

-- ── B. AFTER the app deploy: catch notes written in between, drop the column ─
INSERT INTO deal_brand_notes (deal_id, note)
  SELECT id, internal_note FROM deals WHERE internal_note IS NOT NULL AND btrim(internal_note) <> ''
  ON CONFLICT (deal_id) DO NOTHING;
ALTER TABLE deals DROP COLUMN IF EXISTS internal_note;

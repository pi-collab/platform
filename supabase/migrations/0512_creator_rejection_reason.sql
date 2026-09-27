-- Why a creator was not approved, recorded and told to them.
--
-- ── The gap ─────────────────────────────────────────────────────────────────
-- rejectCreator took a creator id and nothing else. The email that followed
-- said review "looks at a few different parameters" and named none of them, so
-- the commonest case by far — we could not find an Instagram handle to look at
-- — read as a judgement on their work rather than as a missing field they
-- could fix in a minute.
--
-- ── A code, not free text ───────────────────────────────────────────────────
-- Stored as a short code from a fixed list (lib/rejection-reasons.ts) rather
-- than a typed sentence. Three reasons:
--
--   The creator-facing wording has to be careful, and ops writing it fresh
--   each time under a Reject button is how an unkind sentence reaches someone
--   on the worst email we send.
--
--   It is answerable: "how many were rejected for no handle" is a GROUP BY on
--   a code and a guess on free text. That number decides whether the fix is
--   better vetting or a better signup form.
--
--   The wording can be improved later for everyone at once, including for
--   creators already rejected, because the row holds the reason and not a
--   copy of the paragraph.
--
-- Nullable: every creator rejected before this column existed has no code, and
-- inventing one for them would be a guess recorded as a fact.
ALTER TABLE creators ADD COLUMN IF NOT EXISTS rejection_reason text;

COMMENT ON COLUMN creators.rejection_reason IS
  'Short code from lib/rejection-reasons.ts, set when vetting_status becomes '
  'rejected. NULL for rejections predating the column. The creator-facing '
  'sentence lives in code, never here, so it can be reworded for everyone.';

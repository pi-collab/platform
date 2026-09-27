-- Make PostgREST see creators.rejection_reason.
--
-- 0512 added the column and the DDL succeeded, but PostgREST serves from a
-- cached schema and does not notice a new column until it is told to reload.
-- Until it reloaded, EVERY select naming that column failed with
--
--   42703: column creators.rejection_reason does not exist
--
-- which is not the same error as a missing privilege and does not look like a
-- cache problem at all. On staging that select was in the creator layout, so
-- the failure returned a null creator row, `!creatorName` fired, and every
-- logged-in creator was redirected to /signup/creator/onboarding — reported as
-- "I was logged in, refreshed, and it brought me to the signup details page".
--
-- The ALTER is repeated as IF NOT EXISTS purely so this file is sufficient on
-- its own: running it against a database where 0512 somehow did not land fixes
-- that too, and against one where it did it is a no-op.
--
-- LESSON worth keeping: after adding a column that client code selects, either
-- NOTIFY here or read the column through a path that cannot take a whole
-- screen down with it. The layout now does the second as well.
ALTER TABLE creators ADD COLUMN IF NOT EXISTS rejection_reason text;

NOTIFY pgrst, 'reload schema';

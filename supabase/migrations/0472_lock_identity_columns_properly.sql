-- ─────────────────────────────────────────────────────────────────────────────
-- 0471 did not work. This does what 0471 intended.
--
-- 0471 ran:
--     REVOKE UPDATE (role, auth_id, email) ON public.users FROM anon, authenticated;
--
-- which revokes COLUMN-level grants. anon and authenticated hold a TABLE-level
-- UPDATE grant on users, and a table-level privilege covers every column
-- regardless of what column-level grants exist alongside it. Revoking a
-- column-level grant that was never the source of the privilege removes
-- nothing. It reported success and changed nothing; has_column_privilege
-- still returned true for role afterwards.
--
-- The working shape is the one 0470 used for creators: drop the table-level
-- privilege first, then grant back the specific columns.
--
-- Left OUT of the grant, and therefore no longer writable by the account
-- holder:
--   role     - authorization. Set by whichever signup path created the account
--              and never by its owner. While this was writable, every
--              application-side role check was a question the caller could
--              answer for themselves: sign up as a creator, set role to
--              'brand_member', then walk through the check in submitOnboarding.
--   auth_id  - identity.
--   email    - identity, and load bearing: ensureBrandUserRow matches an
--              existing users row BY EMAIL to link a second auth method, so a
--              self-set email can aim that match at someone else's address.
--
-- Granted back, because they are ordinary profile fields:
--   id, full_name, phone, managed_by, created_at, updated_at,
--   terms_accepted_at, terms_version, preferences
--
-- INSERT is untouched. users_insert_own already constrains it with
-- WITH CHECK (auth_id = auth.uid()), and the row has to be created somehow.
-- A user can therefore still choose their role at INSERT time — but every
-- signup path writes that row through the service role before the session is
-- usable, so there is no moment where a client inserts its own users row. If
-- that ever changes, INSERT needs the same treatment.

REVOKE UPDATE ON public.users FROM anon, authenticated;

GRANT UPDATE (
  id,
  full_name,
  phone,
  managed_by,
  created_at,
  updated_at,
  terms_accepted_at,
  terms_version,
  preferences
) ON public.users TO anon, authenticated;

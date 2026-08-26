-- Migration 0489: grant SELECT on the creator columns added since 0470
--
-- ── What broke ───────────────────────────────────────────────────────────────
-- 0470 replaced blanket SELECT on public.creators with a COLUMN ALLOWLIST:
--
--   REVOKE SELECT ON public.creators FROM anon, authenticated;
--   GRANT  SELECT (id, user_id, full_name, ...) ON public.creators TO ...;
--
-- Every column added afterwards is therefore ungranted by default, and a query
-- that names one fails with "permission denied for table creators" — the WHOLE
-- query, not just that column.
--
-- 0486 added the revision-policy columns and 0487 added vetting_status. The
-- creator LAYOUT selects vetting_status through the RLS-scoped client, so the
-- moment that shipped, every creator's layout read failed and the layout fell
-- through to `if (!creatorName) redirect('/signup/creator/onboarding')` — a
-- rejected creator was sent to sign up again, and so was everyone else.
--
-- It presents as a routing bug and is a privileges bug. The allowlist is the
-- right design; adding to it is simply part of adding a column to this table,
-- and that step was missed.
--
-- The revision columns are granted too. Nothing reads them through a scoped
-- client today — both call sites use the admin client — but they are terms a
-- brand is meant to see, and leaving them ungranted keeps the same trap armed
-- for whoever writes the first non-admin query.

GRANT SELECT (
  vetting_status,
  revisions_enabled,
  included_revisions,
  price_per_extra_revision_paise
) ON public.creators TO anon, authenticated;

COMMENT ON COLUMN public.creators.vetting_status IS
  'The vetting decision. pending | deals_approved | growth | rejected. SINGLE SOURCE OF TRUTH — is_vetted and is_rejected are derived by trigger. NOTE: creators uses a COLUMN-LEVEL SELECT allowlist (0470); any new column must be granted here or every query naming it fails outright.';

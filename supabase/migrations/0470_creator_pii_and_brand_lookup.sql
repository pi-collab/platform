-- ─────────────────────────────────────────────────────────────────────────────
-- Two security fixes found by auditing production before public launch.
--
-- 1. Creator PII was readable by any authenticated user.
-- 2. my_brand_id() locks a user out entirely if they belong to two brands.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Creator PII: column privileges ────────────────────────────────────────
--
-- The creators_read policy grants row access when is_vetted = true, to anyone
-- authenticated. RLS is ROW level, not column level, so that grants the whole
-- row — including phone, contact_email and rate_card. Creator signup is open
-- (phone + OTP), so the cost of becoming "authenticated" is one signup: any
-- person could have harvested every vetted creator's phone number.
--
-- Nothing was exposed when this was written, because no creator had been vetted
-- yet. It would have fired on the first vetting, against a table holding real
-- phone numbers.
--
-- Column privileges are the right tool: RLS keeps deciding WHICH ROWS, and this
-- decides WHICH COLUMNS. The application needs no changes, because every read of
-- the three withheld columns already goes through the service role, which
-- bypasses RLS and column grants alike — ops screens, the creator's own settings
-- page, notification and email senders, the offer OTP lookup.
--
-- Withheld deliberately:
--   phone          - PII, and the platform contacts creators itself
--   contact_email  - same
--   rate_card      - commercial terms; a brand negotiates through a deal
--
-- This matches the product rule: brands discover creators on guapd, and contact
-- happens through guapd rather than by lifting a phone number off a profile.
--
-- Fail-closed by design. A future query that selects phone on the user-scoped
-- client will raise "permission denied for column", not silently return it.

REVOKE SELECT ON public.creators FROM anon, authenticated;

GRANT SELECT (
  id,
  user_id,
  full_name,
  niche,
  niches,
  handle,
  bio,
  profile_photo_url,
  worked_with,
  portfolio_links,
  social_accounts,
  location,
  primary_platform,
  is_vetted,
  is_rejected,
  created_at,
  updated_at
) ON public.creators TO anon, authenticated;

-- INSERT/UPDATE/DELETE are untouched. Revoking SELECT columns does not affect
-- them, and the creator's own writes (avatar removal, storefront edits) do not
-- read the withheld columns back.


-- ── 2. my_brand_id(): a scalar subquery with no LIMIT ────────────────────────
--
-- brand_members is UNIQUE (brand_id, user_id), so one user may legitimately hold
-- rows for two different brands. This function is used as a scalar in almost
-- every brand-side policy, and a scalar subquery returning two rows does not
-- pick one — it raises "more than one row returned by a subquery used as an
-- expression". That error surfaces on every brand-side check at once, so the
-- user is not shown the wrong brand's data; they are locked out of all of it.
--
-- Reachable today: submitOnboarding enforces one brand per user, but the invite
-- accept path inserts a brand_members row with no such check, so an existing
-- brand member who accepts an invite from a second brand breaks their own
-- account.
--
-- ORDER BY created_at rather than a bare LIMIT 1: without it the row chosen is
-- whatever the planner returns first, which can change between queries. Oldest
-- membership wins, consistently.
--
-- This stops the lockout. It does not make multi-brand membership WORK — the
-- second brand simply stays invisible. If one account should ever span two
-- brands, this function and every policy calling it need rethinking; if it
-- never should, brand_members wants a UNIQUE (user_id) constraint. Neither is
-- decided here.

CREATE OR REPLACE FUNCTION my_brand_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT brand_id
  FROM brand_members
  WHERE user_id = my_user_id()
  ORDER BY created_at
  LIMIT 1
$$;

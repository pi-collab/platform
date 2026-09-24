-- Is a storefront slug free? Answerable without seeing who holds it.
--
-- ── The problem ─────────────────────────────────────────────────────────────
-- creator_storefronts is scoped by RLS to the creator's OWN row:
--
--   creator_storefronts_read_own: USING (creator_id = my_creator_id())
--
-- which is right — one creator has no business reading another's storefront
-- draft. But the "is this URL available?" check ran as a plain SELECT against
-- that table, so a slug somebody else already holds is simply invisible to it
-- and the check answered "available". The creator typed a taken name, saw a
-- green tick, filled in the rest of the form, and got "already taken" only
-- when they pressed save.
--
-- The unique index has always been the real guard and still is:
--
--   CREATE UNIQUE INDEX creator_storefronts_slug_lower_idx
--     ON creator_storefronts (lower(slug));   -- migration 0270
--
-- Nothing here weakens it. Two creators could never end up on the same URL;
-- the one who lost simply found out at the wrong moment.
--
-- ── Why SECURITY DEFINER, and what it is allowed to leak ────────────────────
-- Answering "is this taken" requires reading across creators, which RLS
-- forbids and should keep forbidding. So this runs as definer and returns a
-- BOOLEAN — never a row, never a creator_id, never a name. The only fact it
-- discloses is the one a visitor could already establish by opening
-- /c/<slug>, and which any registration form on the internet discloses by
-- necessity: whether a public URL is spoken for.
--
-- It deliberately does NOT say whose it is, and it does NOT distinguish a
-- published storefront from an unpublished draft — an unpublished draft still
-- owns its slug in the index, so reporting it as free would recreate the bug.
--
-- p_creator_id is the CALLER's own creator id: your current slug must come
-- back as available to you, or you could not save your own storefront without
-- renaming it. It is passed rather than derived so the function stays a pure
-- question about a string; the caller has already been authenticated by
-- verifyCreator() and passes its own id.

CREATE OR REPLACE FUNCTION is_storefront_slug_taken(
  p_slug       text,
  p_creator_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM creator_storefronts
     -- lower(slug), matching the unique index exactly. An ILIKE here would be
     -- a second, slightly different rule sitting beside the one that decides.
     WHERE lower(slug) = lower(trim(p_slug))
       AND (p_creator_id IS NULL OR creator_id <> p_creator_id)
  );
$$;

-- Callable by signed-in users only. Anonymous visitors have no storefront to
-- name, and an open endpoint that reports whether an arbitrary string is taken
-- is a slug enumerator — and unlike opening /c/<slug>, it reveals UNPUBLISHED
-- drafts too.
--
-- anon is revoked EXPLICITLY. Revoking from PUBLIC is not enough: Supabase
-- grants EXECUTE on functions in this schema to anon and authenticated
-- directly, so a grant on the role itself survives a revoke on PUBLIC. The
-- first version of this migration revoked only PUBLIC and the anon key could
-- still call it.
REVOKE ALL ON FUNCTION is_storefront_slug_taken(text, uuid) FROM public;
REVOKE ALL ON FUNCTION is_storefront_slug_taken(text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION is_storefront_slug_taken(text, uuid) TO authenticated;

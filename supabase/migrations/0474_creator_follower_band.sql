-- ─────────────────────────────────────────────────────────────────────────────
-- creators.follower_band
--
-- The audience band a creator picks at signup lives inside social_accounts, a
-- jsonb array. Reading it is fine; FILTERING on it from the app is not.
--
-- Multi-select in ops means "any of these bands", which through PostgREST means
-- an or=() of jsonb containment conditions — each one embedding a JSON literal,
-- complete with braces, colons and quotes, inside a comma-separated filter
-- string. That escaping is a trap, and it fails at runtime rather than at build.
--
-- A plain column makes the same query `.in('follower_band', [...])`, which is
-- unambiguous, indexable, and reads as what it is. NULL means the creator never
-- answered — 89 of them on production today, all people who abandoned signup
-- before the profile step — so "not answered" is just `.is(null)` rather than a
-- special case.
--
-- Kept in step by a trigger rather than a generated column: Postgres will not
-- allow a subquery in a GENERATED expression, and pulling the first element out
-- of a jsonb array needs one.
--
-- social_accounts stays the source of truth. This column is derived, and any
-- write that changes the array recomputes it.

ALTER TABLE public.creators
  ADD COLUMN IF NOT EXISTS follower_band text;

COMMENT ON COLUMN public.creators.follower_band IS
  'Derived from social_accounts[].follower_range by trg_creators_follower_band. '
  'NULL means the creator never reached the profile step. Do not write directly.';

CREATE OR REPLACE FUNCTION public.set_follower_band()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public AS $$
BEGIN
  NEW.follower_band := (
    SELECT nullif(trim(a->>'follower_range'), '')
    FROM jsonb_array_elements(
      CASE jsonb_typeof(NEW.social_accounts)
        WHEN 'array' THEN NEW.social_accounts
        ELSE '[]'::jsonb
      END
    ) a
    WHERE nullif(trim(a->>'follower_range'), '') IS NOT NULL
    LIMIT 1
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_creators_follower_band ON public.creators;
CREATE TRIGGER trg_creators_follower_band
  BEFORE INSERT OR UPDATE OF social_accounts ON public.creators
  FOR EACH ROW EXECUTE FUNCTION public.set_follower_band();

-- Backfill every existing row through the same expression the trigger uses, so
-- the column cannot disagree with the trigger on day one.
UPDATE public.creators c
SET follower_band = (
  SELECT nullif(trim(a->>'follower_range'), '')
  FROM jsonb_array_elements(
    CASE jsonb_typeof(c.social_accounts)
      WHEN 'array' THEN c.social_accounts
      ELSE '[]'::jsonb
    END
  ) a
  WHERE nullif(trim(a->>'follower_range'), '') IS NOT NULL
  LIMIT 1
);

CREATE INDEX IF NOT EXISTS creators_follower_band_idx
  ON public.creators (follower_band);

-- Readable by the same roles as the rest of the public creator columns. It is
-- derived from social_accounts, which is already granted, so withholding it
-- would protect nothing. See 0470 for why phone, contact_email and rate_card
-- are NOT in that list.
GRANT SELECT (follower_band) ON public.creators TO anon, authenticated;

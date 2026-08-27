-- Migration 0492: derive the follower band from a count when no range was given
--
-- ── What is missing ──────────────────────────────────────────────────────────
-- 0474 derives creators.follower_band from social_accounts[].follower_range,
-- and follower_range is written in exactly one place: creator signup
-- onboarding. An OPS-SEEDED creator never passes through it, so their entries
-- carry follower_count and no range at all:
--
--   {"handle":"Uvichar_","platform":"instagram","follower_count":522000}
--
-- The band is therefore null and they are absent from every band filter in ops,
-- including the one whose answer is sitting in the row. 522,000 is 500k-1M; the
-- band simply had nothing to read.
--
-- ── Why bucketing a count is not inventing data ──────────────────────────────
-- 0474 deliberately does NOT write a count from a range: a range is a claim and
-- a count reads as a measurement, so collapsing one into the other launders the
-- claim. This is the other direction. Putting a number someone already gave us
-- into the band it falls in is arithmetic, and it asserts nothing that was not
-- already on the row.
--
-- An explicit follower_range still WINS. It is what the creator chose about
-- themselves, and the fallback only runs when there is nothing to prefer.
--
-- ── MAX, not first ──────────────────────────────────────────────────────────
-- Across channels the largest audience is taken. The existing range logic picks
-- the first non-empty entry, which depends on array order that nothing controls;
-- for a number there is a right answer, and a creator with 522k on Instagram and
-- 133k on YouTube belongs in 500k-1M either way round.
--
-- Band strings match app/ops/creators BANDS exactly, EN DASH included. The
-- filter matches on equality, so a hyphen here would silently match nothing.

CREATE OR REPLACE FUNCTION public.set_follower_band()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public AS $$
DECLARE
  stated text;
  biggest bigint;
BEGIN
  -- What the creator said about themselves, if anything. Unchanged from 0474.
  stated := (
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

  IF stated IS NOT NULL THEN
    NEW.follower_band := stated;
    RETURN NEW;
  END IF;

  SELECT max((a->>'follower_count')::bigint)
  INTO biggest
  FROM jsonb_array_elements(
    CASE jsonb_typeof(NEW.social_accounts)
      WHEN 'array' THEN NEW.social_accounts
      ELSE '[]'::jsonb
    END
  ) a
  WHERE (a->>'follower_count') ~ '^[0-9]+$';

  NEW.follower_band := CASE
    WHEN biggest IS NULL      THEN NULL
    WHEN biggest <   20000    THEN 'Under 20k'
    WHEN biggest <   50000    THEN '20k – 50k'
    WHEN biggest <  100000    THEN '50k – 100k'
    WHEN biggest <  500000    THEN '100k – 500k'
    WHEN biggest < 1000000    THEN '500k – 1M'
    ELSE '1M+'
  END;

  RETURN NEW;
END;
$$;

-- Recompute every row through the new function, so the column cannot disagree
-- with the trigger. A no-op UPDATE fires it because the trigger is on
-- UPDATE OF social_accounts, and this touches that column.
UPDATE public.creators
SET social_accounts = social_accounts
WHERE follower_band IS NULL;

COMMENT ON COLUMN public.creators.follower_band IS
  'Derived by trg_creators_follower_band: the creator''s stated follower_range if there is one, otherwise the band their largest follower_count falls in (0492). NULL means neither was ever recorded. Do not write directly.';

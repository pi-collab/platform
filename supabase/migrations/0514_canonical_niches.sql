-- Merge the niche values that free-text entry scattered.
--
-- ── The problem ─────────────────────────────────────────────────────────────
-- The storefront editor accepted anything typed, and three tables carry the
-- result: creators.niches (text[]), creators.niche (legacy singular text) and
-- creator_storefronts.categories (jsonb/text[]). A brand filtering the roster
-- was offered "Fashion", "fashion" and "beauty" as three separate things, plus
-- "liefestyle" as a fourth, because /browse builds its filter from whatever
-- values exist.
--
-- ── What this does ──────────────────────────────────────────────────────────
-- Maps every value we recognise onto the canonical list in
-- apps/web/lib/niches.ts, de-duplicates, and LEAVES ANYTHING ELSE ALONE. An
-- unrecognised value is a creator describing their own work in a word we did
-- not anticipate; deleting it to make a filter tidier is the wrong trade. The
-- leftovers are few and visible in ops.
--
-- 'Finance' becomes 'Finance / Investing' here, so it is a rename as well as a
-- merge: it was the canonical value until this migration and every row already
-- carrying it has to move.
--
-- Idempotent: running it twice maps already-canonical values to themselves.

CREATE OR REPLACE FUNCTION canonical_niche(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  -- Lowercased, letters and digits only, so casing and punctuation collapse:
  -- "Personal Finance", "personal-finance" and "PersonalFinance" are one key.
  -- Mirrors nicheKey() in apps/web/lib/niches.ts; keep the two in step.
  SELECT CASE regexp_replace(lower(coalesce(raw, '')), '[^a-z0-9]', '', 'g')
    WHEN 'finance'          THEN 'Finance / Investing'
    WHEN 'financeinvesting' THEN 'Finance / Investing'
    WHEN 'investing'        THEN 'Finance / Investing'
    WHEN 'investment'       THEN 'Finance / Investing'
    WHEN 'personalfinance'  THEN 'Finance / Investing'
    WHEN 'stocks'           THEN 'Finance / Investing'
    WHEN 'stockmarket'      THEN 'Finance / Investing'
    WHEN 'trading'          THEN 'Finance / Investing'
    WHEN 'mutualfunds'      THEN 'Finance / Investing'
    WHEN 'money'            THEN 'Finance / Investing'
    WHEN 'wealth'           THEN 'Finance / Investing'
    WHEN 'insurance'        THEN 'Finance / Investing'
    WHEN 'fintech'          THEN 'Fintech'
    WHEN 'banking'          THEN 'Fintech'
    WHEN 'payments'         THEN 'Fintech'
    WHEN 'crypto'           THEN 'Crypto / Web3'
    WHEN 'cryptocurrency'   THEN 'Crypto / Web3'
    WHEN 'cryptoweb3'       THEN 'Crypto / Web3'
    WHEN 'web3'             THEN 'Crypto / Web3'
    WHEN 'blockchain'       THEN 'Crypto / Web3'
    WHEN 'nft'              THEN 'Crypto / Web3'
    WHEN 'tech'             THEN 'Tech / Gadgets'
    WHEN 'techgadgets'      THEN 'Tech / Gadgets'
    WHEN 'technology'       THEN 'Tech / Gadgets'
    WHEN 'gadgets'          THEN 'Tech / Gadgets'
    WHEN 'mobile'           THEN 'Tech / Gadgets'
    WHEN 'ai'               THEN 'Tech / Gadgets'
    WHEN 'software'         THEN 'Tech / Gadgets'
    WHEN 'business'         THEN 'Business / Startups'
    WHEN 'businessstartups' THEN 'Business / Startups'
    WHEN 'startup'          THEN 'Business / Startups'
    WHEN 'startups'         THEN 'Business / Startups'
    WHEN 'entrepreneurship' THEN 'Business / Startups'
    WHEN 'career'           THEN 'Business / Startups'
    WHEN 'marketing'        THEN 'Business / Startups'
    WHEN 'education'        THEN 'Education'
    WHEN 'edtech'           THEN 'Education'
    WHEN 'learning'         THEN 'Education'
    WHEN 'study'            THEN 'Education'
    WHEN 'exams'            THEN 'Education'
    WHEN 'lifestyle'        THEN 'Lifestyle'
    WHEN 'liefestyle'       THEN 'Lifestyle'
    WHEN 'lifestlye'        THEN 'Lifestyle'
    WHEN 'vlog'             THEN 'Lifestyle'
    WHEN 'vlogs'            THEN 'Lifestyle'
    WHEN 'dailyvlogs'       THEN 'Lifestyle'
    WHEN 'home'             THEN 'Lifestyle'
    WHEN 'parenting'        THEN 'Lifestyle'
    WHEN 'family'           THEN 'Lifestyle'
    WHEN 'fitness'          THEN 'Fitness'
    WHEN 'gym'              THEN 'Fitness'
    WHEN 'health'           THEN 'Fitness'
    WHEN 'wellness'         THEN 'Fitness'
    WHEN 'yoga'             THEN 'Fitness'
    WHEN 'nutrition'        THEN 'Fitness'
    WHEN 'sports'           THEN 'Fitness'
    WHEN 'food'             THEN 'Food'
    WHEN 'cooking'          THEN 'Food'
    WHEN 'recipes'          THEN 'Food'
    WHEN 'foodie'           THEN 'Food'
    WHEN 'baking'           THEN 'Food'
    WHEN 'restaurants'      THEN 'Food'
    WHEN 'travel'           THEN 'Travel'
    WHEN 'tourism'          THEN 'Travel'
    WHEN 'adventure'        THEN 'Travel'
    WHEN 'fashion'          THEN 'Fashion / Beauty'
    WHEN 'fashionbeauty'    THEN 'Fashion / Beauty'
    WHEN 'beauty'           THEN 'Fashion / Beauty'
    WHEN 'makeup'           THEN 'Fashion / Beauty'
    WHEN 'skincare'         THEN 'Fashion / Beauty'
    WHEN 'style'            THEN 'Fashion / Beauty'
    WHEN 'grooming'         THEN 'Fashion / Beauty'
    WHEN 'hair'             THEN 'Fashion / Beauty'
    WHEN 'cosmetics'        THEN 'Fashion / Beauty'
    WHEN 'luxury'           THEN 'Fashion / Beauty'
    WHEN 'entertainment'    THEN 'Entertainment'
    WHEN 'comedy'           THEN 'Entertainment'
    WHEN 'memes'            THEN 'Entertainment'
    WHEN 'music'            THEN 'Entertainment'
    WHEN 'film'             THEN 'Entertainment'
    WHEN 'movies'           THEN 'Entertainment'
    WHEN 'gaming'           THEN 'Entertainment'
    WHEN 'dance'            THEN 'Entertainment'
    WHEN 'art'              THEN 'Entertainment'
    WHEN 'other'            THEN 'Other'
    -- Unrecognised: hand it back untouched, trimmed. Not ours to discard.
    ELSE nullif(btrim(coalesce(raw, '')), '')
  END;
$$;

COMMENT ON FUNCTION canonical_niche(text) IS
  'Canonical niche for a free-typed value; mirrors canonicalNiche() in '
  'apps/web/lib/niches.ts. Returns the input trimmed when unrecognised, so a '
  'creator''s own wording survives. Keep the two lists in step.';

-- ── creators.niches (text[]) ────────────────────────────────────────────────
-- DISTINCT collapses the duplicates a merge creates: a row holding both
-- 'Finance' and 'Investing' must end up with one entry, not two identical ones.
UPDATE creators
SET niches = COALESCE((
      SELECT array_agg(DISTINCT v ORDER BY v)
      FROM (SELECT canonical_niche(n) AS v FROM unnest(niches) AS n) t
      WHERE v IS NOT NULL
    ), '{}')
WHERE niches IS NOT NULL
  AND array_length(niches, 1) IS NOT NULL;

-- ── creators.niche (legacy singular) ────────────────────────────────────────
UPDATE creators
SET niche = canonical_niche(niche)
WHERE niche IS NOT NULL AND btrim(niche) <> '';

-- ── creator_storefronts.categories ──────────────────────────────────────────
-- This is the column /browse actually filters on, and the one the free-text
-- box wrote to.
UPDATE creator_storefronts
SET categories = COALESCE((
      SELECT array_agg(DISTINCT v ORDER BY v)
      FROM (SELECT canonical_niche(c) AS v FROM unnest(categories) AS c) t
      WHERE v IS NOT NULL
    ), '{}')
WHERE categories IS NOT NULL
  AND array_length(categories, 1) IS NOT NULL;

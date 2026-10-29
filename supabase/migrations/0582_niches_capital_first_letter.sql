-- 0582: every niche starts with a capital letter.
--
-- Creators can type their own niche under "Other", and those were stored as
-- typed: "dentistry", "shoes", "storytelling" beside "Storytelling". Only the
-- first letter changes ("SaaS", "MBA" stay as written); spaces are collapsed;
-- duplicates that differ only by case collapse to their first position.
-- creators.niches is the source of truth (0518); creators.niche and
-- creator_storefronts.categories are kept equal to it, as setCreatorNiches
-- does. From this release the app saves new ones capitalised
-- (lib/niches.ts capitaliseNiche). Idempotent.

WITH fixed AS (
  SELECT c.id,
         (SELECT coalesce(array_agg(v ORDER BY ord), '{}')
            FROM (SELECT DISTINCT ON (lower(v)) v, ord
                    FROM (SELECT upper(left(t, 1)) || substr(t, 2) AS v, o AS ord
                            FROM unnest(c.niches) WITH ORDINALITY AS u(x, o),
                                 LATERAL (SELECT btrim(regexp_replace(x, '\s+', ' ', 'g')) AS t) tt
                           WHERE t <> '') a
                   ORDER BY lower(v), ord) d) AS niches
    FROM creators c
   WHERE c.niches IS NOT NULL AND cardinality(c.niches) > 0
)
UPDATE creators c
   SET niches = f.niches, niche = f.niches[1]
  FROM fixed f
 WHERE f.id = c.id AND (c.niches IS DISTINCT FROM f.niches OR c.niche IS DISTINCT FROM f.niches[1]);

UPDATE creator_storefronts s
   SET categories = to_jsonb(c.niches)
  FROM creators c
 WHERE c.id = s.creator_id AND cardinality(c.niches) > 0
   AND s.categories IS DISTINCT FROM to_jsonb(c.niches);

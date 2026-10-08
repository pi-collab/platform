-- One list of niches per creator, the same everywhere.
--
-- Niches lived in three places that each screen wrote separately:
-- creators.niches (settings, ops), creators.niche (legacy, read by AI search)
-- and creator_storefronts.categories (the storefront editor; what /browse and
-- AI search filter on). They drifted: a niche changed in settings never
-- reached brands for a creator with a storefront. From this release every
-- writer goes through setCreatorNiches (apps/web/lib/creator-niches-server.ts),
-- which keeps all three equal, with creators.niches as the source of truth.
--
-- This reconciles what already drifted. The UNION of the lists, never one
-- picked over the other: whichever a creator last edited, nothing they chose
-- is dropped. Storefront values first (that is what brands see today), then
-- creators.niches, then the legacy niche; duplicates collapse to their first
-- position. Capped at 10, the server's ceiling. Idempotent.

WITH merged AS (
  SELECT c.id AS creator_id,
         (SELECT coalesce(array_agg(v ORDER BY ord), '{}')
            FROM (SELECT v, min(ord) AS ord
                    FROM (
                      SELECT btrim(x) AS v, o AS ord
                        FROM jsonb_array_elements_text(
                               CASE WHEN jsonb_typeof(s.categories) = 'array' THEN s.categories ELSE '[]'::jsonb END
                             ) WITH ORDINALITY AS t(x, o)
                      UNION ALL
                      SELECT btrim(y), 1000 + o FROM unnest(coalesce(c.niches, '{}')) WITH ORDINALITY AS u(y, o)
                      UNION ALL
                      SELECT btrim(c.niche), 2000 WHERE c.niche IS NOT NULL
                    ) a
                   WHERE v IS NOT NULL AND v <> ''
                   GROUP BY v
                   ORDER BY min(ord)
                   LIMIT 10) b) AS niches
    FROM creators c
    LEFT JOIN creator_storefronts s ON s.creator_id = c.id
)
UPDATE creators c
   SET niches = m.niches,
       niche  = m.niches[1]
  FROM merged m
 WHERE m.creator_id = c.id
   AND (c.niches IS DISTINCT FROM m.niches OR c.niche IS DISTINCT FROM m.niches[1]);

-- The storefront copy follows the creator's list.
UPDATE creator_storefronts s
   SET categories = to_jsonb(c.niches)
  FROM creators c
 WHERE c.id = s.creator_id
   AND s.categories IS DISTINCT FROM to_jsonb(c.niches);

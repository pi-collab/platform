-- One bio per creator, the same everywhere.
--
-- creators.bio (settings, ops) and creator_storefronts.bio (storefront editor)
-- were written separately, and every page shows the storefront's first, so a
-- bio edited in settings never reached brands for a creator with a
-- storefront. From this release setCreatorBio
-- (apps/web/lib/creator-bio-server.ts) writes both, with creators.bio as the
-- source of truth.
--
-- Reconciling: a bio is text, so two can't be merged the way niches were. The
-- storefront's wins where both exist, because it is the one brands have been
-- reading. The creators.bio it replaces is NOT discarded: it is copied into
-- events first (creator.bio_replaced_0519), so it can be restored by hand.
-- Idempotent: once the two agree, nothing is logged or changed.

INSERT INTO events (event_type, detail)
SELECT 'creator.bio_replaced_0519',
       jsonb_build_object('creator_id', c.id, 'old_bio', c.bio, 'new_bio', btrim(s.bio))
  FROM creators c
  JOIN creator_storefronts s ON s.creator_id = c.id
 WHERE nullif(btrim(s.bio), '') IS NOT NULL
   AND nullif(btrim(c.bio), '') IS NOT NULL
   AND btrim(c.bio) <> btrim(s.bio);

UPDATE creators c
   SET bio = btrim(s.bio)
  FROM creator_storefronts s
 WHERE s.creator_id = c.id
   AND nullif(btrim(s.bio), '') IS NOT NULL
   AND c.bio IS DISTINCT FROM btrim(s.bio);

-- The storefront copy follows the creator's bio (fills empty storefront bios
-- from creators.bio too).
UPDATE creator_storefronts s
   SET bio = c.bio
  FROM creators c
 WHERE c.id = s.creator_id
   AND s.bio IS DISTINCT FROM c.bio;

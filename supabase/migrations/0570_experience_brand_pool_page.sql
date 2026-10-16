-- 0570: search + server-side pages on the brand's "Add creators" pool (0557).
--
-- The brand adds creators to its own Experience from the same bookable,
-- non-house creators /browse lists to every brand. Until now the page loaded
-- all of them and filtered in the browser, with no search. Now: name or
-- @handle search plus the pool's filters (niche, followers, location,
-- platform), run here, one page at a time.
--
-- What a brand sees is unchanged: no price of any kind (no creator_products is
-- read: an Experience creator's shoot day rate never reaches a brand), and the
-- roster state only from rows already SHARED with this brand (never Guapd's
-- internal shortlist). Brand gate: a member of THIS Experience's brand.
-- deny-on-NULL on every paging argument.

CREATE OR REPLACE FUNCTION public.brand_experience_pool_page(
  p_experience_id uuid, p_q text, p_niche text, p_location text, p_platform text, p_band text,
  p_limit integer, p_offset integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_q text;
  v_total int;
  v_rows jsonb;
  v_niches jsonb;
  v_locations jsonb;
  v_counts jsonb;
BEGIN
  PERFORM brand_experience_require(p_experience_id, false);
  v_q := nullif(ltrim(btrim(coalesce(p_q, '')), '@'), '');
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN RAISE EXCEPTION 'Page size must be between 1 and 100'; END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN RAISE EXCEPTION 'Page offset must be 0 or more'; END IF;
  IF v_q IS NOT NULL AND length(v_q) > 100 THEN RAISE EXCEPTION 'Search is at most 100 characters'; END IF;
  IF p_band IS NOT NULL AND p_band NOT IN ('u50', '50-150', '150+') THEN RAISE EXCEPTION 'Unknown follower range'; END IF;

  WITH base AS (
    SELECT c.id, c.full_name, c.handle, c.profile_photo_url, c.niches, c.social_accounts,
           coalesce(nullif(concat_ws(', ', nullif(c.city, ''), nullif(c.state, '')), ''), nullif(c.location, '')) AS place,
           (ic.status = 'connected' AND ic.snapshot IS NOT NULL) AS verified,
           CASE WHEN ic.status = 'connected' AND (ic.snapshot ->> 'followersCount') ~ '^[0-9]+$' THEN (ic.snapshot ->> 'followersCount')::bigint END AS ig_followers,
           CASE WHEN ic.status = 'connected' AND (ic.snapshot ->> 'reachLast30') ~ '^[0-9]+$' THEN (ic.snapshot ->> 'reachLast30')::bigint END AS ig_reach_30,
           CASE WHEN ic.status = 'connected' AND (ic.snapshot ->> 'interactionsLast30') ~ '^[0-9]+$' THEN (ic.snapshot ->> 'interactionsLast30')::bigint END AS ig_interactions_30
    FROM creators c
    LEFT JOIN creator_instagram_connections ic ON ic.creator_id = c.id
    WHERE c.is_bookable AND NOT c.is_guapd
  ), shaped AS (
    SELECT b.id, b.full_name, b.handle, b.profile_photo_url, b.niches, b.social_accounts, b.place, b.verified,
           b.ig_followers, b.ig_reach_30, b.ig_interactions_30,
           coalesce(b.ig_followers, (SELECT max((s ->> 'follower_count')::bigint) FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(b.social_accounts) = 'array' THEN b.social_accounts ELSE '[]'::jsonb END) s
             WHERE (s ->> 'follower_count') ~ '^[0-9]+$')) AS followers
    FROM base b
  ), filtered AS (
    SELECT s.id, s.full_name, s.handle, s.profile_photo_url, s.niches, s.social_accounts, s.place, s.verified,
           s.ig_followers, s.ig_reach_30, s.ig_interactions_30, s.followers
    FROM shaped s
    WHERE (v_q IS NULL OR s.full_name ILIKE '%' || experience_like_escape(v_q) || '%'
                       OR ltrim(coalesce(s.handle, ''), '@') ILIKE '%' || experience_like_escape(v_q) || '%')
      AND (p_niche IS NULL OR p_niche = ANY (coalesce(s.niches, '{}')))
      AND (p_location IS NULL OR s.place = p_location)
      AND (p_platform IS NULL OR EXISTS (SELECT 1 FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(s.social_accounts) = 'array' THEN s.social_accounts ELSE '[]'::jsonb END) a
             WHERE lower(a ->> 'platform') = lower(p_platform)))
      AND (p_band IS NULL OR (s.followers IS NOT NULL AND (
             (p_band = 'u50' AND s.followers < 50000)
          OR (p_band = '50-150' AND s.followers BETWEEN 50000 AND 150000)
          OR (p_band = '150+' AND s.followers > 150000))))
  )
  SELECT (SELECT count(*)::int FROM filtered),
         (SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id', p.id, 'full_name', p.full_name, 'handle', p.handle, 'profile_photo_url', p.profile_photo_url,
             'niches', p.niches, 'place', p.place, 'social_accounts', p.social_accounts, 'verified', coalesce(p.verified, false),
             'followers', p.followers, 'ig_followers', p.ig_followers, 'ig_reach_30', p.ig_reach_30, 'ig_interactions_30', p.ig_interactions_30,
             -- Only rows already shared with this brand; never Guapd's internal shortlist.
             'roster_state', (SELECT CASE WHEN r.locked THEN 'locked' WHEN r.brand_decision = 'rejected' THEN 'rejected'
                                          WHEN r.brand_decision = 'accepted' THEN 'accepted' WHEN r.brand_decision = 'on_hold' THEN 'on_hold' ELSE 'added' END
                              FROM experience_roster r
                              WHERE r.experience_id = p_experience_id AND r.creator_id = p.id AND r.shared_with_brand_at IS NOT NULL)
           ) ORDER BY lower(p.full_name), p.id), '[]'::jsonb)
          FROM (SELECT f.id, f.full_name, f.handle, f.profile_photo_url, f.niches, f.social_accounts, f.place, f.verified,
                       f.followers, f.ig_followers, f.ig_reach_30, f.ig_interactions_30
                FROM filtered f ORDER BY lower(f.full_name), f.id LIMIT p_limit OFFSET p_offset) p),
         (SELECT coalesce(jsonb_agg(DISTINCT n ORDER BY n), '[]'::jsonb) FROM shaped s, unnest(coalesce(s.niches, '{}')) n WHERE btrim(n) <> ''),
         (SELECT coalesce(jsonb_agg(DISTINCT s.place ORDER BY s.place), '[]'::jsonb) FROM shaped s WHERE s.place IS NOT NULL)
    INTO v_total, v_rows, v_niches, v_locations;

  -- The brand's own roster progress (shared rows only), not the page's.
  SELECT jsonb_build_object(
           'accepted', count(*) FILTER (WHERE r.locked OR r.brand_decision = 'accepted')::int,
           'to_review', count(*) FILTER (WHERE NOT r.locked AND r.brand_decision IN ('pending', 'on_hold'))::int)
    INTO v_counts
    FROM experience_roster r
    WHERE r.experience_id = p_experience_id AND r.shared_with_brand_at IS NOT NULL;

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows, 'niches', v_niches, 'locations', v_locations, 'roster', v_counts);
END;
$function$;
REVOKE ALL ON FUNCTION public.brand_experience_pool_page(uuid, text, text, text, text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.brand_experience_pool_page(uuid, text, text, text, text, text, integer, integer) TO authenticated;

-- 0569: search + server-side pages for the Experience roster, on both sides.
--
-- Two lists, two sources, never shared:
--
--  * Ops (staff, operational access): the FULL bookable directory, searched by
--    name or handle and filtered by the pool's own filters (niche, followers,
--    location, platform, track, shoot day rate), then paged. Same rows and day
--    rate as experience_console_creator_pool (staff-only, as before).
--
--  * Brand: ONLY the creators Guapd has shared with this brand on this
--    Experience. It pages the output of brand_experience_roster itself, so it
--    cannot see a creator, or a field, that the brand's roster does not
--    already show: no day rate, fee, payout or margin exists in it to leak.
--
-- Filter first, then page (LIMIT/OFFSET on the filtered set; the total is the
-- filtered count). deny-on-NULL on every paging argument.

-- Escape LIKE wildcards in user text.
CREATE OR REPLACE FUNCTION public.experience_like_escape(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT replace(replace(replace(p, '\', '\\'), '%', '\%'), '_', '\_')
$function$;

-- ── Ops: the directory ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.experience_console_creator_pool_page(
  p_experience_id uuid, p_q text, p_niche text, p_location text, p_platform text,
  p_track text, p_band text, p_rate text, p_limit integer, p_offset integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_q text := nullif(ltrim(btrim(coalesce(p_q, '')), '@'), '');
  v_total int; v_rows jsonb; v_niches jsonb; v_locations jsonb; v_summary jsonb;
BEGIN
  PERFORM experience_console_require();
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN RAISE EXCEPTION 'Page size must be between 1 and 100'; END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN RAISE EXCEPTION 'Page offset must be 0 or more'; END IF;
  IF v_q IS NOT NULL AND length(v_q) > 100 THEN RAISE EXCEPTION 'Search is at most 100 characters'; END IF;
  IF p_band IS NOT NULL AND p_band NOT IN ('u50', '50-150', '150+') THEN RAISE EXCEPTION 'Unknown follower range'; END IF;
  IF p_track IS NOT NULL AND p_track NOT IN ('growth', 'deals') THEN RAISE EXCEPTION 'Unknown track'; END IF;
  IF p_rate IS NOT NULL AND p_rate NOT IN ('set', 'unset') THEN RAISE EXCEPTION 'Unknown day rate filter'; END IF;

  WITH base AS (
    SELECT c.id, c.full_name, c.handle, c.profile_photo_url, c.niches, c.city, c.state, c.location, c.social_accounts,
           CASE WHEN c.vetting_status = 'growth' THEN 'growth' ELSE 'deals' END AS track,
           cp.id AS day_rate_product_id, cp.price_paise AS day_rate_paise,
           coalesce(ic.status = 'connected' AND ic.snapshot IS NOT NULL, false) AS ig_connected,
           CASE WHEN ic.status = 'connected' AND (ic.snapshot ->> 'followersCount') ~ '^[0-9]+$' THEN (ic.snapshot ->> 'followersCount')::bigint END AS ig_followers,
           CASE WHEN ic.status = 'connected' AND (ic.snapshot ->> 'reachLast30') ~ '^[0-9]+$' THEN (ic.snapshot ->> 'reachLast30')::bigint END AS ig_reach_30,
           CASE WHEN ic.status = 'connected' AND (ic.snapshot ->> 'interactionsLast30') ~ '^[0-9]+$' THEN (ic.snapshot ->> 'interactionsLast30')::bigint END AS ig_interactions_30,
           coalesce(nullif(concat_ws(', ', nullif(c.city, ''), nullif(c.state, '')), ''), nullif(c.location, '')) AS place
    FROM creators c
    LEFT JOIN creator_products cp ON cp.creator_id = c.id AND cp.pricing_type = 'per_day' AND cp.is_active
    LEFT JOIN creator_instagram_connections ic ON ic.creator_id = c.id
    WHERE c.is_bookable AND NOT c.is_guapd
  ), shaped AS (
    SELECT b.id, b.full_name, b.handle, b.profile_photo_url, b.niches, b.city, b.state, b.location, b.social_accounts, b.track, b.day_rate_product_id, b.day_rate_paise, b.ig_connected, b.ig_followers, b.ig_reach_30, b.ig_interactions_30, b.place,
           coalesce(b.ig_followers, (SELECT max((s ->> 'follower_count')::bigint) FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(b.social_accounts) = 'array' THEN b.social_accounts ELSE '[]'::jsonb END) s
             WHERE (s ->> 'follower_count') ~ '^[0-9]+$')) AS followers
    FROM base b
  ), filtered AS (
    SELECT s.id, s.full_name, s.handle, s.profile_photo_url, s.niches, s.city, s.state, s.location, s.social_accounts, s.track, s.day_rate_product_id, s.day_rate_paise, s.ig_connected, s.ig_followers, s.ig_reach_30, s.ig_interactions_30, s.place, s.followers FROM shaped s
    WHERE (v_q IS NULL OR s.full_name ILIKE '%' || experience_like_escape(v_q) || '%'
                       OR ltrim(coalesce(s.handle, ''), '@') ILIKE '%' || experience_like_escape(v_q) || '%')
      AND (p_niche IS NULL OR p_niche = ANY (coalesce(s.niches, '{}')))
      AND (p_location IS NULL OR s.place = p_location)
      AND (p_platform IS NULL OR EXISTS (SELECT 1 FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(s.social_accounts) = 'array' THEN s.social_accounts ELSE '[]'::jsonb END) a
             WHERE lower(a ->> 'platform') = lower(p_platform)))
      AND (p_track IS NULL OR s.track = p_track)
      AND (p_rate IS NULL OR (p_rate = 'set' AND s.day_rate_paise IS NOT NULL) OR (p_rate = 'unset' AND s.day_rate_paise IS NULL))
      -- A band needs a known follower count (unknown is never in a band).
      AND (p_band IS NULL OR (s.followers IS NOT NULL AND (
             (p_band = 'u50' AND s.followers < 50000)
          OR (p_band = '50-150' AND s.followers BETWEEN 50000 AND 150000)
          OR (p_band = '150+' AND s.followers > 150000))))
  )
  SELECT (SELECT count(*)::int FROM filtered),
         (SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id', p.id, 'full_name', p.full_name, 'handle', p.handle, 'profile_photo_url', p.profile_photo_url,
             'niches', p.niches, 'city', p.city, 'state', p.state, 'location', p.location, 'social_accounts', p.social_accounts,
             'track', p.track, 'day_rate_product_id', p.day_rate_product_id, 'day_rate_paise', p.day_rate_paise,
             'ig_connected', p.ig_connected, 'ig_followers', p.ig_followers, 'ig_reach_30', p.ig_reach_30,
             'ig_interactions_30', p.ig_interactions_30) ORDER BY lower(p.full_name), p.id), '[]'::jsonb)
          FROM (SELECT f.id, f.full_name, f.handle, f.profile_photo_url, f.niches, f.city, f.state, f.location, f.social_accounts, f.track, f.day_rate_product_id, f.day_rate_paise, f.ig_connected, f.ig_followers, f.ig_reach_30, f.ig_interactions_30, f.place FROM filtered f ORDER BY lower(f.full_name), f.id LIMIT p_limit OFFSET p_offset) p),
         (SELECT coalesce(jsonb_agg(DISTINCT n ORDER BY n), '[]'::jsonb) FROM shaped s, unnest(coalesce(s.niches, '{}')) n WHERE btrim(n) <> ''),
         (SELECT coalesce(jsonb_agg(DISTINCT s.place ORDER BY s.place), '[]'::jsonb) FROM shaped s WHERE s.place IS NOT NULL)
    INTO v_total, v_rows, v_niches, v_locations;

  -- The roster's own figures (not the page's): who is on it and their day rates.
  SELECT jsonb_build_object('on_roster', count(*)::int,
                            'day_rate_total_paise', coalesce(sum(cp.price_paise), 0)::bigint,
                            'missing_rate', count(*) FILTER (WHERE cp.id IS NULL)::int)
    INTO v_summary
    FROM experience_roster r
    LEFT JOIN creator_products cp ON cp.creator_id = r.creator_id AND cp.pricing_type = 'per_day' AND cp.is_active
    WHERE r.experience_id = p_experience_id AND r.brand_decision IS DISTINCT FROM 'rejected';

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows, 'niches', v_niches, 'locations', v_locations, 'roster', v_summary);
END;
$function$;
REVOKE ALL ON FUNCTION public.experience_console_creator_pool_page(uuid, text, text, text, text, text, text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.experience_console_creator_pool_page(uuid, text, text, text, text, text, text, text, integer, integer) TO authenticated;

-- ── Brand: only the creators shared with this brand ──────────────────────────
CREATE OR REPLACE FUNCTION public.brand_experience_roster_page(p_experience_id uuid, p_q text, p_limit integer, p_offset integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_all jsonb; v_q text := nullif(ltrim(btrim(coalesce(p_q, '')), '@'), '');
  v_total int; v_shown int; v_rows jsonb;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN RAISE EXCEPTION 'Page size must be between 1 and 100'; END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN RAISE EXCEPTION 'Page offset must be 0 or more'; END IF;
  IF v_q IS NOT NULL AND length(v_q) > 100 THEN RAISE EXCEPTION 'Search is at most 100 characters'; END IF;
  -- The brand's roster view decides membership, visibility and fields
  -- (brand_experience_require inside it; shared creators only, no money).
  v_all := brand_experience_roster(p_experience_id);
  IF v_all IS NULL OR jsonb_typeof(v_all -> 'creators') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Not found' USING ERRCODE = '42501';
  END IF;

  WITH items AS (
    SELECT x.c, x.ord FROM jsonb_array_elements(v_all -> 'creators') WITH ORDINALITY AS x(c, ord)
  ), matched AS (
    SELECT i.c, i.ord FROM items i
    WHERE v_q IS NULL
       OR (i.c ->> 'full_name') ILIKE '%' || experience_like_escape(v_q) || '%'
       OR coalesce(i.c ->> 'handle', '') ILIKE '%' || experience_like_escape(v_q) || '%'
  )
  SELECT (SELECT count(*)::int FROM items), (SELECT count(*)::int FROM matched),
         (SELECT coalesce(jsonb_agg(p.c ORDER BY p.ord), '[]'::jsonb)
            FROM (SELECT m.c, m.ord FROM matched m ORDER BY m.ord LIMIT p_limit OFFSET p_offset) p)
    INTO v_total, v_shown, v_rows;

  RETURN jsonb_build_object('can_decide', coalesce((v_all ->> 'can_decide')::boolean, false),
                            'total_all', v_total, 'total', v_shown, 'creators', v_rows);
END;
$function$;
REVOKE ALL ON FUNCTION public.brand_experience_roster_page(uuid, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.brand_experience_roster_page(uuid, text, integer, integer) TO authenticated;

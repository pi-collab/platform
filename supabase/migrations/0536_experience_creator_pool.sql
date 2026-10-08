-- 0536: the Experience creator pool (staff console).
--
-- "Add creators" on an Experience roster becomes a pool page in the Growth
-- campaign layout: one card per bookable creator with their figures and their
-- SHOOT DAY RATE, so staff pick on reach, fit and what the shoot will cost.
--
-- The day rate is never shown to brands (decided 2026-10-08), so it is read
-- here, inside a staff-gated definer function called with the staff member's
-- own session, never by a service-role page query. Everything else on the card
-- (name, handle, niches, place, channels, verified Instagram figures) is what
-- the console already shows staff elsewhere.
--
-- Explicit columns throughout; no SELECT *.

CREATE OR REPLACE FUNCTION experience_console_creator_pool()
RETURNS TABLE (id uuid, full_name text, handle text, profile_photo_url text, niches text[],
               city text, state text, location text, social_accounts jsonb, track text,
               day_rate_product_id uuid, day_rate_paise bigint,
               ig_connected boolean, ig_followers bigint, ig_reach_30 bigint, ig_interactions_30 bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM experience_console_require();
  RETURN QUERY
    SELECT c.id, c.full_name, c.handle, c.profile_photo_url, c.niches,
           c.city, c.state, c.location, c.social_accounts,
           CASE WHEN c.vetting_status = 'growth' THEN 'growth' ELSE 'deals' END,
           cp.id, cp.price_paise,
           (ic.status = 'connected' AND ic.snapshot IS NOT NULL),
           CASE WHEN ic.status = 'connected' AND (ic.snapshot ->> 'followersCount') ~ '^[0-9]+$' THEN (ic.snapshot ->> 'followersCount')::bigint END,
           CASE WHEN ic.status = 'connected' AND (ic.snapshot ->> 'reachLast30') ~ '^[0-9]+$' THEN (ic.snapshot ->> 'reachLast30')::bigint END,
           CASE WHEN ic.status = 'connected' AND (ic.snapshot ->> 'interactionsLast30') ~ '^[0-9]+$' THEN (ic.snapshot ->> 'interactionsLast30')::bigint END
    FROM creators c
    LEFT JOIN creator_products cp
      ON cp.creator_id = c.id AND cp.pricing_type = 'per_day' AND cp.is_active
    LEFT JOIN creator_instagram_connections ic ON ic.creator_id = c.id
    WHERE c.is_bookable AND NOT c.is_guapd
    ORDER BY lower(c.full_name);
END;
$$;

REVOKE EXECUTE ON FUNCTION experience_console_creator_pool() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION experience_console_creator_pool() TO authenticated;

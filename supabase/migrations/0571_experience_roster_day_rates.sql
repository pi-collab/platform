-- 0571: each roster creator's shoot day rate, for the console's Roster list.
--
-- The rate showed on the pool card while adding a creator, then disappeared
-- from the Roster list until the roster was locked (only Creator deals showed
-- it). Ops prices legs from it, so the Roster list now shows it too.
--
-- Staff only, exactly like the pool (0536) and Creator deals: operational
-- access (experience_console_require). Never in any brand read.

CREATE OR REPLACE FUNCTION public.experience_console_roster_day_rates(p_experience_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM experience_console_require();
  IF p_experience_id IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  RETURN (SELECT coalesce(jsonb_object_agg(r.creator_id::text, jsonb_build_object(
            'day_rate_paise', cp.price_paise,
            'paused_rate_paise', CASE WHEN cp.id IS NULL THEN (SELECT pp.price_paise FROM creator_products pp
                                   WHERE pp.creator_id = r.creator_id AND pp.pricing_type = 'per_day' AND pp.is_active IS FALSE
                                   ORDER BY pp.updated_at DESC LIMIT 1) END)), '{}'::jsonb)
          FROM experience_roster r
          LEFT JOIN creator_products cp ON cp.creator_id = r.creator_id AND cp.pricing_type = 'per_day' AND cp.is_active
          WHERE r.experience_id = p_experience_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.experience_console_roster_day_rates(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.experience_console_roster_day_rates(uuid) TO authenticated;

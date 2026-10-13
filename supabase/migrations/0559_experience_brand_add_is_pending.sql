-- 0559: a creator the brand adds is the brand's PICK, not yet an acceptance.
--   Replaces 0557's brand_experience_roster_add. The brand can add many, then
--   accept, hold or reject each on its roster as usual; what it added is shared
--   with Guapd straight away (added_by brand).
--   * A new creator joins SHARED and PENDING (no decision, no channel, no
--     decided_at), added_by brand.
--   * A creator on Guapd's private shortlist (pending, unshared) is shared with
--     the brand, still pending. A shared row (pending, on hold, accepted), a
--     rejected (final) or a locked row is left as it is.
--   * Gates unchanged: brand member, rostering or confirmed, 1 to 20 bookable
--     non house creators, NULL means no. No money read or written.

CREATE OR REPLACE FUNCTION public.brand_experience_roster_add(p_experience_id uuid, p_creator_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text; e_plan_per_creator jsonb; e_request jsonb; v_template jsonb;
  v_creator uuid; v_id uuid; r_id uuid; r_locked boolean; r_decision text; r_shared timestamptz;
  v_n int := 0;
BEGIN
  PERFORM brand_experience_require(p_experience_id, false);
  SELECT e.status, e.agreed_plan -> 'per_creator', e.request_deliverables INTO v_status, e_plan_per_creator, e_request
    FROM experiences e WHERE e.id = p_experience_id FOR UPDATE;
  IF v_status IS NULL OR v_status NOT IN ('rostering', 'confirmed') THEN
    RAISE EXCEPTION 'Creators can be added once the price is agreed, until the shoot is scheduled';
  END IF;
  IF coalesce(array_length(p_creator_ids, 1), 0) = 0 THEN RAISE EXCEPTION 'Pick at least one creator'; END IF;
  IF array_length(p_creator_ids, 1) > 20 THEN RAISE EXCEPTION 'Add at most 20 creators at a time'; END IF;
  v_template := coalesce(e_plan_per_creator, e_request, '[]'::jsonb);

  FOREACH v_creator IN ARRAY p_creator_ids LOOP
    IF v_creator IS NULL OR NOT EXISTS (SELECT 1 FROM creators c WHERE c.id = v_creator AND c.is_bookable IS TRUE AND c.is_guapd IS FALSE) THEN
      RAISE EXCEPTION 'Only creators listed on Guapd can be added';
    END IF;
    r_id := NULL;
    SELECT r.id, r.locked, r.brand_decision, r.shared_with_brand_at INTO r_id, r_locked, r_decision, r_shared
      FROM experience_roster r WHERE r.experience_id = p_experience_id AND r.creator_id = v_creator FOR UPDATE;
    IF r_id IS NULL THEN
      INSERT INTO experience_roster (experience_id, creator_id, added_by, brand_decision, planned_deliverables, decision_channel,
                                     decided_at, added_by_user, shared_with_brand_at, shared_by)
      VALUES (p_experience_id, v_creator, 'brand', 'pending', v_template, NULL, NULL, my_user_id(), now(), my_user_id())
      RETURNING id INTO v_id;
      v_n := v_n + 1;
      PERFORM experience_console_audit('experience.roster_added_by_brand', 'experience_roster', v_id,
        jsonb_build_object('experience_id', p_experience_id, 'creator_id', v_creator, 'added_by', 'brand', 'channel', 'portal',
          'decision_after', 'pending', 'after_lock', v_status = 'confirmed'));
    ELSIF r_locked IS FALSE AND r_decision = 'pending' AND r_shared IS NULL THEN
      UPDATE experience_roster SET shared_with_brand_at = now(), shared_by = my_user_id(), updated_at = now()
        WHERE id = r_id AND shared_with_brand_at IS NULL;
      v_n := v_n + 1;
      PERFORM experience_console_audit('experience.roster_shared_by_brand_add', 'experience_roster', r_id,
        jsonb_build_object('experience_id', p_experience_id, 'creator_id', v_creator, 'decision_after', 'pending',
          'channel', 'portal', 'was_shared', false, 'via', 'brand_add'));
    END IF;
  END LOOP;
  RETURN v_n;
END;
$function$;
REVOKE ALL ON FUNCTION public.brand_experience_roster_add(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.brand_experience_roster_add(uuid, uuid[]) TO authenticated;

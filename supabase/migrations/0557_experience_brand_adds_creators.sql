-- 0557: the brand adds creators to its own roster while creators are chosen.
--   * brand_experience_roster_add: a member of the Experience brand, while the
--     roster is open (rostering or confirmed), names bookable creators. Each
--     joins the roster SHARED and ACCEPTED (the brand chose them), added_by
--     brand, channel portal. Guapd still checks availability, locks and sends
--     the offer; nothing reaches a creator from here.
--   * A creator already on the roster: an unshared Guapd shortlist row is
--     shared and accepted; a shared row still pending or on hold is accepted;
--     a rejected (final) or locked row is left as it is.
--   * At most 20 per call. Only bookable, non house creators. No money read or
--     written. NULL means no on every gate.

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
      VALUES (p_experience_id, v_creator, 'brand', 'accepted', v_template, 'portal', now(), my_user_id(), now(), my_user_id())
      RETURNING id INTO v_id;
      v_n := v_n + 1;
      PERFORM experience_console_audit('experience.roster_added_by_brand', 'experience_roster', v_id,
        jsonb_build_object('experience_id', p_experience_id, 'creator_id', v_creator, 'added_by', 'brand', 'channel', 'portal',
          'decision_after', 'accepted', 'after_lock', v_status = 'confirmed'));
    ELSIF r_locked IS FALSE AND r_decision IN ('pending', 'on_hold') THEN
      UPDATE experience_roster SET brand_decision = 'accepted', decision_channel = 'portal', decided_at = now(),
             shared_with_brand_at = coalesce(shared_with_brand_at, now()), shared_by = coalesce(shared_by, my_user_id()), updated_at = now()
        WHERE id = r_id;
      v_n := v_n + 1;
      PERFORM experience_console_audit('experience.roster_decision_by_brand', 'experience_roster', r_id,
        jsonb_build_object('experience_id', p_experience_id, 'creator_id', v_creator, 'decision_before', r_decision,
          'decision_after', 'accepted', 'channel', 'portal', 'was_shared', r_shared IS NOT NULL, 'via', 'brand_add'));
    END IF;
  END LOOP;
  RETURN v_n;
END;
$function$;
REVOKE ALL ON FUNCTION public.brand_experience_roster_add(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.brand_experience_roster_add(uuid, uuid[]) TO authenticated;

-- 0549: Phase 6.1 item 12 + a 0548 follow-up.
--   * Ops can REVERSE a lock: a locked creator who backs out at the last moment
--     is released from the roster (and can then be removed, or sent a fresh
--     offer if they come back). Before the shoot is done only: never once they
--     have a shoot outcome, a payout or anything shared with the brand. An open
--     offer is withdrawn; an accepted one is cancelled with the reason (kept on
--     record, the creator told). No money row is edited: a cancelled leg leaves
--     the P&L and the reconcile by its deal status, as a declined one does.
--   * Linking a not-on-Guapd prospect keeps 0548's rule: a brand decision on
--     the prospect means the brand saw them, so the linked creator is shared.

CREATE OR REPLACE FUNCTION experience_console_prospect_link(p_prospect_id uuid, p_creator_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_exp uuid; x record; v_template jsonb; v_roster uuid;
BEGIN
  PERFORM experience_console_require();
  v_exp := experience_prospect_open(p_prospect_id);
  IF p_creator_id IS NULL OR NOT EXISTS (SELECT 1 FROM creators c WHERE c.id = p_creator_id AND c.is_bookable IS TRUE AND c.is_guapd IS FALSE) THEN
    RAISE EXCEPTION 'Link them once their Guapd account is vetted and bookable';
  END IF;
  IF EXISTS (SELECT 1 FROM experience_roster r WHERE r.experience_id = v_exp AND r.creator_id = p_creator_id) THEN
    RAISE EXCEPTION 'That creator is already on this roster';
  END IF;
  IF EXISTS (SELECT 1 FROM experience_roster_prospects y WHERE y.linked_creator_id = p_creator_id AND y.experience_id = v_exp) THEN
    RAISE EXCEPTION 'That creator is already linked to another entry here';
  END IF;
  SELECT p.brand_decision, p.decision_channel, p.decided_at INTO x FROM experience_roster_prospects p WHERE p.id = p_prospect_id;
  SELECT coalesce(e.agreed_plan -> 'per_creator', e.request_deliverables, '[]'::jsonb) INTO v_template FROM experiences e WHERE e.id = v_exp;
  -- 0549: a brand decision on the prospect means the brand saw them: the linked
  -- creator is shared. Undecided, they join Guapd's internal shortlist (0548).
  INSERT INTO experience_roster (experience_id, creator_id, added_by, brand_decision, planned_deliverables, decision_channel, decided_at, added_by_user,
                                 shared_with_brand_at, shared_by)
  VALUES (v_exp, p_creator_id, 'guapd', x.brand_decision, v_template, x.decision_channel, x.decided_at, my_user_id(),
          CASE WHEN x.brand_decision IS DISTINCT FROM 'pending' THEN coalesce(x.decided_at, now()) END,
          CASE WHEN x.brand_decision IS DISTINCT FROM 'pending' THEN my_user_id() END)
  RETURNING id INTO v_roster;
  UPDATE experience_roster_prospects SET status = 'linked', linked_creator_id = p_creator_id, linked_roster_id = v_roster, linked_at = now(), updated_at = now()
  WHERE id = p_prospect_id;
  PERFORM experience_console_audit('experience.prospect_linked', 'experience_roster_prospects', p_prospect_id,
    jsonb_build_object('experience_id', v_exp, 'creator_id', p_creator_id, 'roster_id', v_roster, 'brand_decision', x.brand_decision));
  RETURN v_roster;
END;
$$;

CREATE OR REPLACE FUNCTION public.experience_console_roster_release(p_roster_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exp uuid; v_status text; r record; v_dstatus text; v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  PERFORM experience_console_require();
  SELECT rr.experience_id INTO v_exp FROM experience_roster rr WHERE rr.id = p_roster_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Roster entry not found'; END IF;
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT rr.id, rr.creator_id, rr.locked, rr.leg_deal_id, rr.leg_shoot_outcome INTO r FROM experience_roster rr WHERE rr.id = p_roster_id FOR UPDATE;
  IF r.locked IS NOT TRUE THEN RAISE EXCEPTION 'This creator is not locked: remove them, or record the brand''s answer'; END IF;
  IF v_status IS NULL OR v_status NOT IN ('confirmed', 'shoot_scheduled') THEN
    RAISE EXCEPTION 'A creator is released before the shoot is done; after it, record that they did not shoot';
  END IF;
  IF length(v_reason) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'Say why they are leaving the roster (3 to 300 characters)'; END IF;
  IF r.leg_shoot_outcome IS NOT NULL THEN RAISE EXCEPTION 'This creator already has a shoot outcome; undo it first'; END IF;
  IF r.leg_deal_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM vendor_payouts p WHERE p.deal_id = r.leg_deal_id AND p.status NOT IN ('cancelled', 'failed')) THEN
      RAISE EXCEPTION 'This creator has a payout; cancel it first';
    END IF;
    IF EXISTS (SELECT 1 FROM experience_deliverable_releases x WHERE x.experience_id = v_exp AND x.deal_id = r.leg_deal_id AND x.status = 'shared') THEN
      RAISE EXCEPTION 'Work from this creator is with the brand; it cannot be released';
    END IF;
    SELECT d.status::text INTO v_dstatus FROM deals d WHERE d.id = r.leg_deal_id FOR UPDATE;
    IF v_dstatus IN ('negotiating', 'agreed') THEN
      UPDATE deals SET status = 'cancelled' WHERE id = r.leg_deal_id;
      UPDATE experience_leg_counters SET status = 'withdrawn', decided_at = now(), decided_by = my_user_id() WHERE deal_id = r.leg_deal_id AND status = 'open';
      INSERT INTO events (deal_id, actor_id, event_type, detail)
        VALUES (r.leg_deal_id, my_user_id(), 'experience.leg_released', jsonb_build_object('by', 'guapd', 'status_before', v_dstatus));
    END IF;
  END IF;
  UPDATE experience_roster SET locked = false, locked_at = NULL, leg_deal_id = NULL, leg_sent_at = NULL, updated_at = now()
    WHERE id = p_roster_id;
  IF v_status = 'shoot_scheduled' THEN PERFORM experience_shoot_rollup(v_exp); END IF;
  PERFORM experience_console_audit('experience.roster_released', 'experience_roster', p_roster_id,
    jsonb_build_object('experience_id', v_exp, 'creator_id', r.creator_id, 'reason', v_reason,
      'deal_id', r.leg_deal_id, 'deal_status_before', v_dstatus, 'deal_status_after', CASE WHEN v_dstatus IN ('negotiating', 'agreed') THEN 'cancelled' ELSE v_dstatus END));
  RETURN jsonb_build_object('deal_id', r.leg_deal_id, 'deal_cancelled', v_dstatus IN ('negotiating', 'agreed'));
END;
$function$;

DO $$
BEGIN
  REVOKE ALL ON FUNCTION experience_console_roster_release(uuid, text) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION experience_console_roster_release(uuid, text) TO authenticated;
  REVOKE ALL ON FUNCTION experience_console_prospect_link(uuid, uuid) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION experience_console_prospect_link(uuid, uuid) TO authenticated;
END $$;

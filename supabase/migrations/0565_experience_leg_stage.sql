-- 0565: where each creator deal on an Experience really is.
--   deals.status stays 'agreed' from acceptance until the deal is paid, so the
--   console's Experience deals list (and its tabs) never moved past "In
--   production" while the shoot, the videos, the posts and the invoice went on.
--   experience_leg_stage(deal) derives the stage from the records that do move:
--     offer | creator_countered | declined | cancelled
--     shoot_ahead (date not reached) | record_shoot (date reached, no outcome) | did_not_shoot
--     videos (approved of total) | posting (collab posts still to come)
--     invoice_due (work complete, no main invoice) | to_pay (invoice in, no payout)
--     payout (requested / approved / processing) | paid
--   Operational: the list function returns it as 'stage'; no money in it.

CREATE OR REPLACE FUNCTION public.experience_leg_stage(p_deal_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text; v_exp uuid; v_outcome text; v_date date; v_counter text;
  v_items int; v_approved int; v_waiting int; v_payout text;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  SELECT d.status::text, d.experience_id INTO v_status, v_exp FROM deals d WHERE d.id = p_deal_id AND d.leg_role = 'creator_leg';
  IF v_status IS NULL THEN RETURN NULL; END IF;
  IF v_status IN ('declined', 'cancelled') THEN RETURN jsonb_build_object('key', v_status); END IF;
  IF v_status = 'negotiating' THEN
    SELECT k.proposed_by INTO v_counter FROM experience_leg_counters k
      WHERE k.deal_id = p_deal_id AND k.status = 'open' ORDER BY k.created_at DESC LIMIT 1;
    RETURN jsonb_build_object('key', CASE WHEN v_counter = 'creator' THEN 'creator_countered' ELSE 'offer' END);
  END IF;

  -- The main payout (not an extra or a commission) decides the last stages.
  SELECT p.status INTO v_payout FROM vendor_payouts p
    WHERE p.deal_id = p_deal_id AND p.reason = 'creator_fee' AND p.status NOT IN ('cancelled', 'failed')
    ORDER BY p.created_at DESC LIMIT 1;
  IF v_payout = 'paid' THEN RETURN jsonb_build_object('key', 'paid'); END IF;
  IF v_payout IS NOT NULL THEN RETURN jsonb_build_object('key', 'payout', 'payout_status', v_payout); END IF;

  SELECT r.leg_shoot_outcome INTO v_outcome FROM experience_roster r WHERE r.leg_deal_id = p_deal_id;
  SELECT e.shoot_date INTO v_date FROM experiences e WHERE e.id = v_exp;
  IF v_outcome = 'did_not_shoot' THEN RETURN jsonb_build_object('key', 'did_not_shoot'); END IF;
  IF v_outcome IS DISTINCT FROM 'done' THEN
    RETURN jsonb_build_object('key', CASE WHEN v_date IS NOT NULL AND v_date <= v_today THEN 'record_shoot' ELSE 'shoot_ahead' END, 'shoot_date', v_date);
  END IF;

  IF experience_leg_work_complete(p_deal_id) IS TRUE THEN
    IF EXISTS (SELECT 1 FROM experience_creator_invoices i WHERE i.deal_id = p_deal_id AND i.extra_id IS NULL AND i.follow_on_id IS NULL AND i.status = 'issued') THEN
      RETURN jsonb_build_object('key', 'to_pay');
    END IF;
    RETURN jsonb_build_object('key', 'invoice_due');
  END IF;

  SELECT count(*)::int, count(*) FILTER (WHERE i.item_status = 'approved')::int INTO v_items, v_approved
    FROM deal_deliverable_items i WHERE i.deal_id = p_deal_id;
  IF v_items > 0 AND v_approved < v_items THEN
    RETURN jsonb_build_object('key', 'videos', 'approved', v_approved, 'total', v_items);
  END IF;
  v_waiting := coalesce(experience_leg_collab_waiting(p_deal_id), 0);
  RETURN jsonb_build_object('key', 'posting', 'waiting', v_waiting);
END;
$function$;
REVOKE ALL ON FUNCTION public.experience_leg_stage(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.experience_console_leg_threads(p_experience_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v jsonb; v_me uuid := my_user_id();
BEGIN
  PERFORM experience_console_require();
  SELECT coalesce(jsonb_agg(x.row ORDER BY x.sort_at DESC), '[]'::jsonb) INTO v
  FROM (
    SELECT jsonb_build_object(
             'deal_id', d.id, 'deal_ref', d.deal_ref, 'status', d.status::text, 'experience_id', d.experience_id,
             'experience_title', e.title, 'brand_name', b.name, 'creator_name', c.full_name, 'creator_handle', c.handle,
             'creator_photo', c.profile_photo_url, 'sent_at', r.leg_sent_at, 'shoot_outcome', r.leg_shoot_outcome,
             'stage', experience_leg_stage(d.id),
             'open_counter', (SELECT jsonb_build_object('round', k.round, 'proposed_by', k.proposed_by) FROM experience_leg_counters k
                              WHERE k.deal_id = d.id AND k.status = 'open' ORDER BY k.created_at DESC LIMIT 1),
             'message_count', (SELECT count(*) FROM messages m WHERE m.deal_id = d.id),
             'last_message', (SELECT jsonb_build_object('body', left(m.body, 160), 'from', CASE WHEN m.sender_party = 'creator' THEN 'creator' ELSE 'guapd' END,
                                                        'created_at', m.created_at)
                              FROM messages m WHERE m.deal_id = d.id ORDER BY m.created_at DESC LIMIT 1),
             'unread', (SELECT count(*) FROM messages m WHERE m.deal_id = d.id AND m.sender_party = 'creator'
                          AND m.created_at > coalesce((SELECT mr.last_read_at FROM message_reads mr WHERE mr.user_id = v_me AND mr.deal_id = d.id), '-infinity'::timestamptz)),
             'can_message', coalesce(d.status::text NOT IN ('complete', 'declined', 'cancelled'), false)
           ) AS row,
           greatest(r.leg_sent_at, (SELECT max(m.created_at) FROM messages m WHERE m.deal_id = d.id)) AS sort_at
    FROM experience_roster r
    JOIN deals d ON d.id = r.leg_deal_id AND d.leg_role = 'creator_leg'
    JOIN experiences e ON e.id = d.experience_id
    JOIN brands b ON b.id = e.brand_id
    JOIN creators c ON c.id = d.creator_id
    WHERE (p_experience_id IS NULL OR r.experience_id = p_experience_id)
  ) x;
  RETURN v;
END;
$function$;

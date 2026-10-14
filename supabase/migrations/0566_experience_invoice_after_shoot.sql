-- 0566: a creator's main invoice opens once their shoot is done, not once their
-- collab videos are posted.
--
-- 0561 held the main invoice until every ad-rights video was posted as a collab
-- and its link given. In practice the shoot fee is earned on the day: Guapd
-- clears it straight after the shoot, and posting (and the affiliate commission
-- that follows it, 0563) is billed later on its own. Collab posts are still
-- sent, tracked and chased exactly as before; they just no longer hold the fee.
--
-- Everything else is unchanged: the deal is agreed or paid, the shoot outcome is
-- 'done', and a creator who makes their own videos (or a leg whose trigger is
-- on_delivery_accepted) still needs every visible video approved first.

CREATE OR REPLACE FUNCTION public.experience_leg_work_complete(p_deal_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text; v_trigger text; v_outcome text;
BEGIN
  SELECT d.status::text, coalesce(d.settings_snapshot ->> 'completion_trigger', 'on_shoot_done')
    INTO v_status, v_trigger FROM deals d WHERE d.id = p_deal_id AND d.leg_role = 'creator_leg';
  SELECT r.leg_shoot_outcome INTO v_outcome FROM experience_roster r WHERE r.leg_deal_id = p_deal_id;
  IF v_status IS NULL OR v_status NOT IN ('agreed', 'paid') OR v_outcome IS DISTINCT FROM 'done' THEN
    RETURN false;
  END IF;
  IF experience_leg_owner(p_deal_id) = 'creator' OR v_trigger = 'on_delivery_accepted' THEN
    RETURN EXISTS (SELECT 1 FROM deal_deliverable_items i WHERE i.deal_id = p_deal_id AND i.visible_to_creator)
       AND NOT EXISTS (SELECT 1 FROM deal_deliverable_items i WHERE i.deal_id = p_deal_id AND i.visible_to_creator AND i.item_status IS DISTINCT FROM 'approved');
  END IF;
  RETURN coalesce(v_trigger = 'on_shoot_done', false);
END;
$function$;
REVOKE ALL ON FUNCTION public.experience_leg_work_complete(uuid) FROM PUBLIC, anon, authenticated;

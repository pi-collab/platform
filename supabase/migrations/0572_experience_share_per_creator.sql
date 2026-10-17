-- 0572: share a creator's deliverables as soon as THAT creator has shot.
--
-- Until now sharing waited for the whole Experience to reach Shoot done, which
-- needs every sent deal accepted and every outcome recorded. One creator who has
-- not accepted yet held back the work of everyone who already shot (Kiro, Oct
-- 2026). Now sharing is open while the shoot is scheduled too. The per-item gate
-- is unchanged and is what matters: the creator's deal is agreed or paid, their
-- outcome is recorded as shot, and the item is approved by Guapd with content.
--
-- The roll-up is unchanged except for one thing: if it reaches Shoot done when
-- work is already shared, it moves straight on to Delivering (what a share in
-- Shoot done does), so the Experience can never stall at Shoot done with nothing
-- left to share.

CREATE OR REPLACE FUNCTION public.experience_console_release(p_experience_id uuid, p_item_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text; v_item uuid; v_new uuid; v_n int := 0;
  i_deal uuid; i_status text; i_ver int; i_label text; i_url text; i_path text; i_file text;
  d_status text; d_creator uuid; v_outcome text;
  o_id uuid; o_ver int; o_decision text;
BEGIN
  PERFORM experience_console_require();
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = p_experience_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  IF v_status = 'complete' THEN RAISE EXCEPTION 'This Experience is Complete. Reopen it first (finance)'; END IF;
  IF v_status IS NULL OR v_status NOT IN ('shoot_scheduled', 'shoot_done', 'delivering') THEN RAISE EXCEPTION 'Share with the brand once the shoot is scheduled and the creator has shot'; END IF;
  IF coalesce(array_length(p_item_ids, 1), 0) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Pick what to share'; END IF;

  FOREACH v_item IN ARRAY (SELECT array_agg(DISTINCT u) FROM unnest(p_item_ids) u) LOOP
    SELECT i.deal_id, i.item_status, i.version, i.label, i.external_url, i.storage_path, i.file_name
      INTO i_deal, i_status, i_ver, i_label, i_url, i_path, i_file
      FROM deal_deliverable_items i WHERE i.id = v_item FOR UPDATE;
    SELECT d.status::text, d.creator_id INTO d_status, d_creator FROM deals d
      WHERE d.id = i_deal AND d.leg_role = 'creator_leg' AND d.experience_id = p_experience_id;
    IF d_status IS NULL THEN RAISE EXCEPTION 'That deliverable is not on this Experience'; END IF;
    SELECT r.leg_shoot_outcome INTO v_outcome FROM experience_roster r WHERE r.leg_deal_id = i_deal;
    IF d_status IS NULL OR d_status NOT IN ('agreed', 'paid') OR v_outcome IS DISTINCT FROM 'done' THEN RAISE EXCEPTION 'Only deliverables from creators who shot can be shared'; END IF;
    IF i_status IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION '"%" is not approved by Guapd yet', i_label; END IF;
    IF i_url IS NULL AND i_path IS NULL THEN RAISE EXCEPTION '"%" has no content', i_label; END IF;

    o_id := NULL;
    SELECT x.id, x.item_version, x.brand_decision INTO o_id, o_ver, o_decision
      FROM experience_deliverable_releases x WHERE x.item_id = v_item AND x.status = 'shared' FOR UPDATE;
    IF o_id IS NOT NULL THEN
      IF o_decision = 'approved' THEN RAISE EXCEPTION 'The brand already approved "%"', i_label; END IF;
      IF o_ver = i_ver THEN RAISE EXCEPTION '"%" (version %) is already shared', i_label, i_ver; END IF;
      UPDATE experience_deliverable_releases SET status = 'superseded', superseded_at = now() WHERE id = o_id;
    END IF;

    INSERT INTO experience_deliverable_releases (experience_id, deal_id, item_id, item_version, label, external_url,
                                                 storage_path, file_name, status, released_by)
    VALUES (p_experience_id, i_deal, v_item, i_ver, i_label, i_url, i_path, i_file, 'shared', my_user_id())
    RETURNING id INTO v_new;
    IF o_id IS NOT NULL THEN
      UPDATE experience_deliverable_releases SET superseded_by = v_new WHERE id = o_id;
    END IF;
    v_n := v_n + 1;
    PERFORM experience_console_audit('experience.deliverable_released', 'experience_deliverable_releases', v_new,
      jsonb_build_object('experience_id', p_experience_id, 'deal_id', i_deal, 'item_id', v_item, 'creator_id', d_creator,
        'version', i_ver, 'supersedes', o_id));
  END LOOP;

  IF v_status = 'shoot_done' THEN
    UPDATE experiences SET status = 'delivering', updated_at = now() WHERE id = p_experience_id;
    PERFORM experience_console_audit('experience.delivering', 'experiences', p_experience_id,
      jsonb_build_object('status_before', 'shoot_done', 'status_after', 'delivering'));
  END IF;
  RETURN jsonb_build_object('released', v_n, 'progress', experience_deliverables_progress(p_experience_id));
END;
$function$

;

CREATE OR REPLACE FUNCTION public.experience_shoot_rollup(p_experience_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text; v_open int; v_missing int; v_done int;
BEGIN
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = p_experience_id;
  IF v_status IS DISTINCT FROM 'shoot_scheduled' THEN RETURN v_status; END IF;
  SELECT count(*) FILTER (WHERE d.status = 'negotiating'),
         count(*) FILTER (WHERE d.status IN ('agreed', 'paid') AND r.leg_shoot_outcome IS NULL),
         count(*) FILTER (WHERE d.status IN ('agreed', 'paid') AND r.leg_shoot_outcome = 'done')
    INTO v_open, v_missing, v_done
    FROM experience_roster r JOIN deals d ON d.id = r.leg_deal_id
    WHERE r.experience_id = p_experience_id;
  IF v_open = 0 AND v_missing = 0 AND v_done > 0 THEN
    UPDATE experiences SET status = 'shoot_done', updated_at = now() WHERE id = p_experience_id;
    PERFORM experience_console_audit('experience.shoot_done', 'experiences', p_experience_id,
      jsonb_build_object('status_before', 'shoot_scheduled', 'status_after', 'shoot_done', 'creators_shot', v_done));
    -- 0572: work already shared (per creator, while scheduled): on to Delivering.
    IF EXISTS (SELECT 1 FROM experience_deliverable_releases x WHERE x.experience_id = p_experience_id AND x.status = 'shared') THEN
      UPDATE experiences SET status = 'delivering', updated_at = now() WHERE id = p_experience_id;
      PERFORM experience_console_audit('experience.delivering', 'experiences', p_experience_id,
        jsonb_build_object('status_before', 'shoot_done', 'status_after', 'delivering'));
      RETURN 'delivering';
    END IF;
    RETURN 'shoot_done';
  END IF;
  RETURN v_status;
END;
$function$;

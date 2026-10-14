-- 0556: brands see the platform from signup; approval comes with the first deal.
--   * Any real brand that is not rejected may see and request an Experience
--     (was approved only). The first request moves an unreviewed brand to
--     pending_review, as a first held deal does, and ops is emailed once.
--   * Guapd sends a quote only to an approved brand (or the house brand), so
--     nothing is priced for a brand nobody has looked at.
--   * The creator roster hold on browse (domain mismatch) is removed in the app.
-- No money column is read or written here beyond the unchanged quote body.

CREATE OR REPLACE FUNCTION public.brand_experiences()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := my_user_id(); v_rows jsonb; v_brand uuid; v_can boolean; v_admin boolean;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE = '42501'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', e.id, 'title', e.title, 'brand_name', b.name, 'status', e.status,
      'requested_at', e.requested_at, 'shoot_date', e.shoot_date, 'shoot_city', e.shoot_city,
      'creator_count', e.request_creator_count,
      'quote_to_answer', EXISTS (SELECT 1 FROM experience_quotes q WHERE q.experience_id = e.id AND q.status = 'open' AND q.proposed_by = 'guapd'),
      'roster_to_review', CASE WHEN e.status IN ('rostering', 'confirmed') THEN
          (SELECT count(*) FROM experience_roster r WHERE r.experience_id = e.id AND r.locked IS FALSE AND r.brand_decision IN ('pending', 'on_hold')
            AND r.shared_with_brand_at IS NOT NULL) ELSE 0 END,
      'items_to_review', (SELECT count(*) FROM experience_deliverable_releases x
          WHERE x.experience_id = e.id AND x.status = 'shared' AND x.brand_decision IS NULL),
      'invoices_due', (SELECT count(*) FROM service_invoices si WHERE si.experience_id = e.id AND si.status = 'issued'),
      'signoff_due', e.status = 'delivering' AND e.brand_signoff_at IS NULL
    ) ORDER BY e.status IN ('complete', 'cancelled'), coalesce(e.requested_at, e.created_at) DESC), '[]'::jsonb)
    INTO v_rows
    FROM experiences e JOIN brands b ON b.id = e.brand_id
    WHERE b.is_guapd IS FALSE AND e.status IS DISTINCT FROM 'draft'
      AND EXISTS (SELECT 1 FROM brand_members bm WHERE bm.brand_id = e.brand_id AND bm.user_id = v_user);
  -- Who may request (0556): a member of a real brand that is not rejected. Approval
  -- comes with the first request, as with a first deal (their first brand, as my_brand_id).
  v_brand := my_brand_id();
  SELECT (b.brand_status IN ('unreviewed', 'pending_review', 'approved') AND b.is_guapd IS FALSE), bm.is_admin INTO v_can, v_admin
    FROM brands b JOIN brand_members bm ON bm.brand_id = b.id AND bm.user_id = v_user WHERE b.id = v_brand;
  RETURN jsonb_build_object('experiences', v_rows, 'can_request', v_can IS TRUE);
END;
$function$;

CREATE OR REPLACE FUNCTION public.brand_experience_request(p_title text, p_creator_count integer, p_deliverables jsonb, p_affiliate boolean, p_affiliate_per_creator integer, p_ad_rights boolean, p_ad_rights_per_creator integer, p_ad_rights_months integer, p_boost boolean, p_boost_per_creator integer, p_boost_months integer, p_location text, p_date_from date, p_date_to date, p_brief text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := my_user_id(); v_brand uuid := my_brand_id(); v_ok boolean; v_id uuid;
BEGIN
  IF v_user IS NULL OR v_brand IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE = '42501'; END IF;
  SELECT (b.brand_status IN ('unreviewed', 'pending_review', 'approved') AND b.is_guapd IS FALSE) INTO v_ok
    FROM brands b JOIN brand_members bm ON bm.brand_id = b.id AND bm.user_id = v_user WHERE b.id = v_brand;
  IF v_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'Your brand account cannot request an Experience. Contact support if you think this is a mistake' USING ERRCODE = '42501';
  END IF;
  v_id := experience_request_insert(v_brand, p_title, p_creator_count, p_deliverables, p_affiliate, p_affiliate_per_creator,
    p_ad_rights, p_ad_rights_per_creator, p_ad_rights_months, p_boost, p_boost_per_creator, p_boost_months,
    p_location, p_date_from, p_date_to, p_brief, 'portal');
  -- The first request opens the brand review, as a first held deal does (only from unreviewed).
  UPDATE brands SET brand_status = 'pending_review' WHERE id = v_brand AND brand_status = 'unreviewed';
  PERFORM experience_console_audit('experience.request_submitted_by_brand', 'experiences', v_id,
    jsonb_build_object('brand_id', v_brand, 'channel', 'portal', 'creators', p_creator_count,
      'videos_per_creator', experience_plan_count(p_deliverables, true), 'status_after', 'requested'));
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_quote(p_experience_id uuid, p_proposed_by text, p_per_video_paise bigint, p_deliverable_count integer, p_misc_paise bigint, p_deliverables jsonb, p_shoot_date date, p_shoot_city text, p_message text, p_channel text, p_extras jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
  v_prev uuid;
  v_version int;
  v_id uuid;
  v_misc bigint := coalesce(p_misc_paise, 0);
  v_extras jsonb := coalesce(p_extras, '[]'::jsonb);
BEGIN
  PERFORM experience_console_require();
  IF p_channel = 'portal' THEN RAISE EXCEPTION '"On Guapd" is recorded only when the brand acts in the portal themselves'; END IF;
  -- Quoting IS the brand price: financial access only (0537).
  IF has_experience_access('financial') IS NOT TRUE THEN
    RAISE EXCEPTION 'Financial access required: the brand price is finance only' USING ERRCODE = '42501';
  END IF;
  SELECT status INTO v_status FROM experiences WHERE id = p_experience_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  IF v_status IS DISTINCT FROM 'requested' THEN RAISE EXCEPTION 'The price is already agreed; quotes are closed'; END IF;
  IF p_proposed_by IS NULL OR p_proposed_by NOT IN ('guapd', 'brand') THEN RAISE EXCEPTION 'A quote is from Guapd or the brand'; END IF;
  -- 0556: a brand that is not yet approved can request, but Guapd quotes only once it is approved.
  IF p_proposed_by = 'guapd' AND NOT EXISTS (
       SELECT 1 FROM experiences e JOIN brands b ON b.id = e.brand_id
       WHERE e.id = p_experience_id AND (b.brand_status = 'approved' OR b.is_guapd IS TRUE)) THEN
    RAISE EXCEPTION 'Approve this brand in Ops, Brands before sending it a quote';
  END IF;
  IF p_proposed_by = 'brand' AND p_channel IS NULL THEN RAISE EXCEPTION 'Say how the brand sent its counter'; END IF;
  IF p_per_video_paise IS NULL OR p_per_video_paise <= 0 THEN RAISE EXCEPTION 'Price per video must be more than zero'; END IF;
  IF p_deliverable_count IS NULL OR p_deliverable_count <= 0 THEN RAISE EXCEPTION 'Number of videos must be more than zero'; END IF;
  IF v_misc < 0 THEN RAISE EXCEPTION 'Extras cannot be negative'; END IF;
  -- 0553: extras as named lines; the extras amount is their sum.
  IF experience_extras_valid(v_extras) IS NOT TRUE THEN
    RAISE EXCEPTION 'Each extra needs a description (2 to 120 characters) and an amount above zero; at most 20';
  END IF;
  IF jsonb_array_length(v_extras) > 0 THEN
    IF p_misc_paise IS NOT NULL AND p_misc_paise IS DISTINCT FROM experience_extras_total(v_extras) THEN
      RAISE EXCEPTION 'The extras total does not match its lines';
    END IF;
    v_misc := experience_extras_total(v_extras);
  END IF;

  UPDATE experience_quotes SET status = 'superseded', decided_at = now(), decided_by = my_user_id()
    WHERE experience_id = p_experience_id AND status = 'open'
    RETURNING id INTO v_prev;
  SELECT coalesce(max(version), 0) + 1 INTO v_version FROM experience_quotes WHERE experience_id = p_experience_id;

  INSERT INTO experience_quotes (experience_id, version, proposed_by, per_video_paise, deliverable_count,
    misc_paise, extras, total_paise, deliverables, shoot_date, shoot_city, message, status, recorded_channel, created_by)
  VALUES (p_experience_id, v_version, p_proposed_by, p_per_video_paise, p_deliverable_count, v_misc, v_extras,
    p_per_video_paise * p_deliverable_count + v_misc, coalesce(p_deliverables, '[]'::jsonb), p_shoot_date,
    nullif(btrim(p_shoot_city), ''), nullif(btrim(p_message), ''), 'open', p_channel, my_user_id())
  RETURNING id INTO v_id;

  PERFORM experience_console_audit(
    CASE WHEN p_proposed_by = 'guapd' THEN 'experience.quote_sent' ELSE 'experience.brand_counter_recorded' END,
    'experience_quotes', v_id,
    jsonb_build_object('experience_id', p_experience_id, 'version', v_version, 'replaced_quote_id', v_prev,
      'total_paise', p_per_video_paise * p_deliverable_count + v_misc, 'extras_lines', jsonb_array_length(v_extras), 'channel', p_channel));
  RETURN v_id;
END;
$function$;

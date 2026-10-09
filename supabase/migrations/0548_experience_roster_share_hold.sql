-- 0548: Phase 6.1 item 8. The roster's ops curation gate + brand approval.
--   * Guapd shortlists; only creators Guapd SHARES reach the brand. Unshared
--     creators never appear in any brand read (data layer).
--   * A fourth state, on_hold, beside pending / accepted / rejected. Pending is
--     the default and never auto-approved; on hold is re-decidable; rejected is
--     final for that creator on this roster. Only accepted creators lock, and an
--     offer goes only to a locked accepted creator (leg draft and send, as before).
--   * The brand can accept several shared creators at once. Reject and hold stay
--     one at a time.
-- No money column is read or written. Nothing reaches the creator from here.

ALTER TABLE experience_roster
  ADD COLUMN IF NOT EXISTS shared_with_brand_at timestamptz,
  ADD COLUMN IF NOT EXISTS shared_by uuid REFERENCES users(id);

-- Every row before 0548 was visible to the brand already: record it as shared.
UPDATE experience_roster SET shared_with_brand_at = coalesce(decided_at, created_at)
  WHERE shared_with_brand_at IS NULL;

ALTER TABLE experience_roster DROP CONSTRAINT IF EXISTS experience_roster_brand_decision_check;
ALTER TABLE experience_roster ADD CONSTRAINT experience_roster_brand_decision_check
  CHECK (brand_decision = ANY (ARRAY['pending', 'accepted', 'rejected', 'on_hold']));
-- A brand decision exists only for a creator the brand was shown. Holds for
-- every future insert too: new rows start pending.
ALTER TABLE experience_roster DROP CONSTRAINT IF EXISTS er_decided_only_when_shared;
ALTER TABLE experience_roster ADD CONSTRAINT er_decided_only_when_shared
  CHECK (brand_decision = 'pending' OR shared_with_brand_at IS NOT NULL);

-- Guapd shares chosen shortlisted creators with the brand. Returns how many are newly shared.
CREATE OR REPLACE FUNCTION public.experience_console_roster_share(p_experience_id uuid, p_roster_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_status text; v_n int; v_bad int;
BEGIN
  PERFORM experience_console_require();
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = p_experience_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  IF v_status NOT IN ('rostering', 'confirmed') THEN RAISE EXCEPTION 'Creators are shared with the brand while the roster is being built'; END IF;
  IF coalesce(array_length(p_roster_ids, 1), 0) = 0 THEN RAISE EXCEPTION 'Pick at least one creator to share'; END IF;
  SELECT count(*) INTO v_bad FROM unnest(p_roster_ids) x(id)
    WHERE NOT EXISTS (SELECT 1 FROM experience_roster r WHERE r.id = x.id AND r.experience_id = p_experience_id AND r.brand_decision IS DISTINCT FROM 'rejected');
  IF v_bad > 0 THEN RAISE EXCEPTION 'Only creators on this roster (and not rejected) can be shared'; END IF;
  UPDATE experience_roster SET shared_with_brand_at = now(), shared_by = my_user_id(), updated_at = now()
    WHERE experience_id = p_experience_id AND id = ANY (p_roster_ids) AND shared_with_brand_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM experience_console_audit('experience.roster_shared', 'experiences', p_experience_id,
    jsonb_build_object('roster_ids', to_jsonb(p_roster_ids), 'newly_shared', v_n));
  RETURN v_n;
END;
$function$;

-- The brand accepts several shared creators at once (accept only). All or
-- nothing: every row is checked (theirs, shared, not locked, not rejected, the
-- answer the page showed) before any is written.
CREATE OR REPLACE FUNCTION public.brand_experience_roster_accept_many(p_experience_id uuid, p_items jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_status text; it jsonb; r record; v_n int := 0;
BEGIN
  PERFORM brand_experience_require(p_experience_id, false);
  IF p_items IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'Pick the creators to accept'; END IF;
  IF jsonb_array_length(p_items) > 200 THEN RAISE EXCEPTION 'Too many at once'; END IF;
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = p_experience_id FOR UPDATE;
  IF v_status IS NULL OR v_status NOT IN ('rostering', 'confirmed') THEN RAISE EXCEPTION 'The roster is closed'; END IF;
  FOR it IN SELECT x FROM jsonb_array_elements(p_items) x LOOP
    IF (it ->> 'roster_id') IS NULL OR (it ->> 'expected') IS NULL THEN RAISE EXCEPTION 'Refresh the page and try again'; END IF;
    SELECT rr.id, rr.locked, rr.brand_decision, rr.shared_with_brand_at INTO r
      FROM experience_roster rr WHERE rr.id = (it ->> 'roster_id')::uuid AND rr.experience_id = p_experience_id FOR UPDATE;
    IF r.id IS NULL OR r.shared_with_brand_at IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE = '42501'; END IF;
    IF r.locked IS NOT FALSE THEN RAISE EXCEPTION 'A creator in that selection is already confirmed'; END IF;
    IF r.brand_decision = 'rejected' THEN RAISE EXCEPTION 'A creator in that selection was rejected; that is final'; END IF;
    IF r.brand_decision IS DISTINCT FROM (it ->> 'expected') THEN RAISE EXCEPTION 'This changed since you opened the page. Refresh to see the latest'; END IF;
  END LOOP;
  FOR it IN SELECT x FROM jsonb_array_elements(p_items) x LOOP
    UPDATE experience_roster SET brand_decision = 'accepted', decision_channel = 'portal', decided_at = now(), updated_at = now()
      WHERE id = (it ->> 'roster_id')::uuid AND brand_decision IS DISTINCT FROM 'accepted';
    IF FOUND THEN
      v_n := v_n + 1;
      PERFORM experience_console_audit('experience.roster_decision_by_brand', 'experience_roster', (it ->> 'roster_id')::uuid,
        jsonb_build_object('experience_id', p_experience_id, 'decision_before', it ->> 'expected', 'decision_after', 'accepted', 'channel', 'portal', 'bulk', true));
    END IF;
  END LOOP;
  RETURN v_n;
END;
$function$;

DROP FUNCTION IF EXISTS experience_console_roster(uuid);

CREATE OR REPLACE FUNCTION public.experience_console_roster(p_experience_id uuid)
 RETURNS TABLE(id uuid, creator_id uuid, full_name text, handle text, profile_photo_url text, added_by text, brand_decision text, decision_channel text, decided_at timestamp with time zone, locked boolean, locked_at timestamp with time zone, planned_deliverables jsonb, note text, created_at timestamp with time zone, shared_with_brand_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM experience_console_require();
  RETURN QUERY
    SELECT r.id, r.creator_id, c.full_name, c.handle, c.profile_photo_url,
           r.added_by, r.brand_decision, r.decision_channel, r.decided_at,
           r.locked, r.locked_at, r.planned_deliverables, n.note, r.created_at, r.shared_with_brand_at
    FROM experience_roster r
    JOIN creators c ON c.id = r.creator_id
    LEFT JOIN experience_roster_notes n ON n.roster_id = r.id
    WHERE r.experience_id = p_experience_id
    ORDER BY r.locked DESC, r.created_at;
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_roster_add(p_experience_id uuid, p_creator_ids uuid[], p_added_by text, p_channel text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  e_id uuid; e_status text; e_plan_per_creator jsonb; e_request jsonb;
  v_template jsonb;
  v_added int := 0;
  v_id uuid;
  v_creator uuid;
BEGIN
  PERFORM experience_console_require();
  IF p_channel = 'portal' THEN RAISE EXCEPTION '"On Guapd" is recorded only when the brand acts in the portal themselves'; END IF;
  SELECT e.id, e.status, e.agreed_plan -> 'per_creator', e.request_deliverables
    INTO e_id, e_status, e_plan_per_creator, e_request
    FROM experiences e WHERE e.id = p_experience_id FOR UPDATE;
  IF e_id IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  IF e_status IS NULL OR e_status NOT IN ('rostering', 'confirmed') THEN RAISE EXCEPTION 'Creators are added once the price is agreed, and before the shoot is scheduled'; END IF;
  IF p_added_by IS NULL OR p_added_by NOT IN ('guapd', 'brand') THEN RAISE EXCEPTION 'A creator is added by Guapd or suggested by the brand'; END IF;
  IF p_added_by = 'brand' AND p_channel IS NULL THEN RAISE EXCEPTION 'Say how the brand suggested them'; END IF;
  IF coalesce(array_length(p_creator_ids, 1), 0) = 0 THEN RAISE EXCEPTION 'Pick at least one creator'; END IF;
  v_template := coalesce(e_plan_per_creator, e_request, '[]'::jsonb);

  FOREACH v_creator IN ARRAY p_creator_ids LOOP
    IF NOT EXISTS (SELECT 1 FROM creators c WHERE c.id = v_creator AND c.is_bookable AND NOT c.is_guapd) THEN
      RAISE EXCEPTION 'Only bookable creators can be added';
    END IF;
    -- 0548: Guapd's own picks start INTERNAL (a shortlist); the brand's own
    -- suggestions are shared from the start (the brand named them).
    INSERT INTO experience_roster (experience_id, creator_id, added_by, brand_decision, planned_deliverables, decision_channel, added_by_user, shared_with_brand_at, shared_by)
    VALUES (p_experience_id, v_creator, p_added_by, 'pending', v_template, CASE WHEN p_added_by = 'brand' THEN p_channel END, my_user_id(),
            CASE WHEN p_added_by = 'brand' THEN now() END, CASE WHEN p_added_by = 'brand' THEN my_user_id() END)
    ON CONFLICT (experience_id, creator_id) DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN
      v_added := v_added + 1;
      PERFORM experience_console_audit('experience.roster_added', 'experience_roster', v_id,
        jsonb_build_object('experience_id', p_experience_id, 'creator_id', v_creator, 'added_by', p_added_by,
          'channel', p_channel, 'after_lock', e_status = 'confirmed'));
    END IF;
    v_id := NULL;
  END LOOP;
  RETURN v_added;
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_roster_decide(p_roster_id uuid, p_decision text, p_channel text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r_id uuid; r_experience uuid; r_creator uuid; r_locked boolean; r_decision text;
BEGIN
  PERFORM experience_console_require();
  IF p_channel = 'portal' THEN RAISE EXCEPTION '"On Guapd" is recorded only when the brand acts in the portal themselves'; END IF;
  SELECT r.id, r.experience_id, r.creator_id, r.locked, r.brand_decision
    INTO r_id, r_experience, r_creator, r_locked, r_decision
    FROM experience_roster r WHERE r.id = p_roster_id FOR UPDATE;
  IF r_id IS NULL THEN RAISE EXCEPTION 'Roster entry not found'; END IF;
  IF r_locked IS NOT FALSE THEN RAISE EXCEPTION 'This creator is locked on the roster'; END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('accepted', 'rejected', 'on_hold', 'pending') THEN RAISE EXCEPTION 'Unknown decision'; END IF;
  -- 0548: reject is final for this creator on this roster; on hold is re-decidable.
  IF r_decision = 'rejected' THEN RAISE EXCEPTION 'This creator was rejected; that is final on this roster'; END IF;
  IF p_decision <> 'pending' AND p_channel IS NULL THEN RAISE EXCEPTION 'Say how the brand told us'; END IF;
  UPDATE experience_roster SET brand_decision = p_decision,
    decision_channel = CASE WHEN p_decision = 'pending' THEN NULL ELSE p_channel END,
    decided_at = CASE WHEN p_decision = 'pending' THEN NULL ELSE now() END, updated_at = now(),
    -- Recording the brand's answer means the brand saw this creator (off Guapd): shared.
    shared_with_brand_at = CASE WHEN p_decision <> 'pending' THEN coalesce(shared_with_brand_at, now()) ELSE shared_with_brand_at END,
    shared_by = CASE WHEN p_decision <> 'pending' AND shared_with_brand_at IS NULL THEN my_user_id() ELSE shared_by END
    WHERE id = p_roster_id;
  PERFORM experience_console_audit('experience.roster_decision_recorded', 'experience_roster', p_roster_id,
    jsonb_build_object('experience_id', r_experience, 'creator_id', r_creator,
      'decision_before', r_decision, 'decision_after', p_decision, 'channel', p_channel));
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_roster_lock(p_experience_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  e_id uuid; e_status text;
  v_rec jsonb;
  v_locked int;
BEGIN
  PERFORM experience_console_require();
  SELECT e.id, e.status INTO e_id, e_status FROM experiences e WHERE e.id = p_experience_id FOR UPDATE;
  IF e_id IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  IF e_status IS NULL OR e_status NOT IN ('rostering', 'confirmed') THEN RAISE EXCEPTION 'The roster can only be locked while it is being built'; END IF;
  -- 0548: every creator SHARED with the brand needs their answer first. An
  -- unshared shortlist stays internal and does not block; on hold does not lock.
  IF EXISTS (SELECT 1 FROM experience_roster WHERE experience_id = p_experience_id AND NOT locked AND brand_decision = 'pending' AND shared_with_brand_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Record the brand decision on every creator shared with them first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM experience_roster WHERE experience_id = p_experience_id AND NOT locked AND brand_decision = 'accepted') THEN
    RAISE EXCEPTION 'No accepted creators to lock';
  END IF;
  v_rec := experience_roster_reconcile(p_experience_id);
  IF (v_rec ->> 'ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'The roster does not add up to what the brand bought: % videos planned against % sold',
      v_rec ->> 'videos_planned', v_rec ->> 'videos_sold';
  END IF;

  UPDATE experience_roster SET locked = true, locked_at = now(), updated_at = now()
    WHERE experience_id = p_experience_id AND NOT locked AND brand_decision = 'accepted';
  GET DIAGNOSTICS v_locked = ROW_COUNT;
  IF e_status = 'rostering' THEN
    UPDATE experiences SET status = 'confirmed', updated_at = now() WHERE id = p_experience_id;
  END IF;

  PERFORM experience_console_audit('experience.roster_locked', 'experiences', p_experience_id,
    jsonb_build_object('locked_now', v_locked, 'videos_planned', v_rec -> 'videos_planned', 'videos_sold', v_rec -> 'videos_sold',
      'status_before', e_status, 'status_after', CASE WHEN e_status = 'rostering' THEN 'confirmed' ELSE e_status END));
  RETURN v_locked;
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_roster_reconcile(p_experience_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan jsonb;
  v_sold int;
  v_plan_videos int;
  v_planned_videos int;
  v_lines jsonb;
  v_ok boolean;
  v_creators int;
BEGIN
  SELECT agreed_plan INTO v_plan FROM experiences WHERE id = p_experience_id;
  IF v_plan IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_agreed_plan');
  END IF;
  v_sold := (v_plan ->> 'videos_sold')::int;
  v_plan_videos := (v_plan ->> 'plan_videos')::int;

  WITH planned AS (
    SELECT d ->> 'type' AS type, sum((d ->> 'count')::int)::int AS n
    FROM experience_roster r, jsonb_array_elements(r.planned_deliverables) d
    -- 0548: in play = accepted, or shared and awaiting the brand. An internal
    -- shortlist, on-hold and rejected creators are not counted.
    WHERE r.experience_id = p_experience_id AND (r.brand_decision = 'accepted' OR (r.brand_decision = 'pending' AND r.shared_with_brand_at IS NOT NULL))
      AND (d ->> 'count') ~ '^[0-9]+$'
    GROUP BY d ->> 'type'
  ), target AS (
    SELECT t ->> 'type' AS type, (t ->> 'total')::int AS n
    FROM jsonb_array_elements(coalesce(v_plan -> 'totals', '[]'::jsonb)) t
  ), lines AS (
    SELECT coalesce(t.type, p.type) AS type, coalesce(t.n, 0) AS target, coalesce(p.n, 0) AS planned,
           coalesce(t.type, p.type) IN ('UGC video', 'Reel') AS is_video
    FROM target t FULL JOIN planned p ON p.type = t.type
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('type', type, 'target', target, 'planned', planned, 'is_video', is_video) ORDER BY type), '[]'::jsonb),
         coalesce(sum(planned) FILTER (WHERE is_video), 0)::int,
         bool_and(CASE WHEN is_video THEN (coalesce(v_sold <> v_plan_videos, false) OR target = planned) ELSE target = planned END)
    INTO v_lines, v_planned_videos, v_ok
  FROM lines;

  SELECT count(*) INTO v_creators FROM experience_roster
    WHERE experience_id = p_experience_id AND (brand_decision = 'accepted' OR (brand_decision = 'pending' AND shared_with_brand_at IS NOT NULL));

  RETURN jsonb_build_object(
    'ok', coalesce(coalesce(v_ok, true) AND v_planned_videos = v_sold, false),
    'videos_sold', v_sold, 'videos_planned', v_planned_videos,
    'creators_counted', v_creators, 'creators_planned', (v_plan ->> 'creator_count')::int,
    'lines', v_lines);
END;
$function$;

CREATE OR REPLACE FUNCTION public.brand_experience_roster(p_experience_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text; v_rows jsonb;
BEGIN
  PERFORM brand_experience_require(p_experience_id, false);
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = p_experience_id;
  IF v_status IN ('requested', 'cancelled') THEN
    RETURN jsonb_build_object('can_decide', false, 'creators', '[]'::jsonb);
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'roster_id', r.id, 'full_name', c.full_name, 'handle', experience_clean_handle(c.handle),
      'profile_url', CASE WHEN experience_clean_handle(c.handle) IS NOT NULL THEN 'https://instagram.com/' || experience_clean_handle(c.handle) END,
      'photo_url', c.profile_photo_url, 'planned_deliverables', r.planned_deliverables,
      'added_by', r.added_by, 'decision', r.brand_decision, 'decided_at', r.decided_at,
      'decided_on_guapd', r.decision_channel = 'portal', 'locked', r.locked
    ) ORDER BY r.locked DESC, r.created_at), '[]'::jsonb)
    INTO v_rows
    FROM experience_roster r JOIN creators c ON c.id = r.creator_id
    -- 0548: only creators Guapd SHARED with the brand. The internal shortlist
    -- is never in any brand read.
    WHERE r.experience_id = p_experience_id AND r.shared_with_brand_at IS NOT NULL;
  RETURN jsonb_build_object('can_decide', v_status IN ('rostering', 'confirmed'), 'creators', v_rows);
END;
$function$;

CREATE OR REPLACE FUNCTION public.brand_experience_roster_decide(p_roster_id uuid, p_decision text, p_expected text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exp uuid; v_status text; r_locked boolean; r_decision text; r_creator uuid; r_shared timestamptz;
BEGIN
  SELECT r.experience_id INTO v_exp FROM experience_roster r WHERE r.id = p_roster_id;
  PERFORM brand_experience_require(v_exp, false);
  IF p_decision IS NULL OR p_decision NOT IN ('accepted', 'rejected', 'on_hold') THEN RAISE EXCEPTION 'Accept, reject or put on hold'; END IF;
  IF p_expected IS NULL THEN RAISE EXCEPTION 'Refresh the page and try again'; END IF;
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT r.locked, r.brand_decision, r.creator_id, r.shared_with_brand_at INTO r_locked, r_decision, r_creator, r_shared FROM experience_roster r WHERE r.id = p_roster_id FOR UPDATE;
  -- An unshared creator does not exist for the brand: the same answer as a wrong id.
  IF r_shared IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE = '42501'; END IF;
  IF v_status IS NULL OR v_status NOT IN ('rostering', 'confirmed') THEN RAISE EXCEPTION 'The roster is closed'; END IF;
  IF r_locked IS NOT FALSE THEN RAISE EXCEPTION 'This creator is confirmed on the roster and can no longer change'; END IF;
  IF r_decision = 'rejected' THEN RAISE EXCEPTION 'This creator was rejected; that is final'; END IF;
  IF r_decision IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'This changed since you opened the page. Refresh to see the latest'; END IF;
  UPDATE experience_roster SET brand_decision = p_decision, decision_channel = 'portal', decided_at = now(), updated_at = now()
    WHERE id = p_roster_id;
  PERFORM experience_console_audit('experience.roster_decision_by_brand', 'experience_roster', p_roster_id,
    jsonb_build_object('experience_id', v_exp, 'creator_id', r_creator, 'decision_before', r_decision, 'decision_after', p_decision, 'channel', 'portal'));
END;
$function$;

CREATE OR REPLACE FUNCTION brand_experiences() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
  -- Who may request: a member of an approved, real brand (their first brand, as my_brand_id).
  v_brand := my_brand_id();
  SELECT (b.brand_status = 'approved' AND b.is_guapd IS FALSE), bm.is_admin INTO v_can, v_admin
    FROM brands b JOIN brand_members bm ON bm.brand_id = b.id AND bm.user_id = v_user WHERE b.id = v_brand;
  RETURN jsonb_build_object('experiences', v_rows, 'can_request', v_can IS TRUE);
END;
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'experience_console_roster_share(uuid, uuid[])', 'brand_experience_roster_accept_many(uuid, jsonb)',
    'experience_console_roster(uuid)', 'experience_console_roster_add(uuid, uuid[], text, text)',
    'experience_console_roster_decide(uuid, text, text)', 'experience_console_roster_lock(uuid)',
    'brand_experience_roster(uuid)', 'brand_experience_roster_decide(uuid, text, text)', 'brand_experiences()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
  REVOKE EXECUTE ON FUNCTION experience_roster_reconcile(uuid) FROM PUBLIC, anon, authenticated, service_role;
END $$;

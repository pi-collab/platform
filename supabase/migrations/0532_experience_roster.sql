-- Phase 3, stage 3a: the Experience roster in the staff console. RUN BY HAND,
-- as one block (the piece labels are SQL comments). Verify with
-- docs/test-cases.md §102.
--
-- Every function checks the CALLER's operational access first and writes its
-- ops_events row in the same transaction (helpers from 0530). No creator rate,
-- payout, cost or margin is stored, read or returned here: the roster is names,
-- each creator's planned deliverables, the brand's decision, and Guapd's notes.
--
-- Rules, enforced here:
--   * creators can be added while the Experience is Building roster or
--     Confirmed (add-after-lock). Only bookable creators; never the house
--     account. Each starts from the agreed per-creator plan.
--   * the brand's accept/reject is recorded by staff, with the channel.
--   * a locked entry cannot be changed, re-decided or removed.
--   * locking needs every unlocked, non-rejected creator to be accepted, and the
--     combined plan to reconcile to what was sold (experience_roster_reconcile).
--     The first lock moves the Experience Building roster -> Confirmed.
--   * reconciliation is against the agreed TOTAL, never per-creator uniformity.
--
-- The per-creator note lives in experience_roster_notes, which no session can
-- read or write: only these definer functions. The brand reads its roster only
-- through the 0523 column grant, which does not include any column added here.

-- Piece 1: columns and the notes table
ALTER TABLE experience_roster
  ADD COLUMN IF NOT EXISTS planned_deliverables jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS decision_channel     text,
  ADD COLUMN IF NOT EXISTS locked_at            timestamptz,
  ADD COLUMN IF NOT EXISTS added_by_user        uuid REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE experience_roster DROP CONSTRAINT IF EXISTS experience_roster_shape;
ALTER TABLE experience_roster ADD CONSTRAINT experience_roster_shape CHECK (
  jsonb_typeof(planned_deliverables) = 'array'
  AND (decision_channel IS NULL OR decision_channel IN ('portal', 'whatsapp', 'email', 'call', 'in_person'))
  AND (NOT locked OR brand_decision = 'accepted')
);

CREATE TABLE IF NOT EXISTS experience_roster_notes (
  roster_id   uuid PRIMARY KEY REFERENCES experience_roster (id) ON DELETE CASCADE,
  note        text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES users (id) ON DELETE SET NULL
);
ALTER TABLE experience_roster_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON experience_roster_notes FROM anon, authenticated;

-- Piece 2: reads (creator picker, roster, reconciliation)
CREATE OR REPLACE FUNCTION experience_console_creators()
RETURNS TABLE (id uuid, full_name text, handle text, profile_photo_url text, niches text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM experience_console_require();
  RETURN QUERY
    SELECT c.id, c.full_name, c.handle, c.profile_photo_url, c.niches
    FROM creators c
    WHERE c.is_bookable AND NOT c.is_guapd
    ORDER BY lower(c.full_name);
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_roster(p_experience_id uuid)
RETURNS TABLE (id uuid, creator_id uuid, full_name text, handle text, profile_photo_url text,
               added_by text, brand_decision text, decision_channel text, decided_at timestamptz,
               locked boolean, locked_at timestamptz, planned_deliverables jsonb, note text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM experience_console_require();
  RETURN QUERY
    SELECT r.id, r.creator_id, c.full_name, c.handle, c.profile_photo_url,
           r.added_by, r.brand_decision, r.decision_channel, r.decided_at,
           r.locked, r.locked_at, r.planned_deliverables, n.note, r.created_at
    FROM experience_roster r
    JOIN creators c ON c.id = r.creator_id
    LEFT JOIN experience_roster_notes n ON n.roster_id = r.id
    WHERE r.experience_id = p_experience_id
    ORDER BY r.locked DESC, r.created_at;
END;
$$;

-- The combined plan of every creator not rejected by the brand, against the
-- agreed plan. Video types are compared as one number against videos_sold; if
-- the brand bought exactly the planned videos, each video type must match too.
-- Non-video types (stories, posts, photo sets) must match per type.
CREATE OR REPLACE FUNCTION experience_roster_reconcile(p_experience_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
    WHERE r.experience_id = p_experience_id AND r.brand_decision <> 'rejected' AND (d ->> 'count') ~ '^[0-9]+$'
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
         bool_and(CASE WHEN is_video THEN (v_sold <> v_plan_videos OR target = planned) ELSE target = planned END)
    INTO v_lines, v_planned_videos, v_ok
  FROM lines;

  SELECT count(*) INTO v_creators FROM experience_roster
    WHERE experience_id = p_experience_id AND brand_decision <> 'rejected';

  RETURN jsonb_build_object(
    'ok', coalesce(v_ok, true) AND v_planned_videos = v_sold,
    'videos_sold', v_sold, 'videos_planned', v_planned_videos,
    'creators_counted', v_creators, 'creators_planned', (v_plan ->> 'creator_count')::int,
    'lines', v_lines);
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_reconcile(p_experience_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM experience_console_require();
  RETURN experience_roster_reconcile(p_experience_id);
END;
$$;

-- Piece 3: add creators (staff, or a brand suggestion recorded by staff)
CREATE OR REPLACE FUNCTION experience_console_roster_add(p_experience_id uuid, p_creator_ids uuid[], p_added_by text, p_channel text)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  e experiences%ROWTYPE;
  v_template jsonb;
  v_added int := 0;
  v_id uuid;
  v_creator uuid;
BEGIN
  PERFORM experience_console_require();
  SELECT * INTO e FROM experiences WHERE id = p_experience_id FOR UPDATE;
  IF e.id IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  IF e.status NOT IN ('rostering', 'confirmed') THEN RAISE EXCEPTION 'Creators are added once the price is agreed, and before the shoot is scheduled'; END IF;
  IF p_added_by NOT IN ('guapd', 'brand') THEN RAISE EXCEPTION 'A creator is added by Guapd or suggested by the brand'; END IF;
  IF p_added_by = 'brand' AND p_channel IS NULL THEN RAISE EXCEPTION 'Say how the brand suggested them'; END IF;
  IF coalesce(array_length(p_creator_ids, 1), 0) = 0 THEN RAISE EXCEPTION 'Pick at least one creator'; END IF;
  v_template := coalesce(e.agreed_plan -> 'per_creator', e.request_deliverables, '[]'::jsonb);

  FOREACH v_creator IN ARRAY p_creator_ids LOOP
    IF NOT EXISTS (SELECT 1 FROM creators c WHERE c.id = v_creator AND c.is_bookable AND NOT c.is_guapd) THEN
      RAISE EXCEPTION 'Only bookable creators can be added';
    END IF;
    INSERT INTO experience_roster (experience_id, creator_id, added_by, brand_decision, planned_deliverables, decision_channel, added_by_user)
    VALUES (p_experience_id, v_creator, p_added_by, 'pending', v_template, CASE WHEN p_added_by = 'brand' THEN p_channel END, my_user_id())
    ON CONFLICT (experience_id, creator_id) DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN
      v_added := v_added + 1;
      PERFORM experience_console_audit('experience.roster_added', 'experience_roster', v_id,
        jsonb_build_object('experience_id', p_experience_id, 'creator_id', v_creator, 'added_by', p_added_by,
          'channel', p_channel, 'after_lock', e.status = 'confirmed'));
    END IF;
    v_id := NULL;
  END LOOP;
  RETURN v_added;
END;
$$;

-- Piece 4: record the brand decision, adjust a plan, note, remove
CREATE OR REPLACE FUNCTION experience_console_roster_decide(p_roster_id uuid, p_decision text, p_channel text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r experience_roster%ROWTYPE;
BEGIN
  PERFORM experience_console_require();
  SELECT * INTO r FROM experience_roster WHERE id = p_roster_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Roster entry not found'; END IF;
  IF r.locked THEN RAISE EXCEPTION 'This creator is locked on the roster'; END IF;
  IF p_decision NOT IN ('accepted', 'rejected', 'pending') THEN RAISE EXCEPTION 'Unknown decision'; END IF;
  IF p_decision <> 'pending' AND p_channel IS NULL THEN RAISE EXCEPTION 'Say how the brand told us'; END IF;
  UPDATE experience_roster SET brand_decision = p_decision,
    decision_channel = CASE WHEN p_decision = 'pending' THEN NULL ELSE p_channel END,
    decided_at = CASE WHEN p_decision = 'pending' THEN NULL ELSE now() END, updated_at = now()
    WHERE id = p_roster_id;
  PERFORM experience_console_audit('experience.roster_decision_recorded', 'experience_roster', p_roster_id,
    jsonb_build_object('experience_id', r.experience_id, 'creator_id', r.creator_id,
      'decision_before', r.brand_decision, 'decision_after', p_decision, 'channel', p_channel));
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_roster_plan(p_roster_id uuid, p_deliverables jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r experience_roster%ROWTYPE;
  d jsonb;
BEGIN
  PERFORM experience_console_require();
  SELECT * INTO r FROM experience_roster WHERE id = p_roster_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Roster entry not found'; END IF;
  IF r.locked THEN RAISE EXCEPTION 'This creator is locked on the roster'; END IF;
  IF jsonb_typeof(coalesce(p_deliverables, 'null'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'Deliverables must be a list'; END IF;
  FOR d IN SELECT * FROM jsonb_array_elements(p_deliverables) LOOP
    IF d ->> 'type' NOT IN ('UGC video', 'Reel', 'Story', 'Static post', 'Photo set') OR NOT ((d ->> 'count') ~ '^[0-9]+$') THEN
      RAISE EXCEPTION 'Each deliverable needs a known type and a whole-number count';
    END IF;
  END LOOP;
  UPDATE experience_roster SET planned_deliverables = p_deliverables, updated_at = now() WHERE id = p_roster_id;
  PERFORM experience_console_audit('experience.roster_plan_changed', 'experience_roster', p_roster_id,
    jsonb_build_object('experience_id', r.experience_id, 'creator_id', r.creator_id,
      'before', r.planned_deliverables, 'after', p_deliverables));
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_roster_note(p_roster_id uuid, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r experience_roster%ROWTYPE;
  v text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  PERFORM experience_console_require();
  SELECT * INTO r FROM experience_roster WHERE id = p_roster_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Roster entry not found'; END IF;
  IF v IS NULL THEN
    DELETE FROM experience_roster_notes WHERE roster_id = p_roster_id;
  ELSE
    INSERT INTO experience_roster_notes (roster_id, note, updated_at, updated_by)
    VALUES (p_roster_id, left(v, 4000), now(), my_user_id())
    ON CONFLICT (roster_id) DO UPDATE SET note = EXCLUDED.note, updated_at = now(), updated_by = EXCLUDED.updated_by;
  END IF;
  PERFORM experience_console_audit('experience.roster_note_set', 'experience_roster', p_roster_id,
    jsonb_build_object('experience_id', r.experience_id, 'creator_id', r.creator_id, 'note_length', coalesce(length(v), 0)));
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_roster_remove(p_roster_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r experience_roster%ROWTYPE;
BEGIN
  PERFORM experience_console_require();
  SELECT * INTO r FROM experience_roster WHERE id = p_roster_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Roster entry not found'; END IF;
  IF r.locked THEN RAISE EXCEPTION 'A locked creator cannot be removed'; END IF;
  DELETE FROM experience_roster WHERE id = p_roster_id;
  PERFORM experience_console_audit('experience.roster_removed', 'experience_roster', p_roster_id,
    jsonb_build_object('experience_id', r.experience_id, 'creator_id', r.creator_id, 'decision', r.brand_decision));
END;
$$;

-- Piece 5: lock the roster
CREATE OR REPLACE FUNCTION experience_console_roster_lock(p_experience_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  e experiences%ROWTYPE;
  v_rec jsonb;
  v_locked int;
BEGIN
  PERFORM experience_console_require();
  SELECT * INTO e FROM experiences WHERE id = p_experience_id FOR UPDATE;
  IF e.id IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  IF e.status NOT IN ('rostering', 'confirmed') THEN RAISE EXCEPTION 'The roster can only be locked while it is being built'; END IF;
  IF EXISTS (SELECT 1 FROM experience_roster WHERE experience_id = p_experience_id AND NOT locked AND brand_decision = 'pending') THEN
    RAISE EXCEPTION 'Record the brand decision on every creator first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM experience_roster WHERE experience_id = p_experience_id AND NOT locked AND brand_decision = 'accepted') THEN
    RAISE EXCEPTION 'No accepted creators to lock';
  END IF;
  v_rec := experience_roster_reconcile(p_experience_id);
  IF NOT (v_rec ->> 'ok')::boolean THEN
    RAISE EXCEPTION 'The roster does not add up to what the brand bought: % videos planned against % sold',
      v_rec ->> 'videos_planned', v_rec ->> 'videos_sold';
  END IF;

  UPDATE experience_roster SET locked = true, locked_at = now(), updated_at = now()
    WHERE experience_id = p_experience_id AND NOT locked AND brand_decision = 'accepted';
  GET DIAGNOSTICS v_locked = ROW_COUNT;
  IF e.status = 'rostering' THEN
    UPDATE experiences SET status = 'confirmed', updated_at = now() WHERE id = p_experience_id;
  END IF;

  PERFORM experience_console_audit('experience.roster_locked', 'experiences', p_experience_id,
    jsonb_build_object('locked_now', v_locked, 'videos_planned', v_rec -> 'videos_planned', 'videos_sold', v_rec -> 'videos_sold',
      'status_before', e.status, 'status_after', CASE WHEN e.status = 'rostering' THEN 'confirmed' ELSE e.status END));
  RETURN v_locked;
END;
$$;

-- Piece 6: who may call what
REVOKE EXECUTE ON FUNCTION experience_roster_reconcile(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION experience_console_creators() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_roster(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_reconcile(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_roster_add(uuid, uuid[], text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_roster_decide(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_roster_plan(uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_roster_note(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_roster_remove(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_roster_lock(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION experience_console_creators() TO authenticated;
GRANT EXECUTE ON FUNCTION experience_console_roster(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION experience_console_reconcile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION experience_console_roster_add(uuid, uuid[], text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION experience_console_roster_decide(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION experience_console_roster_plan(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION experience_console_roster_note(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION experience_console_roster_remove(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION experience_console_roster_lock(uuid) TO authenticated;

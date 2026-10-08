-- 0538: Experiences, the rest of Phase 3: the shoot, deliverables, and the
-- brand seeing what Guapd shares with it. RUN BY HAND on staging; verify with
-- docs/test-cases.md §105.
--
-- Decided (Palak, 2026-10-08):
--   1. WHO PROVIDES deliverables is the template's deliverables_owner,
--      snapshotted onto each leg. Both paths exist; the template decides:
--        guapd   → staff attach the content (Kiro, the approved template,
--                  unchanged); the creator's work ends at shoot done.
--        creator → the creator submits on their deal page; their work ends
--                  when Guapd has approved every deliverable on their leg.
--      Payment ELIGIBILITY only (experience_leg_work_complete). Nothing is
--      paid in this stage; Phase 4 reads it.
--   2. The brand sees deliverables ONLY after Guapd releases them, through
--      brand_experience_deliverables: released items only, the creator's
--      name only, never versions, notes, who submitted, handles, ids or money.
--      experience_deliverable_releases has no user access at all.
--   3. The brand's decision on a released item is RECORDED BY STAFF with the
--      channel (as the roster). Brand self-service is Phase 6.
--   4. A creator who "didn't shoot" leaves the counted P&L legs.
--
-- The shoot: confirmed → shoot_scheduled (staff confirm) → shoot_done (auto,
-- once every accepted creator has an outcome and at least one shot) →
-- delivering (auto, on the first release) → complete (3c, unchanged).
--
-- experience_deliverables_progress is the readiness check the later two-party
-- completion piece will gate Complete on; it does NOT gate Complete here.
--
-- Also: the seven 3a functions (create + six roster actions) rewritten
-- without SELECT *. No SELECT * anywhere below.
--
-- Every staff function needs OPERATIONAL access (experience_console_require);
-- none reads or writes a price, rate, net or margin, and no audit row here
-- carries one. The house brand has no members, so staff are the only actors
-- on a creator leg besides its creator.

-- ── A. Schema ──────────────────────────────────────────────────────────────
-- The shoot outcome, per creator leg, on the roster row (outside the brand's
-- 0523 column grant, so no session reads it).
ALTER TABLE experience_roster
  ADD COLUMN IF NOT EXISTS leg_shoot_outcome        text,
  ADD COLUMN IF NOT EXISTS leg_shoot_outcome_at     timestamptz,
  ADD COLUMN IF NOT EXISTS leg_shoot_outcome_by     uuid REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS leg_shoot_outcome_reason text;
ALTER TABLE experience_roster DROP CONSTRAINT IF EXISTS er_shoot_outcome_shape;
-- Every clause is TRUE/FALSE, never NULL (a NULL CHECK passes: the 0528 trap).
ALTER TABLE experience_roster ADD CONSTRAINT er_shoot_outcome_shape CHECK (
  (leg_shoot_outcome IS NULL OR leg_shoot_outcome IN ('done', 'did_not_shoot'))
  AND ((leg_shoot_outcome IS NULL) = (leg_shoot_outcome_at IS NULL))
  AND (leg_shoot_outcome IS NULL OR leg_deal_id IS NOT NULL)
  AND (leg_shoot_outcome IS DISTINCT FROM 'did_not_shoot'
       OR length(btrim(coalesce(leg_shoot_outcome_reason, ''))) BETWEEN 3 AND 300)
);

-- Who put the current version on an item. Staff-facing only: the brand never
-- reads creator-leg items, and its release view does not carry this.
ALTER TABLE deal_deliverable_items
  ADD COLUMN IF NOT EXISTS submitted_via text,
  ADD COLUMN IF NOT EXISTS submitted_by  uuid REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE deal_deliverable_items DROP CONSTRAINT IF EXISTS ddi_submitted_via_check;
ALTER TABLE deal_deliverable_items ADD CONSTRAINT ddi_submitted_via_check
  CHECK (submitted_via IS NULL OR submitted_via IN ('creator', 'guapd'));

-- Guapd's review notes on its OWN content (Guapd-provides mode). A creator
-- reads their own leg's items, so these never go on revision_note there. In
-- creator-submit mode the note is for the creator and goes on revision_note.
CREATE TABLE IF NOT EXISTS experience_item_staff_notes (
  item_id    uuid PRIMARY KEY REFERENCES deal_deliverable_items (id) ON DELETE CASCADE,
  note       text NOT NULL CHECK (length(note) BETWEEN 1 AND 1000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users (id) ON DELETE SET NULL
);
ALTER TABLE experience_item_staff_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON experience_item_staff_notes FROM anon, authenticated;

-- What the brand has been given. A release SNAPSHOTS the item's version and
-- content, so a later resubmission never changes what the brand sees until
-- Guapd releases the new version (which supersedes this one).
CREATE TABLE IF NOT EXISTS experience_deliverable_releases (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id          uuid NOT NULL REFERENCES experiences (id) ON DELETE CASCADE,
  deal_id                uuid NOT NULL REFERENCES deals (id) ON DELETE CASCADE,
  item_id                uuid NOT NULL REFERENCES deal_deliverable_items (id) ON DELETE CASCADE,
  item_version           int  NOT NULL CHECK (item_version >= 1),
  label                  text NOT NULL,
  external_url           text,
  storage_path           text,
  file_name              text,
  status                 text NOT NULL DEFAULT 'shared' CHECK (status IN ('shared', 'withdrawn', 'superseded')),
  released_at            timestamptz NOT NULL DEFAULT now(),
  released_by            uuid REFERENCES users (id) ON DELETE SET NULL,
  withdrawn_at           timestamptz,
  withdrawn_by           uuid REFERENCES users (id) ON DELETE SET NULL,
  withdrawn_reason       text,
  superseded_at          timestamptz,
  superseded_by          uuid REFERENCES experience_deliverable_releases (id) ON DELETE SET NULL,
  brand_decision         text CHECK (brand_decision IS NULL OR brand_decision IN ('approved', 'changes_requested')),
  brand_decision_channel text,
  brand_decision_note    text,
  brand_decided_at       timestamptz,
  brand_decided_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT edr_content CHECK ((external_url IS NOT NULL) <> (storage_path IS NOT NULL)
                                AND (storage_path IS NULL OR file_name IS NOT NULL)),
  CONSTRAINT edr_withdrawn CHECK ((status = 'withdrawn') = (withdrawn_at IS NOT NULL)
                                  AND (withdrawn_at IS NULL OR length(btrim(coalesce(withdrawn_reason, ''))) BETWEEN 3 AND 300)),
  CONSTRAINT edr_superseded CHECK ((status = 'superseded') = (superseded_at IS NOT NULL)),
  CONSTRAINT edr_decision CHECK ((brand_decision IS NULL) = (brand_decided_at IS NULL)
                                 AND (brand_decision IS NULL OR (brand_decision_channel IS NOT NULL
                                      AND brand_decision_channel IN ('whatsapp', 'email', 'call', 'in_person')))
                                 AND (brand_decision_note IS NULL OR length(brand_decision_note) <= 1000)),
  -- Once the brand approved it, it stays given: no withdraw, no supersede.
  CONSTRAINT edr_approved_stays CHECK (brand_decision IS DISTINCT FROM 'approved' OR status = 'shared')
);
CREATE UNIQUE INDEX IF NOT EXISTS edr_one_live_per_item ON experience_deliverable_releases (item_id) WHERE status = 'shared';
CREATE INDEX IF NOT EXISTS edr_experience_idx ON experience_deliverable_releases (experience_id);
CREATE INDEX IF NOT EXISTS edr_deal_idx ON experience_deliverable_releases (deal_id);
COMMENT ON TABLE experience_deliverable_releases IS
  'Deliverables Guapd has given the brand on an Experience: a versioned snapshot per release. No policies and no grants: staff reach it through experience_console_* functions, the brand ONLY through brand_experience_deliverables (released items, creator name only).';
ALTER TABLE experience_deliverable_releases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON experience_deliverable_releases FROM anon, authenticated;

-- A release must be of an item on a creator leg of the same Experience.
CREATE OR REPLACE FUNCTION check_deliverable_release() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM deal_deliverable_items i JOIN deals d ON d.id = i.deal_id
    WHERE i.id = NEW.item_id AND d.id = NEW.deal_id AND d.leg_role = 'creator_leg' AND d.experience_id = NEW.experience_id
  ) THEN
    RAISE EXCEPTION 'A release is of an item on a creator leg of the same Experience';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS t_edr_check ON experience_deliverable_releases;
CREATE TRIGGER t_edr_check BEFORE INSERT OR UPDATE OF experience_id, deal_id, item_id ON experience_deliverable_releases
  FOR EACH ROW EXECUTE FUNCTION check_deliverable_release();

-- ── B. Helpers (callable by nobody) ────────────────────────────────────────
-- Who provides a leg's deliverables, from the leg's own snapshotted settings.
-- Anything but 'creator' is Guapd-provides (the approved default).
CREATE OR REPLACE FUNCTION experience_leg_owner(p_deal_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN d.settings_snapshot ->> 'deliverables_owner' = 'creator' THEN 'creator' ELSE 'guapd' END
  FROM deals d WHERE d.id = p_deal_id
$$;

-- The deliverable type of a leg item, from the label 0534 gave it ("UGC video 2").
-- Lists order items by type in scope order (videos first), then label.
CREATE OR REPLACE FUNCTION experience_item_type(p_label text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT (regexp_match(p_label, '^(UGC video|Reel|Story|Static post|Photo set)( [0-9]+)?$'))[1]
$$;

-- Has the creator done everything their leg asks? (Payment eligibility for
-- Phase 4; mirrors lib/deal-flow.ts isCreatorWorkComplete.)
--   Guapd provides, on_shoot_done:  the shoot outcome is 'done'.
--   Creator submits (or on_delivery_accepted): shoot done AND Guapd approved
--   every deliverable on the leg the creator can see.
CREATE OR REPLACE FUNCTION experience_leg_work_complete(p_deal_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text; v_trigger text; v_outcome text;
BEGIN
  SELECT d.status::text, coalesce(d.settings_snapshot ->> 'completion_trigger', 'on_shoot_done')
    INTO v_status, v_trigger FROM deals d WHERE d.id = p_deal_id AND d.leg_role = 'creator_leg';
  SELECT r.leg_shoot_outcome INTO v_outcome FROM experience_roster r WHERE r.leg_deal_id = p_deal_id;
  IF v_status IS DISTINCT FROM 'agreed' OR v_outcome IS DISTINCT FROM 'done' THEN
    RETURN false;
  END IF;
  IF experience_leg_owner(p_deal_id) = 'creator' OR v_trigger = 'on_delivery_accepted' THEN
    RETURN EXISTS (SELECT 1 FROM deal_deliverable_items i WHERE i.deal_id = p_deal_id AND i.visible_to_creator)
       AND NOT EXISTS (SELECT 1 FROM deal_deliverable_items i WHERE i.deal_id = p_deal_id AND i.visible_to_creator AND i.item_status <> 'approved');
  END IF;
  RETURN v_trigger = 'on_shoot_done';
END;
$$;

-- Advance shoot_scheduled → shoot_done once every accepted creator has an
-- outcome, none is still deciding, and at least one shot. Audited.
CREATE OR REPLACE FUNCTION experience_shoot_rollup(p_experience_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text; v_open int; v_missing int; v_done int;
BEGIN
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = p_experience_id;
  IF v_status <> 'shoot_scheduled' THEN RETURN v_status; END IF;
  SELECT count(*) FILTER (WHERE d.status = 'negotiating'),
         count(*) FILTER (WHERE d.status = 'agreed' AND r.leg_shoot_outcome IS NULL),
         count(*) FILTER (WHERE d.status = 'agreed' AND r.leg_shoot_outcome = 'done')
    INTO v_open, v_missing, v_done
    FROM experience_roster r JOIN deals d ON d.id = r.leg_deal_id
    WHERE r.experience_id = p_experience_id;
  IF v_open = 0 AND v_missing = 0 AND v_done > 0 THEN
    UPDATE experiences SET status = 'shoot_done', updated_at = now() WHERE id = p_experience_id;
    PERFORM experience_console_audit('experience.shoot_done', 'experiences', p_experience_id,
      jsonb_build_object('status_before', 'shoot_scheduled', 'status_after', 'shoot_done', 'creators_shot', v_done));
    RETURN 'shoot_done';
  END IF;
  RETURN v_status;
END;
$$;

-- What has been shared against what was sold, and whether the brand has
-- approved enough to finish. The readiness the two-party completion piece will
-- gate Complete on (not gated here). Counts LIVE releases only.
CREATE OR REPLACE FUNCTION experience_deliverables_progress(p_experience_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plan jsonb; v_sold int; v_per_type boolean;
  v_lines jsonb := '[]'::jsonb; v_gaps jsonb := '[]'::jsonb;
  v_vshared int := 0; v_vapproved int := 0;
  v_over boolean := false; v_ready boolean := true; v_waiting int;
  ln record;
BEGIN
  SELECT e.agreed_plan INTO v_plan FROM experiences e WHERE e.id = p_experience_id;
  IF v_plan IS NULL THEN
    RETURN jsonb_build_object('ready', false, 'over_shared', false, 'reason', 'no_agreed_plan', 'lines', '[]'::jsonb, 'gaps', '[]'::jsonb);
  END IF;
  v_sold := (v_plan ->> 'videos_sold')::int;
  v_per_type := v_sold = (v_plan ->> 'plan_videos')::int;

  FOR ln IN
    WITH live AS (
      SELECT experience_item_type(r.label) AS type, r.brand_decision
      FROM experience_deliverable_releases r
      WHERE r.experience_id = p_experience_id AND r.status = 'shared'
    ), got AS (
      SELECT type, count(*)::int AS shared, count(*) FILTER (WHERE brand_decision = 'approved')::int AS approved
      FROM live GROUP BY type
    ), target AS (
      SELECT t ->> 'type' AS type, (t ->> 'total')::int AS n FROM jsonb_array_elements(coalesce(v_plan -> 'totals', '[]'::jsonb)) t
    )
    SELECT coalesce(t.type, g.type) AS type, coalesce(t.n, 0) AS sold, coalesce(g.shared, 0) AS shared,
           coalesce(g.approved, 0) AS approved, coalesce(t.type, g.type) IN ('UGC video', 'Reel') AS is_video
    FROM target t FULL JOIN got g ON g.type = t.type
    ORDER BY 1
  LOOP
    v_lines := v_lines || jsonb_build_object('type', ln.type, 'sold', ln.sold, 'shared', ln.shared, 'approved', ln.approved, 'is_video', ln.is_video);
    IF ln.is_video THEN
      v_vshared := v_vshared + ln.shared; v_vapproved := v_vapproved + ln.approved;
    END IF;
    IF NOT ln.is_video OR v_per_type THEN
      IF ln.shared > ln.sold THEN v_over := true; END IF;
      IF ln.approved < ln.sold THEN
        v_ready := false;
        v_gaps := v_gaps || jsonb_build_object('type', ln.type, 'sold', ln.sold, 'approved', ln.approved);
      END IF;
    END IF;
  END LOOP;
  IF v_vshared > v_sold THEN v_over := true; END IF;
  IF v_vapproved < v_sold THEN
    v_ready := false;
    IF NOT v_per_type THEN v_gaps := v_gaps || jsonb_build_object('type', 'videos', 'sold', v_sold, 'approved', v_vapproved); END IF;
  END IF;
  SELECT count(*)::int INTO v_waiting FROM experience_deliverable_releases r
    WHERE r.experience_id = p_experience_id AND r.status = 'shared' AND r.brand_decision IS DISTINCT FROM 'approved';

  RETURN jsonb_build_object('ready', v_ready, 'over_shared', v_over, 'per_type', v_per_type,
    'videos_sold', v_sold, 'videos_shared', v_vshared, 'videos_approved', v_vapproved,
    'awaiting_brand', v_waiting, 'lines', v_lines, 'gaps', v_gaps);
END;
$$;

-- The checks every write to a leg item shares. Locks the item. p_who:
--   'guapd'   staff attaching (Guapd-provides legs only)
--   'creator' the creator submitting (creator-submit legs only, their own)
--   'review'  staff reviewing (either mode)
CREATE OR REPLACE FUNCTION experience_item_gate(p_item_id uuid, p_who text)
RETURNS TABLE (deal_id uuid, experience_id uuid, item_status text, item_version int, next_version int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_deal uuid; v_exp uuid; v_creator uuid; v_visible boolean; v_istatus text; v_ver int;
  v_dstatus text; v_estatus text; v_outcome text; v_owner text;
BEGIN
  SELECT i.deal_id, i.visible_to_creator, i.item_status, i.version INTO v_deal, v_visible, v_istatus, v_ver
    FROM deal_deliverable_items i WHERE i.id = p_item_id;
  SELECT d.experience_id, d.creator_id, d.status::text INTO v_exp, v_creator, v_dstatus
    FROM deals d WHERE d.id = v_deal AND d.leg_role = 'creator_leg';
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE = '42501'; END IF;
  IF p_who = 'creator' AND (my_creator_id() IS NULL OR v_creator IS DISTINCT FROM my_creator_id() OR NOT v_visible) THEN
    RAISE EXCEPTION 'Not found' USING ERRCODE = '42501';
  END IF;
  -- Experience first, then the item: every write serialises on the Experience.
  SELECT e.status INTO v_estatus FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  PERFORM 1 FROM deal_deliverable_items i WHERE i.id = p_item_id FOR UPDATE;
  SELECT i.item_status, i.version INTO v_istatus, v_ver FROM deal_deliverable_items i WHERE i.id = p_item_id;

  IF v_estatus = 'complete' THEN RAISE EXCEPTION 'This Experience is Complete. Reopen it first (finance)'; END IF;
  IF v_estatus NOT IN ('shoot_scheduled', 'shoot_done', 'delivering') THEN RAISE EXCEPTION 'Deliverables come in after the shoot'; END IF;
  IF v_dstatus <> 'agreed' THEN RAISE EXCEPTION 'Only a creator who accepted their deal has deliverables'; END IF;
  SELECT r.leg_shoot_outcome INTO v_outcome FROM experience_roster r WHERE r.leg_deal_id = v_deal;
  IF v_outcome IS DISTINCT FROM 'done' THEN RAISE EXCEPTION 'Mark this creator''s shoot done first'; END IF;
  v_owner := experience_leg_owner(v_deal);
  IF p_who = 'guapd' AND v_owner <> 'guapd' THEN RAISE EXCEPTION 'On this Experience the creator submits their own deliverables'; END IF;
  IF p_who = 'creator' AND v_owner <> 'creator' THEN RAISE EXCEPTION 'Guapd delivers the content on this shoot; there is nothing for you to submit'; END IF;
  IF p_who NOT IN ('guapd', 'creator', 'review') THEN RAISE EXCEPTION 'Unknown actor'; END IF;

  RETURN QUERY SELECT v_deal, v_exp, v_istatus, v_ver, CASE WHEN v_istatus = 'revision' THEN v_ver + 1 ELSE v_ver END;
END;
$$;

-- A safe storage path for the next version of an item, or an error.
CREATE OR REPLACE FUNCTION experience_item_path(p_deal_id uuid, p_item_id uuid, p_item_status text, p_next_version int, p_file_name text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  v_name text := regexp_replace(btrim(coalesce(p_file_name, '')), '[^A-Za-z0-9._-]+', '_', 'g');
  v_ext text := lower(substring(v_name FROM '\.([A-Za-z0-9]+)$'));
BEGIN
  IF p_item_status = 'approved' THEN RAISE EXCEPTION 'Approved already. Ask for changes on it first'; END IF;
  IF length(v_name) NOT BETWEEN 3 AND 120 OR v_ext IS NULL
     OR v_ext NOT IN ('mp4', 'mov', 'webm', 'avi', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf', 'mp3', 'wav', 'm4a', 'zip') THEN
    RAISE EXCEPTION 'That file type is not accepted (video, image, PDF, audio or zip)';
  END IF;
  RETURN p_deal_id::text || '/' || p_item_id::text || '/v' || p_next_version::text || '/' || v_name;
END;
$$;

-- Put a new version on an item (link OR uploaded file). The file must already
-- be in the private bucket at the path experience_item_path gave.
CREATE OR REPLACE FUNCTION experience_item_put(p_item_id uuid, p_deal_id uuid, p_item_status text, p_next_version int,
                                               p_url text, p_storage_path text, p_file_name text, p_via text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_url text := nullif(btrim(coalesce(p_url, '')), '');
BEGIN
  IF p_item_status = 'approved' THEN RAISE EXCEPTION 'Approved already. Ask for changes on it first'; END IF;
  IF p_item_status NOT IN ('pending', 'submitted', 'revision') THEN RAISE EXCEPTION 'This deliverable cannot take a new version now'; END IF;
  IF (v_url IS NULL) = (p_storage_path IS NULL) THEN RAISE EXCEPTION 'Add a link or a file (one of them)'; END IF;
  IF v_url IS NOT NULL AND (v_url !~* '^https?://[^\s]+$' OR length(v_url) > 2000) THEN
    RAISE EXCEPTION 'The link must start with https:// (or http://)';
  END IF;
  IF p_storage_path IS NOT NULL THEN
    IF p_storage_path <> experience_item_path(p_deal_id, p_item_id, p_item_status, p_next_version, p_file_name) THEN
      RAISE EXCEPTION 'The upload does not match this deliverable. Upload it again';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'deliverables' AND o.name = p_storage_path) THEN
      RAISE EXCEPTION 'The file did not finish uploading. Upload it again';
    END IF;
  END IF;
  UPDATE deal_deliverable_items SET
    version = p_next_version, item_status = 'submitted',
    external_url = v_url, storage_path = p_storage_path,
    file_name = CASE WHEN p_storage_path IS NOT NULL THEN regexp_replace(btrim(p_file_name), '[^A-Za-z0-9._-]+', '_', 'g') END,
    submitted_at = now(), approved_at = NULL, submitted_via = p_via, submitted_by = my_user_id(), updated_at = now()
  WHERE id = p_item_id;
END;
$$;

-- ── C. The shoot (staff, operational) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION experience_console_schedule_shoot(p_experience_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text; v_date date; v_city text; v_agreed int;
BEGIN
  PERFORM experience_console_require();
  SELECT e.status, e.shoot_date, e.shoot_city INTO v_status, v_date, v_city FROM experiences e WHERE e.id = p_experience_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  IF v_status <> 'confirmed' THEN RAISE EXCEPTION 'The shoot is confirmed once the roster is locked and the deals are out'; END IF;
  IF v_date IS NULL OR v_city IS NULL THEN RAISE EXCEPTION 'The shoot needs a date and a city'; END IF;
  IF EXISTS (SELECT 1 FROM experience_roster r WHERE r.experience_id = p_experience_id AND NOT r.locked AND r.brand_decision IN ('pending', 'accepted')) THEN
    RAISE EXCEPTION 'Lock or remove the creators still on the roster first';
  END IF;
  IF EXISTS (SELECT 1 FROM experience_roster r WHERE r.experience_id = p_experience_id AND r.locked AND r.brand_decision = 'accepted' AND r.leg_deal_id IS NULL) THEN
    RAISE EXCEPTION 'Send every locked creator their deal first';
  END IF;
  SELECT count(*)::int INTO v_agreed FROM experience_roster r JOIN deals d ON d.id = r.leg_deal_id
    WHERE r.experience_id = p_experience_id AND d.status = 'agreed';
  IF v_agreed = 0 THEN RAISE EXCEPTION 'At least one creator has to accept their deal first'; END IF;
  UPDATE experiences SET status = 'shoot_scheduled', updated_at = now() WHERE id = p_experience_id;
  PERFORM experience_console_audit('experience.shoot_scheduled', 'experiences', p_experience_id,
    jsonb_build_object('status_before', 'confirmed', 'status_after', 'shoot_scheduled', 'shoot_date', v_date,
      'shoot_city', v_city, 'creators_accepted', v_agreed));
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_leg_shoot_outcome(p_roster_id uuid, p_outcome text, p_reason text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_exp uuid; v_status text; v_date date; v_creator uuid; v_deal uuid; v_outcome text; v_dstatus text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  PERFORM experience_console_require();
  SELECT r.experience_id INTO v_exp FROM experience_roster r WHERE r.id = p_roster_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Roster entry not found'; END IF;
  SELECT e.status, e.shoot_date INTO v_status, v_date FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT r.creator_id, r.leg_deal_id, r.leg_shoot_outcome INTO v_creator, v_deal, v_outcome
    FROM experience_roster r WHERE r.id = p_roster_id FOR UPDATE;
  SELECT d.status::text INTO v_dstatus FROM deals d WHERE d.id = v_deal;

  IF v_status <> 'shoot_scheduled' THEN RAISE EXCEPTION 'Shoot outcomes are recorded while the shoot is scheduled'; END IF;
  IF v_dstatus IS DISTINCT FROM 'agreed' THEN RAISE EXCEPTION 'Only a creator who accepted their deal has a shoot outcome'; END IF;
  IF v_outcome IS NOT NULL THEN RAISE EXCEPTION 'Already recorded. Undo it first to change it'; END IF;
  IF p_outcome NOT IN ('done', 'did_not_shoot') THEN RAISE EXCEPTION 'Say whether they shot or not'; END IF;
  IF p_outcome = 'did_not_shoot' AND length(coalesce(v_reason, '')) NOT BETWEEN 3 AND 300 THEN
    RAISE EXCEPTION 'Say why they did not shoot (3 to 300 characters)';
  END IF;
  IF v_date IS NULL THEN RAISE EXCEPTION 'The shoot has no date'; END IF;  -- NULL > date would pass silently
  IF v_date > (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
    RAISE EXCEPTION 'The shoot date (%) has not come yet', to_char(v_date, 'DD Mon YYYY');
  END IF;

  UPDATE experience_roster SET leg_shoot_outcome = p_outcome, leg_shoot_outcome_at = now(), leg_shoot_outcome_by = my_user_id(),
         leg_shoot_outcome_reason = CASE WHEN p_outcome = 'did_not_shoot' THEN left(v_reason, 300) END, updated_at = now()
    WHERE id = p_roster_id;
  PERFORM experience_console_audit('experience.leg_shoot_outcome', 'experience_roster', p_roster_id,
    jsonb_build_object('experience_id', v_exp, 'creator_id', v_creator, 'deal_id', v_deal, 'outcome', p_outcome,
      'reason_length', coalesce(length(v_reason), 0)));
  RETURN experience_shoot_rollup(v_exp);
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_leg_shoot_undo(p_roster_id uuid, p_reason text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_exp uuid; v_status text; v_creator uuid; v_deal uuid; v_outcome text;
  v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  PERFORM experience_console_require();
  SELECT r.experience_id INTO v_exp FROM experience_roster r WHERE r.id = p_roster_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Roster entry not found'; END IF;
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT r.creator_id, r.leg_deal_id, r.leg_shoot_outcome INTO v_creator, v_deal, v_outcome
    FROM experience_roster r WHERE r.id = p_roster_id FOR UPDATE;
  IF v_status NOT IN ('shoot_scheduled', 'shoot_done') THEN RAISE EXCEPTION 'A shoot outcome can only be undone before deliverables go to the brand'; END IF;
  IF v_outcome IS NULL THEN RAISE EXCEPTION 'Nothing recorded to undo'; END IF;
  IF EXISTS (SELECT 1 FROM experience_deliverable_releases x WHERE x.deal_id = v_deal AND x.status <> 'withdrawn') THEN
    RAISE EXCEPTION 'Something from this creator has been shared with the brand; the outcome stays';
  END IF;
  IF length(v_reason) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'Say why it is being undone (3 to 300 characters)'; END IF;
  UPDATE experience_roster SET leg_shoot_outcome = NULL, leg_shoot_outcome_at = NULL, leg_shoot_outcome_by = NULL,
         leg_shoot_outcome_reason = NULL, updated_at = now()
    WHERE id = p_roster_id;
  IF v_status = 'shoot_done' THEN
    UPDATE experiences SET status = 'shoot_scheduled', updated_at = now() WHERE id = v_exp;
  END IF;
  PERFORM experience_console_audit('experience.leg_shoot_outcome_undone', 'experience_roster', p_roster_id,
    jsonb_build_object('experience_id', v_exp, 'creator_id', v_creator, 'deal_id', v_deal, 'outcome_before', v_outcome,
      'reason', v_reason, 'status_before', v_status, 'status_after', 'shoot_scheduled'));
  RETURN 'shoot_scheduled';
END;
$$;

-- Withdraw an offer the creator has not answered. The deal is cancelled; the
-- reason goes to the audit only. Re-sending is a later to-do.
CREATE OR REPLACE FUNCTION experience_console_leg_withdraw(p_roster_id uuid, p_reason text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_exp uuid; v_status text; v_creator uuid; v_deal uuid; v_dstatus text;
  v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  PERFORM experience_console_require();
  SELECT r.experience_id INTO v_exp FROM experience_roster r WHERE r.id = p_roster_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Roster entry not found'; END IF;
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT r.creator_id, r.leg_deal_id INTO v_creator, v_deal FROM experience_roster r WHERE r.id = p_roster_id FOR UPDATE;
  SELECT d.status::text INTO v_dstatus FROM deals d WHERE d.id = v_deal FOR UPDATE;
  IF v_status NOT IN ('confirmed', 'shoot_scheduled') THEN RAISE EXCEPTION 'Offers are withdrawn before the shoot is done'; END IF;
  IF v_dstatus IS DISTINCT FROM 'negotiating' THEN RAISE EXCEPTION 'Only an offer the creator has not answered can be withdrawn'; END IF;
  IF length(v_reason) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'Say why it is being withdrawn (3 to 300 characters)'; END IF;
  UPDATE deals SET status = 'cancelled' WHERE id = v_deal;
  INSERT INTO events (deal_id, actor_id, event_type, detail)
  VALUES (v_deal, my_user_id(), 'experience.leg_withdrawn', jsonb_build_object('by', 'guapd'));
  PERFORM experience_console_audit('experience.leg_withdrawn', 'deals', v_deal,
    jsonb_build_object('experience_id', v_exp, 'roster_id', p_roster_id, 'creator_id', v_creator, 'reason', v_reason,
      'status_before', 'negotiating', 'status_after', 'cancelled'));
  RETURN experience_shoot_rollup(v_exp);
END;
$$;

-- ── D. Deliverables (staff, operational) ───────────────────────────────────
CREATE OR REPLACE FUNCTION experience_console_deliverables(p_experience_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text; v_date date; v_owner text; v_trigger text; v_legs jsonb;
BEGIN
  PERFORM experience_console_require();
  SELECT e.status, e.shoot_date,
         CASE WHEN e.settings_snapshot ->> 'deliverables_owner' = 'creator' THEN 'creator' ELSE 'guapd' END,
         coalesce(e.settings_snapshot ->> 'completion_trigger', 'on_shoot_done')
    INTO v_status, v_date, v_owner, v_trigger
    FROM experiences e WHERE e.id = p_experience_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'roster_id', r.id, 'deal_id', d.id, 'creator_id', c.id, 'full_name', c.full_name, 'handle', c.handle,
           'deal_status', d.status::text, 'owner', experience_leg_owner(d.id),
           'shoot_outcome', r.leg_shoot_outcome, 'shoot_outcome_at', r.leg_shoot_outcome_at,
           'shoot_outcome_reason', r.leg_shoot_outcome_reason,
           'work_complete', experience_leg_work_complete(d.id),
           'items', (
             SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', i.id, 'label', i.label, 'type', experience_item_type(i.label), 'affiliate_link', i.affiliate_link,
               'visible_to_creator', i.visible_to_creator, 'item_status', i.item_status, 'version', i.version,
               'external_url', i.external_url, 'file_name', i.file_name, 'has_file', i.storage_path IS NOT NULL,
               'submitted_at', i.submitted_at, 'submitted_via', i.submitted_via, 'approved_at', i.approved_at,
               'note', CASE WHEN experience_leg_owner(d.id) = 'creator' THEN i.revision_note ELSE sn.note END,
               'release', (
                 SELECT jsonb_build_object('id', x.id, 'item_version', x.item_version, 'released_at', x.released_at,
                          'brand_decision', x.brand_decision, 'brand_decision_channel', x.brand_decision_channel,
                          'brand_decided_at', x.brand_decided_at, 'brand_decision_note', x.brand_decision_note)
                 FROM experience_deliverable_releases x WHERE x.item_id = i.id AND x.status = 'shared'),
               'releases_before', (SELECT count(*) FROM experience_deliverable_releases x WHERE x.item_id = i.id AND x.status <> 'shared')
             ) ORDER BY array_position(ARRAY['UGC video', 'Reel', 'Story', 'Static post', 'Photo set'], experience_item_type(i.label)), i.label), '[]'::jsonb)
             FROM deal_deliverable_items i LEFT JOIN experience_item_staff_notes sn ON sn.item_id = i.id
             WHERE i.deal_id = d.id)
         ) ORDER BY r.locked_at, r.created_at), '[]'::jsonb)
    INTO v_legs
    FROM experience_roster r
    JOIN deals d ON d.id = r.leg_deal_id
    JOIN creators c ON c.id = r.creator_id
    WHERE r.experience_id = p_experience_id;

  RETURN jsonb_build_object('status', v_status, 'shoot_date', v_date,
    'today', (now() AT TIME ZONE 'Asia/Kolkata')::date, 'owner', v_owner, 'completion_trigger', v_trigger,
    'legs', v_legs, 'progress', experience_deliverables_progress(p_experience_id));
END;
$$;

-- Where staff upload a file for an item (Guapd-provides legs). The server
-- action mints a signed upload URL for exactly this path.
CREATE OR REPLACE FUNCTION experience_console_item_upload_slot(p_item_id uuid, p_file_name text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g record;
BEGIN
  PERFORM experience_console_require();
  SELECT x.deal_id, x.item_status, x.next_version INTO g FROM experience_item_gate(p_item_id, 'guapd') x;
  RETURN experience_item_path(g.deal_id, p_item_id, g.item_status, g.next_version, p_file_name);
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_item_attach(p_item_id uuid, p_url text, p_storage_path text, p_file_name text)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g record;
BEGIN
  PERFORM experience_console_require();
  SELECT x.deal_id, x.experience_id, x.item_status, x.next_version INTO g FROM experience_item_gate(p_item_id, 'guapd') x;
  PERFORM experience_item_put(p_item_id, g.deal_id, g.item_status, g.next_version, p_url, p_storage_path, p_file_name, 'guapd');
  DELETE FROM experience_item_staff_notes WHERE item_id = p_item_id;
  PERFORM experience_console_audit('experience.deliverable_attached', 'deal_deliverable_items', p_item_id,
    jsonb_build_object('experience_id', g.experience_id, 'deal_id', g.deal_id, 'version', g.next_version,
      'kind', CASE WHEN p_storage_path IS NOT NULL THEN 'file' ELSE 'link' END, 'status_before', g.item_status));
  RETURN g.next_version;
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_item_review(p_item_id uuid, p_decision text, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g record; v_owner text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  PERFORM experience_console_require();
  SELECT x.deal_id, x.experience_id, x.item_status, x.item_version INTO g FROM experience_item_gate(p_item_id, 'review') x;
  v_owner := experience_leg_owner(g.deal_id);
  IF p_decision = 'approve' THEN
    IF g.item_status <> 'submitted' THEN RAISE EXCEPTION 'Only a submitted deliverable can be approved'; END IF;
    UPDATE deal_deliverable_items SET item_status = 'approved', approved_at = now(), updated_at = now() WHERE id = p_item_id;
  ELSIF p_decision = 'revision' THEN
    IF g.item_status NOT IN ('submitted', 'approved') THEN RAISE EXCEPTION 'Changes are asked for on a submitted or approved deliverable'; END IF;
    IF EXISTS (SELECT 1 FROM experience_deliverable_releases x WHERE x.item_id = p_item_id AND x.status = 'shared' AND x.brand_decision = 'approved') THEN
      RAISE EXCEPTION 'The brand approved this deliverable; it is final';
    END IF;
    IF length(coalesce(v_note, '')) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'Say what needs to change (3 to 1,000 characters)'; END IF;
    IF v_owner = 'creator' THEN
      UPDATE deal_deliverable_items SET item_status = 'revision', revision_note = v_note, approved_at = NULL, updated_at = now() WHERE id = p_item_id;
    ELSE
      UPDATE deal_deliverable_items SET item_status = 'revision', approved_at = NULL, updated_at = now() WHERE id = p_item_id;
      INSERT INTO experience_item_staff_notes (item_id, note, updated_at, updated_by) VALUES (p_item_id, v_note, now(), my_user_id())
      ON CONFLICT (item_id) DO UPDATE SET note = EXCLUDED.note, updated_at = now(), updated_by = EXCLUDED.updated_by;
    END IF;
  ELSE
    RAISE EXCEPTION 'Approve, or ask for changes';
  END IF;
  PERFORM experience_console_audit('experience.deliverable_reviewed', 'deal_deliverable_items', p_item_id,
    jsonb_build_object('experience_id', g.experience_id, 'deal_id', g.deal_id, 'version', g.item_version, 'decision', p_decision,
      'status_before', g.item_status, 'note_length', coalesce(length(v_note), 0)));
END;
$$;

-- A file on an item, for staff to open (the action signs a short-lived URL).
CREATE OR REPLACE FUNCTION experience_console_item_file(p_item_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_path text; v_name text;
BEGIN
  PERFORM experience_console_require();
  SELECT i.storage_path, i.file_name INTO v_path, v_name
    FROM deal_deliverable_items i JOIN deals d ON d.id = i.deal_id
    WHERE i.id = p_item_id AND d.leg_role = 'creator_leg';
  IF v_path IS NULL THEN RAISE EXCEPTION 'No file on this deliverable'; END IF;
  RETURN jsonb_build_object('storage_path', v_path, 'file_name', v_name);
END;
$$;

-- ── E. Releasing to the brand (staff, operational) ─────────────────────────
CREATE OR REPLACE FUNCTION experience_console_release(p_experience_id uuid, p_item_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  IF v_status NOT IN ('shoot_done', 'delivering') THEN RAISE EXCEPTION 'Share with the brand once every creator''s shoot is recorded'; END IF;
  IF coalesce(array_length(p_item_ids, 1), 0) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Pick what to share'; END IF;

  FOREACH v_item IN ARRAY (SELECT array_agg(DISTINCT u) FROM unnest(p_item_ids) u) LOOP
    SELECT i.deal_id, i.item_status, i.version, i.label, i.external_url, i.storage_path, i.file_name
      INTO i_deal, i_status, i_ver, i_label, i_url, i_path, i_file
      FROM deal_deliverable_items i WHERE i.id = v_item FOR UPDATE;
    SELECT d.status::text, d.creator_id INTO d_status, d_creator FROM deals d
      WHERE d.id = i_deal AND d.leg_role = 'creator_leg' AND d.experience_id = p_experience_id;
    IF d_status IS NULL THEN RAISE EXCEPTION 'That deliverable is not on this Experience'; END IF;
    SELECT r.leg_shoot_outcome INTO v_outcome FROM experience_roster r WHERE r.leg_deal_id = i_deal;
    IF d_status <> 'agreed' OR v_outcome IS DISTINCT FROM 'done' THEN RAISE EXCEPTION 'Only deliverables from creators who shot can be shared'; END IF;
    IF i_status <> 'approved' THEN RAISE EXCEPTION '"%" is not approved by Guapd yet', i_label; END IF;
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
$$;

CREATE OR REPLACE FUNCTION experience_console_release_withdraw(p_release_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_exp uuid; v_status text; v_rstatus text; v_decision text; v_item uuid;
  v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  PERFORM experience_console_require();
  SELECT x.experience_id INTO v_exp FROM experience_deliverable_releases x WHERE x.id = p_release_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Not found'; END IF;
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT x.status, x.brand_decision, x.item_id INTO v_rstatus, v_decision, v_item
    FROM experience_deliverable_releases x WHERE x.id = p_release_id FOR UPDATE;
  IF v_status = 'complete' THEN RAISE EXCEPTION 'This Experience is Complete. Reopen it first (finance)'; END IF;
  IF v_rstatus <> 'shared' THEN RAISE EXCEPTION 'This is not shared with the brand'; END IF;
  IF v_decision = 'approved' THEN RAISE EXCEPTION 'The brand approved it; it stays shared'; END IF;
  IF length(v_reason) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'Say why it is being withdrawn (3 to 300 characters)'; END IF;
  UPDATE experience_deliverable_releases SET status = 'withdrawn', withdrawn_at = now(), withdrawn_by = my_user_id(), withdrawn_reason = v_reason
    WHERE id = p_release_id;
  PERFORM experience_console_audit('experience.deliverable_withdrawn', 'experience_deliverable_releases', p_release_id,
    jsonb_build_object('experience_id', v_exp, 'item_id', v_item, 'reason', v_reason));
END;
$$;

-- The brand's answer, recorded by staff with the channel (self-service is Phase 6).
CREATE OR REPLACE FUNCTION experience_console_release_decide(p_release_id uuid, p_decision text, p_channel text, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_exp uuid; v_status text; v_rstatus text; v_before text; v_item uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  PERFORM experience_console_require();
  SELECT x.experience_id INTO v_exp FROM experience_deliverable_releases x WHERE x.id = p_release_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Not found'; END IF;
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT x.status, x.brand_decision, x.item_id INTO v_rstatus, v_before, v_item
    FROM experience_deliverable_releases x WHERE x.id = p_release_id FOR UPDATE;
  IF v_status = 'complete' THEN RAISE EXCEPTION 'This Experience is Complete. Reopen it first (finance)'; END IF;
  IF v_rstatus <> 'shared' THEN RAISE EXCEPTION 'This is not shared with the brand'; END IF;
  IF v_before = 'approved' THEN RAISE EXCEPTION 'The brand already approved it'; END IF;
  IF p_decision NOT IN ('approved', 'changes_requested') THEN RAISE EXCEPTION 'Approved, or changes requested'; END IF;
  IF p_channel IS NULL OR p_channel NOT IN ('whatsapp', 'email', 'call', 'in_person') THEN RAISE EXCEPTION 'Say how the brand told us'; END IF;
  IF p_decision = 'changes_requested' AND length(coalesce(v_note, '')) NOT BETWEEN 3 AND 1000 THEN
    RAISE EXCEPTION 'Write down what the brand asked to change (3 to 1,000 characters)';
  END IF;
  IF v_note IS NOT NULL AND length(v_note) > 1000 THEN RAISE EXCEPTION 'The note is too long'; END IF;
  UPDATE experience_deliverable_releases SET brand_decision = p_decision, brand_decision_channel = p_channel,
         brand_decision_note = v_note, brand_decided_at = now(), brand_decided_by = my_user_id()
    WHERE id = p_release_id;
  PERFORM experience_console_audit('experience.brand_deliverable_decision_recorded', 'experience_deliverable_releases', p_release_id,
    jsonb_build_object('experience_id', v_exp, 'item_id', v_item, 'decision_before', v_before, 'decision_after', p_decision,
      'channel', p_channel, 'note_length', coalesce(length(v_note), 0)));
END;
$$;

-- ── F. The creator: submitting on a creator-submit leg ─────────────────────
CREATE OR REPLACE FUNCTION creator_leg_item_upload_slot(p_item_id uuid, p_file_name text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g record;
BEGIN
  SELECT x.deal_id, x.item_status, x.next_version INTO g FROM experience_item_gate(p_item_id, 'creator') x;
  RETURN experience_item_path(g.deal_id, p_item_id, g.item_status, g.next_version, p_file_name);
END;
$$;

CREATE OR REPLACE FUNCTION creator_leg_item_submit(p_item_id uuid, p_url text, p_storage_path text, p_file_name text)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g record;
BEGIN
  SELECT x.deal_id, x.experience_id, x.item_status, x.next_version INTO g FROM experience_item_gate(p_item_id, 'creator') x;
  PERFORM experience_item_put(p_item_id, g.deal_id, g.item_status, g.next_version, p_url, p_storage_path, p_file_name, 'creator');
  -- Creators sign in by phone and may have no email, so their actions go to
  -- the deal's events (as accept / decline), not ops_events.
  INSERT INTO events (deal_id, actor_id, event_type, detail)
  VALUES (g.deal_id, my_user_id(), 'experience.deliverable_submitted',
          jsonb_build_object('item_id', p_item_id, 'version', g.next_version, 'kind', CASE WHEN p_storage_path IS NOT NULL THEN 'file' ELSE 'link' END));
  RETURN g.next_version;
END;
$$;

-- creator_leg_context (0534) plus the shoot and the deliverables. The creator
-- sees their OWN visible items; never releases, the brand's decisions, or
-- Guapd's notes on its own content. In Guapd-provides mode, status only.
CREATE OR REPLACE FUNCTION creator_leg_context(p_deal_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_exp uuid; v_status text; v_ref text; v_brand_name text; v_title text;
  v_logo text; v_shoot_date date; v_shoot_city text; v_brief text; v_plan jsonb; v_estatus text;
  v_deliverables jsonb; v_aff int; v_outcome text;
  t_rate bigint; t_days numeric; t_gross bigint; t_pct numeric; t_net bigint; t_track text;
  v_videos int; v_owner text; v_items jsonb;
BEGIN
  SELECT d.experience_id, d.status::text, d.deal_ref, d.experience_brand_name, d.title
    INTO v_exp, v_status, v_ref, v_brand_name, v_title
    FROM deals d
    WHERE d.id = p_deal_id AND d.leg_role = 'creator_leg'
      AND my_creator_id() IS NOT NULL AND d.creator_id = my_creator_id();
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE = '42501'; END IF;

  SELECT b.logo_url, e.shoot_date, e.shoot_city, e.creator_brief, e.agreed_plan, e.status
    INTO v_logo, v_shoot_date, v_shoot_city, v_brief, v_plan, v_estatus
    FROM experiences e JOIN brands b ON b.id = e.brand_id WHERE e.id = v_exp;
  SELECT r.leg_deliverables, r.leg_affiliate_count, r.leg_shoot_outcome INTO v_deliverables, v_aff, v_outcome
    FROM experience_roster r WHERE r.leg_deal_id = p_deal_id;
  SELECT t.day_rate_paise, t.days, t.creator_gross_paise, t.platform_pct, t.creator_net_paise, t.platform_track
    INTO t_rate, t_days, t_gross, t_pct, t_net, t_track
    FROM experience_creator_terms t WHERE t.deal_id = p_deal_id;
  v_videos := experience_video_count(v_deliverables);
  v_owner := experience_leg_owner(p_deal_id);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id, 'label', i.label, 'affiliate_link', i.affiliate_link, 'item_status', i.item_status, 'version', i.version,
           'external_url', CASE WHEN v_owner = 'creator' THEN i.external_url END,
           'file_name', CASE WHEN v_owner = 'creator' THEN i.file_name END,
           'revision_note', CASE WHEN v_owner = 'creator' AND i.item_status = 'revision' THEN i.revision_note END,
           'submitted_at', CASE WHEN v_owner = 'creator' THEN i.submitted_at END
         ) ORDER BY array_position(ARRAY['UGC video', 'Reel', 'Story', 'Static post', 'Photo set'], experience_item_type(i.label)), i.label), '[]'::jsonb)
    INTO v_items
    FROM deal_deliverable_items i WHERE i.deal_id = p_deal_id AND i.visible_to_creator;

  RETURN jsonb_build_object(
    'brand_name', v_brand_name, 'brand_logo_url', v_logo, 'title', v_title, 'status', v_status, 'deal_ref', v_ref,
    'shoot_date', v_shoot_date, 'shoot_city', v_shoot_city, 'brief', v_brief,
    'deliverables', coalesce(v_deliverables, '[]'::jsonb), 'videos', v_videos, 'affiliate_count', coalesce(v_aff, 0),
    'ad_rights_months', CASE WHEN (v_plan ->> 'ad_rights_months') IS NOT NULL THEN (v_plan ->> 'ad_rights_months')::int END,
    'ad_rights_videos', CASE WHEN (v_plan ->> 'ad_rights_months') IS NOT NULL
                             THEN least(coalesce(nullif(v_plan ->> 'ad_rights_per_creator', '')::int, v_videos), v_videos) END,
    'boost_months', CASE WHEN (v_plan ->> 'boost_months') IS NOT NULL THEN (v_plan ->> 'boost_months')::int END,
    'boost_videos', CASE WHEN (v_plan ->> 'boost_months') IS NOT NULL
                         THEN least(coalesce(nullif(v_plan ->> 'boost_per_creator', '')::int, v_videos), v_videos) END,
    'day_rate_paise', t_rate, 'days', t_days, 'gross_paise', t_gross, 'platform_pct', t_pct,
    'platform_track', t_track, 'net_paise', t_net,
    'shoot_outcome', v_outcome, 'deliverables_owner', v_owner,
    'work_complete', experience_leg_work_complete(p_deal_id),
    -- coalesce: with no outcome yet "v_outcome = 'done'" is NULL, not false.
    'can_submit', coalesce(v_owner = 'creator' AND v_status = 'agreed' AND v_outcome = 'done'
                  AND v_estatus IN ('shoot_scheduled', 'shoot_done', 'delivering'), false),
    'items', v_items);
END;
$$;

-- ── G. The brand: released deliverables only ───────────────────────────────
-- The caller must be a member of the Experience's own brand. Returns the
-- released version of each live release: the creator's NAME, the label, the
-- link (or that there is a file), when it was shared, and the decision on
-- record. Never versions, withdrawn or superseded items, who submitted, notes,
-- handles, deal or item ids, or any money.
CREATE OR REPLACE FUNCTION brand_experience_deliverables(p_experience_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_title text; v_brand text; v_date date; v_city text; v_items jsonb;
BEGIN
  SELECT e.title, b.name, e.shoot_date, e.shoot_city INTO v_title, v_brand, v_date, v_city
    FROM experiences e JOIN brands b ON b.id = e.brand_id
    WHERE e.id = p_experience_id AND NOT b.is_guapd AND my_user_id() IS NOT NULL
      AND EXISTS (SELECT 1 FROM brand_members bm WHERE bm.brand_id = e.brand_id AND bm.user_id = my_user_id());
  IF v_title IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE = '42501'; END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'release_id', x.id, 'creator_name', c.full_name, 'label', x.label,
           'kind', CASE WHEN x.external_url IS NOT NULL THEN 'link' ELSE 'file' END,
           'url', x.external_url, 'file_name', x.file_name, 'shared_at', x.released_at,
           'decision', x.brand_decision, 'decided_at', x.brand_decided_at
         ) ORDER BY c.full_name, array_position(ARRAY['UGC video', 'Reel', 'Story', 'Static post', 'Photo set'], experience_item_type(x.label)), x.label), '[]'::jsonb)
    INTO v_items
    FROM experience_deliverable_releases x
    JOIN deals d ON d.id = x.deal_id
    JOIN creators c ON c.id = d.creator_id
    WHERE x.experience_id = p_experience_id AND x.status = 'shared';

  RETURN jsonb_build_object('title', v_title, 'brand_name', v_brand, 'shoot_date', v_date, 'shoot_city', v_city, 'items', v_items);
END;
$$;

-- The file behind one live release, for the brand's action to sign a
-- short-lived URL. Same membership check; live, file releases only.
CREATE OR REPLACE FUNCTION brand_experience_release_file(p_release_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_path text; v_name text;
BEGIN
  SELECT x.storage_path, x.file_name INTO v_path, v_name
    FROM experience_deliverable_releases x
    JOIN experiences e ON e.id = x.experience_id
    WHERE x.id = p_release_id AND x.status = 'shared' AND x.storage_path IS NOT NULL AND my_user_id() IS NOT NULL
      AND EXISTS (SELECT 1 FROM brand_members bm WHERE bm.brand_id = e.brand_id AND bm.user_id = my_user_id());
  IF v_path IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object('storage_path', v_path, 'file_name', v_name);
END;
$$;

-- ── H. P&L: a creator who did not shoot is not counted (decision 4) ─────────
CREATE OR REPLACE FUNCTION compute_experience_pnl(p_experience_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_billed bigint; v_received bigint; v_invoices int; v_agreed bigint;
  v_gross bigint; v_net bigint; v_per_leg jsonb;
  v_awaiting int; v_awaiting_net bigint; v_declined int; v_no_shoot int;
  v_costs bigint; v_by_cat jsonb;
  v_subtotal bigint; v_fee_kept bigint; v_margin bigint;
BEGIN
  SELECT coalesce(sum(si.subtotal_paise) FILTER (WHERE si.status IN ('issued', 'paid')), 0)::bigint,
         coalesce(sum(si.subtotal_paise) FILTER (WHERE si.status = 'paid'), 0)::bigint,
         count(*) FILTER (WHERE si.status IN ('issued', 'paid'))::int
    INTO v_billed, v_received, v_invoices
    FROM service_invoices si WHERE si.experience_id = p_experience_id;
  SELECT e.brand_service_total_paise INTO v_agreed FROM experiences e WHERE e.id = p_experience_id;

  -- Accepted legs only (agreed onward), minus any creator recorded as not shooting.
  SELECT coalesce(sum(t.creator_gross_paise), 0)::bigint, coalesce(sum(t.creator_net_paise), 0)::bigint,
         coalesce(jsonb_agg(jsonb_build_object(
           'deal_id', t.deal_id, 'creator_id', t.creator_id, 'full_name', c.full_name, 'deal_status', d.status::text,
           'platform_track', t.platform_track, 'platform_pct', t.platform_pct,
           'day_rate_paise', t.day_rate_paise, 'days', t.days,
           'creator_gross_paise', t.creator_gross_paise, 'platform_fee_paise', t.creator_gross_paise - t.creator_net_paise,
           'creator_net_paise', t.creator_net_paise) ORDER BY t.created_at), '[]'::jsonb)
    INTO v_gross, v_net, v_per_leg
    FROM experience_creator_terms t
    JOIN deals d ON d.id = t.deal_id
    JOIN creators c ON c.id = t.creator_id
    WHERE t.experience_id = p_experience_id AND t.locked_at IS NOT NULL
      AND d.status IN ('agreed', 'delivered', 'revision', 'approved', 'paid', 'complete')
      AND NOT EXISTS (SELECT 1 FROM experience_roster r WHERE r.leg_deal_id = t.deal_id AND r.leg_shoot_outcome = 'did_not_shoot');

  SELECT count(*) FILTER (WHERE d.status = 'negotiating')::int,
         coalesce(sum(t.creator_net_paise) FILTER (WHERE d.status = 'negotiating'), 0)::bigint,
         count(*) FILTER (WHERE d.status IN ('declined', 'cancelled'))::int,
         count(*) FILTER (WHERE r.leg_shoot_outcome = 'did_not_shoot')::int
    INTO v_awaiting, v_awaiting_net, v_declined, v_no_shoot
    FROM experience_creator_terms t JOIN deals d ON d.id = t.deal_id
    LEFT JOIN experience_roster r ON r.leg_deal_id = t.deal_id
    WHERE t.experience_id = p_experience_id;

  v_costs := experience_cost_total(p_experience_id);
  SELECT coalesce(jsonb_agg(jsonb_build_object('category', x.category, 'total_paise', x.total) ORDER BY x.category), '[]'::jsonb)
    INTO v_by_cat
    FROM (SELECT cl.category, sum(cl.total_paise)::bigint AS total FROM experience_cost_lines cl
          WHERE cl.experience_id = p_experience_id AND cl.provided_by = 'guapd' AND cl.removed_at IS NULL
          GROUP BY cl.category) x;

  v_subtotal := v_billed - v_gross - v_costs;
  v_fee_kept := v_gross - v_net;
  v_margin := v_billed - v_net - v_costs;
  IF v_subtotal + v_fee_kept <> v_margin THEN
    RAISE EXCEPTION 'P&L does not reconcile: sub-total % + fee kept % <> margin %', v_subtotal, v_fee_kept, v_margin;
  END IF;

  RETURN jsonb_build_object(
    'experience_id', p_experience_id,
    'brand_revenue_paise', v_billed, 'revenue_basis', 'invoiced', 'revenue_pending_invoice', v_invoices = 0,
    'invoices_counted', v_invoices, 'brand_received_paise', v_received, 'brand_agreed_paise', v_agreed,
    'creator_gross_total_paise', v_gross, 'creator_net_total_paise', v_net,
    'guapd_costs_total_paise', v_costs, 'costs_by_category', v_by_cat,
    'subtotal_paise', v_subtotal, 'platform_fee_kept_paise', v_fee_kept, 'guapd_margin_paise', v_margin,
    'legs_counted', jsonb_array_length(v_per_leg), 'legs_awaiting', v_awaiting, 'awaiting_net_paise', v_awaiting_net,
    'legs_declined', v_declined, 'legs_pending', v_awaiting, 'legs_did_not_shoot', v_no_shoot,
    'per_leg', v_per_leg);
END;
$$;

-- A shoot outcome changes the counted legs: refresh the stored margin (open
-- Experiences only; experience_pnl_store never touches a final row).
DROP TRIGGER IF EXISTS t_er_pnl_refresh ON experience_roster;
CREATE TRIGGER t_er_pnl_refresh AFTER UPDATE OF leg_shoot_outcome ON experience_roster
  FOR EACH ROW WHEN (OLD.leg_shoot_outcome IS DISTINCT FROM NEW.leg_shoot_outcome)
  EXECUTE FUNCTION experience_pnl_refresh_from_row();

-- ── I. The 3a functions without SELECT * (bodies otherwise unchanged) ──────
CREATE OR REPLACE FUNCTION public.experience_console_create(p_brand_id uuid, p_title text, p_creator_count integer, p_deliverables jsonb, p_affiliate boolean, p_affiliate_per_creator integer, p_ad_rights boolean, p_ad_rights_per_creator integer, p_ad_rights_months integer, p_boost boolean, p_boost_per_creator integer, p_boost_months integer, p_location text, p_date_from date, p_date_to date, p_brief text, p_channel text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  b_id uuid; b_is_guapd boolean; b_status text;
  t_id uuid; t_version int; t_settings jsonb;
  v_id uuid;
  v_videos int;
BEGIN
  PERFORM experience_console_require();
  SELECT b.id, b.is_guapd, b.brand_status INTO b_id, b_is_guapd, b_status FROM brands b WHERE b.id = p_brand_id;
  IF b_id IS NULL THEN RAISE EXCEPTION 'Brand not found'; END IF;
  IF b_is_guapd THEN RAISE EXCEPTION 'An Experience is for a real brand, not the Guapd house account'; END IF;
  IF b_status = 'rejected' THEN RAISE EXCEPTION 'That brand is rejected'; END IF;
  IF coalesce(btrim(p_title), '') = '' THEN RAISE EXCEPTION 'Give the Experience a title'; END IF;
  IF p_channel IS NULL THEN RAISE EXCEPTION 'Say how the request arrived'; END IF;
  IF p_creator_count IS NULL OR p_creator_count <= 0 THEN RAISE EXCEPTION 'Say how many creators the brand wants'; END IF;
  IF jsonb_typeof(coalesce(p_deliverables, '[]'::jsonb)) <> 'array' OR experience_plan_count(p_deliverables, false) = 0 THEN
    RAISE EXCEPTION 'Add at least one deliverable per creator';
  END IF;
  v_videos := experience_plan_count(p_deliverables, true);
  IF p_affiliate AND (p_affiliate_per_creator IS NULL OR p_affiliate_per_creator <= 0) THEN
    RAISE EXCEPTION 'Say how many of each creators videos carry the affiliate link';
  END IF;
  IF p_affiliate AND p_affiliate_per_creator > v_videos THEN
    RAISE EXCEPTION 'More affiliate videos than videos per creator';
  END IF;
  IF p_ad_rights AND p_ad_rights_per_creator IS NOT NULL AND (p_ad_rights_per_creator <= 0 OR p_ad_rights_per_creator > v_videos) THEN
    RAISE EXCEPTION 'Ad rights cover more videos than each creator makes';
  END IF;
  IF p_boost AND p_boost_per_creator IS NOT NULL AND (p_boost_per_creator <= 0 OR p_boost_per_creator > v_videos) THEN
    RAISE EXCEPTION 'Boost covers more videos than each creator makes';
  END IF;
  SELECT t.id, t.version, t.settings INTO t_id, t_version, t_settings
    FROM deal_templates t WHERE t.slug = 'experience-ugc-day-shoot' AND t.is_active ORDER BY t.version DESC LIMIT 1;

  INSERT INTO experiences (brand_id, title, status, template_id, template_version, settings_snapshot,
    request_creator_count, request_deliverables,
    request_affiliate, request_affiliate_per_creator,
    request_ad_rights, request_ad_rights_per_creator, request_ad_rights_months,
    request_boost, request_boost_per_creator, request_boost_months,
    request_location, request_date_from, request_date_to, request_brief,
    request_channel, requested_at, created_by)
  VALUES (p_brand_id, btrim(p_title), 'requested', t_id, t_version, t_settings,
    p_creator_count, p_deliverables,
    coalesce(p_affiliate, false), CASE WHEN p_affiliate THEN p_affiliate_per_creator END,
    coalesce(p_ad_rights, false), CASE WHEN p_ad_rights THEN p_ad_rights_per_creator END, CASE WHEN p_ad_rights THEN p_ad_rights_months END,
    coalesce(p_boost, false), CASE WHEN p_boost THEN p_boost_per_creator END, CASE WHEN p_boost THEN p_boost_months END,
    nullif(btrim(p_location), ''), p_date_from, p_date_to, nullif(btrim(p_brief), ''),
    p_channel, now(), my_user_id())
  RETURNING id INTO v_id;

  PERFORM experience_console_audit('experience.request_recorded', 'experiences', v_id,
    jsonb_build_object('brand_id', p_brand_id, 'channel', p_channel, 'creators', p_creator_count,
      'videos_per_creator', v_videos, 'status_after', 'requested'));
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_roster_add(p_experience_id uuid, p_creator_ids uuid[], p_added_by text, p_channel text)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  e_id uuid; e_status text; e_plan_per_creator jsonb; e_request jsonb;
  v_template jsonb;
  v_added int := 0;
  v_id uuid;
  v_creator uuid;
BEGIN
  PERFORM experience_console_require();
  SELECT e.id, e.status, e.agreed_plan -> 'per_creator', e.request_deliverables
    INTO e_id, e_status, e_plan_per_creator, e_request
    FROM experiences e WHERE e.id = p_experience_id FOR UPDATE;
  IF e_id IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  IF e_status NOT IN ('rostering', 'confirmed') THEN RAISE EXCEPTION 'Creators are added once the price is agreed, and before the shoot is scheduled'; END IF;
  IF p_added_by NOT IN ('guapd', 'brand') THEN RAISE EXCEPTION 'A creator is added by Guapd or suggested by the brand'; END IF;
  IF p_added_by = 'brand' AND p_channel IS NULL THEN RAISE EXCEPTION 'Say how the brand suggested them'; END IF;
  IF coalesce(array_length(p_creator_ids, 1), 0) = 0 THEN RAISE EXCEPTION 'Pick at least one creator'; END IF;
  v_template := coalesce(e_plan_per_creator, e_request, '[]'::jsonb);

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
          'channel', p_channel, 'after_lock', e_status = 'confirmed'));
    END IF;
    v_id := NULL;
  END LOOP;
  RETURN v_added;
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_roster_decide(p_roster_id uuid, p_decision text, p_channel text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  r_id uuid; r_experience uuid; r_creator uuid; r_locked boolean; r_decision text;
BEGIN
  PERFORM experience_console_require();
  SELECT r.id, r.experience_id, r.creator_id, r.locked, r.brand_decision
    INTO r_id, r_experience, r_creator, r_locked, r_decision
    FROM experience_roster r WHERE r.id = p_roster_id FOR UPDATE;
  IF r_id IS NULL THEN RAISE EXCEPTION 'Roster entry not found'; END IF;
  IF r_locked THEN RAISE EXCEPTION 'This creator is locked on the roster'; END IF;
  IF p_decision NOT IN ('accepted', 'rejected', 'pending') THEN RAISE EXCEPTION 'Unknown decision'; END IF;
  IF p_decision <> 'pending' AND p_channel IS NULL THEN RAISE EXCEPTION 'Say how the brand told us'; END IF;
  UPDATE experience_roster SET brand_decision = p_decision,
    decision_channel = CASE WHEN p_decision = 'pending' THEN NULL ELSE p_channel END,
    decided_at = CASE WHEN p_decision = 'pending' THEN NULL ELSE now() END, updated_at = now()
    WHERE id = p_roster_id;
  PERFORM experience_console_audit('experience.roster_decision_recorded', 'experience_roster', p_roster_id,
    jsonb_build_object('experience_id', r_experience, 'creator_id', r_creator,
      'decision_before', r_decision, 'decision_after', p_decision, 'channel', p_channel));
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_roster_lock(p_experience_id uuid)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  e_id uuid; e_status text;
  v_rec jsonb;
  v_locked int;
BEGIN
  PERFORM experience_console_require();
  SELECT e.id, e.status INTO e_id, e_status FROM experiences e WHERE e.id = p_experience_id FOR UPDATE;
  IF e_id IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  IF e_status NOT IN ('rostering', 'confirmed') THEN RAISE EXCEPTION 'The roster can only be locked while it is being built'; END IF;
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
  IF e_status = 'rostering' THEN
    UPDATE experiences SET status = 'confirmed', updated_at = now() WHERE id = p_experience_id;
  END IF;

  PERFORM experience_console_audit('experience.roster_locked', 'experiences', p_experience_id,
    jsonb_build_object('locked_now', v_locked, 'videos_planned', v_rec -> 'videos_planned', 'videos_sold', v_rec -> 'videos_sold',
      'status_before', e_status, 'status_after', CASE WHEN e_status = 'rostering' THEN 'confirmed' ELSE e_status END));
  RETURN v_locked;
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_roster_note(p_roster_id uuid, p_note text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  r_id uuid; r_experience uuid; r_creator uuid;
  v text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  PERFORM experience_console_require();
  SELECT r.id, r.experience_id, r.creator_id INTO r_id, r_experience, r_creator FROM experience_roster r WHERE r.id = p_roster_id;
  IF r_id IS NULL THEN RAISE EXCEPTION 'Roster entry not found'; END IF;
  IF v IS NULL THEN
    DELETE FROM experience_roster_notes WHERE roster_id = p_roster_id;
  ELSE
    INSERT INTO experience_roster_notes (roster_id, note, updated_at, updated_by)
    VALUES (p_roster_id, left(v, 4000), now(), my_user_id())
    ON CONFLICT (roster_id) DO UPDATE SET note = EXCLUDED.note, updated_at = now(), updated_by = EXCLUDED.updated_by;
  END IF;
  PERFORM experience_console_audit('experience.roster_note_set', 'experience_roster', p_roster_id,
    jsonb_build_object('experience_id', r_experience, 'creator_id', r_creator, 'note_length', coalesce(length(v), 0)));
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_roster_plan(p_roster_id uuid, p_deliverables jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  r_id uuid; r_experience uuid; r_creator uuid; r_locked boolean; r_planned jsonb;
  d jsonb;
BEGIN
  PERFORM experience_console_require();
  SELECT r.id, r.experience_id, r.creator_id, r.locked, r.planned_deliverables
    INTO r_id, r_experience, r_creator, r_locked, r_planned
    FROM experience_roster r WHERE r.id = p_roster_id FOR UPDATE;
  IF r_id IS NULL THEN RAISE EXCEPTION 'Roster entry not found'; END IF;
  IF r_locked THEN RAISE EXCEPTION 'This creator is locked on the roster'; END IF;
  IF jsonb_typeof(coalesce(p_deliverables, 'null'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'Deliverables must be a list'; END IF;
  FOR d IN SELECT x FROM jsonb_array_elements(p_deliverables) x LOOP
    IF d ->> 'type' NOT IN ('UGC video', 'Reel', 'Story', 'Static post', 'Photo set') OR NOT ((d ->> 'count') ~ '^[0-9]+$') THEN
      RAISE EXCEPTION 'Each deliverable needs a known type and a whole-number count';
    END IF;
  END LOOP;
  UPDATE experience_roster SET planned_deliverables = p_deliverables, updated_at = now() WHERE id = p_roster_id;
  PERFORM experience_console_audit('experience.roster_plan_changed', 'experience_roster', p_roster_id,
    jsonb_build_object('experience_id', r_experience, 'creator_id', r_creator,
      'before', r_planned, 'after', p_deliverables));
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_roster_remove(p_roster_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  r_id uuid; r_experience uuid; r_creator uuid; r_locked boolean; r_decision text;
BEGIN
  PERFORM experience_console_require();
  SELECT r.id, r.experience_id, r.creator_id, r.locked, r.brand_decision
    INTO r_id, r_experience, r_creator, r_locked, r_decision
    FROM experience_roster r WHERE r.id = p_roster_id FOR UPDATE;
  IF r_id IS NULL THEN RAISE EXCEPTION 'Roster entry not found'; END IF;
  IF r_locked THEN RAISE EXCEPTION 'A locked creator cannot be removed'; END IF;
  DELETE FROM experience_roster WHERE id = p_roster_id;
  PERFORM experience_console_audit('experience.roster_removed', 'experience_roster', p_roster_id,
    jsonb_build_object('experience_id', r_experience, 'creator_id', r_creator, 'decision', r_decision));
END;
$function$;

-- ── J. Who may call what ───────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION experience_leg_owner(uuid)                    FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION experience_item_type(text)                    FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION experience_leg_work_complete(uuid)            FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION experience_shoot_rollup(uuid)                 FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION experience_deliverables_progress(uuid)        FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION experience_item_gate(uuid, text)              FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION experience_item_path(uuid, uuid, text, int, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION experience_item_put(uuid, uuid, text, int, text, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION check_deliverable_release()                   FROM PUBLIC, anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION experience_console_schedule_shoot(uuid)                 FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_leg_shoot_outcome(uuid, text, text)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_leg_shoot_undo(uuid, text)           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_leg_withdraw(uuid, text)             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_deliverables(uuid)                   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_item_upload_slot(uuid, text)         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_item_attach(uuid, text, text, text)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_item_review(uuid, text, text)        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_item_file(uuid)                      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_release(uuid, uuid[])                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_release_withdraw(uuid, text)         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_release_decide(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION creator_leg_item_upload_slot(uuid, text)                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION creator_leg_item_submit(uuid, text, text, text)         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION brand_experience_deliverables(uuid)                     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION brand_experience_release_file(uuid)                     FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION experience_console_schedule_shoot(uuid)                 TO authenticated;
GRANT EXECUTE ON FUNCTION experience_console_leg_shoot_outcome(uuid, text, text)  TO authenticated;
GRANT EXECUTE ON FUNCTION experience_console_leg_shoot_undo(uuid, text)           TO authenticated;
GRANT EXECUTE ON FUNCTION experience_console_leg_withdraw(uuid, text)             TO authenticated;
GRANT EXECUTE ON FUNCTION experience_console_deliverables(uuid)                   TO authenticated;
GRANT EXECUTE ON FUNCTION experience_console_item_upload_slot(uuid, text)         TO authenticated;
GRANT EXECUTE ON FUNCTION experience_console_item_attach(uuid, text, text, text)  TO authenticated;
GRANT EXECUTE ON FUNCTION experience_console_item_review(uuid, text, text)        TO authenticated;
GRANT EXECUTE ON FUNCTION experience_console_item_file(uuid)                      TO authenticated;
GRANT EXECUTE ON FUNCTION experience_console_release(uuid, uuid[])                TO authenticated;
GRANT EXECUTE ON FUNCTION experience_console_release_withdraw(uuid, text)         TO authenticated;
GRANT EXECUTE ON FUNCTION experience_console_release_decide(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION creator_leg_item_upload_slot(uuid, text)                TO authenticated;
GRANT EXECUTE ON FUNCTION creator_leg_item_submit(uuid, text, text, text)         TO authenticated;
GRANT EXECUTE ON FUNCTION brand_experience_deliverables(uuid)                     TO authenticated;
GRANT EXECUTE ON FUNCTION brand_experience_release_file(uuid)                     TO authenticated;

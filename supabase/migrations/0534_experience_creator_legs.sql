-- 0534: Experience creator legs (Leg 2): staff send each locked, accepted
-- creator their own deal, priced from their shoot package (0533).
--
-- Money: gross = day rate × days (rounded half up); fee = gross × the creator's
-- own track % (Growth 30, Deals 15), rounded half up; net = gross − fee. Same
-- rule as lib/experience-money.ts creatorLegTerms. The server action computes
-- it there and passes the figures in; the send function re-derives every one
-- (day rate from the package row, track from creators.vetting_status) and
-- refuses a mismatch. The browser never supplies a price, a % or a track.
-- Two CHECKs then prove the stored result: ect_gross_formula (new) and
-- ect_net_formula (0525). resolveDealFee is never involved. NO money moves:
-- no payout, no invoice, no paid state (Phase 4); refused at the data layer.
--
-- The house brand has no members, so no session can act as the brand side of
-- a leg. Every Guapd-side action is a staff-gated SECURITY DEFINER function
-- called from the staff member's own session (experience_console_require),
-- audited to ops_events. Brand membership is never consulted. The creator's
-- only action is accept / decline, through creator_leg_respond. Every other
-- session write on a creator leg is refused by trigger.
--
-- Reconciliation (the 3a check, moved to the legs): for each locked, accepted
-- creator whose leg is not declined, count their leg deliverables (or the
-- roster plan until a leg is drafted). A draft or send that would take the
-- total past what was sold is refused: per type when the brand bought the
-- plan's count, combined videos when the count was negotiated away from it,
-- and the affiliate total against what was agreed. Affiliate is a FLAG ON
-- VIDEOS (a count of a leg's videos that carry the link), never a separate
-- deliverable. Days drive money only and never scale deliverables.
--
-- No SELECT * anywhere below: every read names its columns.

-- ── 1. Columns ──────────────────────────────────────────────────────────────
ALTER TABLE experience_creator_terms
  ADD COLUMN IF NOT EXISTS product_id   uuid REFERENCES creator_products (id),
  ADD COLUMN IF NOT EXISTS pricing_type text REFERENCES package_pricing_types (id);

-- Existing rows have pricing_type NULL and pass; a per_day row must prove its gross.
ALTER TABLE experience_creator_terms DROP CONSTRAINT IF EXISTS ect_gross_formula;
ALTER TABLE experience_creator_terms ADD CONSTRAINT ect_gross_formula CHECK (
  pricing_type IS DISTINCT FROM 'per_day' OR (
        day_rate_paise IS NOT NULL
    AND days IS NOT NULL
    AND product_id IS NOT NULL
    AND creator_gross_paise::numeric = round(day_rate_paise::numeric * days)
  )
);

CREATE OR REPLACE FUNCTION freeze_locked_creator_terms() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.locked_at IS NOT NULL THEN
    IF (NEW.day_rate_paise, NEW.days, NEW.creator_gross_paise, NEW.platform_pct, NEW.creator_net_paise,
        NEW.platform_track, NEW.locked_at, NEW.product_id, NEW.pricing_type)
       IS DISTINCT FROM
       (OLD.day_rate_paise, OLD.days, OLD.creator_gross_paise, OLD.platform_pct, OLD.creator_net_paise,
        OLD.platform_track, OLD.locked_at, OLD.product_id, OLD.pricing_type) THEN
      RAISE EXCEPTION 'These creator terms are agreed and locked; change them with a new or extended leg';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Affiliate is a flag on a video, not a deliverable of its own.
ALTER TABLE deal_deliverable_items ADD COLUMN IF NOT EXISTS affiliate_link boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN deal_deliverable_items.affiliate_link IS
  'This video carries the affiliate link (Experience creator legs). Scope only: no money flow.';

-- The leg draft, on the roster row. Not in the brand''s 0523 column grant.
ALTER TABLE experience_roster
  ADD COLUMN IF NOT EXISTS leg_product_id      uuid REFERENCES creator_products (id),
  ADD COLUMN IF NOT EXISTS leg_days            numeric(6,2) CHECK (leg_days IS NULL OR (leg_days > 0 AND leg_days <= 365)),
  ADD COLUMN IF NOT EXISTS leg_deliverables    jsonb CHECK (leg_deliverables IS NULL OR jsonb_typeof(leg_deliverables) = 'array'),
  ADD COLUMN IF NOT EXISTS leg_affiliate_count int CHECK (leg_affiliate_count IS NULL OR leg_affiliate_count >= 0),
  ADD COLUMN IF NOT EXISTS leg_deal_id         uuid UNIQUE REFERENCES deals (id),
  ADD COLUMN IF NOT EXISTS leg_sent_at         timestamptz;

-- What creators on this Experience are told about it. Written by staff; the
-- brand's raw request brief is never shown to a creator. Not in any grant.
ALTER TABLE experiences ADD COLUMN IF NOT EXISTS creator_brief text;

-- ── 2. Guards: creator legs change only through Guapd ──────────────────────
-- A session (creator, or anyone) cannot update a creator leg directly. Accept /
-- decline goes through creator_leg_respond; everything else through staff.
CREATE OR REPLACE FUNCTION guard_creator_leg_deal_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'An Experience creator deal changes only through Guapd' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS t_deals_02_creator_leg_guard ON deals;
CREATE TRIGGER t_deals_02_creator_leg_guard BEFORE UPDATE ON deals
  FOR EACH ROW WHEN (OLD.leg_role = 'creator_leg') EXECUTE FUNCTION guard_creator_leg_deal_write();

-- No money moves on a creator leg in this stage, by anyone.
CREATE OR REPLACE FUNCTION guard_creator_leg_no_money() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'No payment is recorded on an Experience creator leg yet' USING ERRCODE = '42501';
END;
$$;
DROP TRIGGER IF EXISTS t_deals_03_creator_leg_no_paid ON deals;
CREATE TRIGGER t_deals_03_creator_leg_no_paid BEFORE UPDATE OF status ON deals
  FOR EACH ROW WHEN (NEW.leg_role = 'creator_leg' AND NEW.status = 'paid') EXECUTE FUNCTION guard_creator_leg_no_money();

-- Items, uploads and messages on a creator leg: no session writes. Invoker
-- rights on purpose, so current_user is the caller; a staff definer function
-- (later stages) runs as the owner and passes.
CREATE OR REPLACE FUNCTION guard_creator_leg_child_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_deal uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.deal_id ELSE NEW.deal_id END;
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND EXISTS (SELECT 1 FROM deals d WHERE d.id = v_deal AND d.leg_role = 'creator_leg') THEN
    RAISE EXCEPTION 'An Experience creator deal changes only through Guapd' USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
DROP TRIGGER IF EXISTS t_ddi_creator_leg_guard ON deal_deliverable_items;
CREATE TRIGGER t_ddi_creator_leg_guard BEFORE INSERT OR UPDATE OR DELETE ON deal_deliverable_items
  FOR EACH ROW EXECUTE FUNCTION guard_creator_leg_child_write();
DROP TRIGGER IF EXISTS t_deliverables_creator_leg_guard ON deliverables;
CREATE TRIGGER t_deliverables_creator_leg_guard BEFORE INSERT OR UPDATE OR DELETE ON deliverables
  FOR EACH ROW EXECUTE FUNCTION guard_creator_leg_child_write();
DROP TRIGGER IF EXISTS t_messages_creator_leg_guard ON messages;
CREATE TRIGGER t_messages_creator_leg_guard BEFORE INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION guard_creator_leg_child_write();

-- A marketplace invoice can never be raised on a creator leg, by anyone.
CREATE OR REPLACE FUNCTION guard_creator_leg_invoice() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM deals d WHERE d.id = NEW.deal_id AND d.leg_role = 'creator_leg') THEN
    RAISE EXCEPTION 'No invoice is raised on an Experience creator leg' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS t_invoices_creator_leg_guard ON invoices;
CREATE TRIGGER t_invoices_creator_leg_guard BEFORE INSERT ON invoices
  FOR EACH ROW EXECUTE FUNCTION guard_creator_leg_invoice();

-- ── 3. Helpers (not callable by anyone) ─────────────────────────────────────
-- Video types: the ones affiliate, ad rights and boost apply to.
CREATE OR REPLACE FUNCTION experience_video_count(p_deliverables jsonb)
RETURNS int LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT coalesce(sum((d ->> 'count')::int), 0)::int
  FROM jsonb_array_elements(coalesce(p_deliverables, '[]'::jsonb)) d
  WHERE d ->> 'type' IN ('UGC video', 'Reel') AND (d ->> 'count') ~ '^[0-9]+$'
$$;

-- Validates a deliverable list; raises on anything malformed.
CREATE OR REPLACE FUNCTION experience_check_deliverables(p_deliverables jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  d jsonb;
  v_total int := 0;
BEGIN
  IF jsonb_typeof(coalesce(p_deliverables, 'null'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Deliverables must be a list';
  END IF;
  FOR d IN SELECT x FROM jsonb_array_elements(p_deliverables) x LOOP
    IF d ->> 'type' NOT IN ('UGC video', 'Reel', 'Story', 'Static post', 'Photo set')
       OR NOT ((d ->> 'count') ~ '^[0-9]+$') OR (d ->> 'count')::int > 500 THEN
      RAISE EXCEPTION 'Each deliverable needs a known type and a whole-number count';
    END IF;
    v_total := v_total + (d ->> 'count')::int;
  END LOOP;
  IF v_total = 0 THEN RAISE EXCEPTION 'A creator needs at least one deliverable'; END IF;
END;
$$;

-- The legs against what was sold. ok = exactly placed; over = past what was sold.
CREATE OR REPLACE FUNCTION experience_legs_reconcile(p_experience_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plan jsonb;
  v_sold int;
  v_plan_videos int;
  v_per_type boolean;
  v_aff_per int;
  v_aff_target int;
  v_aff_placed int := 0;
  v_videos int := 0;
  v_over boolean := false;
  v_exact boolean := true;
  v_lines jsonb := '[]'::jsonb;
  v_creators int := 0;
  v_all jsonb := '[]'::jsonb;
  rec record;
  ln record;
BEGIN
  SELECT e.agreed_plan INTO v_plan FROM experiences e WHERE e.id = p_experience_id;
  IF v_plan IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'over', false, 'reason', 'no_agreed_plan');
  END IF;
  v_sold := (v_plan ->> 'videos_sold')::int;
  v_plan_videos := (v_plan ->> 'plan_videos')::int;
  v_per_type := v_sold = v_plan_videos;
  v_aff_per := nullif(v_plan ->> 'affiliate_per_creator', '')::int;
  v_aff_target := coalesce(v_aff_per, 0) * coalesce(nullif(v_plan ->> 'creator_count', '')::int, 0);

  -- Who counts: locked, accepted, leg not declined or cancelled. Their
  -- deliverables are gathered into one list and summed per type below.
  FOR rec IN
    SELECT coalesce(r.leg_deliverables, r.planned_deliverables) AS dl, r.leg_affiliate_count AS aff
    FROM experience_roster r
    LEFT JOIN deals d ON d.id = r.leg_deal_id
    WHERE r.experience_id = p_experience_id AND r.locked AND r.brand_decision = 'accepted'
      AND (d.id IS NULL OR d.status NOT IN ('declined', 'cancelled'))
  LOOP
    v_creators := v_creators + 1;
    v_all := v_all || coalesce(rec.dl, '[]'::jsonb);
    -- Undrafted: the agreed per-creator affiliate, capped at this creator's videos.
    v_aff_placed := v_aff_placed + coalesce(rec.aff, least(coalesce(v_aff_per, 0), experience_video_count(rec.dl)));
  END LOOP;

  FOR ln IN
    WITH placed AS (SELECT x ->> 'type' AS type, sum((x ->> 'count')::int)::int AS n
                    FROM jsonb_array_elements(v_all) x WHERE (x ->> 'count') ~ '^[0-9]+$' GROUP BY x ->> 'type'),
         target AS (SELECT t ->> 'type' AS type, (t ->> 'total')::int AS n FROM jsonb_array_elements(coalesce(v_plan -> 'totals', '[]'::jsonb)) t)
    SELECT coalesce(t.type, p.type) AS type, coalesce(t.n, 0) AS target, coalesce(p.n, 0) AS placed,
           coalesce(t.type, p.type) IN ('UGC video', 'Reel') AS is_video
    FROM target t FULL JOIN placed p ON p.type = t.type
    ORDER BY 1
  LOOP
    v_lines := v_lines || jsonb_build_object('type', ln.type, 'target', ln.target, 'placed', ln.placed, 'is_video', ln.is_video);
    IF ln.is_video THEN v_videos := v_videos + ln.placed; END IF;
    IF NOT ln.is_video OR v_per_type THEN
      IF ln.placed > ln.target THEN v_over := true; END IF;
      IF ln.placed <> ln.target THEN v_exact := false; END IF;
    END IF;
  END LOOP;

  IF v_videos > v_sold THEN v_over := true; END IF;
  IF v_videos <> v_sold THEN v_exact := false; END IF;
  IF v_aff_placed > v_aff_target THEN v_over := true; END IF;
  IF v_aff_placed <> v_aff_target THEN v_exact := false; END IF;

  RETURN jsonb_build_object(
    'ok', v_exact AND NOT v_over, 'over', v_over, 'per_type', v_per_type,
    'videos_sold', v_sold, 'videos_placed', v_videos,
    'affiliate_target', v_aff_target, 'affiliate_placed', v_aff_placed,
    'creators_counted', v_creators, 'lines', v_lines);
END;
$$;

-- A creator's platform % from THEIR track. Mirrors lib/experience-money.ts
-- platformPctForTrack and lib/deal-track.ts trackForCreator; the send function
-- also compares against the server action's figures, so a drift in either
-- place is refused rather than stored.
CREATE OR REPLACE FUNCTION experience_creator_track(p_creator_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN c.vetting_status = 'growth' THEN 'growth' ELSE 'deals' END
  FROM creators c WHERE c.id = p_creator_id
$$;

-- ── 4. Staff: read the legs and the reconciliation ─────────────────────────
CREATE OR REPLACE FUNCTION experience_console_legs(p_experience_id uuid)
RETURNS TABLE (roster_id uuid, creator_id uuid, full_name text, handle text, profile_photo_url text,
               track text, planned_deliverables jsonb, leg_deliverables jsonb, leg_affiliate_count int,
               leg_days numeric, leg_product_id uuid, day_rate_product_id uuid, day_rate_paise bigint,
               leg_deal_id uuid, leg_sent_at timestamptz, deal_status text, deal_ref text,
               sent_day_rate_paise bigint, sent_days numeric, sent_gross_paise bigint, sent_platform_pct numeric,
               sent_net_paise bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM experience_console_require();
  RETURN QUERY
    SELECT r.id, r.creator_id, c.full_name, c.handle, c.profile_photo_url,
           experience_creator_track(r.creator_id),
           r.planned_deliverables, r.leg_deliverables, r.leg_affiliate_count, r.leg_days, r.leg_product_id,
           cp.id, cp.price_paise,
           r.leg_deal_id, r.leg_sent_at, d.status::text, d.deal_ref,
           t.day_rate_paise, t.days, t.creator_gross_paise, t.platform_pct, t.creator_net_paise
    FROM experience_roster r
    JOIN creators c ON c.id = r.creator_id
    LEFT JOIN creator_products cp ON cp.creator_id = r.creator_id AND cp.pricing_type = 'per_day' AND cp.is_active
    LEFT JOIN deals d ON d.id = r.leg_deal_id
    LEFT JOIN experience_creator_terms t ON t.deal_id = r.leg_deal_id
    WHERE r.experience_id = p_experience_id AND r.locked AND r.brand_decision = 'accepted'
    ORDER BY r.locked_at, r.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_legs_reconcile(p_experience_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM experience_console_require();
  RETURN experience_legs_reconcile(p_experience_id);
END;
$$;

-- ── 5. Staff: the creator brief ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION experience_console_set_creator_brief(p_experience_id uuid, p_brief text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_before text;
  v text := nullif(btrim(coalesce(p_brief, '')), '');
BEGIN
  PERFORM experience_console_require();
  SELECT e.creator_brief INTO v_before FROM experiences e WHERE e.id = p_experience_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Experience not found'; END IF;
  UPDATE experiences SET creator_brief = left(v, 4000), updated_at = now() WHERE id = p_experience_id;
  PERFORM experience_console_audit('experience.creator_brief_set', 'experiences', p_experience_id,
    jsonb_build_object('length_before', coalesce(length(v_before), 0), 'length_after', coalesce(length(v), 0)));
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_creator_brief(p_experience_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v text;
BEGIN
  PERFORM experience_console_require();
  SELECT e.creator_brief INTO v FROM experiences e WHERE e.id = p_experience_id;
  RETURN v;
END;
$$;

-- ── 6. Staff: draft a leg ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION experience_console_leg_draft(p_roster_id uuid, p_product_id uuid, p_days numeric,
                                                        p_deliverables jsonb, p_affiliate_count int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_exp uuid;
  v_status text;
  v_aff_per int;
  v_creator uuid;
  v_locked boolean;
  v_decision text;
  v_sent uuid;
  v_before jsonb;
  v_videos int;
  v_rec jsonb;
BEGIN
  PERFORM experience_console_require();
  SELECT r.experience_id INTO v_exp FROM experience_roster r WHERE r.id = p_roster_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Roster entry not found'; END IF;
  -- Experience first, then the roster row: every leg write serialises on the
  -- Experience, so two drafts cannot both pass the ceiling.
  SELECT e.status, nullif(e.agreed_plan ->> 'affiliate_per_creator', '')::int INTO v_status, v_aff_per
    FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT r.creator_id, r.locked, r.brand_decision, r.leg_deal_id,
         jsonb_build_object('product_id', r.leg_product_id, 'days', r.leg_days, 'deliverables', r.leg_deliverables, 'affiliate_count', r.leg_affiliate_count)
    INTO v_creator, v_locked, v_decision, v_sent, v_before
    FROM experience_roster r WHERE r.id = p_roster_id FOR UPDATE;

  IF v_status <> 'confirmed' THEN RAISE EXCEPTION 'Creator deals are prepared once the roster is locked and the Experience is Confirmed'; END IF;
  IF NOT v_locked OR v_decision <> 'accepted' THEN RAISE EXCEPTION 'Only a locked, accepted creator gets a deal'; END IF;
  IF v_sent IS NOT NULL THEN RAISE EXCEPTION 'This creator''s deal is already sent; its terms are frozen'; END IF;

  IF p_product_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM creator_products cp
    WHERE cp.id = p_product_id AND cp.creator_id = v_creator AND cp.pricing_type = 'per_day' AND cp.is_active
  ) THEN
    RAISE EXCEPTION 'Pick this creator''s own active shoot day rate';
  END IF;
  IF p_days IS NOT NULL AND (p_days <= 0 OR p_days > 365 OR p_days * 100 <> round(p_days * 100)) THEN
    RAISE EXCEPTION 'Days must be more than 0, at most 365, with at most two decimals';
  END IF;
  PERFORM experience_check_deliverables(p_deliverables);
  v_videos := experience_video_count(p_deliverables);
  IF p_affiliate_count IS NULL OR p_affiliate_count < 0 THEN
    RAISE EXCEPTION 'Say how many of this creator''s videos carry the affiliate link (0 for none)';
  END IF;
  IF p_affiliate_count > v_videos THEN
    RAISE EXCEPTION 'More videos with the affiliate link (%) than videos (%)', p_affiliate_count, v_videos;
  END IF;
  IF p_affiliate_count > 0 AND v_aff_per IS NULL THEN
    RAISE EXCEPTION 'The brand did not buy affiliate links on this Experience';
  END IF;

  UPDATE experience_roster SET leg_product_id = p_product_id, leg_days = p_days,
         leg_deliverables = p_deliverables, leg_affiliate_count = p_affiliate_count, updated_at = now()
    WHERE id = p_roster_id;

  v_rec := experience_legs_reconcile(v_exp);
  IF (v_rec ->> 'over')::boolean THEN
    RAISE EXCEPTION 'That would place more than the brand bought: % of % videos, % of % with the affiliate link',
      v_rec ->> 'videos_placed', v_rec ->> 'videos_sold', v_rec ->> 'affiliate_placed', v_rec ->> 'affiliate_target';
  END IF;

  PERFORM experience_console_audit('experience.leg_drafted', 'experience_roster', p_roster_id,
    jsonb_build_object('experience_id', v_exp, 'creator_id', v_creator, 'before', v_before,
      'after', jsonb_build_object('product_id', p_product_id, 'days', p_days, 'deliverables', p_deliverables, 'affiliate_count', p_affiliate_count)));
  RETURN v_rec;
END;
$$;

-- ── 7. Staff: send a leg ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION experience_console_leg_send(p_roster_id uuid, p_expected_gross_paise bigint,
                                                       p_expected_platform_pct numeric, p_expected_net_paise bigint)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_exp uuid;
  e_status text; e_title text; e_brand uuid; e_template uuid; e_template_version int; e_settings jsonb;
  v_aff_per int;
  r_creator uuid; r_locked boolean; r_decision text; r_sent uuid;
  r_product uuid; r_days numeric; r_deliverables jsonb; r_aff int;
  v_rate bigint;
  v_track text;
  v_pct numeric;
  v_gross bigint;
  v_net bigint;
  v_brand_name text;
  v_deal uuid;
  v_rec jsonb;
  d jsonb;
  i int;
  v_aff_left int;
BEGIN
  PERFORM experience_console_require();
  SELECT r.experience_id INTO v_exp FROM experience_roster r WHERE r.id = p_roster_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Roster entry not found'; END IF;
  SELECT e.status, e.title, e.brand_id, e.template_id, e.template_version, e.settings_snapshot,
         nullif(e.agreed_plan ->> 'affiliate_per_creator', '')::int
    INTO e_status, e_title, e_brand, e_template, e_template_version, e_settings, v_aff_per
    FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT r.creator_id, r.locked, r.brand_decision, r.leg_deal_id, r.leg_product_id, r.leg_days,
         coalesce(r.leg_deliverables, r.planned_deliverables), r.leg_affiliate_count
    INTO r_creator, r_locked, r_decision, r_sent, r_product, r_days, r_deliverables, r_aff
    FROM experience_roster r WHERE r.id = p_roster_id FOR UPDATE;

  IF e_status <> 'confirmed' THEN RAISE EXCEPTION 'Creator deals are sent once the roster is locked and the Experience is Confirmed'; END IF;
  IF NOT r_locked OR r_decision <> 'accepted' THEN RAISE EXCEPTION 'Only a locked, accepted creator gets a deal'; END IF;
  IF r_sent IS NOT NULL THEN RAISE EXCEPTION 'This creator''s deal is already sent'; END IF;
  IF NOT EXISTS (SELECT 1 FROM creators c WHERE c.id = r_creator AND c.is_bookable AND NOT c.is_guapd) THEN
    RAISE EXCEPTION 'This creator is no longer bookable';
  END IF;
  IF r_product IS NULL OR r_days IS NULL THEN RAISE EXCEPTION 'Pick the shoot day rate and the number of days first'; END IF;
  PERFORM experience_check_deliverables(r_deliverables);
  r_aff := coalesce(r_aff, least(coalesce(v_aff_per, 0), experience_video_count(r_deliverables)));

  -- Money, re-derived here from the package row and the creator's own track.
  SELECT cp.price_paise INTO v_rate FROM creator_products cp
    WHERE cp.id = r_product AND cp.creator_id = r_creator AND cp.pricing_type = 'per_day' AND cp.is_active;
  IF v_rate IS NULL THEN RAISE EXCEPTION 'This creator''s shoot day rate is no longer active; pick it again'; END IF;
  v_track := experience_creator_track(r_creator);
  v_pct := CASE v_track WHEN 'growth' THEN 30 ELSE 15 END;
  v_gross := round(v_rate::numeric * r_days)::bigint;
  v_net := v_gross - round(v_gross::numeric * v_pct / 100)::bigint;
  IF p_expected_gross_paise IS DISTINCT FROM v_gross OR p_expected_platform_pct IS DISTINCT FROM v_pct
     OR p_expected_net_paise IS DISTINCT FROM v_net THEN
    RAISE EXCEPTION 'The terms changed since this screen loaded (now % gross, % %%, % net). Reload and check before sending', v_gross, v_pct, v_net;
  END IF;

  -- Pin the draft as sent, then check the total cannot go past what was sold.
  UPDATE experience_roster SET leg_deliverables = r_deliverables, leg_affiliate_count = r_aff WHERE id = p_roster_id;
  v_rec := experience_legs_reconcile(v_exp);
  IF (v_rec ->> 'over')::boolean THEN
    RAISE EXCEPTION 'Sending this would place more than the brand bought: % of % videos, % of % with the affiliate link',
      v_rec ->> 'videos_placed', v_rec ->> 'videos_sold', v_rec ->> 'affiliate_placed', v_rec ->> 'affiliate_target';
  END IF;

  SELECT b.name INTO v_brand_name FROM brands b WHERE b.id = e_brand;

  INSERT INTO deals (brand_id, creator_id, status, title, price_paise, experience_id, leg_role, payment_flow,
                     track, experience_brand_name, template_id, template_version, settings_snapshot)
  VALUES (guapd_brand_id(), r_creator, 'negotiating', e_title, NULL, v_exp, 'creator_leg', 'guapd_principal_vendor_payout',
          v_track, v_brand_name, e_template, e_template_version, e_settings)
  RETURNING id INTO v_deal;

  -- One item per unit, so each video can later be marked done on its own.
  -- The first N videos carry the affiliate link.
  v_aff_left := r_aff;
  FOR d IN SELECT x FROM jsonb_array_elements(r_deliverables) x LOOP
    FOR i IN 1 .. (d ->> 'count')::int LOOP
      INSERT INTO deal_deliverable_items (deal_id, label, platform, handle, price_paise, added_by, visible_to_creator,
                                          ig_match_status, affiliate_link)
      VALUES (v_deal, (d ->> 'type') || CASE WHEN (d ->> 'count')::int > 1 THEN ' ' || i ELSE '' END,
              'shoot', '', NULL, 'guapd', true, 'unsupported',
              (d ->> 'type') IN ('UGC video', 'Reel') AND v_aff_left > 0);
      IF (d ->> 'type') IN ('UGC video', 'Reel') AND v_aff_left > 0 THEN v_aff_left := v_aff_left - 1; END IF;
    END LOOP;
  END LOOP;

  INSERT INTO experience_creator_terms (deal_id, experience_id, creator_id, day_rate_paise, days, creator_gross_paise,
                                        platform_pct, creator_net_paise, platform_track, product_id, pricing_type, locked_at)
  VALUES (v_deal, v_exp, r_creator, v_rate, r_days, v_gross, v_pct, v_net, v_track, r_product, 'per_day', now());

  UPDATE experience_roster SET leg_deal_id = v_deal, leg_sent_at = now(), updated_at = now() WHERE id = p_roster_id;

  INSERT INTO events (deal_id, actor_id, event_type, detail)
  VALUES (v_deal, my_user_id(), 'experience.leg_sent',
          jsonb_build_object('by', 'guapd', 'deliverables', r_deliverables, 'affiliate_count', r_aff,
                             'day_rate_paise', v_rate, 'days', r_days, 'gross_paise', v_gross,
                             'platform_pct', v_pct, 'net_paise', v_net));
  PERFORM experience_console_audit('experience.leg_sent', 'deals', v_deal,
    jsonb_build_object('experience_id', v_exp, 'roster_id', p_roster_id, 'creator_id', r_creator,
      'product_id', r_product, 'day_rate_paise', v_rate, 'days', r_days, 'track', v_track,
      'gross_paise_before', NULL, 'gross_paise_after', v_gross, 'platform_pct', v_pct,
      'net_paise_before', NULL, 'net_paise_after', v_net,
      'deliverables', r_deliverables, 'affiliate_count', r_aff, 'status_after', 'negotiating'));
  RETURN v_deal;
END;
$$;

-- ── 8. The creator: their own leg, nothing else ────────────────────────────
CREATE OR REPLACE FUNCTION creator_leg_context(p_deal_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_exp uuid; v_status text; v_ref text; v_brand_name text; v_title text;
  v_logo text; v_shoot_date date; v_shoot_city text; v_brief text; v_plan jsonb;
  v_deliverables jsonb; v_aff int;
  t_rate bigint; t_days numeric; t_gross bigint; t_pct numeric; t_net bigint; t_track text;
  v_videos int;
BEGIN
  SELECT d.experience_id, d.status::text, d.deal_ref, d.experience_brand_name, d.title
    INTO v_exp, v_status, v_ref, v_brand_name, v_title
    FROM deals d
    WHERE d.id = p_deal_id AND d.leg_role = 'creator_leg'
      AND my_creator_id() IS NOT NULL AND d.creator_id = my_creator_id();
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE = '42501'; END IF;

  SELECT b.logo_url, e.shoot_date, e.shoot_city, e.creator_brief, e.agreed_plan
    INTO v_logo, v_shoot_date, v_shoot_city, v_brief, v_plan
    FROM experiences e JOIN brands b ON b.id = e.brand_id WHERE e.id = v_exp;
  SELECT r.leg_deliverables, r.leg_affiliate_count INTO v_deliverables, v_aff
    FROM experience_roster r WHERE r.leg_deal_id = p_deal_id;
  SELECT t.day_rate_paise, t.days, t.creator_gross_paise, t.platform_pct, t.creator_net_paise, t.platform_track
    INTO t_rate, t_days, t_gross, t_pct, t_net, t_track
    FROM experience_creator_terms t WHERE t.deal_id = p_deal_id;
  v_videos := experience_video_count(v_deliverables);

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
    'platform_track', t_track, 'net_paise', t_net);
END;
$$;

CREATE OR REPLACE FUNCTION creator_leg_respond(p_deal_id uuid, p_accept boolean, p_reason text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text;
  v_new text;
BEGIN
  SELECT d.status::text INTO v_status FROM deals d
    WHERE d.id = p_deal_id AND d.leg_role = 'creator_leg'
      AND my_creator_id() IS NOT NULL AND d.creator_id = my_creator_id()
    FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE = '42501'; END IF;
  IF v_status <> 'negotiating' THEN RAISE EXCEPTION 'You have already answered this offer'; END IF;
  IF p_accept IS NULL THEN RAISE EXCEPTION 'Accept or decline'; END IF;

  v_new := CASE WHEN p_accept THEN 'agreed' ELSE 'declined' END;
  IF p_accept THEN
    UPDATE deals SET status = 'agreed', agreed_at = now(), rights_confirmed_at = now() WHERE id = p_deal_id;
  ELSE
    UPDATE deals SET status = 'declined' WHERE id = p_deal_id;
    IF nullif(btrim(coalesce(p_reason, '')), '') IS NOT NULL THEN
      INSERT INTO events (deal_id, actor_id, event_type, detail)
      VALUES (p_deal_id, my_user_id(), 'experience.leg_declined_reason', jsonb_build_object('reason', left(btrim(p_reason), 500)));
    END IF;
  END IF;
  RETURN v_new;
END;
$$;

-- ── 9. Who may call what ───────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION experience_video_count(jsonb)                FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION experience_check_deliverables(jsonb)         FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION experience_legs_reconcile(uuid)              FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION experience_creator_track(uuid)               FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION experience_console_legs(uuid)                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_legs_reconcile(uuid)      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_set_creator_brief(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_creator_brief(uuid)       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_leg_draft(uuid, uuid, numeric, jsonb, int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_leg_send(uuid, bigint, numeric, bigint)    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION creator_leg_context(uuid)                    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION creator_leg_respond(uuid, boolean, text)     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION guard_creator_leg_invoice()                  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION experience_console_legs(uuid)                TO authenticated;
GRANT  EXECUTE ON FUNCTION experience_console_legs_reconcile(uuid)      TO authenticated;
GRANT  EXECUTE ON FUNCTION experience_console_set_creator_brief(uuid, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION experience_console_creator_brief(uuid)       TO authenticated;
GRANT  EXECUTE ON FUNCTION experience_console_leg_draft(uuid, uuid, numeric, jsonb, int) TO authenticated;
GRANT  EXECUTE ON FUNCTION experience_console_leg_send(uuid, bigint, numeric, bigint)    TO authenticated;
GRANT  EXECUTE ON FUNCTION creator_leg_context(uuid)                    TO authenticated;
GRANT  EXECUTE ON FUNCTION creator_leg_respond(uuid, boolean, text)     TO authenticated;

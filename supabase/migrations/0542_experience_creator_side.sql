-- 0542: Phase 5, the creator side of an Experience leg.
--
--   1. COUNTER on a leg. While an offer is open the creator may propose a
--      different day rate and/or days (and Guapd may counter back), at most 3
--      rounds each way, all kept. A counter changes the PROPOSED gross only:
--      the fee % snapshotted at send never changes, deliverables never change
--      (so the video-count reconcile guard is untouched), and once the creator
--      and Guapd agree the leg freezes exactly as before. A counter can never
--      reopen a frozen leg. Who may accept is decided by DIRECTION: a counter
--      that lowers or holds Guapd's cost, operational staff; one that RAISES
--      it, financial staff only (operational staff cannot see the margin).
--   2. DAY RATE. One active rate per creator, set and paused by the creator.
--      Staff can no longer create a second active rate over a paused one;
--      while a creator's rate is paused (or not set) staff enter the rate on
--      the leg itself ("entered"), never a second package.
--   3. BANK DETAILS. Creator-entered, encrypted at rest (account number, PAN)
--      with a key held in Supabase Vault, in a table no user can read.
--      The creator reads them back masked; operational staff see ••••1234;
--      only FINANCE sees them in full, each view audited without values.
--      Never to brands, never in audit rows, events, notifications or email.
--   4. PAYING. Operational staff REQUEST a payout; FINANCE approves (not the
--      requester) and pays. A bank-detail change after the request is flagged
--      and must be confirmed before approval.
--   5. The creator's own payouts, for their Payments page and earnings.
--
-- NULL means no on every gate (0539). Explicit columns. Staging first.

-- ═════ 1a. Terms: a rate may be ENTERED on the leg (creator's rate paused or unset) ═════
ALTER TABLE experience_creator_terms ADD COLUMN IF NOT EXISTS rate_source text NOT NULL DEFAULT 'package';
ALTER TABLE experience_creator_terms DROP CONSTRAINT IF EXISTS ect_rate_source;
ALTER TABLE experience_creator_terms ADD CONSTRAINT ect_rate_source CHECK (rate_source IN ('package', 'entered'));
ALTER TABLE experience_creator_terms DROP CONSTRAINT IF EXISTS ect_gross_formula;
ALTER TABLE experience_creator_terms ADD CONSTRAINT ect_gross_formula CHECK (
  pricing_type IS DISTINCT FROM 'per_day'
  OR (day_rate_paise IS NOT NULL AND days IS NOT NULL
      AND creator_gross_paise::numeric = round(day_rate_paise::numeric * days)
      AND (product_id IS NOT NULL OR rate_source = 'entered')));

ALTER TABLE experience_roster ADD COLUMN IF NOT EXISTS leg_entered_rate_paise bigint;
ALTER TABLE experience_roster DROP CONSTRAINT IF EXISTS er_entered_rate_shape;
ALTER TABLE experience_roster ADD CONSTRAINT er_entered_rate_shape CHECK (
  (leg_entered_rate_paise IS NULL OR (leg_entered_rate_paise BETWEEN 100 AND 1000000000 AND leg_entered_rate_paise % 100 = 0))
  AND (leg_entered_rate_paise IS NULL OR leg_product_id IS NULL));

-- Sent terms are frozen. The ONE exception: while the deal is still open,
-- an accepted counter re-prices day rate / days / gross / net, through
-- experience_leg_reprice only (it sets a transaction-local flag naming the
-- deal). The fee %, track, package, rate source and lock time never change.
CREATE OR REPLACE FUNCTION freeze_locked_creator_terms() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.locked_at IS NOT NULL THEN
    IF (NEW.platform_pct, NEW.platform_track, NEW.locked_at, NEW.product_id, NEW.pricing_type, NEW.rate_source, NEW.deal_id, NEW.creator_id, NEW.experience_id)
       IS DISTINCT FROM
       (OLD.platform_pct, OLD.platform_track, OLD.locked_at, OLD.product_id, OLD.pricing_type, OLD.rate_source, OLD.deal_id, OLD.creator_id, OLD.experience_id) THEN
      RAISE EXCEPTION 'These creator terms are agreed and locked; change them with a new or extended leg';
    END IF;
    IF (NEW.day_rate_paise, NEW.days, NEW.creator_gross_paise, NEW.creator_net_paise)
       IS DISTINCT FROM (OLD.day_rate_paise, OLD.days, OLD.creator_gross_paise, OLD.creator_net_paise) THEN
      IF current_setting('guapd.leg_reprice', true) IS DISTINCT FROM OLD.deal_id::text
         OR NOT EXISTS (SELECT 1 FROM deals d WHERE d.id = OLD.deal_id AND d.status = 'negotiating') THEN
        RAISE EXCEPTION 'These creator terms are agreed and locked; change them with a new or extended leg';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ═════ 1b. Counters ═════
CREATE TABLE IF NOT EXISTS experience_leg_counters (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id         uuid NOT NULL REFERENCES deals (id) ON DELETE CASCADE,
  experience_id   uuid NOT NULL REFERENCES experiences (id) ON DELETE CASCADE,
  round           int NOT NULL CHECK (round BETWEEN 1 AND 3),
  proposed_by     text NOT NULL CHECK (proposed_by IN ('creator', 'guapd')),
  day_rate_paise  bigint NOT NULL CHECK (day_rate_paise BETWEEN 100 AND 1000000000 AND day_rate_paise % 100 = 0),
  days            numeric NOT NULL CHECK (days > 0 AND days <= 365 AND days * 100 = round(days * 100)),
  gross_paise     bigint NOT NULL,
  platform_pct    numeric NOT NULL,
  net_paise       bigint NOT NULL,
  note            text CHECK (note IS NULL OR length(note) <= 500),
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'declined', 'withdrawn', 'superseded')),
  created_by      uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  decided_at      timestamptz,
  decided_by      uuid REFERENCES users (id) ON DELETE SET NULL,
  decision_note   text CHECK (decision_note IS NULL OR length(decision_note) <= 500),
  CONSTRAINT elc_gross CHECK (gross_paise::numeric = round(day_rate_paise::numeric * days)),
  CONSTRAINT elc_net CHECK (net_paise::numeric = gross_paise::numeric - round(gross_paise::numeric * platform_pct / 100)),
  CONSTRAINT elc_decided CHECK ((status = 'open') = (decided_at IS NULL)),
  CONSTRAINT elc_round_once UNIQUE (deal_id, proposed_by, round)
);
CREATE UNIQUE INDEX IF NOT EXISTS elc_one_open ON experience_leg_counters (deal_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS elc_experience_idx ON experience_leg_counters (experience_id);
COMMENT ON TABLE experience_leg_counters IS
  'Counter-offers on an Experience creator leg while it is open: creator and Guapd, 3 rounds each, all kept. The fee % is the one snapshotted at send. Read through creator_leg_context (own) and the console only.';
ALTER TABLE experience_leg_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON experience_leg_counters FROM anon, authenticated;

CREATE OR REPLACE FUNCTION guard_leg_counter() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_user IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'A counter is kept, never deleted'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (
      SELECT 1 FROM deals d JOIN experience_creator_terms t ON t.deal_id = d.id
      WHERE d.id = NEW.deal_id AND d.leg_role = 'creator_leg' AND d.experience_id = NEW.experience_id
        AND d.status = 'negotiating' AND t.locked_at IS NOT NULL AND t.platform_pct = NEW.platform_pct
    ) THEN
      RAISE EXCEPTION 'A counter is on an open creator leg, at the fee %% snapshotted when it was sent';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status IS DISTINCT FROM 'open' THEN RAISE EXCEPTION 'A decided counter is final'; END IF;
  IF (to_jsonb(NEW) - ARRAY['status', 'decided_at', 'decided_by', 'decision_note']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'decided_at', 'decided_by', 'decision_note']) THEN
    RAISE EXCEPTION 'A counter''s figures do not change; make a new one';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS t_elc_guard ON experience_leg_counters;
CREATE TRIGGER t_elc_guard BEFORE INSERT OR UPDATE OR DELETE ON experience_leg_counters
  FOR EACH ROW EXECUTE FUNCTION guard_leg_counter();

-- Validates a proposed rate / days and returns them priced at the leg's
-- snapshotted fee %, with the direction against the current terms.
CREATE OR REPLACE FUNCTION experience_counter_price(p_deal_id uuid, p_day_rate_paise bigint, p_days numeric)
RETURNS TABLE (gross_paise bigint, platform_pct numeric, net_paise bigint, direction text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t record; v_gross bigint;
BEGIN
  IF p_day_rate_paise IS NULL OR p_day_rate_paise < 100 OR p_day_rate_paise > 1000000000 OR p_day_rate_paise % 100 <> 0 THEN
    RAISE EXCEPTION 'A day rate is a whole number of rupees between ₹1 and ₹1,00,00,000';
  END IF;
  IF p_days IS NULL OR p_days <= 0 OR p_days > 365 OR p_days * 100 <> round(p_days * 100) THEN
    RAISE EXCEPTION 'Days must be more than 0, at most 365, with at most two decimals';
  END IF;
  SELECT x.day_rate_paise, x.days, x.creator_gross_paise, x.platform_pct INTO t FROM experience_creator_terms x WHERE x.deal_id = p_deal_id;
  IF t.platform_pct IS NULL THEN RAISE EXCEPTION 'This deal has no terms'; END IF;
  IF (p_day_rate_paise, p_days) IS NOT DISTINCT FROM (t.day_rate_paise, t.days) THEN
    RAISE EXCEPTION 'That is the current offer: change the day rate or the days';
  END IF;
  IF round(p_day_rate_paise::numeric * p_days) > 1000000000 THEN RAISE EXCEPTION 'That is more than ₹1 crore for this shoot'; END IF;
  v_gross := round(p_day_rate_paise::numeric * p_days)::bigint;
  RETURN QUERY SELECT v_gross, t.platform_pct, v_gross - round(v_gross::numeric * t.platform_pct / 100)::bigint,
    CASE WHEN v_gross > t.creator_gross_paise THEN 'raises' WHEN v_gross < t.creator_gross_paise THEN 'lowers' ELSE 'holds' END;
END;
$$;

-- The one path that re-prices sent terms: only while the deal is open (the
-- freeze trigger checks that and this flag), never the fee %.
CREATE OR REPLACE FUNCTION experience_leg_reprice(p_deal_id uuid, p_day_rate_paise bigint, p_days numeric) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pct numeric; v_gross bigint;
BEGIN
  SELECT t.platform_pct INTO v_pct FROM experience_creator_terms t WHERE t.deal_id = p_deal_id;
  IF v_pct IS NULL THEN RAISE EXCEPTION 'This deal has no terms'; END IF;
  v_gross := round(p_day_rate_paise::numeric * p_days)::bigint;
  PERFORM set_config('guapd.leg_reprice', p_deal_id::text, true);
  UPDATE experience_creator_terms SET day_rate_paise = p_day_rate_paise, days = p_days, creator_gross_paise = v_gross,
    creator_net_paise = v_gross - round(v_gross::numeric * v_pct / 100)::bigint, updated_at = now()
  WHERE deal_id = p_deal_id;
  PERFORM set_config('guapd.leg_reprice', '', true);
  UPDATE experience_roster SET leg_days = p_days, updated_at = now() WHERE leg_deal_id = p_deal_id;
END;
$$;

-- Both sides agree: the leg becomes agreed (as accepting the offer does).
CREATE OR REPLACE FUNCTION experience_leg_agree(p_deal_id uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE deals SET status = 'agreed', agreed_at = now(), rights_confirmed_at = now() WHERE id = p_deal_id AND status = 'negotiating';
$$;

-- ── The creator's side ──
CREATE OR REPLACE FUNCTION creator_leg_counter(p_deal_id uuid, p_day_rate_paise bigint, p_days numeric, p_note text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text; v_exp uuid; v_used int; p record; v_id uuid; v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  SELECT d.status::text, d.experience_id INTO v_status, v_exp FROM deals d
    WHERE d.id = p_deal_id AND d.leg_role = 'creator_leg' AND my_creator_id() IS NOT NULL AND d.creator_id = my_creator_id()
    FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE = '42501'; END IF;
  IF v_status IS DISTINCT FROM 'negotiating' THEN RAISE EXCEPTION 'This offer is already answered; its terms are fixed'; END IF;
  IF v_note IS NOT NULL AND length(v_note) > 500 THEN RAISE EXCEPTION 'The note is too long'; END IF;
  IF EXISTS (SELECT 1 FROM experience_leg_counters c WHERE c.deal_id = p_deal_id AND c.status = 'open' AND c.proposed_by = 'creator') THEN
    RAISE EXCEPTION 'Your counter is waiting for Guapd. Withdraw it to send a different one';
  END IF;
  SELECT count(*)::int INTO v_used FROM experience_leg_counters c WHERE c.deal_id = p_deal_id AND c.proposed_by = 'creator';
  IF v_used >= 3 THEN RAISE EXCEPTION 'You have used your 3 counters on this offer. Accept or decline it'; END IF;
  SELECT x.gross_paise, x.platform_pct, x.net_paise INTO p FROM experience_counter_price(p_deal_id, p_day_rate_paise, p_days) x;
  -- Countering Guapd's open counter answers it.
  UPDATE experience_leg_counters SET status = 'superseded', decided_at = now(), decided_by = my_user_id()
  WHERE deal_id = p_deal_id AND status = 'open' AND proposed_by = 'guapd';
  INSERT INTO experience_leg_counters (deal_id, experience_id, round, proposed_by, day_rate_paise, days, gross_paise, platform_pct, net_paise, note, created_by)
  VALUES (p_deal_id, v_exp, v_used + 1, 'creator', p_day_rate_paise, p_days, p.gross_paise, p.platform_pct, p.net_paise, v_note, my_user_id())
  RETURNING id INTO v_id;
  INSERT INTO events (deal_id, actor_id, event_type, detail)
  VALUES (p_deal_id, my_user_id(), 'experience.leg_counter_proposed', jsonb_build_object('counter_id', v_id, 'by', 'creator', 'round', v_used + 1));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION creator_leg_counter_withdraw(p_counter_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_deal uuid; v_ok boolean;
BEGIN
  SELECT c.deal_id INTO v_deal FROM experience_leg_counters c JOIN deals d ON d.id = c.deal_id
    WHERE c.id = p_counter_id AND my_creator_id() IS NOT NULL AND d.creator_id = my_creator_id();
  IF v_deal IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM deals d WHERE d.id = v_deal FOR UPDATE;
  SELECT (c.status = 'open' AND c.proposed_by = 'creator') INTO v_ok FROM experience_leg_counters c WHERE c.id = p_counter_id FOR UPDATE;
  IF v_ok IS NOT TRUE THEN RAISE EXCEPTION 'Only your own open counter is withdrawn'; END IF;
  UPDATE experience_leg_counters SET status = 'withdrawn', decided_at = now(), decided_by = my_user_id() WHERE id = p_counter_id;
  INSERT INTO events (deal_id, actor_id, event_type, detail)
  VALUES (v_deal, my_user_id(), 'experience.leg_counter_withdrawn', jsonb_build_object('counter_id', p_counter_id, 'by', 'creator'));
END;
$$;

-- The creator accepts GUAPD's counter: re-priced, then agreed (frozen).
CREATE OR REPLACE FUNCTION creator_leg_counter_accept(p_counter_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_deal uuid; v_status text; c record;
BEGIN
  SELECT x.deal_id INTO v_deal FROM experience_leg_counters x JOIN deals d ON d.id = x.deal_id
    WHERE x.id = p_counter_id AND my_creator_id() IS NOT NULL AND d.creator_id = my_creator_id();
  IF v_deal IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE = '42501'; END IF;
  SELECT d.status::text INTO v_status FROM deals d WHERE d.id = v_deal FOR UPDATE;
  SELECT x.status, x.proposed_by, x.day_rate_paise, x.days, x.round INTO c FROM experience_leg_counters x WHERE x.id = p_counter_id FOR UPDATE;
  IF v_status IS DISTINCT FROM 'negotiating' THEN RAISE EXCEPTION 'This offer is already answered; its terms are fixed'; END IF;
  IF c.status IS DISTINCT FROM 'open' OR c.proposed_by IS DISTINCT FROM 'guapd' THEN RAISE EXCEPTION 'Only Guapd''s open counter is accepted here'; END IF;
  PERFORM experience_leg_reprice(v_deal, c.day_rate_paise, c.days);
  UPDATE experience_leg_counters SET status = 'accepted', decided_at = now(), decided_by = my_user_id() WHERE id = p_counter_id;
  PERFORM experience_leg_agree(v_deal);
  INSERT INTO events (deal_id, actor_id, event_type, detail)
  VALUES (v_deal, my_user_id(), 'experience.leg_counter_accepted', jsonb_build_object('counter_id', p_counter_id, 'by', 'creator', 'round', c.round));
  RETURN 'agreed';
END;
$$;

-- Accept / decline the offer as it stands. Accepting while Guapd's counter is
-- open is refused (answer that one); accepting withdraws the creator's own
-- open counter; declining closes any open counter.
CREATE OR REPLACE FUNCTION creator_leg_respond(p_deal_id uuid, p_accept boolean, p_reason text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text; v_new text;
BEGIN
  SELECT d.status::text INTO v_status FROM deals d
    WHERE d.id = p_deal_id AND d.leg_role = 'creator_leg'
      AND my_creator_id() IS NOT NULL AND d.creator_id = my_creator_id()
    FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE = '42501'; END IF;
  IF v_status IS DISTINCT FROM 'negotiating' THEN RAISE EXCEPTION 'You have already answered this offer'; END IF;
  IF p_accept IS NULL THEN RAISE EXCEPTION 'Accept or decline'; END IF;
  IF p_accept AND EXISTS (SELECT 1 FROM experience_leg_counters c WHERE c.deal_id = p_deal_id AND c.status = 'open' AND c.proposed_by = 'guapd') THEN
    RAISE EXCEPTION 'Guapd sent you a new offer. Accept it, counter it, or decline';
  END IF;
  UPDATE experience_leg_counters SET status = CASE WHEN proposed_by = 'creator' THEN 'withdrawn' ELSE 'declined' END,
    decided_at = now(), decided_by = my_user_id()
  WHERE deal_id = p_deal_id AND status = 'open';

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

-- ── Guapd's side (operational; RAISING the cost needs financial) ──
CREATE OR REPLACE FUNCTION experience_counter_direction_gate(p_direction text) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_direction IS NULL OR p_direction NOT IN ('raises', 'lowers', 'holds') THEN RAISE EXCEPTION 'Unknown direction'; END IF;
  IF p_direction = 'raises' AND has_experience_access('financial') IS NOT TRUE THEN
    RAISE EXCEPTION 'This raises what Guapd pays the creator: it needs financial access' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_counter_accept(p_counter_id uuid, p_expected_gross_paise bigint) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_deal uuid; v_exp uuid; v_status text; c record; v_dir text;
BEGIN
  PERFORM experience_console_require();
  SELECT x.deal_id, x.experience_id INTO v_deal, v_exp FROM experience_leg_counters x WHERE x.id = p_counter_id;
  IF v_deal IS NULL THEN RAISE EXCEPTION 'Counter not found'; END IF;
  PERFORM 1 FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT d.status::text INTO v_status FROM deals d WHERE d.id = v_deal FOR UPDATE;
  SELECT x.status, x.proposed_by, x.day_rate_paise, x.days, x.gross_paise, x.round INTO c FROM experience_leg_counters x WHERE x.id = p_counter_id FOR UPDATE;
  IF v_status IS DISTINCT FROM 'negotiating' THEN RAISE EXCEPTION 'This offer is already answered; its terms are fixed'; END IF;
  IF c.status IS DISTINCT FROM 'open' OR c.proposed_by IS DISTINCT FROM 'creator' THEN RAISE EXCEPTION 'Only the creator''s open counter is accepted here'; END IF;
  IF p_expected_gross_paise IS DISTINCT FROM c.gross_paise THEN RAISE EXCEPTION 'The counter changed since this screen loaded. Reload'; END IF;
  SELECT CASE WHEN c.gross_paise > t.creator_gross_paise THEN 'raises' WHEN c.gross_paise < t.creator_gross_paise THEN 'lowers' ELSE 'holds' END
    INTO v_dir FROM experience_creator_terms t WHERE t.deal_id = v_deal;
  PERFORM experience_counter_direction_gate(v_dir);
  PERFORM experience_leg_reprice(v_deal, c.day_rate_paise, c.days);
  UPDATE experience_leg_counters SET status = 'accepted', decided_at = now(), decided_by = my_user_id() WHERE id = p_counter_id;
  PERFORM experience_leg_agree(v_deal);
  INSERT INTO events (deal_id, actor_id, event_type, detail)
  VALUES (v_deal, my_user_id(), 'experience.leg_counter_accepted', jsonb_build_object('counter_id', p_counter_id, 'by', 'guapd', 'round', c.round));
  PERFORM experience_console_audit('experience.leg_counter_accepted', 'experience_leg_counters', p_counter_id,
    jsonb_build_object('experience_id', v_exp, 'deal_id', v_deal, 'round', c.round, 'direction', v_dir));
  RETURN 'agreed';
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_counter_decline(p_counter_id uuid, p_note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_deal uuid; v_exp uuid; v_ok boolean; v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  PERFORM experience_console_require();
  SELECT x.deal_id, x.experience_id INTO v_deal, v_exp FROM experience_leg_counters x WHERE x.id = p_counter_id;
  IF v_deal IS NULL THEN RAISE EXCEPTION 'Counter not found'; END IF;
  PERFORM 1 FROM deals d WHERE d.id = v_deal FOR UPDATE;
  SELECT (x.status = 'open' AND x.proposed_by = 'creator') INTO v_ok FROM experience_leg_counters x WHERE x.id = p_counter_id FOR UPDATE;
  IF v_ok IS NOT TRUE THEN RAISE EXCEPTION 'Only the creator''s open counter is declined'; END IF;
  IF v_note IS NOT NULL AND length(v_note) > 500 THEN RAISE EXCEPTION 'The note is too long'; END IF;
  UPDATE experience_leg_counters SET status = 'declined', decided_at = now(), decided_by = my_user_id(), decision_note = v_note WHERE id = p_counter_id;
  INSERT INTO events (deal_id, actor_id, event_type, detail)
  VALUES (v_deal, my_user_id(), 'experience.leg_counter_declined', jsonb_build_object('counter_id', p_counter_id, 'by', 'guapd'));
  PERFORM experience_console_audit('experience.leg_counter_declined', 'experience_leg_counters', p_counter_id,
    jsonb_build_object('experience_id', v_exp, 'deal_id', v_deal, 'note_length', coalesce(length(v_note), 0)));
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_counter_send(p_deal_id uuid, p_day_rate_paise bigint, p_days numeric, p_note text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_exp uuid; v_status text; v_used int; p record; v_id uuid; v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  PERFORM experience_console_require();
  SELECT d.experience_id INTO v_exp FROM deals d WHERE d.id = p_deal_id AND d.leg_role = 'creator_leg';
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Creator deal not found'; END IF;
  PERFORM 1 FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT d.status::text INTO v_status FROM deals d WHERE d.id = p_deal_id FOR UPDATE;
  IF v_status IS DISTINCT FROM 'negotiating' THEN RAISE EXCEPTION 'This offer is already answered; its terms are fixed'; END IF;
  IF v_note IS NOT NULL AND length(v_note) > 500 THEN RAISE EXCEPTION 'The note is too long'; END IF;
  IF EXISTS (SELECT 1 FROM experience_leg_counters c WHERE c.deal_id = p_deal_id AND c.status = 'open' AND c.proposed_by = 'guapd') THEN
    RAISE EXCEPTION 'Guapd''s counter is still waiting for the creator. Withdraw it to send a different one';
  END IF;
  SELECT count(*)::int INTO v_used FROM experience_leg_counters c WHERE c.deal_id = p_deal_id AND c.proposed_by = 'guapd';
  IF v_used >= 3 THEN RAISE EXCEPTION 'Guapd has used its 3 counters on this offer'; END IF;
  SELECT x.gross_paise, x.platform_pct, x.net_paise, x.direction INTO p FROM experience_counter_price(p_deal_id, p_day_rate_paise, p_days) x;
  PERFORM experience_counter_direction_gate(p.direction);
  UPDATE experience_leg_counters SET status = 'superseded', decided_at = now(), decided_by = my_user_id()
  WHERE deal_id = p_deal_id AND status = 'open' AND proposed_by = 'creator';
  INSERT INTO experience_leg_counters (deal_id, experience_id, round, proposed_by, day_rate_paise, days, gross_paise, platform_pct, net_paise, note, created_by)
  VALUES (p_deal_id, v_exp, v_used + 1, 'guapd', p_day_rate_paise, p_days, p.gross_paise, p.platform_pct, p.net_paise, v_note, my_user_id())
  RETURNING id INTO v_id;
  INSERT INTO events (deal_id, actor_id, event_type, detail)
  VALUES (p_deal_id, my_user_id(), 'experience.leg_counter_proposed', jsonb_build_object('counter_id', v_id, 'by', 'guapd', 'round', v_used + 1));
  PERFORM experience_console_audit('experience.leg_counter_sent', 'experience_leg_counters', v_id,
    jsonb_build_object('experience_id', v_exp, 'deal_id', p_deal_id, 'round', v_used + 1, 'direction', p.direction));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_counter_withdraw(p_counter_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_deal uuid; v_exp uuid; v_ok boolean;
BEGIN
  PERFORM experience_console_require();
  SELECT x.deal_id, x.experience_id INTO v_deal, v_exp FROM experience_leg_counters x WHERE x.id = p_counter_id;
  IF v_deal IS NULL THEN RAISE EXCEPTION 'Counter not found'; END IF;
  PERFORM 1 FROM deals d WHERE d.id = v_deal FOR UPDATE;
  SELECT (x.status = 'open' AND x.proposed_by = 'guapd') INTO v_ok FROM experience_leg_counters x WHERE x.id = p_counter_id FOR UPDATE;
  IF v_ok IS NOT TRUE THEN RAISE EXCEPTION 'Only Guapd''s open counter is withdrawn'; END IF;
  UPDATE experience_leg_counters SET status = 'withdrawn', decided_at = now(), decided_by = my_user_id() WHERE id = p_counter_id;
  INSERT INTO events (deal_id, actor_id, event_type, detail)
  VALUES (v_deal, my_user_id(), 'experience.leg_counter_withdrawn', jsonb_build_object('counter_id', p_counter_id, 'by', 'guapd'));
  PERFORM experience_console_audit('experience.leg_counter_withdrawn', 'experience_leg_counters', p_counter_id,
    jsonb_build_object('experience_id', v_exp, 'deal_id', v_deal));
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_counters(p_experience_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v jsonb;
BEGIN
  PERFORM experience_console_require();
  IF NOT EXISTS (SELECT 1 FROM experiences e WHERE e.id = p_experience_id) THEN RAISE EXCEPTION 'Experience not found'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'deal_id', c.deal_id, 'round', c.round, 'proposed_by', c.proposed_by,
           'day_rate_paise', c.day_rate_paise, 'days', c.days, 'gross_paise', c.gross_paise, 'platform_pct', c.platform_pct,
           'net_paise', c.net_paise, 'note', c.note, 'status', c.status, 'created_at', c.created_at,
           'decided_at', c.decided_at, 'decision_note', c.decision_note,
           'direction', CASE WHEN c.gross_paise > t.creator_gross_paise THEN 'raises' WHEN c.gross_paise < t.creator_gross_paise THEN 'lowers' ELSE 'holds' END
         ) ORDER BY c.created_at), '[]'::jsonb)
    INTO v FROM experience_leg_counters c JOIN experience_creator_terms t ON t.deal_id = c.deal_id
    WHERE c.experience_id = p_experience_id;
  RETURN jsonb_build_object('counters', v, 'can_raise', has_experience_access('financial') IS TRUE);
END;
$$;

-- ═════ 2. Day rate: never a second active rate over a creator's pause ═════
CREATE OR REPLACE FUNCTION experience_console_set_day_rate(p_creator_id uuid, p_day_rate_paise bigint) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid; v_before bigint;
BEGIN
  PERFORM experience_console_require();
  IF NOT EXISTS (SELECT 1 FROM creators c WHERE c.id = p_creator_id AND c.is_guapd IS FALSE) THEN
    RAISE EXCEPTION 'Creator not found';
  END IF;
  IF p_day_rate_paise IS NULL OR p_day_rate_paise < 100 OR p_day_rate_paise > 1000000000 OR p_day_rate_paise % 100 <> 0 THEN
    RAISE EXCEPTION 'A day rate is a whole number of rupees between ₹1 and ₹1,00,00,000';
  END IF;
  SELECT cp.id, cp.price_paise INTO v_id, v_before FROM creator_products cp
    WHERE cp.creator_id = p_creator_id AND cp.pricing_type = 'per_day' AND cp.is_active FOR UPDATE;
  IF v_id IS NULL AND EXISTS (SELECT 1 FROM creator_products cp WHERE cp.creator_id = p_creator_id AND cp.pricing_type = 'per_day' AND cp.is_active IS FALSE) THEN
    RAISE EXCEPTION 'This creator has paused their day rate. Enter the rate on their deal instead';
  END IF;
  IF v_id IS NULL THEN
    INSERT INTO creator_products (creator_id, pricing_type, platform, handle, product_type, description,
                                  price_paise, price_mode, price_max_paise, display_price, is_active,
                                  revisions_enabled, included_revisions, price_per_extra_revision_paise)
    VALUES (p_creator_id, 'per_day', NULL, NULL, 'Shoot day', NULL,
            p_day_rate_paise, 'exact', NULL, false, true, false, 0, 0)
    RETURNING id INTO v_id;
  ELSE
    UPDATE creator_products SET price_paise = p_day_rate_paise WHERE id = v_id;
  END IF;
  PERFORM experience_console_audit('creator.day_rate_set_by_staff', 'creator_products', v_id,
    jsonb_build_object('creator_id', p_creator_id, 'day_rate_paise_before', v_before, 'day_rate_paise_after', p_day_rate_paise));
  RETURN v_id;
END;
$$;

-- Draft a leg with the creator's package rate OR a rate entered on the leg
-- (only while the creator has no active rate: paused or never set).
DROP FUNCTION IF EXISTS experience_console_leg_draft(uuid, uuid, numeric, jsonb, integer);
CREATE OR REPLACE FUNCTION experience_console_leg_draft(p_roster_id uuid, p_product_id uuid, p_days numeric, p_deliverables jsonb,
  p_affiliate_count integer, p_entered_rate_paise bigint DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_exp uuid; v_status text; v_aff_per int; v_creator uuid; v_locked boolean; v_decision text; v_sent uuid;
  v_before jsonb; v_videos int; v_rec jsonb;
BEGIN
  PERFORM experience_console_require();
  SELECT r.experience_id INTO v_exp FROM experience_roster r WHERE r.id = p_roster_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Roster entry not found'; END IF;
  SELECT e.status, nullif(e.agreed_plan ->> 'affiliate_per_creator', '')::int INTO v_status, v_aff_per
    FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT r.creator_id, r.locked, r.brand_decision, r.leg_deal_id,
         jsonb_build_object('product_id', r.leg_product_id, 'entered_rate', r.leg_entered_rate_paise IS NOT NULL, 'days', r.leg_days,
                            'deliverables', r.leg_deliverables, 'affiliate_count', r.leg_affiliate_count)
    INTO v_creator, v_locked, v_decision, v_sent, v_before
    FROM experience_roster r WHERE r.id = p_roster_id FOR UPDATE;

  IF v_status IS DISTINCT FROM 'confirmed' THEN RAISE EXCEPTION 'Creator deals are prepared once the roster is locked and the Experience is Confirmed'; END IF;
  IF v_locked IS NOT TRUE OR v_decision IS DISTINCT FROM 'accepted' THEN RAISE EXCEPTION 'Only a locked, accepted creator gets a deal'; END IF;
  IF v_sent IS NOT NULL THEN RAISE EXCEPTION 'This creator''s deal is already sent; its terms are frozen'; END IF;
  IF p_product_id IS NOT NULL AND p_entered_rate_paise IS NOT NULL THEN RAISE EXCEPTION 'Use their day rate or enter one, not both'; END IF;

  IF p_product_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM creator_products cp
    WHERE cp.id = p_product_id AND cp.creator_id = v_creator AND cp.pricing_type = 'per_day' AND cp.is_active
  ) THEN
    RAISE EXCEPTION 'Pick this creator''s own active shoot day rate';
  END IF;
  IF p_entered_rate_paise IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM creator_products cp WHERE cp.creator_id = v_creator AND cp.pricing_type = 'per_day' AND cp.is_active) THEN
      RAISE EXCEPTION 'This creator has an active day rate: use it';
    END IF;
    IF p_entered_rate_paise < 100 OR p_entered_rate_paise > 1000000000 OR p_entered_rate_paise % 100 <> 0 THEN
      RAISE EXCEPTION 'A day rate is a whole number of rupees between ₹1 and ₹1,00,00,000';
    END IF;
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

  UPDATE experience_roster SET leg_product_id = p_product_id, leg_entered_rate_paise = p_entered_rate_paise, leg_days = p_days,
         leg_deliverables = p_deliverables, leg_affiliate_count = p_affiliate_count, updated_at = now()
    WHERE id = p_roster_id;

  v_rec := experience_legs_reconcile(v_exp);
  IF (v_rec ->> 'over')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'That would place more than the brand bought: % of % videos, % of % with the affiliate link',
      v_rec ->> 'videos_placed', v_rec ->> 'videos_sold', v_rec ->> 'affiliate_placed', v_rec ->> 'affiliate_target';
  END IF;

  PERFORM experience_console_audit('experience.leg_drafted', 'experience_roster', p_roster_id,
    jsonb_build_object('experience_id', v_exp, 'creator_id', v_creator, 'before', v_before,
      'after', jsonb_build_object('product_id', p_product_id, 'entered_rate', p_entered_rate_paise IS NOT NULL, 'days', p_days,
                                  'deliverables', p_deliverables, 'affiliate_count', p_affiliate_count)));
  RETURN v_rec;
END;
$$;


-- ═════ Sending with an entered rate; counters closed on withdraw; the creator's view ═════
CREATE OR REPLACE FUNCTION experience_console_leg_send(p_roster_id uuid, p_expected_gross_paise bigint, p_expected_platform_pct numeric, p_expected_net_paise bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exp uuid;
  e_status text; e_title text; e_brand uuid; e_template uuid; e_template_version int; e_settings jsonb;
  v_aff_per int;
  r_creator uuid; r_locked boolean; r_decision text; r_sent uuid;
  r_product uuid; r_days numeric; r_deliverables jsonb; r_aff int; r_entered bigint;
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
         coalesce(r.leg_deliverables, r.planned_deliverables), r.leg_affiliate_count, r.leg_entered_rate_paise
    INTO r_creator, r_locked, r_decision, r_sent, r_product, r_days, r_deliverables, r_aff, r_entered
    FROM experience_roster r WHERE r.id = p_roster_id FOR UPDATE;

  IF e_status IS DISTINCT FROM 'confirmed' THEN RAISE EXCEPTION 'Creator deals are sent once the roster is locked and the Experience is Confirmed'; END IF;
  IF r_locked IS NOT TRUE OR r_decision IS DISTINCT FROM 'accepted' THEN RAISE EXCEPTION 'Only a locked, accepted creator gets a deal'; END IF;
  IF r_sent IS NOT NULL THEN RAISE EXCEPTION 'This creator''s deal is already sent'; END IF;
  IF NOT EXISTS (SELECT 1 FROM creators c WHERE c.id = r_creator AND c.is_bookable AND NOT c.is_guapd) THEN
    RAISE EXCEPTION 'This creator is no longer bookable';
  END IF;
  IF (r_product IS NULL AND r_entered IS NULL) OR r_days IS NULL THEN RAISE EXCEPTION 'Pick the shoot day rate (or enter one) and the number of days first'; END IF;
  PERFORM experience_check_deliverables(r_deliverables);
  r_aff := coalesce(r_aff, least(coalesce(v_aff_per, 0), experience_video_count(r_deliverables)));

  -- Money, re-derived here from the package row and the creator's own track.
  -- 0542: the creator's active package rate, or the rate entered on the leg
  -- while they have none active (paused or never set); never a second package.
  IF r_product IS NOT NULL THEN
    SELECT cp.price_paise INTO v_rate FROM creator_products cp
      WHERE cp.id = r_product AND cp.creator_id = r_creator AND cp.pricing_type = 'per_day' AND cp.is_active;
    IF v_rate IS NULL THEN RAISE EXCEPTION 'This creator''s shoot day rate is no longer active; pick it again'; END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM creator_products cp WHERE cp.creator_id = r_creator AND cp.pricing_type = 'per_day' AND cp.is_active) THEN
      RAISE EXCEPTION 'This creator now has an active day rate: use it';
    END IF;
    v_rate := r_entered;
  END IF;
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
  IF (v_rec ->> 'over')::boolean IS NOT FALSE THEN
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
                                        platform_pct, creator_net_paise, platform_track, product_id, pricing_type, locked_at, rate_source)
  VALUES (v_deal, v_exp, r_creator, v_rate, r_days, v_gross, v_pct, v_net, v_track, r_product, 'per_day', now(),
          CASE WHEN r_product IS NULL THEN 'entered' ELSE 'package' END);

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
$function$;

CREATE OR REPLACE FUNCTION experience_console_leg_withdraw(p_roster_id uuid, p_reason text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF v_status IS NULL OR v_status NOT IN ('confirmed', 'shoot_scheduled') THEN RAISE EXCEPTION 'Offers are withdrawn before the shoot is done'; END IF;
  IF v_dstatus IS DISTINCT FROM 'negotiating' THEN RAISE EXCEPTION 'Only an offer the creator has not answered can be withdrawn'; END IF;
  IF length(v_reason) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'Say why it is being withdrawn (3 to 300 characters)'; END IF;
  UPDATE deals SET status = 'cancelled' WHERE id = v_deal;
  UPDATE experience_leg_counters SET status = 'withdrawn', decided_at = now(), decided_by = my_user_id() WHERE deal_id = v_deal AND status = 'open';
  INSERT INTO events (deal_id, actor_id, event_type, detail)
  VALUES (v_deal, my_user_id(), 'experience.leg_withdrawn', jsonb_build_object('by', 'guapd'));
  PERFORM experience_console_audit('experience.leg_withdrawn', 'deals', v_deal,
    jsonb_build_object('experience_id', v_exp, 'roster_id', p_roster_id, 'creator_id', v_creator, 'reason', v_reason,
      'status_before', 'negotiating', 'status_after', 'cancelled'));
  RETURN experience_shoot_rollup(v_exp);
END;
$function$;

CREATE OR REPLACE FUNCTION creator_leg_context(p_deal_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exp uuid; v_status text; v_ref text; v_brand_name text; v_title text;
  v_logo text; v_shoot_date date; v_shoot_city text; v_brief text; v_plan jsonb; v_estatus text;
  v_deliverables jsonb; v_aff int; v_outcome text;
  t_rate bigint; t_days numeric; t_gross bigint; t_pct numeric; t_net bigint; t_track text;
  v_videos int; v_owner text; v_items jsonb; v_payout jsonb; v_counters jsonb; v_used int;
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

  -- 0540: the live payout to this creator for this deal, as a statement. The
  -- proof file and who approved it stay with Guapd.
  SELECT jsonb_build_object('status', p.status, 'gross_paise', p.gross_paise, 'platform_pct', p.platform_pct,
           'platform_fee_paise', p.platform_fee_paise, 'net_paise', p.amount_paise, 'tds_paise', p.tds_paise,
           'paid_paise', p.net_amount_paise, 'paid_on', p.paid_on, 'reference', CASE WHEN p.status = 'paid' THEN p.external_ref END)
    INTO v_payout
    FROM vendor_payouts p WHERE p.deal_id = p_deal_id AND p.reason = 'creator_fee' AND p.status NOT IN ('cancelled', 'failed');

  -- 0542: the counter history on this leg (both sides), and rounds left.
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'round', c.round, 'proposed_by', c.proposed_by, 'day_rate_paise', c.day_rate_paise,
           'days', c.days, 'gross_paise', c.gross_paise, 'platform_pct', c.platform_pct, 'net_paise', c.net_paise, 'note', c.note,
           'status', c.status, 'created_at', c.created_at, 'decided_at', c.decided_at, 'decision_note', c.decision_note) ORDER BY c.created_at), '[]'::jsonb),
         count(*) FILTER (WHERE c.proposed_by = 'creator')::int
    INTO v_counters, v_used
    FROM experience_leg_counters c WHERE c.deal_id = p_deal_id;

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
    'items', v_items, 'payout', v_payout,
    'counters', v_counters, 'counters_left', CASE WHEN v_status = 'negotiating' THEN greatest(3 - coalesce(v_used, 0), 0) ELSE 0 END);
END;
$function$;

-- ═════ The console's creator-deal list: entered rates and paused package rates ═════
DROP FUNCTION IF EXISTS experience_console_legs(uuid);
CREATE OR REPLACE FUNCTION experience_console_legs(p_experience_id uuid)
RETURNS TABLE (roster_id uuid, creator_id uuid, full_name text, handle text, profile_photo_url text, track text,
               planned_deliverables jsonb, leg_deliverables jsonb, leg_affiliate_count integer, leg_days numeric, leg_product_id uuid,
               day_rate_product_id uuid, day_rate_paise bigint, leg_deal_id uuid, leg_sent_at timestamptz, deal_status text, deal_ref text,
               sent_day_rate_paise bigint, sent_days numeric, sent_gross_paise bigint, sent_platform_pct numeric, sent_net_paise bigint,
               leg_entered_rate_paise bigint, paused_rate_paise bigint, sent_rate_source text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM experience_console_require();
  RETURN QUERY
    SELECT r.id, r.creator_id, c.full_name, c.handle, c.profile_photo_url,
           experience_creator_track(r.creator_id),
           r.planned_deliverables, r.leg_deliverables, r.leg_affiliate_count, r.leg_days, r.leg_product_id,
           cp.id, cp.price_paise,
           r.leg_deal_id, r.leg_sent_at, d.status::text, d.deal_ref,
           t.day_rate_paise, t.days, t.creator_gross_paise, t.platform_pct, t.creator_net_paise,
           r.leg_entered_rate_paise,
           CASE WHEN cp.id IS NULL THEN (SELECT pp.price_paise FROM creator_products pp
                                          WHERE pp.creator_id = r.creator_id AND pp.pricing_type = 'per_day' AND pp.is_active IS FALSE
                                          ORDER BY pp.updated_at DESC LIMIT 1) END,
           t.rate_source
    FROM experience_roster r
    JOIN creators c ON c.id = r.creator_id
    LEFT JOIN creator_products cp ON cp.creator_id = r.creator_id AND cp.pricing_type = 'per_day' AND cp.is_active
    LEFT JOIN deals d ON d.id = r.leg_deal_id
    LEFT JOIN experience_creator_terms t ON t.deal_id = r.leg_deal_id
    WHERE r.experience_id = p_experience_id AND r.locked AND r.brand_decision = 'accepted'
    ORDER BY r.locked_at, r.created_at;
END;
$$;

-- ═════ 3. Bank details: encrypted at rest, Vault-held key, finance-only full read ═════
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'guapd_payout_details_key') THEN
    PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'guapd_payout_details_key',
      'Encrypts creator bank account numbers and PANs at rest (migration 0542). Never exported.');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION experience_payout_key() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.decrypted_secret FROM vault.decrypted_secrets s WHERE s.name = 'guapd_payout_details_key'
$$;

ALTER TABLE vendor_payout_details
  ADD COLUMN IF NOT EXISTS account_number_enc  bytea,
  ADD COLUMN IF NOT EXISTS account_last4       text,
  ADD COLUMN IF NOT EXISTS pan_enc             bytea,
  ADD COLUMN IF NOT EXISTS pan_last4           text,
  ADD COLUMN IF NOT EXISTS details_changed_at  timestamptz,
  ADD COLUMN IF NOT EXISTS updated_by          uuid REFERENCES users (id) ON DELETE SET NULL;
-- Plaintext account numbers and PANs are never stored (the 0524 columns stay empty).
ALTER TABLE vendor_payout_details DROP CONSTRAINT IF EXISTS vpd_no_plaintext;
ALTER TABLE vendor_payout_details ADD CONSTRAINT vpd_no_plaintext CHECK (bank_account_number IS NULL AND pan IS NULL);
ALTER TABLE vendor_payout_details DROP CONSTRAINT IF EXISTS vpd_bank_shape;
ALTER TABLE vendor_payout_details ADD CONSTRAINT vpd_bank_shape CHECK (
  (account_number_enc IS NULL) = (account_last4 IS NULL)
  AND (account_last4 IS NULL OR account_last4 ~ '^[0-9]{4}$')
  AND (pan_enc IS NULL) = (pan_last4 IS NULL)
  AND (ifsc IS NULL OR ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$')
  AND (account_holder_name IS NULL OR length(btrim(account_holder_name)) BETWEEN 2 AND 100));

CREATE TABLE IF NOT EXISTS vendor_payout_detail_changes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id   uuid NOT NULL REFERENCES vendors (id) ON DELETE CASCADE,
  changed_at  timestamptz NOT NULL DEFAULT now(),
  changed_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  fields      text[] NOT NULL CHECK (cardinality(fields) > 0)
);
COMMENT ON TABLE vendor_payout_detail_changes IS 'Which payout-detail fields changed and when. Field NAMES only, never values.';
ALTER TABLE vendor_payout_detail_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON vendor_payout_detail_changes FROM anon, authenticated;

-- The creator's own details, masked: what their screen shows.
CREATE OR REPLACE FUNCTION creator_payout_details() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_creator uuid := my_creator_id(); v jsonb;
BEGIN
  IF v_creator IS NULL THEN RAISE EXCEPTION 'Creators only' USING ERRCODE = '42501'; END IF;
  SELECT jsonb_build_object('on_file', d.account_last4 IS NOT NULL, 'account_holder_name', d.account_holder_name,
           'account_masked', CASE WHEN d.account_last4 IS NOT NULL THEN '••••' || d.account_last4 END, 'ifsc', d.ifsc,
           'pan_masked', CASE WHEN d.pan_last4 IS NOT NULL THEN '••••••' || d.pan_last4 END,
           'gst_registered', d.gst_registered, 'changed_at', d.details_changed_at)
    INTO v FROM vendors vd JOIN vendor_payout_details d ON d.vendor_id = vd.id WHERE vd.creator_id = v_creator;
  RETURN coalesce(v, jsonb_build_object('on_file', false));
END;
$$;

-- The creator enters or replaces their bank details. Write-only for them:
-- what comes back is masked. Field names (never values) are recorded.
CREATE OR REPLACE FUNCTION creator_set_payout_details(p_holder text, p_account text, p_account_confirm text, p_ifsc text,
  p_pan text, p_gst_registered boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_creator uuid := my_creator_id(); v_name text; v_vendor uuid; v_key text; o record; v_fields text[] := ARRAY[]::text[];
  v_holder text := btrim(regexp_replace(coalesce(p_holder, ''), '\s+', ' ', 'g'));
  v_account text := regexp_replace(coalesce(p_account, ''), '[\s-]', '', 'g');
  v_confirm text := regexp_replace(coalesce(p_account_confirm, ''), '[\s-]', '', 'g');
  v_ifsc text := upper(btrim(coalesce(p_ifsc, '')));
  v_pan text := nullif(upper(btrim(coalesce(p_pan, ''))), '');
BEGIN
  IF v_creator IS NULL THEN RAISE EXCEPTION 'Creators only' USING ERRCODE = '42501'; END IF;
  IF length(v_holder) NOT BETWEEN 2 AND 100 THEN RAISE EXCEPTION 'Enter the account holder''s name as the bank has it'; END IF;
  IF v_account !~ '^[0-9]{9,18}$' THEN RAISE EXCEPTION 'An account number is 9 to 18 digits'; END IF;
  IF v_confirm IS DISTINCT FROM v_account THEN RAISE EXCEPTION 'The two account numbers do not match'; END IF;
  IF v_ifsc !~ '^[A-Z]{4}0[A-Z0-9]{6}$' THEN RAISE EXCEPTION 'That IFSC looks wrong (11 characters, like HDFC0001234)'; END IF;
  IF v_pan IS NOT NULL AND v_pan !~ '^[A-Z]{5}[0-9]{4}[A-Z]$' THEN RAISE EXCEPTION 'That PAN looks wrong (like ABCDE1234F)'; END IF;
  IF p_gst_registered IS NULL THEN RAISE EXCEPTION 'Say whether you are GST-registered'; END IF;
  v_key := experience_payout_key();
  IF v_key IS NULL THEN RAISE EXCEPTION 'Payout details cannot be saved right now. Try again later'; END IF;

  SELECT c.full_name INTO v_name FROM creators c WHERE c.id = v_creator;
  INSERT INTO vendors (kind, creator_id, display_name) VALUES ('creator', v_creator, coalesce(v_name, 'Creator')) ON CONFLICT (creator_id) DO NOTHING;
  SELECT vd.id INTO v_vendor FROM vendors vd WHERE vd.creator_id = v_creator;
  SELECT d.account_holder_name, d.ifsc, d.gst_registered,
         CASE WHEN d.account_number_enc IS NOT NULL THEN extensions.pgp_sym_decrypt(d.account_number_enc, v_key) END AS account,
         CASE WHEN d.pan_enc IS NOT NULL THEN extensions.pgp_sym_decrypt(d.pan_enc, v_key) END AS pan,
         d.vendor_id IS NOT NULL AS existed
    INTO o FROM vendor_payout_details d WHERE d.vendor_id = v_vendor FOR UPDATE;
  IF o.account IS DISTINCT FROM v_account THEN v_fields := array_append(v_fields, 'account_number'); END IF;
  IF o.ifsc IS DISTINCT FROM v_ifsc THEN v_fields := array_append(v_fields, 'ifsc'); END IF;
  IF o.account_holder_name IS DISTINCT FROM v_holder THEN v_fields := array_append(v_fields, 'account_holder_name'); END IF;
  IF o.pan IS DISTINCT FROM v_pan THEN v_fields := array_append(v_fields, 'pan'); END IF;
  IF o.gst_registered IS DISTINCT FROM p_gst_registered THEN v_fields := array_append(v_fields, 'gst_registered'); END IF;

  INSERT INTO vendor_payout_details (vendor_id, account_holder_name, account_number_enc, account_last4, ifsc, pan_enc, pan_last4,
                                     gst_registered, details_changed_at, updated_at, updated_by)
  VALUES (v_vendor, v_holder, extensions.pgp_sym_encrypt(v_account, v_key), right(v_account, 4), v_ifsc,
          CASE WHEN v_pan IS NOT NULL THEN extensions.pgp_sym_encrypt(v_pan, v_key) END, CASE WHEN v_pan IS NOT NULL THEN right(v_pan, 4) END,
          p_gst_registered, now(), now(), my_user_id())
  ON CONFLICT (vendor_id) DO UPDATE SET account_holder_name = EXCLUDED.account_holder_name, account_number_enc = EXCLUDED.account_number_enc,
    account_last4 = EXCLUDED.account_last4, ifsc = EXCLUDED.ifsc, pan_enc = EXCLUDED.pan_enc, pan_last4 = EXCLUDED.pan_last4,
    gst_registered = EXCLUDED.gst_registered,
    details_changed_at = CASE WHEN cardinality(v_fields) > 0 THEN now() ELSE vendor_payout_details.details_changed_at END,
    updated_at = now(), updated_by = EXCLUDED.updated_by;
  IF cardinality(v_fields) > 0 THEN
    INSERT INTO vendor_payout_detail_changes (vendor_id, changed_by, fields) VALUES (v_vendor, my_user_id(), v_fields);
  END IF;
  RETURN creator_payout_details() || jsonb_build_object('changed', cardinality(v_fields) > 0, 'first_time', coalesce(o.existed, false) IS NOT TRUE);
END;
$$;

-- FINANCE only: the full details for paying one payout. Every view audited (no values).
CREATE OR REPLACE FUNCTION experience_console_payout_account(p_payout_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p record; v_key text; v jsonb;
BEGIN
  PERFORM experience_finance_require();
  SELECT x.id, x.status, x.deal_id, x.experience_id, x.vendor_id, x.created_at INTO p FROM vendor_payouts x WHERE x.id = p_payout_id;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Payout not found'; END IF;
  IF p.status IS NULL OR p.status NOT IN ('requested', 'approved') THEN RAISE EXCEPTION 'Bank details are shown for a payout that is still to be paid'; END IF;
  v_key := experience_payout_key();
  IF v_key IS NULL THEN RAISE EXCEPTION 'Payout details cannot be read right now'; END IF;
  SELECT jsonb_build_object(
           'account_holder_name', d.account_holder_name,
           'account_number', CASE WHEN d.account_number_enc IS NOT NULL THEN extensions.pgp_sym_decrypt(d.account_number_enc, v_key) END,
           'ifsc', d.ifsc,
           'pan', CASE WHEN d.pan_enc IS NOT NULL THEN extensions.pgp_sym_decrypt(d.pan_enc, v_key) END,
           'gst_registered', d.gst_registered, 'changed_at', d.details_changed_at,
           'changed_after_request', coalesce(d.details_changed_at > p.created_at, false))
    INTO v FROM vendor_payout_details d WHERE d.vendor_id = p.vendor_id;
  v := coalesce(v, jsonb_build_object('account_number', NULL))
       || jsonb_build_object('upi_id', (SELECT c.upi_id FROM vendors vd JOIN creators c ON c.id = vd.creator_id WHERE vd.id = p.vendor_id));
  PERFORM experience_console_audit('finance.payout_details_viewed', 'vendor_payouts', p_payout_id,
    jsonb_build_object('experience_id', p.experience_id, 'deal_id', p.deal_id));
  RETURN v;
END;
$$;

-- ═════ 5. The creator's own payouts (Payments page, earnings) ═════
CREATE OR REPLACE FUNCTION creator_payouts() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_creator uuid := my_creator_id(); v jsonb;
BEGIN
  IF v_creator IS NULL THEN RAISE EXCEPTION 'Creators only' USING ERRCODE = '42501'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'deal_id', d.id, 'title', d.title, 'brand_label', coalesce(d.experience_brand_name, 'A brand') || ' · Managed by Guapd',
           'status', p.status, 'net_paise', p.amount_paise, 'tds_paise', p.tds_paise, 'paid_paise', p.net_amount_paise,
           'paid_on', p.paid_on, 'paid_at', p.paid_at, 'reference', CASE WHEN p.status = 'paid' THEN p.external_ref END,
           'requested_at', p.created_at) ORDER BY coalesce(p.paid_at, p.created_at) DESC), '[]'::jsonb)
    INTO v
    FROM vendor_payouts p JOIN deals d ON d.id = p.deal_id
    WHERE d.creator_id = v_creator AND d.leg_role = 'creator_leg' AND p.reason = 'creator_fee' AND p.status NOT IN ('cancelled', 'failed');
  RETURN v;
END;
$$;

-- ═════ 4. Paying: ops request, finance approves and pays ═════
DROP FUNCTION IF EXISTS experience_console_payout_approve(uuid);

CREATE OR REPLACE FUNCTION experience_console_payout_approve(p_payout_id uuid, p_confirm_details_changed boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_exp uuid; v_status text; v_pstatus text; v_by uuid; v_deal uuid; v_me uuid := my_user_id(); v_changed boolean;
BEGIN
  -- 0542: operational staff request; FINANCE approves (and is not the requester) and pays.
  PERFORM experience_finance_require();
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  SELECT p.experience_id INTO v_exp FROM vendor_payouts p WHERE p.id = p_payout_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Payout not found'; END IF;
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT p.status, p.created_by, p.deal_id INTO v_pstatus, v_by, v_deal FROM vendor_payouts p WHERE p.id = p_payout_id FOR UPDATE;
  IF v_status IS NULL OR v_status = 'complete' THEN RAISE EXCEPTION 'This Experience is Complete'; END IF;
  IF v_pstatus IS DISTINCT FROM 'requested' THEN RAISE EXCEPTION 'Only a requested payout is approved'; END IF;
  IF v_by IS NOT DISTINCT FROM v_me THEN
    RAISE EXCEPTION 'A different person approves a payout than the one who requested it';
  END IF;
  IF experience_leg_work_complete(v_deal) IS NOT TRUE THEN RAISE EXCEPTION 'This creator''s part is no longer complete'; END IF;
  SELECT coalesce(d.details_changed_at > p.created_at, false) INTO v_changed
    FROM vendor_payouts p LEFT JOIN vendor_payout_details d ON d.vendor_id = p.vendor_id WHERE p.id = p_payout_id;
  IF v_changed IS TRUE AND p_confirm_details_changed IS NOT TRUE THEN
    RAISE EXCEPTION 'The creator changed their bank details after this payout was requested. Confirm the new details with them, then approve';
  END IF;
  UPDATE vendor_payouts SET status = 'approved', approved_by = v_me, approved_at = now(), updated_at = now() WHERE id = p_payout_id;
  PERFORM experience_console_audit('experience.payout_approved', 'vendor_payouts', p_payout_id,
    jsonb_build_object('experience_id', v_exp, 'deal_id', v_deal, 'details_changed_confirmed', coalesce(v_changed, false)));
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_payout_paid(p_payout_id uuid, p_paid_on date, p_method text, p_reference text, p_proof_path text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_exp uuid; v_status text; v_pstatus text; v_deal uuid; v_approved timestamptz;
  v_ref text := btrim(coalesce(p_reference, ''));
BEGIN
  -- 0542: FINANCE pays (it is the role that sees the bank details).
  PERFORM experience_finance_require();
  SELECT p.experience_id INTO v_exp FROM vendor_payouts p WHERE p.id = p_payout_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Payout not found'; END IF;
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT p.status, p.deal_id, p.approved_at INTO v_pstatus, v_deal, v_approved FROM vendor_payouts p WHERE p.id = p_payout_id FOR UPDATE;
  IF v_status IS NULL OR v_status = 'complete' THEN RAISE EXCEPTION 'This Experience is Complete'; END IF;
  IF v_pstatus IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'A payout is approved before it is paid'; END IF;
  IF p_paid_on IS NULL OR p_paid_on > experience_today() THEN RAISE EXCEPTION 'Enter the date it was paid (not in the future)'; END IF;
  IF p_method IS NULL OR p_method NOT IN ('bank_transfer', 'upi', 'other') THEN RAISE EXCEPTION 'Say how it was paid'; END IF;
  IF length(v_ref) NOT BETWEEN 3 AND 100 THEN RAISE EXCEPTION 'Enter the payment reference (UTR)'; END IF;
  IF experience_finance_file_ok('payout-proof', p_payout_id, p_proof_path) IS NOT TRUE THEN RAISE EXCEPTION 'Attach the payment proof'; END IF;
  UPDATE vendor_payouts SET status = 'paid', paid_at = now(), paid_on = p_paid_on, method = p_method, external_ref = v_ref,
    proof_path = p_proof_path, recorded_by = my_user_id(), updated_at = now()
  WHERE id = p_payout_id;
  PERFORM experience_console_audit('experience.payout_paid', 'vendor_payouts', p_payout_id,
    jsonb_build_object('experience_id', v_exp, 'deal_id', v_deal, 'method', p_method, 'reference', v_ref));
  -- On the creator's own deal timeline too (deal-scoped ops action).
  INSERT INTO events (deal_id, actor_id, event_type, detail)
  VALUES (v_deal, my_user_id(), 'experience.payout_paid', jsonb_build_object('payout_id', p_payout_id, 'reference', v_ref));
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_payout_cancel(p_payout_id uuid, p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_exp uuid; v_pstatus text; v_deal uuid;
  v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  PERFORM experience_console_require();
  SELECT p.experience_id INTO v_exp FROM vendor_payouts p WHERE p.id = p_payout_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Payout not found'; END IF;
  PERFORM 1 FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT p.status, p.deal_id INTO v_pstatus, v_deal FROM vendor_payouts p WHERE p.id = p_payout_id FOR UPDATE;
  IF v_pstatus IS NULL OR v_pstatus NOT IN ('requested', 'approved') THEN RAISE EXCEPTION 'Only an unpaid payout is cancelled'; END IF;
  -- 0542: an APPROVED payout is finance's to cancel.
  IF v_pstatus = 'approved' THEN PERFORM experience_finance_require(); END IF;
  IF length(v_reason) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'Say why it is being cancelled (3 to 300 characters)'; END IF;
  UPDATE vendor_payouts SET status = 'cancelled', cancelled_at = now(), cancelled_by = my_user_id(), cancel_reason = v_reason, updated_at = now()
  WHERE id = p_payout_id;
  PERFORM experience_console_audit('experience.payout_cancelled', 'vendor_payouts', p_payout_id,
    jsonb_build_object('experience_id', v_exp, 'deal_id', v_deal, 'status_before', v_pstatus, 'reason', v_reason));
  INSERT INTO events (deal_id, actor_id, event_type, detail)
  VALUES (v_deal, my_user_id(), 'experience.payout_cancelled', jsonb_build_object('payout_id', p_payout_id));
END;
$$;

CREATE OR REPLACE FUNCTION experience_finance_upload_slot(p_kind text, p_target_id uuid, p_file_name text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('invoice-payment', 'brand-certificate', 'payout-proof') THEN RAISE EXCEPTION 'Unknown upload'; END IF;
  IF p_kind = 'payout-proof' THEN
    PERFORM experience_finance_require();  -- 0542: finance pays, finance attaches the proof
    SELECT p.status INTO v_status FROM vendor_payouts p WHERE p.id = p_target_id;
    IF v_status IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'Proof is added to an approved payout'; END IF;
  ELSE
    PERFORM experience_finance_require();
    IF p_kind = 'invoice-payment' THEN
      SELECT si.status INTO v_status FROM service_invoices si WHERE si.id = p_target_id;
      IF v_status IS DISTINCT FROM 'issued' THEN RAISE EXCEPTION 'Payments are recorded on an issued, unpaid invoice'; END IF;
    ELSIF NOT EXISTS (SELECT 1 FROM brands b WHERE b.id = p_target_id AND b.is_guapd IS FALSE) THEN
      RAISE EXCEPTION 'Brand not found';
    END IF;
  END IF;
  RETURN experience_finance_path(p_kind, p_target_id, p_file_name);
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_finance_file(p_kind text, p_id uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_path text;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('invoice-pdf', 'invoice-payment', 'brand-certificate', 'payout-proof') THEN RAISE EXCEPTION 'Unknown file'; END IF;
  IF p_kind = 'payout-proof' THEN
    PERFORM experience_finance_require();  -- 0542: a transfer proof can show bank details
    SELECT p.proof_path INTO v_path FROM vendor_payouts p WHERE p.id = p_id;
  ELSE
    PERFORM experience_finance_require();
    IF p_kind = 'invoice-pdf' THEN SELECT si.pdf_path INTO v_path FROM service_invoices si WHERE si.id = p_id;
    ELSIF p_kind = 'invoice-payment' THEN SELECT x.proof_path INTO v_path FROM service_invoice_payments x WHERE x.id = p_id;
    ELSE SELECT bp.certificate_path INTO v_path FROM brand_billing_profiles bp WHERE bp.brand_id = p_id;
    END IF;
  END IF;
  IF v_path IS NULL THEN RAISE EXCEPTION 'No file here'; END IF;
  RETURN v_path;
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_payouts(p_experience_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text; v_legs jsonb; v_me uuid := my_user_id();
BEGIN
  PERFORM experience_console_require();
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = p_experience_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'deal_id', t.deal_id, 'creator_id', t.creator_id, 'full_name', c.full_name, 'deal_status', d.status::text,
           'shoot_outcome', r.leg_shoot_outcome, 'work_complete', coalesce(experience_leg_work_complete(t.deal_id), false),
           'gross_paise', t.creator_gross_paise, 'platform_pct', t.platform_pct,
           'platform_fee_paise', t.creator_gross_paise - t.creator_net_paise, 'net_paise', t.creator_net_paise,
           -- 0542: masked only. Full bank details are finance's (experience_console_payout_account).
           'payment_details', jsonb_build_object('bank_on_file', pd.account_last4 IS NOT NULL,
              'account_masked', CASE WHEN pd.account_last4 IS NOT NULL THEN '••••' || pd.account_last4 END,
              'upi_on_file', c.upi_id IS NOT NULL, 'changed_at', pd.details_changed_at),
           'cancelled_before', (SELECT count(*) FROM vendor_payouts p WHERE p.deal_id = t.deal_id AND p.reason = 'creator_fee' AND p.status = 'cancelled'),
           'payout', (SELECT jsonb_build_object('id', p.id, 'status', p.status, 'amount_paise', p.amount_paise, 'tds_paise', p.tds_paise,
                         'net_amount_paise', p.net_amount_paise, 'requested_by_name', coalesce(ru.full_name, ru.email), 'requested_at', p.created_at,
                         'approved_by_name', coalesce(au.full_name, au.email), 'approved_at', p.approved_at, 'paid_on', p.paid_on, 'method', p.method,
                         'reference', p.external_ref, 'has_proof', p.proof_path IS NOT NULL,
                         'i_requested', p.created_by IS NOT DISTINCT FROM v_me,
                         'details_changed_after_request', coalesce(pd.details_changed_at > p.created_at, false))
                      FROM vendor_payouts p LEFT JOIN users ru ON ru.id = p.created_by LEFT JOIN users au ON au.id = p.approved_by
                      WHERE p.deal_id = t.deal_id AND p.reason = 'creator_fee' AND p.status NOT IN ('cancelled', 'failed'))
         ) ORDER BY c.full_name), '[]'::jsonb)
    INTO v_legs
    FROM experience_creator_terms t
    JOIN deals d ON d.id = t.deal_id
    JOIN creators c ON c.id = t.creator_id
    LEFT JOIN experience_roster r ON r.leg_deal_id = t.deal_id
    LEFT JOIN vendors vd ON vd.creator_id = t.creator_id
    LEFT JOIN vendor_payout_details pd ON pd.vendor_id = vd.id
    WHERE t.experience_id = p_experience_id AND t.locked_at IS NOT NULL AND d.status = 'agreed';
  RETURN jsonb_build_object('experience_id', p_experience_id, 'status', v_status, 'legs', v_legs, 'can_pay', has_experience_access('financial') IS TRUE);
END;
$$;

-- ═════ Who may call what ═════
DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'guard_leg_counter()', 'experience_counter_price(uuid, bigint, numeric)', 'experience_leg_reprice(uuid, bigint, numeric)',
    'experience_leg_agree(uuid)', 'experience_counter_direction_gate(text)', 'experience_payout_key()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
  FOREACH f IN ARRAY ARRAY[
    'creator_leg_counter(uuid, bigint, numeric, text)', 'creator_leg_counter_withdraw(uuid)', 'creator_leg_counter_accept(uuid)',
    'creator_leg_respond(uuid, boolean, text)', 'creator_leg_context(uuid)',
    'experience_console_counter_accept(uuid, bigint)', 'experience_console_counter_decline(uuid, text)',
    'experience_console_counter_send(uuid, bigint, numeric, text)', 'experience_console_counter_withdraw(uuid)',
    'experience_console_counters(uuid)', 'experience_console_set_day_rate(uuid, bigint)',
    'experience_console_leg_draft(uuid, uuid, numeric, jsonb, integer, bigint)', 'experience_console_leg_send(uuid, bigint, numeric, bigint)',
    'experience_console_leg_withdraw(uuid, text)', 'experience_console_legs(uuid)',
    'creator_payout_details()', 'creator_set_payout_details(text, text, text, text, text, boolean)',
    'experience_console_payout_account(uuid)', 'creator_payouts()',
    'experience_console_payout_approve(uuid, boolean)', 'experience_console_payout_paid(uuid, date, text, text, text)',
    'experience_console_payout_cancel(uuid, text)', 'experience_finance_upload_slot(text, uuid, text)',
    'experience_console_finance_file(text, uuid)', 'experience_console_payouts(uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END;
$$;

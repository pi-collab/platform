-- 0540: Phase 4, the money loop. Brand invoices (paid offline, with proof),
-- creator payouts (paid outside, with proof, maker-checker), the P&L flipping
-- from "revenue pending invoice" to real, and the completion gate.
--
-- Decisions (Palak, 2026-10-08):
--   * The brand invoice is ONE clean service price: no 30%, no creator rates,
--     no per-video breakdown. The 30% platform fee appears only on the
--     creator's payout statement: gross → platform fee → net → TDS → paid.
--   * GST is entered, never computed. If Guapd is not GST-registered the
--     invoice carries no GST and says so (with the provisional GSTIN).
--   * TDS is a manual field (default 0), on brand payments and creator payouts.
--   * Payout approval is maker-checker: the approver is not the requester.
--   * Complete = deliverables approved as sold + every invoice paid + every
--     creator paid + the brand's sign-off (staff-recorded) + Guapd's sign-off
--     (the Complete action itself). Reopen (finance) clears both sign-offs.
--
-- Access: invoices, payments, billing details and Guapd's settings are
-- FINANCIAL (an invoice is the brand price). Payouts are OPERATIONAL (creator
-- rates already are, 0537 decision c). Every table is unreadable by users;
-- staff, the brand and the creator each reach their part only through a
-- definer function that checks them in Postgres. NULL means no (0539).
-- Audit rows (ops_events) carry ids, statuses and references, never amounts.

-- ═════ A. Files: one private bucket, no user policies (service role only) ═════
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('finance-docs', 'finance-docs', false, 20971520, ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- ═════ B. Guapd's own billing details (one row) ═════
CREATE TABLE IF NOT EXISTS guapd_billing_settings (
  id                    boolean PRIMARY KEY DEFAULT true CHECK (id),
  legal_name            text NOT NULL CHECK (length(btrim(legal_name)) BETWEEN 2 AND 200),
  address               text NOT NULL CHECK (length(btrim(address)) BETWEEN 5 AND 500),
  state                 text NOT NULL CHECK (length(btrim(state)) BETWEEN 2 AND 60),
  gstin                 text CHECK (gstin IS NULL OR gstin ~ '^[0-9A-Z]{15}$'),
  gst_registered        boolean NOT NULL DEFAULT false,
  pan                   text CHECK (pan IS NULL OR pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  payment_instructions  text CHECK (payment_instructions IS NULL OR length(payment_instructions) <= 1000),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT gbs_registered_has_gstin CHECK (gst_registered IS NOT TRUE OR gstin IS NOT NULL)
);
COMMENT ON TABLE guapd_billing_settings IS
  'Guapd as the supplier on its service invoices. One row. Financial staff only, through definer functions.';
ALTER TABLE guapd_billing_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON guapd_billing_settings FROM anon, authenticated;

-- ═════ C. A brand's billing profile (staff-entered now; the brand edits it in Phase 6) ═════
CREATE TABLE IF NOT EXISTS brand_billing_profiles (
  brand_id          uuid PRIMARY KEY REFERENCES brands (id) ON DELETE CASCADE,
  legal_name        text NOT NULL CHECK (length(btrim(legal_name)) BETWEEN 2 AND 200),
  address           text NOT NULL CHECK (length(btrim(address)) BETWEEN 5 AND 500),
  state             text NOT NULL CHECK (length(btrim(state)) BETWEEN 2 AND 60),
  gstin             text CHECK (gstin IS NULL OR gstin ~ '^[0-9A-Z]{15}$'),
  pan               text CHECK (pan IS NULL OR pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  certificate_path  text,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid REFERENCES users (id) ON DELETE SET NULL
);
COMMENT ON TABLE brand_billing_profiles IS
  'Who a service invoice is addressed to. Snapshotted onto each invoice at issue. Financial staff only. Never bank details.';
ALTER TABLE brand_billing_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON brand_billing_profiles FROM anon, authenticated;

-- ═════ D. Invoice numbers: GPD/<FY>/<n>, gapless, assigned at ISSUE ═════
-- The counter row is locked and bumped inside the issuing transaction, so a
-- failed issue rolls the number back: no gaps, and a number is never reused
-- (a void keeps its number).
CREATE TABLE IF NOT EXISTS service_invoice_counters (
  fy       text PRIMARY KEY CHECK (fy ~ '^[0-9]{2}-[0-9]{2}$'),
  last_no  int NOT NULL DEFAULT 0 CHECK (last_no >= 0)
);
ALTER TABLE service_invoice_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON service_invoice_counters FROM anon, authenticated;

DROP TRIGGER IF EXISTS t_service_invoice_number ON service_invoices;
DROP FUNCTION IF EXISTS assign_service_invoice_number();
DROP SEQUENCE IF EXISTS service_invoice_seq;

-- ═════ E. Service invoices: issue, void, snapshots ═════
ALTER TABLE service_invoices
  ADD COLUMN IF NOT EXISTS description                    text,
  ADD COLUMN IF NOT EXISTS issued_at                      timestamptz,
  ADD COLUMN IF NOT EXISTS issued_by                      uuid REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS voided_at                      timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by                      uuid REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS void_reason                    text,
  ADD COLUMN IF NOT EXISTS pdf_path                       text,
  ADD COLUMN IF NOT EXISTS supplier_legal_name            text,
  ADD COLUMN IF NOT EXISTS supplier_address               text,
  ADD COLUMN IF NOT EXISTS supplier_state                 text,
  ADD COLUMN IF NOT EXISTS supplier_pan                   text,
  ADD COLUMN IF NOT EXISTS supplier_gst_registered        boolean,
  ADD COLUMN IF NOT EXISTS supplier_payment_instructions  text,
  ADD COLUMN IF NOT EXISTS recipient_address              text,
  ADD COLUMN IF NOT EXISTS recipient_pan                  text;

ALTER TABLE service_invoices DROP CONSTRAINT IF EXISTS si_description;
ALTER TABLE service_invoices ADD CONSTRAINT si_description
  CHECK (description IS NOT NULL AND length(btrim(description)) BETWEEN 3 AND 300);
ALTER TABLE service_invoices DROP CONSTRAINT IF EXISTS si_draft_unnumbered;
ALTER TABLE service_invoices ADD CONSTRAINT si_draft_unnumbered
  CHECK (status IS DISTINCT FROM 'draft' OR (number IS NULL AND issued_at IS NULL AND pdf_path IS NULL));
ALTER TABLE service_invoices DROP CONSTRAINT IF EXISTS si_issued_shape;
ALTER TABLE service_invoices ADD CONSTRAINT si_issued_shape
  CHECK (status = 'draft' OR (number IS NOT NULL AND issue_date IS NOT NULL AND issued_at IS NOT NULL
         AND supplier_legal_name IS NOT NULL AND recipient_legal_name IS NOT NULL AND subtotal_paise > 0));
ALTER TABLE service_invoices DROP CONSTRAINT IF EXISTS si_void_shape;
ALTER TABLE service_invoices ADD CONSTRAINT si_void_shape
  CHECK ((status = 'void') = (voided_at IS NOT NULL)
         AND (voided_at IS NULL OR length(btrim(coalesce(void_reason, ''))) BETWEEN 3 AND 300));
ALTER TABLE service_invoices DROP CONSTRAINT IF EXISTS si_gst_shape;
ALTER TABLE service_invoices ADD CONSTRAINT si_gst_shape
  CHECK (coalesce(cgst_paise, 0) >= 0 AND coalesce(sgst_paise, 0) >= 0 AND coalesce(igst_paise, 0) >= 0
         AND NOT (coalesce(igst_paise, 0) > 0 AND (coalesce(cgst_paise, 0) > 0 OR coalesce(sgst_paise, 0) > 0))
         -- Not registered (or unknown): no GST on the invoice at all.
         AND (supplier_gst_registered IS TRUE OR coalesce(cgst_paise, 0) + coalesce(sgst_paise, 0) + coalesce(igst_paise, 0) = 0));
ALTER TABLE service_invoices DROP CONSTRAINT IF EXISTS si_total_formula;
ALTER TABLE service_invoices ADD CONSTRAINT si_total_formula
  CHECK (total_paise = subtotal_paise + coalesce(cgst_paise, 0) + coalesce(sgst_paise, 0) + coalesce(igst_paise, 0));
-- TDS on a brand invoice is withheld at PAYMENT (service_invoice_payments.tds_paise).
ALTER TABLE service_invoices DROP CONSTRAINT IF EXISTS si_no_invoice_tds;
ALTER TABLE service_invoices ADD CONSTRAINT si_no_invoice_tds CHECK (tds_paise IS NULL);

-- Once issued, an invoice is frozen. Only payment status, the void, and the
-- PDF (once, from empty) may change. A void is final. Only drafts are deleted.
CREATE OR REPLACE FUNCTION freeze_issued_service_invoice() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  k text[] := ARRAY['status', 'payment_reference', 'paid_at', 'recorded_by', 'updated_at', 'voided_at', 'voided_by', 'void_reason', 'pdf_path'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- The service role (scripts, test clean-up) may purge; no app path deletes
    -- an issued invoice (scripts/check-pnl-isolation.ts keeps app code off this table).
    IF OLD.status IS DISTINCT FROM 'draft' AND current_user IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'Only a draft invoice can be deleted; void an issued one';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status IS DISTINCT FROM 'draft' THEN
    IF OLD.status = 'void' THEN RAISE EXCEPTION 'A void invoice is final'; END IF;
    IF (to_jsonb(NEW) - k) IS DISTINCT FROM (to_jsonb(OLD) - k) THEN
      RAISE EXCEPTION 'An issued invoice cannot be edited; void it and issue a new one';
    END IF;
    IF OLD.pdf_path IS NOT NULL AND NEW.pdf_path IS DISTINCT FROM OLD.pdf_path THEN
      RAISE EXCEPTION 'An issued invoice keeps its PDF';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status
       AND (OLD.status, NEW.status) NOT IN (('issued', 'paid'), ('paid', 'issued'), ('issued', 'void')) THEN
      RAISE EXCEPTION 'An invoice cannot go from % to %', OLD.status, NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS t_si_freeze ON service_invoices;
CREATE TRIGGER t_si_freeze BEFORE UPDATE OR DELETE ON service_invoices
  FOR EACH ROW EXECUTE FUNCTION freeze_issued_service_invoice();

-- Users never read invoices directly: the brand through brand_experience_invoices
-- (issued and paid only), staff through the console. Drop the 0524 direct read.
DROP POLICY IF EXISTS si_read_brand ON service_invoices;
REVOKE ALL ON service_invoices FROM anon, authenticated;

-- ═════ F. Payments received against an invoice (paid offline) ═════
CREATE TABLE IF NOT EXISTS service_invoice_payments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id       uuid NOT NULL REFERENCES service_invoices (id),
  experience_id    uuid NOT NULL REFERENCES experiences (id),
  amount_paise     bigint NOT NULL CHECK (amount_paise >= 0),
  tds_paise        bigint NOT NULL DEFAULT 0 CHECK (tds_paise >= 0),
  received_on      date NOT NULL,
  method           text NOT NULL CHECK (method IN ('bank_transfer', 'upi', 'cheque', 'cash', 'other')),
  reference        text NOT NULL CHECK (length(btrim(reference)) BETWEEN 3 AND 100),
  proof_path       text NOT NULL,
  recorded_by      uuid REFERENCES users (id) ON DELETE SET NULL,
  recorded_at      timestamptz NOT NULL DEFAULT now(),
  reversed_at      timestamptz,
  reversed_by      uuid REFERENCES users (id) ON DELETE SET NULL,
  reversed_reason  text,
  CONSTRAINT sip_positive CHECK (amount_paise + tds_paise > 0),
  CONSTRAINT sip_reversed_shape CHECK ((reversed_at IS NULL) = (reversed_reason IS NULL)
    AND (reversed_reason IS NULL OR length(btrim(reversed_reason)) BETWEEN 3 AND 300))
);
CREATE INDEX IF NOT EXISTS sip_invoice_idx ON service_invoice_payments (invoice_id);
CREATE INDEX IF NOT EXISTS sip_experience_idx ON service_invoice_payments (experience_id);
-- The same bank reference is not recorded twice on one invoice.
CREATE UNIQUE INDEX IF NOT EXISTS sip_reference_once ON service_invoice_payments (invoice_id, lower(btrim(reference))) WHERE reversed_at IS NULL;
COMMENT ON TABLE service_invoice_payments IS
  'A brand payment received outside the app (bank / UPI / cheque), with its reference, TDS withheld and proof. Reversed, never deleted. Financial staff only.';
ALTER TABLE service_invoice_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON service_invoice_payments FROM anon, authenticated;

CREATE OR REPLACE FUNCTION guard_invoice_payment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_user IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'A payment is reversed, never deleted'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM service_invoices si WHERE si.id = NEW.invoice_id AND si.experience_id = NEW.experience_id) THEN
      RAISE EXCEPTION 'A payment belongs to an invoice of the same Experience';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.reversed_at IS NOT NULL THEN RAISE EXCEPTION 'A reversed payment is final'; END IF;
  IF (to_jsonb(NEW) - ARRAY['reversed_at', 'reversed_by', 'reversed_reason']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['reversed_at', 'reversed_by', 'reversed_reason']) THEN
    RAISE EXCEPTION 'A recorded payment cannot be edited; reverse it and record it again';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS t_sip_guard ON service_invoice_payments;
CREATE TRIGGER t_sip_guard BEFORE INSERT OR UPDATE OR DELETE ON service_invoice_payments
  FOR EACH ROW EXECUTE FUNCTION guard_invoice_payment();

-- ═════ G. Creator payouts: statement, maker-checker, paid outside with proof ═════
ALTER TABLE vendor_payouts
  ADD COLUMN IF NOT EXISTS gross_paise         bigint,
  ADD COLUMN IF NOT EXISTS platform_pct        numeric,
  ADD COLUMN IF NOT EXISTS platform_fee_paise  bigint,
  ADD COLUMN IF NOT EXISTS paid_on             date,
  ADD COLUMN IF NOT EXISTS method              text,
  ADD COLUMN IF NOT EXISTS proof_path          text,
  ADD COLUMN IF NOT EXISTS recorded_by         uuid REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at        timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by        uuid REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancel_reason       text;

ALTER TABLE vendor_payouts DROP CONSTRAINT IF EXISTS vp_reason;
ALTER TABLE vendor_payouts ADD CONSTRAINT vp_reason CHECK (reason IN ('creator_fee', 'follow_on', 'cost_line'));
-- The creator's statement: gross → platform fee → amount (net) → TDS → paid (net_amount).
ALTER TABLE vendor_payouts DROP CONSTRAINT IF EXISTS vp_statement;
ALTER TABLE vendor_payouts ADD CONSTRAINT vp_statement CHECK (
  reason IS DISTINCT FROM 'creator_fee'
  OR (deal_id IS NOT NULL AND gross_paise IS NOT NULL AND platform_pct IS NOT NULL AND platform_fee_paise IS NOT NULL
      AND amount_paise = gross_paise - platform_fee_paise));
ALTER TABLE vendor_payouts DROP CONSTRAINT IF EXISTS vp_tds_within;
ALTER TABLE vendor_payouts ADD CONSTRAINT vp_tds_within CHECK (tds_paise <= amount_paise);
ALTER TABLE vendor_payouts DROP CONSTRAINT IF EXISTS vp_maker_checker;
ALTER TABLE vendor_payouts ADD CONSTRAINT vp_maker_checker CHECK (approved_by IS NULL OR approved_by IS DISTINCT FROM created_by);
ALTER TABLE vendor_payouts DROP CONSTRAINT IF EXISTS vp_approved_shape;
ALTER TABLE vendor_payouts ADD CONSTRAINT vp_approved_shape
  CHECK (status NOT IN ('approved', 'processing', 'paid') OR approved_at IS NOT NULL);
ALTER TABLE vendor_payouts DROP CONSTRAINT IF EXISTS vp_method;
ALTER TABLE vendor_payouts ADD CONSTRAINT vp_method CHECK (method IS NULL OR method IN ('bank_transfer', 'upi', 'other'));
ALTER TABLE vendor_payouts DROP CONSTRAINT IF EXISTS vp_manual_paid;
ALTER TABLE vendor_payouts ADD CONSTRAINT vp_manual_paid
  CHECK (status IS DISTINCT FROM 'paid' OR provider IS DISTINCT FROM 'manual'
         OR (paid_on IS NOT NULL AND method IS NOT NULL AND proof_path IS NOT NULL));
ALTER TABLE vendor_payouts DROP CONSTRAINT IF EXISTS vp_cancel_shape;
ALTER TABLE vendor_payouts ADD CONSTRAINT vp_cancel_shape
  CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL)
         AND (cancelled_at IS NULL OR length(btrim(coalesce(cancel_reason, ''))) BETWEEN 3 AND 300));
-- One live creator-fee payout per creator deal: the duplicate guard.
CREATE UNIQUE INDEX IF NOT EXISTS vp_one_live_creator_fee ON vendor_payouts (deal_id)
  WHERE reason = 'creator_fee' AND status NOT IN ('cancelled', 'failed');

-- A creator-fee payout is exactly that creator's locked terms, and a payout
-- moves only forward: amounts freeze at approval; paid and cancelled are final.
CREATE OR REPLACE FUNCTION guard_vendor_payout() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  k text[] := ARRAY['status', 'approved_by', 'approved_at', 'paid_at', 'paid_on', 'method', 'proof_path', 'external_ref',
                    'recorded_by', 'cancelled_at', 'cancelled_by', 'cancel_reason', 'failure_reason', 'updated_at'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_user IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'A payout is cancelled, never deleted'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.reason = 'creator_fee' AND NOT EXISTS (
      SELECT 1 FROM experience_creator_terms t JOIN deals d ON d.id = t.deal_id
      WHERE t.deal_id = NEW.deal_id AND t.experience_id = NEW.experience_id AND d.leg_role = 'creator_leg'
        AND t.locked_at IS NOT NULL AND t.creator_gross_paise = NEW.gross_paise AND t.platform_pct = NEW.platform_pct
        AND t.creator_net_paise = NEW.amount_paise
    ) THEN
      RAISE EXCEPTION 'A creator payout is exactly the locked terms of that creator''s deal';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status IN ('paid', 'cancelled') THEN RAISE EXCEPTION 'A % payout is final', OLD.status; END IF;
  IF OLD.status IS DISTINCT FROM 'requested'
     AND (NEW.tds_paise, NEW.net_amount_paise) IS DISTINCT FROM (OLD.tds_paise, OLD.net_amount_paise) THEN
    RAISE EXCEPTION 'An approved payout''s amounts are frozen; cancel it and request again';
  END IF;
  IF (to_jsonb(NEW) - k - ARRAY['tds_paise', 'net_amount_paise']) IS DISTINCT FROM (to_jsonb(OLD) - k - ARRAY['tds_paise', 'net_amount_paise']) THEN
    RAISE EXCEPTION 'A payout''s creator, deal and statement do not change';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS t_vp_guard ON vendor_payouts;
CREATE TRIGGER t_vp_guard BEFORE INSERT OR UPDATE OR DELETE ON vendor_payouts
  FOR EACH ROW EXECUTE FUNCTION guard_vendor_payout();

-- The creator sees their payout through creator_leg_context only. Drop the 0524 direct read.
DROP POLICY IF EXISTS vp_read_own_creator ON vendor_payouts;
REVOKE ALL ON vendor_payouts FROM anon, authenticated;

-- The P&L follows payments and payouts as it follows invoices (0537).
DROP TRIGGER IF EXISTS t_sip_pnl_refresh ON service_invoice_payments;
CREATE TRIGGER t_sip_pnl_refresh AFTER INSERT OR UPDATE ON service_invoice_payments
  FOR EACH ROW EXECUTE FUNCTION experience_pnl_refresh_from_row();
DROP TRIGGER IF EXISTS t_vp_pnl_refresh ON vendor_payouts;
CREATE TRIGGER t_vp_pnl_refresh AFTER INSERT OR UPDATE ON vendor_payouts
  FOR EACH ROW EXECUTE FUNCTION experience_pnl_refresh_from_row();

-- ═════ H. Sign-offs for completion ═════
ALTER TABLE experiences
  ADD COLUMN IF NOT EXISTS brand_signoff_at           timestamptz,
  ADD COLUMN IF NOT EXISTS brand_signoff_channel      text,
  ADD COLUMN IF NOT EXISTS brand_signoff_note         text,
  ADD COLUMN IF NOT EXISTS brand_signoff_recorded_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS guapd_signoff_at           timestamptz,
  ADD COLUMN IF NOT EXISTS guapd_signoff_by           uuid REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE experiences DROP CONSTRAINT IF EXISTS experiences_signoff_shape;
ALTER TABLE experiences ADD CONSTRAINT experiences_signoff_shape CHECK (
  (brand_signoff_at IS NULL) = (brand_signoff_channel IS NULL)
  AND (brand_signoff_channel IS NULL OR brand_signoff_channel IN ('whatsapp', 'email', 'call', 'in_person'))
  AND (brand_signoff_note IS NULL OR length(brand_signoff_note) <= 500));

-- ═════ I. Helpers (internal: no one may call them) ═════
CREATE OR REPLACE FUNCTION experience_finance_require() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF has_experience_access('financial') IS NOT TRUE THEN
    RAISE EXCEPTION 'Financial access required' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- The Indian financial year (April–March) of a date, as '26-27'.
CREATE OR REPLACE FUNCTION experience_fy(p_date date) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT lpad(((extract(year FROM p_date)::int - CASE WHEN extract(month FROM p_date) < 4 THEN 1 ELSE 0 END) % 100)::text, 2, '0')
      || '-' ||
         lpad(((extract(year FROM p_date)::int - CASE WHEN extract(month FROM p_date) < 4 THEN 1 ELSE 0 END + 1) % 100)::text, 2, '0')
$$;

CREATE OR REPLACE FUNCTION experience_today() RETURNS date
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date
$$;

-- A finance file path: <kind>/<target>/<random>/<clean name>. The random part
-- makes a path unguessable; record functions check the prefix and that the
-- object exists.
CREATE OR REPLACE FUNCTION experience_finance_path(p_kind text, p_target uuid, p_file_name text) RETURNS text
LANGUAGE plpgsql VOLATILE SET search_path = public AS $$
DECLARE
  v_name text := regexp_replace(btrim(coalesce(p_file_name, '')), '[^A-Za-z0-9._-]+', '_', 'g');
  v_ext text := lower(substring(v_name FROM '\.([A-Za-z0-9]+)$'));
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('invoice-payment', 'brand-certificate', 'payout-proof') OR p_target IS NULL THEN
    RAISE EXCEPTION 'Unknown upload';
  END IF;
  IF length(v_name) NOT BETWEEN 3 AND 120 OR v_ext IS NULL OR v_ext NOT IN ('pdf', 'jpg', 'jpeg', 'png', 'webp') THEN
    RAISE EXCEPTION 'Upload a PDF or an image (JPG, PNG, WebP)';
  END IF;
  RETURN p_kind || '/' || p_target::text || '/' || replace(gen_random_uuid()::text, '-', '') || '/' || v_name;
END;
$$;

CREATE OR REPLACE FUNCTION experience_finance_file_ok(p_kind text, p_target uuid, p_path text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    p_path IS NOT NULL AND p_target IS NOT NULL
    AND p_path LIKE p_kind || '/' || p_target::text || '/%'
    AND p_path !~ '\.\.'
    AND EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'finance-docs' AND o.name = p_path),
  false)
$$;

-- ═════ J. Guapd billing settings + brand billing profile (financial) ═════
CREATE OR REPLACE FUNCTION experience_console_finance_settings() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v jsonb;
BEGIN
  PERFORM experience_finance_require();
  SELECT jsonb_build_object('legal_name', s.legal_name, 'address', s.address, 'state', s.state, 'gstin', s.gstin,
           'gst_registered', s.gst_registered, 'pan', s.pan, 'payment_instructions', s.payment_instructions, 'updated_at', s.updated_at)
    INTO v FROM guapd_billing_settings s WHERE s.id;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_set_finance_settings(p_legal_name text, p_address text, p_state text, p_gstin text,
  p_gst_registered boolean, p_pan text, p_payment_instructions text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM experience_finance_require();
  IF p_gst_registered IS NULL THEN RAISE EXCEPTION 'Say whether Guapd is GST-registered'; END IF;
  INSERT INTO guapd_billing_settings (id, legal_name, address, state, gstin, gst_registered, pan, payment_instructions, updated_at, updated_by)
  VALUES (true, btrim(p_legal_name), btrim(p_address), btrim(p_state), nullif(upper(btrim(coalesce(p_gstin, ''))), ''), p_gst_registered,
          nullif(upper(btrim(coalesce(p_pan, ''))), ''), nullif(btrim(coalesce(p_payment_instructions, '')), ''), now(), my_user_id())
  ON CONFLICT (id) DO UPDATE SET legal_name = EXCLUDED.legal_name, address = EXCLUDED.address, state = EXCLUDED.state,
    gstin = EXCLUDED.gstin, gst_registered = EXCLUDED.gst_registered, pan = EXCLUDED.pan,
    payment_instructions = EXCLUDED.payment_instructions, updated_at = now(), updated_by = EXCLUDED.updated_by;
  PERFORM experience_console_audit('finance.settings_set', 'guapd_billing_settings', NULL,
    jsonb_build_object('gst_registered', p_gst_registered));
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_brand_billing(p_brand_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v jsonb;
BEGIN
  PERFORM experience_finance_require();
  SELECT jsonb_build_object('brand_id', p.brand_id, 'legal_name', p.legal_name, 'address', p.address, 'state', p.state,
           'gstin', p.gstin, 'pan', p.pan, 'has_certificate', p.certificate_path IS NOT NULL, 'updated_at', p.updated_at)
    INTO v FROM brand_billing_profiles p WHERE p.brand_id = p_brand_id;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_set_brand_billing(p_brand_id uuid, p_legal_name text, p_address text, p_state text,
  p_gstin text, p_pan text, p_certificate_path text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cert text := nullif(btrim(coalesce(p_certificate_path, '')), '');
BEGIN
  PERFORM experience_finance_require();
  IF NOT EXISTS (SELECT 1 FROM brands b WHERE b.id = p_brand_id AND b.is_guapd IS FALSE) THEN
    RAISE EXCEPTION 'Brand not found';
  END IF;
  IF v_cert IS NOT NULL AND experience_finance_file_ok('brand-certificate', p_brand_id, v_cert) IS NOT TRUE THEN
    RAISE EXCEPTION 'The certificate did not finish uploading. Upload it again';
  END IF;
  INSERT INTO brand_billing_profiles (brand_id, legal_name, address, state, gstin, pan, certificate_path, updated_at, updated_by)
  VALUES (p_brand_id, btrim(p_legal_name), btrim(p_address), btrim(p_state), nullif(upper(btrim(coalesce(p_gstin, ''))), ''),
          nullif(upper(btrim(coalesce(p_pan, ''))), ''), v_cert, now(), my_user_id())
  ON CONFLICT (brand_id) DO UPDATE SET legal_name = EXCLUDED.legal_name, address = EXCLUDED.address, state = EXCLUDED.state,
    gstin = EXCLUDED.gstin, pan = EXCLUDED.pan,
    certificate_path = coalesce(EXCLUDED.certificate_path, brand_billing_profiles.certificate_path),
    updated_at = now(), updated_by = EXCLUDED.updated_by;
  PERFORM experience_console_audit('finance.brand_billing_set', 'brand_billing_profiles', p_brand_id,
    jsonb_build_object('has_gstin', p_gstin IS NOT NULL AND btrim(p_gstin) <> '', 'certificate_added', v_cert IS NOT NULL));
END;
$$;

-- ═════ K. Upload slots and file paths ═════
CREATE OR REPLACE FUNCTION experience_finance_upload_slot(p_kind text, p_target_id uuid, p_file_name text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('invoice-payment', 'brand-certificate', 'payout-proof') THEN RAISE EXCEPTION 'Unknown upload'; END IF;
  IF p_kind = 'payout-proof' THEN
    PERFORM experience_console_require();
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

-- A stored file's path, for the server to sign a short link after this check.
CREATE OR REPLACE FUNCTION experience_console_finance_file(p_kind text, p_id uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_path text;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('invoice-pdf', 'invoice-payment', 'brand-certificate', 'payout-proof') THEN RAISE EXCEPTION 'Unknown file'; END IF;
  IF p_kind = 'payout-proof' THEN
    PERFORM experience_console_require();
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

-- ═════ L. Invoices (financial) ═════
CREATE OR REPLACE FUNCTION experience_invoice_window(p_status text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT coalesce(p_status IN ('rostering', 'confirmed', 'shoot_scheduled', 'shoot_done', 'delivering'), false)
$$;

CREATE OR REPLACE FUNCTION experience_invoice_paid_paise(p_invoice_id uuid) RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum(x.amount_paise + x.tds_paise), 0)::bigint FROM service_invoice_payments x
  WHERE x.invoice_id = p_invoice_id AND x.reversed_at IS NULL
$$;

-- Validates a draft's figures; returns the GST total. Shared by draft and update.
CREATE OR REPLACE FUNCTION experience_invoice_check(p_kind text, p_source text, p_description text, p_subtotal_paise bigint,
  p_gst_rate_pct numeric, p_cgst bigint, p_sgst bigint, p_igst bigint, p_due_date date, p_registered boolean) RETURNS bigint
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  v_gst bigint := coalesce(p_cgst, 0) + coalesce(p_sgst, 0) + coalesce(p_igst, 0);
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('initial', 'additional') THEN RAISE EXCEPTION 'An invoice is the service invoice or an additional one'; END IF;
  IF p_kind = 'additional' AND (p_source IS NULL OR p_source NOT IN ('existing_footage', 'new_shoot')) THEN
    RAISE EXCEPTION 'Say what the additional invoice is for: existing footage or a new shoot';
  END IF;
  IF p_kind = 'initial' AND p_source IS NOT NULL THEN RAISE EXCEPTION 'Only an additional invoice has a source'; END IF;
  IF length(btrim(coalesce(p_description, ''))) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'Describe the service (3 to 300 characters)'; END IF;
  IF p_subtotal_paise IS NULL OR p_subtotal_paise <= 0 OR p_subtotal_paise > 100000000000 THEN RAISE EXCEPTION 'The amount must be more than zero'; END IF;
  IF coalesce(p_cgst, 0) < 0 OR coalesce(p_sgst, 0) < 0 OR coalesce(p_igst, 0) < 0 THEN RAISE EXCEPTION 'GST cannot be negative'; END IF;
  IF p_registered IS NOT TRUE AND (v_gst > 0 OR p_gst_rate_pct IS NOT NULL) THEN
    RAISE EXCEPTION 'Guapd is not GST-registered: the invoice carries no GST';
  END IF;
  IF coalesce(p_igst, 0) > 0 AND (coalesce(p_cgst, 0) > 0 OR coalesce(p_sgst, 0) > 0) THEN
    RAISE EXCEPTION 'GST is either IGST, or CGST + SGST, not both';
  END IF;
  IF p_gst_rate_pct IS NOT NULL AND (p_gst_rate_pct < 0 OR p_gst_rate_pct > 28) THEN RAISE EXCEPTION 'GST rate looks wrong'; END IF;
  IF p_due_date IS NOT NULL AND p_due_date < experience_today() THEN RAISE EXCEPTION 'The due date is in the past'; END IF;
  RETURN v_gst;
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_invoice_draft(p_experience_id uuid, p_kind text, p_source text, p_description text,
  p_subtotal_paise bigint, p_gst_rate_pct numeric, p_cgst_paise bigint, p_sgst_paise bigint, p_igst_paise bigint, p_due_date date) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text; v_brand uuid; v_registered boolean; v_gst bigint; v_id uuid;
BEGIN
  PERFORM experience_finance_require();
  SELECT e.status, e.brand_id INTO v_status, v_brand FROM experiences e WHERE e.id = p_experience_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  IF experience_invoice_window(v_status) IS NOT TRUE THEN
    RAISE EXCEPTION 'Invoices are raised once the price is agreed and before Complete';
  END IF;
  SELECT s.gst_registered INTO v_registered FROM guapd_billing_settings s WHERE s.id;
  IF v_registered IS NULL THEN RAISE EXCEPTION 'Add Guapd''s billing details first'; END IF;
  v_gst := experience_invoice_check(p_kind, p_source, p_description, p_subtotal_paise, p_gst_rate_pct, p_cgst_paise, p_sgst_paise, p_igst_paise, p_due_date, v_registered);
  INSERT INTO service_invoices (experience_id, brand_id, kind, source, status, description, lines, subtotal_paise,
    gst_rate_pct, cgst_paise, sgst_paise, igst_paise, total_paise, due_date, supplier_gst_registered, created_by)
  VALUES (p_experience_id, v_brand, p_kind, p_source, 'draft', btrim(p_description),
    jsonb_build_array(jsonb_build_object('description', btrim(p_description), 'amount_paise', p_subtotal_paise)), p_subtotal_paise,
    p_gst_rate_pct, nullif(p_cgst_paise, 0), nullif(p_sgst_paise, 0), nullif(p_igst_paise, 0), p_subtotal_paise + v_gst,
    p_due_date, v_registered, my_user_id())
  RETURNING id INTO v_id;
  PERFORM experience_console_audit('experience.invoice_drafted', 'service_invoices', v_id,
    jsonb_build_object('experience_id', p_experience_id, 'kind', p_kind));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_invoice_update(p_invoice_id uuid, p_kind text, p_source text, p_description text,
  p_subtotal_paise bigint, p_gst_rate_pct numeric, p_cgst_paise bigint, p_sgst_paise bigint, p_igst_paise bigint, p_due_date date) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_exp uuid; v_status text; v_istatus text; v_registered boolean; v_gst bigint;
BEGIN
  PERFORM experience_finance_require();
  SELECT si.experience_id INTO v_exp FROM service_invoices si WHERE si.id = p_invoice_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT si.status INTO v_istatus FROM service_invoices si WHERE si.id = p_invoice_id FOR UPDATE;
  IF v_istatus IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'Only a draft invoice is edited'; END IF;
  IF experience_invoice_window(v_status) IS NOT TRUE THEN RAISE EXCEPTION 'Invoices change once the price is agreed and before Complete'; END IF;
  SELECT s.gst_registered INTO v_registered FROM guapd_billing_settings s WHERE s.id;
  IF v_registered IS NULL THEN RAISE EXCEPTION 'Add Guapd''s billing details first'; END IF;
  v_gst := experience_invoice_check(p_kind, p_source, p_description, p_subtotal_paise, p_gst_rate_pct, p_cgst_paise, p_sgst_paise, p_igst_paise, p_due_date, v_registered);
  UPDATE service_invoices SET kind = p_kind, source = p_source, description = btrim(p_description),
    lines = jsonb_build_array(jsonb_build_object('description', btrim(p_description), 'amount_paise', p_subtotal_paise)),
    subtotal_paise = p_subtotal_paise, gst_rate_pct = p_gst_rate_pct, cgst_paise = nullif(p_cgst_paise, 0),
    sgst_paise = nullif(p_sgst_paise, 0), igst_paise = nullif(p_igst_paise, 0), total_paise = p_subtotal_paise + v_gst,
    due_date = p_due_date, supplier_gst_registered = v_registered, updated_at = now()
  WHERE id = p_invoice_id;
  PERFORM experience_console_audit('experience.invoice_draft_edited', 'service_invoices', p_invoice_id,
    jsonb_build_object('experience_id', v_exp, 'kind', p_kind));
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_invoice_discard(p_invoice_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_exp uuid; v_istatus text;
BEGIN
  PERFORM experience_finance_require();
  SELECT si.experience_id, si.status INTO v_exp, v_istatus FROM service_invoices si WHERE si.id = p_invoice_id FOR UPDATE;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF v_istatus IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'Only a draft is discarded; void an issued invoice'; END IF;
  DELETE FROM service_invoices WHERE id = p_invoice_id AND status = 'draft';
  PERFORM experience_console_audit('experience.invoice_draft_discarded', 'service_invoices', p_invoice_id,
    jsonb_build_object('experience_id', v_exp));
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_invoice_issue(p_invoice_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_exp uuid; v_status text; v_brand uuid; inv record; s record; b record;
  v_today date := experience_today(); v_fy text; v_no int; v_number text;
BEGIN
  PERFORM experience_finance_require();
  SELECT si.experience_id INTO v_exp FROM service_invoices si WHERE si.id = p_invoice_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  SELECT e.status, e.brand_id INTO v_status, v_brand FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT si.status, si.kind, si.supplier_gst_registered, si.due_date INTO inv FROM service_invoices si WHERE si.id = p_invoice_id FOR UPDATE;
  IF inv.status IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'Only a draft is issued'; END IF;
  IF experience_invoice_window(v_status) IS NOT TRUE THEN RAISE EXCEPTION 'Invoices are issued once the price is agreed and before Complete'; END IF;
  SELECT g.legal_name, g.address, g.state, g.gstin, g.gst_registered, g.pan, g.payment_instructions INTO s FROM guapd_billing_settings g WHERE g.id;
  IF s.legal_name IS NULL THEN RAISE EXCEPTION 'Add Guapd''s billing details first'; END IF;
  IF s.gst_registered IS DISTINCT FROM inv.supplier_gst_registered THEN
    RAISE EXCEPTION 'Guapd''s GST registration changed since this draft. Edit the draft first';
  END IF;
  SELECT p.legal_name, p.address, p.state, p.gstin, p.pan INTO b FROM brand_billing_profiles p WHERE p.brand_id = v_brand;
  IF b.legal_name IS NULL THEN RAISE EXCEPTION 'Add the brand''s billing details first'; END IF;
  IF inv.due_date IS NOT NULL AND inv.due_date < v_today THEN RAISE EXCEPTION 'The due date is in the past. Edit the draft'; END IF;

  v_fy := experience_fy(v_today);
  INSERT INTO service_invoice_counters (fy, last_no) VALUES (v_fy, 0) ON CONFLICT (fy) DO NOTHING;
  UPDATE service_invoice_counters SET last_no = last_no + 1 WHERE fy = v_fy RETURNING last_no INTO v_no;
  IF v_no IS NULL THEN RAISE EXCEPTION 'Could not number the invoice'; END IF;
  v_number := 'GPD/' || v_fy || '/' || lpad(v_no::text, 4, '0');

  UPDATE service_invoices SET status = 'issued', number = v_number, issue_date = v_today, issued_at = now(), issued_by = my_user_id(),
    supplier_legal_name = s.legal_name, supplier_address = s.address, supplier_state = s.state, supplier_gstin = s.gstin,
    supplier_gstin_provisional = (s.gst_registered IS NOT TRUE), supplier_pan = s.pan, supplier_payment_instructions = s.payment_instructions,
    recipient_legal_name = b.legal_name, recipient_address = b.address, recipient_state = b.state, recipient_gstin = b.gstin,
    recipient_pan = b.pan, place_of_supply = b.state, updated_at = now()
  WHERE id = p_invoice_id;
  PERFORM experience_console_audit('experience.invoice_issued', 'service_invoices', p_invoice_id,
    jsonb_build_object('experience_id', v_exp, 'number', v_number, 'kind', inv.kind));
  RETURN v_number;
END;
$$;

-- The frozen invoice, for rendering its PDF (and the console's preview).
CREATE OR REPLACE FUNCTION experience_console_invoice_doc(p_invoice_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v jsonb;
BEGIN
  PERFORM experience_finance_require();
  SELECT jsonb_build_object('id', si.id, 'number', si.number, 'status', si.status, 'kind', si.kind, 'issue_date', si.issue_date,
           'due_date', si.due_date, 'description', si.description, 'experience_title', e.title,
           'subtotal_paise', si.subtotal_paise, 'gst_rate_pct', si.gst_rate_pct, 'cgst_paise', si.cgst_paise, 'sgst_paise', si.sgst_paise,
           'igst_paise', si.igst_paise, 'total_paise', si.total_paise,
           'supplier', jsonb_build_object('legal_name', si.supplier_legal_name, 'address', si.supplier_address, 'state', si.supplier_state,
              'gstin', si.supplier_gstin, 'gst_registered', si.supplier_gst_registered, 'pan', si.supplier_pan,
              'payment_instructions', si.supplier_payment_instructions),
           'recipient', jsonb_build_object('legal_name', si.recipient_legal_name, 'address', si.recipient_address, 'state', si.recipient_state,
              'gstin', si.recipient_gstin, 'pan', si.recipient_pan),
           'place_of_supply', si.place_of_supply, 'pdf_path', si.pdf_path)
    INTO v FROM service_invoices si JOIN experiences e ON e.id = si.experience_id WHERE si.id = p_invoice_id;
  IF v IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF v ->> 'status' = 'draft' THEN RAISE EXCEPTION 'A draft has no document yet'; END IF;
  RETURN v;
END;
$$;

-- Where this invoice's PDF goes (once). The server renders the frozen invoice,
-- uploads it there with the service role, then calls _set_pdf.
CREATE OR REPLACE FUNCTION experience_console_invoice_pdf_path(p_invoice_id uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text; v_number text; v_pdf text;
BEGIN
  PERFORM experience_finance_require();
  SELECT si.status, si.number, si.pdf_path INTO v_status, v_number, v_pdf FROM service_invoices si WHERE si.id = p_invoice_id;
  IF v_status IS NULL OR v_status NOT IN ('issued', 'paid') THEN RAISE EXCEPTION 'Only an issued invoice has a PDF'; END IF;
  IF v_pdf IS NOT NULL THEN RAISE EXCEPTION 'This invoice already has its PDF'; END IF;
  RETURN 'invoice-pdf/' || p_invoice_id::text || '/' || replace(v_number, '/', '-') || '.pdf';
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_invoice_set_pdf(p_invoice_id uuid, p_path text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_expected text;
BEGIN
  v_expected := experience_console_invoice_pdf_path(p_invoice_id);   -- checks access, status, not yet set
  IF p_path IS DISTINCT FROM v_expected THEN RAISE EXCEPTION 'That is not this invoice''s PDF'; END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'finance-docs' AND o.name = p_path) THEN
    RAISE EXCEPTION 'The PDF did not finish uploading';
  END IF;
  UPDATE service_invoices SET pdf_path = p_path, updated_at = now() WHERE id = p_invoice_id AND pdf_path IS NULL;
  PERFORM experience_console_audit('experience.invoice_pdf_stored', 'service_invoices', p_invoice_id, '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_invoice_void(p_invoice_id uuid, p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_exp uuid; v_status text; v_istatus text; v_number text;
  v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  PERFORM experience_finance_require();
  SELECT si.experience_id INTO v_exp FROM service_invoices si WHERE si.id = p_invoice_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT si.status, si.number INTO v_istatus, v_number FROM service_invoices si WHERE si.id = p_invoice_id FOR UPDATE;
  IF v_status IS NULL OR v_status = 'complete' THEN RAISE EXCEPTION 'This Experience is Complete. Reopen it first (finance)'; END IF;
  IF v_istatus IS DISTINCT FROM 'issued' THEN
    RAISE EXCEPTION 'Only an issued, unpaid invoice is voided (a draft is discarded)';
  END IF;
  IF EXISTS (SELECT 1 FROM service_invoice_payments x WHERE x.invoice_id = p_invoice_id AND x.reversed_at IS NULL) THEN
    RAISE EXCEPTION 'Payments are recorded on this invoice. Reverse them first';
  END IF;
  IF length(v_reason) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'Say why it is being voided (3 to 300 characters)'; END IF;
  UPDATE service_invoices SET status = 'void', voided_at = now(), voided_by = my_user_id(), void_reason = v_reason, updated_at = now()
  WHERE id = p_invoice_id;
  PERFORM experience_console_audit('experience.invoice_voided', 'service_invoices', p_invoice_id,
    jsonb_build_object('experience_id', v_exp, 'number', v_number, 'reason', v_reason));
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_invoice_payment_add(p_invoice_id uuid, p_amount_paise bigint, p_tds_paise bigint,
  p_received_on date, p_method text, p_reference text, p_proof_path text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_exp uuid; v_status text; inv record; v_outstanding bigint; v_id uuid; v_settled boolean;
  v_ref text := btrim(coalesce(p_reference, ''));
BEGIN
  PERFORM experience_finance_require();
  SELECT si.experience_id INTO v_exp FROM service_invoices si WHERE si.id = p_invoice_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT si.status, si.number, si.total_paise INTO inv FROM service_invoices si WHERE si.id = p_invoice_id FOR UPDATE;
  IF v_status IS NULL OR v_status = 'complete' THEN RAISE EXCEPTION 'This Experience is Complete. Reopen it first (finance)'; END IF;
  IF inv.status IS DISTINCT FROM 'issued' THEN RAISE EXCEPTION 'Payments are recorded on an issued, unpaid invoice'; END IF;
  IF p_amount_paise IS NULL OR p_amount_paise < 0 THEN RAISE EXCEPTION 'Enter the amount received'; END IF;
  IF p_tds_paise IS NULL OR p_tds_paise < 0 THEN RAISE EXCEPTION 'Enter the TDS the brand withheld (0 if none)'; END IF;
  IF p_amount_paise + p_tds_paise <= 0 THEN RAISE EXCEPTION 'Enter the amount received'; END IF;
  IF p_received_on IS NULL OR p_received_on > experience_today() THEN RAISE EXCEPTION 'Enter the date it was received (not in the future)'; END IF;
  IF p_method IS NULL OR p_method NOT IN ('bank_transfer', 'upi', 'cheque', 'cash', 'other') THEN RAISE EXCEPTION 'Say how it was paid'; END IF;
  IF length(v_ref) NOT BETWEEN 3 AND 100 THEN RAISE EXCEPTION 'Enter the payment reference (UTR, cheque number)'; END IF;
  IF experience_finance_file_ok('invoice-payment', p_invoice_id, p_proof_path) IS NOT TRUE THEN
    RAISE EXCEPTION 'Attach the payment proof';
  END IF;
  v_outstanding := inv.total_paise - experience_invoice_paid_paise(p_invoice_id);
  IF p_amount_paise + p_tds_paise > v_outstanding THEN
    RAISE EXCEPTION 'That is more than is due on this invoice';
  END IF;
  INSERT INTO service_invoice_payments (invoice_id, experience_id, amount_paise, tds_paise, received_on, method, reference, proof_path, recorded_by)
  VALUES (p_invoice_id, v_exp, p_amount_paise, p_tds_paise, p_received_on, p_method, v_ref, p_proof_path, my_user_id())
  RETURNING id INTO v_id;
  v_settled := (p_amount_paise + p_tds_paise = v_outstanding);
  IF v_settled THEN
    UPDATE service_invoices SET status = 'paid', paid_at = now(), payment_reference = v_ref, recorded_by = my_user_id(), updated_at = now()
    WHERE id = p_invoice_id;
  END IF;
  PERFORM experience_console_audit('experience.invoice_payment_recorded', 'service_invoice_payments', v_id,
    jsonb_build_object('experience_id', v_exp, 'invoice_id', p_invoice_id, 'number', inv.number, 'method', p_method,
      'reference', v_ref, 'settled', v_settled));
  RETURN jsonb_build_object('payment_id', v_id, 'settled', v_settled);
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_invoice_payment_reverse(p_payment_id uuid, p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_exp uuid; v_inv uuid; v_status text; v_istatus text; v_reversed timestamptz;
  v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  PERFORM experience_finance_require();
  SELECT x.experience_id, x.invoice_id INTO v_exp, v_inv FROM service_invoice_payments x WHERE x.id = p_payment_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Payment not found'; END IF;
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT si.status INTO v_istatus FROM service_invoices si WHERE si.id = v_inv FOR UPDATE;
  SELECT x.reversed_at INTO v_reversed FROM service_invoice_payments x WHERE x.id = p_payment_id FOR UPDATE;
  IF v_status IS NULL OR v_status = 'complete' THEN RAISE EXCEPTION 'This Experience is Complete. Reopen it first (finance)'; END IF;
  IF v_reversed IS NOT NULL THEN RAISE EXCEPTION 'Already reversed'; END IF;
  IF length(v_reason) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'Say why it is being reversed (3 to 300 characters)'; END IF;
  UPDATE service_invoice_payments SET reversed_at = now(), reversed_by = my_user_id(), reversed_reason = v_reason WHERE id = p_payment_id;
  IF v_istatus = 'paid' THEN
    UPDATE service_invoices SET status = 'issued', paid_at = NULL, payment_reference = NULL, updated_at = now() WHERE id = v_inv;
  END IF;
  PERFORM experience_console_audit('experience.invoice_payment_reversed', 'service_invoice_payments', p_payment_id,
    jsonb_build_object('experience_id', v_exp, 'invoice_id', v_inv, 'reason', v_reason));
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_invoices(p_experience_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text; v_brand uuid; v_brand_name text; v_agreed bigint; v_title text; v_inv jsonb; v_settings jsonb; v_billing jsonb;
BEGIN
  PERFORM experience_finance_require();
  SELECT e.status, e.brand_id, b.name, e.brand_service_total_paise, e.title INTO v_status, v_brand, v_brand_name, v_agreed, v_title
    FROM experiences e JOIN brands b ON b.id = e.brand_id WHERE e.id = p_experience_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  v_settings := experience_console_finance_settings();
  v_billing := experience_console_brand_billing(v_brand);
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', si.id, 'kind', si.kind, 'source', si.source, 'number', si.number, 'status', si.status,
           'description', si.description, 'subtotal_paise', si.subtotal_paise, 'gst_rate_pct', si.gst_rate_pct,
           'cgst_paise', si.cgst_paise, 'sgst_paise', si.sgst_paise, 'igst_paise', si.igst_paise, 'total_paise', si.total_paise,
           'gst_registered', si.supplier_gst_registered, 'issue_date', si.issue_date, 'due_date', si.due_date,
           'issued_at', si.issued_at, 'has_pdf', si.pdf_path IS NOT NULL, 'void_reason', si.void_reason, 'voided_at', si.voided_at,
           'paid_paise', experience_invoice_paid_paise(si.id),
           'outstanding_paise', CASE WHEN si.status IN ('issued', 'paid') THEN si.total_paise - experience_invoice_paid_paise(si.id) ELSE 0 END,
           'updated_at', si.updated_at,
           'payments', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                           'id', x.id, 'amount_paise', x.amount_paise, 'tds_paise', x.tds_paise, 'received_on', x.received_on,
                           'method', x.method, 'reference', x.reference, 'recorded_at', x.recorded_at, 'recorded_by_name', coalesce(u.full_name, u.email),
                           'reversed_at', x.reversed_at, 'reversed_reason', x.reversed_reason) ORDER BY x.recorded_at), '[]'::jsonb)
                        FROM service_invoice_payments x LEFT JOIN users u ON u.id = x.recorded_by WHERE x.invoice_id = si.id)
         ) ORDER BY si.created_at), '[]'::jsonb)
    INTO v_inv FROM service_invoices si WHERE si.experience_id = p_experience_id;
  RETURN jsonb_build_object('experience_id', p_experience_id, 'status', v_status, 'title', v_title, 'brand_id', v_brand,
    'brand_name', v_brand_name, 'agreed_paise', v_agreed, 'settings', v_settings, 'billing', v_billing, 'invoices', v_inv);
END;
$$;

-- ═════ M. Payouts (operational, maker-checker) ═════
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
           'upi_id', c.upi_id,
           'cancelled_before', (SELECT count(*) FROM vendor_payouts p WHERE p.deal_id = t.deal_id AND p.reason = 'creator_fee' AND p.status = 'cancelled'),
           'payout', (SELECT jsonb_build_object('id', p.id, 'status', p.status, 'amount_paise', p.amount_paise, 'tds_paise', p.tds_paise,
                         'net_amount_paise', p.net_amount_paise, 'requested_by_name', coalesce(ru.full_name, ru.email), 'requested_at', p.created_at,
                         'approved_by_name', coalesce(au.full_name, au.email), 'approved_at', p.approved_at, 'paid_on', p.paid_on, 'method', p.method,
                         'reference', p.external_ref, 'has_proof', p.proof_path IS NOT NULL,
                         'i_requested', p.created_by IS NOT DISTINCT FROM v_me)
                      FROM vendor_payouts p LEFT JOIN users ru ON ru.id = p.created_by LEFT JOIN users au ON au.id = p.approved_by
                      WHERE p.deal_id = t.deal_id AND p.reason = 'creator_fee' AND p.status NOT IN ('cancelled', 'failed'))
         ) ORDER BY c.full_name), '[]'::jsonb)
    INTO v_legs
    FROM experience_creator_terms t
    JOIN deals d ON d.id = t.deal_id
    JOIN creators c ON c.id = t.creator_id
    LEFT JOIN experience_roster r ON r.leg_deal_id = t.deal_id
    WHERE t.experience_id = p_experience_id AND t.locked_at IS NOT NULL AND d.status = 'agreed';
  RETURN jsonb_build_object('experience_id', p_experience_id, 'status', v_status, 'legs', v_legs);
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_payout_request(p_deal_id uuid, p_tds_paise bigint) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_exp uuid; v_status text; v_dstatus text; v_outcome text; v_creator uuid; v_name text;
  t record; v_vendor uuid; v_attempt int; v_id uuid;
BEGIN
  PERFORM experience_console_require();
  SELECT d.experience_id INTO v_exp FROM deals d WHERE d.id = p_deal_id AND d.leg_role = 'creator_leg';
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Creator deal not found'; END IF;
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT d.status::text, d.creator_id INTO v_dstatus, v_creator FROM deals d WHERE d.id = p_deal_id FOR UPDATE;
  SELECT r.leg_shoot_outcome INTO v_outcome FROM experience_roster r WHERE r.leg_deal_id = p_deal_id;
  IF v_status IS NULL OR v_status NOT IN ('shoot_scheduled', 'shoot_done', 'delivering') THEN
    RAISE EXCEPTION 'Creators are paid after the shoot and before Complete';
  END IF;
  IF v_dstatus IS DISTINCT FROM 'agreed' OR v_outcome IS DISTINCT FROM 'done' THEN
    RAISE EXCEPTION 'Only a creator who accepted and shot is paid';
  END IF;
  IF experience_leg_work_complete(p_deal_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'This creator''s part is not complete yet (their deliverables need Guapd''s approval)';
  END IF;
  SELECT x.creator_gross_paise, x.platform_pct, x.creator_net_paise, x.locked_at INTO t
    FROM experience_creator_terms x WHERE x.deal_id = p_deal_id;
  IF t.locked_at IS NULL THEN RAISE EXCEPTION 'This creator''s terms are not locked'; END IF;
  IF p_tds_paise IS NULL OR p_tds_paise < 0 OR p_tds_paise > t.creator_net_paise THEN
    RAISE EXCEPTION 'TDS must be between 0 and the amount due';
  END IF;
  IF EXISTS (SELECT 1 FROM vendor_payouts p WHERE p.deal_id = p_deal_id AND p.reason = 'creator_fee' AND p.status NOT IN ('cancelled', 'failed')) THEN
    RAISE EXCEPTION 'This creator already has a payout. Cancel it to request again';
  END IF;
  SELECT c.full_name INTO v_name FROM creators c WHERE c.id = v_creator;
  INSERT INTO vendors (kind, creator_id, display_name) VALUES ('creator', v_creator, coalesce(v_name, 'Creator'))
  ON CONFLICT (creator_id) DO NOTHING;
  SELECT v.id INTO v_vendor FROM vendors v WHERE v.creator_id = v_creator;
  SELECT count(*) + 1 INTO v_attempt FROM vendor_payouts p WHERE p.deal_id = p_deal_id AND p.reason = 'creator_fee';
  INSERT INTO vendor_payouts (experience_id, deal_id, vendor_id, reason, gross_paise, platform_pct, platform_fee_paise,
    amount_paise, tds_paise, net_amount_paise, status, provider, idempotency_key, created_by)
  VALUES (v_exp, p_deal_id, v_vendor, 'creator_fee', t.creator_gross_paise, t.platform_pct, t.creator_gross_paise - t.creator_net_paise,
    t.creator_net_paise, p_tds_paise, t.creator_net_paise - p_tds_paise, 'requested', 'manual',
    'creator_fee:' || p_deal_id::text || ':' || v_attempt::text, my_user_id())
  RETURNING id INTO v_id;
  PERFORM experience_console_audit('experience.payout_requested', 'vendor_payouts', v_id,
    jsonb_build_object('experience_id', v_exp, 'deal_id', p_deal_id, 'creator_id', v_creator, 'attempt', v_attempt));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_payout_set_tds(p_payout_id uuid, p_tds_paise bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_exp uuid; v_pstatus text; v_amount bigint;
BEGIN
  PERFORM experience_console_require();
  SELECT p.experience_id INTO v_exp FROM vendor_payouts p WHERE p.id = p_payout_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Payout not found'; END IF;
  PERFORM 1 FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT p.status, p.amount_paise INTO v_pstatus, v_amount FROM vendor_payouts p WHERE p.id = p_payout_id FOR UPDATE;
  IF v_pstatus IS DISTINCT FROM 'requested' THEN RAISE EXCEPTION 'TDS is set before the payout is approved'; END IF;
  IF p_tds_paise IS NULL OR p_tds_paise < 0 OR p_tds_paise > v_amount THEN RAISE EXCEPTION 'TDS must be between 0 and the amount due'; END IF;
  UPDATE vendor_payouts SET tds_paise = p_tds_paise, net_amount_paise = v_amount - p_tds_paise, updated_at = now() WHERE id = p_payout_id;
  PERFORM experience_console_audit('experience.payout_tds_set', 'vendor_payouts', p_payout_id, jsonb_build_object('experience_id', v_exp));
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_payout_approve(p_payout_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_exp uuid; v_status text; v_pstatus text; v_by uuid; v_deal uuid; v_me uuid := my_user_id();
BEGIN
  PERFORM experience_console_require();
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
  UPDATE vendor_payouts SET status = 'approved', approved_by = v_me, approved_at = now(), updated_at = now() WHERE id = p_payout_id;
  PERFORM experience_console_audit('experience.payout_approved', 'vendor_payouts', p_payout_id,
    jsonb_build_object('experience_id', v_exp, 'deal_id', v_deal));
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_payout_paid(p_payout_id uuid, p_paid_on date, p_method text, p_reference text, p_proof_path text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_exp uuid; v_status text; v_pstatus text; v_deal uuid; v_approved timestamptz;
  v_ref text := btrim(coalesce(p_reference, ''));
BEGIN
  PERFORM experience_console_require();
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
  IF length(v_reason) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'Say why it is being cancelled (3 to 300 characters)'; END IF;
  UPDATE vendor_payouts SET status = 'cancelled', cancelled_at = now(), cancelled_by = my_user_id(), cancel_reason = v_reason, updated_at = now()
  WHERE id = p_payout_id;
  PERFORM experience_console_audit('experience.payout_cancelled', 'vendor_payouts', p_payout_id,
    jsonb_build_object('experience_id', v_exp, 'deal_id', v_deal, 'status_before', v_pstatus, 'reason', v_reason));
  INSERT INTO events (deal_id, actor_id, event_type, detail)
  VALUES (v_deal, my_user_id(), 'experience.payout_cancelled', jsonb_build_object('payout_id', p_payout_id));
END;
$$;

-- ═════ N. Completion: both sign-offs + everything delivered, invoiced, paid ═════
CREATE OR REPLACE FUNCTION experience_completion_check(p_experience_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text; v_brand_at timestamptz; v_prog jsonb;
  v_live int; v_unpaid int; v_drafts int;
  v_counted int; v_paid int; v_open int; v_no_outcome int;
  ok_deliv boolean; ok_inv boolean; ok_pay boolean; ok_brand boolean; v_blockers text[] := ARRAY[]::text[];
BEGIN
  SELECT e.status, e.brand_signoff_at INTO v_status, v_brand_at FROM experiences e WHERE e.id = p_experience_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  v_prog := experience_deliverables_progress(p_experience_id);
  ok_deliv := coalesce((v_prog ->> 'ready')::boolean, false);

  SELECT count(*) FILTER (WHERE si.status IN ('issued', 'paid')), count(*) FILTER (WHERE si.status = 'issued'), count(*) FILTER (WHERE si.status = 'draft')
    INTO v_live, v_unpaid, v_drafts FROM service_invoices si WHERE si.experience_id = p_experience_id;
  ok_inv := coalesce(v_live > 0 AND v_unpaid = 0 AND v_drafts = 0, false);

  SELECT count(*) FILTER (WHERE d.status = 'agreed' AND r.leg_shoot_outcome = 'done'),
         count(*) FILTER (WHERE d.status = 'agreed' AND r.leg_shoot_outcome = 'done' AND EXISTS (
           SELECT 1 FROM vendor_payouts p WHERE p.deal_id = t.deal_id AND p.reason = 'creator_fee' AND p.status = 'paid')),
         count(*) FILTER (WHERE d.status = 'negotiating'),
         count(*) FILTER (WHERE d.status = 'agreed' AND r.leg_shoot_outcome IS NULL)
    INTO v_counted, v_paid, v_open, v_no_outcome
    FROM experience_creator_terms t JOIN deals d ON d.id = t.deal_id
    LEFT JOIN experience_roster r ON r.leg_deal_id = t.deal_id
    WHERE t.experience_id = p_experience_id AND t.locked_at IS NOT NULL;
  ok_pay := coalesce(v_counted = v_paid AND v_open = 0 AND v_no_outcome = 0, false);
  ok_brand := v_brand_at IS NOT NULL;

  IF NOT ok_deliv THEN v_blockers := array_append(v_blockers, 'The brand has not approved everything sold'); END IF;
  IF v_drafts > 0 THEN v_blockers := array_append(v_blockers, 'Issue or discard the draft invoices'); END IF;
  IF v_live = 0 THEN v_blockers := array_append(v_blockers, 'No invoice has been issued'); END IF;
  IF v_unpaid > 0 THEN v_blockers := array_append(v_blockers, format('%s invoice(s) not fully paid', v_unpaid)); END IF;
  IF v_open > 0 OR v_no_outcome > 0 THEN v_blockers := array_append(v_blockers, 'Some creators have no outcome yet'); END IF;
  IF coalesce(v_counted - v_paid, 0) > 0 THEN v_blockers := array_append(v_blockers, format('%s creator(s) not paid', v_counted - v_paid)); END IF;
  IF NOT ok_brand THEN v_blockers := array_append(v_blockers, 'The brand has not signed off'); END IF;
  IF v_status IS DISTINCT FROM 'delivering' THEN v_blockers := array_append(v_blockers, 'An Experience is completed from Delivering'); END IF;

  RETURN jsonb_build_object(
    'status', v_status, 'deliverables_ok', ok_deliv, 'invoices_ok', ok_inv, 'payouts_ok', ok_pay, 'brand_signed_off', ok_brand,
    'invoices_live', v_live, 'invoices_unpaid', v_unpaid, 'invoices_draft', v_drafts,
    'creators_to_pay', v_counted, 'creators_paid', v_paid,
    'can_complete', coalesce(v_status = 'delivering' AND ok_deliv AND ok_inv AND ok_pay AND ok_brand, false),
    'blockers', to_jsonb(v_blockers));
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_completion(p_experience_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v jsonb;
BEGIN
  PERFORM experience_console_require();
  SELECT jsonb_build_object('brand_signoff_at', e.brand_signoff_at, 'brand_signoff_channel', e.brand_signoff_channel,
           'brand_signoff_note', e.brand_signoff_note, 'brand_signoff_by_name', coalesce(bu.full_name, bu.email),
           'guapd_signoff_at', e.guapd_signoff_at, 'guapd_signoff_by_name', coalesce(gu.full_name, gu.email))
    INTO v FROM experiences e LEFT JOIN users bu ON bu.id = e.brand_signoff_recorded_by LEFT JOIN users gu ON gu.id = e.guapd_signoff_by
    WHERE e.id = p_experience_id;
  IF v IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  RETURN experience_completion_check(p_experience_id) || v;
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_brand_signoff(p_experience_id uuid, p_channel text, p_note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text; v_at timestamptz; v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  PERFORM experience_console_require();
  SELECT e.status, e.brand_signoff_at INTO v_status, v_at FROM experiences e WHERE e.id = p_experience_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  IF v_status IS DISTINCT FROM 'delivering' THEN RAISE EXCEPTION 'The brand signs off while deliverables are with them'; END IF;
  IF v_at IS NOT NULL THEN RAISE EXCEPTION 'The brand''s sign-off is already recorded'; END IF;
  IF p_channel IS NULL OR p_channel NOT IN ('whatsapp', 'email', 'call', 'in_person') THEN RAISE EXCEPTION 'Say how the brand told us'; END IF;
  IF v_note IS NOT NULL AND length(v_note) > 500 THEN RAISE EXCEPTION 'The note is too long'; END IF;
  UPDATE experiences SET brand_signoff_at = now(), brand_signoff_channel = p_channel, brand_signoff_note = v_note,
    brand_signoff_recorded_by = my_user_id(), updated_at = now() WHERE id = p_experience_id;
  PERFORM experience_console_audit('experience.brand_signoff_recorded', 'experiences', p_experience_id,
    jsonb_build_object('channel', p_channel, 'note_length', coalesce(length(v_note), 0)));
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_brand_signoff_clear(p_experience_id uuid, p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text; v_at timestamptz; v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  PERFORM experience_console_require();
  SELECT e.status, e.brand_signoff_at INTO v_status, v_at FROM experiences e WHERE e.id = p_experience_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  IF v_status IS DISTINCT FROM 'delivering' THEN RAISE EXCEPTION 'The sign-off changes only while Delivering'; END IF;
  IF v_at IS NULL THEN RAISE EXCEPTION 'No sign-off recorded'; END IF;
  IF length(v_reason) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'Say why it is being cleared (3 to 300 characters)'; END IF;
  UPDATE experiences SET brand_signoff_at = NULL, brand_signoff_channel = NULL, brand_signoff_note = NULL,
    brand_signoff_recorded_by = NULL, updated_at = now() WHERE id = p_experience_id;
  PERFORM experience_console_audit('experience.brand_signoff_cleared', 'experiences', p_experience_id, jsonb_build_object('reason', v_reason));
END;
$$;

-- Guapd's sign-off IS the Complete action, allowed only when every condition holds.
CREATE OR REPLACE FUNCTION experience_console_complete(p_experience_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text; v_check jsonb;
BEGIN
  PERFORM experience_console_require();
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = p_experience_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  IF v_status IS DISTINCT FROM 'delivering' THEN RAISE EXCEPTION 'An Experience is completed from Delivering'; END IF;
  v_check := experience_completion_check(p_experience_id);
  IF (v_check ->> 'can_complete')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'Not ready to complete: %', (SELECT string_agg(x, '; ') FROM jsonb_array_elements_text(v_check -> 'blockers') x);
  END IF;
  UPDATE experiences SET status = 'complete', guapd_signoff_at = now(), guapd_signoff_by = my_user_id(), updated_at = now()
  WHERE id = p_experience_id;  -- freezes the P&L (trigger)
  PERFORM experience_console_audit('experience.completed', 'experiences', p_experience_id,
    jsonb_build_object('status_before', v_status, 'status_after', 'complete'));
END;
$$;

-- Reopen (finance) un-freezes the P&L and clears BOTH sign-offs: they sign again.
CREATE OR REPLACE FUNCTION experience_console_reopen(p_experience_id uuid, p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text; v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  IF has_experience_access('financial') IS NOT TRUE THEN
    RAISE EXCEPTION 'Financial access required to reopen a Complete Experience' USING ERRCODE = '42501';
  END IF;
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = p_experience_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  IF v_status IS DISTINCT FROM 'complete' THEN RAISE EXCEPTION 'Only a Complete Experience is reopened'; END IF;
  IF length(v_reason) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'Say why it is being reopened (3 to 300 characters)'; END IF;
  UPDATE experiences SET status = 'delivering', brand_signoff_at = NULL, brand_signoff_channel = NULL, brand_signoff_note = NULL,
    brand_signoff_recorded_by = NULL, guapd_signoff_at = NULL, guapd_signoff_by = NULL, updated_at = now()
  WHERE id = p_experience_id;  -- un-freezes (trigger)
  PERFORM experience_console_audit('experience.reopened', 'experiences', p_experience_id,
    jsonb_build_object('status_before', 'complete', 'status_after', 'delivering', 'reason', v_reason, 'signoffs_cleared', true));
END;
$$;

-- ═════ O. The brand: its issued invoices only (never drafts, voids, notes or payouts) ═════
CREATE OR REPLACE FUNCTION brand_experience_invoices(p_experience_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_title text; v_items jsonb;
BEGIN
  SELECT e.title INTO v_title
    FROM experiences e JOIN brands b ON b.id = e.brand_id
    WHERE e.id = p_experience_id AND b.is_guapd IS FALSE AND my_user_id() IS NOT NULL
      AND EXISTS (SELECT 1 FROM brand_members bm WHERE bm.brand_id = e.brand_id AND bm.user_id = my_user_id());
  IF v_title IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE = '42501'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'invoice_id', si.id, 'number', si.number, 'issue_date', si.issue_date, 'due_date', si.due_date,
           'description', si.description, 'subtotal_paise', si.subtotal_paise,
           'gst_paise', coalesce(si.cgst_paise, 0) + coalesce(si.sgst_paise, 0) + coalesce(si.igst_paise, 0),
           'total_paise', si.total_paise,
           'paid_paise', experience_invoice_paid_paise(si.id),
           'status', CASE WHEN si.status = 'paid' THEN 'paid'
                          WHEN experience_invoice_paid_paise(si.id) > 0 THEN 'part_paid' ELSE 'due' END,
           'has_pdf', si.pdf_path IS NOT NULL
         ) ORDER BY si.issue_date, si.number), '[]'::jsonb)
    INTO v_items
    FROM service_invoices si WHERE si.experience_id = p_experience_id AND si.status IN ('issued', 'paid');
  RETURN jsonb_build_object('title', v_title, 'invoices', v_items);
END;
$$;

CREATE OR REPLACE FUNCTION brand_experience_invoice_file(p_invoice_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_path text; v_number text;
BEGIN
  SELECT si.pdf_path, si.number INTO v_path, v_number
    FROM service_invoices si JOIN experiences e ON e.id = si.experience_id JOIN brands b ON b.id = e.brand_id
    WHERE si.id = p_invoice_id AND si.status IN ('issued', 'paid') AND si.pdf_path IS NOT NULL
      AND b.is_guapd IS FALSE AND my_user_id() IS NOT NULL
      AND EXISTS (SELECT 1 FROM brand_members bm WHERE bm.brand_id = e.brand_id AND bm.user_id = my_user_id());
  IF v_path IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object('storage_path', v_path, 'file_name', replace(v_number, '/', '-') || '.pdf');
END;
$$;

-- ═════ P. The creator: their payout statement (gross → 30% → net → TDS → paid) ═════
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
  v_videos int; v_owner text; v_items jsonb; v_payout jsonb;
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
    'items', v_items, 'payout', v_payout);
END;
$function$;

-- ═════ Q. The P&L: revenue flips to real on issue; GST is a liability; cash in and out beside it ═════
CREATE OR REPLACE FUNCTION compute_experience_pnl(p_experience_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_billed bigint; v_received bigint; v_invoices int; v_agreed bigint;
  v_gross bigint; v_net bigint; v_per_leg jsonb;
  v_awaiting int; v_awaiting_net bigint; v_declined int; v_no_shoot int;
  v_costs bigint; v_by_cat jsonb;
  v_subtotal bigint; v_fee_kept bigint; v_margin bigint;
  v_invoiced_total bigint; v_gst bigint; v_brand_tds bigint; v_drafts int;
  v_paid_out bigint; v_creator_tds bigint; v_payouts_paid int;
BEGIN
  -- Revenue = issued + paid invoices, BEFORE GST (GST is collected for the
  -- government: a liability, never revenue). A void counts for nothing.
  SELECT coalesce(sum(si.subtotal_paise) FILTER (WHERE si.status IN ('issued', 'paid')), 0)::bigint,
         coalesce(sum(si.total_paise) FILTER (WHERE si.status IN ('issued', 'paid')), 0)::bigint,
         coalesce(sum(coalesce(si.cgst_paise, 0) + coalesce(si.sgst_paise, 0) + coalesce(si.igst_paise, 0)) FILTER (WHERE si.status IN ('issued', 'paid')), 0)::bigint,
         count(*) FILTER (WHERE si.status IN ('issued', 'paid'))::int,
         count(*) FILTER (WHERE si.status = 'draft')::int
    INTO v_billed, v_invoiced_total, v_gst, v_invoices, v_drafts
    FROM service_invoices si WHERE si.experience_id = p_experience_id;
  -- Cash in: payments recorded (not reversed) on live invoices; TDS the brand withheld.
  SELECT coalesce(sum(x.amount_paise), 0)::bigint, coalesce(sum(x.tds_paise), 0)::bigint
    INTO v_received, v_brand_tds
    FROM service_invoice_payments x JOIN service_invoices si ON si.id = x.invoice_id
    WHERE x.experience_id = p_experience_id AND x.reversed_at IS NULL AND si.status IN ('issued', 'paid');
  -- Cash out to creators: paid payouts (what left Guapd, and TDS withheld from them).
  SELECT coalesce(sum(p.net_amount_paise), 0)::bigint, coalesce(sum(p.tds_paise), 0)::bigint, count(*)::int
    INTO v_paid_out, v_creator_tds, v_payouts_paid
    FROM vendor_payouts p WHERE p.experience_id = p_experience_id AND p.reason = 'creator_fee' AND p.status = 'paid';
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
  IF v_subtotal + v_fee_kept IS DISTINCT FROM v_margin THEN
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
    'per_leg', v_per_leg,
    -- 0540: the money loop.
    'invoiced_total_paise', v_invoiced_total, 'gst_liability_paise', v_gst, 'brand_tds_withheld_paise', v_brand_tds,
    'brand_outstanding_paise', v_invoiced_total - v_received - v_brand_tds, 'invoices_draft', v_drafts,
    'invoiced_vs_agreed_paise', CASE WHEN v_agreed IS NULL OR v_invoices = 0 THEN NULL ELSE v_billed - v_agreed END,
    'creator_paid_out_paise', v_paid_out, 'creator_tds_withheld_paise', v_creator_tds,
    'creator_payouts_paid', v_payouts_paid, 'creator_payouts_due', greatest(jsonb_array_length(v_per_leg) - v_payouts_paid, 0));
END;
$function$;

-- ═════ R. Who may call what ═════
DO $$
DECLARE
  f text;
  internal text[] := ARRAY[
    'experience_finance_require()', 'experience_fy(date)', 'experience_today()',
    'experience_finance_path(text, uuid, text)', 'experience_finance_file_ok(text, uuid, text)',
    'experience_invoice_window(text)', 'experience_invoice_paid_paise(uuid)',
    'experience_invoice_check(text, text, text, bigint, numeric, bigint, bigint, bigint, date, boolean)',
    'experience_completion_check(uuid)', 'freeze_issued_service_invoice()', 'guard_invoice_payment()', 'guard_vendor_payout()'];
  front text[] := ARRAY[
    'experience_console_finance_settings()',
    'experience_console_set_finance_settings(text, text, text, text, boolean, text, text)',
    'experience_console_brand_billing(uuid)',
    'experience_console_set_brand_billing(uuid, text, text, text, text, text, text)',
    'experience_finance_upload_slot(text, uuid, text)',
    'experience_console_finance_file(text, uuid)',
    'experience_console_invoices(uuid)',
    'experience_console_invoice_draft(uuid, text, text, text, bigint, numeric, bigint, bigint, bigint, date)',
    'experience_console_invoice_update(uuid, text, text, text, bigint, numeric, bigint, bigint, bigint, date)',
    'experience_console_invoice_discard(uuid)',
    'experience_console_invoice_issue(uuid)',
    'experience_console_invoice_doc(uuid)',
    'experience_console_invoice_pdf_path(uuid)',
    'experience_console_invoice_set_pdf(uuid, text)',
    'experience_console_invoice_void(uuid, text)',
    'experience_console_invoice_payment_add(uuid, bigint, bigint, date, text, text, text)',
    'experience_console_invoice_payment_reverse(uuid, text)',
    'experience_console_payouts(uuid)',
    'experience_console_payout_request(uuid, bigint)',
    'experience_console_payout_set_tds(uuid, bigint)',
    'experience_console_payout_approve(uuid)',
    'experience_console_payout_paid(uuid, date, text, text, text)',
    'experience_console_payout_cancel(uuid, text)',
    'experience_console_completion(uuid)',
    'experience_console_brand_signoff(uuid, text, text)',
    'experience_console_brand_signoff_clear(uuid, text)',
    'experience_console_complete(uuid)',
    'experience_console_reopen(uuid, text)',
    'brand_experience_invoices(uuid)',
    'brand_experience_invoice_file(uuid)',
    'creator_leg_context(uuid)'];
BEGIN
  FOREACH f IN ARRAY internal LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
  FOREACH f IN ARRAY front LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END;
$$;
-- compute_experience_pnl stays internal (0526); experience_pnl is its front door.
REVOKE ALL ON FUNCTION compute_experience_pnl(uuid) FROM PUBLIC, anon, authenticated;

-- 0568: the brand records its own payments against Guapd's invoice.
--
-- The brand portal had no way to say "we paid". Now an ADMIN on the brand's
-- account marks a payment against a Guapd (Leg 1) invoice: amount, TDS withheld,
-- date, how, and the reference. Part payments, any number of them, with a
-- running paid-to-date and balance.
--
-- A brand's word is not money received. A report is exactly that, a REPORT:
-- it never settles the invoice or touches service_invoice_payments, the P&L,
-- payouts or costs. Finance confirms it against a receipt it has recorded the
-- usual way (with proof), or rejects it with a reason. The brand sees the
-- invoice total, what Guapd has received, what it reported and Guapd has yet
-- to confirm, and the balance. Nothing else.
--
-- deny-on-NULL on every check; reports never exceed what is still due.

CREATE TABLE IF NOT EXISTS service_invoice_payment_reports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id       uuid NOT NULL REFERENCES service_invoices (id),
  experience_id    uuid NOT NULL REFERENCES experiences (id),
  brand_id         uuid NOT NULL REFERENCES brands (id),
  amount_paise     bigint NOT NULL CHECK (amount_paise >= 0),
  tds_paise        bigint NOT NULL DEFAULT 0 CHECK (tds_paise >= 0),
  paid_on          date NOT NULL,
  method           text NOT NULL CHECK (method IN ('bank_transfer', 'upi', 'cheque', 'cash', 'other')),
  reference        text NOT NULL CHECK (length(btrim(reference)) BETWEEN 3 AND 100),
  note             text CHECK (note IS NULL OR length(btrim(note)) BETWEEN 1 AND 300),
  status           text NOT NULL DEFAULT 'reported' CHECK (status IN ('reported', 'confirmed', 'rejected', 'withdrawn')),
  reported_by      uuid REFERENCES users (id) ON DELETE SET NULL,
  reported_at      timestamptz NOT NULL DEFAULT now(),
  payment_id       uuid REFERENCES service_invoice_payments (id),
  decided_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  decided_at       timestamptz,
  decided_reason   text,
  CONSTRAINT sipr_positive CHECK (amount_paise + tds_paise > 0),
  CONSTRAINT sipr_decided_shape CHECK (
    (status = 'reported' AND decided_at IS NULL AND payment_id IS NULL)
    OR (status = 'confirmed' AND decided_at IS NOT NULL AND payment_id IS NOT NULL)
    OR (status IN ('rejected', 'withdrawn') AND decided_at IS NOT NULL AND payment_id IS NULL
        AND decided_reason IS NOT NULL AND length(btrim(decided_reason)) BETWEEN 3 AND 300))
);
CREATE INDEX IF NOT EXISTS sipr_invoice_idx ON service_invoice_payment_reports (invoice_id);
CREATE INDEX IF NOT EXISTS sipr_experience_idx ON service_invoice_payment_reports (experience_id);
-- One receipt confirms one report.
CREATE UNIQUE INDEX IF NOT EXISTS sipr_payment_once ON service_invoice_payment_reports (payment_id) WHERE payment_id IS NOT NULL;
-- The same reference is not reported twice on one invoice while it is live.
CREATE UNIQUE INDEX IF NOT EXISTS sipr_reference_once ON service_invoice_payment_reports (invoice_id, lower(btrim(reference))) WHERE status IN ('reported', 'confirmed');

ALTER TABLE service_invoice_payment_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON service_invoice_payment_reports FROM PUBLIC, anon, authenticated;

-- What a brand has reported that Guapd has not confirmed or rejected yet.
CREATE OR REPLACE FUNCTION public.experience_invoice_reported_paise(p_invoice_id uuid)
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(sum(r.amount_paise + r.tds_paise), 0)::bigint FROM service_invoice_payment_reports r
  WHERE r.invoice_id = p_invoice_id AND r.status = 'reported'
$function$;
REVOKE ALL ON FUNCTION public.experience_invoice_reported_paise(uuid) FROM PUBLIC, anon, authenticated;

-- ── Brand: mark a payment ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.brand_experience_payment_report(
  p_invoice_id uuid, p_amount_paise bigint, p_tds_paise bigint, p_paid_on date,
  p_method text, p_reference text, p_note text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exp uuid; v_brand uuid; v_status text; v_total bigint; v_issued date; v_number text;
  v_received bigint; v_reported bigint; v_due bigint; v_id uuid;
  v_ref text := btrim(coalesce(p_reference, '')); v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  SELECT si.experience_id INTO v_exp FROM service_invoices si WHERE si.id = p_invoice_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE = '42501'; END IF;
  v_brand := brand_experience_require(v_exp, true);
  SELECT si.status, si.total_paise, si.issue_date, si.number INTO v_status, v_total, v_issued, v_number
    FROM service_invoices si WHERE si.id = p_invoice_id FOR UPDATE;
  IF v_status IS DISTINCT FROM 'issued' THEN RAISE EXCEPTION 'This invoice is not open for payment'; END IF;
  IF v_total IS NULL OR v_total <= 0 THEN RAISE EXCEPTION 'This invoice has no amount due'; END IF;
  IF p_amount_paise IS NULL OR p_amount_paise < 0 THEN RAISE EXCEPTION 'Enter the amount you paid'; END IF;
  IF p_tds_paise IS NULL OR p_tds_paise < 0 THEN RAISE EXCEPTION 'Enter the TDS you deducted (0 if none)'; END IF;
  IF p_amount_paise + p_tds_paise <= 0 THEN RAISE EXCEPTION 'Enter the amount you paid'; END IF;
  IF p_paid_on IS NULL OR p_paid_on > experience_today() THEN RAISE EXCEPTION 'Enter the date you paid (not in the future)'; END IF;
  IF v_issued IS NOT NULL AND p_paid_on < v_issued - 90 THEN RAISE EXCEPTION 'That date is long before the invoice was issued'; END IF;
  IF p_method IS NULL OR p_method NOT IN ('bank_transfer', 'upi', 'cheque', 'cash', 'other') THEN RAISE EXCEPTION 'Say how you paid'; END IF;
  IF length(v_ref) NOT BETWEEN 3 AND 100 THEN RAISE EXCEPTION 'Enter the payment reference (UTR or cheque number)'; END IF;
  IF v_note IS NOT NULL AND length(v_note) > 300 THEN RAISE EXCEPTION 'Keep the note under 300 characters'; END IF;
  IF EXISTS (SELECT 1 FROM service_invoice_payment_reports r WHERE r.invoice_id = p_invoice_id
               AND lower(btrim(r.reference)) = lower(v_ref) AND r.status IN ('reported', 'confirmed')) THEN
    RAISE EXCEPTION 'You have already marked a payment with this reference';
  END IF;
  v_received := experience_invoice_paid_paise(p_invoice_id);
  v_reported := experience_invoice_reported_paise(p_invoice_id);
  v_due := v_total - coalesce(v_received, v_total) - coalesce(v_reported, v_total);
  IF v_due IS NULL OR p_amount_paise + p_tds_paise > v_due THEN
    RAISE EXCEPTION 'That is more than the balance on this invoice (%)', to_char(greatest(coalesce(v_due, 0), 0) / 100.0, 'FM99,99,99,99,990.00');
  END IF;

  INSERT INTO service_invoice_payment_reports (invoice_id, experience_id, brand_id, amount_paise, tds_paise, paid_on, method, reference, note, reported_by)
    VALUES (p_invoice_id, v_exp, v_brand, p_amount_paise, p_tds_paise, p_paid_on, p_method, v_ref, v_note, my_user_id())
    RETURNING id INTO v_id;
  PERFORM experience_console_audit('experience.payment_reported_by_brand', 'service_invoice_payment_reports', v_id,
    jsonb_build_object('experience_id', v_exp, 'invoice_id', p_invoice_id, 'invoice_number', v_number,
      'amount_paise', p_amount_paise, 'tds_paise', p_tds_paise, 'paid_on', p_paid_on, 'method', p_method,
      'balance_before_paise', v_due, 'balance_after_paise', v_due - p_amount_paise - p_tds_paise));
  RETURN jsonb_build_object('report_id', v_id, 'balance_paise', v_due - p_amount_paise - p_tds_paise);
END;
$function$;
REVOKE ALL ON FUNCTION public.brand_experience_payment_report(uuid, bigint, bigint, date, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.brand_experience_payment_report(uuid, bigint, bigint, date, text, text, text) TO authenticated;

-- ── Brand: the invoices, with received / reported / balance ──────────────────
CREATE OR REPLACE FUNCTION public.brand_experience_invoices(p_experience_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_title text; v_items jsonb;
BEGIN
  PERFORM brand_experience_require(p_experience_id, false);
  SELECT e.title INTO v_title FROM experiences e WHERE e.id = p_experience_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'invoice_id', si.id, 'number', si.number, 'issue_date', si.issue_date, 'due_date', si.due_date,
           'description', si.description, 'subtotal_paise', si.subtotal_paise,
           'gst_paise', coalesce(si.cgst_paise, 0) + coalesce(si.sgst_paise, 0) + coalesce(si.igst_paise, 0),
           'total_paise', si.total_paise,
           'paid_paise', experience_invoice_paid_paise(si.id),
           -- 0568: what the brand marked paid that Guapd has not confirmed yet, and what is left.
           'reported_paise', CASE WHEN si.status = 'paid' THEN 0 ELSE experience_invoice_reported_paise(si.id) END,
           'balance_paise', CASE WHEN si.status = 'paid' THEN 0
                                 ELSE greatest(si.total_paise - experience_invoice_paid_paise(si.id) - experience_invoice_reported_paise(si.id), 0) END,
           'reports', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                          'amount_paise', r.amount_paise, 'tds_paise', r.tds_paise, 'paid_on', r.paid_on,
                          'method', r.method, 'reference', r.reference, 'status', r.status,
                          'reason', CASE WHEN r.status = 'rejected' THEN r.decided_reason END) ORDER BY r.reported_at), '[]'::jsonb)
                       FROM service_invoice_payment_reports r WHERE r.invoice_id = si.id),
           'status', CASE WHEN si.status = 'paid' THEN 'paid'
                          WHEN experience_invoice_paid_paise(si.id) > 0 THEN 'part_paid' ELSE 'due' END,
           'has_pdf', si.pdf_path IS NOT NULL
         ) ORDER BY si.issue_date, si.number), '[]'::jsonb)
    INTO v_items
    FROM service_invoices si WHERE si.experience_id = p_experience_id AND si.status IN ('issued', 'paid');
  RETURN jsonb_build_object('title', v_title, 'invoices', v_items);
END;
$function$;

-- ── Finance: the brand's reports, and the decision on each ───────────────────
CREATE OR REPLACE FUNCTION public.experience_console_payment_reports(p_experience_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM experience_finance_require();
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object(
            'report_id', r.id, 'invoice_id', r.invoice_id, 'invoice_number', si.number,
            'amount_paise', r.amount_paise, 'tds_paise', r.tds_paise, 'paid_on', r.paid_on, 'method', r.method,
            'reference', r.reference, 'note', r.note, 'status', r.status, 'reported_at', r.reported_at,
            'reported_by', u.email, 'payment_id', r.payment_id, 'decided_at', r.decided_at, 'decided_reason', r.decided_reason
          ) ORDER BY r.reported_at DESC), '[]'::jsonb)
          FROM service_invoice_payment_reports r
          JOIN service_invoices si ON si.id = r.invoice_id
          LEFT JOIN users u ON u.id = r.reported_by
          WHERE r.experience_id = p_experience_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.experience_console_payment_reports(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.experience_console_payment_reports(uuid) TO authenticated;

-- Confirm: link a receipt finance has recorded (with proof) on the same invoice.
-- Reject: say why. Both only from 'reported'.
CREATE OR REPLACE FUNCTION public.experience_console_payment_report_decide(
  p_report_id uuid, p_decision text, p_payment_id uuid DEFAULT NULL, p_reason text DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record; v_pay_invoice uuid; v_reversed timestamptz; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  PERFORM experience_finance_require();
  SELECT x.id, x.invoice_id, x.experience_id, x.status, x.amount_paise, x.tds_paise INTO r
    FROM service_invoice_payment_reports x WHERE x.id = p_report_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Payment report not found'; END IF;
  IF r.status IS DISTINCT FROM 'reported' THEN RAISE EXCEPTION 'This report is already decided'; END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('confirmed', 'rejected') THEN RAISE EXCEPTION 'Confirm or reject it'; END IF;
  IF p_decision = 'confirmed' THEN
    SELECT p.invoice_id, p.reversed_at INTO v_pay_invoice, v_reversed FROM service_invoice_payments p WHERE p.id = p_payment_id;
    IF v_pay_invoice IS NULL OR v_pay_invoice IS DISTINCT FROM r.invoice_id THEN
      RAISE EXCEPTION 'Record the receipt on this invoice first, then pick it here';
    END IF;
    IF v_reversed IS NOT NULL THEN RAISE EXCEPTION 'That receipt was reversed'; END IF;
    IF EXISTS (SELECT 1 FROM service_invoice_payment_reports x WHERE x.payment_id = p_payment_id) THEN
      RAISE EXCEPTION 'That receipt already confirms another report';
    END IF;
    UPDATE service_invoice_payment_reports SET status = 'confirmed', payment_id = p_payment_id,
           decided_by = my_user_id(), decided_at = now(), decided_reason = v_reason WHERE id = p_report_id;
  ELSE
    IF v_reason IS NULL OR length(v_reason) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'Say why (3 to 300 characters); the brand sees it'; END IF;
    UPDATE service_invoice_payment_reports SET status = 'rejected', decided_by = my_user_id(), decided_at = now(), decided_reason = v_reason
      WHERE id = p_report_id;
  END IF;
  PERFORM experience_console_audit('experience.payment_report_' || p_decision, 'service_invoice_payment_reports', p_report_id,
    jsonb_build_object('experience_id', r.experience_id, 'invoice_id', r.invoice_id, 'status_before', 'reported', 'status_after', p_decision,
      'amount_paise', r.amount_paise, 'tds_paise', r.tds_paise, 'payment_id', p_payment_id));
END;
$function$;
REVOKE ALL ON FUNCTION public.experience_console_payment_report_decide(uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.experience_console_payment_report_decide(uuid, text, uuid, text) TO authenticated;

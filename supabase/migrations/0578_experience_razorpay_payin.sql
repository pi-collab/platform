-- 0578: the brand pays a Guapd (Leg 1) Experience invoice online, through
-- Razorpay Standard Checkout. Money IN only, brand -> Guapd. Nothing here reads
-- or writes creator pay, payouts, costs, margin or the creator side.
--
-- The flow:
--   1. A brand ADMIN asks to pay. brand_experience_payin_quote (their own
--      session) says what is due: the invoice total less what Guapd has
--      received and what the brand has marked paid and Guapd is still checking.
--      The amount is always this, worked out here. The browser never sends one.
--   2. The server creates the Razorpay order for exactly that amount and files
--      it with razorpay_payin_order_record (service role), which works the
--      balance out again and refuses if it moved.
--   3. Razorpay's signed payment.captured webhook calls razorpay_payin_capture
--      (service role). That, and only that, records money against the invoice:
--      a service_invoice_payments row (method 'razorpay', reference = the
--      Razorpay payment id) and, when it clears the balance, the invoice is
--      marked paid. The checkout's success callback in the browser records
--      nothing; it can be faked.
--
-- One Razorpay payment id is filed once, ever (razorpay_payin_payments is the
-- reconciliation record and is never deleted by the app), so a re-delivered
-- webhook is a no-op even after finance reverses the payment. A payment that
-- cannot go on the invoice (amount differs from our order, not INR, the order
-- is not ours, the invoice is no longer open, more than is due) is still filed,
-- as needs_review with the reason, so money received is never lost; it never
-- touches the invoice.
--
-- deny-on-NULL throughout: a missing invoice, amount, order or payment id refuses.

-- ═════ A. The payments ledger accepts an online payment ═════
-- An online payment's proof is Razorpay's verified webhook (razorpay_payin_payments),
-- not an uploaded file. Every other method still needs its proof.
ALTER TABLE service_invoice_payments DROP CONSTRAINT IF EXISTS service_invoice_payments_method_check;
ALTER TABLE service_invoice_payments ADD CONSTRAINT service_invoice_payments_method_check
  CHECK (method IN ('bank_transfer', 'upi', 'cheque', 'cash', 'other', 'razorpay'));
ALTER TABLE service_invoice_payments ALTER COLUMN proof_path DROP NOT NULL;
ALTER TABLE service_invoice_payments DROP CONSTRAINT IF EXISTS sip_proof_unless_razorpay;
ALTER TABLE service_invoice_payments ADD CONSTRAINT sip_proof_unless_razorpay
  CHECK (proof_path IS NOT NULL OR method = 'razorpay');

-- ═════ B. The orders Guapd created ═════
CREATE TABLE IF NOT EXISTS razorpay_payin_orders (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  razorpay_order_id  text NOT NULL UNIQUE CHECK (razorpay_order_id ~ '^order_[A-Za-z0-9]{6,40}$'),
  invoice_id         uuid NOT NULL REFERENCES service_invoices (id),
  experience_id      uuid NOT NULL REFERENCES experiences (id),
  brand_id           uuid NOT NULL REFERENCES brands (id),
  amount_paise       bigint NOT NULL CHECK (amount_paise >= 100),
  currency           text NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  receipt            text NOT NULL CHECK (length(btrim(receipt)) BETWEEN 1 AND 40),
  status             text NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid')),
  created_by         uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  paid_at            timestamptz,
  CONSTRAINT rpo_paid_shape CHECK ((status = 'paid') = (paid_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS rpo_invoice_idx ON razorpay_payin_orders (invoice_id);
COMMENT ON TABLE razorpay_payin_orders IS
  'Razorpay orders Guapd created for a brand to pay a Leg 1 Experience invoice. Amount set server-side. Server only.';

-- ═════ C. Every captured payment, filed once (the reconciliation record) ═════
CREATE TABLE IF NOT EXISTS razorpay_payin_payments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  razorpay_payment_id text NOT NULL UNIQUE CHECK (razorpay_payment_id ~ '^pay_[A-Za-z0-9]{6,40}$'),
  razorpay_order_id   text NOT NULL,
  order_id            uuid REFERENCES razorpay_payin_orders (id),
  invoice_id          uuid REFERENCES service_invoices (id),
  amount_paise        bigint NOT NULL CHECK (amount_paise > 0),
  currency            text NOT NULL,
  pay_method          text,
  event_id            text,
  captured_at         timestamptz NOT NULL,
  outcome             text NOT NULL CHECK (outcome IN ('recorded', 'needs_review')),
  review_reason       text,
  invoice_payment_id  uuid UNIQUE REFERENCES service_invoice_payments (id),
  received_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rpp_outcome_shape CHECK (
    (outcome = 'recorded' AND invoice_payment_id IS NOT NULL AND order_id IS NOT NULL AND invoice_id IS NOT NULL AND review_reason IS NULL)
    OR (outcome = 'needs_review' AND invoice_payment_id IS NULL AND review_reason IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS rpp_invoice_idx ON razorpay_payin_payments (invoice_id);
CREATE INDEX IF NOT EXISTS rpp_review_idx ON razorpay_payin_payments (received_at) WHERE outcome = 'needs_review';
COMMENT ON TABLE razorpay_payin_payments IS
  'One row per Razorpay payment id, from the signed payment.captured webhook. recorded = on the invoice; needs_review = money received that finance must place or refund. Never edited. Server only.';

-- Filed once, never edited. Only the service role (test clean-up) deletes.
CREATE OR REPLACE FUNCTION guard_razorpay_payin_payment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'A filed Razorpay payment is never edited'; END IF;
  IF current_user IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'A filed Razorpay payment is never deleted'; END IF;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS t_rpp_guard ON razorpay_payin_payments;
CREATE TRIGGER t_rpp_guard BEFORE UPDATE OR DELETE ON razorpay_payin_payments
  FOR EACH ROW EXECUTE FUNCTION guard_razorpay_payin_payment();

ALTER TABLE razorpay_payin_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE razorpay_payin_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON razorpay_payin_orders, razorpay_payin_payments FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON razorpay_payin_orders, razorpay_payin_payments TO service_role;

-- ═════ D. What the brand owes on one invoice, right now ═════
-- Shared by the quote and the order record so both say the same number.
CREATE OR REPLACE FUNCTION experience_payin_due_paise(p_invoice_id uuid) RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT si.total_paise - experience_invoice_paid_paise(si.id) - experience_invoice_reported_paise(si.id)
  FROM service_invoices si WHERE si.id = p_invoice_id
$$;
REVOKE ALL ON FUNCTION experience_payin_due_paise(uuid) FROM PUBLIC, anon, authenticated;

-- ═════ E. Brand: the amount to pay online (admin only) ═════
-- Returns the amount, the receipt (invoice number), and an order already
-- created for exactly this amount that is still unpaid, so a second click or a
-- second tab reuses it rather than opening a second order for the same money.
CREATE OR REPLACE FUNCTION public.brand_experience_payin_quote(p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exp uuid; v_brand uuid; v_estatus text; v_istatus text; v_total bigint; v_number text; v_due bigint; v_order text;
BEGIN
  SELECT si.experience_id INTO v_exp FROM service_invoices si WHERE si.id = p_invoice_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE = '42501'; END IF;
  v_brand := brand_experience_require(v_exp, true);
  SELECT e.status INTO v_estatus FROM experiences e WHERE e.id = v_exp;
  SELECT si.status, si.total_paise, si.number INTO v_istatus, v_total, v_number FROM service_invoices si WHERE si.id = p_invoice_id;
  IF v_estatus IS NULL OR v_estatus = 'complete' THEN RAISE EXCEPTION 'This Experience is closed. Contact Guapd to pay'; END IF;
  IF v_istatus IS DISTINCT FROM 'issued' THEN RAISE EXCEPTION 'This invoice is not open for payment'; END IF;
  IF v_total IS NULL OR v_total <= 0 OR v_number IS NULL THEN RAISE EXCEPTION 'This invoice has no amount due'; END IF;
  v_due := experience_payin_due_paise(p_invoice_id);
  IF v_due IS NULL OR v_due <= 0 THEN RAISE EXCEPTION 'Nothing is left to pay on this invoice'; END IF;
  IF v_due < 100 THEN RAISE EXCEPTION 'The balance is too small to pay online. Contact Guapd'; END IF;
  SELECT o.razorpay_order_id INTO v_order FROM razorpay_payin_orders o
    WHERE o.invoice_id = p_invoice_id AND o.status = 'created' AND o.amount_paise = v_due
      AND o.created_at > now() - interval '12 hours'
    ORDER BY o.created_at DESC LIMIT 1;
  RETURN jsonb_build_object('invoice_id', p_invoice_id, 'experience_id', v_exp, 'brand_id', v_brand,
    'number', v_number, 'amount_paise', v_due, 'currency', 'INR', 'order_id', v_order);
END;
$function$;
REVOKE ALL ON FUNCTION public.brand_experience_payin_quote(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.brand_experience_payin_quote(uuid) TO authenticated;

-- ═════ F. Server: file the order it just created ═════
CREATE OR REPLACE FUNCTION public.razorpay_payin_order_record(
  p_razorpay_order_id text, p_invoice_id uuid, p_amount_paise bigint, p_receipt text, p_created_by uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exp uuid; v_brand uuid; v_istatus text; v_number text; v_due bigint; v_id uuid;
BEGIN
  IF p_razorpay_order_id IS NULL OR p_invoice_id IS NULL OR p_amount_paise IS NULL OR p_receipt IS NULL THEN
    RAISE EXCEPTION 'Incomplete order';
  END IF;
  SELECT si.experience_id, e.brand_id, si.status, si.number INTO v_exp, v_brand, v_istatus, v_number
    FROM service_invoices si JOIN experiences e ON e.id = si.experience_id
    WHERE si.id = p_invoice_id FOR UPDATE OF si;
  IF v_exp IS NULL OR v_brand IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF v_istatus IS DISTINCT FROM 'issued' THEN RAISE EXCEPTION 'This invoice is not open for payment'; END IF;
  IF p_receipt IS DISTINCT FROM v_number THEN RAISE EXCEPTION 'The receipt is not this invoice'; END IF;
  v_due := experience_payin_due_paise(p_invoice_id);
  IF v_due IS NULL OR p_amount_paise IS DISTINCT FROM v_due OR p_amount_paise < 100 THEN
    RAISE EXCEPTION 'The balance on this invoice changed. Refresh and try again';
  END IF;
  INSERT INTO razorpay_payin_orders (razorpay_order_id, invoice_id, experience_id, brand_id, amount_paise, receipt, created_by)
    VALUES (p_razorpay_order_id, p_invoice_id, v_exp, v_brand, p_amount_paise, p_receipt, p_created_by)
    RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.razorpay_payin_order_record(text, uuid, bigint, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.razorpay_payin_order_record(text, uuid, bigint, text, uuid) TO service_role;

-- ═════ G. Webhook: a verified payment.captured ═════
-- The ONLY path that records online money against an invoice. Idempotent on
-- the Razorpay payment id. Returns { outcome: recorded | needs_review | duplicate }.
CREATE OR REPLACE FUNCTION public.razorpay_payin_capture(
  p_payment_id text, p_order_id text, p_amount_paise bigint, p_currency text,
  p_method text, p_event_id text, p_captured_at timestamptz)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o record; v_estatus text; v_istatus text; v_total bigint; v_outstanding bigint;
  v_reason text; v_pay uuid; v_settled boolean;
BEGIN
  IF p_payment_id IS NULL OR p_order_id IS NULL OR p_amount_paise IS NULL OR p_amount_paise <= 0
     OR p_currency IS NULL OR p_captured_at IS NULL THEN
    RAISE EXCEPTION 'Incomplete payment';
  END IF;

  -- Lock our order first: two deliveries of the same payment queue here.
  SELECT x.id, x.invoice_id, x.experience_id, x.amount_paise, x.status INTO o
    FROM razorpay_payin_orders x WHERE x.razorpay_order_id = p_order_id FOR UPDATE;

  IF EXISTS (SELECT 1 FROM razorpay_payin_payments p WHERE p.razorpay_payment_id = p_payment_id) THEN
    RETURN jsonb_build_object('outcome', 'duplicate');
  END IF;

  IF o.id IS NULL THEN
    v_reason := 'The order is not one Guapd created';
  ELSE
    SELECT e.status INTO v_estatus FROM experiences e WHERE e.id = o.experience_id FOR UPDATE;
    SELECT si.status, si.total_paise INTO v_istatus, v_total FROM service_invoices si WHERE si.id = o.invoice_id FOR UPDATE;
    v_outstanding := v_total - experience_invoice_paid_paise(o.invoice_id);
    v_reason := CASE
      WHEN p_currency IS DISTINCT FROM 'INR' THEN 'Not paid in INR'
      WHEN p_amount_paise IS DISTINCT FROM o.amount_paise THEN 'The amount differs from the order'
      WHEN o.status IS DISTINCT FROM 'created' THEN 'The order was already paid'
      WHEN v_estatus IS NULL OR v_estatus = 'complete' THEN 'The Experience is complete'
      WHEN v_istatus IS DISTINCT FROM 'issued' THEN 'The invoice is not open (' || coalesce(v_istatus, 'missing') || ')'
      WHEN v_outstanding IS NULL OR p_amount_paise > v_outstanding THEN 'More than is due on the invoice'
    END;
  END IF;

  IF v_reason IS NOT NULL THEN
    INSERT INTO razorpay_payin_payments (razorpay_payment_id, razorpay_order_id, order_id, invoice_id, amount_paise, currency,
                                         pay_method, event_id, captured_at, outcome, review_reason)
      VALUES (p_payment_id, p_order_id, o.id, o.invoice_id, p_amount_paise, p_currency, p_method, p_event_id, p_captured_at,
              'needs_review', v_reason);
    RETURN jsonb_build_object('outcome', 'needs_review', 'reason', v_reason);
  END IF;

  INSERT INTO service_invoice_payments (invoice_id, experience_id, amount_paise, tds_paise, received_on, method, reference, proof_path, recorded_by)
    VALUES (o.invoice_id, o.experience_id, p_amount_paise, 0, (p_captured_at AT TIME ZONE 'Asia/Kolkata')::date, 'razorpay',
            p_payment_id, NULL, NULL)
    RETURNING id INTO v_pay;
  v_settled := (p_amount_paise = v_outstanding);
  IF v_settled THEN
    UPDATE service_invoices SET status = 'paid', paid_at = now(), payment_reference = p_payment_id, updated_at = now()
      WHERE id = o.invoice_id;
  END IF;
  UPDATE razorpay_payin_orders SET status = 'paid', paid_at = now() WHERE id = o.id;
  INSERT INTO razorpay_payin_payments (razorpay_payment_id, razorpay_order_id, order_id, invoice_id, amount_paise, currency,
                                       pay_method, event_id, captured_at, outcome, invoice_payment_id)
    VALUES (p_payment_id, p_order_id, o.id, o.invoice_id, p_amount_paise, p_currency, p_method, p_event_id, p_captured_at,
            'recorded', v_pay);
  RETURN jsonb_build_object('outcome', 'recorded', 'settled', v_settled, 'invoice_payment_id', v_pay);
EXCEPTION WHEN unique_violation THEN
  -- A concurrent delivery of the same payment id won the race; this one is a no-op.
  IF EXISTS (SELECT 1 FROM razorpay_payin_payments p WHERE p.razorpay_payment_id = p_payment_id) THEN
    RETURN jsonb_build_object('outcome', 'duplicate');
  END IF;
  RAISE;
END;
$function$;
REVOKE ALL ON FUNCTION public.razorpay_payin_capture(text, text, bigint, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.razorpay_payin_capture(text, text, bigint, text, text, text, timestamptz) TO service_role;

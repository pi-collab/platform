-- ================================================================
-- ROBUSTNESS: atomic functions for deal mutations
-- ================================================================

-- ── Atomic revision-request ───────────────────────────────────
-- Transitions deal delivered → revision AND increments revisions_used
-- in a single atomic UPDATE (no read-then-write race).
-- Returns the number of rows affected (0 = deal wasn't in 'delivered').
CREATE OR REPLACE FUNCTION request_deal_revision(p_deal_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rows_affected int;
BEGIN
  -- Ownership: caller must be the brand on this deal
  IF NOT EXISTS (
    SELECT 1 FROM deals WHERE id = p_deal_id AND brand_id = my_brand_id()
  ) THEN
    RETURN 0;
  END IF;

  UPDATE deals
  SET status = 'revision',
      revisions_used = revisions_used + 1
  WHERE id = p_deal_id
    AND status = 'delivered';

  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RETURN rows_affected;
END;
$$;

-- ── Atomic mark-deal-paid ─────────────────────────────────────
-- All-or-nothing: invoice→paid, deal→paid, deal→complete.
-- Idempotent: if already paid/complete, returns success (no-op).
-- Ownership: caller must be the brand on this deal.
-- This is the single swap-point for Razorpay Route integration:
-- replace the app-side call with a webhook-triggered call.
CREATE OR REPLACE FUNCTION mark_deal_paid(p_deal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand_id uuid;
  v_deal_status text;
  v_invoice_id uuid;
  v_invoice_status text;
  v_now timestamptz := now();
BEGIN
  -- Lock the deal row for the duration of this transaction
  SELECT d.brand_id, d.status
  INTO v_brand_id, v_deal_status
  FROM deals d
  WHERE d.id = p_deal_id
  FOR UPDATE;

  IF v_brand_id IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Deal not found.');
  END IF;

  -- Ownership check
  IF v_brand_id != my_brand_id() THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Not authorized.');
  END IF;

  -- Idempotent: already paid or complete → safe no-op
  IF v_deal_status IN ('paid', 'complete') THEN
    RETURN jsonb_build_object('status', 'success', 'already', true);
  END IF;

  -- Guard: deal must be approved
  IF v_deal_status != 'approved' THEN
    RETURN jsonb_build_object('status', 'error', 'message',
      format('Cannot mark as paid — deal is "%s".', v_deal_status));
  END IF;

  -- Lock and check invoice
  SELECT i.id, i.status
  INTO v_invoice_id, v_invoice_status
  FROM invoices i
  WHERE i.deal_id = p_deal_id
  FOR UPDATE;

  IF v_invoice_id IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'No invoice found.');
  END IF;

  IF v_invoice_status != 'accepted' THEN
    -- Idempotent: invoice already paid → no-op
    IF v_invoice_status = 'paid' THEN
      RETURN jsonb_build_object('status', 'success', 'already', true);
    END IF;
    RETURN jsonb_build_object('status', 'error', 'message',
      format('Invoice must be accepted — currently "%s".', v_invoice_status));
  END IF;

  -- ── ALL THREE IN ONE TRANSACTION ──
  -- 1. Invoice → paid
  UPDATE invoices
  SET status = 'paid', paid_at = v_now, updated_at = v_now
  WHERE id = v_invoice_id;

  -- 2. Deal → paid (audit trigger fires)
  UPDATE deals
  SET status = 'paid'
  WHERE id = p_deal_id;

  -- 3. Deal → complete (audit trigger fires again — two events logged)
  UPDATE deals
  SET status = 'complete', completed_at = v_now
  WHERE id = p_deal_id;

  RETURN jsonb_build_object('status', 'success');
END;
$$;

-- 0583: the creator's invoice to Guapd prints the bank account to pay into.
--
-- An invoice says where to send the money; Guapd's own invoice to the brand
-- does. Before this, the creator's invoice left it off and staff had to open
-- the payout to find it. Same pattern as the PAN (0581):
--
--   A. The invoice keeps the bank account it was raised with (holder, IFSC,
--      account number encrypted with the payout key), so a later change on
--      the Payments page does not rewrite an issued invoice.
--   B. Issued invoices raised before this get the account on file now: the
--      account they will be paid into. Void invoices are left alone.
--   C. The document shows the account in full to the creator and to finance;
--      operational staff see the last 4, as with the payout details (0542).
--
-- Payment still goes by the payout's account (experience_console_payout_account,
-- which flags a change after the payout was requested). Money figures are not
-- read or changed here.

-- ═════ A. Columns, kept with the invoice ═════
ALTER TABLE experience_creator_invoices ADD COLUMN IF NOT EXISTS creator_bank_holder text;
ALTER TABLE experience_creator_invoices ADD COLUMN IF NOT EXISTS creator_account_enc bytea;
ALTER TABLE experience_creator_invoices ADD COLUMN IF NOT EXISTS creator_account_last4 text;
ALTER TABLE experience_creator_invoices ADD COLUMN IF NOT EXISTS creator_ifsc text;
ALTER TABLE experience_creator_invoices DROP CONSTRAINT IF EXISTS eci_bank_shape;
ALTER TABLE experience_creator_invoices ADD CONSTRAINT eci_bank_shape CHECK (
  (creator_account_enc IS NULL) = (creator_account_last4 IS NULL)
  AND (creator_account_last4 IS NULL OR creator_account_last4 ~ '^[0-9]{4}$'));

CREATE OR REPLACE FUNCTION guard_creator_invoice_needs_bank() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d record;
BEGIN
  SELECT pd.account_holder_name, pd.account_number_enc, pd.account_last4, pd.ifsc, pd.pan_enc, pd.pan_last4 INTO d
    FROM vendors v JOIN vendor_payout_details pd ON pd.vendor_id = v.id
    WHERE v.creator_id = NEW.creator_id;
  IF d.account_last4 IS NULL OR d.pan_last4 IS NULL THEN
    RAISE EXCEPTION 'Add your bank details and PAN on the Payments page before you raise your invoice';
  END IF;
  -- 0581: the invoice keeps the PAN it was raised with. 0583: and the bank account.
  NEW.creator_pan_enc := d.pan_enc;
  NEW.creator_pan_last4 := d.pan_last4;
  NEW.creator_bank_holder := d.account_holder_name;
  NEW.creator_account_enc := d.account_number_enc;
  NEW.creator_account_last4 := d.account_last4;
  NEW.creator_ifsc := d.ifsc;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION guard_creator_invoice_needs_bank() FROM PUBLIC, anon, authenticated;

-- The stored bank account is part of the issued invoice: it never changes (0581's guard plus the bank).
CREATE OR REPLACE FUNCTION public.guard_experience_creator_invoice()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Kept, never deleted; only the service role may remove rows (test teardown), as with counters.
    IF current_user IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'A creator invoice is never deleted; void it' USING ERRCODE = '42501'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status IS DISTINCT FROM 'issued' THEN RAISE EXCEPTION 'A void creator invoice does not change' USING ERRCODE = '42501'; END IF;
  IF (NEW.id, NEW.deal_id, NEW.experience_id, NEW.creator_id, NEW.number, NEW.shoot_confirmed_at, NEW.billing_name, NEW.gstin,
      NEW.day_rate_paise, NEW.days, NEW.gross_paise, NEW.platform_pct, NEW.platform_fee_paise, NEW.net_paise, NEW.allowance_paise,
      NEW.payable_paise, NEW.issued_at, NEW.issued_by, NEW.extra_id, NEW.follow_on_id, NEW.creator_pan_enc, NEW.creator_pan_last4,
      NEW.creator_bank_holder, NEW.creator_account_enc, NEW.creator_account_last4, NEW.creator_ifsc)
     IS DISTINCT FROM
     (OLD.id, OLD.deal_id, OLD.experience_id, OLD.creator_id, OLD.number, OLD.shoot_confirmed_at, OLD.billing_name, OLD.gstin,
      OLD.day_rate_paise, OLD.days, OLD.gross_paise, OLD.platform_pct, OLD.platform_fee_paise, OLD.net_paise, OLD.allowance_paise,
      OLD.payable_paise, OLD.issued_at, OLD.issued_by, OLD.extra_id, OLD.follow_on_id, OLD.creator_pan_enc, OLD.creator_pan_last4,
      OLD.creator_bank_holder, OLD.creator_account_enc, OLD.creator_account_last4, OLD.creator_ifsc)
     OR NEW.status IS DISTINCT FROM 'void' THEN
    RAISE EXCEPTION 'An issued creator invoice can only be voided' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

-- ═════ B. Issued invoices from before: the account on file now ═════
-- The guard forbids any change to an issued invoice, so it is off for this one
-- statement only. Only rows with no bank stored, still issued, with an account on file.
ALTER TABLE experience_creator_invoices DISABLE TRIGGER t_eci_guard;
UPDATE experience_creator_invoices i
   SET creator_bank_holder = pd.account_holder_name, creator_account_enc = pd.account_number_enc,
       creator_account_last4 = pd.account_last4, creator_ifsc = pd.ifsc
  FROM vendors v JOIN vendor_payout_details pd ON pd.vendor_id = v.id
 WHERE v.creator_id = i.creator_id
   AND i.status = 'issued'
   AND i.creator_account_enc IS NULL
   AND pd.account_number_enc IS NOT NULL;
ALTER TABLE experience_creator_invoices ENABLE TRIGGER t_eci_guard;

-- ═════ C. The document: account in full to the creator and finance, last 4 otherwise ═════
CREATE OR REPLACE FUNCTION public.experience_creator_invoice_doc_json(p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'id', i.id, 'number', i.number, 'status', i.status, 'issued_at', i.issued_at, 'shoot_confirmed_at', i.shoot_confirmed_at,
    'billing_name', i.billing_name, 'gstin', i.gstin,
    'pan', CASE
      WHEN i.creator_pan_enc IS NULL THEN NULL
      WHEN (my_creator_id() IS NOT NULL AND my_creator_id() = i.creator_id) OR has_experience_access('financial') IS TRUE
        THEN extensions.pgp_sym_decrypt(i.creator_pan_enc, experience_payout_key())
      ELSE '••••••' || i.creator_pan_last4 END,
    'bank', CASE WHEN i.creator_account_enc IS NULL THEN NULL ELSE jsonb_build_object(
      'holder', i.creator_bank_holder, 'ifsc', i.creator_ifsc,
      'account', CASE
        WHEN (my_creator_id() IS NOT NULL AND my_creator_id() = i.creator_id) OR has_experience_access('financial') IS TRUE
          THEN extensions.pgp_sym_decrypt(i.creator_account_enc, experience_payout_key())
        ELSE '••••' || i.creator_account_last4 END) END,
    'extra', CASE WHEN x.id IS NULL THEN NULL ELSE jsonb_build_object('number', x.number, 'deliverables', x.deliverables, 'pricing', x.pricing,
              'unit_paise', x.unit_paise, 'items', x.items) END,
    'commission', CASE WHEN f.id IS NULL THEN NULL ELSE jsonb_build_object('sales_paise', f.sales_figure_paise, 'affiliate_pct', f.pct) END,
    'day_rate_paise', i.day_rate_paise, 'days', i.days, 'gross_paise', i.gross_paise, 'platform_pct', i.platform_pct,
    'platform_fee_paise', i.platform_fee_paise, 'net_paise', i.net_paise, 'allowance_paise', i.allowance_paise, 'payable_paise', i.payable_paise,
    'deal_ref', d.deal_ref, 'experience_title', e.title, 'brand_name', d.experience_brand_name, 'shoot_date', e.shoot_date, 'shoot_city', e.shoot_city,
    'bill_to', CASE WHEN g.id IS NULL THEN NULL ELSE jsonb_build_object('legal_name', g.legal_name, 'address', g.address, 'state', g.state,
                 'gstin', g.gstin, 'pan', g.pan) END)
  FROM experience_creator_invoices i
  JOIN deals d ON d.id = i.deal_id
  JOIN experiences e ON e.id = i.experience_id
  LEFT JOIN experience_leg_extras x ON x.id = i.extra_id
  LEFT JOIN deal_follow_ons f ON f.id = i.follow_on_id
  LEFT JOIN guapd_billing_settings g ON g.id = true
  WHERE i.id = p_invoice_id;
$function$;

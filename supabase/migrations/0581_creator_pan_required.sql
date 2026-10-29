-- 0581: PAN is required with the bank account, and printed on the creator's invoice.
--
-- Guapd pays creators and files TDS against their PAN; without one, TDS can be
-- deducted at a higher rate and the creator cannot claim it back. So:
--
--   A. creator_set_payout_details: PAN required. Leaving the box empty keeps
--      the PAN already on file (before this, an empty box ERASED it on every
--      re-save). A creator with no PAN at all cannot save until they add one.
--   B. A creator invoice needs bank account AND PAN on file (extends 0580).
--   C. The invoice keeps the PAN it was raised with (encrypted, like the
--      payout details), so a later change does not rewrite an old invoice.
--   D. The invoice document shows it in full to the creator and to finance;
--      operational staff see it masked, as with the payout details (0542).
--
-- Invoices raised before 0581 have no PAN stored and print none.

-- ═════ A. Saving payout details: PAN required ═════
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
  -- 0581: an empty box keeps the PAN on file; with none on file, it is required.
  v_pan := coalesce(v_pan, o.pan);
  IF v_pan IS NULL THEN RAISE EXCEPTION 'Enter your PAN. It is needed for TDS, so you can claim it back'; END IF;

  IF o.account IS DISTINCT FROM v_account THEN v_fields := array_append(v_fields, 'account_number'); END IF;
  IF o.ifsc IS DISTINCT FROM v_ifsc THEN v_fields := array_append(v_fields, 'ifsc'); END IF;
  IF o.account_holder_name IS DISTINCT FROM v_holder THEN v_fields := array_append(v_fields, 'account_holder_name'); END IF;
  IF o.pan IS DISTINCT FROM v_pan THEN v_fields := array_append(v_fields, 'pan'); END IF;
  IF o.gst_registered IS DISTINCT FROM p_gst_registered THEN v_fields := array_append(v_fields, 'gst_registered'); END IF;

  INSERT INTO vendor_payout_details (vendor_id, account_holder_name, account_number_enc, account_last4, ifsc, pan_enc, pan_last4,
                                     gst_registered, details_changed_at, updated_at, updated_by)
  VALUES (v_vendor, v_holder, extensions.pgp_sym_encrypt(v_account, v_key), right(v_account, 4), v_ifsc,
          extensions.pgp_sym_encrypt(v_pan, v_key), right(v_pan, 4),
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

-- ═════ B + C. A creator invoice needs bank AND PAN, and keeps the PAN ═════
ALTER TABLE experience_creator_invoices ADD COLUMN IF NOT EXISTS creator_pan_enc bytea;
ALTER TABLE experience_creator_invoices ADD COLUMN IF NOT EXISTS creator_pan_last4 text;
ALTER TABLE experience_creator_invoices DROP CONSTRAINT IF EXISTS eci_pan_shape;
ALTER TABLE experience_creator_invoices ADD CONSTRAINT eci_pan_shape CHECK (
  (creator_pan_enc IS NULL) = (creator_pan_last4 IS NULL) AND (creator_pan_last4 IS NULL OR creator_pan_last4 ~ '^[0-9A-Z]{4}$'));

CREATE OR REPLACE FUNCTION guard_creator_invoice_needs_bank() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d record;
BEGIN
  SELECT pd.account_last4, pd.pan_enc, pd.pan_last4 INTO d
    FROM vendors v JOIN vendor_payout_details pd ON pd.vendor_id = v.id
    WHERE v.creator_id = NEW.creator_id;
  IF d.account_last4 IS NULL OR d.pan_last4 IS NULL THEN
    RAISE EXCEPTION 'Add your bank details and PAN on the Payments page before you raise your invoice';
  END IF;
  -- 0581: the invoice keeps the PAN it was raised with.
  NEW.creator_pan_enc := d.pan_enc;
  NEW.creator_pan_last4 := d.pan_last4;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION guard_creator_invoice_needs_bank() FROM PUBLIC, anon, authenticated;

-- The stored PAN is part of the issued invoice: it never changes (0563's guard plus the PAN).
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
      NEW.payable_paise, NEW.issued_at, NEW.issued_by, NEW.extra_id, NEW.follow_on_id, NEW.creator_pan_enc, NEW.creator_pan_last4)
     IS DISTINCT FROM
     (OLD.id, OLD.deal_id, OLD.experience_id, OLD.creator_id, OLD.number, OLD.shoot_confirmed_at, OLD.billing_name, OLD.gstin,
      OLD.day_rate_paise, OLD.days, OLD.gross_paise, OLD.platform_pct, OLD.platform_fee_paise, OLD.net_paise, OLD.allowance_paise,
      OLD.payable_paise, OLD.issued_at, OLD.issued_by, OLD.extra_id, OLD.follow_on_id, OLD.creator_pan_enc, OLD.creator_pan_last4)
     OR NEW.status IS DISTINCT FROM 'void' THEN
    RAISE EXCEPTION 'An issued creator invoice can only be voided' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

-- ═════ D. The document: PAN in full to the creator and finance, masked otherwise ═════
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

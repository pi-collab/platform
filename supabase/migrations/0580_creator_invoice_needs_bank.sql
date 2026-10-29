-- 0580: a creator invoice to Guapd needs the creator's bank account on file.
--
-- An invoice exists to get the creator paid. Without a bank account Guapd
-- cannot pay it, so raising one only parks the creator in "invoiced, not
-- payable" while someone chases them. Every creator invoice (the deal fee,
-- an extra, an affiliate commission) is raised with the creator's own session
-- and lands in experience_creator_invoices, so one check on insert covers all
-- three paths, and any future one.
--
-- Bank account = vendor_payout_details.account_last4 (the encrypted account,
-- 0542). PAN stays optional until the CA settles TDS. Invoices already issued
-- are untouched. Money in/out figures are not read or changed here.

CREATE OR REPLACE FUNCTION guard_creator_invoice_needs_bank() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vendors v JOIN vendor_payout_details d ON d.vendor_id = v.id
    WHERE v.creator_id = NEW.creator_id AND d.account_last4 IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Add your bank details on the Payments page before you raise your invoice';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION guard_creator_invoice_needs_bank() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS t_eci_needs_bank ON experience_creator_invoices;
CREATE TRIGGER t_eci_needs_bank BEFORE INSERT ON experience_creator_invoices
  FOR EACH ROW EXECUTE FUNCTION guard_creator_invoice_needs_bank();

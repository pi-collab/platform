-- Invoices are written only by the server, never directly by a user session.
--
-- ── The hole ────────────────────────────────────────────────────────────────
-- invoices_insert_creator checked only that the deal was the creator's, and
-- invoices_update_creator / invoices_update_brand checked only deal ownership,
-- with no WITH CHECK and no column or status restriction. Over the API with
-- the anon key:
--   * a creator could INSERT an invoice with any amounts and any status, on a
--     deal that was not approved or posted (bypassing generateInvoice);
--   * a creator could raise creator_receives_paise or change fee_paise;
--   * a brand could set status = 'paid', paid_at, or a lower brand_pays_paise.
--
-- ── The fix ─────────────────────────────────────────────────────────────────
-- No INSERT or UPDATE for signed-in users at all. The three real writes —
-- generateInvoice, issueInvoice (creator) and acceptInvoice (brand) — now run
-- with the service role after checking the caller is the deal's own creator /
-- brand and the invoice is in the right status. Paying stays behind the
-- SECURITY DEFINER function mark_deal_paid (0130). Reading is unchanged.
-- Mirrored in rls.sql.

DROP POLICY IF EXISTS invoices_insert_creator ON invoices;
DROP POLICY IF EXISTS invoices_update_creator ON invoices;
DROP POLICY IF EXISTS invoices_update_brand   ON invoices;

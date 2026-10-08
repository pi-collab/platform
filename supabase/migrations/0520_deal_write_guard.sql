-- Lock down what a signed-in user can write to `deals`.
--
-- ── The hole ────────────────────────────────────────────────────────────────
-- deals_update let either party UPDATE any column of their own deal, and
-- deals_insert_brand let a brand INSERT any values. "Field-level restrictions
-- enforced in app code" — but app code is not the boundary: anyone with a
-- session can call PostgREST directly with the anon key. Concretely, a brand
-- could:
--   * clear held_at on its own held deal, skipping the approval gate;
--   * set status = 'paid' / 'complete', price_paise, or fee_percent = 0;
--   * insert a deal with fee_percent 0 and no hold at all.
-- A creator could likewise rewrite price, status or fee on any deal they see.
--
-- ── The fix ─────────────────────────────────────────────────────────────────
-- 1. INSERT: removed for signed-in users. createDeal (apps/web/app/deals/
--    actions.ts) now inserts with the service role, AFTER its own checks — the
--    fee ladder and the send gate are computed server-side and are the only
--    values that can land.
-- 2. UPDATE: deals_update stays (a party can still only touch their own deal),
--    and a BEFORE UPDATE trigger restricts WHAT they can change:
--      - per party, an allowlist of columns; any other column changing raises;
--      - status: only the transitions the app actually makes;
--      - price_paise: only as part of accepting a counter (negotiating→agreed);
--      - posted fields: creator only, once the deal is approved or later.
--    paid / complete / revision stay reachable only through the SECURITY
--    DEFINER functions mark_deal_paid and request_deal_revision (0130).
--
-- The trigger acts only on the `authenticated` and `anon` roles. The service
-- role (ops, admin-client server actions) and SECURITY DEFINER functions run
-- as other roles and are untouched: those paths carry their own checks.
--
-- Named t_deals_00_guard so it fires BEFORE t_deals_audit_upd (triggers fire
-- in name order): a refused change writes no audit event.

CREATE OR REPLACE FUNCTION guard_deal_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  is_brand      boolean;
  is_creator    boolean;
  accepting     boolean;
  ok_status     boolean;
  posted_change boolean;
  allowed       text[];
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  is_brand   := coalesce(OLD.brand_id = my_brand_id(), false);
  is_creator := coalesce(OLD.creator_id = my_creator_id(), false);
  accepting  := (OLD.status = 'negotiating' AND NEW.status = 'agreed');

  IF is_brand THEN
    allowed := ARRAY['updated_at', 'agreed_at', 'completed_at',
                     'title', 'internal_note', 'campaign_id',
                     'shipment_status', 'tracking_link', 'carrier_note', 'shipped_at',
                     'status', 'price_paise', 'rights_confirmed_at'];
  ELSIF is_creator THEN
    allowed := ARRAY['updated_at', 'agreed_at', 'completed_at',
                     'shipping_address', 'is_posted', 'posted_url', 'posted_at',
                     'status', 'price_paise', 'rights_confirmed_at'];
  ELSE
    RAISE EXCEPTION 'Not a party to this deal' USING ERRCODE = '42501';
  END IF;

  IF (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
    RAISE EXCEPTION 'This change is not allowed on a deal' USING ERRCODE = '42501';
  END IF;

  -- Status: only the moves the app makes
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF is_brand THEN
      ok_status := accepting
                OR (OLD.status = 'negotiating' AND NEW.status = 'cancelled')
                OR (OLD.status IN ('delivered', 'revision') AND NEW.status = 'approved');
    ELSE
      ok_status := accepting
                OR (OLD.status = 'negotiating' AND NEW.status = 'declined')
                OR (OLD.status IN ('agreed', 'revision') AND NEW.status = 'delivered');
    END IF;
    IF NOT ok_status THEN
      RAISE EXCEPTION 'A deal cannot move from % to % this way', OLD.status, NEW.status USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Price and rights: only by accepting
  IF NEW.price_paise IS DISTINCT FROM OLD.price_paise AND NOT accepting THEN
    RAISE EXCEPTION 'The price changes only by accepting a counter offer' USING ERRCODE = '42501';
  END IF;
  IF NEW.rights_confirmed_at IS DISTINCT FROM OLD.rights_confirmed_at AND NOT accepting THEN
    RAISE EXCEPTION 'Rights are confirmed only when the deal is agreed' USING ERRCODE = '42501';
  END IF;

  -- Posted: once the work is approved, never before
  posted_change := NEW.is_posted IS DISTINCT FROM OLD.is_posted
                OR NEW.posted_url IS DISTINCT FROM OLD.posted_url
                OR NEW.posted_at IS DISTINCT FROM OLD.posted_at;
  IF posted_change AND OLD.status NOT IN ('approved', 'paid', 'complete') THEN
    RAISE EXCEPTION 'Mark as posted only after the content is approved' USING ERRCODE = '42501';
  END IF;

  -- Campaign: only one of the brand's own
  IF NEW.campaign_id IS DISTINCT FROM OLD.campaign_id AND NEW.campaign_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM campaigns c WHERE c.id = NEW.campaign_id AND c.brand_id = OLD.brand_id) THEN
      RAISE EXCEPTION 'That campaign does not belong to this brand' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION guard_deal_write() IS
  'BEFORE UPDATE guard on deals for signed-in users: per-party column allowlist, '
  'allowed status transitions, price only on counter acceptance. Service role and '
  'SECURITY DEFINER functions bypass it. See migration 0520.';

DROP TRIGGER IF EXISTS t_deals_00_guard ON deals;
CREATE TRIGGER t_deals_00_guard
  BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION guard_deal_write();

-- INSERT moves to the service role (createDeal). Mirrored in rls.sql.
DROP POLICY IF EXISTS deals_insert_brand ON deals;

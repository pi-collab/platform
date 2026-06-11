-- ================================================================
-- ROW LEVEL SECURITY — full policy set
-- Apply in one shot via the Supabase SQL editor (paste the whole file).
--
-- Prerequisites: schema.sql already deployed.
-- Safe to re-run: uses CREATE OR REPLACE for functions,
-- and DROP POLICY IF EXISTS before each CREATE POLICY.
-- ================================================================


-- ── HELPER FUNCTIONS ─────────────────────────────────────────────
-- SECURITY DEFINER: these run as postgres (bypasses RLS) so they can
-- safely query users/brand_members without recursion. search_path is
-- locked to 'public' to prevent schema-injection attacks.

CREATE OR REPLACE FUNCTION my_user_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT id FROM users WHERE auth_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION my_brand_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT brand_id FROM brand_members WHERE user_id = my_user_id()
$$;

CREATE OR REPLACE FUNCTION my_creator_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT id FROM creators WHERE user_id = my_user_id()
$$;

-- Returns true if the current user is a party to the given deal.
-- Used by messages, deliverables, payments, events policies.
CREATE OR REPLACE FUNCTION can_access_deal(p_deal_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM deals
    WHERE id = p_deal_id
      AND (brand_id = my_brand_id() OR creator_id = my_creator_id())
  )
$$;


-- ── FIX audit_deal() TRIGGER ─────────────────────────────────────
-- Must be SECURITY DEFINER so the trigger can insert into events
-- regardless of the RLS context of whoever caused the deal change.
-- Body is identical to schema.sql — only SECURITY DEFINER is added.

CREATE OR REPLACE FUNCTION audit_deal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF (tg_op = 'INSERT') THEN
    INSERT INTO events (deal_id, actor_id, event_type, detail)
    VALUES (NEW.id, NEW.created_by, 'deal.created',
            jsonb_build_object('status', NEW.status));
    -- stamp agreed/completed timestamps if created already in those states
    RETURN NEW;

  ELSIF (tg_op = 'UPDATE') THEN
    IF (NEW.status IS DISTINCT FROM OLD.status) THEN
      INSERT INTO events (deal_id, actor_id, event_type, detail)
      VALUES (NEW.id, NEW.created_by, 'deal.status_changed',
              jsonb_build_object('from', OLD.status, 'to', NEW.status));

      IF (NEW.status = 'agreed' AND NEW.agreed_at IS NULL) THEN
        NEW.agreed_at = now();
      END IF;
      IF (NEW.status = 'complete' AND NEW.completed_at IS NULL) THEN
        NEW.completed_at = now();
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END $$;


-- ── ENABLE RLS ON ALL TABLES ─────────────────────────────────────

ALTER TABLE users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands          ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE creators        ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals           ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliverables    ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE events          ENABLE ROW LEVEL SECURITY;


-- ── users ─────────────────────────────────────────────────────────
-- Each user can only read/write their own row, matched by auth_id.
-- The auth callback INSERT and dashboard SELECT both rely on these.

DROP POLICY IF EXISTS users_read_own   ON users;
DROP POLICY IF EXISTS users_insert_own ON users;
DROP POLICY IF EXISTS users_update_own ON users;

CREATE POLICY users_read_own
  ON users FOR SELECT
  USING (auth_id = auth.uid());

CREATE POLICY users_insert_own
  ON users FOR INSERT
  WITH CHECK (auth_id = auth.uid());

CREATE POLICY users_update_own
  ON users FOR UPDATE
  USING (auth_id = auth.uid());


-- ── brands ────────────────────────────────────────────────────────
-- A brand member can see only their own brand.
-- Brands are created/modified via service role only.

DROP POLICY IF EXISTS brands_read_own ON brands;

CREATE POLICY brands_read_own
  ON brands FOR SELECT
  USING (id = my_brand_id());


-- ── brand_members ─────────────────────────────────────────────────
-- A member can see all membership rows for their brand (e.g. "who's
-- on my team"). Rows for other brands are invisible.
-- Membership is managed via service role only.

DROP POLICY IF EXISTS brand_members_read_own_brand ON brand_members;

CREATE POLICY brand_members_read_own_brand
  ON brand_members FOR SELECT
  USING (brand_id = my_brand_id());


-- ── creators ──────────────────────────────────────────────────────
-- SELECT: three cases allowed:
--   1. Any authenticated user can see vetted creators (is_vetted=true)
--      — the "pick a creator" list for brands.
--   2. A creator can always see their own profile, even if not yet vetted.
--   3. A brand member can see any creator already in one of their deals,
--      even if unvetted — covers in-progress relationships.
-- UPDATE: creators can update their own profile only.
-- INSERT/DELETE: service role only (manual onboarding in v1).

DROP POLICY IF EXISTS creators_read       ON creators;
DROP POLICY IF EXISTS creators_update_own ON creators;

CREATE POLICY creators_read
  ON creators FOR SELECT
  USING (
    is_vetted = true
    OR user_id = my_user_id()
    OR EXISTS (
      SELECT 1 FROM deals
      WHERE deals.creator_id = creators.id
        AND deals.brand_id   = my_brand_id()
    )
  );

CREATE POLICY creators_update_own
  ON creators FOR UPDATE
  USING (user_id = my_user_id());


-- ── deals ─────────────────────────────────────────────────────────
-- SELECT: brand member sees deals for their brand; creator sees their deals.
-- INSERT: brand members only, for their own brand (brand_id must match).
-- UPDATE: both parties can update (status changes, offer counters).
--         Field-level restrictions enforced in app code for v1.

DROP POLICY IF EXISTS deals_read         ON deals;
DROP POLICY IF EXISTS deals_insert_brand ON deals;
DROP POLICY IF EXISTS deals_update       ON deals;

CREATE POLICY deals_read
  ON deals FOR SELECT
  USING (brand_id = my_brand_id() OR creator_id = my_creator_id());

CREATE POLICY deals_insert_brand
  ON deals FOR INSERT
  WITH CHECK (brand_id = my_brand_id());

CREATE POLICY deals_update
  ON deals FOR UPDATE
  USING (brand_id = my_brand_id() OR creator_id = my_creator_id());


-- ── messages ──────────────────────────────────────────────────────
-- Readable and writable only if you are a party to the deal.
-- No UPDATE or DELETE — messages are append-only.

DROP POLICY IF EXISTS messages_read   ON messages;
DROP POLICY IF EXISTS messages_insert ON messages;

CREATE POLICY messages_read
  ON messages FOR SELECT
  USING (can_access_deal(deal_id));

CREATE POLICY messages_insert
  ON messages FOR INSERT
  WITH CHECK (can_access_deal(deal_id));


-- ── deliverables ──────────────────────────────────────────────────
-- Readable and uploadable only if you are a party to the deal.
-- Files are versioned (new row per version), not edited in place.

DROP POLICY IF EXISTS deliverables_read   ON deliverables;
DROP POLICY IF EXISTS deliverables_insert ON deliverables;

CREATE POLICY deliverables_read
  ON deliverables FOR SELECT
  USING (can_access_deal(deal_id));

CREATE POLICY deliverables_insert
  ON deliverables FOR INSERT
  WITH CHECK (can_access_deal(deal_id));


-- ── payments ──────────────────────────────────────────────────────
-- Both parties can read payment status (creator needs to see when paid).
-- Only the brand can create or update a payment record.
-- Razorpay webhook status updates run via service role (bypasses RLS).

DROP POLICY IF EXISTS payments_read         ON payments;
DROP POLICY IF EXISTS payments_insert_brand ON payments;
DROP POLICY IF EXISTS payments_update_brand ON payments;

CREATE POLICY payments_read
  ON payments FOR SELECT
  USING (can_access_deal(deal_id));

CREATE POLICY payments_insert_brand
  ON payments FOR INSERT
  WITH CHECK (
    deal_id IN (SELECT id FROM deals WHERE brand_id = my_brand_id())
  );

CREATE POLICY payments_update_brand
  ON payments FOR UPDATE
  USING (
    deal_id IN (SELECT id FROM deals WHERE brand_id = my_brand_id())
  );


-- ── events ────────────────────────────────────────────────────────
-- SELECT only — both parties can see the full audit log for their deal.
-- No INSERT policy: the audit_deal() trigger is SECURITY DEFINER and
-- inserts directly. Any direct INSERT attempt via anon key is rejected.

DROP POLICY IF EXISTS events_read ON events;

CREATE POLICY events_read
  ON events FOR SELECT
  USING (can_access_deal(deal_id));


-- ================================================================
-- END OF RLS POLICIES
-- ================================================================

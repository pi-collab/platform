-- Bootstrap RLS helper functions early so migrations 004, 005, 009, 010, 011,
-- 015, 016 can create inline policies that reference them.
-- rls.sql will CREATE OR REPLACE these same functions later (idempotent).
--
-- These must run AFTER schema.sql (which creates the users, brand_members,
-- creators, and deals tables these functions query).

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

CREATE OR REPLACE FUNCTION can_access_deal(p_deal_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM deals
    WHERE id = p_deal_id
      AND (brand_id = my_brand_id() OR creator_id = my_creator_id())
  )
$$;

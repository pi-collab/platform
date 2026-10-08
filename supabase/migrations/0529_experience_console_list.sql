-- The Guapd Experiences staff console reads its list through the database, so
-- the database (not only the page gate) decides who may see it. RUN BY HAND.
-- Verify with docs/test-cases.md §99.
--
-- experience_console_list() runs as definer but checks the CALLER's
-- operational access (staff_access, 0526), like experience_payouts(). A brand,
-- a creator, outreach or the contractor calling it with their own session is
-- refused; so is the service role (no caller, no flag).
--
-- Columns are named, not *: status, schedule and the request summary only. No
-- price, margin, cost, creator term or internal note, so the list can never be
-- the path any of those leak through. The (future) brand-facing view does NOT
-- use this function; it reads its own rows through the existing brand RLS and
-- column grants (0523, 0528).

CREATE OR REPLACE FUNCTION experience_console_list()
RETURNS TABLE (id uuid, title text, status text, brand_name text, shoot_date date, shoot_city text,
               request_location text, request_date_from date, request_date_to date,
               requested_videos int, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NOT has_experience_access('operational') THEN
    RAISE EXCEPTION 'Operational access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT e.id, e.title, e.status, b.name, e.shoot_date, e.shoot_city,
           e.request_location, e.request_date_from, e.request_date_to,
           coalesce((SELECT sum(CASE WHEN (d ->> 'count') ~ '^[0-9]+$' THEN (d ->> 'count')::int ELSE 0 END)
                     FROM jsonb_array_elements(e.request_deliverables) d), 0)::int,
           e.created_at
    FROM experiences e JOIN brands b ON b.id = e.brand_id
    ORDER BY e.created_at DESC
    LIMIT 500;
END;
$$;

REVOKE EXECUTE ON FUNCTION experience_console_list() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION experience_console_list() TO authenticated;

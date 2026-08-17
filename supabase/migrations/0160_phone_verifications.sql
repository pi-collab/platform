-- Phone OTP verification table for creator self-signup.
-- Only accessed via service-role (server actions). No RLS policies = no anon/authenticated access.

CREATE TABLE phone_verifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       text NOT NULL,
  code        text NOT NULL,
  expires_at  timestamptz NOT NULL,
  used        boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON phone_verifications (phone, used, expires_at);

ALTER TABLE phone_verifications ENABLE ROW LEVEL SECURITY;
-- No policies: only service-role can read/write.

-- Helper: look up an auth user by phone.
-- SECURITY DEFINER so it can read auth.users. Only called from server actions.
CREATE OR REPLACE FUNCTION get_auth_id_by_phone(p_phone text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT id FROM auth.users WHERE phone = p_phone LIMIT 1;
$$;

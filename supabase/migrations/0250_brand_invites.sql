-- Migration 020: Brand invites for team management
-- Tokens are crypto-random (32 bytes hex = 64 chars), single-use, 7-day expiry.

CREATE TABLE brand_invites (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id      uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  email         text NOT NULL,
  token         text NOT NULL UNIQUE,
  invited_by    uuid NOT NULL REFERENCES users(id),
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at    timestamptz NOT NULL,
  accepted_by   uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Only one ACTIVE (pending) invite per email per brand.
-- Allows re-invite after expiry/revocation/acceptance.
CREATE UNIQUE INDEX brand_invites_one_pending
  ON brand_invites (brand_id, email) WHERE status = 'pending';

CREATE INDEX idx_brand_invites_brand ON brand_invites (brand_id);
CREATE INDEX idx_brand_invites_token ON brand_invites (token);

ALTER TABLE brand_invites ENABLE ROW LEVEL SECURITY;

-- All brand members can read their brand's invites (admin-only filtering is UI-layer).
-- All writes are service-role only (server actions enforce isAdmin).
CREATE POLICY brand_invites_read ON brand_invites
  FOR SELECT TO authenticated
  USING (brand_id = my_brand_id());

NOTIFY pgrst, 'reload schema';

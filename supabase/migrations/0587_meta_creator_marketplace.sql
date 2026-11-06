-- 0587: Instagram Creator Marketplace for brands, and invites to creators not
-- on Guapd. Behind META_CREATOR_MARKETPLACE=1 (and CREATOR_SEARCH=1).
--
-- Creator Marketplace is a BRAND-side API: the brand signs in with Facebook
-- Login (their Instagram business account linked to a Facebook Page) and the
-- search runs with the Page token on graph.facebook.com. It is separate from
-- the creator Instagram Login connection (0493), which is unchanged.
--
--   A. brand_meta_connections: one per brand. The Facebook user, the Page and
--      its Instagram business account, and the tokens, encrypted with the same
--      AES-256-GCM module as 0493 (lib/instagram-token.ts). Server only.
--   B. brand_creator_invites: a tracked invite link per creator per search
--      (guapd.com/c/i-<token>), for a creator found on Instagram who is not on
--      Guapd. Holds the Instagram username only: no email, bio, insights or
--      other Meta creator data is stored (Meta's retention terms are not yet
--      checked; results are cached in memory for minutes only). Server only.

-- ═════ A. Brand Facebook connection ═════
CREATE TABLE IF NOT EXISTS brand_meta_connections (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id           uuid NOT NULL UNIQUE REFERENCES brands (id) ON DELETE CASCADE,
  connected_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  fb_user_id         text NOT NULL,
  page_id            text NOT NULL,
  page_name          text,
  ig_user_id         text NOT NULL,
  ig_username        text,
  status             text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'needs_reconnect')),
  user_token_ciphertext text NOT NULL,
  user_token_iv      text NOT NULL,
  user_token_tag     text NOT NULL,
  page_token_ciphertext text NOT NULL,
  page_token_iv      text NOT NULL,
  page_token_tag     text NOT NULL,
  key_version        int NOT NULL DEFAULT 1,
  user_token_expires_at timestamptz,
  scopes             text[] NOT NULL DEFAULT '{}',
  last_error         text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bmc_fb_user_idx ON brand_meta_connections (fb_user_id);
COMMENT ON TABLE brand_meta_connections IS
  '0587: a brand''s Facebook Login connection for Instagram Creator Marketplace. Tokens encrypted (AES-256-GCM). Server only: RLS on, no policies, no client grants.';

ALTER TABLE brand_meta_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON brand_meta_connections FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON brand_meta_connections TO service_role;

-- ═════ B. Invites ═════
CREATE TABLE IF NOT EXISTS brand_creator_invites (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id           uuid NOT NULL REFERENCES brands (id) ON DELETE CASCADE,
  search_id          uuid NOT NULL REFERENCES brand_creator_searches (id) ON DELETE CASCADE,
  created_by         uuid REFERENCES users (id) ON DELETE SET NULL,
  -- "i-" + 26 base36 characters: the /c/ path, never a storefront slug.
  token              text NOT NULL UNIQUE CHECK (token ~ '^i-[a-z0-9]{26}$'),
  ig_username        text NOT NULL CHECK (ig_username ~ '^[a-z0-9._]{1,30}$'),
  -- What the creator is shown: Guapd's own reading of the brief, not Meta data.
  summary            text NOT NULL CHECK (length(summary) BETWEEN 1 AND 300),
  deliverables       text[] NOT NULL DEFAULT '{}',
  timeline           text CHECK (timeline IS NULL OR length(timeline) <= 80),
  -- Tracking. sent = the brand used a route (copy, Instagram, WhatsApp).
  sent_at            timestamptz,
  sent_via           text CHECK (sent_via IS NULL OR sent_via IN ('copy', 'instagram', 'whatsapp')),
  opened_at          timestamptz,
  signed_up_at       timestamptz,
  accepted_at        timestamptz,
  creator_id         uuid REFERENCES creators (id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, search_id, ig_username)
);
CREATE INDEX IF NOT EXISTS bci_brand_idx ON brand_creator_invites (brand_id, created_at DESC);
COMMENT ON TABLE brand_creator_invites IS
  '0587: tracked invite links to creators found on Instagram who are not on Guapd. Username only, no email or other Meta creator data. Server only: RLS on, no policies, no client grants.';

ALTER TABLE brand_creator_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON brand_creator_invites FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON brand_creator_invites TO service_role;

-- ═════ C. Meta call counts on a saved search (rate limits) ═════
ALTER TABLE brand_creator_searches ADD COLUMN IF NOT EXISTS meta_runs integer NOT NULL DEFAULT 0;
ALTER TABLE brand_creator_searches ADD COLUMN IF NOT EXISTS last_meta_at timestamptz;

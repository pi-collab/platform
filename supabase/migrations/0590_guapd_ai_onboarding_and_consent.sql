-- 0590: Guapd AI brand onboarding, "Coming soon" feedback, Meta connection
-- states, and an optional WhatsApp product-updates consent for creators.
-- Every table here is server only: RLS on, no policies, no client grants.
--
--   A. brand_user_ai_onboarding: per brand USER (not per device): when the
--      sparkle-icon highlight was done (icon clicked or dismissed) and when
--      the /ai intro was seen.
--   B. ai_feature_interest: a brand tapped a "Coming soon" row on the intro,
--      optionally with a one-line note. Nothing can be started from it.
--   C. brand_meta_eligibility: why a brand cannot use Creator Marketplace
--      (no Facebook Page, no linked Instagram business account, missing
--      permission, or Meta error 10: not eligible), so the app explains it
--      once and stops re-prompting.
--   D. creators.whatsapp_updates_consent_at + creator_consent_log: an
--      optional, unticked "Product updates on WhatsApp". NULL = no consent.
--      Every grant and withdrawal is logged with its time and where it came
--      from. Nothing sends on it yet.

-- ═════ A ═════
CREATE TABLE IF NOT EXISTS brand_user_ai_onboarding (
  user_id            uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  highlight_done_at  timestamptz,
  intro_seen_at      timestamptz,
  updated_at         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE brand_user_ai_onboarding ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON brand_user_ai_onboarding FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON brand_user_ai_onboarding TO service_role;

-- ═════ B ═════
CREATE TABLE IF NOT EXISTS ai_feature_interest (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    uuid NOT NULL REFERENCES brands (id) ON DELETE CASCADE,
  user_id     uuid REFERENCES users (id) ON DELETE SET NULL,
  feature     text NOT NULL CHECK (feature IN ('write_brief', 'campaigns')),
  note        text CHECK (note IS NULL OR length(note) BETWEEN 1 AND 200),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS afi_feature_idx ON ai_feature_interest (feature, created_at DESC);
ALTER TABLE ai_feature_interest ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ai_feature_interest FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_feature_interest TO service_role;

-- ═════ C ═════
CREATE TABLE IF NOT EXISTS brand_meta_eligibility (
  brand_id    uuid PRIMARY KEY REFERENCES brands (id) ON DELETE CASCADE,
  state       text NOT NULL CHECK (state IN ('no_page', 'no_instagram', 'missing_permission', 'not_eligible')),
  checked_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE brand_meta_eligibility ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON brand_meta_eligibility FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON brand_meta_eligibility TO service_role;

-- ═════ D ═════
ALTER TABLE creators ADD COLUMN IF NOT EXISTS whatsapp_updates_consent_at timestamptz;
COMMENT ON COLUMN creators.whatsapp_updates_consent_at IS
  '0590: when the creator ticked "Product updates on WhatsApp" (optional, unticked by default). NULL = no consent. Written by the server only; history in creator_consent_log. Not used to send anything yet.';
CREATE TABLE IF NOT EXISTS creator_consent_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id  uuid NOT NULL REFERENCES creators (id) ON DELETE CASCADE,
  consent     text NOT NULL CHECK (consent IN ('whatsapp_product_updates')),
  granted     boolean NOT NULL,
  source      text NOT NULL CHECK (source IN ('signup', 'settings')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ccl_creator_idx ON creator_consent_log (creator_id, created_at DESC);
ALTER TABLE creator_consent_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON creator_consent_log FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON creator_consent_log TO service_role;

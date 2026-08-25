-- ─────────────────────────────────────────────────────────────────────────────
-- storefronts storage bucket
--
-- NOT YET APPLIED ANYWHERE. Named PENDING_ so the CLI skips it (its version
-- regex needs leading digits), exactly like DEFERRED_deals_campaign_fk.sql.
-- Rename to 0460_storefronts_bucket.sql to bring it into the chain.
--
-- ── Why this exists ──────────────────────────────────────────────────────────
-- Building guapd-prod-mumbai from schema.sql + all 45 migrations + rls.sql
-- produced a database with only ONE storage bucket. Nothing in the chain
-- creates `storefronts` — 0140 creates `deliverables` and that is the only
-- INSERT INTO storage.buckets anywhere in the repo.
--
-- The bucket is required: apps/web/app/creator/avatar/actions.ts uploads every
-- creator avatar and storefront portrait to it and serves them with
-- getPublicUrl. Without it, avatar upload fails at runtime.
--
-- It exists on staging and on the old Sydney prod because someone created it by
-- hand in the dashboard. That is drift between "what the migrations build" and
-- "what the environments actually have", and it stayed invisible until a build
-- from scratch was verified bucket-by-bucket rather than assumed.
--
-- The Mumbai project has the bucket already — created directly during the
-- build, with the values below, so it matches the other two environments. This
-- file makes it REPRODUCIBLE rather than reconstructed from memory next time.
--
-- ── Applying it ──────────────────────────────────────────────────────────────
-- Idempotent by ON CONFLICT, so it is safe to run against all three
-- environments, including the two that already have the bucket.
--
-- ── The values, and where they come from ─────────────────────────────────────
--   public = true          the app calls getPublicUrl on the result
--   5 MB limit             MAX_FILE_SIZE in avatar/actions.ts
--   image mime allowlist   ALLOWED_MIME_TYPES in the same file
-- Keep this in step with that file; it is the only other place the contract is
-- written down.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'storefronts',
  'storefronts',
  true,
  52428800,  -- 50 MB
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/quicktime', 'video/webm'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Widened from image-only/5 MB by 0481, when the content showcase gained clip
-- covers. Kept in step here so a bucket built FROM SCRATCH by this file lands
-- on the same values rather than re-creating the limitation 0481 removes —
-- ON CONFLICT DO NOTHING means this file never corrects an existing bucket.

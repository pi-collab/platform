-- Migration 0481: the storefronts bucket accepts video
--
-- The content showcase gained a cover upload — a still or a short clip. The
-- clip half could never have worked: the bucket was created image-only, at 5 MB.
--
--   allowed_mime_types = {image/jpeg,image/png,image/webp,image/gif}
--   file_size_limit    = 5242880
--
-- So every video upload was refused at the storage layer no matter what the
-- application allowed, which is why images and links worked and video did not.
--
-- 50 MB is the ceiling worth setting, not an arbitrary one: Supabase's free
-- plan refuses anything larger at the platform level, above and beyond the
-- bucket's own limit. Raising this past 50 MB would move the failure rather
-- than fix it. Revisit when the Pro upgrade lands (see docs/roadmap.md), which
-- takes the platform limit to 500 MB.
--
-- Idempotent: a plain UPDATE on a row that already exists everywhere.

UPDATE storage.buckets
SET
  file_size_limit = 52428800,  -- 50 MB
  allowed_mime_types = ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/quicktime', 'video/webm'
  ]
WHERE id = 'storefronts';

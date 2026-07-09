-- ================================================================
-- DELIVERABLE UPLOADS: private storage bucket + schema additions
-- ================================================================

-- ── 1. Add upload columns to deal_deliverable_items ─────────────
-- An item has EITHER external_url (link) OR storage_path + file_name (upload).
ALTER TABLE deal_deliverable_items ADD COLUMN IF NOT EXISTS storage_path text;
ALTER TABLE deal_deliverable_items ADD COLUMN IF NOT EXISTS file_name text;

-- ── 2. Create private storage bucket ────────────────────────────
-- Private = no public read. 500MB file limit. MIME-type allowlist enforced server-side.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'deliverables',
  'deliverables',
  false,
  524288000,  -- 500MB in bytes
  ARRAY[
    'video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo',
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf',
    'audio/mpeg', 'audio/wav', 'audio/mp4',
    'application/zip', 'application/x-zip-compressed'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- ── 3. Storage policies ─────────────────────────────────────────
--
-- WRITE (INSERT): authenticated users can upload to the deliverables bucket.
-- Path convention: {deal_id}/{item_id}/v{version}/{filename}
--
-- Scoping attempt: extract the first path segment (deal_id) and verify the
-- uploader is the creator on that deal. This prevents authenticated users
-- from uploading junk into arbitrary deal paths.
--
-- NOTE: If this join proves problematic in Supabase Storage policy evaluation,
-- fall back to broad authenticated INSERT + rely on attachment RLS + signed-URL
-- reads for content protection. Tighten in pre-launch security pass.

CREATE POLICY storage_deliverables_insert
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'deliverables'
    AND EXISTS (
      SELECT 1 FROM deals
      WHERE deals.id = (string_to_array(name, '/'))[1]::uuid
        AND deals.creator_id = my_creator_id()
    )
  );

-- READ (SELECT): NO broad SELECT policy. The bucket is private.
-- All reads go through server-minted signed URLs (via getSignedUrl server action)
-- which validates deal access before generating a short-lived URL.
-- No user can fetch a file directly — even with the storage path.

-- UPDATE: not needed (files are immutable; new versions = new paths).
-- DELETE: not needed in v1 (orphan cleanup uses service-role admin client).

-- ── Security notes (for pre-launch review) ──────────────────────
-- Storage upload policy scopes writes to deals where the uploader is the
-- creator. Content is protected by: (a) private bucket with no SELECT policy
-- (no direct reads), (b) signed-URL reads minted only after deal-access
-- validation via RLS on deal_deliverable_items.
-- Pre-launch: verify the path-based creator check works reliably in
-- Supabase's storage policy evaluator. If not, fall back to broad
-- authenticated INSERT + the existing attachment-RLS + signed-URL gates.

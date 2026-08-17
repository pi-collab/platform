-- Patch: make deliverables.storage_path nullable (link-based deliverables don't have one)
-- and add external_url for pasted delivery links (Drive/WeTransfer/etc.)
-- v1 = external_url populated, storage_path null.
-- Later (hosted uploads) = storage_path populated, external_url null.
--
-- This patches schema.sql's original NOT NULL on storage_path.
-- Must run AFTER schema.sql creates the deliverables table.

ALTER TABLE deliverables ALTER COLUMN storage_path DROP NOT NULL;
ALTER TABLE deliverables ADD COLUMN IF NOT EXISTS external_url text;

-- Columns that exist in prod but were added manually (never captured in a migration).
-- Without these, a fresh build from migrations diverges from prod.

-- brands.contact_email: added in prod for company contact info
ALTER TABLE brands ADD COLUMN IF NOT EXISTS contact_email text;

-- creators.is_rejected: added in prod for rejection tracking in vetting flow
ALTER TABLE creators ADD COLUMN IF NOT EXISTS is_rejected boolean NOT NULL DEFAULT false;

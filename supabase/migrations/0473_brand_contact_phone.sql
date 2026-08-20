-- ─────────────────────────────────────────────────────────────────────────────
-- brands.contact_phone
--
-- A brand had no phone number anywhere. The signup form asked for five things —
-- company name, industry, website, Instagram, terms — and the only way to reach
-- one afterwards was the email address they happened to sign in with, which for
-- a Google signup is whatever personal-ish work address they used.
--
-- That matters because brands are vetted by hand: approving one means judging
-- whether it is real, and "call them" was not available.
--
-- Lives on brands rather than users, next to contact_email and contact_name, so
-- the whole contact story sits in one place. The alternative — users.phone on
-- whoever signed up — ties the number to a person who may leave the team while
-- the brand stays.
--
-- Nullable, because every brand that already exists predates the field and
-- there is nothing truthful to put there. New signups are required to give one
-- by the form and by submitOnboarding; this column is not the enforcement point
-- and should not pretend to be.
--
-- Stored E.164 (+919876543210), the same convention creators.phone uses, via
-- normalizeE164 in lib/phone.ts.

ALTER TABLE public.brands
  ADD COLUMN IF NOT EXISTS contact_phone text;

COMMENT ON COLUMN public.brands.contact_phone IS
  'E.164 contact number collected at signup. Nullable: brands created before '
  '2026-08-20 have none. New signups are required to provide one.';

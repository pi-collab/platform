-- Migration 001: Add onboarding profile columns to brands table.
-- Safe to re-run: ADD COLUMN IF NOT EXISTS is idempotent.
-- Does NOT alter any other table or any existing column.

ALTER TABLE public.brands
  ADD COLUMN IF NOT EXISTS company_size    text,
  ADD COLUMN IF NOT EXISTS website         text,
  ADD COLUMN IF NOT EXISTS contact_name    text,
  ADD COLUMN IF NOT EXISTS social_accounts jsonb default '{}'::jsonb;

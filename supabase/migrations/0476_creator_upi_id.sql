-- ─────────────────────────────────────────────────────────────────────────────
-- creators.upi_id
--
-- Where a creator gets paid. The payments screen shows it and lets them set it;
-- nothing stored it until now.
--
-- ── Why a plain text column ─────────────────────────────────────────────────
-- A UPI ID (name@bank) is a payment ADDRESS, not a credential. It is printed on
-- invoices, shown in payment apps, and shared to receive money — the whole
-- point of it is being given out. Encrypting it would imply a secrecy it does
-- not have, and would stop ops from reading the one field they need when a
-- payout bounces.
--
-- It is still PII, so it is withheld from anon and authenticated exactly like
-- phone and contact_email are (see 0470). Only the service role reads it, which
-- means only server code the app controls can put it on a screen.
--
-- ── What is NOT here ────────────────────────────────────────────────────────
-- No verification. The export's design says "UPI · utkarsh@upi · verified", but
-- there is nothing to verify against: confirming a UPI ID belongs to a person
-- means a penny-drop through a payment aggregator, which is the RBI-regulated
-- territory v1 stays out of. Showing "verified" for a string someone typed
-- would be a lie in the one place a creator most needs the truth. The UI says
-- "not verified yet" instead.
--
-- Nullable: nobody has one yet, and a creator with no deals has no reason to
-- add one.

ALTER TABLE public.creators
  ADD COLUMN IF NOT EXISTS upi_id text;

COMMENT ON COLUMN public.creators.upi_id IS
  'UPI payment address (name@bank), self-entered. NOT verified — there is no '
  'verification path in v1. PII: withheld from anon/authenticated like phone.';

-- Withheld from the client roles, matching 0470's treatment of phone,
-- contact_email and rate_card. The column grant list there is explicit, so a
-- new column is unreadable by default; this states it rather than relying on
-- that, because relying on a default for PII is how the next column leaks.
REVOKE SELECT (upi_id) ON public.creators FROM anon, authenticated;

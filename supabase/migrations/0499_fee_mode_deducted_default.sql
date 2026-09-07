-- Migration 0499: the platform fee comes out of the creator's side
--
-- ── What was wrong ─────────────────────────────────────────────────────────
-- brands.fee_mode has defaulted to 'on_top' since 0100. `on_top` means the
-- BRAND pays base + fee and the creator receives the full base — so a brand
-- was shown "Platform fee (15%), paid by you" and a creator was shown an
-- undeducted "you receive ₹50,000". Both screens were rendering the mode
-- correctly; the mode itself was never the intended one.
--
-- The intended rule is 15%, borne by the creator: brand pays the agreed price,
-- creator receives price minus fee.
--
-- ── What this does NOT touch ───────────────────────────────────────────────
-- Existing DEALS. Every deal snapshots its own fee_percent and fee_mode at
-- creation, and an invoice snapshots them again. Nothing already agreed
-- changes price because of this migration — which is the whole reason those
-- snapshots exist. Only deals created from now on are affected.
--
-- ── The exception, by id and not by rate ───────────────────────────────────
-- FinLeap is on a negotiated 10% and stays on its current terms. It is pinned
-- by id rather than by `platform_fee_percent = 10`, because a rate is not an
-- identity: the next brand put on 10% would silently inherit an exemption
-- nobody granted it.

-- ── Default for new brands ─────────────────────────────────────────────────
ALTER TABLE brands ALTER COLUMN fee_mode SET DEFAULT 'deducted';

-- ── Existing brands, except the negotiated one ─────────────────────────────
UPDATE brands
   SET fee_mode = 'deducted'
 WHERE fee_mode <> 'deducted'
   AND name <> 'FinLeap';

-- ── Align the other defaults ───────────────────────────────────────────────
-- deals, invoices and campaigns all default to 'on_top' too. The app always
-- writes these explicitly from the brand, so the defaults are only a fallback
-- — but a fallback that contradicts the rule is the kind of thing that surfaces
-- years later in one unexplained row.
ALTER TABLE deals     ALTER COLUMN fee_mode SET DEFAULT 'deducted';
ALTER TABLE invoices  ALTER COLUMN fee_mode SET DEFAULT 'deducted';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'campaigns' AND column_name = 'fee_mode'
  ) THEN
    EXECUTE 'ALTER TABLE campaigns ALTER COLUMN fee_mode SET DEFAULT ''deducted''';
  END IF;
END $$;

COMMENT ON COLUMN brands.fee_mode IS
  'on_top = brand pays base + fee, creator receives base. deducted = brand pays base, creator receives base - fee. DEDUCTED is the platform rule; on_top exists only for negotiated exceptions.';

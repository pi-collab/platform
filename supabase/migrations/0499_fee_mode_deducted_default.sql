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
-- ── The exception, by identity and not by rate ─────────────────────────────
-- FinLeap is on a negotiated 10% and stays on its current terms. It is pinned
-- by its own row rather than by `platform_fee_percent = 10`, because a rate is
-- not an identity: the next brand put on 10% would silently inherit an
-- exemption nobody granted it.
--
-- The name is used ONCE, here, to resolve that row to an id — not as the
-- exemption rule. This is a one-time UPDATE, so a later rename cannot break it.
-- What could break it is a name that does not resolve to exactly one brand, so
-- that case RAISEs instead of guessing: flipping a negotiated brand to
-- 'deducted' by accident changes what a real customer is charged.
--
-- A hardcoded uuid was the other option, and was rejected: brand ids differ
-- between the staging and production projects, so a literal id silently
-- exempts nobody in one of them.

-- ── Default for new brands ─────────────────────────────────────────────────
ALTER TABLE brands ALTER COLUMN fee_mode SET DEFAULT 'deducted';

-- ── Existing brands, except the negotiated one ─────────────────────────────
DO $$
DECLARE
  exempt_name constant text := 'FinLeap';
  exempt_id   uuid;
  matches     integer;
  moved       integer;
BEGIN
  -- Counted first, and separately. There is no min(uuid) aggregate, so the id
  -- cannot be picked in the same statement — and it must not be picked before
  -- the count is checked anyway: choosing one of two same-named brands is the
  -- guess this block exists to refuse.
  SELECT count(*) INTO matches FROM brands WHERE name = exempt_name;

  IF matches > 1 THEN
    RAISE EXCEPTION
      '% brands are named %. Cannot tell which one holds the negotiated terms; '
      'pin the intended brand by id and re-run.', matches, exempt_name;
  END IF;

  -- Exactly one row or none. SELECT INTO leaves exempt_id NULL when none.
  SELECT id INTO exempt_id FROM brands WHERE name = exempt_name;

  IF matches = 0 THEN
    -- Not an error: an environment may legitimately not have this brand.
    RAISE NOTICE 'No brand named % here; every brand moves to deducted.', exempt_name;
  ELSE
    RAISE NOTICE 'Exempting % (id %) from the move to deducted.', exempt_name, exempt_id;
  END IF;

  UPDATE brands
     SET fee_mode = 'deducted'
   WHERE fee_mode <> 'deducted'
     AND (exempt_id IS NULL OR id <> exempt_id);

  GET DIAGNOSTICS moved = ROW_COUNT;
  RAISE NOTICE '% brand(s) moved to deducted.', moved;
END $$;

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

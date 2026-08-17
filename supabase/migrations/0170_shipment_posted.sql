-- ================================================================
-- SHIPMENT TRACKING + POSTED STATE
-- Additive columns on deals — no status-machine changes.
-- Existing RLS (deals_read, deals_update) covers all new fields.
-- Existing realtime subscription on deals covers all updates.
-- Existing audit trigger (audit_deal) logs all changes.
-- ================================================================

-- ── 1. Shipment tracking (optional per deal) ──────────────────
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS requires_shipment  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shipment_status    text CHECK (shipment_status IN ('pending', 'shipped', 'delivered')),
  ADD COLUMN IF NOT EXISTS tracking_link      text,
  ADD COLUMN IF NOT EXISTS carrier_note       text,
  ADD COLUMN IF NOT EXISTS shipped_at         timestamptz;

-- ── 2. Posted state (post-completion) ─────────────────────────
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS is_posted    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS posted_url   text,
  ADD COLUMN IF NOT EXISTS posted_at    timestamptz;

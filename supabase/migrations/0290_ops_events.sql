-- Ops audit log: every admin write is actor-attributed.
-- Separate from the deal-scoped `events` table because ops actions
-- span creators, brands, products, and deals — not just deals.
-- For deal-specific ops actions (e.g. fee override), a SECOND entry
-- goes into `events` so it appears in the deal timeline.

CREATE TABLE IF NOT EXISTS ops_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_email     text NOT NULL,
  actor_auth_id   uuid NOT NULL,
  action          text NOT NULL,        -- e.g. 'creator.vetted', 'deal.fee_override_set'
  target_table    text NOT NULL,        -- e.g. 'creators', 'brands', 'deals'
  target_id       uuid,                 -- the row acted on (nullable for bulk ops)
  detail          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON ops_events (target_table, target_id);
CREATE INDEX ON ops_events (created_at);
CREATE INDEX ON ops_events (actor_email);

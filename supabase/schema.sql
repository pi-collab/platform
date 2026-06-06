-- =============================================================
-- DEAL PLATFORM — v1 SCHEMA
-- Paste into Supabase SQL Editor and run top to bottom.
-- Money is ALWAYS stored as bigint paise (₹1 = 100). Never float.
-- =============================================================

-- ----- 0. EXTENSIONS -----------------------------------------
create extension if not exists "pgcrypto";   -- for gen_random_uuid()

-- ----- 1. ENUMS ----------------------------------------------
-- Roles a human can have.
create type user_role as enum ('creator', 'brand_member');

-- Deal lifecycle. This is the spine of the product.
create type deal_status as enum (
  'negotiating',   -- offer/counter going back and forth
  'agreed',        -- terms locked, audit entry written
  'delivered',     -- creator uploaded deliverable(s)
  'revision',      -- brand requested a change (counts against limit)
  'approved',      -- brand approved the work
  'paid',          -- payment marked paid
  'complete',      -- closed; lands in history, re-engageable
  'declined',      -- creator declined the offer
  'cancelled'      -- either side withdrew before agreement
);

-- Who proposed the current set of terms during negotiation.
create type offer_party as enum ('brand', 'creator');

-- Payment status. NOTE: this models a Razorpay PAYMENT LINK + status only.
-- No held-escrow / custody fields. That is deferred (RBI PA territory).
create type payment_status as enum (
  'none',          -- no link created yet
  'link_sent',     -- Razorpay link generated and sent
  'paid',          -- brand paid via the link
  'overdue',       -- past due, unpaid
  'refunded'       -- reversed
);

-- ----- 2. USERS ----------------------------------------------
-- One row per human. Auth-method-agnostic: links to Supabase auth.users
-- via auth_id. phone and email both nullable so "Google now, phone/OTP
-- later" is config, not a migration.
-- managed_by is the delegated-access stub: nullable now, lets agencies /
-- influencer-managers slot in later as a PERMISSION LAYER, not a rewrite.
create table users (
  id          uuid primary key default gen_random_uuid(),
  auth_id     uuid unique references auth.users (id) on delete set null,
  role        user_role not null,
  full_name   text,
  email       text,
  phone       text,
  managed_by  uuid references users (id) on delete set null,  -- delegated-access stub
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ----- 3. CREATORS -------------------------------------------
-- A creator can exist as a PROFILE STUB before they ever log in:
-- user_id is nullable and gets populated when they authenticate.
-- This is what lets a brand send an offer to a not-yet-signed-up creator
-- (the no-signup first-offer flow).
create table creators (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid unique references users (id) on delete set null,  -- null until they sign up
  full_name   text not null,
  phone       text,            -- needed for the WhatsApp ping pre-signup
  niche       text,            -- finance / BFSI first, but free-text for now
  handle      text,            -- e.g. instagram handle
  -- rate card: self-entered, per deliverable type. JSONB keeps it flexible
  -- in v1 without a second table. amounts inside are paise (integers).
  rate_card   jsonb not null default '{}'::jsonb,
  is_vetted   boolean not null default false,  -- manual approval flag
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ----- 4. BRANDS + MEMBERS -----------------------------------
create table brands (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- A brand has members (its users). A user belongs to one brand in v1.
create table brand_members (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid not null references brands (id) on delete cascade,
  user_id     uuid not null references users (id) on delete cascade,
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (brand_id, user_id)
);

-- ----- 5. DEALS (the core object) ----------------------------
-- One Deal = one collaboration between one brand and one creator.
-- Structured terms live here. Thread, files, payment, audit hang off it.
create table deals (
  id              uuid primary key default gen_random_uuid(),
  brand_id        uuid not null references brands (id) on delete restrict,
  creator_id      uuid not null references creators (id) on delete restrict,
  created_by      uuid references users (id) on delete set null,  -- which brand member made it

  status          deal_status not null default 'negotiating',

  -- Structured terms (the offer card). These are the CURRENT agreed/proposed
  -- values; the negotiation history lives in messages.
  title           text,
  deliverables    text,                 -- e.g. "1 Reel + 2 Stories" (structured-enough for v1)
  price_paise     bigint check (price_paise >= 0),  -- MONEY: paise, never float
  currency        text not null default 'INR',
  timeline_date   date,                 -- agreed delivery date
  revision_limit  int not null default 1 check (revision_limit >= 0),
  revisions_used  int not null default 0 check (revisions_used >= 0),
  usage_rights    text,
  payment_terms   text,
  last_offer_by   offer_party,          -- who proposed current terms

  -- Re-engage loop: a new deal can point at the deal it was cloned from,
  -- so "terms pre-filled" is just copying the parent's fields.
  reengaged_from  uuid references deals (id) on delete set null,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  agreed_at       timestamptz,
  completed_at    timestamptz,

  check (revisions_used <= revision_limit)
);

create index on deals (brand_id);
create index on deals (creator_id);
create index on deals (status);

-- ----- 6. MESSAGES (negotiation + chat thread) ---------------
-- Tied to a deal. Holds offer/counter/accept lines AND free chat.
create table messages (
  id            uuid primary key default gen_random_uuid(),
  deal_id       uuid not null references deals (id) on delete cascade,
  sender_id     uuid references users (id) on delete set null,
  sender_party  offer_party not null,   -- brand or creator (works pre-signup)
  body          text,
  -- If this message is a structured offer/counter, the proposed terms snapshot
  -- goes here (paise inside). Null for plain chat messages.
  offer_terms   jsonb,
  created_at    timestamptz not null default now()
);

create index on messages (deal_id, created_at);

-- ----- 7. DELIVERABLES (uploaded files + versions) -----------
-- Files live in Supabase Storage; this table tracks the rows + versions.
create table deliverables (
  id            uuid primary key default gen_random_uuid(),
  deal_id       uuid not null references deals (id) on delete cascade,
  uploaded_by   uuid references users (id) on delete set null,
  version       int not null default 1,
  storage_path  text not null,          -- path in Supabase Storage bucket
  filename      text,
  note          text,
  created_at    timestamptz not null default now(),
  unique (deal_id, version)
);

create index on deliverables (deal_id);

-- ----- 8. PAYMENTS (Razorpay LINK + status only) ------------
-- One payment record per deal in v1. No custody/escrow fields.
create table payments (
  id                  uuid primary key default gen_random_uuid(),
  deal_id             uuid not null unique references deals (id) on delete cascade,
  status              payment_status not null default 'none',
  amount_paise        bigint check (amount_paise >= 0),   -- MONEY: paise
  currency            text not null default 'INR',
  razorpay_link_id    text,             -- reference to the Razorpay payment link
  razorpay_link_url   text,
  link_sent_at        timestamptz,
  paid_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ----- 9. EVENTS (the audit log = the moat) ------------------
-- Timestamped record of every state change. Built from commit one.
-- Populated automatically by triggers below, not by app code remembering to.
create table events (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid references deals (id) on delete cascade,
  actor_id    uuid references users (id) on delete set null,
  event_type  text not null,            -- e.g. 'deal.created', 'deal.status_changed'
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index on events (deal_id, created_at);

-- ----- 10. updated_at AUTO-TOUCH -----------------------------
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger t_users_touch      before update on users      for each row execute function touch_updated_at();
create trigger t_creators_touch   before update on creators   for each row execute function touch_updated_at();
create trigger t_brands_touch     before update on brands     for each row execute function touch_updated_at();
create trigger t_deals_touch      before update on deals      for each row execute function touch_updated_at();
create trigger t_payments_touch   before update on payments   for each row execute function touch_updated_at();

-- ----- 11. AUTO-AUDIT on deals -------------------------------
-- Writes an events row on deal creation and on any status change.
-- This is why the moat data accumulates without relying on app code.
create or replace function audit_deal()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT') then
    insert into events (deal_id, actor_id, event_type, detail)
    values (new.id, new.created_by, 'deal.created',
            jsonb_build_object('status', new.status));
    -- stamp agreed/completed timestamps if created already in those states
    return new;

  elsif (tg_op = 'UPDATE') then
    if (new.status is distinct from old.status) then
      insert into events (deal_id, actor_id, event_type, detail)
      values (new.id, new.created_by, 'deal.status_changed',
              jsonb_build_object('from', old.status, 'to', new.status));

      if (new.status = 'agreed' and new.agreed_at is null) then
        new.agreed_at = now();
      end if;
      if (new.status = 'complete' and new.completed_at is null) then
        new.completed_at = now();
      end if;
    end if;
    return new;
  end if;
  return null;
end $$;

create trigger t_deals_audit_ins after  insert on deals for each row execute function audit_deal();
create trigger t_deals_audit_upd before update on deals for each row execute function audit_deal();

-- =============================================================
-- END OF CORE SCHEMA.
-- RLS policies are in a SEPARATE block below — read the note first.
-- =============================================================

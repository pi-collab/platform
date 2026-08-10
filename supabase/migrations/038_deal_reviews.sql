-- Deal reviews: both brand and creator can rate each other after a deal completes.
-- Ratings are PRIVATE — neither side sees the other's rating directly.
-- Used internally for Creator Reliability Index and brand quality signals.

create table deal_reviews (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid not null references deals (id) on delete cascade,
  reviewer_role text not null check (reviewer_role in ('brand', 'creator')),
  rating      smallint not null check (rating >= 1 and rating <= 5),
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- One review per role per deal
  unique (deal_id, reviewer_role)
);

-- Index for lookups
create index idx_deal_reviews_deal on deal_reviews (deal_id);

-- RLS
alter table deal_reviews enable row level security;

-- Brand can insert/update their own review on their deals
create policy "brand_insert_review" on deal_reviews
  for insert to authenticated
  with check (
    reviewer_role = 'brand'
    and deal_id in (
      select d.id from deals d
      join brand_members bm on bm.brand_id = d.brand_id
      where bm.user_id = (select id from users where auth_id = auth.uid())
    )
  );

create policy "brand_update_review" on deal_reviews
  for update to authenticated
  using (
    reviewer_role = 'brand'
    and deal_id in (
      select d.id from deals d
      join brand_members bm on bm.brand_id = d.brand_id
      where bm.user_id = (select id from users where auth_id = auth.uid())
    )
  );

-- Creator can insert/update their own review on their deals
create policy "creator_insert_review" on deal_reviews
  for insert to authenticated
  with check (
    reviewer_role = 'creator'
    and deal_id in (
      select d.id from deals d
      where d.creator_id = (
        select c.id from creators c
        join users u on u.id = c.user_id
        where u.auth_id = auth.uid()
      )
    )
  );

create policy "creator_update_review" on deal_reviews
  for update to authenticated
  using (
    reviewer_role = 'creator'
    and deal_id in (
      select d.id from deals d
      where d.creator_id = (
        select c.id from creators c
        join users u on u.id = c.user_id
        where u.auth_id = auth.uid()
      )
    )
  );

-- Each side can only SELECT their OWN reviews (not the other party's)
create policy "brand_read_own_review" on deal_reviews
  for select to authenticated
  using (
    reviewer_role = 'brand'
    and deal_id in (
      select d.id from deals d
      join brand_members bm on bm.brand_id = d.brand_id
      where bm.user_id = (select id from users where auth_id = auth.uid())
    )
  );

create policy "creator_read_own_review" on deal_reviews
  for select to authenticated
  using (
    reviewer_role = 'creator'
    and deal_id in (
      select d.id from deals d
      where d.creator_id = (
        select c.id from creators c
        join users u on u.id = c.user_id
        where u.auth_id = auth.uid()
      )
    )
  );

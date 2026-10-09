-- 0545: legacy "affiliate on all videos" → an explicit per-creator count.
--
-- Before 0538 a request could say "affiliate: yes" with no per-creator count,
-- meaning ALL of each creator's videos (the brand page still words it "all").
-- Since 0538 every request must give the count, and the leg draft (0539)
-- reads an empty count as "no affiliate sold" (NULL means no). So on those
-- older Experiences the console hid the affiliate split and the database
-- would have refused one.
--
-- The fix writes "all" down as what it meant: the number of videos each
-- creator makes, on the request and, where the plan is locked, on the agreed
-- plan. Scoped to rows that bought affiliate and have no count; no money,
-- fee or price field is touched; nothing is sent on these rows yet (the
-- one staging row has no deals). Re-runnable: a second run matches nothing.

UPDATE experiences
SET request_affiliate_per_creator = experience_plan_count(request_deliverables, true),
    updated_at = now()
WHERE request_affiliate IS TRUE
  AND request_affiliate_per_creator IS NULL
  AND experience_plan_count(request_deliverables, true) > 0;

UPDATE experiences
SET agreed_plan = jsonb_set(agreed_plan, '{affiliate_per_creator}',
                            to_jsonb(experience_plan_count(agreed_plan -> 'per_creator', true))),
    updated_at = now()
WHERE request_affiliate IS TRUE
  AND agreed_plan IS NOT NULL
  AND nullif(agreed_plan ->> 'affiliate_per_creator', '') IS NULL
  AND experience_plan_count(agreed_plan -> 'per_creator', true) > 0;

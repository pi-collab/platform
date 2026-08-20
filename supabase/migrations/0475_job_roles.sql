-- ─────────────────────────────────────────────────────────────────────────────
-- job_roles
--
-- Openings for the careers page, editable from ops.
--
-- This started as a file in lib/careers.ts, on the reasoning that a handful of
-- rarely-changing roles wants review rather than a CRUD screen. That is wrong
-- for how this will actually be used: posting a job should not need a developer
-- or a deploy, and editing a description at 11pm should not be a pull request.
--
-- The shape mirrors what the page renders. The three list columns are text[]
-- rather than a child table because they are display copy, always read as a
-- whole, and never queried across.
--
-- is_published is what the public page filters on, so a role can be written,
-- read back on the real page, and only then made visible.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.job_roles (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The URL segment, and what an applicant shares. Unique because two live
  -- roles cannot answer to the same address.
  slug             text NOT NULL UNIQUE,
  title            text NOT NULL,
  team             text NOT NULL DEFAULT '',
  location         text NOT NULL DEFAULT '',
  employment_type  text NOT NULL DEFAULT 'Full-time',
  summary          text NOT NULL DEFAULT '',
  about            text[] NOT NULL DEFAULT '{}',
  responsibilities text[] NOT NULL DEFAULT '{}',
  requirements     text[] NOT NULL DEFAULT '{}',
  is_published     boolean NOT NULL DEFAULT false,
  -- Lower sorts first, so the order on the page is a decision rather than an
  -- accident of when each row was written.
  sort_order       integer NOT NULL DEFAULT 100,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_roles_published_idx
  ON public.job_roles (is_published, sort_order);

ALTER TABLE public.job_roles ENABLE ROW LEVEL SECURITY;

-- Published roles are public: the careers page is read by people who are not
-- signed in, which is the entire point of it.
DROP POLICY IF EXISTS job_roles_read_published ON public.job_roles;
CREATE POLICY job_roles_read_published
  ON public.job_roles FOR SELECT
  USING (is_published = true);

-- No INSERT, UPDATE or DELETE policy. Ops writes through the service role,
-- which bypasses RLS, and the access boundary there is OPS_ALLOWED_EMAILS —
-- the same boundary every other ops write already sits behind. An unpublished
-- draft is therefore invisible to anon and authenticated alike.

DROP TRIGGER IF EXISTS trg_job_roles_updated_at ON public.job_roles;
CREATE TRIGGER trg_job_roles_updated_at
  BEFORE UPDATE ON public.job_roles
  -- touch_updated_at() is the existing convention; every other table with an
-- updated_at column uses it.
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Two drafts to start from, UNPUBLISHED. They give ops something real to edit
-- and prove the page renders, without putting copy nobody has approved in front
-- of applicants. Publish from ops when the wording is right.
INSERT INTO public.job_roles (slug, title, team, location, employment_type, summary, about, responsibilities, requirements, sort_order)
VALUES
  ('founding-engineer', 'Founding Engineer', 'Engineering', 'Delhi NCR / Remote', 'Full-time',
   'Own whole surfaces of the product, from the deal workflow to the creator app.',
   ARRAY['Guapd is where brands and creators run collaborations end to end — offer, negotiation, deliverables, approvals and payment, in one place instead of scattered across DMs and spreadsheets.'],
   ARRAY['Build and own features across the brand workflow and the creator experience.','Work with the founders on what to build and why, not just how.'],
   ARRAY['Strong TypeScript, React and Postgres.','You have shipped things real people used, and dealt with the aftermath.'],
   10),
  ('creator-partnerships', 'Creator Partnerships', 'Growth', 'Delhi NCR / Mumbai', 'Full-time',
   'Bring creators onto guapd and make sure their first deal is a good one.',
   ARRAY['Creators are the supply side of this market, and their first deal decides whether there is a second one.'],
   ARRAY['Recruit and onboard creators.','Sit with them through their first deal and remove whatever gets in the way.'],
   ARRAY['You have worked with creators and understand how these deals get done.'],
   20)
ON CONFLICT (slug) DO NOTHING;

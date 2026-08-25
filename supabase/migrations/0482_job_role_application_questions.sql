-- Migration 0482: per-role application questions
--
-- A role can now carry its own questions, each optional or required, answered
-- in a text box on the application form.
--
-- ── Why a jsonb column and not a job_role_questions table ────────────────────
-- Questions are edited as a SET, in the same form as the role, and are only
-- ever read alongside the role that owns them. Nothing queries a question on
-- its own, nothing joins to one, and answers are mailed and audited rather than
-- stored relationally — so a child table would buy referential integrity we
-- have no query to spend it on, at the cost of a second write path that can
-- half-succeed.
--
-- It also matches the row it sits on: about, responsibilities and requirements
-- are already arrays on job_roles for the same reason.
--
-- ── Shape ────────────────────────────────────────────────────────────────────
--   [{ "id": "<uuid>", "prompt": "Why this role?", "required": true }]
--
-- The id exists so an answer can be tied to the question that produced it even
-- after the set is reordered or reworded. Prompt text alone would silently
-- re-key every stored answer the first time someone fixes a typo.
--
-- The CHECK enforces only that this is an ARRAY. Validating each element in SQL
-- would mean a jsonb_array_elements subquery in a constraint, which is both
-- slow and painful to change; the ops action validates shape, length and count,
-- and that action is the only writer.

ALTER TABLE job_roles
  ADD COLUMN IF NOT EXISTS application_questions jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE job_roles
  DROP CONSTRAINT IF EXISTS job_roles_application_questions_is_array;

ALTER TABLE job_roles
  ADD CONSTRAINT job_roles_application_questions_is_array
  CHECK (jsonb_typeof(application_questions) = 'array');

COMMENT ON COLUMN job_roles.application_questions IS
  'Ordered [{id, prompt, required}]. Written only by app/ops/careers/actions.ts, which validates each element. Answers are emailed and recorded in events — never stored here.';

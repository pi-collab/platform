-- 0558: the brand suggests creators who are not on Guapd yet.
--   * experience_brand_suggestions: name, Instagram handle and an optional
--     note from a brand member while the roster is open. No cost, no phone.
--   * Guapd turns one into a prospect (0541, where staff add the expected
--     cost) or marks it not possible with a reason. The brand sees each of its
--     suggestions with where it stands; once the prospect is linked to a Guapd
--     account the creator is on the roster as usual.
--   * A handle that belongs to a listed Guapd creator is refused with a pointer
--     to add them from Guapd instead.
--   * Function access only: no policies, no grants on the table. Brand writes
--     carry the brand gate; staff need operational access. NULL means no.

CREATE TABLE IF NOT EXISTS experience_brand_suggestions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id     uuid NOT NULL REFERENCES experiences (id) ON DELETE CASCADE,
  full_name         text NOT NULL CHECK (length(btrim(full_name)) BETWEEN 2 AND 120),
  instagram_handle  text NOT NULL CHECK (instagram_handle ~ '^[a-z0-9._]{1,30}$'),
  note              text CHECK (note IS NULL OR length(note) <= 500),
  status            text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'prospect', 'not_possible')),
  prospect_id       uuid REFERENCES experience_roster_prospects (id) ON DELETE SET NULL,
  reason            text,
  created_by        uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  resolved_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  resolved_at       timestamptz,
  CONSTRAINT ebs_resolved_shape CHECK ((status = 'open') = (resolved_at IS NULL)),
  CONSTRAINT ebs_not_possible_shape CHECK ((status = 'not_possible') = (reason IS NOT NULL)
    AND (reason IS NULL OR length(btrim(reason)) BETWEEN 3 AND 300))
);
CREATE INDEX IF NOT EXISTS ebs_experience_idx ON experience_brand_suggestions (experience_id);
CREATE UNIQUE INDEX IF NOT EXISTS ebs_handle_once ON experience_brand_suggestions (experience_id, instagram_handle) WHERE status <> 'not_possible';
ALTER TABLE experience_brand_suggestions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON experience_brand_suggestions FROM anon, authenticated;

-- The brand suggests one creator. Returns the suggestion id.
CREATE OR REPLACE FUNCTION public.brand_experience_suggest_creator(p_experience_id uuid, p_full_name text, p_handle text, p_note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text; v_handle text := experience_clean_handle(p_handle); v_note text := nullif(btrim(coalesce(p_note, '')), ''); v_id uuid;
BEGIN
  PERFORM brand_experience_require(p_experience_id, false);
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = p_experience_id FOR UPDATE;
  IF v_status IS NULL OR v_status NOT IN ('rostering', 'confirmed') THEN
    RAISE EXCEPTION 'Creators can be suggested once the price is agreed, until the shoot is scheduled';
  END IF;
  IF length(btrim(coalesce(p_full_name, ''))) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'Enter their name'; END IF;
  IF v_handle IS NULL OR v_handle !~ '^[a-z0-9._]{1,30}$' THEN RAISE EXCEPTION 'Enter their Instagram handle (letters, numbers, dots, underscores)'; END IF;
  IF v_note IS NOT NULL AND length(v_note) > 500 THEN RAISE EXCEPTION 'The note is too long (500 characters at most)'; END IF;
  IF EXISTS (SELECT 1 FROM creators c WHERE c.is_bookable IS TRUE AND c.is_guapd IS FALSE AND experience_clean_handle(c.handle) = v_handle) THEN
    RAISE EXCEPTION '@% is already on Guapd: add them from Guapd instead', v_handle;
  END IF;
  IF EXISTS (SELECT 1 FROM experience_brand_suggestions s WHERE s.experience_id = p_experience_id AND s.instagram_handle = v_handle AND s.status <> 'not_possible') THEN
    RAISE EXCEPTION 'You already suggested @%', v_handle;
  END IF;
  INSERT INTO experience_brand_suggestions (experience_id, full_name, instagram_handle, note, created_by)
  VALUES (p_experience_id, btrim(p_full_name), v_handle, v_note, my_user_id())
  RETURNING id INTO v_id;
  PERFORM experience_console_audit('experience.creator_suggested_by_brand', 'experience_brand_suggestions', v_id,
    jsonb_build_object('experience_id', p_experience_id, 'handle', v_handle, 'channel', 'portal'));
  RETURN v_id;
END;
$function$;

-- The brand's own suggestions on this Experience, with where each stands.
CREATE OR REPLACE FUNCTION public.brand_experience_suggestions(p_experience_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_rows jsonb;
BEGIN
  PERFORM brand_experience_require(p_experience_id, false);
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'full_name', s.full_name, 'handle', s.instagram_handle, 'note', s.note, 'created_at', s.created_at,
      'status', CASE WHEN s.status = 'prospect' AND p.status = 'linked' THEN 'on_roster'
                     WHEN s.status = 'prospect' AND p.status = 'dropped' THEN 'not_possible'
                     ELSE s.status END,
      'reason', CASE WHEN s.status = 'not_possible' THEN s.reason END
    ) ORDER BY s.created_at), '[]'::jsonb)
    INTO v_rows
    FROM experience_brand_suggestions s LEFT JOIN experience_roster_prospects p ON p.id = s.prospect_id
    WHERE s.experience_id = p_experience_id;
  RETURN v_rows;
END;
$function$;

-- Staff: the brand's suggestions (operational).
CREATE OR REPLACE FUNCTION public.experience_console_brand_suggestions(p_experience_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_rows jsonb;
BEGIN
  PERFORM experience_console_require();
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'full_name', s.full_name, 'handle', s.instagram_handle, 'note', s.note, 'status', s.status,
      'prospect_id', s.prospect_id, 'reason', s.reason, 'created_at', s.created_at, 'resolved_at', s.resolved_at
    ) ORDER BY s.status <> 'open', s.created_at), '[]'::jsonb)
    INTO v_rows
    FROM experience_brand_suggestions s WHERE s.experience_id = p_experience_id;
  RETURN v_rows;
END;
$function$;

-- Staff resolve a suggestion: 'prospect' with the prospect they added for it
-- (same Experience, same handle), or 'not_possible' with a reason.
CREATE OR REPLACE FUNCTION public.experience_console_suggestion_resolve(p_suggestion_id uuid, p_outcome text, p_prospect_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  s_exp uuid; s_status text; s_handle text; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  PERFORM experience_console_require();
  SELECT s.experience_id, s.status, s.instagram_handle INTO s_exp, s_status, s_handle
    FROM experience_brand_suggestions s WHERE s.id = p_suggestion_id FOR UPDATE;
  IF s_exp IS NULL THEN RAISE EXCEPTION 'Suggestion not found'; END IF;
  IF s_status IS DISTINCT FROM 'open' THEN RAISE EXCEPTION 'This suggestion was already answered'; END IF;
  IF p_outcome IS NULL OR p_outcome NOT IN ('prospect', 'not_possible') THEN RAISE EXCEPTION 'Add them as a prospect, or say it is not possible'; END IF;
  IF p_outcome = 'prospect' THEN
    IF p_prospect_id IS NULL OR NOT EXISTS (SELECT 1 FROM experience_roster_prospects p
        WHERE p.id = p_prospect_id AND p.experience_id = s_exp AND p.instagram_handle = s_handle) THEN
      RAISE EXCEPTION 'That prospect is not this creator on this Experience';
    END IF;
    UPDATE experience_brand_suggestions SET status = 'prospect', prospect_id = p_prospect_id, resolved_by = my_user_id(), resolved_at = now()
      WHERE id = p_suggestion_id;
  ELSE
    IF length(coalesce(v_reason, '')) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'Say why (3 to 300 characters); the brand sees it'; END IF;
    UPDATE experience_brand_suggestions SET status = 'not_possible', reason = v_reason, resolved_by = my_user_id(), resolved_at = now()
      WHERE id = p_suggestion_id;
  END IF;
  PERFORM experience_console_audit('experience.brand_suggestion_resolved', 'experience_brand_suggestions', p_suggestion_id,
    jsonb_build_object('experience_id', s_exp, 'outcome', p_outcome, 'prospect_id', p_prospect_id));
END;
$function$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'brand_experience_suggest_creator(uuid, text, text, text)', 'brand_experience_suggestions(uuid)',
    'experience_console_brand_suggestions(uuid)', 'experience_console_suggestion_resolve(uuid, text, uuid, text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;

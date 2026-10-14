-- 0564: change the shoot date after the price is agreed.
--   The date is set from the accepted quote (experience_quote_accept_apply) and,
--   until now, nothing could move it. Shoots get rescheduled.
--   experience_console_shoot_date_set: operational staff, while creators are
--   being chosen, confirmed or the shoot is scheduled, with a reason. Earlier or
--   later: up to 90 days back (a shoot that happened before the date on file)
--   and up to a year ahead. Refused
--   once any shoot outcome is recorded (outcomes depend on the date; undo them
--   first). Every change is kept in experience_shoot_date_changes and audited.
--   Returns the creator deals still live (offer out, accepted or paid) so the
--   app can tell those creators. The creator, brand and console screens all read
--   experiences.shoot_date live, so nothing else needs updating.

CREATE TABLE IF NOT EXISTS public.experience_shoot_date_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id uuid NOT NULL REFERENCES public.experiences(id) ON DELETE CASCADE,
  from_date date,
  to_date date NOT NULL,
  reason text NOT NULL CHECK (length(reason) BETWEEN 3 AND 300),
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS esdc_experience ON public.experience_shoot_date_changes (experience_id, changed_at DESC);
ALTER TABLE public.experience_shoot_date_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.experience_shoot_date_changes FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.experience_console_shoot_date_set(p_experience_id uuid, p_date date, p_reason text)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text; v_date date; v_deals uuid[];
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  PERFORM experience_console_require();
  SELECT e.status, e.shoot_date INTO v_status, v_date FROM experiences e WHERE e.id = p_experience_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  IF v_status NOT IN ('rostering', 'confirmed', 'shoot_scheduled') THEN
    RAISE EXCEPTION 'The shoot date can be changed while creators are being chosen, confirmed or the shoot is scheduled';
  END IF;
  IF p_date IS NULL THEN RAISE EXCEPTION 'Pick the new shoot date'; END IF;
  IF p_date < v_today - 90 THEN RAISE EXCEPTION 'The new date can be at most 90 days back'; END IF;
  IF p_date > v_today + 365 THEN RAISE EXCEPTION 'The new date must be within a year'; END IF;
  IF p_date IS NOT DISTINCT FROM v_date THEN RAISE EXCEPTION 'That is already the shoot date'; END IF;
  IF length(coalesce(v_reason, '')) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'Say why the date is changing (3 to 300 characters)'; END IF;
  IF EXISTS (SELECT 1 FROM experience_roster r WHERE r.experience_id = p_experience_id AND r.leg_shoot_outcome IS NOT NULL) THEN
    RAISE EXCEPTION 'Shoot outcomes are already recorded. Undo them first to change the date';
  END IF;

  UPDATE experiences SET shoot_date = p_date, updated_at = now() WHERE id = p_experience_id;
  INSERT INTO experience_shoot_date_changes (experience_id, from_date, to_date, reason, changed_by)
    VALUES (p_experience_id, v_date, p_date, left(v_reason, 300), my_user_id());

  SELECT coalesce(array_agg(d.id ORDER BY d.id), '{}') INTO v_deals
    FROM experience_roster r JOIN deals d ON d.id = r.leg_deal_id
   WHERE r.experience_id = p_experience_id AND d.status::text IN ('negotiating', 'agreed', 'paid');

  PERFORM experience_console_audit('experience.shoot_date_changed', 'experiences', p_experience_id,
    jsonb_build_object('status', v_status, 'shoot_date_before', v_date, 'shoot_date_after', p_date,
      'reason_length', length(v_reason), 'creators_told', cardinality(v_deals)));
  RETURN v_deals;
END;
$function$;
REVOKE ALL ON FUNCTION public.experience_console_shoot_date_set(uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.experience_console_shoot_date_set(uuid, date, text) TO authenticated;

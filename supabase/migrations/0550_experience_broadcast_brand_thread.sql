-- 0550: Phase 6.1 items 10 + 11.
--   10. Broadcast: Guapd writes once to every creator on an Experience; each
--       creator receives it in THEIR OWN Guapd thread (one message per sent
--       leg), never seeing who else got it. The brand never sees any of it.
--       (A campaign broadcast is the brand writing on each of its own deals: it
--       needs no new database code, the deal message rules already apply.)
--   11. One brand <-> Guapd thread per Experience. Its own table, readable and
--       writable only through functions: the brand through its gate (members of
--       THIS Experience's brand, never the house brand), staff through the
--       console gate. No creator can reach it; it carries no money.
-- NULL means no; explicit columns; every write audited by length, never text.

-- ═══ 10. Broadcast to creators (Experience) ════════════════════════════════
-- p_scope: 'all' = every sent leg still open; 'accepted' = accepted legs only.
CREATE OR REPLACE FUNCTION public.experience_console_leg_broadcast(p_experience_id uuid, p_body text, p_scope text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_body text := btrim(coalesce(p_body, '')); v_ids uuid[]; d uuid;
BEGIN
  PERFORM experience_console_require();
  IF NOT EXISTS (SELECT 1 FROM experiences e WHERE e.id = p_experience_id) THEN RAISE EXCEPTION 'Experience not found'; END IF;
  IF p_scope IS NULL OR p_scope NOT IN ('all', 'accepted') THEN RAISE EXCEPTION 'Say who it goes to'; END IF;
  IF length(v_body) = 0 THEN RAISE EXCEPTION 'Write a message first'; END IF;
  IF length(v_body) > 4000 THEN RAISE EXCEPTION 'A message is at most 4,000 characters'; END IF;
  SELECT coalesce(array_agg(dl.id ORDER BY dl.created_at), '{}') INTO v_ids
    FROM experience_roster r JOIN deals dl ON dl.id = r.leg_deal_id AND dl.leg_role = 'creator_leg' AND dl.brand_id = guapd_brand_id()
    WHERE r.experience_id = p_experience_id
      AND dl.status::text NOT IN ('complete', 'declined', 'cancelled')
      AND (p_scope = 'all' OR dl.status::text = 'agreed');
  IF coalesce(array_length(v_ids, 1), 0) = 0 THEN RAISE EXCEPTION 'No creator to send to'; END IF;
  FOREACH d IN ARRAY v_ids LOOP
    INSERT INTO messages (deal_id, sender_id, sender_party, body) VALUES (d, my_user_id(), 'brand', v_body);
    INSERT INTO events (deal_id, actor_id, event_type, detail)
      VALUES (d, my_user_id(), 'experience.leg_message', jsonb_build_object('from', 'guapd', 'length', length(v_body), 'broadcast', true));
    INSERT INTO message_reads (user_id, deal_id, last_read_at) VALUES (my_user_id(), d, now())
      ON CONFLICT (user_id, deal_id) DO UPDATE SET last_read_at = now();
  END LOOP;
  PERFORM experience_console_audit('experience.leg_broadcast', 'experiences', p_experience_id,
    jsonb_build_object('scope', p_scope, 'recipients', array_length(v_ids, 1), 'length', length(v_body)));
  RETURN jsonb_build_object('deal_ids', to_jsonb(v_ids));
END;
$function$;

-- ═══ 11. The brand <-> Guapd thread ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS experience_brand_messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id uuid NOT NULL REFERENCES experiences (id) ON DELETE CASCADE,
  sender        text NOT NULL CHECK (sender IN ('brand', 'guapd')),
  sender_user   uuid REFERENCES users (id),
  body          text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 4000),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ebm_experience_idx ON experience_brand_messages (experience_id, created_at);

CREATE TABLE IF NOT EXISTS experience_brand_message_reads (
  user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  experience_id uuid NOT NULL REFERENCES experiences (id) ON DELETE CASCADE,
  last_read_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, experience_id)
);

-- Functions only. RLS on with no policy: no session reads or writes directly.
ALTER TABLE experience_brand_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE experience_brand_message_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON experience_brand_messages, experience_brand_message_reads FROM anon, authenticated;

-- The thread as either side sees it. Guapd's messages read "Guapd" to the
-- brand (never a staff name); staff see which colleague wrote each.
CREATE OR REPLACE FUNCTION public.experience_brand_thread_rows(p_experience_id uuid, p_for text)
 RETURNS jsonb
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'from', m.sender, 'body', m.body, 'created_at', m.created_at,
      'sender_name', CASE WHEN m.sender = 'guapd' AND p_for = 'brand' THEN 'Guapd'
                          ELSE coalesce(u.full_name, CASE WHEN m.sender = 'guapd' THEN 'Guapd' ELSE 'The brand' END) END
    ) ORDER BY m.created_at), '[]'::jsonb)
  FROM experience_brand_messages m LEFT JOIN users u ON u.id = m.sender_user
  WHERE m.experience_id = p_experience_id
$$;
REVOKE ALL ON FUNCTION experience_brand_thread_rows(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.brand_experience_messages(p_experience_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v jsonb;
BEGIN
  PERFORM brand_experience_require(p_experience_id, false);
  v := experience_brand_thread_rows(p_experience_id, 'brand');
  INSERT INTO experience_brand_message_reads (user_id, experience_id, last_read_at) VALUES (my_user_id(), p_experience_id, now())
    ON CONFLICT (user_id, experience_id) DO UPDATE SET last_read_at = now();
  RETURN jsonb_build_object('messages', v);
END;
$function$;

CREATE OR REPLACE FUNCTION public.brand_experience_message_send(p_experience_id uuid, p_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_body text := btrim(coalesce(p_body, '')); v_id uuid; v_at timestamptz;
BEGIN
  PERFORM brand_experience_require(p_experience_id, false);
  IF length(v_body) = 0 THEN RAISE EXCEPTION 'Write a message first'; END IF;
  IF length(v_body) > 4000 THEN RAISE EXCEPTION 'A message is at most 4,000 characters'; END IF;
  INSERT INTO experience_brand_messages (experience_id, sender, sender_user, body) VALUES (p_experience_id, 'brand', my_user_id(), v_body)
    RETURNING id, created_at INTO v_id, v_at;
  INSERT INTO experience_brand_message_reads (user_id, experience_id, last_read_at) VALUES (my_user_id(), p_experience_id, now())
    ON CONFLICT (user_id, experience_id) DO UPDATE SET last_read_at = now();
  PERFORM experience_console_audit('experience.brand_message_in', 'experiences', p_experience_id, jsonb_build_object('length', length(v_body)));
  RETURN jsonb_build_object('id', v_id, 'body', v_body, 'from', 'brand', 'created_at', v_at);
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_brand_messages(p_experience_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v jsonb; v_title text; v_brand text;
BEGIN
  PERFORM experience_console_require();
  SELECT e.title, b.name INTO v_title, v_brand FROM experiences e JOIN brands b ON b.id = e.brand_id WHERE e.id = p_experience_id;
  IF v_title IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  v := experience_brand_thread_rows(p_experience_id, 'guapd');
  INSERT INTO experience_brand_message_reads (user_id, experience_id, last_read_at) VALUES (my_user_id(), p_experience_id, now())
    ON CONFLICT (user_id, experience_id) DO UPDATE SET last_read_at = now();
  RETURN jsonb_build_object('experience_id', p_experience_id, 'experience_title', v_title, 'brand_name', v_brand, 'messages', v);
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_brand_message_send(p_experience_id uuid, p_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_body text := btrim(coalesce(p_body, '')); v_id uuid; v_at timestamptz;
BEGIN
  PERFORM experience_console_require();
  IF NOT EXISTS (SELECT 1 FROM experiences e WHERE e.id = p_experience_id) THEN RAISE EXCEPTION 'Experience not found'; END IF;
  IF length(v_body) = 0 THEN RAISE EXCEPTION 'Write a message first'; END IF;
  IF length(v_body) > 4000 THEN RAISE EXCEPTION 'A message is at most 4,000 characters'; END IF;
  INSERT INTO experience_brand_messages (experience_id, sender, sender_user, body) VALUES (p_experience_id, 'guapd', my_user_id(), v_body)
    RETURNING id, created_at INTO v_id, v_at;
  INSERT INTO experience_brand_message_reads (user_id, experience_id, last_read_at) VALUES (my_user_id(), p_experience_id, now())
    ON CONFLICT (user_id, experience_id) DO UPDATE SET last_read_at = now();
  PERFORM experience_console_audit('experience.brand_message_out', 'experiences', p_experience_id, jsonb_build_object('length', length(v_body)));
  RETURN jsonb_build_object('id', v_id, 'body', v_body, 'from', 'guapd', 'created_at', v_at);
END;
$function$;

-- Every Experience with a brand thread, for the console inbox: last message
-- and this staff user's unread count (brand messages after their last read).
CREATE OR REPLACE FUNCTION public.experience_console_brand_threads()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v jsonb; v_me uuid := my_user_id();
BEGIN
  PERFORM experience_console_require();
  SELECT coalesce(jsonb_agg(x.row ORDER BY x.at DESC), '[]'::jsonb) INTO v FROM (
    SELECT jsonb_build_object('experience_id', e.id, 'experience_title', e.title, 'brand_name', b.name,
             'last_message', (SELECT jsonb_build_object('body', left(m.body, 160), 'from', m.sender, 'created_at', m.created_at)
                              FROM experience_brand_messages m WHERE m.experience_id = e.id ORDER BY m.created_at DESC LIMIT 1),
             'message_count', (SELECT count(*) FROM experience_brand_messages m WHERE m.experience_id = e.id),
             'unread', (SELECT count(*) FROM experience_brand_messages m WHERE m.experience_id = e.id AND m.sender = 'brand'
                          AND m.created_at > coalesce((SELECT r.last_read_at FROM experience_brand_message_reads r WHERE r.user_id = v_me AND r.experience_id = e.id), '-infinity'::timestamptz))
           ) AS row,
           (SELECT max(m.created_at) FROM experience_brand_messages m WHERE m.experience_id = e.id) AS at
    FROM experiences e JOIN brands b ON b.id = e.brand_id
    WHERE EXISTS (SELECT 1 FROM experience_brand_messages m WHERE m.experience_id = e.id)
  ) x;
  RETURN v;
END;
$function$;

-- Unread for one side, for badges: the brand counts Guapd's messages, staff the brand's.
CREATE OR REPLACE FUNCTION public.brand_experience_messages_unread(p_experience_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v int;
BEGIN
  PERFORM brand_experience_require(p_experience_id, false);
  SELECT count(*)::int INTO v FROM experience_brand_messages m
    WHERE m.experience_id = p_experience_id AND m.sender = 'guapd'
      AND m.created_at > coalesce((SELECT r.last_read_at FROM experience_brand_message_reads r WHERE r.user_id = my_user_id() AND r.experience_id = p_experience_id), '-infinity'::timestamptz);
  RETURN v;
END;
$function$;

-- The console's unread total now counts brand threads too.
CREATE OR REPLACE FUNCTION public.experience_console_unread_messages()
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v int; v_b int; v_me uuid := my_user_id();
BEGIN
  PERFORM experience_console_require();
  SELECT count(*)::int INTO v
    FROM messages m JOIN deals d ON d.id = m.deal_id AND d.leg_role = 'creator_leg'
    LEFT JOIN message_reads mr ON mr.user_id = v_me AND mr.deal_id = m.deal_id
    WHERE m.sender_party = 'creator' AND (mr.last_read_at IS NULL OR m.created_at > mr.last_read_at);
  SELECT count(*)::int INTO v_b
    FROM experience_brand_messages m
    LEFT JOIN experience_brand_message_reads r ON r.user_id = v_me AND r.experience_id = m.experience_id
    WHERE m.sender = 'brand' AND (r.last_read_at IS NULL OR m.created_at > r.last_read_at);
  RETURN v + v_b;
END;
$function$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'experience_console_leg_broadcast(uuid, text, text)',
    'brand_experience_messages(uuid)', 'brand_experience_message_send(uuid, text)', 'brand_experience_messages_unread(uuid)',
    'experience_console_brand_messages(uuid)', 'experience_console_brand_message_send(uuid, text)',
    'experience_console_brand_threads()', 'experience_console_unread_messages()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;

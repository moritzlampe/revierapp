-- 059_position_consent_obertreiber.sql
--
-- Two things, both required by the E5 consent model:
--   1. positions_delete_own — without it, revoking consent cannot erase the
--      track log (see part 1 below).
--   2. The Obertreiber backstop in set_position_consent (part 2).
--
-- E5 D7b: the Obertreiber backstop. Until now set_position_consent (057)
-- validated only the enum value, so the "Rolle annehmen = zustimmen" promise
-- was a client-side convention that any raw Supabase query could ignore. That
-- promise is made to the whole hunting party, so it belongs on the write edge.
--
-- Obertreiber = role 'treiber' carrying the 'gruppenleiter' tag. There is no
-- separate role in the schema; the pair IS the role.
--
-- Additive: same signature, same errors, same grants. The only new behaviour is
-- the rejection below. Apply in ONE selection in the Supabase SQL editor.
--
-- NOTE: the canonical migration history lives in revierapp/supabase/migrations.
-- This copy sits here because the native repo has no migrations directory and
-- this change is driven by the native E5 sprint. Mirror it over when convenient.

-- ---------------------------------------------------------------------------
-- 1. Let a participant erase his own track log (E5 D2)
-- ---------------------------------------------------------------------------
--
-- `positions` carried only SELECT (048:86) and INSERT (048:169) policies. A
-- client DELETE therefore removed zero rows and reported NO error — the
-- revocation path would have claimed success while the full GPS trace stayed
-- readable for every joined member. positions_current already allows it via its
-- FOR ALL policy (048:178); the log did not.
--
-- No status filter on purpose: erasing your own data must not depend on still
-- being a joined member of the hunt.

DROP POLICY IF EXISTS "positions_delete_own" ON public.positions;
CREATE POLICY "positions_delete_own" ON public.positions FOR DELETE
  USING (
    participant_id IN (
      SELECT id FROM public.hunt_participants WHERE user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Obertreiber backstop in the consent RPC (E5 D7b)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_position_consent(p_hunt_id uuid, p_consent text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_role public.participant_role;
  v_tags public.participant_tag[];
BEGIN
  IF p_consent NOT IN ('name', 'anon', 'none') THEN
    RAISE EXCEPTION 'invalid consent value: %', p_consent;
  END IF;

  -- Read before write: the role check needs the current row, and SELECT INTO
  -- sets FOUND, so the missing-row error keeps its 057 wording.
  SELECT role, tags
    INTO v_role, v_tags
    FROM public.hunt_participants
   WHERE hunt_id = p_hunt_id
     AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no participant row for current user in hunt %', p_hunt_id;
  END IF;

  IF v_role = 'treiber'
     AND 'gruppenleiter' = ANY (COALESCE(v_tags, '{}'::public.participant_tag[]))
     AND p_consent <> 'name'
  THEN
    RAISE EXCEPTION 'Obertreiber muss namentlich sichtbar sein';
  END IF;

  UPDATE public.hunt_participants
     SET position_consent = p_consent
   WHERE hunt_id = p_hunt_id
     AND user_id = auth.uid();
END;
$$;

-- CREATE OR REPLACE keeps existing grants; re-asserted so a fresh database
-- reaches the same state from this file alone.
REVOKE ALL ON FUNCTION public.set_position_consent(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.set_position_consent(uuid, text) TO authenticated;

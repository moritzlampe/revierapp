-- 057_position_consent_model.sql
-- Fixes 056: L4 lock (06.07.2026) requires a three-state consent
-- (name | anon | none), not boolean. Column is fresh and empty -> safe rebuild.
-- Also: hunt_participants has no self-UPDATE policy (own_row is SELECT-only),
-- so consent is written through a narrow SECURITY DEFINER RPC.

-- ---------------------------------------------------------------------------
-- 1. Rebuild position_consent as text + CHECK (only if still boolean)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'hunt_participants'
      AND column_name = 'position_consent'
      AND data_type = 'boolean'
  ) THEN
    ALTER TABLE public.hunt_participants DROP COLUMN position_consent;
  END IF;
END $$;

-- null = never asked; 'name' = share with name; 'anon' = share without name;
-- 'none' = no position sharing.
ALTER TABLE public.hunt_participants
  ADD COLUMN IF NOT EXISTS position_consent text
  CHECK (position_consent IN ('name', 'anon', 'none'));

-- ---------------------------------------------------------------------------
-- 2. Self-service consent RPC (own row only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_position_consent(p_hunt_id uuid, p_consent text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_consent NOT IN ('name', 'anon', 'none') THEN
    RAISE EXCEPTION 'invalid consent value: %', p_consent;
  END IF;

  UPDATE public.hunt_participants
     SET position_consent = p_consent
   WHERE hunt_id = p_hunt_id
     AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no participant row for current user in hunt %', p_hunt_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_position_consent(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.set_position_consent(uuid, text) TO authenticated;

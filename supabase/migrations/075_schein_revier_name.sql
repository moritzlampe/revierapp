-- 075 — Revier-Name für den gesperrten Scheininhaber
--
-- Nachtrag zu 068/069. Beide geben dem Inhaber Zugriff, solange sein Schein
-- `aktiv` ist. Wird er pausiert oder entzogen, fällt `districts_jes_select`
-- weg — und mit dem Revier verschwindet auch sein NAME. Gemessen am
-- 31.07.2026 gegen die Produktions-DB, als Inhaber gelesen:
--
--     Schein aktiv      Schein pausiert
--     districts   1     districts   0
--     map_objects 33    map_objects 0
--     eigener Schein 1  eigener Schein 1   <- bleibt lesbar
--     join districts(name)  'Testrevier Karte (L7)'  ->  NULL
--
-- Das ist genau eine Zeile zu viel weggenommen. Die native Ansicht
-- (`du/schein.tsx`) ist der einzige Ort, an dem ein Pächter erfährt, warum ihm
-- das Revier abhanden kam — und sie konnte das Revier nicht benennen. Sie half
-- sich mit dem Aussteller („Ausgestellt von Moritz"), was bei EINEM Schein
-- reicht und bei zweien nicht mehr auflösbar ist.
--
-- Entscheidung Moritz, 31.07.2026: „tut ja auch nicht weh wenn der reviername
-- gesehen wird. der schein war ja eh mal aktiv."
--
-- Additiv: eine neue Funktion, keine Policy wird angefasst. Insbesondere bleibt
-- `districts` selbst unverändert zu — Grenze, `settings` und alles andere sind
-- für den gesperrten Inhaber weiterhin unerreichbar. Freigegeben wird der Name
-- und sonst nichts.

-- ---------------------------------------------------------------------------
-- Der Name des Reviers, für das ich einen Schein habe — egal welchen Status
-- ---------------------------------------------------------------------------
-- Bewusst OHNE Status-Filter, das ist der ganze Zweck. Die Berechtigung ist
-- „ich halte (oder hielt) hier einen Schein", nicht „mein Schein gilt".
--
-- SECURITY DEFINER, weil der Aufrufer `districts` per RLS gerade nicht lesen
-- darf; die Funktion ist die Ausnahme und deshalb so schmal wie möglich:
-- ein Parameter, ein Rückgabewert, kein Zeilenzugriff auf irgendetwas sonst.
create or replace function public.schein_revier_name(p_district_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select d.name
    from districts d
   where d.id = p_district_id
     and exists (
           select 1
             from hunting_licenses hl
            where hl.district_id = p_district_id
              and hl.holder_id = auth.uid()
         );
$$;

comment on function public.schein_revier_name(uuid) is
  'Revier-Name für Inhaber eines Begehungsscheins, unabhängig vom Status. '
  'Gibt NULL zurück, wenn der Aufrufer für dieses Revier keinen Schein hält. '
  'Migration 075.';

-- Rechte. `authenticated` genügt; `anon` bekäme durch die Bauform ohnehin
-- nichts, weil ohne `auth.uid()` das EXISTS nie wahr wird. Trotzdem zugedreht,
-- und BEIDE Wege — das ist hier zweimal schiefgegangen und beide Male anders:
--
--   30.07.2026 (Migration 069): `revoke ... from public` allein schloss nichts.
--     Supabase hängt EXECUTE per ALTER DEFAULT PRIVILEGES DIREKT an `anon` und
--     `authenticated`; PUBLIC zu entziehen trifft diese Grants nicht.
--   31.07.2026 (diese Migration): `revoke ... from anon` allein schloss auch
--     nichts. `create function` vergibt EXECUTE zusätzlich an PUBLIC, und
--     darüber kam `anon` weiter durch — die ACL zeigte `{=X/postgres, …}`,
--     der leere Empfänger IST PUBLIC.
--
-- Lehre aus beiden zusammen: EXECUTE kommt aus zwei Quellen, und wer nur eine
-- zudreht, hat nichts zugedreht. Immer beide entziehen, dann gezielt geben —
-- und danach mit `has_function_privilege` nachmessen statt es anzunehmen.
revoke execute on function public.schein_revier_name(uuid) from public;
revoke execute on function public.schein_revier_name(uuid) from anon;
grant  execute on function public.schein_revier_name(uuid) to authenticated;

-- Gegengeprüft 31.07.2026 nach dem Anwenden:
--   has_function_privilege('authenticated', …) -> true
--   has_function_privilege('anon',          …) -> false
--   proacl -> {postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres}

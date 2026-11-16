-- 156: Der Revierbesitzer ist auf einer fremden Jagd keine Leitung mehr (CN-507).
--
-- ANLASS: `kontroll_stufe` (152) und `sicht_stufe` (141) geben dem Besitzer des
-- Reviers einer Jagd die Stufe 'leitung' -- auch wenn er in einer fremden
-- Gruppenjagd nur Schuetze ist, und sogar ohne jede Teilnahme (152, Befund A7
-- und SL5: Eintrag per API in eine Jagd, die er nicht sieht; benannter Preis).
-- Die App kennt ihn nicht als Leitung (`isPrivileged`, `siehtNamen`,
-- `stufeAusTeilnahme`): Postenliste und Jaeger-Blatt zeigten ihm anonyme
-- Namen, die der Server liefert (Schlusslesung 152 a-c F2, 14.11.2026).
-- Begruendung und Pruefkette: quickhunt-native/docs/migrationen/156_revierbesitzer_ohne_leitung.md
--
--
-- DIE REGEL (Moritz, 14.11.2026, woertlich)
--
--   "ein Revierbesitzer ist doch in dem Fall auf einer fremden Jagd dann ist
--    es doch egal ob er ein Revier hat, da ist er ein normaler Gast"
--   -- und zu `sicht_stufe`: "2. ja".
--
-- Leitung einer Jagd ist, wer sie angelegt hat oder als Jagdleiter in ihr
-- steht. Der Besitz des Reviers macht niemanden zur Leitung einer Jagd, die
-- ein anderer angelegt hat.
--
--
-- WAS SICH AENDERT
--
-- 1. `kontroll_stufe`: 'leitung' nur noch fuer den Ersteller und den
--    `joined` Jagdleiter. Gruppenleiter unveraendert.
-- 2. `sicht_stufe`, Zeile 1 (Gast-Sicht-Bauplan E2): Ersteller oder
--    Jagdleiter (joined ODER left mit `joined_at`, wie bisher ueber
--    `meine_teilnahme`). Der Besitzer faellt in die Zeile seiner Teilnahme
--    (Treiber, Gruppenleiter, Schuetze) -- ohne Teilnahme in Zeile 0, 'keine'.
-- 3. `kill_verlauf_schreiben`: die Rolle zum Zeitpunkt kennt keinen
--    'revierbesitzer' mehr; der Besitzer bekommt die Rolle seiner Teilnahme.
--
--
-- WAS BLEIBT -- "was ihm gehoert, nimmt ihm keine Jagdregel" (Gast-Sicht E2)
--
-- * Die Besitzer-Policies: `kills_district_owner`, `observations_district_owner`,
--   `tracking_requests_district_owner`, `map_objects_owner_*`,
--   `zones_district_owner`, `districts_owner_all`. Die Strecke seines Reviers
--   sieht der Besitzer weiter vollstaendig -- die Streckenliste fuehrt der
--   Jagdausuebungsberechtigte "fuer ihren Jagdbezirk" (Paragraph 25 Abs. 5
--   NJagdG). Dort entscheidet das Revier, nicht die Jagd.
-- * Das Jagdrecht: `hunt_revier_muss_erlaubt_sein` (092) und das Revierrecht
--   des Erstellers in `set_kill_herkunft` (152) fragen weiter nach dem
--   Besitzer -- dort geht es darum, ob jemand im Revier jagen DARF, nicht
--   darum, wer eine fremde Jagd leitet.
-- * In der eigenen Jagd ist der Besitzer ihr Ersteller und bleibt Leitung.
-- * Der CHECK `kill_verlauf_rolle_wert` behaelt 'revierbesitzer' (additiv;
--   0 Zeilen tragen den Wert, gemessen 14.11.2026).
--
--
-- BESTAND (gemessen 14.11.2026): 8 Gruppenjagden mit Revier, 0 davon mit
-- Besitzer <> Ersteller, 0 Teilnahmen eines Besitzers an einer fremden Jagd,
-- 0 Verlaufzeilen mit `von_rolle = 'revierbesitzer'`.
--
--
-- FALLEN
--
-- * `create or replace` behaelt Eigentuemer und ACL (Stand 14.11.2026:
--   `sicht_stufe` und `kill_verlauf_schreiben` fuer niemanden, `kontroll_stufe`
--   nur fuer `authenticated`) -- die Gegenprobe prueft sie. Den Kommentar von
--   `kontroll_stufe` ersetzt 156, weil er den Revierbesitzer nennt.
-- * `pg_temp` am Ende des search_path -- aus den Live-Fassungen uebernommen.
-- * Die Ruempfe sind die Live-Fassungen vom 14.11.2026 (pg_get_functiondef),
--   geaendert nur an den markierten Stellen (`-- 156`).

begin;

create or replace function public.kontroll_stufe(p_hunt uuid)
 returns text
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select case
           when auth.uid() is null then null
           -- 156 (CN-507): Leitung ist der Ersteller oder der Jagdleiter --
           -- der Revierbesitzer nicht mehr.
           when exists (select 1
                          from public.hunts h
                         where h.id = p_hunt
                           and h.creator_id = auth.uid())
             or exists (select 1
                          from public.hunt_participants p
                         where p.hunt_id = p_hunt
                           and p.user_id = auth.uid()
                           and p.status = 'joined'
                           and p.role = 'jagdleiter')
             then 'leitung'
           when exists (select 1
                          from public.hunt_participants p
                         where p.hunt_id = p_hunt
                           and p.user_id = auth.uid()
                           and p.status = 'joined'
                           and 'gruppenleiter' = any (p.tags))
             then 'gruppenleiter'
         end;
$function$;

create or replace function public.sicht_stufe(p_hunt_id uuid)
 returns text
 language sql
 stable security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  select case
           when h.id is null then 'keine'
           -- Zeile 1: Ersteller, Jagdleiter (joined ODER left mit
           -- joined_at). 156 (CN-507): der Revierbesitzer nicht mehr -- er
           -- faellt in die Zeile seiner Teilnahme. Was ihm gehoert, sieht er
           -- ueber die Besitzer-Policies weiter (E2).
           when h.creator_id = auth.uid()
             or t.role = 'jagdleiter' then 'leitung'
           -- Zeile 0
           when t.id is null then 'keine'
           -- Zeile 2: Treiber, auch Obertreiber (V10) und Hundefuehrer
           -- mit Rolle Treiber (E4).
           when t.role = 'treiber' then 'treiber'
           -- Zeile 3
           when t.role = 'schuetze'
            and 'gruppenleiter' = any (t.tags)
            and h.gruppenleiter_sicht = 'alles' then 'alles'
           -- Zeile 4, ELSE
           else h.schuetzen_sicht
         end
    from (select 1) eins
    left join public.hunts h on h.id = p_hunt_id
    left join public.hunt_participants t
           on t.id = public.meine_teilnahme(p_hunt_id);
$function$;

create or replace function public.kill_verlauf_schreiben()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_ereignis text;
  v_von      uuid;
  v_grund    text;
  v_rolle    text;
begin
  if tg_op = 'INSERT' then
    v_von := new.reporter_id;
    v_ereignis := case
                    when new.status = 'wounded' then 'nachsuche'
                    when new.kontrolle = 'eingetragen' then 'eingetragen'
                    else 'gemeldet'
                  end;
  else
    v_von := auth.uid();
    if old.kontrolle in ('doppelt', 'fehlmeldung')
       and coalesce(new.kontrolle, '') not in ('doppelt', 'fehlmeldung') then
      v_ereignis := 'zurueck';
    elsif new.kontrolle_am is distinct from old.kontrolle_am then
      v_ereignis := case new.kontrolle
                      when 'bestaetigt'  then 'bestaetigt'
                      when 'korrigiert'  then 'geaendert'
                      when 'doppelt'     then 'aus_strecke'
                      when 'fehlmeldung' then 'aus_strecke'
                    end;
      if v_ereignis = 'aus_strecke' then
        v_grund := new.kontrolle;
      end if;
    elsif (new.wildart_id, new.wild_art, new.geschlecht, new.status, new.drive_id)
            is distinct from
          (old.wildart_id, old.wild_art, old.geschlecht, old.status, old.drive_id)
       or new.position is distinct from old.position then
      v_ereignis := 'geaendert';
    end if;

    if v_ereignis is null then
      return null;
    end if;
  end if;

  -- Rolle zum Zeitpunkt (Schnappschuss). Jagdleiter vor Ersteller: so
  -- heisst die Rolle, die der Ersteller in seiner Jagd fast immer traegt.
  -- 156 (CN-507): kein 'revierbesitzer' mehr -- der Besitzer bekommt die
  -- Rolle seiner Teilnahme.
  select case
           when v_von is null then null
           when t.role = 'jagdleiter' then 'jagdleiter'
           when h.creator_id = v_von then 'ersteller'
           when 'gruppenleiter' = any (t.tags) then 'gruppenleiter'
           when t.role = 'treiber' then 'treiber'
           when t.id is not null then 'schuetze'
         end
    into v_rolle
    from public.hunts h
    left join public.hunt_participants t on t.hunt_id = h.id and t.user_id = v_von
   where h.id = new.hunt_id;

  insert into public.kill_verlauf (kill_id, ereignis, von, von_rolle, vorher, nachher, grund)
  values (new.id, v_ereignis, v_von, v_rolle,
          case when tg_op = 'UPDATE' then public.kill_stand(old) end,
          public.kill_stand(new),
          v_grund);

  return null;
end;
$function$;

comment on function public.kontroll_stufe(uuid) is
  '152/156: leitung (Ersteller, joined Jagdleiter; seit 156 nicht mehr der Revierbesitzer) | gruppenleiter (joined, Tag) | null. Recht fuer Eintragen, Kontrolle, Loeschsperre, Gast (E-B2).';

commit;

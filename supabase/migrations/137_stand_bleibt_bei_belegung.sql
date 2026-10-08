-- 137: Ein belegter Stand bleibt, wo und was er ist; wer "Objekt setzen"
--      sieht; kein hartes DELETE auf Kartenobjekte (CN-279, CN-306).
--
-- ANLASS: Die native Revierkarte bekommt Setzen, Verschieben und Bearbeiten
-- von Kartenobjekten (CN-279, Moritz 08.10.2026). Verschieben gibt es in der
-- PWA schon an drei Stellen — und keine davon fragt, ob dort gerade jemand
-- sitzt. Die Sperre aus 081 sitzt nur in `kartenobjekt_loeschen()`.
-- Bauplan: quickhunt-native/docs/konzepte/QuickHunt_Bauplan_Revierobjekte_Setzen_V1.md (§12 zuerst)
-- Begruendung und Pruefkette: quickhunt-native/docs/migrationen/137_stand_bleibt_bei_belegung.md
--
--
-- DIE REGEL IN DREI SAETZEN
--
-- 1. Waehrend einer laufenden oder pausierten Jagd lassen sich Position, Art
--    und Revier eines Kartenobjekts nicht aendern, wenn dort jemand
--    EINGELOCKT (`stand_ist_belegt`, 081) oder EINGETEILT
--    (`hunt_seat_assignments` mit `user_id`) ist — `55006 object_in_use`.
--    Name und Notiz bleiben aenderbar.
-- 2. `darf_objekt_setzen(revier)` sagt, wer den Knopf "Objekt setzen" sieht:
--    Besitzer, oder gueltiger Schein `revier`, oder Schein `bereiche` mit
--    mindestens einer lebenden Zone dieses Reviers.
-- 3. Kartenobjekte verschwinden nur noch ueber den Papierkorb
--    (`kartenobjekt_loeschen`) oder ueber die Kaskade eines Revier-DELETE —
--    nie mehr per hartem DELETE ueber PostgREST.
--
--
-- WARUM DREI SPALTEN UND NICHT NUR DIE POSITION (Schlusslesung F1)
--
-- Die Jagdkarte zeichnet die Belegungsmarke nur an Stand-Arten
-- (`iconStand && standOccupancy`). Wer eine besetzte Kanzel zur Kirrung
-- macht, nimmt allen Mitjaegern die Marke; wer sie in ein anderes Revier
-- haengt, nimmt ihnen den Stand. Derselbe Schaden wie 062/081, andere Spalte.
--
-- WARUM AUCH "EINGETEILT" (Entscheidung Moritz, 08.10.2026, D1)
--
-- Einlocken ist freiwillig und an die App gebunden. Wer nicht einlockt, sitzt
-- trotzdem dort, und die Mitjaeger sehen den Stand aus `map_objects`. Preis:
-- ein eingeteilter Stand ist waehrend der Jagd nicht verschiebbar — wer ihn
-- korrigieren will, nimmt die Einteilung zuerst zurueck.
-- Das LOESCHEN aus 081 bleibt bei "eingelockt"; es anzugleichen ist ein
-- eigener Schritt.
-- `user_id is not null`: eine Zeile ohne Person ist kein besetzter Platz
-- (`seats.ts` gibt Plaetze per `user_id = null` frei).
--
-- WARUM DIE DELETE-POLICIES FALLEN (Entscheidung Moritz, 08.10.2026, D2)
--
-- `map_objects_owner_delete` und `map_objects_creator_delete` erlaubten ein
-- echtes DELETE per PostgREST — vorbei an Papierkorb (072-074) UND
-- Belegungssperre, mit allen CASCADE-Folgen (Pruefhistorie, Fotos; u. a.
-- `kills.hochsitz_id` auf NULL). Gemessen 08.10.2026: kein Client (beide
-- Repos gegrept), keine Funktion in `public` (Regex ueber alle Rumpfe, mit
-- Positivkontrolle), keine Edge Function nutzt den Weg. Ein Revier-DELETE
-- loescht seine Objekte ueber den Fremdschluessel — referentielle Aktionen
-- laufen an RLS vorbei und brauchen keine Policy.
--
--
-- ⛔ `extensions` IM search_path DER TRIGGERFUNKTION IST PFLICHT.
-- PostGIS und sein `=`-Operator fuer `geometry` liegen im Schema
-- `extensions`. Mit `public, pg_temp` wirft `is distinct from` auf
-- `geometry` `42725 operator is not unique` (gemessen 08.10.2026) — der
-- Trigger braeche dann JEDES Verschieben, in App, PWA und Portal. Der erste
-- Entwurf hatte genau diesen Fehler; beide Pruefer lasen ihn als korrekt.
--
-- `darf_objekt_setzen` vergleicht keine Geometrie und bleibt bei
-- `public, pg_temp`.
--
--
-- BEKANNTE RESTLUECKE (wie 081, Backlog CN-307)
--
-- Committet ein Einlocken oder Einteilen, NACHDEM das UPDATE seinen Snapshot
-- genommen hat, gewinnt das UPDATE. Die Fremdschluessel
-- `hunt_stand_bezug.map_object_id` und `hunt_seat_assignments.seat_id`
-- sperren die `map_objects`-Zeile beim Einlocken nur FOR KEY SHARE, und ein
-- Verschieben aendert keinen Schluessel (FOR NO KEY UPDATE) — die beiden
-- warten nicht aufeinander. (Hier stand bis zur Fremdpruefung "kein
-- Fremdschluessel" — falsch gemessen, Codex P3 Punkt 1.) Ein `FOR UPDATE`
-- auf die eigene Zeile im Trigger wuerde auf ein laufendes Einlocken warten
-- und die Luecke schliessen — eigene Entscheidung, Backlog CN-307.
--
-- ID-WECHSEL: Die `id` eines eingelockten oder eingeteilten Stands laesst
-- sich nicht aendern — beide Fremdschluessel sind ON UPDATE NO ACTION
-- (gemessen 08.10.2026). Der Trigger muss `id` deshalb nicht pruefen.
--
-- ⚠ DIE SCHEIN-RANGFOLGE STEHT DAMIT AN DREI STELLEN:
-- `kann_revier_pflegen`, `schein_deckt_objekt/4` und `darf_objekt_setzen`
-- (129, Falle 2). Wer eine aendert, aendert alle.
--
-- ⚠ Der Trigger feuert auch fuer `postgres` und `service_role`. Eine
-- Datenkorrektur an Position, Art oder Revier eines belegten Stands waehrend
-- einer Jagd braucht `set local session_replication_role = replica`.
--
-- TRIGGER-REIHENFOLGE: der erste Trigger auf `map_objects` — die
-- Alphabet-Falle (096/119/122/129) hat hier keinen Gegenspieler.
--
-- `pg_temp` am ENDE jedes search_path (076). REVOKE namentlich (081/082).
--
-- ⚠ DIESE DATEI TRAEGT BEWUSST KEIN `\set ON_ERROR_STOP on` (120-Muster).
-- Ueber psql (Kartei psql, 132):
--   psql -v ON_ERROR_STOP=1 -c "set lock_timeout = '10s'" \
--        -c "set statement_timeout = '120s'" -f 137_stand_bleibt_bei_belegung.sql
-- Registrierung dann von Hand nachtragen.
-- ⚠ GEZIELT APPLIZIEREN, nie ueber "alle ausstehenden" (115, T9).
-- ⛔ VOR dem nativen Build applizieren: der Client ruft `darf_objekt_setzen`.

begin;

-- ---------------------------------------------------------------------------
-- 1. Ein belegter Stand bleibt, wo und was er ist
-- ---------------------------------------------------------------------------
--
-- SECURITY DEFINER, weil `stand_ist_belegt` fuer niemanden ausfuehrbar ist
-- (081) und `hunt_seat_assignments` fuer den Schreibenden nicht lesbar sein
-- muss. Postgres prueft EXECUTE auf die Triggerfunktion beim ANLEGEN des
-- Triggers, nicht beim Feuern (082, gemessen) — der Entzug unten bricht den
-- Betrieb also nicht.

create or replace function public.map_objects_stand_bleibt_bei_belegung()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if (new.position is distinct from old.position
      or new.type is distinct from old.type
      or new.district_id is distinct from old.district_id)
     and (public.stand_ist_belegt(old.id)
          or exists (select 1
                       from public.hunt_seat_assignments a
                       join public.hunts h on h.id = a.hunt_id
                      where a.seat_id = old.id
                        and a.user_id is not null
                        and h.status in ('active', 'paused'))) then
    raise exception 'Der Stand ist in einer laufenden Jagd belegt'
      using errcode = 'object_in_use';
  end if;
  return new;
end;
$$;

revoke execute on function public.map_objects_stand_bleibt_bei_belegung()
  from public, anon, authenticated, service_role;

create trigger trg_map_objects_stand_bleibt_bei_belegung
  before update of position, type, district_id on public.map_objects
  for each row execute function public.map_objects_stand_bleibt_bei_belegung();

-- ---------------------------------------------------------------------------
-- 2. Wer sieht "Objekt setzen"?
-- ---------------------------------------------------------------------------
--
-- Dieselben Zweige wie `map_objects_owner_insert` + `darf_hier_pflegen`,
-- ohne Ort. Ein Bereichsschein ohne lebende Zone dieses Reviers darf
-- nirgends setzen und bekommt den Knopf deshalb nicht (S2).
-- `current_date` ist der UTC-Tag — wie alle Scheinpfade (CN-217, bewusst
-- gleich, damit die Pfade nicht gegeneinander laufen).

create or replace function public.darf_objekt_setzen(p_district_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.districts
                  where id = p_district_id and owner_id = auth.uid())
      or exists (select 1 from public.hunting_licenses hl
                  where hl.district_id = p_district_id
                    and hl.holder_id = auth.uid()
                    and hl.status = 'aktiv'::public.jes_status
                    and current_date between hl.valid_from and hl.valid_until
                    and (hl.zuteilung = 'revier'
                         or (hl.zuteilung = 'bereiche'
                             and exists (select 1 from public.zones z
                                          where z.id = any (hl.zone_ids)
                                            and z.district_id = p_district_id))));
$$;

revoke execute on function public.darf_objekt_setzen(uuid)
  from public, anon, service_role;
grant execute on function public.darf_objekt_setzen(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Kein hartes DELETE ueber PostgREST (CN-306)
-- ---------------------------------------------------------------------------

drop policy map_objects_owner_delete on public.map_objects;
drop policy map_objects_creator_delete on public.map_objects;

commit;

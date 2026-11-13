-- 153: Fremdeintrag und Treibenwechsel lesen den Ort eines Stands nur, wenn der
-- AUFRUFER diesen Stand sieht (CN-498, Sicherheitsbefund zu 152).
--
-- ANLASS: Die automatische Sicherheitspruefung des revierapp-Commits c735ae0 (152)
-- fand, gegengeprueft am 13.11.2026: `stand_ort_im_treiben` und `sitz_ort_der_jagd`
-- lesen den Ort direkt aus den Tabellen, bewusst ohne `staende_der_teilnahme`
-- (152 §5). Damit gehen sie an der Freigabe der Staende (146, `staende_offen`)
-- vorbei. Ein Gruppenleiter legt per API in einer geplanten, noch nicht
-- freigegebenen Jagd einen Eintrag fuer einen Schuetzen an, liest dessen Stand am
-- zurueckgegebenen Ort ab und loescht den Eintrag wieder. Dasselbe ueber die RPC
-- `erlegung_kontrollieren` (Treibenwechsel an einem eigenen Fremdeintrag).
-- Begruendung und Pruefkette: quickhunt-native/docs/migrationen/153_fremdeintrag_staende_offen.md
--
--
-- DIE REGEL
--
-- Der Server setzt den Ort eines Stands oder Jagdsitzes nur dann in eine
-- Erlegung, wenn der Aufrufer genau diese Stand- bzw. Sitzzeile auch lesen
-- duerfte. Massstab ist `stand_zeile_in_sicht` -- dieselbe Funktion, die die
-- Policies von `hunt_drive_stands` (ueber `treiben_stand_in_sicht`) und
-- `hunt_seat_assignments` (ueber `sitz_in_sicht`, Fremd-Zweig) tragen, mit
-- denselben Argumenten. Sie enthaelt schon:
--   - Leitung (`sicht_stufe` = 'leitung') sieht immer alles (146);
--   - alle anderen erst bei `staende_offen` (146), dann je Stufe:
--     `alles` alles, `eigener`/`umkreis` nach 141, `treiber` nur Eigenes.
-- Gewollte Ausnahme: Leitung ohne Teilnahme (Revierbesitzer, der nicht Ersteller
-- ist) -- RLS zeigt ihr die Zeile nicht (CN-435, 152 A7), `sicht_stufe` gibt ihr
-- `leitung`, sie bekommt also jeden Ort (Schlusslesung 153, B4; Probe Q24).
-- Sieht der Aufrufer die Zeile nicht, liefert die Hilfsfunktion null, und es
-- greift der naechste Ort der Kette (Fremdeintrag: Jagdsitz, dann der GPS-Punkt
-- des Clients, sonst ohne Ort; Treibenwechsel: s. BENANNTE PREISE).
--
--
-- WARUM NICHT DER ENGE FIX AUS DEM BACKLOG ("Leitung oder staende_offen")
--
-- Er schliesst nur den ZEITPUNKT, nicht die Frage WELCHE Staende. Auch nach der
-- Freigabe sieht nicht jeder Gruppenleiter jeden Stand: mit
-- `gruppenleiter_sicht = 'wie_schuetzen'` gilt `schuetzen_sicht` (`eigener`,
-- `umkreis`), und ein Treiber mit dem Tag `gruppenleiter` hat die Stufe
-- `treiber` (`sicht_stufe` prueft die Rolle vor dem Tag). Beide duerften per
-- `kontroll_stufe` fuer jeden Teilnehmer eintragen und laesen so jeden Stand ab.
-- Die Kopplung an `stand_zeile_in_sicht` ist ausserdem die einzige Stelle, an
-- der die Sichtregel steht -- eine zweite Kopie in dieser Datei veraltete still,
-- sobald 141/146 sich aendern.
--
--
-- WAS SICH AENDERT (zwei Hilfsfunktionen, je eine Bedingung)
--
-- a) `stand_ort_im_treiben`: WHERE zusaetzlich
--    `stand_zeile_in_sicht(dr.hunt_id, ds.map_object_id, ds.seat_assignment_id,
--                          ds.participant_id, null)`
--    -- die Argumente von `treiben_stand_in_sicht`.
-- b) `sitz_ort_der_jagd`: WHERE zusaetzlich
--    `stand_zeile_in_sicht(s.hunt_id, s.seat_id, s.id, null, s.user_id)`
--    -- die Argumente des Fremd-Zweigs von `sitz_in_sicht`.
-- Die Aufrufer (`set_kill_herkunft`, `erlegung_kontrollieren`) bleiben
-- unveraendert; sie sind die einzigen (gemessen am 13.11.2026 ueber `prosrc`).
--
-- Bewusst NICHT die Wrapper `treiben_stand_in_sicht`/`sitz_in_sicht`: sie
-- verlangen zusaetzlich eine Teilnahme (`get_my_teilnahme_hunt_ids` bzw.
-- `get_my_joined_hunt_ids`). Die Leitung per `kontroll_stufe` umfasst den
-- Ersteller und den Revierbesitzer auch OHNE Teilnahme (E-B2); ihr nimmt
-- 152 den Ort nicht, und 153 soll es auch nicht. Fuer alle anderen verlangt
-- `kontroll_stufe` ohnehin `joined`.
-- `kontroll_stufe` = 'leitung' impliziert `sicht_stufe` = 'leitung' (Ersteller,
-- Besitzer, `joined` + Rolle `jagdleiter`; `sicht_stufe` nimmt zusaetzlich
-- `left` mit `joined_at`) -- die Leitung behaelt also jeden Ort. Traegt nur,
-- weil `joined` kein `entfernt_am` hat (`meine_teilnahme` schliesst entfernte
-- aus): `trg_teilnehmer_entfernt_am` (128) setzt es bei jedem Status ausser
-- `left` auf null; Produktion 13.11.2026: 0 Verstoesse (Codex 153, P6).
--
--
-- BENANNTE PREISE (ausgefuehrt in der Begruendungsdatei): Ein Stand, den der
-- Aufrufer nicht sieht, gilt wie KEIN Stand -- sonst verriete der Unterschied,
-- dass es ihn gibt. Am Fremdeintrag also Jagdsitz (falls sichtbar), GPS oder ohne
-- Ort. Beim Treibenwechsel die 152-Regel fuer "kein Stand im neuen Treiben":
-- hatte der Erleger im alten einen (sichtbaren) Stand, Jagdsitz (falls sichtbar)
-- oder OHNE Ort -- der bisherige Ort wird dann geleert (Codex 153, P6); sonst
-- bleibt er. Der Ort einer Erlegung bleibt fuer jeden lesbar, der sie sieht (wie
-- der GPS-Ort einer Eigenmeldung).
-- OFFEN, benannt (Schlusslesung 153, B1; CN-499, vor dem TestFlight-Build von
-- Block ②): Massstab ist die Stand-ZEILE, nicht das OBJEKT. `map_objects` folgt
-- `objekt_in_sicht` (bei `alles`/`umkreis`: `jagd_ist_offen`, also erst am
-- Jagdtag). Zwischen Freigabe und Jagdtag sieht ein Gruppenleiter die Zuteilung,
-- die Karte zeigt ihm das Objekt aber noch nicht -- der Fremdeintrag gibt ihm
-- dessen Koordinate trotzdem (Probe Q23). 153 verengt gegenueber 152 trotzdem nur.
--
--
-- AKTIVE FALLEN
--
-- - `stand_zeile_in_sicht` liest `auth.uid()`: in beiden Aufrufern ist das der
--   Aufrufer (Trigger im Client-Request, RPC). Ein Server-Weg ohne Claim bekaeme
--   keinen Stand-Ort -- er erreicht den Fremdeintrag aber ohnehin nicht
--   (`kontroll_stufe` ist dann null).
-- - EXECUTE auf `stand_zeile_in_sicht` hat nur `postgres`. Die Hilfsfunktionen
--   sind INVOKER und laufen nur im DEFINER-Kontext ihrer Aufrufer (Eigentuemer
--   `postgres`). Wer sie aus einer INVOKER-Stelle ruft, bekommt 42501.
-- - Wer die Sichtregel aendert (141, 146: `stand_zeile_in_sicht`,
--   `sicht_stufe`, `staende_offen`), aendert damit auch den Ort am Fremdeintrag.
--   Das ist die gewollte Kopplung -- sie steht hier, damit sie nicht still ist.
-- - `create or replace` behaelt Eigentuemer, EXECUTE (nur `postgres`) und
--   Kommentar (keiner); INVOKER, STABLE und `search_path` stehen ausdruecklich im
--   Rumpf.
--
-- Apply-Weg: `psql -X -v ON_ERROR_STOP=1 -c "set lock_timeout = '5s'" -f`,
-- Registrierung in `supabase_migrations.schema_migrations` von Hand (114, 117, 120).

begin;

-- a) ------------------------------------------------------------------------
create or replace function public.stand_ort_im_treiben(p_teilnahme uuid, p_treiben uuid)
  returns extensions.geometry
  language sql
  stable
  security invoker
  set search_path to 'public', 'extensions', 'pg_temp'
as $$
  select coalesce(
           o.position,
           case when s.id is not null and s.seat_id is null
                 and s.position_lat is not null and s.position_lng is not null
                then st_setsrid(st_makepoint(s.position_lng, s.position_lat), 4326)
           end)
    from public.hunt_drive_stands ds
    join public.hunt_drives dr on dr.id = ds.drive_id
    join public.hunts h on h.id = dr.hunt_id
    left join public.districts d on d.id = h.district_id
    left join public.hunt_seat_assignments s
           on s.id = ds.seat_assignment_id and s.hunt_id = dr.hunt_id
    left join public.map_objects o
           on o.id = coalesce(ds.map_object_id, s.seat_id)
          and o.district_id = h.district_id
          and o.deleted_at is null
          and (h.creator_id = d.owner_id
               or public.schein_deckt_objekt(h.creator_id, o.district_id, o.id, o.position))
   where ds.drive_id = p_treiben
     and ds.participant_id = p_teilnahme
     -- 153 (CN-498): nur ein Stand, den der Aufrufer sieht (Argumente wie
     -- `treiben_stand_in_sicht`).
     and public.stand_zeile_in_sicht(dr.hunt_id, ds.map_object_id,
                                     ds.seat_assignment_id, ds.participant_id, null);
$$;

-- b) ------------------------------------------------------------------------
create or replace function public.sitz_ort_der_jagd(p_teilnahme uuid)
  returns extensions.geometry
  language sql
  stable
  security invoker
  set search_path to 'public', 'extensions', 'pg_temp'
as $$
  select coalesce(
           o.position,
           case when s.seat_id is null
                 and s.position_lat is not null and s.position_lng is not null
                then st_setsrid(st_makepoint(s.position_lng, s.position_lat), 4326)
           end)
    from public.hunt_participants t
    join public.hunt_seat_assignments s
      on s.hunt_id = t.hunt_id and s.user_id = t.user_id
    join public.hunts h on h.id = t.hunt_id
    left join public.districts d on d.id = h.district_id
    left join public.map_objects o
           on o.id = s.seat_id
          and o.district_id = h.district_id
          and o.deleted_at is null
          and (h.creator_id = d.owner_id
               or public.schein_deckt_objekt(h.creator_id, o.district_id, o.id, o.position))
   where t.id = p_teilnahme
     -- 153 (CN-498): nur ein Sitz, den der Aufrufer sieht (Argumente wie der
     -- Fremd-Zweig von `sitz_in_sicht`).
     and public.stand_zeile_in_sicht(s.hunt_id, s.seat_id, s.id, null, s.user_id);
$$;

commit;

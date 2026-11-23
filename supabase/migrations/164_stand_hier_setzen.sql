-- 164: Selbst gesetzter Stand, Rauswurf ohne fremde Kaskade, Sparmodus-Merkmal,
--      Pause im Live-Fremdzweig (Migration A des Bauplans „Stand und Akku").
-- Bauplan: quickhunt-native/docs/konzepte/QuickHunt_Bauplan_Stand_und_Akku_V1.md
--          (FREIGEGEBEN 23.11.2026, Fassung 4; E1, E7, E9, E11).
-- Begruendung und Pruefkette: quickhunt-native/docs/migrationen/164_stand_hier_setzen.md
--
-- ANLASS (CN-578, Feedback #48, Braudel 21.11.2026): niemand eingeteilt, die
-- Leitung hatte vier Ad-hoc-Staende gesetzt, die keiner nutzte. Ein Schuetze
-- ohne Stand soll sagen koennen „ich stehe hier". Dazu CN-579/CN-580
-- (Stromsparmodus): ein Merkmal, das andere sehen, und keine Abend-Push an
-- jemanden, der die Ortung bewusst sparsam faehrt.
--
-- INHALT
--   1. hunt_seat_assignments: gesetzt_von, auftrag_id, auftrag_am, anker_lat,
--      anker_lng, anker_am. „Eigener Selbststand" = gesetzt_von = user_id = ich.
--      gesetzt_von OHNE Fremdschluessel (PGRST201, 154 — zweiter FK auf profiles
--      neben user_id braeche jede Einbettung).
--   2. stand_hier_setzen(p_auftrag, p_hunt, p_lat, p_lng, p_gesendet_am) —
--      DEFINER, der einzige Schreibweg eines Schuetzen auf eine Sitzzeile.
--   3. treiben_stand_umsetzen, stand_umsetzen: derselbe Advisory-Lock wie
--      stand_einteilen (163) am Anfang (Codex R3 DB-2). Sonst unveraendert.
--   4. teilnehmer_entfernen (128): Sitzzeilen des Entfernten, auf die ein
--      Treiben-Stand oder ein fremder Bezug zeigt, werden freigemacht statt
--      geloescht — sonst nimmt ON DELETE CASCADE fremde Einteilungen und
--      fremde Bezuege mit (Codex DB-14/S9, R2 DB-5).
--   5. hunt_participants.sparmodus_seit + sparmodus_melden(p_hunt, p_an).
--   6. ortung_tagesende_beanspruchen (145): keine Abend-Push im Sparmodus.
--   7. live_sichtbare_teilnahmen: im FREMDzweig ortung_pausiert_seit is null
--      (heute nur im Client; ein Zweitgeraet koennte den Punkt eines
--      Abgemeldeten neu schreiben — Codex DB-8). NICHT in
--      weg_sichtbare_teilnahmen und NICHT in der Bezug-Sicht (E9).
--   8. steht_am_stand (141): beim Hundefuehrer zaehlt ein selbst gesetzter
--      Stand nicht (Schlusslesung B1, entschieden Moritz 23.11.2026).
--   9. Trigger trg_stand_bezug_sperre: Advisory-Lock je Teilnahme vor jedem
--      Bezug-INSERT (Codex Runde 3 B1, Runde 4 B5). teilnehmer_entfernen nimmt
--      zusaetzlich den Jagd-Lock cn566 (Runde 3 B2).
--
-- ABWEICHUNG VOM BAUPLAN (benannt): E1-2 verwirft einen Auftrag mit
-- p_gesendet_am < gesetzt_am. gesetzt_am waere Serverzeit, p_gesendet_am
-- Geraetezeit — zwei Uhren. Gespeichert wird deshalb die Geraetezeit des
-- zuletzt angenommenen Auftrags, hoechstens die Serverzeit (auftrag_am), und
-- nur mit ihr verglichen — ueber alle Zeilen, die der Aufrufer in der Jagd
-- gesetzt hat (Codex 164 P4). Eine Spalte gesetzt_am gibt es nicht; niemand
-- laese sie. `veraltet` heisst fuer den Client: ueberholt, verwerfen — kein
-- Fehler fuer den Nutzer.
-- PREIS: Rauswurf (Zeilen geloescht) + erneuter Beitritt + spaet wiederholter
-- alter Auftrag legt wieder einen Stand an — ohne Zeile kein Vergleichsstempel
-- (Codex Delta 1). Eine dauerhafte Auftragstabelle waere dafuer ueberbaut; der
-- Postausgang des Clients haengt ohnehin an der Teilnahme.
--
-- SPERRREIHENFOLGE in stand_hier_setzen (E1-1): Teilnahme pruefen (ohne
-- Sperre — wer nicht beteiligt ist, sperrt niemanden, 163) → Advisory-Lock
-- cn566:<hunt> → Jagd FOR SHARE (haelt das Jagdende auf, bis wir fertig sind)
-- → eigene Teilnahme FOR NO KEY UPDATE (nicht FOR UPDATE: der eigene
-- Verlauf-Flush nimmt KEY SHARE ueber den FK von positions, 163) →
-- Bezug-Sperre der Teilnahme (Advisory `bezug:<teilnahme>`, dieselbe nimmt
-- der BEFORE-INSERT-Trigger aus Abschnitt 9; Codex 164 P3, Delta 3, Runde 3
-- B1, Schlusslesung B2) → eigene Sitzzeile FOR NO KEY UPDATE (FK-Pruefungen
-- von Bezuegen und Treiben-Verweisen warten nicht; beim Ersetzen wird es durch
-- `user_id = NULL` eine volle Sperre) → eigenen Bezug LOESCHEN und neu (nach
-- der Sitzsperre, Richtung der Kaskade Sitz → Bezug, Schlusslesung Delta F2).
-- PREIS: ein REINES UPDATE auf den eigenen Bezug (heute kein Client; die App
-- schreibt per Upsert) sperrt die Zeile ohne die Bezug-Sperre und kann mit der
-- RPC in einen Zyklus geraten (Codex Runde 4 B5) — einer bricht mit 40P01 ab,
-- betroffen ist nur dieselbe Teilnahme.
--
-- PREIS (benannt, Codex R4): ein fremdes Einchecken, das im selben Augenblick
-- laeuft, sieht „von anderen belegt" noch nicht und landet auf dem
-- verschobenen Stand; die GPS-Freigabe des Einchenden loest es beim naechsten
-- Fix. Bei `umkreis` legt der Schuetze den
-- Mittelpunkt seines Radius selbst — begrenzt durch den Anker (50 m frei,
-- weiter hoechstens alle 5 min). Die Leitung kann jede Sitzzeile und
-- sparmodus_seit wie heute direkt schreiben.
--
-- NUR BEI 0 LAUFENDEN JAGDEN APPLIZIEREN (E11): 3., 4., 6., 7., 8. ersetzen
-- Funktionen, die laufende Jagden rufen. Das Tor steht im Lauf-Skript und
-- zweimal im Apply (vor dem Rumpf, vor der Registrierung) — ohne Tabellen-
-- sperre auf hunts, die selbst Deadlocks mit Nutzer-Schreibvorgaengen baute
-- (Codex R4 B6/B7, Schlusslesung Delta F1).
-- PREISE des Apply (Codex R5): (a) zwischen zweitem Tor und COMMIT liegen zwei
-- Anweisungen; eine in diesen Millisekunden angelegte Einzeljagd
-- (legeEinzeljagdAn schreibt hunts allein) startet, ihre Teilnahme wartet auf
-- das DDL — ohne Schaden. (b) ALTER TABLE haelt ACCESS EXCLUSIVE auf
-- hunt_participants, CREATE TRIGGER braucht danach SHARE ROW EXCLUSIVE auf
-- hunt_stand_bezug: ein Bezug-Upsert dazwischen kann mit dem DDL einen Zyklus
-- bilden. Bezuege schreibt die App nur in laufenden Jagden (GPS und manuelles
-- Einchecken verlangen huntActive) — eine verspaetete Anfrage nach dem
-- Jagdende ist aber moeglich, Policy und Datenhelfer pruefen keinen
-- Jagdstatus (Codex R6 B11): das Tor macht den Fall selten, nicht unmoeglich.
-- Die umgekehrte Reihenfolge oeffnete dafuer einen Zyklus mit dem Rauswurf
-- (Teilnahme → Bezug), der auch in geplanten Jagden laeuft.
-- Tritt er doch ein, bricht eine Seite mit 40P01 ab; ist es das Apply, rollt
-- 164 vollstaendig zurueck.

begin;

-- 1. Spalten -----------------------------------------------------------------

alter table public.hunt_seat_assignments
  add column gesetzt_von uuid,
  add column auftrag_id  uuid,
  add column auftrag_am  timestamptz,
  add column anker_lat   double precision,
  add column anker_lng   double precision,
  add column anker_am    timestamptz;

comment on column public.hunt_seat_assignments.gesetzt_von is
  '164: Konto, das die Zeile per stand_hier_setzen angelegt hat. Ohne FK (PGRST201). Selbststand = gesetzt_von = user_id.';
comment on column public.hunt_seat_assignments.auftrag_id is
  '164: Kennung des zuletzt angenommenen Auftrags (Wiederholung liefert dasselbe Ergebnis).';
comment on column public.hunt_seat_assignments.auftrag_am is
  '164: Geraetezeit dieses Auftrags; ein aelterer wird verworfen.';
comment on column public.hunt_seat_assignments.anker_am is
  '164: Zeitpunkt des letzten Umzugs weiter als 50 m vom Anker (hoechstens alle 5 min).';

alter table public.hunt_participants
  add column sparmodus_seit timestamptz;

comment on column public.hunt_participants.sparmodus_seit is
  '164: Stromsparmodus an (CN-580). Gesetzt nur ueber sparmodus_melden; die Leitung kann die Spalte wie jede Teilnahmespalte schreiben.';

-- 2. stand_hier_setzen --------------------------------------------------------
--
-- Fehler (message, die App liest sie):
--   keine_teilnahme        42501  keine eigene joined-Teilnahme an dieser Jagd
--   koordinaten_ungueltig  22023  NULL, NaN, unendlich, ausserhalb des Bereichs
--   auftrag_ungueltig      22023  p_auftrag oder p_gesendet_am NULL, p_gesendet_am nicht endlich
--   beendet                P0001  Jagd nicht `active` (geplant, pausiert, beendet, gesichert)
--   keine_gruppenjagd      P0001  Einzeljagd
--   nicht_schuetze         P0001  Rolle nicht schuetze, oder Tag hundefuehrer
--   eingeteilt             P0001  wirksamer Stand vorhanden, der nicht der eigene Selbststand ist
--                                  (auch: im selben Augenblick von der Leitung zugewiesen, 23505)
--   veraltet               P0001  p_gesendet_am aelter als der juengste angenommene Auftrag (ueberholt)
--   zu_oft                 P0001  Umzug weiter als 50 m vom Anker binnen 5 min
--
-- Rueckgabe: eine Zeile (sitz_id, sitz_name, art), art in
--   neu | umgewandelt | verschoben | ersetzt | wiederholt.

create function public.stand_hier_setzen(
  p_auftrag     uuid,
  p_hunt        uuid,
  p_lat         double precision,
  p_lng         double precision,
  p_gesendet_am timestamptz
)
returns table (sitz_id uuid, sitz_name text, art text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_ich        uuid := auth.uid();
  v_status     public.hunt_status;
  v_kind       text;
  v_gesichert  timestamptz;
  v_teilnahme  uuid;
  v_rolle      text;
  v_tags       text[];
  v_treiben    uuid;
  v_alt        public.hunt_seat_assignments%rowtype;
  v_hat_alt    boolean := false;
  v_eigen      boolean;  -- eigene Zeile ist mein Selbststand
  v_belegt     boolean;
  v_ort        geography;
  v_anker_lat  double precision;
  v_anker_lng  double precision;
  v_anker_am   timestamptz;
  v_name       text;
  v_id         uuid;
  v_art        text;
  v_stempel    timestamptz;
  v_constraint text;
begin
  -- auth.uid() NULL faellt unten durch die Teilnahme-Pruefung (keine_teilnahme).
  if p_auftrag is null or p_gesendet_am is null or not isfinite(p_gesendet_am) then
    raise exception 'auftrag_ungueltig' using errcode = '22023';
  end if;
  v_stempel := least(p_gesendet_am, now());  -- nie in der Zukunft speichern (s. veraltet)
  -- NaN faellt durch `between` (NaN ist in Postgres groesser als jede Zahl),
  -- ebenso +-Infinity.
  if p_lat is null or p_lng is null
     or not (p_lat between -90 and 90) or not (p_lng between -180 and 180) then
    raise exception 'koordinaten_ungueltig' using errcode = '22023';
  end if;

  -- Erst beteiligt, dann sperren (163, Bauregel 152).
  if not exists (select 1 from public.hunt_participants hp
                  where hp.hunt_id = p_hunt and hp.user_id = v_ich
                    and hp.status = 'joined' and hp.entfernt_am is null) then
    raise exception 'keine_teilnahme' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('cn566:' || p_hunt::text, 0));

  -- E1-2 Wiederholung: irgendeine Sitzzeile der Jagd traegt diesen Auftrag —
  -- auch nach einer Uebernahme durch die Leitung. Nichts schreiben.
  select s.id, s.seat_name into v_id, v_name
    from public.hunt_seat_assignments s
   where s.hunt_id = p_hunt
     and s.auftrag_id = p_auftrag
     and s.gesetzt_von = v_ich;
  if found then
    return query select v_id, v_name, 'wiederholt'::text;
    return;
  end if;

  -- E1-2 aelterer Auftrag (Codex 164 P4): verglichen mit dem juengsten Auftrag
  -- ueber ALLE Zeilen, die ich in dieser Jagd gesetzt habe — auch eine
  -- ersetzte oder von der Leitung uebernommene. Sonst legte ein spaet
  -- wiederholter alter Auftrag nach einer Uebernahme einen neuen Stand an.
  -- Gespeichert wird hoechstens die Serverzeit (v_stempel, s. unten): ein
  -- Stempel aus der Zukunft (vorgehende Geraeteuhr) blockierte sonst nach der
  -- Uhrkorrektur jeden Auftrag (Codex 164 S9, Delta 5, Schlusslesung B4).
  -- Preis: auf einem Geraet, dessen Uhr vorgeht, gibt es keinen Schutz gegen
  -- Reihenfolge-Vertauschung.
  if p_gesendet_am < (select max(s.auftrag_am)
                        from public.hunt_seat_assignments s
                       where s.hunt_id = p_hunt
                         and s.gesetzt_von = v_ich) then
    raise exception 'veraltet' using errcode = 'P0001';
  end if;

  select h.status, h.kind::text, h.gesichert_am
    into v_status, v_kind, v_gesichert
    from public.hunts h
   where h.id = p_hunt
     for share;
  if v_status is distinct from 'active' or v_gesichert is not null then
    raise exception 'beendet' using errcode = 'P0001';
  end if;
  if v_kind is distinct from 'group' then
    raise exception 'keine_gruppenjagd' using errcode = 'P0001';
  end if;

  select hp.id, hp.role::text, coalesce(hp.tags, '{}')
    into v_teilnahme, v_rolle, v_tags
    from public.hunt_participants hp
   where hp.hunt_id = p_hunt and hp.user_id = v_ich
     and hp.status = 'joined' and hp.entfernt_am is null
     for no key update;
  if not found then
    raise exception 'keine_teilnahme' using errcode = '42501';
  end if;
  if v_rolle is distinct from 'schuetze' or 'hundefuehrer' = any (v_tags) then
    raise exception 'nicht_schuetze' using errcode = 'P0001';
  end if;

  -- Bezug-Sperre der eigenen Teilnahme, BEVOR eine Sitzzeile gesperrt wird
  -- (Codex 164 P3, Delta 3, Runde 3 B1, Schlusslesung B2). Jeder Upsert des
  -- eigenen Geraets nimmt dieselbe Sperre im BEFORE-INSERT-Trigger (Abschnitt
  -- 9) — also bevor er Zeile, Primaerschluessel oder FK-Sperren haelt — und
  -- wartet auf uns; wir warten nie auf ihn. Das Bezug-DELETE selbst steht am
  -- Ende, NACH der Sitzsperre: in derselben Richtung wie die Kaskade
  -- Sitz → Bezug, wenn die Leitung den Stand loescht (Schlusslesung Delta F2;
  -- vorgezogen ergab es mit diesem Loeschen einen Zyklus).
  perform pg_advisory_xact_lock(hashtextextended('bezug:' || v_teilnahme::text, 0));

  -- E1-4 Wirksamer Stand wie der Client (assignment.ts: treibenInKraft,
  -- effectiveStand, buildHuntSeating).
  -- (a) Treiben in Kraft: das laufende; laeuft keins und gibt es genau eins,
  --     das noch geplant ist, dann dieses.
  select d.id into v_treiben
    from public.hunt_drives d
   where d.hunt_id = p_hunt and d.status = 'active'
   limit 1;
  if v_treiben is null
     and (select count(*) from public.hunt_drives d where d.hunt_id = p_hunt) = 1 then
    select d.id into v_treiben
      from public.hunt_drives d
     where d.hunt_id = p_hunt and d.status = 'pending';
  end if;
  if v_treiben is not null and exists (
       select 1 from public.hunt_drive_stands ds
        where ds.drive_id = v_treiben and ds.participant_id = v_teilnahme) then
    raise exception 'eingeteilt' using errcode = 'P0001';
  end if;

  -- (b) Eigene Sitzzeile. UNIQUE (hunt_id, user_id): hoechstens eine.
  -- FOR NO KEY UPDATE, nicht FOR UPDATE (Codex 164 P3): FK-Pruefungen (KEY
  -- SHARE) von Bezuegen UND Treiben-Verweisen warten nicht auf uns; andere
  -- Schreiber der Zeile schon. Beim Ersetzen hebt `user_id = NULL` die Sperre
  -- auf eine volle (UNIQUE-Spalte) — der Zyklus mit dem eigenen Bezug ist
  -- trotzdem zu, weil jeder Bezug-INSERT dieser Teilnahme an der Bezug-Sperre
  -- oben wartet, bevor er etwas haelt (Schlusslesung Delta 2, F3).
  select s.* into v_alt
    from public.hunt_seat_assignments s
   where s.hunt_id = p_hunt and s.user_id = v_ich
     for no key update;
  v_hat_alt := found;
  -- Mein Selbststand: von mir gesetzt UND noch ein Ad-hoc-Stand ohne Objekt
  -- (hat die Leitung die Zeile auf ein Kartenobjekt umgestellt, ist es ihre).
  -- `is not distinct from`, nicht `=`: bei gesetzt_von NULL (Leitungszeile)
  -- muss v_eigen false sein, nicht NULL — sonst faellt `not v_eigen` unten aus.
  v_eigen := v_hat_alt and v_alt.gesetzt_von is not distinct from v_ich
             and v_alt.seat_type = 'adhoc' and v_alt.seat_id is null;

  if v_hat_alt
     and not v_eigen
     and ((v_alt.seat_type = 'assigned' and v_alt.seat_id is not null)
          or (v_alt.seat_type = 'adhoc'
              and v_alt.position_lat is not null and v_alt.position_lng is not null)) then
    -- Zaehlt (positiv wie buildHuntSeating) und ist nicht mein Selbststand.
    raise exception 'eingeteilt' using errcode = 'P0001';
  end if;

  v_ort := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;

  -- Anker (E1-6): ein Umzug weiter als 50 m vom Anker hoechstens alle 5 min.
  -- Gilt fuer Verschieben UND Ersetzen, damit eine Fremdbelegung den Riegel
  -- nicht umgeht. Ohne eigenen Selbststand: neuer Anker.
  v_anker_lat := p_lat;
  v_anker_lng := p_lng;
  v_anker_am  := now();
  if v_eigen
     and v_alt.anker_lat is not null and v_alt.anker_lng is not null then
    if st_distance(v_ort,
                   st_setsrid(st_makepoint(v_alt.anker_lng, v_alt.anker_lat), 4326)::geography)
       > 50 then
      if v_alt.anker_am is not null and v_alt.anker_am > now() - interval '5 minutes' then
        raise exception 'zu_oft' using errcode = 'P0001';
      end if;
    else
      v_anker_lat := v_alt.anker_lat;
      v_anker_lng := v_alt.anker_lng;
      v_anker_am  := v_alt.anker_am;
    end if;
  end if;

  if v_eigen then
    -- E1-6 Eigener Selbststand: von anderen belegt? Eine Einteilung in
    -- IRGENDEINEM Treiben mit fremder Teilnahme oder ein fremder Bezug.
    v_belegt := exists (select 1 from public.hunt_drive_stands ds
                         where ds.seat_assignment_id = v_alt.id
                           and ds.participant_id is not null
                           and ds.participant_id <> v_teilnahme)
             or exists (select 1 from public.hunt_stand_bezug b
                         where b.seat_assignment_id = v_alt.id
                           and b.participant_id <> v_teilnahme);
    if v_belegt then
      -- Freimachen: bleibt als Stand stehen, ist aber nicht mehr meiner.
      update public.hunt_seat_assignments set user_id = null where id = v_alt.id;
      v_art := 'ersetzt';
    else
      update public.hunt_seat_assignments
         set position_lat = p_lat, position_lng = p_lng,
             auftrag_id = p_auftrag, auftrag_am = v_stempel,
             anker_lat = v_anker_lat, anker_lng = v_anker_lng, anker_am = v_anker_am
       where id = v_alt.id;
      v_id   := v_alt.id;
      v_name := v_alt.seat_name;
      v_art  := 'verschoben';
    end if;
  end if;

  if v_id is null then
    -- E1-7 Name „Stand N" ueber alle Sitzzeilen der Jagd, unter dem Lock.
    -- Doppelte Namen mit dem Leitungs-Client/PWA (ohne Lock) sind hingenommen.
    select 'Stand ' || (coalesce(max(substring(s.seat_name from '^Stand ([0-9]{1,4})$')::int), 0) + 1)
      into v_name
      from public.hunt_seat_assignments s
     where s.hunt_id = p_hunt
       and s.seat_name ~ '^Stand [0-9]{1,4}$';

    if v_hat_alt and v_art is null then
      -- E1-5 Eigene Zeile, die nicht zaehlt (free_pos, adhoc ohne Ort,
      -- assigned ohne seat_id): umwandeln statt anlegen (sonst 23505 an
      -- UNIQUE (hunt_id, user_id)).
      update public.hunt_seat_assignments
         set seat_type = 'adhoc', seat_id = null, seat_name = v_name,
             position_lat = p_lat, position_lng = p_lng,
             gesetzt_von = v_ich, auftrag_id = p_auftrag, auftrag_am = v_stempel,
             anker_lat = v_anker_lat, anker_lng = v_anker_lng, anker_am = v_anker_am
       where id = v_alt.id;
      v_id  := v_alt.id;
      v_art := 'umgewandelt';
    else
      -- Codex 164 P5: die Leitung (PWA, ohne Advisory-Lock) kann mich im selben
      -- Augenblick einem Sitz zuweisen — dann trifft das INSERT UNIQUE
      -- (hunt_id, user_id). Das ist „eingeteilt", kein Serverfehler.
      begin
        insert into public.hunt_seat_assignments
          (hunt_id, user_id, seat_id, seat_type, seat_name, position_lat, position_lng,
           gesetzt_von, auftrag_id, auftrag_am, anker_lat, anker_lng, anker_am)
        values
          (p_hunt, v_ich, null, 'adhoc', v_name, p_lat, p_lng,
           v_ich, p_auftrag, v_stempel, v_anker_lat, v_anker_lng, v_anker_am)
        returning id into v_id;
      exception when unique_violation then
        -- Nur dieser Schluessel ist „eingeteilt" (Codex Delta 2); alles andere laut.
        get stacked diagnostics v_constraint = constraint_name;
        if v_constraint = 'hunt_seat_assignments_hunt_id_user_id_key' then
          raise exception 'eingeteilt' using errcode = 'P0001';
        end if;
        raise;
      end;
      v_art := coalesce(v_art, 'neu');
    end if;
  end if;

  -- E1-8 Bezug: loeschen, dann neu (DELETE + INSERT, damit jedes Geraet ein
  -- Ereignis bekommt — das DELETE geht ungefiltert an alle). Ein 23505 durch
  -- einen gleichzeitigen Upsert des eigenen Geraets (Schlusslesung B3) gibt es
  -- nicht mehr: der wartet an der Bezug-Sperre oben.
  delete from public.hunt_stand_bezug where participant_id = v_teilnahme;
  insert into public.hunt_stand_bezug (participant_id, hunt_id, seat_assignment_id, source, since)
  values (v_teilnahme, p_hunt, v_id, 'manual', now());

  return query select v_id, v_name, v_art;
end;
$$;

revoke all on function public.stand_hier_setzen(uuid, uuid, double precision, double precision, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.stand_hier_setzen(uuid, uuid, double precision, double precision, timestamptz)
  to authenticated;

-- 3. Derselbe Advisory-Lock in den beiden Umsetz-Funktionen ------------------
--    (INVOKER wie bisher; die Jagd-id kommt aus der Zeile, die der Aufrufer
--    ohnehin sehen muss. Sieht er sie nicht, bleibt die bisherige Meldung.)

create or replace function public.treiben_stand_umsetzen(p_stand uuid, p_teilnahme uuid)
 returns void
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_treiben uuid;
  v_hunt    uuid;
  v_n       integer;
begin
  select ds.drive_id, d.hunt_id into v_treiben, v_hunt
    from public.hunt_drive_stands ds
    join public.hunt_drives d on d.id = ds.drive_id
   where ds.id = p_stand;
  if v_treiben is null then
    raise exception 'Stand existiert nicht mehr' using errcode = 'P0002';
  end if;
  -- 164: derselbe Schluessel wie stand_einteilen (163) und stand_hier_setzen.
  perform pg_advisory_xact_lock(hashtextextended('cn566:' || v_hunt::text, 0));
  if p_teilnahme is not null then
    update public.hunt_drive_stands
       set participant_id = null
     where drive_id = v_treiben
       and participant_id = p_teilnahme
       and id <> p_stand;
  end if;
  update public.hunt_drive_stands
     set participant_id = p_teilnahme
   where id = p_stand;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'Stand nicht umgesetzt' using errcode = '42501';
  end if;
end;
$function$;

create or replace function public.stand_umsetzen(p_sitz uuid, p_nutzer uuid)
 returns void
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_hunt uuid;
  v_n    integer;
begin
  select s.hunt_id into v_hunt
    from public.hunt_seat_assignments s
   where s.id = p_sitz;
  if v_hunt is null then
    raise exception 'Stand existiert nicht mehr' using errcode = 'P0002';
  end if;
  -- 164: derselbe Schluessel wie stand_einteilen (163) und stand_hier_setzen.
  perform pg_advisory_xact_lock(hashtextextended('cn566:' || v_hunt::text, 0));
  if p_nutzer is not null then
    update public.hunt_seat_assignments
       set user_id = null
     where hunt_id = v_hunt
       and user_id = p_nutzer
       and id <> p_sitz;
  end if;
  update public.hunt_seat_assignments
     set user_id = p_nutzer
   where id = p_sitz;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'Stand nicht umgesetzt' using errcode = '42501';
  end if;
end;
$function$;

-- 4. Rauswurf ohne fremde Kaskade --------------------------------------------

create or replace function public.teilnehmer_entfernen(p_participant_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_hunt     uuid;
  v_ziel     uuid;
  v_creator  uuid;
  betroffen  int;
  v_sitze    uuid[];
begin
  select hp.hunt_id, hp.user_id, h.creator_id
    into v_hunt, v_ziel, v_creator
    from hunt_participants hp
    left join hunts h on h.id = hp.hunt_id
   where hp.id = p_participant_id;

  if v_hunt is null then
    raise exception 'Teilnehmerzeile nicht gefunden' using errcode = '42704';
  end if;

  if not (
    v_creator = auth.uid()
    or exists (
      select 1 from hunt_participants p
       where p.hunt_id = v_hunt
         and p.user_id = auth.uid()
         and p.status  = 'joined'
         and p.role    = 'jagdleiter'
    )
  ) then
    raise exception 'Nur der Ersteller oder ein Jagdleiter dieser Jagd darf entfernen'
      using errcode = '42501';
  end if;

  if v_ziel = auth.uid() then
    raise exception 'Nutze "Jagd verlassen", um selbst auszutreten'
      using errcode = '22023';
  end if;

  if v_ziel = v_creator then
    raise exception 'Der Ersteller der Jagd kann nicht entfernt werden'
      using errcode = '22023';
  end if;

  -- 164: derselbe Jagd-Lock wie stand_einteilen (163) und stand_hier_setzen
  -- (Codex Runde 3 B2): sonst Zyklus — der Rauswurf haelt die Treiben-Zeile
  -- des Entfernten und wartet auf dessen Sitz, stand_einteilen haelt KEY SHARE
  -- auf dem Sitz (neuer Treiben-Stand) und wartet auf die Treiben-Zeile.
  perform pg_advisory_xact_lock(hashtextextended('cn566:' || v_hunt::text, 0));
  -- 164: die Bezug-Sperre des Entfernten, VOR jeder Zeilensperre (Codex R6 B10,
  -- R7 B12): sonst haelt ein gleichzeitiger Upsert seines Geraets (Bezug T → S)
  -- die Bezugszeile und wartet am FK auf den unten gesperrten Sitz S, waehrend
  -- wir beim Bezug-DELETE auf ihn warten — bzw. mit einem gleichzeitigen
  -- Jagd-DELETE ein Dreierzyklus ueber die Teilnahme. Mit der Sperre wartet
  -- sein Upsert schon im BEFORE-INSERT-Trigger, bevor er etwas haelt; halten
  -- wir sie zuerst, warten wir auf ihn, solange wir selbst nichts halten.
  perform pg_advisory_xact_lock(hashtextextended('bezug:' || p_participant_id::text, 0));

  update hunt_participants
     set status      = 'left',
         entfernt_am = now(),
         left_at     = coalesce(left_at, now())
   where id = p_participant_id;

  get diagnostics betroffen = row_count;
  if betroffen = 0 then
    raise exception 'Teilnehmer konnte nicht entfernt werden';
  end if;

  -- 164: die Sitzzeilen des Entfernten ZUERST sperren — vor Bezug und
  -- Treiben-Staenden, in Richtung der Kaskade Sitz → Bezug/Treiben-Stand
  -- (Codex Runde 5 B8, Bestand): sonst Zyklus mit einem gleichzeitigen
  -- Leitungs-DELETE des Sitzes (`seats.ts`, PWA), das den Sitz haelt und in
  -- der Kaskade auf die hier schon gesperrte Bezug- bzw. Treiben-Zeile wartet.
  -- Erst sperren, dann pruefen (Codex 164 P6): sonst entsteht zwischen Pruefen
  -- und DELETE ein fremder Bezug, und die Kaskade nimmt ihn doch mit. Mit der
  -- Sperre wartet dessen FK-Pruefung und scheitert danach laut. Geloescht und
  -- freigemacht wird unten NUR, was hier gesperrt ist (Codex Delta 4,
  -- Schlusslesung B5): weist die Leitung den Entfernten im selben Augenblick
  -- einem fremd belegten Sitz zu, bleibt diese Zeile unberuehrt stehen statt
  -- mit Kaskade zu verschwinden (Preis: sie zeigt auf eine entfernte Teilnahme).
  v_sitze := array(select s.id from hunt_seat_assignments s
                    where s.hunt_id = v_hunt and s.user_id = v_ziel
                      for update);

  delete from positions_current where participant_id = p_participant_id;
  delete from hunt_stand_bezug  where participant_id = p_participant_id;

  update hunt_drive_stands
     set participant_id = null
   where participant_id = p_participant_id
     and drive_id in (
       select d.id from hunt_drives d
        where d.hunt_id = v_hunt
          and d.status <> 'completed'
     );

  -- 164: Sitzzeilen (oben gesperrt), auf die IRGENDEIN Treiben-Stand (auch in
  -- einem beendeten Treiben, das oben bewusst stehen bleibt) oder noch ein
  -- Bezug zeigt, werden freigemacht statt geloescht — ON DELETE CASCADE naehme
  -- sonst fremde Einteilungen und Bezuege mit. Der eigene Bezug ist oben weg;
  -- ein noch vorhandener ist praktisch fremd (Preis, Schlusslesung H4: hat der
  -- Entfernte selbst im selben Augenblick neu eingecheckt, bleibt sein Sitz
  -- mit diesem Bezug freigemacht stehen bis zum Jagdende — sichere Richtung).
  delete from hunt_seat_assignments s
   where s.id = any (v_sitze)
     and not exists (select 1 from hunt_drive_stands ds where ds.seat_assignment_id = s.id)
     and not exists (select 1 from hunt_stand_bezug b where b.seat_assignment_id = s.id);

  update hunt_seat_assignments
     set user_id = null
   where id = any (v_sitze)
     and user_id = v_ziel;

  delete from chat_group_members
   where user_id = v_ziel
     and group_id in (select g.id from chat_groups g where g.hunt_id = v_hunt);
end;
$function$;

-- 5. sparmodus_melden ---------------------------------------------------------
--    Nur die eigene joined-Teilnahme. An: erster Zeitpunkt bleibt stehen.
--    Rueckgabe: der Wert danach (NULL = aus).

create function public.sparmodus_melden(p_hunt uuid, p_an boolean)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_wert timestamptz;
begin
  if p_an is null then
    raise exception 'auftrag_ungueltig' using errcode = '22023';
  end if;
  update public.hunt_participants hp
     set sparmodus_seit = case when p_an then coalesce(hp.sparmodus_seit, now()) end
   where hp.hunt_id = p_hunt
     and hp.user_id = auth.uid()
     and hp.status = 'joined'
     and hp.entfernt_am is null
  returning hp.sparmodus_seit into v_wert;
  if not found then
    raise exception 'keine_teilnahme' using errcode = '42501';
  end if;
  return v_wert;
end;
$$;

revoke all on function public.sparmodus_melden(uuid, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.sparmodus_melden(uuid, boolean) to authenticated;

-- 6. Keine Abend-Push im Sparmodus (145) --------------------------------------
--    CREATE OR REPLACE behaelt die Rechte (nur service_role).

create or replace function public.ortung_tagesende_beanspruchen(p_jetzt timestamp with time zone default now())
 returns table(user_id uuid, hunt_id uuid, jagdname text, tagesende timestamp with time zone)
 language sql
 set search_path to 'public', 'pg_temp'
as $function$
  -- ⚠ Jede Teilnahme-Bedingung steht in DIESEM WHERE (s. Kopf von 145, "WARUM `E`
  -- IN EINEM LATERAL STEHT").
  update public.hunt_participants hp
     set ortung_tagesende_erinnert_fuer = x.e
    from public.hunts h
   cross join lateral (
     select public.ortung_faelliges_tagesende(
              h.jagdzeiten, p_jetzt - interval '30 minutes') as e
   ) x
   where hp.hunt_id = h.id
     and h.status = 'active'
     and h.jagdzeiten is not null
     and hp.status = 'joined'
     and hp.user_id is not null
     and hp.ortung_pausiert_seit is null
     and hp.sparmodus_seit is null          -- 164 (E7)
     and hp.position_consent is distinct from 'none'
     and x.e > p_jetzt - interval '60 minutes'
     and x.e > greatest(h.started_at, hp.joined_at)
     and exists (select 1
                   from public.positions_current pc
                  where pc.participant_id = hp.id
                    and pc.updated_at >= x.e - interval '24 hours')
     and (hp.ortung_tagesende_erinnert_fuer is null
          or hp.ortung_tagesende_erinnert_fuer < x.e)
  returning hp.user_id, hp.hunt_id, h.name, hp.ortung_tagesende_erinnert_fuer;
$function$;

-- 7. Pause im Live-Fremdzweig (E9) ---------------------------------------------

create or replace function public.live_sichtbare_teilnahmen()
 returns setof uuid
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select hp.id
    from hunt_participants hp
   where hp.user_id = auth.uid()
  union
  select hp.id
    from hunt_participants hp
    join hunts h on h.id = hp.hunt_id
   where hp.hunt_id in (select m.hunt_id from hunt_participants m
                         where m.user_id = auth.uid() and m.status = 'joined')
     and hp.position_consent is distinct from 'none'
     and hp.ortung_pausiert_seit is null      -- 164 (E9, Codex DB-8)
     and h.status in ('active', 'paused')
     and public.teilnahme_in_sicht(hp.id)
$function$;

-- 8. Hundefuehrer: ein selbst gesetzter Stand zaehlt nicht als „am Stand" ----
--    (Schlusslesung B1, entschieden Moritz 23.11.2026: „Selbststand zaehlt
--    nicht"). Gibt die Leitung einem Schuetzen mit Selbststand spaeter das Tag
--    `hundefuehrer`, galt er sonst dauerhaft als am Stand — bei `umkreis`/
--    `eigener` verschwand sein Punkt fuer die anderen, obwohl er mit dem Hund
--    unterwegs ist, und den Stand kann er selbst nicht aufgeben. Es zaehlen
--    weiter: Kartenobjekte, Sitze, die die Leitung angelegt hat, und ein
--    Selbststand, auf den ein Treiben ihn ausdruecklich einteilt. Ein Bezug
--    (eingecheckt) zaehlt wie bisher immer. CREATE OR REPLACE behaelt die
--    Rechte (nur postgres; Aufrufer teilnahme_in_sicht, DEFINER).

create or replace function public.steht_am_stand(p_teilnahme uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  select coalesce((
    select exists (select 1 from public.hunt_stand_bezug b
                    where b.participant_id = t.id and b.hunt_id = t.hunt_id)
        or (coalesce('hundefuehrer' = any (t.tags), false)
            and exists (select 1 from public.staende_der_teilnahme(t.id) e
                         where e.objekt_id is not null
                            or exists (select 1 from public.hunt_drive_stands ds
                                        where ds.seat_assignment_id = e.sitz_id
                                          and ds.participant_id = t.id)
                            or not exists (select 1 from public.hunt_seat_assignments s
                                            where s.id = e.sitz_id
                                              and s.gesetzt_von = t.user_id)))  -- 164 (B1)
      from public.hunt_participants t
     where t.id = p_teilnahme), false);
$function$;

-- 9. Bezug-Sperre je Teilnahme (Codex Runde 3 B1) ----------------------------
--    Jeder INSERT auf hunt_stand_bezug — auch der Upsert der App, dessen
--    BEFORE-INSERT-Trigger vor der Konfliktpruefung feuert — nimmt einen
--    Advisory-Lock je Teilnahme, BEVOR die Zeile (und ihr Primaerschluessel)
--    entsteht. NUR INSERT (Codex Runde 4 B5): bei einem UPDATE ist die Zeile
--    schon gesperrt, bevor ein BEFORE-UPDATE-Trigger feuert — die Sperre kaeme
--    dort zu spaet und baute selbst einen Zyklus.
--    stand_hier_setzen nimmt denselben vor jeder Sitzsperre — so wartet ein
--    gleichzeitiger Bezug-Upsert des eigenen Geraets immer auf die RPC, nie
--    umgekehrt. DELETE nimmt ihn nicht (Rauswurf, Jagd-/Treibenende raeumen
--    nur ab). Kostet je Bezug-Schreiben einen Advisory-Lock; Konflikte nur
--    innerhalb derselben Teilnahme. Kein weiterer BEFORE-Trigger auf der
--    Tabelle (Reihenfolge, 096). EXECUTE niemandem — geprueft wird es beim
--    CREATE TRIGGER, nicht beim Feuern (082).

create function public.stand_bezug_sperre()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('bezug:' || new.participant_id::text, 0));
  return new;
end;
$$;

revoke all on function public.stand_bezug_sperre()
  from public, anon, authenticated, service_role;

create trigger trg_stand_bezug_sperre
  before insert on public.hunt_stand_bezug
  for each row execute function public.stand_bezug_sperre();

commit;

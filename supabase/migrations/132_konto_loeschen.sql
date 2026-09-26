-- 132: Konto loeschen (CN-236), Datenbankteil.
--
-- ANLASS: seit CN-233 kann man nativ ein Konto anlegen. Apple 5.1.1(v)
-- verlangt dann, dass man es in der App auch loeschen kann. Bauplan (nach
-- F14 geprueft, Entscheidungen M1-M7 und E16 von Moritz, 26.09.2026):
-- quickhunt-native/docs/konzepte/QuickHunt_Bauplan_Konto_Loeschen_V1.md
-- Begruendung, Messungen und Pruefkette:
-- quickhunt-native/docs/migrationen/132_konto_loeschen.md
--
--
-- DIE GRUNDRICHTUNG IN EINEM SATZ (M1): die Anmeldung wird per GoTrue-
-- Soft-Delete unbrauchbar (Edge Function `konto-loeschen`, NICHT hier),
-- das Persoenliche geht per ausdruecklicher Liste weg, und `profiles`
-- bleibt als Grabstein mit dem Namen stehen — damit die Aufzeichnungen
-- ANDERER (Strecke, Jagdteilnahmen, Standpruefungen) ihren Namen behalten.
--
-- ⚠ Ein nacktes `auth.admin.deleteUser` ohne diese Liste loescht NICHTS
-- Persoenliches: der Soft-Delete laesst die Zeile in auth.users stehen, keine
-- einzige CASCADE auf auth.users feuert. Umgekehrt scheitert ein HARTES
-- Loeschen bei 10 von 12 Konten an der FK-Wand (Bauplan §1.1).
--
--
-- WAS DIESE DATEI ANLEGT
--
--   konto_loeschungen            Status je Konto (begonnen/abgeschlossen) und
--                                die EINMAL getroffene Foto-Wahl (M6).
--   jagd_hat_fremde_daten()      Helfer: haengt an dieser Jagd irgendetwas
--                                eines anderen Menschen?
--   konto_loeschung_pruefen()    die Vorbedingungen V1/V2, ohne etwas zu
--                                aendern — fuer den Aufruf VOR dem Passwort.
--   konto_loeschen()             die Loeschliste (Bauplan §3), eine
--                                Transaktion, idempotent.
--   konto_loeschung_abschliessen()  Status "abgeschlossen", nur wenn GoTrue
--                                das Konto wirklich geloescht hat.
--   konto_namen()                bekommt `geloescht` (E13).
--
-- Der Ablauf DB -> Storage -> Auth liegt in der Edge Function; diese Datei
-- ist nur der erste Schritt. Die Status-Tabelle macht ihn fortsetzbar.
--
--
-- WER DARF WAS
--
-- Die drei Konto-Funktionen: EXECUTE NUR fuer `service_role`, namentlich
-- entzogen fuer PUBLIC, anon, authenticated (081-Regel: `from public`
-- allein entzieht bei Supabase nichts). `p_uid` kommt ausschliesslich aus
-- `auth.getUser(jwt)` in der Edge Function. **Koennte ein Client
-- `konto_loeschen` selbst rufen, loeschte er sein Persoenliches und behielte
-- ein anmeldefaehiges, leeres Konto** (E2) — oder, schlimmer, das eines
-- anderen, denn die Funktion nimmt die Kennung als Parameter.
-- Der Helfer `jagd_hat_fremde_daten`: EXECUTE fuer NIEMANDEN (er laeuft nur
-- innerhalb der Definer-Funktionen als deren Besitzer). Er ist ein Orakel
-- ueber fremde Jagden.
-- `pg_temp` am ENDE jedes search_path (076).
--
--
-- ⚠ FALLEN, DIE BEIM SCHREIBEN GEMESSEN WURDEN (26.09.2026)
--
-- 1. Kill-Spiegel NIE ueber `wild_events` loeschen. Eine Referential Action
--    auf `kills.wild_event_id` (SET NULL) feuert
--    `kills_wild_event_id_ist_server_sache` und wirft 42501 — die ganze
--    Transaktion faellt (123, aktive Falle 1). Deshalb ueberall
--    `type <> 'kill'`; der Spiegel geht mit seiner Erlegung
--    (`sync_wild_event_for_kill`, AFTER DELETE).
--    Abweichung vom Bauplan-Wortlaut §3/7 (`type = 'sighting'`): der Schutz
--    gilt dem Spiegel, und die anderen Typen (shot, miss, wounded, fallwild)
--    sind genauso privat wie ein Anblick. Heute 0 Zeilen dieser Typen.
-- 2. Eine Einzeljagd OHNE Revier ist nicht automatisch privat: eine darin
--    ueber einen Schein gemeldete Erlegung traegt `district_id` des
--    Scheinreviers und zaehlt in DESSEN Strecke (CN-234). Der Helfer zaehlt
--    sie als fremd; die Jagd bleibt dann stehen.
-- 3. `teilnehmer_entfernen()` (128) raeumt beim Austritt aus einer
--    laufenden Jagd vier Dinge mehr als den Status: Einlock-Zustand,
--    Standzuteilung offener Treiben, Sitzzuteilung, Jagdchat. Der Bauplan
--    §3/5 nannte nur den Status — ohne den Rest zeigte die Karte einen Stand
--    als besetzt durch jemanden, den es nicht mehr gibt. Hier nachgezogen,
--    ohne `entfernt_am` (das ist der Rauswurf durch den Jagdleiter) und OHNE
--    die Sitzzuteilung: `hunt_drive_stands.seat_assignment_id` ist CASCADE,
--    128 nimmt damit auch Staende abgeschlossener Treiben mit (Fremdpruefung
--    132, F6; in 128 vorbestehend, heute 0 Zeilen).
-- 4. `kontakt_feste_spalten` haelt `kontakte.profil_id` fest — aber nur fuer
--    `authenticated`/`anon`. Als Besitzer der Definer-Funktion (postgres)
--    darf §3/17 sie nullen.
-- 5. `hunts.cover_photo_id -> hunt_photos` ist SET NULL: das Loeschen einer
--    Fotozeile ist ein UPDATE auf `hunts`. Kein Trigger dort reagiert auf
--    diese Spalte (gelesen).
--
--
-- BEWUSST HINGENOMMEN UND BENANNT
--
-- E16 (Moritz, 26.09.2026: "ok hinnehmen und benennen"): ein Zweitgeraet
-- kann bis zum Ablauf seines Zugangstokens (<= 1 h) noch schreiben — private
-- Anblicke, Standpruefungen, den Grabstein wieder fuellen, ein Push-Abo.
-- PostgREST fragt auth.users nie. Positionen nicht mehr (Policies verlangen
-- `joined`, §3/5 setzt `left`).
-- E7: Gruppen des Geloeschten bleiben ohne Verwalter.
-- E10: der Name am Grabstein ist nicht eingefroren; `profiles_update_own`
-- erlaubt ihn per REST zu aendern, solange das Konto lebt.
-- Geplante EIGENE Jagden mit Gaesten bleiben als geplante Jagd eines
-- Geloeschten stehen (nur laufende werden beendet, M5).
--
--
-- ⚠ DIESE DATEI TRAEGT BEWUSST KEIN `\set ON_ERROR_STOP on` (120-Muster).
-- Ueber psql: `psql … -v ON_ERROR_STOP=1 -f 132_konto_loeschen.sql`, die
-- Registrierung dann von Hand nachtragen.
-- ⚠ GEZIELT APPLIZIEREN, nie ueber "alle ausstehenden" (115, T9).
--
-- ADDITIV bis auf `konto_namen()`: dort kommt eine Spalte HINTEN dazu
-- (drop + create, vorher `pg_depend` geprueft: keine Abhaengigen). Alle
-- Aufrufer beider Clients lesen die Spalten namentlich.

begin;

-- ---------------------------------------------------------------------------
-- 1. Status
-- ---------------------------------------------------------------------------

create table public.konto_loeschungen (
  user_id          uuid        primary key
                               references auth.users(id) on delete cascade,
  fotos_behalten   boolean     not null,
  begonnen_am      timestamptz not null default now(),
  abgeschlossen_am timestamptz
);

comment on table public.konto_loeschungen is
  'Konto-Loeschung (132, CN-236): eine Zeile je begonnener Loeschung. '
  'Geschrieben NUR von konto_loeschen()/konto_loeschung_abschliessen() '
  '(service_role). Bewusst NICHT in profiles: dort koennte der Nutzer den '
  'Status per profiles_update_own selbst setzen und das Aufraeumen '
  'ueberspringen (Fremdpruefung Bauplan, Codex 6).';

comment on column public.konto_loeschungen.fotos_behalten is
  'Die Wahl des Nutzers beim ERSTEN Aufruf (M6). Ein Wiederholungsaufruf '
  'nimmt diesen Wert, nicht seinen eigenen — "nach dem Loeschen laesst sich '
  'das nicht mehr aendern" (Text E5).';

comment on column public.konto_loeschungen.abgeschlossen_am is
  'Gesetzt, sobald GoTrue das Konto soft-geloescht hat (auth.users.deleted_at). '
  'NULL bei gesetztem begonnen_am = Teilausfall: das native Route-Gate fuehrt '
  'dann in "Loeschung abschliessen".';

alter table public.konto_loeschungen enable row level security;

-- Das Route-Gate liest den eigenen Status. Mehr nicht.
create policy konto_loeschungen_select_own on public.konto_loeschungen
  for select to authenticated
  using (user_id = auth.uid());

-- Keine Schreib-Policy; zusaetzlich die Rechte selbst (131-Muster: RLS deckt
-- TRUNCATE, REFERENCES und TRIGGER nicht ab).
revoke insert, update, delete, truncate, references, trigger
  on public.konto_loeschungen from anon, authenticated;


-- ---------------------------------------------------------------------------
-- 1b. Index fuer den Kaskadenpfad (Schlusslesung 132, F1)
-- ---------------------------------------------------------------------------
-- `delete from hunts` kaskadiert je Teilnehmerzeile
-- `delete from positions where participant_id = …` — ohne Index ein Seq
-- Scan ueber alle Positionen (gemessen 26.09.2026: 88.546 Zeilen, 27 MB,
-- ~10 ms je Teilnehmerzeile). Der RPC laeuft als service_role unter dem
-- 8-s-statement_timeout von `authenticator`; ein Konto mit vielen eigenen
-- Jagden liefe sonst in 57014 — und weil alles EINE Transaktion ist, bei
-- jeder Wiederholung wieder. Ohne `concurrently` (in einer Transaktion nicht
-- erlaubt): die Tabelle ist fuer den Bau kurz schreibgesperrt, bei dieser
-- Groesse ein Sekundenbruchteil.
create index positions_participant_id_idx on public.positions (participant_id);


-- ---------------------------------------------------------------------------
-- 2. Helfer: haengt an dieser Jagd etwas eines anderen?
-- ---------------------------------------------------------------------------
-- "Fremd" ist jede Zeile, die ein anderer Mensch angelegt hat oder die zu
-- einem anderen gehoert — jeder Status, auch Gastzeilen (user_id NULL).
-- Genutzt von V1 (Reviere) und von §3/4 (private Jagden): dieselbe Frage
-- zweimal, eine Antwort.

create function public.jagd_hat_fremde_daten(p_hunt uuid, p_uid uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select exists (select 1 from hunts h
                  where h.id = p_hunt and h.creator_id <> p_uid)
      or exists (select 1 from hunt_participants x
                  where x.hunt_id = p_hunt and x.user_id is distinct from p_uid)
      or exists (select 1 from kills x
                  where x.hunt_id = p_hunt and x.reporter_id <> p_uid)
      -- Falle 2 im Kopf: die Erlegung zaehlt in einem fremden Revier.
      or exists (select 1 from kills x join districts d on d.id = x.district_id
                  where x.hunt_id = p_hunt and d.owner_id <> p_uid)
      or exists (select 1 from wild_events x
                  where x.hunt_id = p_hunt and x.user_id <> p_uid)
      or exists (select 1 from messages x
                  where x.hunt_id = p_hunt and x.sender_id is distinct from p_uid)
      or exists (select 1 from chat_groups g
                  where g.hunt_id = p_hunt
                    and (g.created_by <> p_uid
                         or exists (select 1 from chat_group_members m
                                     where m.group_id = g.id and m.user_id <> p_uid)
                         or exists (select 1 from messages x
                                     where x.group_id = g.id
                                       and x.sender_id is distinct from p_uid)))
      or exists (select 1 from hunt_photos x
                  where x.hunt_id = p_hunt and x.uploaded_by <> p_uid)
      or exists (select 1 from jagdtag_notizen x
                  where x.hunt_id = p_hunt and x.besitzer_id <> p_uid)
      or exists (select 1 from hunt_seat_assignments x
                  where x.hunt_id = p_hunt and x.user_id is distinct from p_uid)
      -- NO ACTION auf hunts, heute 0 Zeilen: jede Zeile blockiert, egal von
      -- wem — ein Loeschen scheiterte sonst an 23503 statt mit Klartext.
      or exists (select 1 from tracking_requests x where x.hunt_id = p_hunt)
      or exists (select 1 from observations x where x.hunt_id = p_hunt)
      -- Ein Treiben dieser Jagd fuehrt einen Teilnehmer einer ANDEREN Jagd
      -- oder eines anderen Menschen (Fremdpruefung 132, F5). Das Schema
      -- verbietet es nicht; die CASCADE ueber hunt_drives naehme es mit.
      or exists (select 1 from hunt_drive_stands s
                   join hunt_drives dr on dr.id = s.drive_id
                   join hunt_participants x on x.id = s.participant_id
                  where dr.hunt_id = p_hunt
                    and (x.hunt_id <> p_hunt or x.user_id is distinct from p_uid))
      -- Wildbret-Rechnung zu einer Erlegung dieser Jagd: NO ACTION, und
      -- Rueckverfolgbarkeit (Fremdpruefung 132, F4). Heute 0 Zeilen.
      or exists (select 1 from game_meat_invoices g
                   join kills k on k.id = g.kill_id
                  where k.hunt_id = p_hunt);
$$;

comment on function public.jagd_hat_fremde_daten(uuid, uuid) is
  'Helfer der Konto-Loeschung (132): haengt an dieser Jagd irgendeine Zeile '
  'eines anderen Menschen? EXECUTE fuer NIEMANDEN — ein Orakel ueber fremde '
  'Jagden. Laeuft nur innerhalb der Definer-Funktionen als deren Besitzer.';

revoke execute on function public.jagd_hat_fremde_daten(uuid, uuid)
  from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 3. Vorbedingungen V1/V2 — aendert nichts
-- ---------------------------------------------------------------------------

create function public.konto_loeschung_pruefen(p_uid uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_reviere jsonb;
  v_chronik boolean;
begin
  if p_uid is null then
    raise exception 'konto_loeschung_pruefen: p_uid ist Pflicht';
  end if;

  -- V1: ein eigenes Revier, an dem irgendetwas eines anderen haengt. Die
  -- Aufzaehlung folgt den Fremdschluesseln auf `districts` (Bauplan §9/7:
  -- eine neue Referenz ohne Zeile hier ist ein Befund).
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name)
                            order by d.name), '[]'::jsonb)
    into v_reviere
    from districts d
   where d.owner_id = p_uid
     and (
          -- Scheine an andere, jeder Status, auch nicht eingeloeste
          -- (holder_id NULL): holder_name ist eine fremde Person.
          exists (select 1 from hunting_licenses l
                   where l.district_id = d.id and l.holder_id is distinct from p_uid)
       or exists (select 1 from hunts h
                   where h.district_id = d.id and jagd_hat_fremde_daten(h.id, p_uid))
       or exists (select 1 from kills k
                   where k.district_id = d.id and k.reporter_id <> p_uid)
       -- created_by NULL (Altbestand) zaehlt NICHT als fremd.
       or exists (select 1 from map_objects o
                   where o.district_id = d.id and o.created_by <> p_uid)
       or exists (select 1 from map_object_checks c
                    join map_objects o on o.id = c.map_object_id
                   where o.district_id = d.id and c.checked_by <> p_uid)
       or exists (select 1 from map_object_photos f
                    join map_objects o on o.id = f.map_object_id
                   where o.district_id = d.id and f.uploaded_by <> p_uid)
       or exists (select 1 from historische_strecken s
                   where s.district_id = d.id and s.besitzer_id <> p_uid)
       -- Kartenobjekte des Reviers, auf die etwas AUSSERHALB seiner Jagden
       -- zeigt (Fremdpruefung 132, F3): CASCADE naehme es mit (Treiben-
       -- Staende, Einlock-Zustand), SET NULL veraenderte es still (Stand
       -- eines Teilnehmers, Hochsitz einer Erlegung, Sitz).
       -- Eine EIGENE Jagd ohne Fremdes sperrt nicht (Schlusslesung 132, F3):
       -- nativ traegt eine Jagd `district_id` erst mit der ersten Erlegung,
       -- ein Revierinhaber stuende sonst vor seinem eigenen Revier.
       or exists (select 1 from map_objects o
                   where o.district_id = d.id
                     and (exists (select 1 from hunt_drive_stands s
                                    join hunt_drives dr on dr.id = s.drive_id
                                    join hunts h on h.id = dr.hunt_id
                                   where s.map_object_id = o.id
                                     and h.district_id is distinct from d.id
                                     and (h.creator_id <> p_uid
                                          or jagd_hat_fremde_daten(h.id, p_uid)))
                       or exists (select 1 from hunt_stand_bezug b
                                    join hunts h on h.id = b.hunt_id
                                   where b.map_object_id = o.id
                                     and h.district_id is distinct from d.id
                                     and (h.creator_id <> p_uid
                                          or jagd_hat_fremde_daten(h.id, p_uid)))
                       or exists (select 1 from hunt_participants x
                                    join hunts h on h.id = x.hunt_id
                                   where x.stand_id = o.id
                                     and h.district_id is distinct from d.id
                                     and (h.creator_id <> p_uid
                                          or jagd_hat_fremde_daten(h.id, p_uid)))
                       or exists (select 1 from hunt_seat_assignments a
                                    join hunts h on h.id = a.hunt_id
                                   where a.seat_id = o.id
                                     and h.district_id is distinct from d.id
                                     and (h.creator_id <> p_uid
                                          or jagd_hat_fremde_daten(h.id, p_uid)))
                       or exists (select 1 from kills k
                                   where k.hochsitz_id = o.id
                                     and k.district_id is distinct from d.id)
                       or exists (select 1 from tracking_requests t where t.hochsitz_id = o.id)
                       or exists (select 1 from driven_hunt_stands x
                                   where x.map_object_id = o.id)))
       -- Wildbret-Rechnung zu einer Erlegung des Reviers (F4, s. Helfer).
       or exists (select 1 from game_meat_invoices g
                    join kills k on k.id = g.kill_id
                   where k.district_id = d.id)
       -- NO ACTION auf districts, heute 0 Zeilen: jede Zeile blockiert.
       or exists (select 1 from tracking_requests x where x.district_id = d.id)
       or exists (select 1 from observations x where x.district_id = d.id)
       or exists (select 1 from hunt_groups x where x.district_id = d.id)
       or exists (select 1 from driven_hunts x where x.district_id = d.id)
     );

  -- V2: eine gefuehrte Chronik ist eine Revieraufzeichnung und muss
  -- uebergeben werden (CN-238). NICHT wegen des RESTRICT-Fremdschluessels —
  -- der feuert beim Soft-Delete gar nicht (Codex 13).
  select exists (select 1 from historische_strecken s where s.besitzer_id = p_uid)
    into v_chronik;

  return jsonb_build_object(
    'moeglich', jsonb_array_length(v_reviere) = 0 and not v_chronik,
    'reviere',  v_reviere,
    'chronik',  v_chronik
  );
end;
$$;

comment on function public.konto_loeschung_pruefen(uuid) is
  'Konto-Loeschung (132): Vorbedingungen V1 (eigenes Revier mit fremden '
  'Daten) und V2 (gefuehrte Chronik), ohne etwas zu aendern. Liefert '
  '{moeglich, reviere:[{id,name}], chronik}. Nur service_role.';

revoke execute on function public.konto_loeschung_pruefen(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.konto_loeschung_pruefen(uuid) to service_role;


-- ---------------------------------------------------------------------------
-- 4. Die Loeschliste (Bauplan §3) — eine Transaktion, idempotent
-- ---------------------------------------------------------------------------

create function public.konto_loeschen(p_uid uuid, p_fotos_behalten boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_behalten   boolean;
  v_pruefung   jsonb;
  v_reviere    uuid[];
  v_jagden     uuid[];
  v_teilnahmen uuid[];
  v_dateien    jsonb;
  betroffen    int;
begin
  if p_uid is null or p_fotos_behalten is null then
    raise exception 'konto_loeschen: beide Argumente sind Pflicht';
  end if;

  -- §3/1 Status anlegen und sperren. Ein zweites Geraet wartet hier, bis das
  -- erste fertig ist, und laeuft dann die Liste noch einmal — idempotent.
  -- Die Foto-Wahl gilt ab dem ERSTEN Aufruf.
  insert into konto_loeschungen (user_id, fotos_behalten)
  values (p_uid, p_fotos_behalten)
  on conflict (user_id) do nothing;

  select k.fotos_behalten into v_behalten
    from konto_loeschungen k
   where k.user_id = p_uid
     for update;

  -- §3/9 vorgezogen (Schlusslesung 132, F2): die eigene Live-Position ZUERST.
  -- Sendet das Geraet des Loeschenden noch, haelt sein Upsert die Zeile und
  -- will per `update_hunt_last_activity` auf `hunts` schreiben — das
  -- FOR UPDATE unten stuende dagegen, und die spaetere Loeschung derselben
  -- Zeile schloesse den Kreis zum Deadlock. Unten laeuft sie noch einmal.
  -- Davor die eigenen Teilnehmerzeilen (Delta-Schlusslesung 132, F-A): so
  -- sperrt diese Funktion in derselben Reihenfolge wie teilnehmer_entfernen()
  -- (128) — Teilnehmer, dann Position. NO KEY UPDATE vertraegt sich mit dem
  -- KEY SHARE, den ein Positions-Insert per Fremdschluessel nimmt.
  perform 1 from hunt_participants p where p.user_id = p_uid for no key update;
  delete from positions_current c
   where c.participant_id in (select p.id from hunt_participants p where p.user_id = p_uid);

  -- Eltern sperren, BEVOR geprueft wird (Fremdpruefung 132, F7). Ohne das
  -- koennte ein fremder Beitritt, eine fremde Erlegung oder Standpruefung
  -- zwischen Pruefung und Loeschung committen und per CASCADE mitgehen.
  -- Jede solche Zeile nimmt beim Anlegen FOR KEY SHARE auf ihre Elternzeile,
  -- und das steht gegen FOR UPDATE: sie wartet hier. Danach ist entweder
  -- ihre Zeile committet und die Pruefung unten sieht sie (READ COMMITTED,
  -- neuer Schnappschuss je Anweisung), oder die Eltern sind nach unserem
  -- COMMIT weg und ihr INSERT scheitert laut an 23503.
  perform 1 from districts d where d.owner_id = p_uid for update;
  perform 1 from hunts h
   where h.creator_id = p_uid
      or h.district_id in (select d.id from districts d where d.owner_id = p_uid)
     for update;
  perform 1 from map_objects o
   where o.district_id in (select d.id from districts d where d.owner_id = p_uid)
     for update;
  perform 1 from chat_groups g
   where g.hunt_id in (select h.id from hunts h
                        where h.creator_id = p_uid
                           or h.district_id in (select d.id from districts d
                                                 where d.owner_id = p_uid))
     for update;

  -- Vorbedingungen. Schlagen sie an, rollt auch die Statuszeile zurueck.
  v_pruefung := konto_loeschung_pruefen(p_uid);
  if not (v_pruefung ->> 'moeglich')::boolean then
    raise exception 'Konto-Loeschung nicht moeglich'
      using errcode = 'P0001', detail = v_pruefung::text;
  end if;

  -- §3/2 Laufende eigene Jagden ohne weiteren Jagdleiter beenden (M5).
  -- close_drives_on_hunt_end und clear_stand_bezug_on_hunt_end raeumen.
  update hunts h
     set status   = 'completed',
         ended_at = coalesce(h.ended_at, now())
   where h.creator_id = p_uid
     and h.status in ('active', 'paused')
     and not exists (select 1 from hunt_participants x
                      where x.hunt_id = h.id
                        and x.role    = 'jagdleiter'
                        and x.status  = 'joined'
                        and x.user_id <> p_uid);

  -- §3/3 Eigene Reviere — nach V1 haengt an keinem mehr etwas Fremdes.
  -- Reihenfolge zwingend: kills.hunt_id und hunts.district_id sind NO ACTION.
  select coalesce(array_agg(d.id), '{}') into v_reviere
    from districts d where d.owner_id = p_uid;
  select coalesce(array_agg(h.id), '{}') into v_jagden
    from hunts h where h.district_id = any (v_reviere);

  delete from wild_events w where w.hunt_id = any (v_jagden) and w.type <> 'kill';
  delete from kills k
   where k.district_id = any (v_reviere) or k.hunt_id = any (v_jagden);
  delete from hunts h where h.id = any (v_jagden);
  -- CASCADE: Zonen, Kartenobjekte (Pruefungen, Fotos, Standgruppen-Staende),
  -- Standgruppen, Abschussplaene, Scheine samt Zahlungen.
  delete from districts d where d.id = any (v_reviere);

  -- §3/4 Private Jagden: eigene, ohne Revier, ohne irgendetwas Fremdes.
  -- VOR §3/7, sonst wuerden ihre Anblicke per SET NULL zu Waisen (SL F5).
  select coalesce(array_agg(h.id), '{}') into v_jagden
    from hunts h
   where h.creator_id = p_uid
     and h.district_id is null
     and not jagd_hat_fremde_daten(h.id, p_uid);

  delete from wild_events w where w.hunt_id = any (v_jagden) and w.type <> 'kill';
  delete from kills k where k.hunt_id = any (v_jagden);
  delete from hunts h where h.id = any (v_jagden);

  -- §3/5 Teilnahmen in bleibenden Jagden. Das Aufraeumen folgt
  -- teilnehmer_entfernen() (128) — Falle 3 im Kopf. Beendete Jagden bleiben
  -- unangetastet: dort ist die Zuteilung Protokoll ("wer war wo").
  -- ⚠ hunt_seat_assignments bleiben, ANDERS als in 128 (Fremdpruefung 132,
  -- F6): hunt_drive_stands.seat_assignment_id ist CASCADE, ein Loeschen nahme
  -- die Standzuordnungen auch ABGESCHLOSSENER Treiben mit. Der Einlock-
  -- Zustand (hunt_stand_bezug) geht trotzdem; die Karte zeigt den Stand frei.
  select coalesce(array_agg(p.id), '{}') into v_teilnahmen
    from hunt_participants p where p.user_id = p_uid;

  delete from hunt_stand_bezug b where b.participant_id = any (v_teilnahmen);

  update hunt_drive_stands s
     set participant_id = null
   where s.participant_id = any (v_teilnahmen)
     and s.drive_id in (select d.id from hunt_drives d where d.status <> 'completed');

  -- geplant und von nichts referenziert -> weg
  delete from hunt_participants p
   using hunts h
   where p.hunt_id = h.id
     and p.user_id = p_uid
     and h.status in ('draft', 'scheduled')
     and not exists (select 1 from kills k where k.participant_id = p.id)
     and not exists (select 1 from messages m where m.participant_id = p.id)
     and not exists (select 1 from tracking_requests t
                      where t.handler_participant_id = p.id);

  -- laufend, oder geplant und referenziert -> left (ohne entfernt_am)
  update hunt_participants p
     set status  = 'left',
         left_at = coalesce(p.left_at, now())
    from hunts h
   where p.hunt_id = h.id
     and p.user_id = p_uid
     and h.status in ('active', 'paused', 'draft', 'scheduled')
     and p.status is distinct from 'left';

  -- §3/7 Private Wildereignisse ohne Jagd. §3/8: mit Jagd bleiben sie
  -- (Jagdprotokoll). Falle 1 im Kopf: NIE type = 'kill'.
  delete from wild_events w
   where w.user_id = p_uid and w.hunt_id is null and w.type <> 'kill';

  -- §3/9 Live-Position. §3/10: positions bleiben bis CN-239 (M4/E12).
  delete from positions_current c where c.participant_id = any (v_teilnahmen);

  -- §3/11 Chat-Text ersetzen (M2, E6). kill_report/signal/tracking bleiben.
  -- `participant_id` deckt Jagdchat-Zeilen ohne sender_id (120).
  update messages m
     set content   = 'Nachricht gelöscht',
         media_url = null,
         type      = 'text'
   where (m.sender_id = p_uid or m.participant_id = any (v_teilnahmen))
     and m.type in ('text', 'photo', 'audio')
     and (m.content is distinct from 'Nachricht gelöscht'
          or m.media_url is not null
          or m.type <> 'text');

  -- §3/13 Mitgliedschaften. §3/14: chat_groups.created_by bleibt (E7).
  delete from chat_group_members m where m.user_id = p_uid;

  -- §3/15 Scheine als Inhaber: entzogen, Textfelder bleiben (M7).
  update hunting_licenses l
     set status = 'entzogen'
   where l.holder_id = p_uid and l.status is distinct from 'entzogen';

  -- §3/16-17 Adressbuch — das eigene weg, in fremden nur der Kontobezug.
  delete from kontakt_mitfuehrende x
   where x.besitzer_id = p_uid or x.mitfuehrer_id = p_uid;
  delete from kontakte k where k.besitzer_id = p_uid;
  update kontakte k set profil_id = null where k.profil_id = p_uid;

  -- §3/18 Persoenliches ohne Bezug fuer andere.
  delete from jagdtag_notizen      where besitzer_id = p_uid;
  delete from feedback             where besitzer_id = p_uid;
  delete from push_subscriptions   where user_id     = p_uid;
  delete from user_settings        where user_id     = p_uid;
  delete from chat_stummschaltungen where besitzer_id = p_uid;

  -- §3/20 Private Wildarten, nur wenn nichts darauf zeigt (RESTRICT, 122).
  delete from wildarten w
   where w.besitzer_id = p_uid
     and not exists (select 1 from kills k where k.wildart_id = w.id)
     and not exists (select 1 from wild_events e where e.wildart_id = w.id)
     and not exists (select 1 from wildarten c where c.eltern_id = w.id);

  -- §3/19 + §3/22 Fotos (M6). Die Liste entsteht NACH den Loeschungen oben,
  -- weil "Gegenstand gibt es nicht mehr" eine der Bedingungen ist, und sie
  -- kommt aus storage.objects selbst: ein Wiederholungsaufruf nach einem
  -- Teilausfall findet die schon entfernten Dateien nicht mehr und zaehlt
  -- richtig (Bauplan §2 c).
  --   chat-photos    Klammer owner_id  -> immer
  --   group-avatars  Klammer owner_id  -> ohne Haekchen, oder Gruppe weg
  --   app-photos     Klammer 1. Pfadsegment (083; 185/210 ohne owner_id)
  --     kill|hunt|wild_event -> ohne Haekchen, oder wenn der Gegenstand weg ist
  --     map_object -> NUR wenn das Objekt weg ist (§3/3 nimmt die Objekte
  --                   eigener Reviere per CASCADE mit, die Dateien nicht);
  --                   an bleibenden Objekten bleiben sie immer (E9)
  --     Unbekanntes -> bleibt
  select coalesce(jsonb_agg(jsonb_build_object('bucket', o.bucket_id, 'name', o.name)
                            order by o.bucket_id, o.name), '[]'::jsonb)
    into v_dateien
    from storage.objects o
   where (o.bucket_id = 'chat-photos' and o.owner_id = p_uid::text)
      -- Gruppenbilder: ohne Haekchen, oder wenn die Gruppe weg ist — etwa mit
      -- einer privaten Jagd (Fremdpruefung 132, F8). Pfad `<group_id>/…`.
      or (o.bucket_id = 'group-avatars' and o.owner_id = p_uid::text
          and (not v_behalten
               or not exists (select 1 from chat_groups g
                               where g.id::text = split_part(o.name, '/', 1))))
      or (o.bucket_id = 'app-photos'
          and split_part(o.name, '/', 1) = p_uid::text
          and case split_part(o.name, '/', 2)
                when 'kill' then not v_behalten
                  or not exists (select 1 from kills k
                                  where k.id::text = split_part(o.name, '/', 3))
                when 'hunt' then not v_behalten
                  or not exists (select 1 from hunts h
                                  where h.id::text = split_part(o.name, '/', 3))
                when 'wild_event' then not v_behalten
                  or not exists (select 1 from wild_events w
                                  where w.id::text = split_part(o.name, '/', 3))
                when 'map_object' then
                  not exists (select 1 from map_objects m
                               where m.id::text = split_part(o.name, '/', 3))
                else false
              end);

  -- Verweise auf diese Dateien in Zeilen, die bleiben (SL F9).
  update kills k set foto_url = null
    from jsonb_to_recordset(v_dateien) as d(bucket text, name text)
   where d.bucket = 'app-photos'
     and split_part(k.foto_url, '/app-photos/', 2) = d.name;

  update wild_events w set photo_url = null
    from jsonb_to_recordset(v_dateien) as d(bucket text, name text)
   where d.bucket = 'app-photos'
     and split_part(w.photo_url, '/app-photos/', 2) = d.name;

  -- Mit Haekchen stehen nur Dateien verschwundener Jagden in der Liste —
  -- deren Fotozeilen hat die CASCADE schon genommen.
  if not v_behalten then
    delete from hunt_photos p where p.uploaded_by = p_uid;
  end if;

  update chat_groups g set avatar_url = null
    from jsonb_to_recordset(v_dateien) as d(bucket text, name text)
   where d.bucket = 'group-avatars'
     and split_part(g.avatar_url, '/group-avatars/', 2) = d.name;

  -- §3/21 Grabstein. display_name und anonymize_kills bleiben.
  update profiles
     set phone               = null,
         jagdschein_nr       = null,
         waffe               = null,
         kaliber             = null,
         avatar_url          = null,
         wildart_favoriten   = '{}',
         availability_status = 'available'
   where id = p_uid;

  get diagnostics betroffen = row_count;
  if betroffen <> 1 then
    raise exception 'konto_loeschen: Profil % nicht gefunden', p_uid;
  end if;

  -- §3/22 Rueckgabe als EINE Zeile (returns table fiele unter max-rows, SL F7).
  return jsonb_build_object('dateien', v_dateien);
end;
$$;

comment on function public.konto_loeschen(uuid, boolean) is
  'Konto-Loeschung (132, CN-236), Datenbankteil: die Loeschliste aus dem '
  'Bauplan §3 in einer Transaktion, idempotent. Liefert die zu entfernenden '
  'Storage-Dateien {dateien:[{bucket,name}]}. NUR service_role — ein '
  'Client, der sie ruft, loescht ein Konto, dessen Anmeldung weiterlebt.';

revoke execute on function public.konto_loeschen(uuid, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.konto_loeschen(uuid, boolean) to service_role;


-- ---------------------------------------------------------------------------
-- 5. Abschliessen — nur, wenn GoTrue wirklich geloescht hat
-- ---------------------------------------------------------------------------

create function public.konto_loeschung_abschliessen(p_uid uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update konto_loeschungen k
     set abgeschlossen_am = coalesce(k.abgeschlossen_am, now())
   where k.user_id = p_uid
     and exists (select 1 from auth.users u
                  where u.id = p_uid and u.deleted_at is not null);

  -- true heisst: Status begonnen UND Anmeldung soft-geloescht. Die Edge
  -- Function antwortet nur dann { geloescht: true } — auch im Wiederholungs-
  -- fall nach verlorener Antwort (Bauplan §2), in dem auth.getUser scheitert.
  return found;
end;
$$;

comment on function public.konto_loeschung_abschliessen(uuid) is
  'Konto-Loeschung (132): setzt abgeschlossen_am, aber nur wenn '
  'auth.users.deleted_at gesetzt ist. true = das Konto ist wirklich weg. '
  'Nur service_role.';

revoke execute on function public.konto_loeschung_abschliessen(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.konto_loeschung_abschliessen(uuid) to service_role;


-- ---------------------------------------------------------------------------
-- 6. konto_namen() bekommt `geloescht` (E13)
-- ---------------------------------------------------------------------------
-- Die Einladelisten filtern damit Grabsteine heraus; die Namensaufloeser
-- (Schein-Aussteller, Standpruefer) zeigen den Namen weiter. "Geloescht"
-- heisst ab BEGONNEN: die Daten sind dann schon weg, nur Storage und Auth
-- stehen noch aus.
-- drop + create, weil sich der Rueckgabetyp aendert. Danach die Rechte
-- AUSDRUECKLICH: ALTER DEFAULT PRIVILEGES vergaebe sie sonst neu an anon
-- und service_role (SL F13).

drop function public.konto_namen();

create function public.konto_namen()
returns table (id uuid, display_name text, geloescht boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id,
         p.display_name,
         exists (select 1 from public.konto_loeschungen k where k.user_id = p.id)
    from public.profiles p
   -- Zweiter Riegel neben dem EXECUTE-Entzug (115).
   where auth.uid() is not null
   order by p.display_name;
$$;

comment on function public.konto_namen() is
  'Ein Name zu einer Kennung — NUR id, display_name und geloescht, fuer alle '
  'Konten (115, erweitert in 132). SECURITY DEFINER, weil 116 die '
  'Profiltabelle auf Chat- und Jagdpartner einengt. Wer hier eine Spalte '
  'hinzufuegt, macht sie fuer JEDEN Angemeldeten ueber JEDES Konto sichtbar. '
  'geloescht = Konto-Loeschung begonnen (konto_loeschungen). Ungepagt; '
  'PostgREST kappt bei 1000 Zeilen.';

revoke execute on function public.konto_namen()
  from public, anon, authenticated, service_role;
grant execute on function public.konto_namen() to authenticated;

commit;

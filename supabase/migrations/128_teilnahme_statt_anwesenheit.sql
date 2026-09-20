-- 128_teilnahme_statt_anwesenheit.sql — CN-206
--
-- Wer einmal einer Jagd beigetreten war, behält den Rückblick auf sie — bis
-- der Jagdleiter ihn zurücknimmt. Heute entscheidet ANWESENHEIT
-- (`status = 'joined'`), künftig TEILNAHME.
--
-- Anlass (Moritz, 20.09.2026): "wenn ich eine Jagd verlasse sehe ich die
-- strecke usw nicht mehr: ich verlasse die ja auch ggf nur direkt nach der
-- jagd weil ich zu einer anderen gehe aber habe teilgenommen. einmal
-- eingeladen und angenommen sollte ich auch den inhalt der jagd sehen."
--
-- ============================================================================
-- DER BAUPLAN IST VOR DIESER DATEI GEPRÜFT WORDEN — UND HAT SICH GEIRRT
-- ============================================================================
-- Vollständige Begründung: docs/konzepte/QuickHunt_Bauplan_Teilnahme_Statt_
-- Anwesenheit_V1.md (quickhunt-native), §6 Prüfergebnis, §7 verbindliche
-- Fassung. Geprüft nach F14 von Codex UND der Schlusslesung, unabhängig und
-- gleichzeitig, BEVOR eine Zeile entstand. Beide: needs-attention.
--
-- Beide fanden unabhängig denselben tragenden Fehler: die erste Fassung war
-- eine reine Policy-Migration und hätte auf dem GERÄT nichts geändert. Der
-- native Client rendert die Reiter einer Jagd nur im Zweig `joined`; jeder
-- andere Zustand landet auf "Kein Zugriff" (_layout.tsx:2568-2580). Moritz
-- hat es bestätigt: "Alles da steht ich habe keinen Zugriff mehr" — er hat
-- den Inhalt nie gesehen, sondern das Tor davor.
--
-- Die Lehre ist die von CP-91, eine Ebene höher: eine korrekte Messung der
-- falschen Achse liest sich wie ein Beleg. Gezählt wurde der Policy-Katalog,
-- erlebt wird der Bildschirm. WER EINE ANZEIGE ÄNDERT, MISST ÜBER DIE ACHSE,
-- IN DER SIE ANGEZEIGT WIRD.
--
-- ⛔ FOLGE FÜR DIE REIHENFOLGE: diese Migration allein bewirkt NICHTS
-- Sichtbares. Sie geht trotzdem VOR dem Build (der Client selektiert
-- `entfernt_am`), aber ohne den nativen Gate-Zweig bleibt der Rückblick
-- unerreichbar.
--
-- ============================================================================
-- WARUM EINE SPALTE UND KEIN FÜNFTER ENUM-WERT
-- ============================================================================
-- `participant_status` kennt `invited, joined, left, declined` — keiner heißt
-- "vom Leiter entfernt". Die PWA löst das mit einem harten DELETE
-- (app/app/hunt/[id]/page.tsx:625). Drei Gründe dagegen:
--
--   1. `kills.participant_id` ist NO ACTION: wer in der Jagd eine Erlegung
--      gemeldet hat, LÄSST SICH NICHT LÖSCHEN (23503). Die PWA fängt das ab
--      und kann solche Gäste schlicht nicht entfernen.
--   2. Ein DELETE nimmt GPS-Spur, Live-Position und Standbezug per CASCADE
--      mit — die Teilnahme verschwindet spurlos. 088 hat für die Absage
--      genau deshalb "ein Zustand, kein Loch" entschieden.
--   3. `alter type ... add value` ist in derselben Transaktion nicht
--      benutzbar (PG 17.6, 55P04) — ein fünfter Enum-Wert bräuchte zwei
--      Läufe.
--
-- `left` + `entfernt_am` gesetzt  = vom Jagdleiter entfernt
-- `left` + `entfernt_am` null     = selbst gegangen
--
-- ============================================================================
-- AKTIVE FALLE 1: `left` BEWEIST KEINE TEILNAHME  (Codex B11, gemessen)
-- ============================================================================
-- `jagd_verlassen()` (067) schreibt `status='left'` bei
-- `status is distinct from 'left'` — also AUCH aus `invited` und `declined`
-- heraus. Wer nie zugesagt hat, könnte sich damit den Rückblick verschaffen.
-- Moritz' Anlass sagt ausdrücklich "eingeladen UND ANGENOMMEN".
--
-- Der Riegel ist `joined_at is not null` im Helfer unten. Er trägt gegen den
-- Weg über `jagd_verlassen()`, weil `joined_at` nur beim Beitritt gesetzt und
-- bei der Wiedereinladung wieder genullt wird (participants.ts:1060).
-- Gegengeprüft am Bestand: die einzige `left`-Zeile (Moritz/Roloven) trägt
-- joined_at 19.09.2026 05:58 UTC.
--
-- ⚠ ER TRÄGT NICHT GEGEN DEN JAGDLEITER SELBST (Fremdprüfung M1).
-- `participants_creator_all` (003) und `participants_leader_all` (067) sind
-- `FOR ALL` ohne Spaltenschranke: der Ersteller oder ein Jagdleiter kann auf
-- einer fremden Zeile direkt `status='left', joined_at=now()` schreiben und
-- ihr damit einen Rückblick verschaffen, den der Betroffene nie angenommen
-- hat. **Das ist hingenommen, nicht übersehen** — derselbe Jagdleiter kann
-- die Person ohnehin jederzeit `joined` setzen und ihr damit MEHR geben als
-- den Rückblick. Der Riegel ist gegen den BETROFFENEN gerichtet, nicht gegen
-- den Leiter; wer eine Spaltenschranke will, braucht einen Trigger auf
-- `joined_at` und der gehört in ein eigenes Paket (vgl. 126 Falle 3,
-- dieselbe Abwägung).
--
-- ============================================================================
-- AKTIVE FALLE 2: KEINE KASKADE FEUERT, WEIL DIE ZEILE BLEIBT  (beide Prüfer)
-- ============================================================================
-- Auf `hunt_participants.id` zeigen sieben Fremdschlüssel:
--   positions, positions_current, hunt_stand_bezug  → CASCADE
--   hunt_drive_stands.participant_id               → SET NULL
--   kills, messages, tracking_requests             → NO ACTION
-- Da die Zeile bei diesem Entwurf STEHEN BLEIBT, feuert KEINE davon. Was
-- aufgeräumt werden soll, muss `teilnehmer_entfernen()` selbst tun —
-- einschließlich `hunt_drive_stands`, sonst steht der Entfernte weiter in der
-- Standzuteilung des laufenden Treibens und als Label auf der Leiterkarte
-- (fetchHuntSeating/fetchHuntParticipantNames lesen ohne Statusfilter).
--
-- ============================================================================
-- AKTIVE FALLE 3: DER JAGDLEITER KANN NICHT SELBST AUFRÄUMEN
-- ============================================================================
-- `positions_current_upsert_own` und `stand_bezug_own` binden an
-- `user_id = auth.uid() AND status = 'joined'` — ein Jagdleiter darf die
-- Live-Position und den Standbezug eines FREMDEN nicht anfassen. Deshalb ist
-- der Rauswurf eine SECURITY-DEFINER-RPC und kein Client-Schreibpfad: ein
-- halb gelaufener Rauswurf hinterließe einen Geist auf der Karte, und der
-- Stand wäre nach 081 nicht einmal löschbar (55006).
--
-- ============================================================================
-- WIDERLEGT — NICHT WIEDERHOLEN
-- ============================================================================
-- Der Bauplan begründete zunächst, man dürfe `get_my_joined_hunt_ids()` nicht
-- selbst erweitern, weil der Helfer "über `_as_leader()` in acht FOR-ALL-
-- Policies steckt". DAS IST FALSCH, beide Prüfer haben es unabhängig
-- gemessen: `get_my_joined_hunt_ids_as_leader()` hat einen EIGENEN Rumpf und
-- ruft den Basis-Helfer nicht auf (pg_proc-Scan: kein Funktionsrumpf in
-- `public` referenziert ihn). Die Zahl ist 9, nicht 8.
--
-- Der richtige Grund gegen diese Variante: der Basis-Helfer steckt in
-- `messages_insert_member` — ein `left`-Teilnehmer bekäme SCHREIBZUGRIFF auf
-- den Jagdchat — und in den Leseflächen, die bewusst zu bleiben
-- (`positions`, `positions_current`: die Bewegung anderer Menschen).
--
-- ============================================================================
-- WAS BEWUSST ZU BLEIBT
-- ============================================================================
--   `positions`, `positions_current`  — Bewegungsdaten anderer Menschen; die
--                                       Ortung endet mit der Teilnahme
--   `hunt_stand_bezug`                — wer gerade wo sitzt, ist Live-Lage
--   `messages_hunt_member`            — der Chat hängt am zweiten Pfad
--                                       (group_id) und bleibt ohnehin
--   `tracking_requests`               — nirgends `joined`-gebunden, bewusst
--                                       belassen (Nachsuche bleibt zugewiesen)

begin;

-- ---------------------------------------------------------------------------
-- 1. Die Spalte
-- ---------------------------------------------------------------------------
alter table public.hunt_participants
  add column if not exists entfernt_am timestamptz;

comment on column public.hunt_participants.entfernt_am is
  'Gesetzt = der Jagdleiter hat diesen Teilnehmer entfernt (128, CN-206). '
  'NULL bei status=left = selbst gegangen. Nur teilnehmer_entfernen() setzt '
  'die Spalte regulär; trg_teilnehmer_entfernt_am nullt sie, sobald der '
  'Status nicht mehr left ist.';

-- ---------------------------------------------------------------------------
-- 2. Die Invariante als Trigger
-- ---------------------------------------------------------------------------
-- Ohne diesen Riegel gibt es den Zustand `joined` + `entfernt_am`, und der
-- ist der gefährlichste im ganzen Entwurf: der Helfer unten schließt ihn aus
-- (der Betroffene SIEHT nichts), aber die vier Inline-Policies
-- `positions_current_upsert_own`, `positions_insert_own`, `stand_bezug_own`
-- und `hunt_photos_insert` prüfen nur `status='joined'` — er dürfte also
-- weiter SCHREIBEN. Zwei Wege führten hinein: ein direktes Leiter-UPDATE
-- statt der RPC, und die Wiedereinladung (setzt nur status/left_at/joined_at
-- zurück, participants.ts:1060 und revierapp page.tsx:575).
--
-- Trigger statt CHECK, mit Absicht: ein CHECK wäre laut (23514), bräche aber
-- die bestehende PWA-Wiedereinladung bis zu deren Anpassung — und die PWA ist
-- im Maintenance-Modus. Der Trigger heilt still und deckt beide Clients ohne
-- Client-Änderung.
--
-- Der Name sortiert vor `trg_teilnehmer_kontakt` (e < k). BEFORE-Trigger
-- feuern alphabetisch (die 096-Falle); eine Abhängigkeit zwischen beiden
-- besteht nicht — der andere prüft ausschließlich `kontakt_id`.
create or replace function public.teilnehmer_entfernt_am_invariante()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from 'left' then
    new.entfernt_am := null;
  end if;
  return new;
end;
$$;

comment on function public.teilnehmer_entfernt_am_invariante() is
  'Hält entfernt_am an status=left gebunden (128). Verhindert den Zustand '
  'joined+entfernt_am, der nichts sieht und trotzdem schreiben darf.';

-- `update of status, entfernt_am` statt jedes UPDATE: die Invariante kann von
-- keinem Schreibvorgang gebrochen werden, der weder Spalte nennt — und
-- `hunt_participants` wird auch bei jeder Ortungspause geschrieben (126).
-- `before insert` ist dagegen KEIN Vorrat: `participants_leader_all` und
-- `participants_creator_all` erlauben ein INSERT mit `joined` + `entfernt_am`,
-- und genau das ist der blinde-aber-schreibende Zustand von oben.
drop trigger if exists trg_teilnehmer_entfernt_am on public.hunt_participants;
create trigger trg_teilnehmer_entfernt_am
  before insert or update of status, entfernt_am on public.hunt_participants
  for each row execute function public.teilnehmer_entfernt_am_invariante();

-- Trigger-Funktionen gehören niemandem (082): wer sie ausführen darf, hängt
-- sie an eine eigene temporäre Tabelle und bestimmt NEW frei.
revoke execute on function public.teilnehmer_entfernt_am_invariante()
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Der Helfer
-- ---------------------------------------------------------------------------
create or replace function public.get_my_teilnahme_hunt_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select hunt_id
    from hunt_participants
   where user_id = auth.uid()
     and entfernt_am is null
     and (status = 'joined'
          or (status = 'left' and joined_at is not null));
$$;

comment on function public.get_my_teilnahme_hunt_ids() is
  'Jagden, an denen der Aufrufer teilnimmt ODER teilgenommen hat (128). '
  'joined_at is not null ist Pflicht: jagd_verlassen() (067) schreibt left '
  'auch aus invited und declined heraus, left allein beweist also keine '
  'Teilnahme. entfernt_am schließt den vom Leiter Entfernten aus.';

-- ⚠ `anon` bekommt EXECUTE, und das ist kein Versehen (Fremdprüfung M6, die
-- 078-Falle). SECHS der sieben umgehängten Policies gelten für PUBLIC, also
-- auch für `anon` (die siebte, `wild_events_hunt_member`, ist `to
-- authenticated` — gemessen; eine frühere Fassung dieser Zeile sagte „acht"
-- und stammte aus dem Entwurf, der `hunt_seat_assignments` noch mitöffnete).
-- Ein Policy-Ausdruck läuft mit den Rechten des AUFRUFERS: fehlte
-- `anon` das EXECUTE, würde aus einer leeren Liste ein hartes
-- `42501 permission denied for function` — und damit aus „nichts zu sehen"
-- ein Serverfehler auf dem Gast-Layer der PWA. Der alte Helfer
-- `get_my_joined_hunt_ids()` trägt dasselbe Recht (gemessen: anon=true).
-- Gefahrlos, weil `auth.uid()` für `anon` null ist und die Abfrage dann
-- keine Zeile liefert.
revoke execute on function public.get_my_teilnahme_hunt_ids()
  from public, service_role;
grant execute on function public.get_my_teilnahme_hunt_ids() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Die Policies der Jagd
-- ---------------------------------------------------------------------------
-- Umgehängt, nicht zusätzlich: die Bedingung ist je Tabelle dieselbe wie
-- bisher, nur der Helfer wechselt. Zwei OR-verknüpfte Policies mit identischem
-- Rumpf wären doppelte Fläche für jede spätere Änderung.

drop policy if exists kills_visibility_all on public.kills;
create policy kills_visibility_all on public.kills
  for select using (
    hunt_id in (select get_my_teilnahme_hunt_ids())
    and (select h.kill_visibility from hunts h where h.id = kills.hunt_id) = 'all'
  );

drop policy if exists wild_events_hunt_member on public.wild_events;
create policy wild_events_hunt_member on public.wild_events
  for select to authenticated using (
    type = 'sighting'
    and hunt_id in (select get_my_teilnahme_hunt_ids())
  );

drop policy if exists participants_hunt_member on public.hunt_participants;
create policy participants_hunt_member on public.hunt_participants
  for select using (hunt_id in (select get_my_teilnahme_hunt_ids()));

drop policy if exists hunt_photos_select on public.hunt_photos;
create policy hunt_photos_select on public.hunt_photos
  for select using (
    hunt_id in (select get_my_teilnahme_hunt_ids())
    or hunt_id in (select h.id from hunts h where h.creator_id = auth.uid())
  );

drop policy if exists hunt_drives_participant_select on public.hunt_drives;
create policy hunt_drives_participant_select on public.hunt_drives
  for select using (hunt_id in (select get_my_teilnahme_hunt_ids()));

drop policy if exists drive_stands_participant_select on public.hunt_drive_stands;
create policy drive_stands_participant_select on public.hunt_drive_stands
  for select using (
    drive_id in (
      select d.id from hunt_drives d
       where d.hunt_id in (select get_my_teilnahme_hunt_ids())
    )
  );

-- ⚠ `hunt_seat_assignments` wird NICHT geöffnet, obwohl der Bauplan (§7.1)
-- es vorsah. Die Fremdprüfung hat es zweimal beanstandet (Bauplan-B1,
-- Migration-M7): die Tabelle trägt die AKTUELLE Sitzordnung samt
-- personenbezogener `free_pos`-Koordinaten, nicht den historischen Stand. Sie
-- zu öffnen machte einen Teil der Live-Lage wieder sichtbar, die dieses Paket
-- ausdrücklich zulässt — derselbe Grund, aus dem `positions_current` und
-- `hunt_stand_bezug` zubleiben. Der Rückblick auf „wer stand wo" läuft über
-- `hunt_drive_stands` am abgeschlossenen Treiben.

-- Die Namen. Ohne sie zeigt der Rückblick eine Strecke ohne Schützen und eine
-- Teilnehmerliste ohne Namen — heute unsichtbar, weil
-- `profiles_select_authenticated` noch jedem Angemeldeten jedes Profil gibt.
-- SOBALD 116 appliziert ist (reserviert, nicht gebaut), fiele der Embed auf
-- null. Gefunden von der Schlusslesung, F9.
drop policy if exists profiles_select_co_hunters on public.profiles;
create policy profiles_select_co_hunters on public.profiles
  for select using (
    id in (
      select hp.user_id from hunt_participants hp
       where hp.hunt_id in (select get_my_teilnahme_hunt_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Die Karte im Rückblick — BEWUSST NICHT IN DIESEM PAKET
-- ---------------------------------------------------------------------------
-- Der Bauplan (§7.3) schlug vor, Stände und Zonen mitzuöffnen: an Roloven,
-- der einzigen Jagd, die jemand verlassen hat, gibt es 0 Erlegungen und
-- 0 Anblicke — ohne Karte wäre der Rückblick dort leer, also genau das Bild,
-- gegen das dieses Paket gebaut ist.
--
-- ⛔ DER ENTWURF WAR GESCHRIEBEN UND IST GEMESSEN WIRKUNGSLOS (M12).
-- Beide Policies hätten `districts` im Join gebraucht, und dieser Join läuft
-- als INVOKER. `districts` trägt genau drei SELECT-Policies:
--     districts_owner_all               (Eigentum)
--     districts_jes_select              (gültiger Begehungsschein)
--     districts_joined_participant_select = is_hunt_participant_of_district(id)
-- und die dritte verlangt in ihrem Rumpf `status = 'joined'` (055).
-- Ein Ausgetretener liest die `districts`-Zeile also nicht, der Join liefert
-- nichts, und beide Policies hätten dagestanden, ohne je eine Zeile
-- freizugeben. **Ein Riegel, der nichts freigibt, sieht aus wie ein Riegel,
-- der etwas freigibt** — dieselbe Bauform wie der Route-Gate, der diesen
-- Bauplan gekippt hat, nur eine Ebene tiefer.
--
-- Was es bräuchte: einen eigenen SECURITY-DEFINER-Helfer für die Revier-IDs
-- (Bauart `get_my_jes_district_ids`), damit kein Invoker-Join auf `districts`
-- nötig ist — und dazu die Entscheidung, ob auch die Reviergrenze selbst
-- sichtbar wird, denn ohne sie zeigt die Karte Stände ohne Umriss. Das sind
-- zwei Fragen mehr, beide auf fremdem Revier. Sie gehören in ein eigenes
-- Paket mit eigener Freigabe, nicht als Anhang in dieses.

-- ---------------------------------------------------------------------------
-- 6. Der Jagdkopf
-- ---------------------------------------------------------------------------
-- `hunts_participant_select` führte über `get_my_hunt_ids()` — OHNE
-- Statusfilter. Ein Entfernter behielte damit Jagdkopf, Leiter-`notiz`,
-- Jagdgrenze und den Listeneintrag; Moritz' Satz "dann sieht der gast nichts
-- mehr" wäre nicht erfüllt.
--
-- ⚠ Und die Spalte trägt mehr als den Kopf: `app_photos_read` (083) prüft für
-- die Pfad-Art `hunt` nur `exists (select 1 from hunts h where h.id = <pfad>)`
-- — als INVOKER, erbt also DIESE Policy und nicht `hunt_photos_select`. Wer
-- den Jagdkopf sieht, kann die Fotodateien der Jagd listen und signieren.
-- Heute folgenlos (hunt_photos hat 0 Zeilen, alle 15 Storage-Objekte der Art
-- hunt gehören zu gelöschten Jagden), offen beim nächsten Gruppenfoto.
-- Beide Prüfer haben es unabhängig gefunden.
--
-- Nur der Entfernte wird ausgeschlossen. `invited` (offene Einladung muss
-- sichtbar bleiben, sonst kann sie niemand annehmen), `declined` und
-- freiwillig `left` bleiben unberührt.
--
-- ⛔⛔ DIE POLICY BLEIBT EINE FUNKTION — EINE INLINE-ABFRAGE WÄRE EIN
-- RLS-ZYKLUS UND HÄTTE BEIDE CLIENTS GEBROCHEN.
-- Der erste Entwurf schrieb die Bedingung als Subquery direkt in die Policy.
-- Die Fremdprüfung hat den Kreis gefunden (M5/M10/M11), nachgemessen am
-- Katalog:
--     SELECT auf `hunts`            → hunts_participant_select
--       → Subquery auf `hunt_participants`
--         → deren RLS: participants_creator_all (003)
--           = `hunt_id in (select id from hunts where creator_id = auth.uid())`
--             → SELECT auf `hunts` … Zyklus, `infinite recursion detected`.
-- Der SECURITY-DEFINER-Helfer bricht ihn, weil sein Rumpf RLS nicht auslöst.
-- Das war der Grund für die Funktion — er stand nirgends, also wurde sie für
-- Umstand gehalten.
--
-- Deshalb wird `get_my_hunt_ids()` ERWEITERT statt ersetzt. Gemessen: sie hat
-- genau EINEN Verwender, nämlich diese Policy (Katalogsuche über alle
-- Policies und alle Funktionsrümpfe in `public`). Ihre Bedeutung bleibt
-- „meine Jagden" — eine, aus der man geworfen wurde, ist keine mehr.
create or replace function public.get_my_hunt_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select hunt_id
    from hunt_participants
   where user_id = auth.uid()
     and entfernt_am is null;
$$;

comment on function public.get_my_hunt_ids() is
  'Jagden, zu denen der Aufrufer eine Teilnehmerzeile hat — seit 128 ohne die, '
  'aus denen der Jagdleiter ihn entfernt hat. Einziger Verwender ist '
  'hunts_participant_select. MUSS SECURITY DEFINER bleiben: als Inline-Abfrage '
  'entstünde der Zyklus hunts → hunt_participants → participants_creator_all '
  '→ hunts.';

-- ---------------------------------------------------------------------------
-- 7. Der Rauswurf
-- ---------------------------------------------------------------------------
create or replace function public.teilnehmer_entfernen(p_participant_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hunt     uuid;
  v_ziel     uuid;
  v_creator  uuid;
  betroffen  int;
begin
  -- Als DEFINER, also RLS-frei. Die Jagd wird AUS DER ZEILE abgeleitet und
  -- nicht als Parameter genommen: ein zweiter Parameter ließe sich gegen die
  -- Zeile ausspielen.
  select hp.hunt_id, hp.user_id, h.creator_id
    into v_hunt, v_ziel, v_creator
    from hunt_participants hp
    left join hunts h on h.id = hp.hunt_id
   where hp.id = p_participant_id;

  if v_hunt is null then
    raise exception 'Teilnehmerzeile nicht gefunden'
      using errcode = '42704';
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

  -- v_ziel ist nullable (Gastzeilen ohne Konto). Beide Vergleiche ergeben dann
  -- NULL statt true, der Zweig greift also nicht — gewollt: ein Gast ohne
  -- Konto ist weder der Aufrufer noch der Ersteller.
  if v_ziel = auth.uid() then
    raise exception 'Nutze "Jagd verlassen", um selbst auszutreten'
      using errcode = '22023';
  end if;

  if v_ziel = v_creator then
    raise exception 'Der Ersteller der Jagd kann nicht entfernt werden'
      using errcode = '22023';
  end if;

  update hunt_participants
     set status      = 'left',
         entfernt_am = now(),
         left_at     = coalesce(left_at, now())
   where id = p_participant_id;

  -- Der row_count-Riegel steht NUR hier. Die Aufräumschritte unten treffen
  -- legitim 0 Zeilen, wenn jemand weder Live-Position noch Standbezug noch
  -- Chatmitgliedschaft hatte — dort wäre er ein Fehlalarm.
  get diagnostics betroffen = row_count;
  if betroffen = 0 then
    raise exception 'Teilnehmer konnte nicht entfernt werden';
  end if;

  delete from positions_current where participant_id = p_participant_id;
  delete from hunt_stand_bezug  where participant_id = p_participant_id;

  -- Nur offene Treiben. Abgeschlossene behalten ihre Historie ("wer stand
  -- wo"), laufende verlieren den Geist in der Standzuteilung.
  update hunt_drive_stands
     set participant_id = null
   where participant_id = p_participant_id
     and drive_id in (
       select d.id from hunt_drives d
        where d.hunt_id = v_hunt
          and d.status <> 'completed'
     );

  -- ⚠ `hunt_seat_assignments` hängt an `user_id`, NICHT an `participant_id`
  -- (gemessen: die Tabelle hat gar keine solche Spalte). Es gibt dorthin also
  -- weder einen Fremdschlüssel noch eine Kaskade, und die Zeile trägt mit
  -- `position_lat`/`position_lng` den freien Sitzplatz — der Entfernte stünde
  -- sonst weiter auf der Sitzordnung, und die PWA zeichnet seinen Punkt ohne
  -- jede Statusprüfung (Fremdprüfung M4, `app/app/hunt/[id]/page.tsx:167`).
  delete from hunt_seat_assignments
   where hunt_id = v_hunt
     and user_id = v_ziel;

  -- Anders als beim freiwilligen Verlassen (dort bleibt der Chat, Moritz'
  -- Entscheidung vom 21.08.2026) nimmt der Rauswurf die Gruppe mit
  -- (Moritz, 20.09.2026). Bei einem Gast ohne Konto ist v_ziel null, die
  -- Bedingung ergibt NULL und trifft keine Zeile — das ist richtig, denn ohne
  -- Konto gibt es keine Mitgliedschaft.
  delete from chat_group_members
   where user_id = v_ziel
     and group_id in (select g.id from chat_groups g where g.hunt_id = v_hunt);
end;
$$;

comment on function public.teilnehmer_entfernen(uuid) is
  'Der Jagdleiter entfernt einen Teilnehmer (128, CN-206). Setzt left + '
  'entfernt_am und räumt Live-Position, Standbezug, offene Standzuteilungen '
  'und die Chatmitgliedschaft. Als RPC, weil ein Jagdleiter positions_current '
  'und hunt_stand_bezug eines Fremden per RLS nicht anfassen darf.';

revoke execute on function public.teilnehmer_entfernen(uuid)
  from public, anon, service_role;
grant execute on function public.teilnehmer_entfernen(uuid) to authenticated;

commit;

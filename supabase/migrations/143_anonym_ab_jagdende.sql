-- 143: Anonym ab Jagdende — der Anonym-Schalter wirkt nicht mehr rueckwirkend
-- auf beendete Jagden (CN-391).
--
-- ANLASS: Moritz, 16.10.2026: "Mache ich morgen mit meinen Freunden eine Jagd
-- nicht anonym und stelle nach der Jagd wieder auf anonym darf es fuer die
-- Jagd mit den Freunden ja nicht nachtraeglich wirken."
-- Bauplan (F14 geprueft, GELOCKT V1.2 16.10.2026):
--   quickhunt-native/docs/konzepte/QuickHunt_Bauplan_Anonym_ab_Jagdende_V1.md
-- Begruendung und Pruefkette: quickhunt-native/docs/migrationen/143_anonym_ab_jagdende.md
--
--
-- DIE REGEL IN FUENF SAETZEN
--
-- 1. `hunt_participants.anonym_fest`: so stand die Person beim Jagdende
--    (`profiles.anonymize_kills`). NULL = Jagd offen oder Gast ohne Konto;
--    dann gilt der Schalter. Wirksam ist ueberall
--    `anonym_fest ?? profiles.anonymize_kills` — die Clients lesen BEIDE
--    Werte aus derselben Teilnahmezeile (Bauplan E4).
-- 2. Festgehalten wird beim UEBERGANG aus einem offenen Status nach
--    `completed`/`auto_completed` (E2) — nicht bei `auto_completed ->
--    completed`, das `endHunt` ohne Statusfilter schreibt. Sonst hielte ein
--    zweites Beenden den Schalter von jetzt fest: eine Rueckwirkung durch die
--    Hintertuer. Erfasst alle sieben Wege ins Ende (App 2, PWA 2, Cron 2,
--    `konto_loeschen`), denn alle setzen `status` selbst.
-- 3. Eine Teilnahme, die in eine BEENDETE Jagd eingefuegt wird (Einladen
--    geht dort in beiden Clients), bekommt den Wert beim Anlegen (E3a). Die
--    Jagdzeile wird dabei FOR SHARE gelesen: sonst liest ein Einladen
--    "offen", das gleichzeitige Jagdende sieht die ungespeicherte Zeile nicht,
--    und sie bleibt fuer immer NULL (Codex B1-6; lokal in beiden
--    Reihenfolgen gemessen, ohne die Sperre beide Male NULL).
-- 4. Clients (`authenticated`, `anon`) aendern weder `anonym_fest` noch
--    `user_id` einer Teilnahme (E3b). Ersteller und Jagdleiter haben ALL auf
--    `hunt_participants`; ohne den Riegel schrieben sie den Festwert um oder
--    haengten ihn per `user_id` an eine andere Person. Niemand aendert
--    `user_id` heute (beide Repos, alle Migrationen gemessen).
-- 5. Bestand: alle Teilnahmen mit Konto in beendeten Jagden bekommen einmalig
--    den heutigen Stand (Moritz: "einmalig den heutigen Stand").
--
--
-- RECHTE UND REIHENFOLGE
--
-- Festhalten (E2) und Anlegen (E3a) sind SECURITY DEFINER wie die Vorbilder
-- `close_drives_on_hunt_end` (056) und `clear_stand_bezug_on_hunt_end` (065):
-- das Festhalten erreicht so jede Zeile der Jagd, das Anlegen sperrt die
-- Jagdzeile, ohne an der UPDATE-Policy des Einladenden zu haengen. Der Schutz
-- (E3b) ist INVOKER wie `hunts_gesichert_nur_per_rpc` — nur so steht die
-- aufrufende Rolle in `current_user`. Innerhalb der DEFINER-Funktionen und im
-- Cron ist `current_user` = postgres, der Schutz laesst sie durch.
-- E3a feuert nur bei INSERT, E3b nur bei UPDATE: zwischen ihnen gibt es keine
-- alphabetische Reihenfolge. Die uebrigen BEFORE-Trigger auf
-- `hunt_participants` (entfernt_am, jagd_fest, kontakt) fassen weder
-- `anonym_fest` noch `user_id` noch `hunt_id` an.
-- EXECUTE namentlich entzogen (AGENTS.md: FROM PUBLIC allein entzieht bei
-- Supabase nichts). Postgres prueft EXECUTE beim ANLEGEN des Triggers, nicht
-- beim Feuern (082).
--
--
-- BENANNT (Bauplan §3, §5)
--
-- * Sperrkreis: Das Festhalten sperrt erst die Jagd (das UPDATE), dann die
--   Teilnahmen; `konto_loeschen` erst die eigenen Teilnahmen (133:576), dann
--   alle eigenen Jagden (133:592). Beendet ein Jagdleiter die Jagd eines
--   Loeschenden waehrend dessen Loeschung, bricht Postgres eine Seite mit
--   40P01 ab — laut, ohne halbe Daten, `konto_loeschen` ist wiederholbar.
--   Ebenso der Upsert der Zentrale (`liste.tsx:246`, Jagd FOR SHARE -> eigene
--   Teilnahme) gegen eine gleichzeitige Loeschung DESSELBEN Kontos.
-- * Ein Ersteller kann eine Teilnahme loeschen und neu anlegen; E3a bestimmt
--   den Wert dann aus dem Schalter von jetzt (CN-395, hingenommen nach F-A/F-B).
-- * Kein Weg oeffnet eine beendete Jagd wieder. Geschaehe es, blieben die
--   Werte bis zum naechsten Ende stehen (CN-394).
-- * Revierbesitzer ohne Teilnahme sehen `hunt_participants` nicht und fielen
--   auf den Schalter zurueck; kein Client zeigt ihnen heute fremde Erlegungen
--   (CN-393).
-- * Additiv: bis App und PWA die Spalte lesen, bleibt die Anzeige live, also
--   wie heute. Aeltere App-Versionen lesen weiter live (Bauplan E8).
--
--
-- ⚠ DIESE DATEI TRAEGT BEWUSST KEIN `\set ON_ERROR_STOP on` (120-Muster).
-- Ueber psql:
--   psql -X -v ON_ERROR_STOP=1 -c "set lock_timeout = '5s'" \
--        -c "set statement_timeout = '120s'" -f 143_anonym_ab_jagdende.sql
-- Registrierung dann von Hand nachtragen.
-- ⚠ GEZIELT APPLIZIEREN, nie ueber "alle ausstehenden" (115, T9).

begin;

-- ---------------------------------------------------------------------------
-- 0. Sperr-Reihenfolge: ERST `hunt_participants`, dann `hunts` —
--    die ABSCHNITTE NICHT UMSTELLEN
-- ---------------------------------------------------------------------------
-- Die Reihenfolge ergibt sich aus der Datei selbst: Abschnitt 1 (`alter
-- table`) nimmt ACCESS EXCLUSIVE auf `hunt_participants`, erst Abschnitt 2
-- (`create trigger … on hunts`) nimmt SHARE ROW EXCLUSIVE auf `hunts`. Ein
-- eigenes `lock table` braucht es deshalb nicht (Ponytail; bei 142 war es
-- noetig, weil dort das ALTER die andere Tabelle zuerst traf).
-- ⚠ BEWUSST UMGEKEHRT ZU 142 M2 — gemessen 16.10.2026, nicht abgeschrieben.
-- Der haeufige Live-Verkehr einer laufenden Jagd sperrt TEILNAHMEN, DANN JAGD:
-- `positions_current`, `kills`, `messages`, `wild_events` beruehren
-- `hunt_participants` (Fremdschluessel `participant_id`, `set_kill_herkunft`,
-- `pruefe_wild_event_zuordnung`) und schreiben danach per
-- `update_hunt_last_activity` in `hunts`. Sperrte die Migration zuerst
-- `hunts` (SHARE ROW EXCLUSIVE), hielte eine Positionsmeldung schon
-- `hunt_participants` und wartete auf `hunts` — und die Migration auf sie
-- (40P01).
-- In dieser Reihenfolge wartet die Migration, bis laufende Meldungen fertig
-- sind; danach kommt keine neue an `hunt_participants` vorbei.
-- Gegenrichtung (Jagd, dann Teilnahmen): ein Client-UPDATE auf `hunts`, dessen
-- Policy `hunt_participants` liest (Jagd beenden, Jagd bearbeiten) — selten,
-- und dann laut. Deshalb zusaetzlich: applizieren, wenn keine Jagd laeuft
-- (Begruendung, „Apply-Weg").

-- ---------------------------------------------------------------------------
-- 1. Die Spalte (E1)
-- ---------------------------------------------------------------------------
alter table public.hunt_participants
  add column anonym_fest boolean;

-- ---------------------------------------------------------------------------
-- 2. Festhalten beim Uebergang ins Ende (E2)
-- ---------------------------------------------------------------------------
create function public.anonym_beim_jagdende_festhalten()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Alle Teilnahmen mit Konto, gleich welcher Status (eingeladen, abgesagt,
  -- gegangen): auch Eingeladene koennen melden (`set_kill_herkunft`). Gaeste
  -- ohne Konto finden kein Profil und bleiben NULL.
  update public.hunt_participants hp
     set anonym_fest = p.anonymize_kills
    from public.profiles p
   where hp.hunt_id = new.id
     and p.id = hp.user_id;
  return new;
end;
$$;

revoke execute on function public.anonym_beim_jagdende_festhalten()
  from public, anon, authenticated, service_role;

-- `hunts.status` ist nullable — `old.status is null` ist lebender Code, ohne
-- ihn machte ein NULL die Bedingung lautlos falsch.
create trigger trg_hunts_anonym_fest
  after update of status on public.hunts
  for each row
  when (new.status in ('completed', 'auto_completed')
        and (old.status is null or old.status not in ('completed', 'auto_completed')))
  execute function public.anonym_beim_jagdende_festhalten();

-- ---------------------------------------------------------------------------
-- 3. Anlegen: der Server bestimmt den Wert (E3a)
-- ---------------------------------------------------------------------------
create function public.teilnahme_anonym_fest_anlegen()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status public.hunt_status;
begin
  -- FOR SHARE kollidiert mit der Zeilensperre des Status-UPDATEs (FOR NO KEY
  -- UPDATE), die Fremdschluesselpruefung (FOR KEY SHARE) nicht. Liest das
  -- Einladen zuerst, wartet das Jagdende, bis die Teilnahme gespeichert ist,
  -- und haelt sie mit fest. Sperrt das Jagdende zuerst, wartet das Einladen
  -- und liest danach die neue Fassung: "beendet".
  select h.status into v_status
    from public.hunts h
   where h.id = new.hunt_id
     for share;

  -- Ein mitgeschickter Wert wird immer ueberschrieben. Offene Jagd -> NULL.
  -- Gast (user_id NULL) -> kein Profil -> NULL. Fehlt die Jagd, ist
  -- v_status NULL, und der Fremdschluessel lehnt die Zeile danach ab.
  new.anonym_fest := case
    when v_status in ('completed', 'auto_completed') then
      (select p.anonymize_kills from public.profiles p where p.id = new.user_id)
  end;
  return new;
end;
$$;

revoke execute on function public.teilnahme_anonym_fest_anlegen()
  from public, anon, authenticated, service_role;

create trigger trg_teilnehmer_anonym_fest_anlegen
  before insert on public.hunt_participants
  for each row
  execute function public.teilnahme_anonym_fest_anlegen();

-- ---------------------------------------------------------------------------
-- 4. Schutz: Clients aendern weder `anonym_fest` noch `user_id` (E3b)
-- ---------------------------------------------------------------------------
create function public.teilnahme_anonym_fest_schutz()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- `is distinct from`: ein Upsert, der denselben Wert schreibt (Zentrale,
  -- `liste.tsx:246`, setzt `user_id` auf sich selbst), kommt durch.
  if current_user in ('authenticated', 'anon')
     and (new.anonym_fest is distinct from old.anonym_fest
          or new.user_id is distinct from old.user_id) then
    raise exception 'anonym_fest und user_id einer Teilnahme setzt nur der Server'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.teilnahme_anonym_fest_schutz()
  from public, anon, authenticated, service_role;

create trigger trg_teilnehmer_anonym_fest_schutz
  before update of anonym_fest, user_id on public.hunt_participants
  for each row
  execute function public.teilnahme_anonym_fest_schutz();

-- ---------------------------------------------------------------------------
-- 5. Bestand: einmalig der heutige Stand (E6)
-- ---------------------------------------------------------------------------
-- Laeuft als postgres, der Schutz (4) laesst es durch. psql meldet die Zahl
-- (`UPDATE n`, erwartet 18); gezaehlt wird im Probelauf vorher/nachher.
update public.hunt_participants hp
   set anonym_fest = p.anonymize_kills
  from public.profiles p, public.hunts h
 where p.id = hp.user_id
   and h.id = hp.hunt_id
   and h.status in ('completed', 'auto_completed');

-- ---------------------------------------------------------------------------
-- 6. Kommentare
-- ---------------------------------------------------------------------------
comment on column public.hunt_participants.anonym_fest is
  'CN-391 (143): profiles.anonymize_kills beim Jagdende. NULL = Jagd offen oder Gast ohne Konto (dann gilt der Schalter). Wirksam: anonym_fest ?? profiles.anonymize_kills, beide aus derselben Zeile. Nur der Server schreibt (trg_hunts_anonym_fest, trg_teilnehmer_anonym_fest_anlegen).';
comment on function public.anonym_beim_jagdende_festhalten() is
  'CN-391 (143): AFTER UPDATE OF status auf hunts — haelt beim Uebergang aus einem offenen Status ins Ende anonymize_kills je Teilnahme fest.';
comment on function public.teilnahme_anonym_fest_anlegen() is
  'CN-391 (143): BEFORE INSERT auf hunt_participants — bestimmt anonym_fest (beendete Jagd: Schalter von jetzt, sonst NULL); liest die Jagd FOR SHARE gegen das Rennen mit dem Jagdende.';
comment on function public.teilnahme_anonym_fest_schutz() is
  'CN-391 (143): BEFORE UPDATE OF anonym_fest, user_id auf hunt_participants — authenticated/anon aendern beides nicht (42501).';

commit;

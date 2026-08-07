-- 111_jagdtag_notizen.sql
-- Nativer Track, 07.08.2026. Setzt nichts voraus ausser `hunts` (003).
--
-- WOFUER
-- ------
-- Die Tagesnotiz im Jagdtagebuch. Moritz, 07.08.2026: „notiz muss eintragbar
-- sein wenn der schuetze ein paar saetze zu dem tag schreiben will."
--
-- Eine Zeile je Mensch und Jagd. Der Leser ist die Jagdtag-Seite des nativen
-- Tagebuchs (Konzept: quickhunt-native/docs/konzepte/
-- QuickHunt_Konzept_Jagdtagebuch_Detail_V1.md).
--
--
-- WARUM NICHT `hunts.notiz` — DIE SPALTE EXISTIERT UND IST TROTZDEM FALSCH
-- -----------------------------------------------------------------------
-- Das ist der Befund, der den ganzen Entwurf traegt, und er hat zwei Haelften.
--
-- (1) **Der Schuetze darf sie nicht schreiben.** Eine `hunts`-Zeile AENDERN
--     duerfen genau zwei Policies: `hunts_creator_all` (`for all`,
--     `creator_id = auth.uid()`) und `hunts_leader_update` (ueber
--     `get_my_joined_hunt_ids_as_leader()`). Ein Gast auf einer FREMDEN
--     Drueckjagd faellt durch beide und bekommt `42501` — also genau der Fall,
--     fuer den Moritz die Notiz will.
--     (Schreibend im weiteren Sinn ist noch `hunts_delete_own` (DELETE), aber
--     die spielt fuer „darf ich hier Text hineinschreiben" keine Rolle. Der
--     erste Entwurf sagte pauschal „genau zwei Policies" und war damit
--     ungenau — Schlusslesung 07.08.2026.)
--
-- (2) **Selbst mit Schreibrecht waere es EIN Feld auf einer GETEILTEN Zeile.**
--     Zwoelf Gaeste auf einer Drueckjagd haetten eine einzige Notiz: der
--     zweite ueberschreibt den ersten, und jeder liest die Erinnerungen aller.
--     Fuer ein persoenliches Tagebuch ist das kein Nebeneffekt, sondern ein
--     Datenschutzfehler.
--
-- **Dass es heute nicht auffaellt, ist Bestandszufall — gemessen am
-- 07.08.2026: 0 von 22 Erlegungen liegen auf einer fremden Jagd.** Jeder
-- Melder ist zugleich Ersteller der Jagd, also greift (1) nirgends und (2)
-- nie. Mit der ersten echten Drueckjagd im Oktober ist beides vorbei.
--
-- `hunts.notiz` bleibt unangetastet. Sie ist die Notiz AN DER JAGD (heute in
-- 0 von 25 Zeilen gesetzt) und gehoert dem, der die Jagd fuehrt; diese hier
-- ist die Notiz EINES MENSCHEN ZU SEINEM TAG. Zwei Dinge, zwei Spalten.
--
--
-- WARUM NICHT `hunt_participants.notiz`
-- -------------------------------------
-- Das waere die Tabelle mit der richtigen Kardinalitaet — eine Zeile je Mensch
-- und Jagd, und im Bestand hat jede Jagd eine Teilnehmerzeile ihres Erstellers
-- und jede Erlegung eine ihres Melders (**0 Ausnahmen**, gemessen).
--
-- Und sie waere die falsche Wahl, weil ihr eine Berechtigung entspringt:
-- `role`, `status` und `tags` stehen dort, und `get_my_joined_hunt_ids_as_leader()`
-- liest `role`. Es gibt heute **keine** UPDATE-Policy fuer die eigene Zeile
-- (`participants_own_row` ist nur SELECT) — eine muesste also dazukommen, und
-- eine Bedingung `user_id = auth.uid()` liesse einen Gast sich selbst auf
-- `role = 'jagdleiter'` setzen. Danach schreibt er `hunts`, `hunt_drives`,
-- `hunt_drive_stands` und die Teilnehmerzeilen aller anderen.
--
-- Das ist woertlich die Regel aus AGENTS.md: „Leitet sich eine Berechtigung
-- aus einer Tabellenzeile ab, ist die Frage nicht ‚wer darf lesen', sondern
-- ‚wer darf diese Zeile schreiben'." Ein Riegel-Trigger nach dem Muster
-- 085/087 koennte die drei Spalten einfrieren — aber eine Tabelle ohne jede
-- Berechtigungslast ist der kleinere Eingriff und die kleinere Angriffsflaeche.
--
--
-- WARUM `on delete cascade` AUF `auth.users` UND NICHT `restrict` WIE 110
-- ----------------------------------------------------------------------
-- Nachgesehen, nicht geraten: CASCADE ist die Hauskonvention. Alle
-- Projekttabellen mit einem Bezug auf `auth.users` fahren sie — `kontakte`,
-- `wildarten`, `hunt_photos`, `wild_events`, `profiles`, `user_settings`,
-- `push_subscriptions`, `kontakt_mitfuehrende` (zweimal).
--
-- `historische_strecken` (110) ist die EINZIGE Ausnahme, und ihr Grund traegt
-- hier nicht: eine 80-Jahre-Chronik mit 209 namentlichen Erlegern soll ein
-- geloeschtes Konto ueberleben, weil sie von Menschen handelt, die es nie
-- hatten. Eine persoenliche Tagesnotiz ist das Gegenteil — sie gehoert genau
-- diesem Menschen, ist nur fuer ihn lesbar, und ohne ihn liest sie niemand
-- mehr. Sie mit RESTRICT zu versehen hiesse, ein Konto unloeschbar zu machen,
-- damit ein Text ueberlebt, den niemand sehen darf.
--
--
-- AUF `hunts` EBENFALLS CASCADE — UND DIE BEGRUENDUNG IST NICHT 109
-- ----------------------------------------------------------------
-- Der erste Entwurf schrieb hier „dieselbe Richtung wie 109". **Das war
-- falsch begruendet, und die Fremdpruefung vom 07.08.2026 hat es als [hoch]
-- gefunden:** in 109 gehoeren Eltern (`hunting_licenses`) und Kind
-- (`schein_zahlungen`) DEMSELBEN Menschen — der Revierbesitzer loescht seine
-- eigene Quittung. Hier gehoert das Kind einem ANDEREN: der Jagdersteller
-- loescht die private Notiz eines Gastes.
--
-- **Der Fall ist nicht theoretisch.** `hunts_delete_own` erlaubt dem Ersteller
-- die Loeschung (003), und die PWA loescht Jagden OHNE ERLEGUNG tatsaechlich
-- hart (`app/app/home-content.tsx:364`, `.from('hunts').delete()`). Eine Jagd
-- ohne Erlegung ist genau die, zu der jemand „nichts gesehen, schoener Tag"
-- schreibt. **Die Zeile in AGENTS.md, „kein Client loescht Jagden, beide
-- beenden sie nur", ist damit ueberholt** und dort korrigiert.
--
-- CASCADE bleibt trotzdem, und der Grund steht in der Produktion. An `hunts`
-- haengen **13 Fremdschluessel**, gemessen am 07.08.2026, in **DREI** Gruppen:
--
--   * **NO ACTION (3) — blockieren die Loeschung:** `kills`, `observations`,
--     `tracking_requests`. Die drei fachlichen Aufzeichnungen.
--   * **CASCADE (9) — gehen mit:** `chat_groups`, `hunt_drives`,
--     `hunt_participants`, `hunt_photos`, `hunt_seat_assignments`,
--     `hunt_stand_bezug`, `messages`, `positions`, `positions_current`.
--     Darunter **`hunt_photos` und `messages` — also fremde Fotos und fremde
--     Chatnachrichten.** Das Projekt nimmt fremden Nutzerinhalt an einer Jagd
--     seit 003 mit.
--   * **SET NULL (1): `wild_events.hunt_id`.** Die Zeile bleibt stehen und
--     verliert ihren Jagdbezug — die **stille Waise**, vor der die SQL-Regeln
--     in AGENTS.md ausdruecklich warnen („CASCADE und NO ACTION melden sich
--     selbst, SET NULL erzeugt stille Waisen"), und die bei der
--     Brockwinel-Loeschung am 04.08.2026 nur deshalb nicht entstand, weil
--     `trg_kills_sync_wild_event` sie mitnahm.
--     **Der erste Entwurf zaehlte „13" und listete 12 — diese eine fehlte**
--     (Schlusslesung 07.08.2026). Wer diese Datei beim naechsten Anker-2-Lauf
--     als Fremdschluessel-Referenz liest, braucht ausgerechnet sie.
--
-- Eine Tagesnotiz ist keine fachliche Aufzeichnung, sondern geschriebener
-- Text an einer Jagd — dieselbe Bauform wie eine Chatnachricht. Sie gehoert
-- also in die zweite Gruppe.
--
-- **Der zweite Grund ist der staerkere: eine verwaiste Notiz haette keine
-- Seite mehr.** Die Tagebuch-Eintragung IST die Jagd; ohne die `hunts`-Zeile
-- entsteht kein Jagdtag, auf dem die Notiz erscheinen koennte. NO ACTION
-- bewahrte also Bytes, keine Erinnerung — und machte zugleich eine Jagd fuer
-- ihren Ersteller unloeschbar, wegen einer Zeile, die er nicht sehen darf.
-- SET NULL scheitert ohnehin an `not null` und am Primaerschluessel.
--
-- **Was daraus folgt, gehoert in den Backlog und nicht in diese Datei:** die
-- PWA-Loeschung nimmt heute schon fremde Fotos und Nachrichten mit, ohne das
-- zu sagen. Das ist S5 (irreversibel und ungefragt) und betrifft drei
-- Tabellen mehr als diese.
--
--
-- KEIN RIEGEL GEGEN EINE FREMDE `hunt_id` — ANDERS ALS BEI 106
-- ------------------------------------------------------------
-- 106 haengt an `hunt_participants.kontakt_id` einen Invoker-Trigger, weil
-- dort ein `uuid` ohne Eigentumspruefung stuende, an dem spaeter etwas haengen
-- koennte. Hier haengt daran nichts: die Notiz gehoert ihrem Verfasser, die
-- `hunt_id` ordnet sie nur zu, und eine Jagd, die der Nutzer nicht sieht,
-- liefert ihm auch keinen Tagebucheintrag, an dem die Notiz erscheinen wuerde.
--
-- **Benannt, nicht uebersehen:** der Fremdschluessel macht die Tabelle zu
-- einem Existenz-Orakel fuer `hunts.id` — ein INSERT auf eine erfundene id
-- wirft `23503`, auf eine echte nicht. Bei uuid-Schluesseln ist das nicht
-- ausnutzbar (es gibt nichts zu erraten), und es gilt fuer jeden
-- Fremdschluessel im Schema gleichermassen.
--
--
-- `update_updated_at()` WIRD WIEDERVERWENDET, NICHT NEU GESCHRIEBEN
-- ----------------------------------------------------------------
-- Die Funktion existiert seit langem und haengt an acht Tabellen
-- (`districts`, `driven_hunts`, `hunting_licenses`, `hunts`, `kills`,
-- `kontakte`, `profiles`, `user_settings`). Sie ist SECURITY INVOKER, und
-- **EXECUTE ist `anon`, `authenticated` und `service_role` bereits entzogen**
-- (082, gegengeprueft am 07.08.2026). Es braucht also weder einen neuen
-- Funktionskoerper noch einen neuen REVOKE — und der Trigger feuert trotzdem,
-- weil Postgres EXECUTE beim ANLEGEN des Triggers prueft, nicht beim Feuern.
--
--
-- BEWUSST NICHT DABEI
-- -------------------
-- * **Kein Index.** Der Primaerschluessel `(besitzer_id, hunt_id)` traegt die
--   Abfrage des Clients („die Notiz dieses Menschen zu dieser Jagd"). Die
--   Tabelle startet mit 0 Zeilen.
--   **Es gibt aber eine ZWEITE Abfrage, und der Primaerschluessel traegt sie
--   nicht** (Schlusslesung 07.08.2026): die CASCADE-Loeschung einer Jagd sucht
--   Kindzeilen allein ueber `hunt_id`, und ein Index mit fuehrendem
--   `besitzer_id` hilft dabei nicht — es wird ein Seq-Scan. Bei 0 Zeilen
--   folgenlos; ein FK-Index auf `hunt_id` wird faellig, wenn die Tabelle
--   waechst. Der erste Entwurf sagte „die einzige Abfrage" und war falsch.
-- * **Kein Surrogatschluessel `id`** — s. die Begruendung am Constraint.
--   `updated_at` bleibt dagegen, obwohl es heute auch keinen Leser hat: ein
--   Zeitstempel laesst sich NIE nachtragen. Kaeme die Spalte spaeter, truegen
--   alle Altzeilen `now()` und logen. Dieselbe Begruendung wie fuer
--   `inaktiv_seit` in 100.
-- * **Keine Laengengrenze am Text.** `hunts.notiz` und `kills.notiz` haben
--   auch keine; eine Zahl hier waere erfunden. Die Zeile ist nur fuer ihren
--   Verfasser schreib- und lesbar.
-- * **Kein `erfasst_von`.** `besitzer_id` IST der Verfasser.
-- * **Keine Notiz am STUECK.** `kills.notiz` existiert und ist ueber
--   `kills_reporter` vom Melder beschreibbar — dafuer braucht es kein DDL.
-- * **Kein Teilen.** Die Notiz ist privat. Ein spaeteres „mit der Jagd teilen"
--   waere eine zusaetzliche Spalte und eine zusaetzliche SELECT-Policy, kein
--   Umbau.
--
--
-- DREI EIGENSCHAFTEN, DIE BENANNT UND NICHT GEHEILT WERDEN
-- --------------------------------------------------------
-- Alle drei aus der Fremdpruefung vom 07.08.2026, alle bewusst so gelassen.
--
-- (1) **Last-Write-Wins.** Der Client schreibt per `upsert` auf
--     `(besitzer_id, hunt_id)`. Zwei gleichzeitige Sitzungen — Handy und PWA —
--     werden serialisiert, die zweite ueberschreibt die erste vollstaendig;
--     es gibt kein Compare-and-Swap ueber `updated_at`. Derselbe Tausch wie in
--     101 (`wildart_favoriten`), aus demselben Grund: es ist EIN Feld, das
--     EIN Mensch schreibt, und der Preis ist ein verlorener Absatz, nicht eine
--     verlorene Berechtigung. **Die Grenze aus 101 gilt hier ebenso: LWW darf
--     NICHT mitwandern**, sobald mehrere Menschen dieselbe Zeile schreiben.
--
-- (2) **`create table if not exists` ist wiederholbar, aber nicht
--     konvergent.** Existiert die Tabelle bereits in einer ABWEICHENDEN
--     Gestalt — ohne Primaerschluessel, mit einem anderen CHECK —, ueberspringt
--     die Anweisung die ganze Definition und meldet trotzdem Erfolg. Der
--     Leertext-Riegel oder der Upsert-Zielpunkt koennten dann fehlen, ohne dass
--     etwas warnt. 109 benennt dieselbe Einschraenkung; hier steht sie jetzt
--     auch. Die Gegenprobe nach dem Applizieren liest deshalb die Constraints
--     aus dem Katalog statt sich auf den Exit-Code zu verlassen.
--
-- (3) **`created_at` ist kein Nachweis.** Der Default greift nur, wenn der
--     Aufrufer die Spalte auslaesst; der Besitzer kann sie beim INSERT setzen
--     und per UPDATE aendern. Dieselbe Feststellung wie in 109 und bei
--     `inaktiv_seit` in 100 — daran haengt keine Berechtigung, und die Zeile
--     ist ohnehin nur fuer ihren Verfasser lesbar. `updated_at` ist dagegen
--     verlaesslich, s. den Trigger unten.

create table if not exists public.jagdtag_notizen (
  besitzer_id uuid not null references auth.users(id) on delete cascade,
  hunt_id     uuid not null references public.hunts(id) on delete cascade,
  notiz       text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- KEIN Surrogatschluessel `id`, und das ist eine bewusste Abweichung von den
  -- uebrigen Tabellen dieses Schemas (Ponytail-Lesung 07.08.2026). Auf diese
  -- Tabelle zeigt kein Fremdschluessel, und der Client adressiert die Zeile
  -- ausschliesslich ueber (Mensch, Jagd) — er liest sie zur Jagdtag-Seite und
  -- schreibt sie per upsert auf genau dieses Paar. Ein `id uuid` daneben waere
  -- eine Spalte plus ein Index ohne Leser.
  --
  -- Der zusammengesetzte Schluessel IST damit zugleich die Regel „eine Notiz je
  -- Mensch und Jagd". Ohne sie koennte derselbe Mensch zwei Notizen zu
  -- demselben Tag anlegen, und die Anzeige muesste raten, welche sie zeigt.
  -- `on conflict (besitzer_id, hunt_id)` greift auf einen Primaerschluessel
  -- genauso wie auf einen Unique-Constraint.
  constraint jagdtag_notizen_pk primary key (besitzer_id, hunt_id),

  -- Eine leere Notiz ist keine. Der Client loescht die Zeile, statt sie auf ""
  -- zu setzen — sonst stuende im Tagebuch ein Abschnitt „Notiz" ueber nichts.
  --
  -- **Das ZWEITE Argument von `btrim` ist Pflicht, und der erste Entwurf hatte
  -- es nicht** (Fremdpruefung 07.08.2026, [niedrig]): `btrim(text)` ohne
  -- Zeichenmenge entfernt **nur gewoehnliche Leerzeichen**. Ein Zeilenumbruch
  -- oder ein Tabulator allein haette den CHECK passiert und im Tagebuch einen
  -- Abschnitt „Notiz" ueber nichts erzeugt — genau der Zustand, gegen den der
  -- CHECK gebaut ist. Der Kommentar der ersten Fassung behauptete das
  -- Gegenteil.
  --
  -- Bewusst NICHT in der Menge: NBSP (U+00A0) und Zero-Width-Space (U+200B).
  -- Eine Zeichenliste, die jeden Unicode-Leerraum aufzaehlt, ist eine Stelle,
  -- die jede spaetere Unicode-Version mitpflegen muesste — dieselbe Falle wie
  -- der Spalten-aufzaehlende CHECK aus 105. Der Client trimmt vor dem
  -- Schreiben und loescht die Zeile statt sie zu leeren; dieser CHECK ist der
  -- zweite Riegel, nicht der einzige.
  --
  -- **Die Begruendung lautete zuerst „wer die tippt, tut es absichtlich" — und
  -- sie ist bei der Gegenprobe am 07.08.2026 an mir selbst widerlegt worden:**
  -- in die Testeingabe war unbemerkt ein NBSP geraten (per `xxd` als `c2 a0`
  -- nachgewiesen), und die Probe ging als einzige von sechs durch. Ein NBSP
  -- entsteht also sehr wohl versehentlich. In Kauf genommen bleibt es
  -- trotzdem: der Schaden ist ein leerer Abschnitt „Notiz" im Tagebuch, und
  -- der Preis waere eine wachsende Zeichenliste in einem CHECK.
  constraint jagdtag_notizen_nicht_leer
    check (btrim(notiz, E' \t\r\n') <> '')
);

comment on table public.jagdtag_notizen is
  'Persoenliche Tagesnotiz zu einer Jagd (111, 07.08.2026). Eine Zeile je Mensch und '
  'Jagd, NUR fuer ihren Verfasser sicht- und schreibbar. Bewusst NICHT hunts.notiz: '
  'die gehoert der Jagd und ist fuer einen Gast nicht schreibbar (42501), und ein '
  'geteiltes Feld liesse zwoelf Gaeste einander ueberschreiben. KEIN '
  'Berechtigungstraeger; keine Policy einer anderen Tabelle darf diese hier auswerten.';

comment on column public.jagdtag_notizen.hunt_id is
  'Die Jagd, zu der die Notiz gehoert. BEWUSST ohne Pruefung, ob der Verfasser die Jagd '
  'sehen darf — daran haengt keine Berechtigung, und eine unsichtbare Jagd erzeugt '
  'keinen Tagebucheintrag, an dem die Notiz erscheinen koennte. Anders als '
  'hunt_participants.kontakt_id (106), wo ein Trigger noetig war.';

comment on column public.jagdtag_notizen.notiz is
  'Freitext des Verfassers zum Jagdtag. Nur er liest ihn — anders als '
  'schein_zahlungen.notiz (109), die der Scheininhaber mitliest.';

alter table public.jagdtag_notizen enable row level security;

-- Vorsorglich: `create policy` kennt kein `if not exists`. Ohne diese vier
-- Zeilen verspraeche `create table if not exists` oben eine Wiederholbarkeit,
-- die die Datei zwei Absaetze spaeter wieder einreisst. Gegen eine frische
-- Datenbank faellt das nie auf, weil dort nichts kollidieren kann. Wortgleich
-- uebernommen aus 109.
drop policy if exists jagdtag_notizen_select on public.jagdtag_notizen;
drop policy if exists jagdtag_notizen_insert on public.jagdtag_notizen;
drop policy if exists jagdtag_notizen_update on public.jagdtag_notizen;
drop policy if exists jagdtag_notizen_delete on public.jagdtag_notizen;

-- ---------------------------------------------------------------------------
-- VIER POLICIES JE KOMMANDO, NICHT EINE `for all`
--
-- Dieselbe Begruendung wie 079, 109 und 110: eine `for all`-Policy prueft ihr
-- USING auch gegen die NEUE Zeile, und ein eigenes `with check` hebt das nicht
-- auf. Getrennte Policies sagen an jedem Kommando genau das, was dort gilt.
--
-- `to authenticated` ueberall: `anon` hat auf dieser Tabelle nichts zu suchen,
-- und ein Policy-Ausdruck ohne Rollenangabe laeuft fuer `anon` mit — er faende
-- dort `auth.uid() = null` und damit 0 Zeilen, aber die Absicht steht besser
-- in der Policy als in der Arithmetik von NULL.
-- ---------------------------------------------------------------------------

create policy jagdtag_notizen_select on public.jagdtag_notizen
  for select to authenticated
  using (besitzer_id = auth.uid());

create policy jagdtag_notizen_insert on public.jagdtag_notizen
  for insert to authenticated
  with check (besitzer_id = auth.uid());

-- USING **und** WITH CHECK auf dieselbe Bedingung: ohne das WITH CHECK koennte
-- der Verfasser seine Notiz per `set besitzer_id = <fremd>` verschenken und
-- damit eine Zeile in einem fremden Tagebuch anlegen.
create policy jagdtag_notizen_update on public.jagdtag_notizen
  for update to authenticated
  using (besitzer_id = auth.uid())
  with check (besitzer_id = auth.uid());

create policy jagdtag_notizen_delete on public.jagdtag_notizen
  for delete to authenticated
  using (besitzer_id = auth.uid());

-- ---------------------------------------------------------------------------
-- updated_at
--
-- **`before insert or update`, nicht nur `update`** — und der Zusatz stammt aus
-- der Fremdpruefung vom 07.08.2026 ([niedrig], P9). Nur auf UPDATE koennte der
-- Besitzer die Zeile mit einem beliebigen `updated_at` ANLEGEN (etwa 1999) und
-- den falschen Wert behalten, bis er sie das erste Mal aendert. Mit INSERT im
-- Ereignis setzt der Trigger ihn sofort auf `now()`, und die Spalte ist
-- verlaesslich — anders als `created_at`, s. den Kopf.
--
-- `update_updated_at()` taugt dafuer unveraendert: ihr Rumpf ist
-- `new.updated_at := now()`, was auf INSERT genau das Richtige tut. Es braucht
-- also weiterhin keinen eigenen Funktionskoerper.
--
-- `create trigger` kennt kein `if not exists` (auch in PG 17 nicht) — der
-- Vorlauf ist Pflicht, sonst ist die Datei beim zweiten Lauf nicht
-- wiederholbar. Dieselbe Falle wie in 039.
-- ---------------------------------------------------------------------------

drop trigger if exists trg_jagdtag_notizen_updated on public.jagdtag_notizen;

create trigger trg_jagdtag_notizen_updated
  before insert or update on public.jagdtag_notizen
  for each row execute function public.update_updated_at();

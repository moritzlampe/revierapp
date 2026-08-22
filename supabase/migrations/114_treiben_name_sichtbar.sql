-- ============================================================
-- 114 — Der Treiben-Name ist, was man sieht
-- PWA/Portal-Track, 22.08.2026
-- ============================================================
--
-- WAS DIESE MIGRATION TUT
--
--     alter table public.hunt_drives
--       add constraint hunt_drives_name_sichtbar
--       check (name = btrim(name, E' \t\r\n') and name <> '');
--
-- Zwei Glieder, ein Riegel: der gespeicherte Name ist gleich seiner eigenen
-- bereinigten Form, und er ist nicht leer.
--
--
-- WARUM ÜBERHAUPT (CP-64)
-- `hunt_drives.name` war `text not null` und sonst nichts. An der Produktion
-- gelesen, am 19.08. und am 22.08.2026 erneut: ausser `hunt_drives_pkey` und
-- `hunt_drives_hunt_id_fkey` hing an der Tabelle kein einziger Constraint.
-- Ein leerer Name war also nur deshalb unmöglich, weil BEIDE Clients ihn
-- verhindern — über PostgREST direkt ginge er durch.
--
-- Seit C-41/CP-61 (19.08.2026) ist der Client sogar strenger als die DB. Das
-- ist die ungefährliche Richtung — S2 wäre umgekehrt, ein Knopf, den die
-- Datenbank ablehnt —, aber es ist eine Divergenz, die niemand entschieden
-- hat.
--
-- 111 (`jagdtag_notizen.notiz`) und 112 (`standgruppen.name`) tragen den
-- Riegel längst. `hunt_drives` stammt aus der Zeit davor und hat den Schritt
-- nie mitgemacht.
--
--
-- WARUM DIE STRIKTE FORM UND NICHT DIE VORLAGE AUS 111/112
-- Die Vorlage lautet `check (btrim(name, E' \t\r\n') <> '')`. Sie verbietet
-- den GANZ leeren Namen und sonst nichts:
--
--     'Buchenkamp'   ok          'Buchenkamp '  ok         <-- und das ist CP-66
--     '   '          abgelehnt   ''             abgelehnt
--
-- „Buchenkamp " mit einem Leerzeichen am Ende IST CP-66, und die Vorlage
-- liesse ihn durch. Der Backlog behauptete, die DB-Grenze aus CP-64 mache
-- CP-66 unmöglich — das stimmt erst mit der Form, die hier steht.
--
-- DER FALL, DEN CP-66 BESCHREIBT: `treiben-bereich.tsx` vergleicht den
-- BEREINIGTEN Entwurf (`sichtbarerName(name)`) gegen den ROHEN DB-Wert
-- (`offen.name`). Trägt ein Treiben Randleerraum, ist `nameGeaendert` beim
-- blossen ÖFFNEN des Editors bereits true, der Speichern-Knopf sofort scharf,
-- und ein Klick schreibt still ein Namens-UPDATE, das niemand bestellt hat.
--
-- DER NAHELIEGENDE CLIENT-FIX IST EINE FALLE: zieht man `offen.name` vor dem
-- Vergleich ebenfalls durch `sichtbarerName`, wird ein bereits verunreinigter
-- Name UNBEREINIGBAR — man tippt die saubere Fassung, `nameGeaendert` bleibt
-- false, der Knopf tot, das Leerzeichen für immer drin. Deshalb sitzt der
-- Riegel hier und nicht dort: was gar nicht erst entstehen kann, braucht
-- keinen Vergleich, der es aufräumt.
--
-- DAS ZWEITE GLIED IST KEIN BEIWERK. `btrim('') = ''`, also ist
-- `name = btrim(name, …)` für den Leerstring WAHR. Ohne `and name <> ''` ginge
-- '' durch, und `not null` fängt ihn nicht — NULL und '' sind verschiedene
-- Dinge.
--
--
-- KEINE LÄNGENGRENZE, UND DAS IST EINE ENTSCHEIDUNG
-- 111 schreibt es wörtlich: „Keine Laengengrenze am Text. … eine Zahl hier
-- waere erfunden." `revier-name.tsx` hat sein `maxLength={200}` aus genau
-- diesem Grund gestrichen (Ponytail-Lesung). `districts.name`,
-- `standgruppen.name`, `hunts.notiz`, `kills.notiz` — keine dieser Spalten hat
-- eine Grenze. Eine hier wäre der erste Bruch mit dieser Linie im Projekt.
-- Bestand am 22.08.2026: 12 Treiben, längster Name 12 Zeichen.
--
-- FOLGE IM CLIENT, im selben Vorgang erledigt (CP-65): `maxLength={120}` fällt
-- in `treiben-bereich.tsx` an beiden Feldern weg. Die Zahl war erfunden, und
-- der Browser schnitt eingefügten Text still ab — der Editor speicherte den
-- gekürzten Namen und meldete Erfolg. Dieselbe S4-Familie wie C-41 selbst.
--
--
-- WAS DIESER RIEGEL NICHT SCHLIESST — BENANNT, NICHT GEHEILT
-- Der Client räumt mit `sichtbarerName()` mehr weg als `btrim`: die Kategorie
-- `\p{Cf}` (ZWSP U+200B, WORD JOINER U+2060, LRM U+200E, SOFT HYPHEN U+00AD …),
-- die vier Hangul-Filler und U+2800 BRAILLE PATTERN BLANK — und das
-- abschliessende `trim()` nimmt zusätzlich NBSP U+00A0.
-- (Steht irgendwo unten ein Beispiel wie " Buchenkamp", ist das erste
--  Zeichen ein echtes NBSP, byteweise `c2 a0`. Im Editor sieht es aus wie
--  ein gewoehnliches Leerzeichen — und DAS kaeme sehr wohl nicht durch.)
--
-- **SQL kennt kein `\p{Cf}`.** Der CHECK deckt vier Zeichen, die Funktion
-- deckt Klassen.
--
-- **DIE LUECKE IST NICHT NUR PER `curl` ERREICHBAR, UND DER ERSTE ENTWURF
-- DIESER DATEI BEHAUPTETE GENAU DAS** (Schlusslesung 22.08.2026, Punkt 4,
-- `[mittel]`: dort stand „Kein Client tut das"). Die beiden Clients trimmen
-- NICHT gleich stark:
--
--   * Das PORTAL ruft `sichtbarerName()` — sie raeumt `\p{Cf}`, die Hangul-
--     Filler und U+2800 weg und trimmt danach.
--   * Die NATIVE App ruft nur `draftName.trim()` (`DrivesSheet.tsx`). Das
--     JS-`trim()` entfernt WhiteSpace und LineTerminator, also auch NBSP —
--     **aber die Cf-Zeichen bleiben stehen, mit GENAU EINER Ausnahme.**
--     Nachgemessen 22.08.2026 in node, `trim()` auf <zeichen> + "x":
--       NBSP   U+00A0  entfernt   (ist Zs, nicht Cf)
--       ZWNBSP U+FEFF  ENTFERNT   <-- die Ausnahme: Cf, steht aber in der
--                                     ES-WhiteSpace-Liste
--       ZWSP   U+200B  bleibt
--       WJ     U+2060  bleibt
--       LRM    U+200E  bleibt
--       SHY    U+00AD  bleibt
--     (Der erste Korrekturentwurf schrieb hier „kein einziges Cf-Zeichen" und
--      hatte damit ein falsches Absolutum durch ein anderes ersetzt —
--      Delta-Durchgang 22.08.2026. U+FEFF ist ausgerechnet das haeufigste
--      Paste-Artefakt der Kategorie.)
--
-- **Folge, und sie ist der Grund fuer diesen Absatz: ein per Einfuegen
-- eingeschlepptes ZWSP am Rand passiert die native App UND diesen CHECK.**
-- Steht so ein Name in der DB, zieht der PORTAL-Editor ihn beim Oeffnen durch
-- `sichtbarerName`, der Vergleich wird ungleich, und CP-66 ist wieder da —
-- ausgeloest vom anderen Client, nicht von einem Angreifer.
--
-- Die Luecke bleibt trotzdem bewusst offen, wie in 112, Gegenprobe 4: sie zu
-- heilen hiesse, eine wachsende Zeichenliste in einen CHECK zu schreiben, und
-- 111 hat genau das mit Grund abgelehnt. Der tragfaehige Weg ist, dass die
-- native App dieselbe Funktion benutzt wie das Portal — Client-Arbeit, steht
-- als CN-69, keine Migration.
--
-- `app/zentrale/namen.ts:36` sagt denselben Satz von der anderen Seite: der
-- Client-Riegel ergaenzt einen DB-CHECK, er ersetzt ihn nicht — und umgekehrt.
--
--
-- BRICHT ES EINEN CLIENT? NEIN — NACHGESEHEN, NICHT ANGENOMMEN
-- Vier Schreibpfade berühren `hunt_drives.name`, alle vier trimmen bereits:
--
--   revierapp  treiben-bereich.tsx  anlegen()    :275  sichtbarerName(neu)
--   revierapp  treiben-bereich.tsx  speichern()  :305  sichtbarerName(name)
--   nativ      DrivesSheet.tsx      → createDrive :214  draftName.trim()
--   nativ      DrivesSheet.tsx      → renameDrive :241  draftName.trim()
--
-- Die Zeilennummern sind vom 22.08.2026 und altern; die FUNKTIONSNAMEN nicht.
-- (Die erste Fassung dieser Tabelle nannte 265/295 — durch den Kommentarblock,
--  der im selben Diff entstand, waren sie schon beim Schreiben falsch.
--  Fremdpruefung 22.08.2026, P9.)
--
-- `sichtbarerName` endet auf `.trim()`, und das JS-`trim()` entfernt eine echte
-- OBERMENGE von ' \t\r\n'. Der CHECK kann für keinen dieser Pfade feuern.
--
-- Serverseitig schreibt niemand die Spalte: `close_drives_on_hunt_end` und
-- `set_kill_drive_id` sind die einzigen Funktionen, deren Rumpf `hunt_drives`
-- überhaupt erwähnt, und sie fassen `status`/`ended_at` bzw. `kills.drive_id`
-- an. Das ist nicht gleichgültig — ein CHECK wird bei jedem UPDATE gegen die
-- GANZE Zeile geprüft, ein verletzender Bestandsname liesse also auch das
-- Jagd-Ende scheitern. Bei 0 verletzenden Zeilen ist es folgenlos.
--
--
-- BESTAND VOR DEM LAUF (22.08.2026, gezählt statt geschätzt)
--   12 Treiben · 0 leer · 0 mit Randleerraum (auch nicht mit NBSP)
--   längster Name 12 Zeichen
-- Eine Datenkorrektur vor dem CHECK ist deshalb nicht nötig. `add constraint`
-- validiert die Bestandszeilen sofort, und das ist hier gewollt: ginge es
-- nicht durch, gäbe es eine Zeile, die niemand gemessen hat.
--
--
-- WIEDERHOLBAR
-- `add constraint` kennt kein `if not exists` (auch in PG 17 nicht). Der
-- `drop constraint if exists` davor ist Pflicht, sonst ist die Datei beim
-- zweiten Lauf nicht wiederholbar — dieselbe Falle wie `create trigger` in
-- 039 und 111.
--
--
-- GEGENPROBEN — laufen NACH dem Applizieren (Anker 2), Belege in
-- docs/migrationen/114_treiben_name_sichtbar.md
--   1) Constraint vorhanden und im erwarteten Wortlaut.
--   2) Bestand unverletzt: die Zählabfrage von oben muss 0 liefern.
--   3) Vier Einzelfälle in EINER Transaktion, am Ende rollback — jeder Fall
--      ein EIGENES Statement: eine Wirkung, die man erst herstellt, kann man
--      nicht in derselben Anweisung prüfen (AGENTS.md, SQL-Regeln).
--        'Buchenkamp' → geht durch     'Buchenkamp ' → 23514
--        '   '        → 23514          ''            → 23514
--   4) Der bestehende Schreibweg trägt weiter: `update … set name = name` auf
--      einer festen Bestandszeile darf nicht feuern.
-- ============================================================


-- APPLY-WEG: psql, und `\set ON_ERROR_STOP on` steht deshalb IN dieser Datei.
--
-- **Der Grund ist ein Fehlerweg, den die Schlusslesung gefunden hat**
-- (22.08.2026, Punkt 8, `[niedrig]`): ohne ihn laeuft psql nach einem
-- Serverfehler WEITER. Scheitert `add constraint` — etwa weil zwischen Messung
-- und Applizieren doch eine verletzende Zeile entstanden ist —, wuerde der
-- `comment on column` trotzdem gesetzt und behauptete dann eine Regel, die es
-- nicht gibt; psql endete mit Status 0, und der Lauf saehe erfolgreich aus.
-- Genau die Falle aus AGENTS.md, belegt an 110/111.
--
-- **Nebenwirkung, die man wissen muss:** `\set` ist ein psql-Metabefehl. Diese
-- Datei laeuft damit NICHT ueber den Supabase-SQL-Editor und nicht ueber
-- `execute_sql`/`apply_migration`. Das ist der bewusste Tausch — der Zugang
-- liegt in `~/.pgpass` (Session Pooler), und die Datei geht bytegleich raus.
\set ON_ERROR_STOP on

alter table public.hunt_drives
  drop constraint if exists hunt_drives_name_sichtbar;

alter table public.hunt_drives
  add constraint hunt_drives_name_sichtbar
  check (name = btrim(name, E' \t\r\n') and name <> '');


comment on column public.hunt_drives.name is
  'Name des Treibens. Seit 114 gilt: der gespeicherte Wert ist gleich seiner '
  'eigenen mit btrim(… , E'' \t\r\n'') bereinigten Form und nicht leer. Die '
  'strikte Form ist Absicht — die schwache aus 111/112 liesse "Buchenkamp " '
  'durch, und genau daran haengt CP-66: der Portal-Editor vergleicht den '
  'bereinigten Entwurf gegen den rohen DB-Wert, schaerft bei so einem Namen '
  'schon beim Oeffnen den Speichern-Knopf, und der naechste Klick schreibt ein '
  'ungefragtes UPDATE. KEINE Laengengrenze, wie ueberall im Projekt (111). '
  'WAS DER CHECK NICHT FAENGT: NBSP und die Formatzeichen der Kategorie Cf — '
  'SQL kennt kein \p{Cf}. Dagegen haelt nur das PORTAL (sichtbarerName() in '
  'app/zentrale/namen.ts); die native App trimmt mit JS-trim() und laesst die '
  'Cf-Zeichen stehen (ausser U+FEFF, das in der ES-WhiteSpace-Liste steht) — '
  'ein eingefuegtes ZWSP am Rand kommt von dort durch und stellt CP-66 im '
  'Portal wieder her (CN-69).';

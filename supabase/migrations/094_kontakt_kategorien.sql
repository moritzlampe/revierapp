-- 094 — Kategorien und Standard-Funktionen am Kontakt
--
-- **Nie ohne 085 und 086 lesen.** 085 hat `kontakte` angelegt (der Gästestamm,
-- 154 Personen, davon 0 mit Konto), 086 das übersteuerbare `kuerzel`.
--
-- ===========================================================================
-- Warum
-- ===========================================================================
--
-- Moritz am 03.08.2026, beim ersten Durchsehen der Jagd-Verwaltung:
--
--   „zusätzlich würden wir bei der gästeliste zukünftig noch unterteilen in
--    Schützen, Jägerei, Treiber und könnten bei leuten funktionen vorauswählen
--    wie Gruppenleiter. dann muss das nicht bei jeder jagd neu gemacht werden
--    und man könnte erst alle schützen auswählen, dann die treiber usw."
--
-- Der Anlass ist also nicht Ordnung um ihrer selbst willen, sondern eine
-- Wiederholung, die weh tut: heute wird bei JEDER Jagd von vorn zugewiesen, was
-- sich am Menschen seit Jahren nicht ändert.
--
-- ===========================================================================
-- Zwei Ebenen, die nicht dieselbe sind
-- ===========================================================================
--
--   `kontakte.kategorien`      — wer diese Person GRUNDSAETZLICH ist (Stammdatum)
--   `hunt_participants.role`   — was sie BEI DIESER JAGD tut (Zuweisung)
--
-- Die erste belegt die zweite vor; sie ersetzt sie nicht. Das ist der Grund,
-- warum diese Migration `participant_role` **nicht** anfasst.
--
-- **`schweisshundfuehrer` wird hier ausdruecklich KEINE Rolle.** Er steht seit
-- laengerem als offener Punkt (`QuickHunt_Konzept_Revierzentrale_V1.md` §4.3:
-- „existiert nicht — weder als Rolle noch als Tag"; Backlog: „NATIV zuerst,
-- Portal uebernimmt"), und als Rolle zoege er die Streckenmaskierung nach sich:
-- die Design-Locks sehen im Zielmodell „Nachsuchefuehrer sieht alles" vor, und
-- das ist nicht gebaut. Als Kategorie am Kontakt ist er dagegen harmlos — er
-- sagt, wen man fragen kann, und veraendert kein einziges Leserecht.
--
-- ===========================================================================
-- Mehrfach, nicht einfach
-- ===========================================================================
--
-- Moritz, auf die Rueckfrage, ob die Kategorien sich ausschliessen:
--
--   „Jägerei, Schweißhundführer zb können auch schützen sein, aber haben
--    zusätzlich die kategorie. also es gibt auch jemanden der schweißhundführer
--    ist, bei der jägerei und schütze (weil es noch keine nachsuche gibt)"
--
-- Ein `enum`-Feld haette den Bestand also nicht abbilden koennen. Deshalb ein
-- Array, wie `hunt_participants.tags` es seit jeher fuehrt.
--
-- ===========================================================================
-- Warum `participant_tag` wiederverwendet und nicht gespiegelt wird
-- ===========================================================================
--
-- Fuer die vorwaehlbaren Funktionen („Gruppenleiter") gibt es das Enum bereits:
-- `participant_tag` = `gruppenleiter | hundefuehrer`. Ein zweites Enum mit
-- denselben Werten waere eine Uebersetzung zwischen zwei Vokabularen — und die
-- laeuft auseinander, sobald eines von beiden einen Wert dazubekommt. Beim
-- Einladen wandern die Werte unveraendert nach `hunt_participants.tags`.
--
-- Preis, bewusst: das Enum heisst `participant_tag`, steht damit aber auch an
-- einer Tabelle, die keine Teilnehmer fuehrt. Ein neutralerer Name waere
-- schoener; ein `alter type ... rename` traefe eine Spalte in einer Tabelle,
-- die beide Clients schreiben, und ist den Namen nicht wert. Zweiter Preis:
-- jedes kuenftige `alter type participant_tag add value` gilt sofort an ALLEN
-- Traegern — ein Wert, der nur an einer Jagd Sinn ergibt, taucht dann ungefragt
-- als waehlbarer Standard-Tag am Kontakt auf. Das Filtern wird Client-Aufgabe.
--
-- **`hunt_group_members` traegt dieses Enum uebrigens seit dem Ur-Schema** (003,
-- Spalte `default_tags`), zusammen mit `default_role participant_role` — die
-- Tabelle modelliert dieselbe Idee wie diese Migration: Personen ohne Konto,
-- deren Stammdaten die Jagd-Zuweisung vorbelegen. **Sie ist tot**: kein Client
-- liest oder schreibt sie, in beiden Repos null Treffer ausserhalb der
-- generierten Typen. Der Satz steht hier, weil der Kopf oben gegen „zwei
-- Vokabulare, die auseinanderlaufen" argumentiert und das dritte sonst
-- unbenannt bliebe (Schlusslesung 03.08.2026). `kontakte` ist trotzdem die
-- richtige Stelle — es ist der lebende Gaestestamm mit 154 Personen, waehrend
-- `hunt_groups` nie benutzt wurde. Wer eines Tages die toten Tabellen
-- aufraeumt, findet hier die Einordnung.
--
-- ===========================================================================
-- Was diese Migration bewusst NICHT tut
-- ===========================================================================
--
--   * **Keine Policy-Aenderung.** `kontakte_select/insert/update/delete` haengen
--     alle an `get_my_kontaktbuecher()` (Besitzer ODER Mitfuehrender, 085). Neue
--     Spalten erben das vollstaendig. Geprueft: es gibt keine spaltenweise
--     Einschraenkung, an der eine neue Spalte vorbeilaufen koennte.
--   * **Kein Anfassen von `kontakt_feste_spalten()`.** Der Trigger haelt
--     `besitzer_id` und `profil_id` fest; die neuen Spalten sollen aenderbar
--     sein, und sind es dadurch von selbst.
--   * **Kein Index.** 154 Zeilen, und gefiltert wird im Client. Ein GIN-Index
--     auf einem Array dieser Groesse ist Zierat.
--   * **Keine Rueckrechnung.** Alle 154 Kontakte starten ohne Kategorie. Das
--     ist ehrlich: welche Kategorie jemand hat, weiss nur Moritz.
--   * **Nichts an `participant_role`** — s. oben.

-- ---------------------------------------------------------------------------
-- 1. Die Kategorie
-- ---------------------------------------------------------------------------

-- `to_regtype('public.kontakt_kategorie')` statt `pg_type.typname`: der Name
-- allein ist nicht eindeutig. Ein gleichnamiger Typ in irgendeinem anderen
-- Schema haette die Pruefung erfuellt, das `create type` uebersprungen — und
-- das `alter table` unten waere danach an einem fehlenden `public`-Typ
-- gescheitert (Fremdpruefung 03.08.2026). `to_regtype` loest schemaqualifiziert
-- auf und gibt NULL zurueck, wenn es den Typ dort nicht gibt.
do $$
begin
  if to_regtype('public.kontakt_kategorie') is null then
    create type public.kontakt_kategorie as enum (
      'schuetze',
      'jaegerei',
      'treiber',
      'schweisshundfuehrer'
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Die zwei Spalten
-- ---------------------------------------------------------------------------
--
-- `not null default '{}'` statt nullable: bei einem Array ist „leer" die
-- vollstaendige Aussage „keine Kategorie", und NULL waere ein zweiter Weg, das
-- Gleiche zu sagen. Dieselbe Bauform wie `hunt_participants.tags`.

alter table public.kontakte
  add column if not exists kategorien public.kontakt_kategorie[] not null default '{}',
  add column if not exists standard_tags public.participant_tag[] not null default '{}';

comment on column public.kontakte.kategorien is
  'Wer die Person grundsaetzlich ist. Mehrfach: jemand kann Schweisshundfuehrer, '
  'Jaegerei UND Schuetze sein. Belegt beim Einladen die Jagd-Rolle vor, ersetzt '
  'sie aber nicht — hunt_participants.role bleibt die Zuweisung an der Jagd.';

comment on column public.kontakte.standard_tags is
  'Vorgewaehlte Funktionen, die beim Einladen nach hunt_participants.tags '
  'uebernommen werden. Nutzt bewusst dasselbe Enum wie dort. ACHTUNG fuer den '
  'Einladepfad: diese Spalte darf auch ein MITFUEHRENDER setzen (085), und '
  'gruppenleiter ist an einer Jagd rechtserheblich (059, Positionssichtbarkeit) '
  '— die Uebernahme gehoert also geprueft, nicht blind kopiert.';

-- ---------------------------------------------------------------------------
-- Gegenproben (als authenticated, jede mit ROLLBACK; Positivkontrolle zuerst)
-- ---------------------------------------------------------------------------
--
--   -- 1 Positivkontrolle: Besitzer setzt Kategorien am eigenen Kontakt -> geht
--   -- 2 Mitfuehrender setzt sie am geteilten Kontakt                   -> geht
--   -- 3 Fremder setzt sie an einem fremden Kontakt                     -> 0 Zeilen
--   -- 4 Fremder liest einen fremden Kontakt                            -> 0 Zeilen
--   -- 5 Mehrfachwert (schuetze + jaegerei + schweisshundfuehrer)       -> geht
--   -- 6 Unbekannter Wert ('koch')                                      -> 22P02
--   -- 7 Bestand nach dem Applizieren: 154 Zeilen, alle mit '{}'
--   -- 8 besitzer_id per UPDATE umschreiben                             -> 42501
--        (Regression auf 085: der Trigger darf durch die neuen Spalten nicht
--         durchlaessig geworden sein)
--   -- 9 standard_tags mit 'gruppenleiter'                              -> geht
--   -- 10 der Typ liegt wirklich in `public` und ist ein Enum mit genau vier
--        Labels — nicht bloss „ein Typ dieses Namens existiert" (Ergaenzung aus
--        der Fremdpruefung, Punkt 10):
--          select n.nspname, t.typtype,
--                 array_agg(e.enumlabel order by e.enumsortorder)
--            from pg_type t
--            join pg_namespace n on n.oid = t.typnamespace
--            left join pg_enum e on e.enumtypid = t.oid
--           where t.typname = 'kontakt_kategorie'
--           group by 1, 2;
--        Erwartet: genau EINE Zeile, nspname='public', typtype='e', vier Labels.
--   -- 11 beide Spalten tragen wirklich Array-Typ, NOT NULL und Default '{}':
--          select column_name, data_type, udt_name, is_nullable, column_default
--            from information_schema.columns
--           where table_name='kontakte'
--             and column_name in ('kategorien','standard_tags');

-- 124 — Der Ort des TIERES bei einem Anblick, getrennt vom Ort des Melders
--
-- ANLASS (Moritz, 14.09.2026): „ich mache auf der jagdkarte einen longpress …
-- anblick auf der anderen seite der wiese". Bei einer Drückjagd meldet einer
-- „drei Sauen drüben", damit die anderen wissen, WOHIN sie sehen müssen.
--
-- WAS HEUTE IN `location` STEHT, IST GEMESSEN UND NICHT VERMUTET (15.09.2026).
-- Beide Clients schreiben dort den GPS-Fix des MELDERS:
--   nativ  `src/lib/data/insertSighting.ts:29` — „Der eingefrorene Fix der
--          Erfassung, wie bei der Erlegung"
--   PWA    `src/components/erlegung/WildartPicker.tsx:431` — und der Weg
--          bricht ohne Fix ab: „Warte auf GPS…"
-- Bestand zum selben Zeitpunkt: 6 Anblicke, davon 4 mit `location`, alle aus
-- der PWA.
--
-- WARUM EINE ZWEITE SPALTE UND KEINE UMDEUTUNG.
-- Der Longpress meint „wo das Tier war". Schriebe er in `location`, stünden ab
-- der ersten Zeile ZWEI Bedeutungen in einer Spalte, und keine spätere
-- Auswertung könnte sie trennen — dieselbe Bauform wie die vier Chronik-
-- Quellen aus 110, bei denen eine Summe über die falsche Achse sich wie eine
-- Messung liest. Die vier Bestandszeilen und jede künftige PWA-Meldung tragen
-- weiterhin den Melderort; nichts daran ändert sich.
--
-- WARUM NICHT `distance_m`, DIE ES SCHON GIBT.
-- `wild_events.distance_m` existiert (1 von 9 Zeilen gefüllt) und die PWA hat
-- dafür ein Bearbeitungs-Sheet (`src/components/diary/edit-sheets/
-- DistanceSheet.tsx`). Sie trägt aber nur einen Betrag. „380 m" sagt
-- niemandem, wo er hinschauen soll — die RICHTUNG ist der ganze Zweck, und
-- die geht in einer Zahl verloren. Die Spalte bleibt unberührt.
--
-- ZUR GENAUIGKEIT, WEIL SIE BEIM LESEN FALSCH WIRKT.
-- Ein auf der Karte gesetzter Punkt ist ungenauer als ein GPS-Fix: bei
-- Kartenzoom 16 liegt eine halbe Fingerbreite (22 pt) bei rund 16 m, der
-- gemessene GPS-Median liegt bei 5 m (52.667 Fixe, 30 Tage).
-- **Das ist trotzdem kein schlechterer Wert, sondern der einzige.** Der
-- Melder-Fix misst den Tierort überhaupt nicht — sein Fehler dort ist die
-- ganze Distanz zwischen Melder und Tier, bei einem Tier 300 m entfernt also
-- 300 m. Wer diese Spalte für „schlechtere Daten" hält, hat die Frage
-- verwechselt. (Formulierung der Schlusslesung vom 15.09.2026; die erste
-- Fassung des Bauplans argumentierte hier zu defensiv.)
--
-- WAS DIESE MIGRATION NICHT TUT, UND WARUM SIE SO KURZ IST.
-- Keine Policy, kein Fremdschlüssel, kein Trigger, kein REVOKE. Gemessen von
-- der Schlusslesung am 15.09.2026: `wild_events` trägt genau zwei Policies
-- (`wild_events_owner_all`, `wild_events_hunt_member`) und zwei Trigger
-- (`trg_wild_events_katalog`, `trg_wild_events_zuordnung`). Eine nullable
-- `geography`-Spalte ohne referenzierte Tabelle fasst keine davon an.
--   Das Problem von 122 war ein FREMDSCHLÜSSEL, der als Tabellenbesitzer an
--   RLS vorbei auflöst und damit zum Existenz-Orakel wird. Hier gibt es keine
--   referenzierte Tabelle, also kein Orakel und keinen Invoker-Trigger.
-- Die Zeilenrechte erbt die Spalte unverändert aus 123: wer die Zeile sehen
-- darf, sieht auch diese Spalte.
--
-- ⚠ AKTIVE FALLE 1 — DIE PWA ZEIGT EINEN SO GEMELDETEN ANBLICK AM MELDERORT.
-- `revierapp/src/lib/diary/geo.ts:8` dekodiert für die Tagebuch-Anzeige
-- `wild_events.location`, nicht diese Spalte. Ein per Longpress verorteter
-- Anblick erscheint dort also an der Stelle, an der der Melder STAND — oder
-- gar nicht, wenn kein Fix vorlag. Bewusst hingenommen (die PWA ist im
-- Maintenance-Modus) und deshalb im Spaltenkommentar benannt, damit es nicht
-- als Defekt gesucht wird.
--
-- ⚠ AKTIVE FALLE 2 — AB HIER DARF EIN ANBLICK GANZ OHNE `location` ENTSTEHEN.
-- Der native Client WIRD den GPS-Riegel heben, wenn ein Tierort gesetzt ist
-- (Freigabe Moritz, 15.09.2026: „ja, der longpress ist ja bewusst gesetzt").
-- `location` ist dann `null`, `tier_location` gefüllt.
--   ⚠ Das ist ein FOLGESCHRITT und geht erst mit dem nächsten Gerätebuild
--   (Anker 1) live. Wer diese Datei direkt nach dem Applizieren liest, hält
--   die Spalte sonst für befüllt — sie ist bis dahin leer. (Schlusslesung
--   F2, 15.09.2026: der Kopf beschrieb einen Client, den es noch nicht gab.)
-- **Jede Auswertung, die einen Ort braucht, muss beide Spalten lesen** —
-- `coalesce(tier_location, location)` ist der Ort, `location` allein ist es
-- nicht mehr.
--
-- ⚠ AKTIVE FALLE 3 — `geography`, NICHT `geometry`, WIE DIE SCHWESTERSPALTE.
-- `wild_events.location` ist als einzige Punktspalte des Schemas `geography`
-- (`kills.position`, `map_objects.position`, `positions.location` sind
-- `geometry`). PostgREST liefert `geography` als EWKB-HEX, nicht als GeoJSON.
-- Wer nach dem Kill-Muster `.coordinates` liest, bekommt `undefined` und die
-- Karte bleibt STILL leer. Der native Client hat dafür `extractLatLng`
-- (`src/lib/map/geo.ts:54`), das beide Formen kann. Die neue Spalte ist
-- absichtlich derselbe Typ — zwei Typen nebeneinander wären eine zweite Falle
-- an derselben Tabelle.

alter table public.wild_events
  add column if not exists tier_location geography(Point, 4326);

comment on column public.wild_events.tier_location is
  'Der vom Melder auf der Karte GESETZTE Ort des Tieres (Longpress). '
  'Unterschied zu `location`: das ist der GPS-Fix des MELDERS. '
  'Beide koennen null sein, auch BEIDE ZUGLEICH: zwei der sechs Anblicke im '
  'Bestand (25.04.2026) tragen gar keinen Ort, und kein CHECK verhindert das - '
  'einer waere am Bestand gescheitert. Der Riegel gegen eine Meldung ohne '
  'jeden Ort sitzt im Client, nicht in der DB. Verlasse dich also NICHT '
  'darauf, dass coalesce(tier_location, location) etwas liefert. '
  'Ab 124 darf `location` fehlen, wenn diese Spalte gefuellt ist; der Ort '
  'eines Anblicks ist deshalb coalesce(tier_location, location), nie '
  '`location` allein. '
  'ACHTUNG: die PWA (Maintenance-Modus) liest nur `location` und zeigt einen '
  'so gemeldeten Anblick am Melderort oder gar nicht. '
  'Genauigkeit: ein gesetzter Punkt liegt bei Kartenzoom 16 auf etwa 16 m '
  'genau, ein GPS-Fix auf 5 m Median - das ist trotzdem der einzige Wert zu '
  'dieser Frage, weil der Melder-Fix den Tierort um die ganze Melder-Tier-'
  'Distanz verfehlt.';

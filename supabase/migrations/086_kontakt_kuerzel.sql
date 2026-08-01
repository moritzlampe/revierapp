-- 086_kontakt_kuerzel.sql
--
-- Kuerzel fuer Kontakte — als UEBERSTEUERUNG, nicht als Speicher.
--
-- Moritz' Vorgabe vom 01.08.2026: das Kuerzel wird aus dem Namen abgeleitet.
--   "Heinrich Blumenberg"            -> HB
--   "Karl-Eberhard von Alten"        -> KEvA
--   "Hans-Gerd von Alten-Weddelmann" -> HGvAW
-- Bindestrichnamen zaehlen doppelt, Partikel (v./von/zu) bleiben klein,
-- Titel (Graf, Frhr., Dr.) fallen weg. Die Regel steht im Client
-- (`app/zentrale/gaeste/kontakte.ts`, `initialen()`), samt Selbsttest.
--
-- WARUM DIE SPALTE TROTZDEM EXISTIERT, UND WARUM SIE LEER STARTET
--
-- Eine gespeicherte Ableitung waere eine zweite Wahrheit: wer einen Namen
-- korrigiert, haette danach ein Kuerzel, das nicht mehr zum Namen passt, und
-- niemand saehe es. `NULL` heisst deshalb "rechne aus", nicht "kein Kuerzel".
-- Geschrieben wird nur, wo der Besitzer bewusst etwas anderes will.
--
-- Der Anlass ist gemessen und keine Vermutung: **47 der 154 Kontakte teilen
-- sich ein abgeleitetes Kuerzel**, 21 Kuerzel kollidieren. Achaz, Alexander
-- und August Graf v. Hardenberg ergeben nach JEDER Initialenregel dreimal
-- `AvH`. Das ist keine Schwaeche der Regel, sondern eine Eigenschaft der
-- Familie — und deshalb gehoert die Aufloesung dem Menschen, nicht einem
-- Algorithmus, der raten muesste.
--
-- Additiv und rueckwaertskompatibel: beide Clients teilen die DB, und keiner
-- liest die Spalte, bevor er sie kennt.

alter table public.kontakte
  add column if not exists kuerzel text;

comment on column public.kontakte.kuerzel is
  'Vom Besitzer gesetztes Kuerzel. NULL heisst "aus dem Namen ableiten" '
  '(Initialen, Partikel klein, Titel weg) — NICHT "kein Kuerzel". Nur '
  'befuellen, wo die Ableitung nicht taugt, etwa bei Namensgleichheit. '
  'Migration 086.';

-- Leerraum ist kein Kuerzel. Ohne diese Schranke entstuende ueber ein
-- Formular ein '' , und '' ist WEDER eine Ableitung NOCH eine Vorgabe — die
-- Anzeige zeigte dann nichts, ohne dass jemand das entschieden haette.
-- Dieselbe Ueberlegung wie beim Namens-Constraint aus 085, wo genau dieser
-- Fall in der Codex-Gegenpruefung aufgefallen ist.
alter table public.kontakte
  drop constraint if exists kontakt_kuerzel_nicht_leer;
alter table public.kontakte
  add constraint kontakt_kuerzel_nicht_leer
  check (kuerzel is null or btrim(kuerzel) <> '');

-- KEINE neue Policy und KEIN neues Recht.
--
-- `kuerzel` ist eine gewoehnliche Spalte auf `kontakte`; die vier
-- kommandogetrennten Policies aus 085 decken sie mit ab, weil sie auf die
-- ZEILE wirken (`besitzer_id in (select get_my_kontaktbuecher())`), nicht auf
-- einzelne Spalten. Wer den Kontakt aendern darf, darf auch sein Kuerzel
-- aendern — das ist gewollt: ein Mitfuehrender pflegt dieselbe Liste.
--
-- Der Trigger `kontakt_feste_spalten()` aus 085 haelt `besitzer_id` und
-- `profil_id` fest. `kuerzel` gehoert AUSDRUECKLICH NICHT dazu: es traegt
-- keine Berechtigung, es ist eine Anzeigeentscheidung des Besitzers.

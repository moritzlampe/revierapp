-- 167: Land der freien Jagd (CN-581) -- Bauplan „Land fuer Revier und freie Jagd".
-- Bauplan: quickhunt-native/docs/konzepte/QuickHunt_Bauplan_Land_Revier_freie_Jagd_V1.md
--          (FREIGEGEBEN 25.11.2026, Fassung 3; E1, E2, §3).
-- Begruendung und Pruefkette: quickhunt-native/docs/migrationen/167_hunts_bundesland.md
--
-- ANLASS: Eine Jagd ohne Revier kennt ihr Land nicht -- die Karte waehlt die Basis
-- (Geoportal in Polen, Luftbild in Niedersachsen) deshalb nie passend. Ablauf Moritz
-- 23.11.2026: „Neue Jagd" ohne Revier bekommt eine Land-Auswahl mit Reiter „Ausland";
-- die Karte nimmt das Land als letzten Bezugspunkt nach Grenze, Zonen, Einrichtungen.
--
-- INHALT
--   1. `hunts.bundesland text`, nullable, ohne Default, ohne CHECK (E2). Geschrieben nur
--      fuer Jagden OHNE Revier; mit Revier gilt `districts.bundesland` -- beim Lesen hat
--      das Land des Reviers Vorrang, auch wenn es leer ist.
--      Werte wie an `districts` (E1): die 16 Bundeslaender, fuers Ausland der deutsche
--      Laendername („Polen", „Slowakei"), 'Ausland' fuer ein anderes Land. Die Liste lebt im
--      Client; ein unbekannter Wert gilt dort als keine Angabe. Schaden eines Fremdwerts:
--      nur die Kartenbasis dieser einen Jagd, und schreiben darf nur, wer die Jagd leitet
--      (Policies `hunts_creator_all`, `hunts_leader_update`, unveraendert).
--   2. Kommentar an `districts.bundesland` (bisher keiner): dieselbe Werteregel. Sonst kein
--      DDL an `districts`.
--
-- NICHT HIER: die Datenkorrektur der vier Auslands-Reviere des Betreibers (Bauplan E8) steht
-- in der Begruendungsdatei -- bei einem Neuaufbau waere sie ohne Bedeutung.
--
-- SPERRE: ADD COLUMN nimmt ACCESS EXCLUSIVE auf `hunts` bis zum Commit (nur Katalog, keine
-- Tabellenumschreibung: nullable, ohne Default). Apply mit `lock_timeout`, nicht waehrend
-- einer laufenden Jagd.
--
-- VERTRAEGLICHKEIT: additiv. Alte Builds und die PWA lesen die Spalte nicht; Tabellenrechte
-- ohne Spaltenliste und die Realtime-Publikation ohne Spaltenliste nehmen sie mit.
-- REIHENFOLGE: vor dem App-Code -- sobald `fetchHuntMapData` die Spalte liest, scheitert die
-- Karte gegen eine DB ohne sie (42703).

begin;

alter table public.hunts add column bundesland text;

comment on column public.hunts.bundesland is
  '167: Land einer Jagd OHNE Revier (CN-581). Mit Revier gilt districts.bundesland, auch wenn es leer ist. '
  'Werte wie dort: die 16 Bundeslaender, fuers Ausland der deutsche Laendername (Polen, Slowakei), '
  '''Ausland'' fuer ein anderes Land. Kein CHECK: die Liste lebt im Client, unbekannte Werte gelten als keine Angabe.';

comment on column public.districts.bundesland is
  'Land des Reviers: die 16 Bundeslaender, fuers Ausland seit 167 der deutsche Laendername (Polen, Slowakei), '
  '''Ausland'' fuer ein anderes Land (CN-581). Kein CHECK: die Liste lebt im Client, unbekannte Werte gelten als '
  'keine Angabe. Gilt auch fuer die Jagden des Reviers (hunts.bundesland nur ohne Revier).';

commit;

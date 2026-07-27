-- 064_retype_soeder_objekte.sql
--
-- Umtypen der drei Söder-Objekte, für die 063 die Enum-Werte geschaffen hat.
--
-- Eigene Datei, weil ein Enum-Wert in derselben Transaktion, in der er per
-- ALTER TYPE ... ADD VALUE entsteht, noch nicht benutzt werden darf. 063 und
-- 064 müssen deshalb getrennt laufen.
--
-- Betroffen sind exakt drei Zeilen (verifiziert am 27.07.2026 vor dem Lauf):
--   290ed78b-d21a-4a2a-8756-9dc017f8724d  Notfall-Treffpunkt
--   024fe608-7fb9-4721-8774-eb41c2daaf3a  Notfall-Treffpunkt
--   db3b8697-011b-44b4-8d3d-1ccffb39f16b  Wildacker
--
-- Die IDs stehen fest verdrahtet statt per Namenssuche: Namen sind Nutzerdaten
-- und änderbar, und ein ilike '%wildacker%' würde später auch „Wildacker Nord"
-- eines anderen Reviers erwischen. `AND type = 'sonstiges'` macht den Lauf
-- zusätzlich idempotent und schützt vor einer späteren Rücktypung von Hand.
--
-- Die übrigen 21 Objekte in Söder bleiben bewusst 'sonstiges': Teiche,
-- Brunftplätze, Wendeplätze, Bushaltestellen und reine Landmarken (Turmberg,
-- Grenzsattel, Passeiche, Eiskeller, Steinbruch). Ein Drittel davon sind
-- Orientierungspunkte ohne eigene Funktion — die brauchen keine Kategorie,
-- sie SIND eine.

UPDATE map_objects
   SET type = 'notfall_treffpunkt'
 WHERE id IN (
         '290ed78b-d21a-4a2a-8756-9dc017f8724d',
         '024fe608-7fb9-4721-8774-eb41c2daaf3a'
       )
   AND type = 'sonstiges';

UPDATE map_objects
   SET type = 'wildacker'
 WHERE id = 'db3b8697-011b-44b4-8d3d-1ccffb39f16b'
   AND type = 'sonstiges';

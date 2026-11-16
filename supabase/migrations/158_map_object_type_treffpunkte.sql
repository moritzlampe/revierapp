-- 158: Zwei neue Werte fuer map_object_type: 'treffpunkt' und 'unterkunft'
-- (CN-511, Moritz 14.11.2026 anlaesslich der Polenreise: „Unterkunft gibt es
-- noch nicht, Treffpunkt auch nicht. Man koennte alles drei unter
-- ‚Treffpunkte' auswaehlbar machen?").
-- Begruendung und Pruefkette: quickhunt-native/docs/migrationen/159_objekt_in_sicht_treffpunkte.md
--
-- EIGENE DATEI, und sie laeuft VOR 159: ein Enum-Wert, der per
-- ALTER TYPE ... ADD VALUE entsteht, ist erst nach dem Commit dieser
-- Transaktion benutzbar (55P04, dieselbe Lage wie 063/064). 159 nennt die
-- neuen Werte im Rumpf von `objekt_in_sicht`; laege beides in einer
-- Transaktion, scheiterte 159 an der Validierung des Funktionsrumpfs.
-- Deshalb hier kein begin/commit: jede Anweisung committet fuer sich.
--
-- Kompatibilitaet (beide Clients teilen die DB):
--   * Rein additiv, keine bestehende Zeile aendert sich. Die 7 vorhandenen
--     Notfall-Treffpunkte bleiben, was sie sind (auch „Unterkunft Rzeczyca"
--     in Polanow — laut Voucher der Notfall-Treffpunkt).
--   * Der Enum-Wert allein bricht nichts: solange keine Zeile ihn traegt,
--     liefert keine Abfrage ihn aus.
--   * Sobald eine Zeile ihn traegt, gilt: die App ab Build 65 kennt ihn;
--     aeltere App-Builds stuerzen in der Revierkarte ab (gemessen 14.11.,
--     `du/revier/[id].tsx` buckets[undefined]) — Moritz 16.11.: kein
--     Absturzschutz, die Tester aktualisieren; Objekte der neuen Arten also
--     erst nach dem Build anlegen. Die PWA zeichnet sie als „Sonstiges", das
--     Portal sperrt das Speichern eines solchen Objekts — beides CP-134.
--
-- Idempotent per IF NOT EXISTS (Lehre aus 039).

ALTER TYPE map_object_type ADD VALUE IF NOT EXISTS 'treffpunkt';
ALTER TYPE map_object_type ADD VALUE IF NOT EXISTS 'unterkunft';

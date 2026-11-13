-- 154: Fremdschluessel `kills.kontrolle_von -> profiles` entfernen (Produktionsfehler aus 152).
--
-- ANLASS (gemessen 13.11.2026, Produktion): 152 hat mit `kills_kontrolle_von_fkey`
-- einen ZWEITEN Fremdschluessel von `kills` auf `profiles` angelegt (neben
-- `kills_reporter_id_fkey`). PostgREST lehnt seitdem jede Einbettung zwischen
-- beiden ohne Hinweis ab:
--   GET /rest/v1/kills?select=id,profiles(display_name)  ->  PGRST201
--   "Could not embed because more than one relationship was found"
-- Genau so fragt die App in `fetchHuntKills` (`kills.ts`), und die steht hinter
-- Jagdkarte, Strecke, Tagebuch und Jagdtag. Seit dem Apply von 152 (10:43) laden
-- dort in JEDEM installierten Build keine Erlegungen. Die PWA bettet nicht ein.
-- Begruendung und Pruefkette: quickhunt-native/docs/migrationen/154_kills_kontrolle_von_ohne_fk.md
--
-- WARUM DER FIX IN DER DATENBANK LIEGT: Ein neuer Build mit Hinweis
-- (`profiles!kills_reporter_id_fkey`) heilte nur kuenftige Installationen; jeder
-- alte Build bliebe kaputt. Ohne den zweiten Fremdschluessel gibt es wieder
-- genau einen Weg `kills -> profiles`.
--
-- WAS DABEI VERLOREN GEHT, BENANNT: Referentielle Integritaet an `kontrolle_von`.
-- Die Spalte schreibt nur der Server (`set_kill_herkunft`: Melder = `auth.uid()`,
-- erzwungen; `erlegung_kontrollieren`: `auth.uid()`); Clients sperrt
-- `kill_kontrolle_schutz`. Das SET NULL hat nie gefeuert, weil `konto_loeschen`
-- (132) weich loescht. Faellt doch einmal eine `profiles`-Zeile hart, bleibt die
-- uuid ohne Profil stehen -- die Anzeige behandelt ein unbekanntes Konto wie
-- null ("geloeschtes Konto"), wie sie es fuer `konto_namen()` ohnehin muss.
--
-- BEWUSST NICHT: ein Fremdschluessel auf `auth.users` (unsichtbar fuer PostgREST,
-- haette die Integritaet behalten) -- ein neuer FK auf `auth.users` ist ein
-- eigener Lese-Ausloeser (132, 115) und eine eigene Pruefung; fuer eine Spalte,
-- die nur der Server mit `auth.uid()` schreibt, traegt er nichts.
-- `kill_verlauf.von -> profiles` bleibt: `kill_verlauf` hat nur diesen einen Weg
-- zu `profiles`, dort ist nichts mehrdeutig (gemessen).
--
-- FALLE FUER JEDE KUENFTIGE MIGRATION: Ein zweiter Fremdschluessel von einer
-- Tabelle auf dasselbe Ziel bricht jede Einbettung ohne Hinweis -- fuer alle
-- Clients, sofort, und keine Probe auf DB-Ebene sieht es. Vorher die Clients
-- beider Repos nach Einbettungen dieser Tabelle durchsuchen.
--
-- Sperre (gemessen, Codex 154 F4): `drop constraint` haelt ACCESS EXCLUSIVE auf
-- `kills` UND `profiles` bis zum Commit -- Millisekunden, aber Lesezugriffe auf
-- beide warten so lange. lock_timeout 5 s im Aufruf: steht eine lange Abfrage im
-- Weg, bricht das Apply ab, statt die Warteschlange aufzustauen. Den Schema-Cache
-- laedt PostgREST nach DDL selbst; das `notify` ist die Rueckversicherung.
-- Apply-Weg: psql mit Registrierung in einer Transaktion (wie 153).

begin;

alter table public.kills drop constraint kills_kontrolle_von_fkey;

notify pgrst, 'reload schema';

commit;

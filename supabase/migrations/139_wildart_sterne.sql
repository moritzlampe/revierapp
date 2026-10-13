-- 139: Sterne der Wildart-Listen, getrennt von den Erlege-Knoepfen (CN-346).
--
-- ANLASS: Moritz, 13.10.2026, nach Build 46: "es ist doch ein unterschied ob
-- ich die Wildarten unter Erlegung (den Button) haben will oder als Favorit
-- oben in der Liste" — und: "Stern in Wildarten und er steht damit nicht
-- automatisch im erlegungsbutton. Das muss doch identisch sein mit Stern
-- unter Wildarten und Stern in Freigabe".
-- Bauplan: quickhunt-native/docs/konzepte/QuickHunt_Bauplan_Stern_getrennt_V1.md (F14 geprueft)
-- Begruendung und Pruefkette: quickhunt-native/docs/migrationen/139_wildart_sterne.md
--
--
-- DIE REGEL
--
-- ★ = "steht oben in der Liste" (Freigabe, Du -> Wildarten, Erlegen unter
-- "Sonstiges"). ☑ = "Knopf beim Erlegen" (`profiles.wildart_favoriten`, 101,
-- hoechstens 11). Kein Zeichen setzt das andere. Bis Build 46 war beides
-- EINE Spalte — eine Bauentscheidung aus CN-340, nicht Moritz'.
--
--
-- WARUM `user_settings` UND NICHT `profiles` (Bauplan E1)
--
-- - Nur der Besitzer liest und schreibt: `user_settings_owner_all`
--   (`for all`, USING und CHECK `user_id = auth.uid()`). `profiles` dagegen
--   ist fuer jeden Angemeldeten lesbar (`profiles_select_authenticated`, 101).
-- - `konto_loeschen` (133-Fassung, §3/18) loescht die ganze Zeile — die
--   Sterne gehen ohne Neufassung der Loeschfunktion mit. An `profiles` haette
--   der Grabstein (§3/21) die Spalte einzeln leeren muessen.
-- - Praezedenz 133/134: eine Spalte je Einstellung, Upsert nennt nur sie.
--
-- KEINE Policy darf `wildart_sterne` auswerten (wie 101): ein `uuid[]` ohne
-- Fremdschluessel, das der Nutzer selbst schreibt, ist eine Anzeigevorliebe
-- und nie ein Berechtigungstraeger (096, `hunts.wildart_ids`). Gegenprobe,
-- 0 Zeilen:
--
--     select polname from pg_policy
--      where pg_get_expr(polqual, polrelid) ilike '%wildart_sterne%'
--         or pg_get_expr(polwithcheck, polrelid) ilike '%wildart_sterne%';
--
--
-- `not null default '{}'` (Bauplan E1, Codex 8): ohne beides bekaemen die
-- bestehenden Zeilen NULL, der CHECK liesse es durch (NULL erfuellt ihn) und
-- der Startbestand unten uebersprange sie (`= '{}'` ist fuer NULL nicht wahr).
--
-- OBERGRENZE 200 (Bauplan E2): KEIN Nutzerlimit — der Katalog hat 87 globale
-- Arten (13.10.2026) — sondern nur der Riegel gegen ein unbegrenztes Array
-- per direktem API-Aufruf. `cardinality` statt `array_length`: zaehlt alle
-- Elemente auch eines mehrdimensionalen Arrays und liefert 0 statt NULL fuer
-- `'{}'` (101).
--
--
-- STARTBESTAND (Bauplan E3): wer Knoepfe hat, bekommt sie einmalig auch als
-- Sterne — in der Freigabe verschwindet oben nichts. Gemessen 13.10.2026:
-- 2 Profile (7 und 4 Knoepfe), beide ohne `user_settings`-Zeile, also zwei
-- INSERTs. Die neuen Zeilen tragen die Defaults; beide Server-Leser fallen
-- ohne Zeile auf genau diese Werte zurueck (`weg_sichtbare_teilnahmen`:
-- `coalesce(us.weg_frist, 'folgejagdjahr')`; Cron `auto-end-stale-hunts`:
-- `coalesce(... einzeljagd_ruhe_stunden, 12)`), es aendert sich also nichts.
-- **Laeuft genau einmal, mit dieser Migration.** Die `where`-Klausel schuetzt
-- nur gegen einen zweiten Lauf, bevor jemand einen Stern gesetzt hat — wer
-- danach alle Sterne wegnimmt, steht wieder auf `'{}'`, und ein zweiter Lauf
-- stellte sie her (Codex 2).
-- Kein `exists (... auth.users ...)`: `profiles_id_fkey` ist ON DELETE
-- CASCADE, ein Profil ohne Konto gibt es nicht — gaebe es eines, braeche
-- diese Datei laut am Fremdschluessel ab statt still (Schlusslesung 11).
--
--
-- ⚠ DIESE DATEI TRAEGT BEWUSST KEIN `\set ON_ERROR_STOP on` (120-Muster).
-- Ueber psql (Kartei psql, 132):
--   psql -v ON_ERROR_STOP=1 -c "set lock_timeout = '10s'" \
--        -c "set statement_timeout = '120s'" -f 139_wildart_sterne.sql
-- Registrierung dann von Hand nachtragen.
-- ⚠ GEZIELT APPLIZIEREN, nie ueber "alle ausstehenden" (115, T9).
-- ⛔ VOR dem nativen Build 47 applizieren: der Client liest die Spalte. Build 46
-- liest sie nicht und bleibt unveraendert.

begin;

alter table public.user_settings
  add column wildart_sterne uuid[] not null default '{}';

alter table public.user_settings
  add constraint user_settings_wildart_sterne_max
  check (cardinality(wildart_sterne) <= 200);

comment on column public.user_settings.wildart_sterne is
  'CN-346 (139): Katalogzeilen (wildarten.id) mit Stern — stehen in den Wildart-Listen oben. '
  'Getrennt von den Erlege-Knoepfen (profiles.wildart_favoriten, 101). Anzeigevorliebe, '
  'KEIN Berechtigungstraeger — keine Policy darf sie auswerten. Ohne Fremdschluessel: '
  'unbekannte ids filtert der Client weg.';

insert into public.user_settings (user_id, wildart_sterne)
select p.id, p.wildart_favoriten
  from public.profiles p
 where cardinality(p.wildart_favoriten) > 0
on conflict (user_id) do update
   set wildart_sterne = excluded.wildart_sterne
 where public.user_settings.wildart_sterne = '{}';

commit;

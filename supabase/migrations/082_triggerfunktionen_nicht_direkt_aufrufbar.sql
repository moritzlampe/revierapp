-- 082 — Trigger-Funktionen gehören keinem Client
--
-- Befund vom 31.07.2026, gemessen und als Angriff nachgestellt.
--
-- ---------------------------------------------------------------------------
-- Was schiefging
-- ---------------------------------------------------------------------------
--
-- Migration 062 schreibt in ihrem Kopf, warum `clear_stand_bezug_on_drive_end`
-- niemandem gehören darf — wörtlich:
--
--   „Ohne diesen Entzug wäre die Funktion eine offene Tür: neue Funktionen
--    tragen standardmäßig EXECUTE für PUBLIC, und wer sie ausführen darf, darf
--    sie auch an eine EIGENE (etwa temporäre) Tabelle als Trigger hängen und
--    NEW.id / NEW.hunt_id frei bestimmen. Sie liefe dann als Eigentümer und
--    löschte fremde Bezugszeilen, die der Aufrufer nach L9 nie anfassen dürfte."
--
-- Die Analyse war richtig. Der Entzug hat trotzdem nicht gewirkt, weil er
-- `FROM PUBLIC` lautete — und das ist bei Supabase wirkungslos:
--
--   **Supabase vergibt EXECUTE auf neue Funktionen zusätzlich EXPLIZIT an
--   anon, authenticated und service_role** (ALTER DEFAULT PRIVILEGES). Ein
--   Entzug von PUBLIC räumt nur den PUBLIC-Eintrag ab; die drei namentlichen
--   Grants bleiben stehen. Gemessen: anon=true, authenticated=true.
--
-- ---------------------------------------------------------------------------
-- Der Angriff ist nicht theoretisch
-- ---------------------------------------------------------------------------
--
-- Am 31.07.2026 als Rolle `authenticated` durchgeführt, in einer Transaktion
-- mit ROLLBACK:
--
--   create temp table atk (id uuid, hunt_id uuid, status text);
--   create trigger atk_t after update on atk for each row
--     execute function public.clear_stand_bezug_on_drive_end();
--   insert into atk values (gen_random_uuid(), '<fremde hunt_id>', 'x');
--   update atk set status = 'y';
--
-- Ergebnis: `hunt_stand_bezug` vorher 1 Zeile, nachher 0. **Eine fremde
-- Bezugszeile gelöscht**, ohne jedes Recht an dieser Jagd.
--
-- Die Wirkung ist genau die, gegen die am selben Tag Migration 081 gebaut
-- wurde, nur durch die Hintertür: wer den Eincheck-Zustand einer Jagd löscht,
-- lässt die Karte Stände als frei zeigen, auf denen jemand sitzt. Daran
-- entscheidet der Nachbar, ob er in die Richtung schießt.
--
-- ---------------------------------------------------------------------------
-- Warum der Entzug nichts kaputtmachen kann
-- ---------------------------------------------------------------------------
--
-- Postgres prüft EXECUTE auf die Trigger-Funktion beim **Anlegen** des
-- Triggers, nicht bei jedem Feuern. Bestehende Trigger laufen also weiter —
-- alle 14 Funktionen hier hängen an mindestens einem echten Trigger, angelegt
-- vom Eigentümer.
--
-- Und ein Client kann eine Trigger-Funktion ohnehin nicht sinnvoll direkt
-- rufen: `select clear_stand_bezug_on_drive_end()` scheitert mit
-- „trigger functions can only be called as triggers". Der einzige Zweck des
-- Grants war also der Missbrauch als Fremd-Trigger.
--
-- ---------------------------------------------------------------------------
-- Umfang: bewusst NUR Trigger-Funktionen
-- ---------------------------------------------------------------------------
--
-- Für Clients ausführbar sind noch weitere SECURITY-DEFINER-Funktionen
-- (`schein_einloesen`, `revier_praesenz`, `accept_hunt_invitation`,
-- `set_position_consent`, die `get_my_*`-Familie …). Die sind hier bewusst
-- NICHT dabei: sie werden von den Clients direkt gerufen, und `anon` bedient
-- den Gast-/Akquise-Layer der PWA. Ob `anon` dort jeweils nötig ist, ist eine
-- eigene Frage mit eigenem Risiko — ein pauschaler Entzug wäre hier ein
-- Ausfall, kein Riegel. Offener Punkt im Backlog.
--
-- Die vier Funktionen ohne SECURITY DEFINER (`update_updated_at`,
-- `hunts_creator_id_ist_fest`, `hunting_licenses_holder_fixieren`,
-- `set_trichinen_pflicht`) sind ungefährlich — sie liefen als Fremd-Trigger
-- mit den Rechten des Aufrufers. Sie sind trotzdem dabei, damit die Regel
-- „keine Trigger-Funktion gehört einem Client" keine Ausnahme kennt, über die
-- der nächste Leser nachdenken muss.
--
-- Idempotent: REVOKE auf ein bereits entzogenes Recht ist ein No-op.
--
-- Gegenprobe danach — muss 0 Zeilen liefern:
--   select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.prorettype='pg_catalog.trigger'::regtype
--      and (has_function_privilege('anon', p.oid, 'EXECUTE')
--           or has_function_privilege('authenticated', p.oid, 'EXECUTE'));

REVOKE ALL ON FUNCTION public.backfill_kills_on_drive_start()   FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.clear_stand_bezug_on_drive_end()  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.clear_stand_bezug_on_hunt_end()   FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.close_drives_on_hunt_end()        FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.handle_new_user()                 FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_kill_drive_id()               FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.sync_wild_event_for_kill()        FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.unhide_chat_on_new_message()      FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_chat_group_timestamp()     FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_hunt_last_activity()       FROM PUBLIC, anon, authenticated, service_role;

-- Ohne SECURITY DEFINER, s. oben — der Vollständigkeit halber.
REVOKE ALL ON FUNCTION public.hunting_licenses_holder_fixieren() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hunts_creator_id_ist_fest()        FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_trichinen_pflicht()            FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_updated_at()                FROM PUBLIC, anon, authenticated, service_role;

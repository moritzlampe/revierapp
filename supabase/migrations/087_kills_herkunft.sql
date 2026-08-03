-- 087 — Herkunft einer Erlegung: kills.hunting_license_id, serverseitig gesetzt
--
-- Schritt 1 aus `docs/konzepte/QuickHunt_Konzept_Freigabe_V1.md` §6
-- (quickhunt-native). Das Freigabemodul selbst — Taxonomie, Freigabetabelle,
-- „noch frei" — ist NICHT Teil dieser Migration.
--
-- ---------------------------------------------------------------------------
-- Der Befund, der alles andere bestimmt (gemessen 03.08.2026, Produktion)
-- ---------------------------------------------------------------------------
--
--   kills gesamt                              33
--   davon mit district_id                      0
--   davon mit hunt_id                         33  (alle)
--   davon über hunt_id -> hunts.district_id   12  (18 von 39 Jagden haben
--                                                  selbst kein Revier)
--
-- Es gibt heute also keinen verlässlichen Weg von einer Erlegung zu dem
-- Revier, in dem sie stattfand. Der Zähler eines Kontingents ist nicht der
-- schwierige Teil — die Zuordnung ist es.
--
-- ---------------------------------------------------------------------------
-- Warum der Trigger und nicht der Client
-- ---------------------------------------------------------------------------
--
-- `kills` hat genau EINE Schreibpolicy:
--
--   kills_reporter   for all   using (reporter_id = auth.uid())   ohne with check
--
-- Ein `for all` ohne eigenes `with check` benutzt sein USING auch als Check.
-- Die Bedingung prüft `reporter_id` und sonst nichts: **wer eine Erlegung
-- meldet, darf jede Spalte frei setzen.** Ein client-gesetzter Schein-Bezug
-- wäre damit fälschbar — jeder könnte eine Erlegung auf einen fremden Schein
-- buchen, und weil `district_id` daran hängen soll, wäre das ein Schreibweg in
-- ein fremdes Revier.
--
-- Das ist dieselbe Wurzel wie in 076, 079 und 083: nicht „wer darf lesen",
-- sondern „wer darf diese Zeile schreiben".
--
-- `for all` deckt UPDATE mit, und die PWA nutzt das bereits
-- (`KillDetailContent.tsx` schreibt `kapital` und `notiz`). Ein Riegel nur auf
-- INSERT wäre deshalb wirkungslos — der Melder könnte die Herkunft
-- nachträglich umschreiben. Der Trigger läuft auf INSERT **und** UPDATE.
--
-- Die Bauform ist nicht neu: `set_kill_drive_id` leitet seit 063 auf genau
-- diesem Weg `drive_id` ab (BEFORE INSERT, SECURITY DEFINER,
-- `search_path = public, pg_temp`).
--
-- ---------------------------------------------------------------------------
-- Warum SECURITY DEFINER, obwohl 085 ausdrücklich Invoker gewählt hat
-- ---------------------------------------------------------------------------
--
-- `kontakt_feste_spalten()` ist bewusst Invoker, damit `current_user` die
-- aufrufende Rolle bleibt. Hier ist es umgekehrt richtig, und zwar wegen der
-- Revier-Gegenprobe: Als Invoker liefe der Blick auf `hunts` durch RLS. Eine
-- Zeile, die der Melder nicht sehen darf, käme als „nicht gefunden" zurück —
-- und aus einem Widerspruch zwischen Schein-Revier und Jagd-Revier würde
-- lautlos ein „kein Widerspruch". Eine Prüfung, die man durch Wegsehen
-- bestehen kann, ist keine.
--
-- Folge, bewusst in Kauf genommen: die drei festgehaltenen Spalten sind auch
-- für `postgres` und `service_role` nicht per UPDATE änderbar. Eine
-- Datenkorrektur braucht `alter table public.kills disable trigger
-- trg_kills_herkunft` — sichtbar und absichtlich, nicht nebenbei.
--
-- ---------------------------------------------------------------------------
-- Warum der Gültigkeitsvergleich von 077 abweicht
-- ---------------------------------------------------------------------------
--
-- 077 prüft `current_date between valid_from and valid_until` — richtig für
-- ein Lesetor, das im Jetzt fragt. Eine Erlegung fragt aber nach IHREM
-- Zeitpunkt (`erlegt_am`), und die Zeitzone der Datenbank ist UTC (gemessen).
-- `erlegt_am::date` würde eine Erlegung um 00:30 Berliner Zeit auf den Vortag
-- werfen und damit am ersten Gültigkeitstag abweisen. Deshalb
-- `at time zone 'Europe/Berlin'`. Beide Grenzen bleiben einschließend, genau
-- wie in 077.
--
-- ---------------------------------------------------------------------------
-- Was diese Migration NICHT tut
-- ---------------------------------------------------------------------------
--
--   * Keine Rückrechnung der 33 Altzeilen (Konzept §5). Der Trigger wirkt auf
--     neue und geänderte Zeilen; wer heute keine `district_id` hat, behält
--     keine.
--   * Kein Kontingent, keine Taxonomie, keine Freigabetabelle (Schritte 2–4).
--   * Kein Index auf `hunting_license_id`. Bei 33 Zeilen misst man ihn nicht.
--     Fällig mit der Aggregation aus Schritt 4 („noch frei"), spätestens wenn
--     `kills` vierstellig wird.
--   * Keine Änderung an `kills_reporter`. Der Riegel ist der Trigger, nicht
--     die Policy — die Policy regelt weiterhin, WESSEN Zeile man schreibt.
--
-- ---------------------------------------------------------------------------

-- 1. Die Spalte -------------------------------------------------------------
--
-- `on delete restrict`, entschieden von Moritz am 03.08.2026: „beim löschen
-- des scheins muss der revierbesitzer die bisherigen erlegungen trotzdem sehen
-- können, da darf nichts nachträglich verloren gehen."
--
-- Die Sichtbarkeit allein verlangte das nicht — `kills_district_owner` liest
-- über `district_id`, und die ist eine gespeicherte Spalte, die einen
-- gelöschten Schein überlebt. Was `set null` kosten würde, ist die HERKUNFT:
-- welche Erlegung auf welchem Schein stattfand, und das ist der ganze Zweck
-- dieser Spalte. `restrict` kostet dafür heute nichts — die Zentrale hat für
-- Scheine gar keinen Löschknopf (geprüft 03.08.2026), gesperrt wird über
-- `status`, nicht über Löschen.

alter table public.kills
  add column if not exists hunting_license_id uuid
    references public.hunting_licenses(id) on delete restrict;

comment on column public.kills.hunting_license_id is
  'Begehungsschein, unter dem die Erlegung stattfand. Wird von '
  'set_kill_herkunft() geprueft; district_id folgt daraus. Nach dem INSERT '
  'unveraenderlich. NULL heisst: unter keinem Schein gemeldet (z. B. eigene '
  'Jagd oder Meldung ueber einen aelteren Schreibweg). Migration 087.';

-- 2. Die Prüfung ------------------------------------------------------------

create or replace function public.set_kill_herkunft()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_schein_revier uuid;
  v_jagd_revier   uuid;
  v_tag           date;
begin
  -- UPDATE: Herkunft und Revier stehen mit der Meldung fest.
  --
  -- `hunt_id` steht mit dabei, weil `district_id` daraus abgeleitet wurde.
  -- Wäre die Jagd nachträglich austauschbar, zeigte die Erlegung auf Revier A,
  -- während ihre Jagd in Revier B liegt — genau die Inkonsistenz, gegen die
  -- diese Migration gebaut ist. Kein Client ändert die Spalte heute (gemessen:
  -- die PWA schreibt per UPDATE nur `kapital` und `notiz`, nativ gibt es
  -- keinen UPDATE-Pfad).
  --
  -- PostgREST sendet nur die genannten Spalten; ungenannte behalten ihren
  -- alten Wert, `is distinct from` schlägt für sie also nicht an.
  if tg_op = 'UPDATE' then
    if new.hunting_license_id is distinct from old.hunting_license_id then
      raise exception 'Der Begehungsschein einer Erlegung steht mit der Meldung fest'
        using errcode = 'insufficient_privilege';
    end if;
    if new.district_id is distinct from old.district_id then
      raise exception 'Das Revier einer Erlegung wird abgeleitet, nicht gesetzt'
        using errcode = 'insufficient_privilege';
    end if;
    if new.hunt_id is distinct from old.hunt_id then
      raise exception 'Die Jagd einer Erlegung steht mit der Meldung fest'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  -- INSERT.
  select h.district_id into v_jagd_revier
    from public.hunts h
   where h.id = new.hunt_id;

  -- Ohne Schein: das Revier kommt aus der Jagd, sonst gar nicht. `district_id`
  -- wird IMMER überschrieben und nie vom Client übernommen — auch dann nicht,
  -- wenn dabei null herauskommt. Ein leeres Feld ist ehrlich, ein vom Melder
  -- gewähltes wäre es nicht.
  if new.hunting_license_id is null then
    new.district_id := v_jagd_revier;
    return new;
  end if;

  v_tag := (coalesce(new.erlegt_am, now()) at time zone 'Europe/Berlin')::date;

  -- `hunting_licenses.district_id` ist NOT NULL — ein leeres Ergebnis heisst
  -- also eindeutig „keine passende Zeile" und nicht „Zeile ohne Revier".
  select l.district_id into v_schein_revier
    from public.hunting_licenses l
   where l.id = new.hunting_license_id
     and l.holder_id = new.reporter_id
     and l.status = 'aktiv'
     and v_tag between l.valid_from and l.valid_until;

  -- EINE Meldung für alle drei Fehlschläge (unbekannt / fremd / nicht gültig).
  -- Eine unterscheidende Fehlermeldung wäre ein Orakel: sie verriete einem
  -- Fremden, ob eine geratene Schein-ID existiert.
  if v_schein_revier is null then
    raise exception 'Begehungsschein gehoert nicht zum Melder oder war zum Zeitpunkt der Erlegung nicht gueltig'
      using errcode = 'insufficient_privilege';
  end if;

  -- Widerspruch zwischen Schein und Jagd: harter Abbruch, nicht stille Wahl
  -- eines der beiden Reviere. Eine Jagd ohne eigenes Revier (18 von 39)
  -- widerspricht nichts — dort trägt der Schein allein.
  if v_jagd_revier is not null and v_jagd_revier <> v_schein_revier then
    raise exception 'Begehungsschein und Jagd gehoeren zu verschiedenen Revieren'
      using errcode = 'integrity_constraint_violation';
  end if;

  new.district_id := v_schein_revier;
  return new;
end;
$function$;

-- 3. Rechte -----------------------------------------------------------------
--
-- Die Rollen namentlich, nicht bloss PUBLIC: Supabase vergibt EXECUTE auf neue
-- Funktionen per ALTER DEFAULT PRIVILEGES explizit an anon, authenticated und
-- service_role — ein `revoke ... from public` liesse sie unberührt. Belegt am
-- 31.07.2026 an `stand_ist_belegt()`, geschlossen fuer die 14 bestehenden
-- Trigger-Funktionen mit 082.
--
-- Warum es hier zaehlt: 062 beschreibt den Angriff, 082 hat ihn geschlossen —
-- wer eine SECURITY-DEFINER-Triggerfunktion ausfuehren darf, darf sie an eine
-- EIGENE temporaere Tabelle als Trigger haengen und NEW frei bestimmen.
-- Postgres prueft EXECUTE beim ANLEGEN des Triggers, nicht beim Feuern — der
-- Entzug bricht den Betrieb also nicht (an drei Bauformen gemessen, 31.07.).

revoke execute on function public.set_kill_herkunft()
  from public, anon, authenticated, service_role;

create trigger trg_kills_herkunft
  before insert or update on public.kills
  for each row execute function public.set_kill_herkunft();

-- ---------------------------------------------------------------------------
-- Gegenproben (als authenticated, jede mit ROLLBACK; Positivkontrolle zuerst)
-- ---------------------------------------------------------------------------
--
--   begin;
--   set local role authenticated;
--   set local "request.jwt.claim.sub" = '<uuid des Scheininhabers>';
--
--   -- 1 Positivkontrolle: eigener, gueltiger Schein -> district_id gesetzt
--   -- 2 fremder Schein                              -> 42501
--   -- 3 eigener Schein, erlegt_am ausserhalb        -> 42501
--   -- 4 Schein Revier A + Jagd Revier B             -> 23000
--   -- 5 ohne Schein, Jagd MIT Revier                -> district_id = Jagdrevier
--   -- 6 ohne Schein, Jagd OHNE Revier               -> district_id null
--   -- 7 district_id selbst gesetzt                  -> wird ueberschrieben
--   -- 8 UPDATE auf hunting_license_id/district_id/hunt_id -> 42501
--   -- 9 UPDATE auf notiz (PWA-Pfad)                 -> geht durch
--
--   rollback;
--
-- Gegenprobe pg_temp (muss 0 Zeilen liefern):
--   select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.prosecdef
--      and coalesce(array_to_string(p.proconfig,','),'') not like '%pg_temp%';
--
-- Gegenprobe EXECUTE (beide Spalten muessen false sein):
--   select has_function_privilege('anon',          'public.set_kill_herkunft()', 'EXECUTE'),
--          has_function_privilege('authenticated', 'public.set_kill_herkunft()', 'EXECUTE');

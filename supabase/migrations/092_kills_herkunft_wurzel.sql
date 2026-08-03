-- 092 — Die Wurzel: ein Revier an einer Jagd muss dem Ersteller zustehen
--
-- **Nie ohne 087, 090 und 091 lesen.** Diese Migration korrigiert 090 an der
-- Stelle, an der 090 selbst danebengriff, und schliesst vier weitere Befunde
-- derselben Fremdprüfung (Codex/GPT, xhigh, 03.08.2026 — nachgeholter Lauf
-- unter dem neuen Anker 2 der Review-Kette).
--
-- ===========================================================================
-- Befund 1 (hoch) — 090 hat das Loch nicht geschlossen, nur verschoben
-- ===========================================================================
--
-- 090 verlangt, dass der Melder zur Jagd gehört, bevor deren `district_id`
-- übernommen wird. Das schliesst den Weg über eine **fremde** `hunt_id`.
--
-- **Es schliesst nicht den Weg über eine EIGENE Jagd mit fremdem Revier.**
-- Auf `hunts.district_id` liegt ausser dem Fremdschlüssel keine Bedingung, und
-- `hunts_creator_all` (`for all using (creator_id = auth.uid())`, ohne eigenes
-- `with check`) prüft nur, WER die Jagd anlegt — nicht, WORAUF sie zeigt.
--
-- **Nachgestellt am 03.08.2026, mit Rollback:** Heinrich legt eine eigene
-- Solojagd an und trägt als Revier `66eeed5f…` ein — **Brockwinel, das
-- Pilotrevier**, das ihm nicht gehört und in dem er keinen Schein hat. Die
-- Erlegung darauf bekam `district_id = Brockwinel` und wäre in der Strecke des
-- Revierbesitzers erschienen.
--
-- **Der Fix gehört an die Wurzel, nicht an `kills`.** Ein Revier an einer Jagd
-- ist selbst eine berechtigungstragende Angabe — also gilt die Projektregel:
-- nicht „wer darf lesen", sondern „wer darf diese Zeile schreiben". Dieselbe
-- Wurzel wie 076, 079, 083 und 090; hier zum fünften Mal.
--
-- **Am Kill-Trigger liesse sie sich nicht sauber ziehen.** Der naheliegende
-- Gedanke — „der Melder muss zum Revier berechtigt sein" — bricht den
-- Normalfall: ein Gast auf einer Drückjagd hat weder Besitz noch Schein, und
-- seine Erlegung gehört trotzdem in dieses Revier. Berechtigt sein muss der,
-- der die JAGD anlegt, nicht jeder, der darauf meldet.
--
-- **Es bricht nichts, und das ist gemessen:**
--   * Beide Clients bieten längst nur berechtigte Reviere an —
--     `fetchMyDistricts` liest Besitz ODER `get_my_jes_district_ids()`.
--     Das UI-Tor gab es, das DB-Tor fehlte.
--   * Von 21 Jagden mit Revier ist der Ersteller in **21** der Besitzer.
--     Null Verstösse im Bestand.
--
-- **Geprüft wird nur, wenn sich das Revier ändert.** Ein späteres UPDATE an
-- einer alten Jagd (Status, Name) darf nicht daran scheitern, dass ein Schein
-- inzwischen abgelaufen ist — die Jagd war rechtmässig angelegt.
--
-- ===========================================================================
-- Befund 2 (hoch) — wer absagt oder die Jagd verlässt, behält das Schreibrecht
-- ===========================================================================
--
-- 090 lässt die **blosse Existenz** einer `hunt_participants`-Zeile genügen.
-- Das war bewusst so (eine von 33 Alt-Erlegungen stammt von einem `invited`-
-- Teilnehmer) — aber `participant_status` hat vier Werte, nicht zwei:
-- `invited`, `joined`, **`left`**, **`declined`**. 067 schreibt `left`
-- (`jagd_verlassen()`), und 088 führt `declined` am selben Tag ein.
--
-- Wer absagt oder geht, könnte danach unbegrenzt Erlegungen in das Revier
-- dieser Jagd schreiben. Ein entzogener Zustand mit Schreibrecht — genau die
-- Klasse, die 077 für Scheine geschlossen hat.
--
-- Jetzt zählen nur `invited` und `joined`. **`invited` bleibt drin**, aus dem
-- Grund aus 090: der Eingeladene ist kein Fremder, und die Zeile kann sich
-- niemand selbst anlegen.
--
-- ===========================================================================
-- Befund 3 (mittel) — ein ausdrückliches NULL kam durch
-- ===========================================================================
--
-- `coalesce(new.erlegt_am, now())` ersetzte NULL nur für den Vergleich, nie im
-- gespeicherten Datensatz. Der Spaltendefault greift bei einem ausdrücklichen
-- NULL nicht. Eine so geschriebene Zeile hatte also keinen Zeitpunkt, obwohl
-- die Schein-Gültigkeit gegen einen konkreten Tag geprüft worden war — und der
-- UPDATE-Riegel aus 090 machte sie danach unkorrigierbar.
--
-- Jetzt wird der Wert **zugewiesen** statt nur verglichen. Heute sind 0 von 33
-- Zeilen betroffen; kein Client sendet NULL, aber `curl` kann es.
--
-- ===========================================================================
-- Befund 4 (mittel) — `participant_id` war eine ungeprüfte Fremdreferenz
-- ===========================================================================
--
-- Der Trigger prüfte, ob IRGENDEINE Teilnehmerzeile zu Jagd und Melder passt,
-- verband sie aber nie mit `new.participant_id`. Eine Erlegung liess sich an
-- die Teilnehmerzeile eines anderen hängen, auch aus einer anderen Jagd.
-- Jetzt muss sie zu `(hunt_id, reporter_id)` gehören und steht danach fest.
--
-- ===========================================================================
-- Befund 5 (mittel) — `drive_id` war frei setzbar
-- ===========================================================================
--
-- `set_kill_drive_id()` (056) kehrt sofort zurück, wenn der Client bereits ein
-- `drive_id` mitgeschickt hat — die Zeitableitung war damit übersteuerbar,
-- auch mit einem Treiben aus einer fremden Jagd.
--
-- Jetzt wird ein mitgeschicktes `drive_id` beim INSERT **verworfen**. Das
-- trägt, weil dieser Trigger vor `trg_kills_set_drive_id` feuert (BEFORE-
-- Trigger laufen in Namensfolge, und `trg_kills_herkunft` <
-- `trg_kills_set_drive_id`) — die Ableitung sieht ein leeres Feld und tut ihre
-- Arbeit. Gemessen: kein Client schreibt die Spalte, 0 von 33 Zeilen tragen
-- sie.
--
-- **Auf UPDATE wird `drive_id` ausdrücklich NICHT festgehalten**, obwohl der
-- erste Entwurf dieser Migration genau das tat. Die Fremdprüfung hat den
-- Fehler vor dem Applizieren gefunden, und er hätte zwei bestehende Funktionen
-- zerbrochen — beide nachgeprüft:
--
--   * `trg_drives_backfill_kills` (AFTER UPDATE OF status auf `hunt_drives`,
--     Migration 056) trägt beim Start eines Treibens früh gemeldete
--     Erlegungen per `update kills set drive_id = new.id` nach. Ein Riegel
--     hätte nicht nur den Nachtrag, sondern **die ganze Statusänderung des
--     Treibens** zurückgerollt.
--   * `kills_drive_id_fkey` steht auf `on delete set null`. Das Löschen eines
--     Treibens führt also ein UPDATE auf `kills` aus — auch das wäre am
--     Riegel gescheitert.
--
-- Der Rest-Angriff (ein Angreifer schreibt sein eigenes `drive_id` per UPDATE)
-- bleibt damit offen. Er ist die kleinere Übel-Seite: er verschiebt eine
-- Erlegung zwischen Treiben **innerhalb** einer Jagd, zu der der Melder
-- ohnehin gehört, und `hunt_id` ist festgehalten. Die saubere Fassung wäre,
-- die Ableitung auch auf UPDATE kanonisch zu rechnen — eigener Schritt, weil
-- sie den Nachtrag aus 056 mit abbilden muss.
--
-- ===========================================================================
-- Was diese Migration bewusst NICHT tut
-- ===========================================================================
--
--   * **Keine Zeilensperre** beim Lesen von Schein oder Teilnehmerzeile. Der
--     Snapshot ist die richtige Semantik für ein bereits eingetretenes
--     Ereignis (ausführlich im Kopf von 090). Die tragfähige Fassung wäre
--     historisierte Mitgliedschaft mit Wirksamkeitszeitpunkten, geprüft gegen
--     `erlegt_am` — eigener Entwurf.
--   * **Kein Anfassen von `kills_participant_id_fkey`.** Der Fremdschlüssel
--     ohne `on delete` verhindert, dass ein Teilnehmer mit Erlegungen hart
--     gelöscht wird. Das ist vorbestehend und geht in die richtige Richtung;
--     088 stellt das Entfernen ohnehin gerade auf einen Zustand um.
--   * **Keine Rückrechnung** von Altzeilen.
--   * **Kein Lock zwischen Revierwechsel und Erlegung.** Der Riegel liest
--     `kills`, der Kill-Trigger liest `hunts`; unter READ COMMITTED sieht
--     keiner die noch nicht committete Zeile des anderen. Im Fenster kann eine
--     Erlegung das alte Revier tragen, während die Jagd schon das neue hat.
--     Selten — der Ersteller läuft dabei gegen seine eigenen Teilnehmer — und
--     bewusst offen gelassen, aus demselben Grund wie beim Schein in 090:
--     ein `for share` würde die Reihenfolge zweier Transaktionen zur
--     Jagdrechtsfrage machen. **Hier steht es, damit der Kopf den Befund nicht
--     als vollständig geschlossen verkauft.**
--   * **Die Bürgschaft der Jagd altert nicht.** Ein Ersteller mit erloschenem
--     Schein kann selbst nicht mehr melden — Teilnehmerzeilen anlegen darf er
--     weiter (`participants_creator_all`), und für Teilnehmer bürgt die Jagd
--     zeitlos. Zwei zusammenwirkende Konten halten so einen Schreibweg offen,
--     solange die Jagd existiert. Braucht ein echtes Zweitkonto und ist die
--     Kehrseite der gewollten Gast-Semantik; die tragfähige Schliessung ist
--     dieselbe wie oben — historisierte Mitgliedschaft.

-- ===========================================================================
-- Befund 6 (hoch) — der Bestand wurde ungeprüft mitgenommen
-- ===========================================================================
--
-- Der UPDATE-Zweig lässt ein unverändertes Revier durch. Das ist richtig (ein
-- späteres Status-UPDATE darf nicht an einem abgelaufenen Schein scheitern),
-- unterstellt aber, dass jede bestehende Zuordnung rechtmässig ist. Bis zu
-- dieser Migration konnte sie das nicht sein.
--
-- Deshalb prüft die Migration ihre eigene Vorbedingung, bevor sie irgendetwas
-- anlegt, und bricht ab, wenn der Bestand sie verletzt. Gemessen am
-- 03.08.2026: 21 von 21 Jagden mit Revier sind vom Besitzer angelegt, null
-- Verstösse — die Prüfung ist also erwartungsgemäss ein Durchlauf, aber sie
-- steht hier, damit „grandfathered" eine belegte Aussage ist und keine
-- Annahme.
--
-- **Die Prüfung ist bewusst milder als der Trigger:** sie fragt, ob der
-- Ersteller je einen Schein für dieses Revier hatte, nicht ob er heute einen
-- gültigen hat. Eine Jagd, die unter einem inzwischen abgelaufenen Schein
-- rechtmässig entstand, ist kein Verstoss.
--
-- ===========================================================================
-- Befund 7 (hoch) — Jagd und Erlegungen konnten auseinanderlaufen
-- ===========================================================================
--
-- Ein berechtigter Revierwechsel an einer Jagd war auch dann erlaubt, wenn
-- daran schon Erlegungen hingen — deren `district_id` ist seit 087
-- unveränderlich. Jagd und Strecke hätten danach dauerhaft zu verschiedenen
-- Revieren gehört. Jetzt sperrt der Trigger den Wechsel, sobald eine Erlegung
-- an der Jagd hängt.

-- ---------------------------------------------------------------------------
-- 0. Vorbedingung: der Bestand muss die neue Regel schon erfüllen
-- ---------------------------------------------------------------------------

do $$
declare
  v_verstoesse integer;
begin
  select count(*) into v_verstoesse
    from public.hunts h
   where h.district_id is not null
     and not exists (select 1 from public.districts d
                      where d.id = h.district_id and d.owner_id = h.creator_id)
     and not exists (select 1 from public.hunting_licenses l
                      where l.district_id = h.district_id and l.holder_id = h.creator_id);

  if v_verstoesse > 0 then
    raise exception
      'Abbruch: % Jagd(en) zeigen auf ein Revier, zu dem der Ersteller nie berechtigt war. Erst klaeren, dann applizieren.',
      v_verstoesse;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Die Wurzel: das Revier einer Jagd
-- ---------------------------------------------------------------------------

create or replace function public.hunt_revier_muss_erlaubt_sein()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  -- Unveraendertes Revier auf UPDATE durchlassen: die Jagd war rechtmaessig
  -- angelegt, und ein inzwischen abgelaufener Schein darf ein spaeteres
  -- Status-UPDATE nicht scheitern lassen.
  if tg_op = 'UPDATE' and new.district_id is not distinct from old.district_id then
    return new;
  end if;

  -- Ein Revierwechsel an einer Jagd, an der schon Erlegungen haengen, wuerde
  -- Jagd und Strecke dauerhaft trennen: `kills.district_id` ist seit 087
  -- unveraenderlich.
  --
  -- **Dieser Riegel steht VOR dem NULL-Ausstieg, und das ist der Punkt.** Im
  -- ersten Entwurf stand er danach — dann lief `A -> NULL` ungeprueft durch
  -- und trennte Jagd und Strecke genau so, wie der Riegel es verhindern soll.
  -- Von der Schlusslesung vor dem Applizieren gefunden. Er haengt deshalb an
  -- der AENDERUNG, nicht am neuen Wert.
  if tg_op = 'UPDATE'
     and exists (select 1 from public.kills k where k.hunt_id = new.id)
  then
    raise exception 'Das Revier einer Jagd mit gemeldeten Erlegungen laesst sich nicht setzen oder wechseln (Datenkorrektur: Trigger ausdruecklich abschalten, s. Kopf von 087)'
      using errcode = 'object_in_use';
  end if;

  if new.district_id is null then
    return new;
  end if;

  if exists (select 1 from public.districts d
              where d.id = new.district_id
                and d.owner_id = new.creator_id)
  then
    return new;
  end if;

  -- Gueltiger Begehungsschein. Der Rechtstag ist der BERLINER Kalendertag,
  -- nicht `current_date` — die Datenbank laeuft auf UTC, und zwischen
  -- Mitternacht und 02:00 Berliner Zeit waere das der Vortag. 077 nimmt an
  -- dieser Stelle noch `current_date`; das ist die bekannte Abweichung C-20/C-22
  -- im Backlog. Neuer Code erbt sie nicht.
  if exists (select 1 from public.hunting_licenses l
              where l.district_id = new.district_id
                and l.holder_id = new.creator_id
                and l.status = 'aktiv'
                and (now() at time zone 'Europe/Berlin')::date
                    between l.valid_from and l.valid_until)
  then
    return new;
  end if;

  raise exception 'Zu diesem Revier darfst du keine Jagd anlegen'
    using errcode = 'insufficient_privilege';
end;
$function$;

revoke execute on function public.hunt_revier_muss_erlaubt_sein()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_hunts_revier_erlaubt on public.hunts;
create trigger trg_hunts_revier_erlaubt
  before insert or update on public.hunts
  for each row execute function public.hunt_revier_muss_erlaubt_sein();

-- ---------------------------------------------------------------------------
-- 2. Der Kill-Trigger, vierte Fassung
-- ---------------------------------------------------------------------------
--
-- ACHTUNG beim Umformulieren der Fehlermeldungen (unveraendert aus 090):
-- Die native App erkennt einen abgelehnten Schein am Wort „Begehungsschein"
-- und waehlt ihn daraufhin ab. Wer eine Schein-Meldung umformuliert, muss das
-- Wort stehen lassen oder den Client mitziehen — und KEINE neue Meldung auf
-- einem Schreibweg nach `kills` darf das Wort enthalten, ausser sie bedeutet
-- dasselbe. Spaetestens mit dem Kontingent gehoert die Erkennung auf einen
-- eigenen SQLSTATE.

create or replace function public.set_kill_herkunft()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_schein_revier uuid;
  v_jagd_revier   uuid;
  v_ersteller     uuid;
  v_tag           date;
begin
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
    if new.erlegt_am is distinct from old.erlegt_am then
      raise exception 'Der Zeitpunkt einer Erlegung steht mit der Meldung fest'
        using errcode = 'insufficient_privilege';
    end if;
    -- Neu in 092: beide sind abgeleitete bzw. geprueft uebernommene Bezuege.
    if new.participant_id is distinct from old.participant_id then
      raise exception 'Die Teilnehmerzeile einer Erlegung steht mit der Meldung fest'
        using errcode = 'insufficient_privilege';
    end if;
    -- `drive_id` steht hier bewusst NICHT: der Nachtrag aus 056 und das
    -- `on delete set null` des Fremdschluessels sind beide UPDATEs auf diese
    -- Spalte. S. Kopf, Befund 5.
    return new;
  end if;

  -- INSERT.
  --
  -- Neu in 092: zuweisen statt nur vergleichen. Ein ausdrueckliches NULL
  -- umgeht den Spaltendefault und haette eine Zeile ohne Zeitpunkt ergeben,
  -- die der UPDATE-Riegel danach einbetoniert.
  new.erlegt_am := coalesce(new.erlegt_am, now());

  -- Neu in 092: ein mitgeschicktes Treiben wird verworfen. Die Ableitung
  -- uebernimmt trg_kills_set_drive_id, der nach diesem Trigger feuert.
  new.drive_id := null;

  if new.erlegt_am > now() + interval '15 minutes' then
    raise exception 'Der Zeitpunkt einer Erlegung kann nicht in der Zukunft liegen'
      using errcode = 'integrity_constraint_violation';
  end if;

  if new.hunt_id is not null then
    select h.district_id, h.creator_id into v_jagd_revier, v_ersteller
      from public.hunts h
     where h.id = new.hunt_id;

    if v_ersteller = new.reporter_id then
      -- Neu in 092: der Ersteller muss zum ZEITPUNKT DER ERLEGUNG noch
      -- berechtigt sein. Ohne das bliebe eine einmal angelegte Jagd nach
      -- Ablauf oder Entzug des Scheins ein unbegrenzter Schreibweg in ein
      -- fremdes Revier — 077 schliesst den Zugriff sofort, dieser Pfad haette
      -- ihn offengehalten.
      --
      -- Fuer TEILNEHMER gilt das ausdruecklich nicht: ein Gast auf einer
      -- Druckjagd hat weder Besitz noch Schein, und seine Erlegung gehoert
      -- trotzdem in dieses Revier. Fuer ihn buergt die Jagd, in die ihn der
      -- Jagdleiter geholt hat.
      if v_jagd_revier is not null
         and not exists (select 1 from public.districts d
                          where d.id = v_jagd_revier and d.owner_id = new.reporter_id)
         and not exists (select 1 from public.hunting_licenses l
                          where l.district_id = v_jagd_revier
                            and l.holder_id = new.reporter_id
                            and l.status = 'aktiv'
                            and (new.erlegt_am at time zone 'Europe/Berlin')::date
                                between l.valid_from and l.valid_until)
      then
        raise exception 'Zum Revier dieser Jagd bist du zum Zeitpunkt der Erlegung nicht berechtigt'
          using errcode = 'insufficient_privilege';
      end if;

    -- Neu in 092: `left` und `declined` zaehlen nicht mehr als Zugehoerigkeit.
    elsif not exists (select 1
                        from public.hunt_participants p
                       where p.hunt_id = new.hunt_id
                         and p.user_id = new.reporter_id
                         -- `status` ist nullable mit Default 'invited'. Ohne
                         -- das coalesce wuerde eine NULL-Zeile als Fremder
                         -- gelten und ein legitim Eingeladener ein 42501
                         -- bekommen. Heute gibt es keine solche Zeile.
                         and coalesce(p.status, 'invited') in ('invited', 'joined'))
    then
      raise exception 'Zu dieser Jagd gehoerst du nicht'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- Neu in 092: die Teilnehmerzeile muss zu dieser Jagd und diesem Melder
  -- gehoeren. Vorher liess sich eine Erlegung an eine fremde Zeile haengen.
  if new.participant_id is not null then
    if not exists (select 1 from public.hunt_participants p
                    where p.id = new.participant_id
                      and p.hunt_id is not distinct from new.hunt_id
                      and p.user_id = new.reporter_id)
    then
      raise exception 'Die Teilnehmerzeile gehoert nicht zu dieser Jagd und diesem Melder'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  if new.hunting_license_id is null then
    new.district_id := v_jagd_revier;
    return new;
  end if;

  v_tag := (new.erlegt_am at time zone 'Europe/Berlin')::date;

  select l.district_id into v_schein_revier
    from public.hunting_licenses l
   where l.id = new.hunting_license_id
     and l.holder_id = new.reporter_id
     and l.status = 'aktiv'
     and v_tag between l.valid_from and l.valid_until;

  if v_schein_revier is null then
    raise exception 'Begehungsschein gehoert nicht zum Melder oder war zum Zeitpunkt der Erlegung nicht gueltig'
      using errcode = 'insufficient_privilege';
  end if;

  if v_jagd_revier is not null and v_jagd_revier <> v_schein_revier then
    raise exception 'Begehungsschein und Jagd gehoeren zu verschiedenen Revieren'
      using errcode = 'integrity_constraint_violation';
  end if;

  new.district_id := v_schein_revier;
  return new;
end;
$function$;

revoke execute on function public.set_kill_herkunft()
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Gegenproben (als authenticated, jede mit ROLLBACK; Positivkontrolle zuerst)
-- ---------------------------------------------------------------------------
--
--   -- 1 Positivkontrolle: Jagd im eigenen Revier anlegen        -> geht durch
--   -- 2 Jagd mit fremdem Revier anlegen (der Angriff)           -> 42501
--   -- 3 Jagd mit Revier aus eigenem gueltigem Schein            -> geht durch
--   -- 4 bestehende Jagd, Status-UPDATE ohne Revierwechsel       -> geht durch
--   -- 5 bestehende Jagd, Revier auf ein fremdes umschreiben     -> 42501
--   -- 6 Erlegung als `declined`-Teilnehmer                      -> 42501
--   -- 7 Erlegung mit erlegt_am = NULL                           -> Zeitpunkt gesetzt
--   -- 8 Erlegung mit fremder participant_id                     -> 42501
--   -- 9 Erlegung mit mitgeschicktem drive_id                    -> verworfen
--   -- 10 UPDATE auf participant_id                              -> 42501
--   -- 11 Treiben starten mit passender frueher Erlegung         -> Nachtrag laeuft (056)
--   -- 12 Treiben loeschen, an dem eine Erlegung haengt          -> drive_id wird null
--   -- 13 Ersteller meldet nach Ablauf seines Scheins            -> 42501
--   -- 14 Teilnehmer meldet ohne eigene Berechtigung             -> geht durch
--   -- 15 Revier einer Jagd mit Erlegungen wechseln              -> 55006
--   -- 16 saemtliche Gegenproben aus 087, 090 und 091            -> unveraendert

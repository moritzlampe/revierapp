-- 090 — Korrektur zu 087: die Jagd muss dem Melder gehören
--
-- **Nie ohne 087 lesen, und 087 nie ohne diese Datei.** Beide Befunde stammen
-- aus der Fremdprüfung (Codex/GPT, xhigh) am 03.08.2026, unmittelbar nach dem
-- Applizieren von 087, und beide sind gegen die Produktionsdatenbank
-- nachgestellt worden.
--
-- ---------------------------------------------------------------------------
-- Befund 1 — ein Schreibweg in ein fremdes Revier
-- ---------------------------------------------------------------------------
--
-- 087 setzt im scheinlosen Zweig `new.district_id := hunts.district_id` für
-- die `hunt_id`, die der Aufrufer mitschickt. Geprüft wurde daran nichts:
--
--   * `kills_reporter` (die einzige Schreibpolicy) prüft nur `reporter_id`.
--   * `kills_hunt_id_fkey` verlangt nur, dass die Jagd existiert.
--   * Der Trigger ist SECURITY DEFINER und liest `hunts` an RLS vorbei — die
--     Sichtbarkeitsgrenze, die den Aufrufer sonst aufgehalten hätte, greift
--     hier gerade nicht. Das ist in 087 Absicht (sonst liesse sich die
--     Revier-Gegenprobe durch Wegsehen bestehen) und wird hier zum Problem.
--
-- **Den Beweis hatte 087 selbst schon geliefert, ohne es zu merken.** Seine
-- Gegenproben T1, T5 und T6 schrieben als Heinrich Erlegungen in die Jagd
-- „Kartentest L7" (`dd77dd77-…-0002`) — eine Jagd, zu der Heinrich weder
-- Ersteller ist noch eine Teilnehmerzeile hat. Sie gingen anstandslos durch
-- und bekamen deren `district_id`. Was dort als Positivkontrolle gelesen
-- wurde, war in Wahrheit der Fremdeintrag.
--
-- Vor 087 wäre die Spalte null geblieben; die Erlegung hing schon immer an der
-- fremden Jagd, aber sie erschien nirgends als Revierdatum. 087 hat aus einem
-- stillen Fremdeintrag einen sichtbaren gemacht: `kills_district_owner` liest
-- über `district_id`, die Erlegung landet also in der Strecke des fremden
-- Revierbesitzers.
--
-- **Nach dieser Migration wirft derselbe Versuch `42501`** — gegen
-- „Kartentest L7" ebenso wie gegen die Brockwinel-Jagd „Jagd am 9.7.2026"
-- (`f538e8e4…`), zu der Heinrich ebenfalls keine Zeile hat.
--
-- **Eine erste Nachstellung war untauglich und ist verworfen.** Sie lief gegen
-- die Brockwinel-Jagd „Test GPS Lock" (`28737e24…`), geprüft mit
-- `status = 'joined'` — Heinrich hat dort aber eine `invited`-Zeile und ist
-- damit kein Fremder. Aufgefallen ist es erst, als der neue Riegel dort
-- korrekt NICHT auslöste. Wer diesen Fall nachstellt, muss auf die blosse
-- Existenz der Zeile prüfen, nicht auf ihren Status.
--
-- **Der Riegel:** der Melder muss Ersteller der Jagd sein oder eine Zeile in
-- `hunt_participants` haben.
--
-- **`status = 'joined'` wird bewusst NICHT verlangt.** Gemessen: von 33
-- Erlegungen stammen 32 von einem Melder, der Ersteller UND beigetretener
-- Teilnehmer ist; die 33. stammt von einem `invited`-Teilnehmer, der nie
-- beigetreten ist. Das ist kein Fremder, sondern jemand, den der Jagdleiter
-- ausdrücklich eingeladen hat — ein Riegel, der ihn aussperrt, würde eine
-- echte Meldung verhindern.
--
-- **Warum die blosse Existenz der Zeile genügt:** anlegen kann sie niemand für
-- sich selbst. `hunt_participants` hat genau zwei Schreibpolicies —
-- `participants_creator_all` (Ersteller der Jagd) und `participants_leader_all`
-- (beigetretener Jagdleiter). Ein Fremder hat dort keine Zeile und kann sich
-- keine verschaffen. Genau die Frage aus der Projektregel: nicht „wer darf
-- lesen", sondern „wer darf diese Zeile schreiben".
--
-- Die Meldung wird abgewiesen und nicht still entwertet. Der Grundsatz
-- „Melden nie verhindern" zielt auf das Kontingent — eine Erlegung, die man in
-- die Jagd eines Fremden schreibt, ist keine Meldung, sondern ein Fremdeintrag.
-- Kein Client kann diesen Zustand erzeugen: beide Apps melden ausschliesslich
-- auf der Jagd, in der der Nutzer gerade steckt.
--
-- ---------------------------------------------------------------------------
-- Befund 2 — `erlegt_am` war nach dem INSERT frei änderbar
-- ---------------------------------------------------------------------------
--
-- 087 hält `hunting_license_id`, `district_id` und `hunt_id` fest, `erlegt_am`
-- aber nicht — obwohl die Schein-Gültigkeit genau daran gemessen wurde. Der
-- Melder konnte die Erlegung nachträglich auf einen Tag ausserhalb der
-- Scheingültigkeit setzen, während Schein und Revier stehen blieben. Nebenbei
-- veraltet dadurch die zeitabhängige `drive_id` aus `set_kill_drive_id`.
--
-- Jetzt vierte festgehaltene Spalte. Kein Client ändert sie heute (die PWA
-- schreibt per UPDATE nur `kapital` und `notiz`, nativ gibt es keinen
-- UPDATE-Pfad).
--
-- ---------------------------------------------------------------------------
-- Zwei weitere Befunde, bewusst NICHT behoben
-- ---------------------------------------------------------------------------
--
-- **Keine Zeilensperre beim Lesen des Scheins.** Der Prüfer bemängelt, dass
-- eine parallel laufende Sperre (`status = 'entzogen'`) aus dem älteren
-- Snapshot noch als `aktiv` gelesen werden kann. Das ist richtig beschrieben
-- und trotzdem die gewollte Semantik: eine Abschussmeldung dokumentiert ein
-- bereits eingetretenes Ereignis. Wer um 18:00 erlegt und um 18:01 meldet,
-- während der Revierbesitzer um 18:00:30 sperrt, hat rechtmässig erlegt. Ein
-- `for update`-Lock würde die Reihenfolge der Transaktionen zur
-- Jagdrechtsfrage machen. Die tragfähige Fassung wäre historisierte
-- Gültigkeit (Sperre mit Wirksamkeitszeitpunkt, geprüft gegen `erlegt_am`) —
-- das ist ein eigener Entwurf, kein Nebenbei.
--
-- **Keine Grenze gegen zukunftsdatierte `erlegt_am`.** Ein Inhaber kann eine
-- Erlegung vordatieren und damit einen Schein nutzen, dessen `valid_from`
-- erst später beginnt. Real, aber folgenlos, solange es kein Kontingent gibt
-- (Schritt 3/4 des Konzepts). Ein harter Riegel bliebe an einer falsch
-- gestellten Geräteuhr hängen und verhinderte eine echte Meldung — die
-- Toleranz ist deshalb eine Produktentscheidung und gehört zu dem Schritt, in
-- dem der Zähler entsteht.

-- ---------------------------------------------------------------------------
-- ACHTUNG beim Umformulieren der Fehlermeldungen
-- ---------------------------------------------------------------------------
--
-- Die native App erkennt einen abgelehnten Schein am Wort **„Begehungsschein"**
-- in der Fehlermeldung (`KillCaptureSheet.tsx`, Fehlerzweig beim Melden) und
-- wählt ihn daraufhin ab, damit die Meldung ohne Schein durchgeht. Der
-- SQLSTATE genügt dafür nicht: `42501` hat viele Quellen.
--
-- Wer eine der beiden Schein-Meldungen umformuliert, muss das Wort stehen
-- lassen oder den Client mitziehen. Sonst steht dort wieder „später erneut
-- versuchen" vor einem Fehler, der beim zehnten Versuch derselbe ist — und die
-- Erlegung bleibt unerfasst.

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
    -- Neu in 090: die Schein-Gueltigkeit wurde gegen diesen Zeitpunkt geprueft.
    if new.erlegt_am is distinct from old.erlegt_am then
      raise exception 'Der Zeitpunkt einer Erlegung steht mit der Meldung fest'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  -- INSERT.
  --
  -- Neu in 090: die Jagd wird nur akzeptiert, wenn der Melder dazugehoert.
  -- Ohne diese Bedingung genuegte eine bekannte fremde hunt_id, um eine
  -- Erlegung in ein fremdes Revier zu schreiben (s. Kopf).
  if new.hunt_id is not null then
    select h.district_id into v_jagd_revier
      from public.hunts h
     where h.id = new.hunt_id
       and (h.creator_id = new.reporter_id
            or exists (select 1
                         from public.hunt_participants p
                        where p.hunt_id = h.id
                          and p.user_id = new.reporter_id));

    -- `not found` heisst hier eindeutig „gehoert nicht dazu": die hunt_id
    -- existiert, dafuer sorgt kills_hunt_id_fkey. Ein Revier von NULL waere
    -- dagegen ein Treffer und laesst `found` wahr.
    if not found then
      raise exception 'Zu dieser Jagd gehoerst du nicht'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  if new.hunting_license_id is null then
    new.district_id := v_jagd_revier;
    return new;
  end if;

  v_tag := (coalesce(new.erlegt_am, now()) at time zone 'Europe/Berlin')::date;

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

-- `create or replace` behaelt die Rechte der bestehenden Funktion, der Entzug
-- aus 087 gilt also weiter. Trotzdem noch einmal namentlich — die Zeile kostet
-- nichts und eine spaetere Neuanlage der Funktion bekaeme sonst wieder die
-- Supabase-Vorgaben (ALTER DEFAULT PRIVILEGES an anon/authenticated/service_role).
revoke execute on function public.set_kill_herkunft()
  from public, anon, authenticated, service_role;

-- Der Trigger aus 087 bleibt unveraendert und zeigt auf dieselbe Funktion.

-- ---------------------------------------------------------------------------
-- Gegenproben (als authenticated, jede mit ROLLBACK; Positivkontrolle zuerst)
-- ---------------------------------------------------------------------------
--
--   -- 1 Positivkontrolle: eigene Jagd, kein Schein      -> district_id = Jagdrevier
--   -- 2 fremde Jagd (weder Ersteller noch Teilnehmer)   -> 42501
--   -- 3 fremde Jagd + eigener gueltiger Schein          -> 42501 (Jagd zuerst)
--   -- 4 eingeladen, nie beigetreten                     -> geht durch
--   -- 5 hunt_id null + eigener Schein                   -> district_id = Scheinrevier
--   -- 6 UPDATE auf erlegt_am                            -> 42501
--   -- 7 UPDATE auf notiz (PWA-Pfad)                     -> geht durch
--   -- 8 die neun Gegenproben aus 087 erneut             -> unveraendert

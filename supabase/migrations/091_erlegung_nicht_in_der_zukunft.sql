-- 091 — Eine Erlegung kann nicht in der Zukunft liegen
--
-- Dritter und letzter Befund der Fremdprüfung zu 087 (Codex/GPT, xhigh,
-- 03.08.2026). 090 hat die ersten beiden geschlossen; dieser war als „gehört
-- zu Schritt 3/4" zurückgestellt — **die Begründung dafür hat Moritz am selben
-- Tag zerlegt, und er hatte recht.**
--
-- ---------------------------------------------------------------------------
-- Warum der Punkt zurückgestellt war und warum das falsch war
-- ---------------------------------------------------------------------------
--
-- Der Befund: `v_tag` in `set_kill_herkunft()` übernimmt `new.erlegt_am` ohne
-- jede Plausibilitätsgrenze. Ein Inhaber kann eine Erlegung vordatieren und
-- damit einen Schein nutzen, dessen `valid_from` erst später beginnt —
-- kontingentwirksam, sobald es ein Kontingent gibt.
--
-- Mein Gegenargument war: ein harter Riegel bleibt an einer falsch gestellten
-- Geräteuhr hängen und verhindert dann eine echte Meldung. Moritz' Rückfrage
-- (03.08.2026): „welche uhr ist denn noch manuell gestellt? unser system gibt
-- die uhrzeit vor oder?"
--
-- Nachgemessen, und beide Hälften der Antwort zählen:
--
--   * **Nein, das System gibt die Uhrzeit NICHT vor.** `erlegt_am` kommt aus
--     der Geräteuhr — nativ `new Date()` beim Antippen (`insertKill.ts`), in
--     der PWA genauso. Der `default now()` der Spalte greift nie, weil beide
--     Clients den Wert immer mitschicken.
--   * **Aber die falsche Uhr war nie der interessante Fall.** iOS stellt die
--     Zeit automatisch; eine Zeitzonen-Fehleinstellung verschiebt gar nichts,
--     weil `toISOString()` einen absoluten Zeitpunkt liefert. Was bleibt, ist
--     dass `erlegt_am` ein **vom Client bestimmter Wert** ist: wer ein eigenes
--     Token hat, schickt per `curl` jeden beliebigen Zeitstempel.
--
-- Gegen den zweiten Fall hilft die Grenze, und der erste ist zu selten, um sie
-- aufzuwiegen. Das Zurückstellen war also mit dem schwächeren der beiden
-- Argumente begründet.
--
-- ---------------------------------------------------------------------------
-- Die Form der Grenze
-- ---------------------------------------------------------------------------
--
--   * **Nur nach vorn.** Der legitime Wert liegt immer in der Vergangenheit:
--     angetippt, Sekunden später gemeldet. Rückdatierung bleibt ausdrücklich
--     offen — ein späteres „Erlegung nachtragen" braucht sie, und ein
--     rückdatierter Schein-Bezug scheitert ohnehin an der Gültigkeitsprüfung
--     aus 087.
--   * **15 Minuten Toleranz.** Großzügig gegen Uhrdrift und wertlos für den
--     Angriff: die Schein-Grenzen, um die es geht, liegen Tage bis Monate
--     entfernt.
--   * **Für JEDE Erlegung, nicht nur die mit Schein.** Eine zukunftsdatierte
--     Erlegung ist auch ohne Kontingent Unsinn — sie landet im falschen
--     Jagdjahr und verdreht die Strecke.
--   * **Nur auf INSERT.** Auf UPDATE ist `erlegt_am` seit 090 festgehalten.
--   * Die Prüfung steht **vor** dem Jagd- und dem Scheinzweig: ein unsinniger
--     Zeitstempel soll den unsinnigen Zeitstempel melden und nicht etwas über
--     Reviere.
--
-- **Damit sind alle drei Befunde der Fremdprüfung zu 087 geschlossen.** Offen
-- bleibt allein die fehlende Zeilensperre beim Lesen des Scheins — die ist
-- keine Lücke, sondern die gewollte Semantik (s. Kopf von 090).

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
    if new.erlegt_am is distinct from old.erlegt_am then
      raise exception 'Der Zeitpunkt einer Erlegung steht mit der Meldung fest'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  -- INSERT.
  --
  -- Neu in 091: kein Zeitpunkt aus der Zukunft. Steht bewusst ganz vorn, damit
  -- die Meldung den Zeitstempel benennt und nicht ein Revier.
  if coalesce(new.erlegt_am, now()) > now() + interval '15 minutes' then
    raise exception 'Der Zeitpunkt einer Erlegung kann nicht in der Zukunft liegen'
      using errcode = 'integrity_constraint_violation';
  end if;

  if new.hunt_id is not null then
    select h.district_id into v_jagd_revier
      from public.hunts h
     where h.id = new.hunt_id
       and (h.creator_id = new.reporter_id
            or exists (select 1
                         from public.hunt_participants p
                        where p.hunt_id = h.id
                          and p.user_id = new.reporter_id));

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

-- Der Warnblock aus 090 gilt unveraendert weiter: die native App erkennt einen
-- abgelehnten Schein am Wort „Begehungsschein" in der Fehlermeldung. Die neue
-- Meldung hier enthaelt es bewusst NICHT — ein zukunftsdatierter Zeitstempel
-- ist kein Schein-Problem, und der Client soll deshalb auch nicht den Schein
-- abwaehlen und erneut melden. Er zeigt „Bitte spaeter erneut versuchen",
-- was hier nicht ideal, aber harmlos ist: kein Client kann diesen Zustand
-- erzeugen, weil beide `new Date()` senden.

revoke execute on function public.set_kill_herkunft()
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Gegenproben (als authenticated, jede mit ROLLBACK; Positivkontrolle zuerst)
-- ---------------------------------------------------------------------------
--
--   -- 1 Positivkontrolle: erlegt_am = jetzt            -> geht durch
--   -- 2 erlegt_am = jetzt + 10 min (in der Toleranz)   -> geht durch
--   -- 3 erlegt_am = jetzt + 20 min                     -> 23000
--   -- 4 erlegt_am = morgen                             -> 23000
--   -- 5 erlegt_am = vor einem Jahr                     -> geht durch (Rueckdatierung bleibt offen)
--   -- 6 erlegt_am gar nicht gesetzt (default now())    -> geht durch
--   -- 7 die Gegenproben aus 087 und 090                -> unveraendert

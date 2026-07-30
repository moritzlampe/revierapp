-- 068 — Begehungsschein einlösen + Einzeljagd im Revier
--
-- Grundlage: docs/konzepte/QuickHunt_Konzept_Begehungsschein_V1.md (GELOCKT 30.07.2026)
--            docs/konzepte/QuickHunt_Konzept_Einzeljagd_V1.md      (GELOCKT 30.07.2026)
-- (beide in quickhunt-native)
--
-- Warum das eine Migration ist: die Einzeljagd hängt vollständig am
-- Begehungsschein — ohne eingelösten Schein sieht ein Pächter sein Revier nicht
-- (districts_jes_select verlangt holder_id = auth.uid()).
--
-- Additiv und rückwärtskompatibel. Idempotent: mehrfaches Ausführen ist
-- folgenlos (anders als 039).

-- ---------------------------------------------------------------------------
-- 1. Zonentyp für den Begehungsbezirk
-- ---------------------------------------------------------------------------
-- Eine Zone, die zu einem Schein gehört, ist keine allgemeine Jagdzone — sie
-- täte sonst auf jeder Revierkarte so, als gälte sie für alle.
-- ACHTUNG: der neue Wert darf in DIESER Migration nicht verwendet werden
-- (Postgres erlaubt ADD VALUE in einer Transaktion, aber nicht die Benutzung).
-- Er wird hier nur angelegt; geschrieben wird er vom Portal.
alter type zone_type add value if not exists 'begehungsbezirk';

-- ---------------------------------------------------------------------------
-- 2. Neue Spalten
-- ---------------------------------------------------------------------------

-- Die stehende Einwilligung des Jägers, einmal pro Revier (Einzeljagd §11.1).
-- Sie sitzt am Schein und nicht an der Jagd, weil der Schein das Paar
-- (Jäger, Revier) ist — damit erbt sie seine Laufzeit.
-- Skala (Einzeljagd §4): 0 aus, 1 unterwegs, 2 Stand, 3 Position.
alter table hunting_licenses
  add column if not exists revier_sichtbarkeit smallint
    check (revier_sichtbarkeit between 0 and 3);

-- Einzelne Stände statt einer Fläche (Begehungsschein §5).
alter table hunting_licenses
  add column if not exists stand_ids uuid[] not null default '{}';

-- Die beim Losgehen eingefrorene Stufe (Einzeljagd §11.2). Das Revier darf
-- eine laufende Jagd nicht nachträglich sichtbarer machen, als beim Start
-- vereinbart war. NULL = keine Einzeljagd im Revier.
alter table hunts
  add column if not exists revier_sichtbarkeit smallint
    check (revier_sichtbarkeit between 0 and 3);

-- ---------------------------------------------------------------------------
-- 3. Einladungscode
-- ---------------------------------------------------------------------------
-- 9 Byte = 72 Bit, nicht ratbar. translate() ist keine Kosmetik: reines Base64
-- erzeugt '+' und '/', und ein '/' zerlegt die Route /schein/<code> in zwei
-- Segmente — der Fehler träfe nur einen Teil der Codes und sähe aus wie ein
-- kaputter Link. gen_random_bytes liegt in `extensions`, deshalb qualifiziert:
-- unqualifiziert bricht der Default, sobald der Aufrufer einen anderen
-- search_path hat.
alter table hunting_licenses
  alter column invite_code
  set default translate(encode(extensions.gen_random_bytes(9), 'base64'), '+/', '-_');

-- invite_code ist bereits UNIQUE (hunting_licenses_invite_code_key).

-- ---------------------------------------------------------------------------
-- 4. holder_id ist unveränderlich, sobald sie steht
-- ---------------------------------------------------------------------------
-- Der Aussteller darf sperren (status = 'pausiert'/'entzogen') — aber nicht den
-- Schein still auf ein anderes Konto umhängen: der bisherige Inhaber verlöre
-- sein Revier, ohne dass es ihm irgendwo gesagt wird. Für jemand anderen wird
-- ein neuer Schein ausgestellt.
create or replace function public.hunting_licenses_holder_fixieren()
returns trigger
language plpgsql
as $$
begin
  if old.holder_id is not null and new.holder_id is distinct from old.holder_id then
    raise exception
      'holder_id kann nicht geaendert werden — Schein % ist bereits eingeloest', old.id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_hunting_licenses_holder_fixieren on hunting_licenses;
create trigger trg_hunting_licenses_holder_fixieren
  before update on hunting_licenses
  for each row execute function public.hunting_licenses_holder_fixieren();

-- ---------------------------------------------------------------------------
-- 5. Schein einlösen
-- ---------------------------------------------------------------------------
-- Muss SECURITY DEFINER sein, nicht Policy: hunting_licenses_holder erlaubt
-- Lesen nur bei holder_id = auth.uid() — also genau dem, was das Einlösen erst
-- herstellt. Eine Policy müsste "darf schreiben, wer den Code kennt" ausdrücken
-- und dazu den Code lesen dürfen, den sie schützt.
--
-- Rückgabe ist unterscheidbar, damit der Screen "schon eingelöst" von
-- "abgelaufen" trennen kann statt "hat nicht geklappt" zu sagen.
-- ergebnis: ok | bereits_deiner | unbekannt | schon_eingeloest | gesperrt
--         | abgelaufen | nicht_angemeldet

-- Die Sichtbarkeits-Obergrenze des Reviers. Eigene Funktion, weil sie an
-- mehreren Stellen gebraucht wird und districts.settings sonst mehrfach
-- aufgeschlagen würde. Default 1 (unterwegs): nicht 0, sonst findet niemand das
-- Feature; nicht 2, weil eine Voreinstellung nichts preisgeben darf
-- (Einzeljagd §4).
-- BEWUSST NICHT security definer: als definer wäre sie ein Auskunftsschalter
-- über jedes beliebige Revier (existiert es, und wie steht es eingestellt) für
-- jeden angemeldeten Nutzer. Als invoker greift RLS auf districts — der
-- Fremde bekommt NULL. Innerhalb der definer-Funktionen unten läuft sie
-- trotzdem mit deren Rechten, weil dort der definer der aktuelle Nutzer ist.
create or replace function public.revier_stufe(p_district_id uuid)
returns smallint
language sql
stable
set search_path = public
as $$
  select coalesce((settings->>'einzeljagd_sichtbarkeit')::smallint, 1)
    from districts where id = p_district_id;
$$;

create or replace function public.schein_einloesen(p_code text)
returns table (
  ergebnis      text,
  district_id   uuid,
  district_name text,
  revier_max    smallint
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  l         hunting_licenses%rowtype;
  jetzt     hunting_licenses%rowtype;
  betroffen int;
begin
  if auth.uid() is null then
    return query select 'nicht_angemeldet'::text, null::uuid, null::text, null::smallint;
    return;
  end if;

  select * into l from hunting_licenses where invite_code = p_code;

  if not found then
    return query select 'unbekannt'::text, null::uuid, null::text, null::smallint;
    return;
  end if;

  if l.holder_id = auth.uid() then
    -- Kein Fehler: wer seinen eigenen Link zweimal öffnet, hat nichts falsch
    -- gemacht. Als "schon eingelöst" zu antworten läse sich wie eine Absage.
    return query select 'bereits_deiner'::text, d.id, d.name, revier_stufe(d.id)
                   from districts d where d.id = l.district_id;
    return;
  end if;

  if l.holder_id is not null then
    return query select 'schon_eingeloest'::text, null::uuid, null::text, null::smallint;
    return;
  end if;

  if l.status is distinct from 'aktiv'::jes_status then
    return query select 'gesperrt'::text, null::uuid, null::text, null::smallint;
    return;
  end if;

  if l.valid_until < current_date then
    return query select 'abgelaufen'::text, null::uuid, null::text, null::smallint;
    return;
  end if;

  -- Alle drei Bedingungen stehen in der WHERE-Klausel, nicht nur oben geprüft.
  -- Zwischen dem SELECT und hier kann jemand den Schein gesperrt haben oder
  -- ein zweiter Einlöser schneller gewesen sein; wer nur auf die Prüfung von
  -- vorhin baut, löst einen Schein ein, den es so nicht mehr gibt.
  update hunting_licenses
     set holder_id = auth.uid(), updated_at = now()
   where id = l.id
     and holder_id is null
     and status = 'aktiv'::jes_status
     and valid_until >= current_date;
  get diagnostics betroffen = row_count;

  if betroffen = 0 then
    -- Verloren — aber woran? Erneut lesen statt raten. Der wahrscheinlichste
    -- Fall ist der Doppeltipp desselben Nutzers auf langsamer Leitung, und
    -- dem "schon eingelöst" zu sagen läse sich wie eine Absage.
    select * into jetzt from hunting_licenses where id = l.id;
    if jetzt.holder_id = auth.uid() then
      return query select 'bereits_deiner'::text, d.id, d.name, revier_stufe(d.id)
                     from districts d where d.id = jetzt.district_id;
    elsif jetzt.holder_id is not null then
      return query select 'schon_eingeloest'::text, null::uuid, null::text, null::smallint;
    elsif jetzt.status is distinct from 'aktiv'::jes_status then
      return query select 'gesperrt'::text, null::uuid, null::text, null::smallint;
    else
      return query select 'abgelaufen'::text, null::uuid, null::text, null::smallint;
    end if;
    return;
  end if;

  return query select 'ok'::text, d.id, d.name, revier_stufe(d.id)
                 from districts d where d.id = l.district_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Wer ist Revierinhaber
-- ---------------------------------------------------------------------------
-- Genau eine Stelle, an der die Frage gestellt wird (Einzeljagd §6). Heute
-- owner_id; kommt die Rollentabelle für Mitpacht, ändert sich diese Funktion
-- und kein Zeile Einzeljagd-Code.
create or replace function public.is_revierinhaber(p_district_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from districts
     where id = p_district_id and owner_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- 7. Wer ist gerade im Revier
-- ---------------------------------------------------------------------------
-- Die eine fehlende Kante Jagd -> Revier (Einzeljagd §2). Als Funktion und
-- nicht als Policy, weil RLS Zeilen filtern kann, aber keine Spalten maskieren:
-- Stufe 1 muss den Ort verbergen, den Stufe 2 zeigt. Was die Stufe nicht deckt,
-- kommt gar nicht erst zurück — ein Client kann nichts anfordern, was ihm nicht
-- zusteht.
create or replace function public.revier_praesenz(p_district_id uuid)
returns table (
  hunt_id     uuid,
  jaeger_name text,
  seit        timestamptz,
  stufe       smallint,
  stand_id    uuid,
  stand_name  text,
  -- NICHT "position": das ist in einer returns-table-Liste reserviert
  -- (POSITION(x IN y)) und scheitert mit 42601.
  standort    geometry
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    h.id,
    coalesce(p.display_name, 'Unbekannt'),
    h.started_at,
    h.revier_sichtbarkeit,
    case when h.revier_sichtbarkeit >= 2 then b.map_object_id end,
    case when h.revier_sichtbarkeit >= 2 then mo.name end,
    case when h.revier_sichtbarkeit >= 3 then pc.location end
  from hunts h
  left join profiles p            on p.id  = h.creator_id
  left join hunt_stand_bezug b    on b.hunt_id = h.id
  left join map_objects mo        on mo.id = b.map_object_id
  left join positions_current pc  on pc.hunt_id = h.id
  where h.district_id = p_district_id
    and h.kind   = 'solo'::hunt_kind
    and h.status = 'active'::hunt_status
    -- Die Stufe ist beim Losgehen eingefroren (Einzeljagd §11.2), hier wird
    -- kein min() mehr gerechnet. NULL = nie gefragt = nichts zeigen.
    and coalesce(h.revier_sichtbarkeit, 0) >= 1
    and is_revierinhaber(p_district_id);
$$;

-- ---------------------------------------------------------------------------
-- 8. Rechte
-- ---------------------------------------------------------------------------
revoke execute on function public.schein_einloesen(text)   from public;
revoke execute on function public.revier_praesenz(uuid)    from public;
revoke execute on function public.is_revierinhaber(uuid)   from public;

grant execute on function public.schein_einloesen(text)    to authenticated;
grant execute on function public.revier_praesenz(uuid)     to authenticated;
grant execute on function public.is_revierinhaber(uuid)    to authenticated;

-- revier_stufe wird nur INNERHALB von schein_einloesen gebraucht; dort trägt
-- der definer die Rechte. Deshalb der Riegel für beide Client-Rollen.
--
-- `revoke ... from public` allein genügt hier NICHT, nachgemessen am
-- 30.07.2026: Supabase vergibt EXECUTE per ALTER DEFAULT PRIVILEGES direkt an
-- anon und authenticated, und PUBLIC zu entziehen trifft diese Grants nicht
-- (has_function_privilege('authenticated', …) stand danach weiter auf true).
-- Wer eine Funktion wirklich schließen will, muss die Rollen benennen.
--
-- Die eigentliche Sicherheit trägt aber nicht dieser Riegel, sondern dass die
-- Funktion invoker ist: als definer wäre sie ein Auskunftsschalter über jedes
-- Revier. So greift RLS auf districts — ein Unbeteiligter bekommt NULL.
revoke execute on function public.revier_stufe(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Appliziert und gegengeprüft am 30.07.2026
-- ---------------------------------------------------------------------------
-- a) Spalten und Default stehen (information_schema).
--
-- b) Trigger: Umhängen auf ein anderes Konto scheitert mit 42501,
--    Positivkontrolle (auflagen ändern) geht durch. Getestet über einen
--    DO-Block, der am Ende absichtlich RAISE EXCEPTION wirft — damit räumt der
--    Abbruch die Testzeile selbst weg. Gegenprobe: hunting_licenses = 0 Zeilen.
--
-- c) Ende zu Ende, im Testrevier „Karte (L7)", in einer Transaktion mit
--    ROLLBACK: erster Aufruf 'ok', zweiter 'bereits_deiner' (Doppeltipp),
--    falscher Code 'unbekannt'. Damit ist auch belegt, dass schein_einloesen
--    als definer weiterhin an revier_stufe kommt, obwohl beide Client-Rollen
--    dort kein EXECUTE mehr haben.
--
-- d) RLS-Matrix auf Brockwinel:
--      unbeteiligte UUID → 0 Reviere, revier_stufe NULL, is_revierinhaber
--        false, revier_praesenz 0 Zeilen
--      Besitzer (Moritz) → revier_stufe 1, is_revierinhaber true,
--        revier_praesenz 0 Zeilen (es gibt noch keine Einzeljagd)
--    ACHTUNG bei künftigen Tests: Heinrich ist für Brockwinel KEIN Fremder —
--    er hängt über die Pilotjagd an districts_joined_participant_select und
--    sieht das Revier zu Recht. Wer eine Negativprobe braucht, nimmt eine
--    UUID, die an keiner Jagd hängt.

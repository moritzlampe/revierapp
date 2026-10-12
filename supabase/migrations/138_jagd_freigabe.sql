-- 138: Freigabe und Jagdregeln je Jagd (CN-277).
--
-- ANLASS: Feedback #14 (Moritz, 01.10.2026): "In einer Jagd noch ueberlegen,
-- wo man Freigabe und Jagdregeln einsehen kann." Heute gibt es beides nirgends
-- — weder in der App noch in der PWA noch in der DB (gemessen 12.10.2026).
-- Bauplan: quickhunt-native/docs/konzepte/QuickHunt_Bauplan_Freigabe_Jagdregeln_V1.md (F14 geprueft)
-- Begruendung und Pruefkette: quickhunt-native/docs/migrationen/138_jagd_freigabe.md
--
--
-- DIE REGEL IN VIER SAETZEN
--
-- 1. `hunts.freigabe` ist eine Liste von Zeilen {wildart_id, name,
--    geschlecht, gewicht_min, gewicht_max}: eine globale Art ODER Oberart aus
--    dem Wildartenkatalog, optional das Geschlecht (nur wo die Art es nicht
--    schon traegt), optional ein Gewicht in ganzen kg (aufgebrochen).
-- 2. `hunts.jagdregeln` ist Freitext. `null` heisst bei beiden "nicht
--    eingetragen"; eine leere Liste und reiner Leerraum werden zu `null`.
-- 3. Den Namen jeder Zeile setzt der Server aus dem Katalog — der Client
--    zeigt ihn auch nach einem Kaltstart im Funkloch, wo er keinen Katalog hat.
-- 4. Nach Jagdende (`ended_at`) sind beide fest (Entscheidung Moritz,
--    12.10.2026): es gibt keine Historie, eine spaetere Aenderung
--    ueberschriebe spurlos, was an dem Tag galt. Damit das haelt, laesst
--    sich `ended_at` nicht mehr auf null zuruecksetzen (`42501`).
--
--
-- WARUM ZWEI SPALTEN AN `hunts` UND KEINE TABELLE (Bauplan E2)
--
-- Lesen und Schreiben regeln die bestehenden Policies: jeder Teilnehmer liest
-- (`hunts_participant_select`), Ersteller und Jagdleiter schreiben
-- (`hunts_creator_all`, `hunts_leader_update`). Realtime (`hunts` ist ohne
-- Spaltenliste publiziert) und der Offline-Kopf der App tragen die Spalten
-- ohne Umbau. Kein neuer Fremdschluessel → keine Zeile in der Loeschliste von
-- 132, keine Aenderung an der Jagd-Loeschung. Eine Tabelle braeuchte vier
-- Policies, eine neue Realtime-Tabelle und einen FK auf `hunts` — fuer
-- nichts, was hier gebraucht wird: es wird nicht gezaehlt, und alle
-- Teilnehmer sehen alles.
--
-- WARUM KEIN 096-LOCH
--
-- 096 liess `hunts.wildart_ids` weg, weil ein uuid[] ohne Eigentumspruefung
-- plus ein Policy-Zweig, der daraus Leserecht ableitet, fremde private Arten
-- lesbar gemacht haette. Hier liest KEINE Policy `freigabe`, und der Trigger
-- laesst nur globale Arten zu (`besitzer_id is null`), die ohnehin jeder
-- lesen darf. Private Arten: CN-338.
--
-- WARUM EIN TRIGGER UND NICHT NUR DER CLIENT
--
-- `hunts_leader_update` hat keine Spaltengrenze. Wer PostgREST direkt
-- anspricht, kaeme ohne Trigger mit allem durch, was jsonb fasst. Ein CHECK
-- kann die Art nicht gegen den Katalog pruefen (keine Unterabfragen).
--
--
-- TRIGGER: nicht SECURITY DEFINER — `wildarten_select` laesst globale Arten
-- fuer `authenticated` durch, mehr braucht er nicht. `pg_temp` am ENDE des
-- search_path (076), REVOKE namentlich (081/082). Feuert bei JEDEM INSERT
-- (dort ohne die Spalten: Normalisieren, sofort zurueck) und bei
-- `update of freigabe, jagdregeln, ended_at` — also auch beim Beenden einer
-- Jagd (`endHunt`, Auto-Ende 134, `konto_loeschen` 132), dort ohne Wirkung,
-- solange niemand `ended_at` zuruecksetzt — ebenso bei den zwei PWA-Endepfaden
-- (`app/app/hunt/[id]/page.tsx:489`, `app/app/home-content.tsx:354`), die
-- `ended_at` mitschreiben (Schlusslesung 138, B1). NICHT bei den
-- `last_activity_at`-Updates (1×/min je laufender Jagd) und nicht bei den
-- Zentrale-UPDATEs (nur `name/type/signal_mode/scheduled_*`).
--
-- DATENKORREKTUR (Schlusslesung 138, B2): die Sperren gelten fuer JEDE Rolle,
-- auch fuer `postgres` (Owner, aber kein Superuser) — eine faelschlich beendete
-- Jagd laesst sich per SQL nicht einfach zurueckholen. Der Weg, bewusst und in
-- EINER Transaktion:
--   begin;
--   alter table public.hunts disable trigger trg_hunts_freigabe_pruefen;
--   update public.hunts set ended_at = null, status = 'active' where id = '<id>';
--   alter table public.hunts enable trigger trg_hunts_freigabe_pruefen;
--   commit;
-- Waehrenddessen sind auch die Pruefung und das Einfrieren der Freigabe aus.
-- Dasselbe Muster wie `hunt_revier_muss_erlaubt_sein` (087).
-- Alphabetisch zwischen `trg_hunts_endtermin` und `trg_hunts_gesichert_fest`;
-- keiner der anderen BEFORE-Trigger liest die neuen Spalten.
--
-- NaN: die Strings 'NaN'/'Infinity' casten problemlos zu numeric. Gefangen
-- werden sie vom Bereich, weil NaN fuer Postgres groesser als jede Zahl ist
-- (AGENTS.md, SQL-Regeln) — also > 999. Nicht-numerische Strings scheitern am
-- Cast (22P02).
--
-- ⚠ DIESE DATEI TRAEGT BEWUSST KEIN `\set ON_ERROR_STOP on` (120-Muster).
-- Ueber psql (Kartei psql, 132):
--   psql -v ON_ERROR_STOP=1 -c "set lock_timeout = '10s'" \
--        -c "set statement_timeout = '120s'" -f 138_jagd_freigabe.sql
-- Registrierung dann von Hand nachtragen.
-- ⚠ GEZIELT APPLIZIEREN, nie ueber "alle ausstehenden" (115, T9).
-- ⛔ VOR dem nativen Build applizieren: der Client liest die Spalten im Jagdkopf.

begin;

alter table public.hunts
  add column freigabe   jsonb,
  add column jagdregeln text;

-- Form-Riegel. Leeres kommt hier nie an: der Trigger normalisiert es vorher.
alter table public.hunts
  add constraint hunts_freigabe_form check (
    freigabe is null
    or (jsonb_typeof(freigabe) = 'array' and jsonb_array_length(freigabe) between 1 and 40)),
  add constraint hunts_jagdregeln_form check (
    jagdregeln is null
    or (char_length(jagdregeln) <= 4000 and btrim(jagdregeln, E' \t\r\n') <> ''));

create function public.hunts_freigabe_pruefen() returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
declare
  z jsonb;
  art record;
  g text;
  gmin numeric;
  gmax numeric;
  neu jsonb := '[]'::jsonb;
begin
  -- Leeres wird null, in der DB und nicht nur im Client (Bauplan E3).
  if new.jagdregeln is not null and btrim(new.jagdregeln, E' \t\r\n') = '' then
    new.jagdregeln := null;
  end if;
  if new.freigabe = '[]'::jsonb then
    new.freigabe := null;
  end if;

  if tg_op = 'UPDATE' then
    -- Nach Jagdende fest (Bauplan E11).
    if old.ended_at is not null
       and (new.freigabe is distinct from old.freigabe
            or new.jagdregeln is distinct from old.jagdregeln) then
      raise exception 'Freigabe und Jagdregeln einer beendeten Jagd sind fest'
        using errcode = '42501',
              hint = 'Datenkorrektur: Trigger trg_hunts_freigabe_pruefen kurz abschalten, s. Kopf von 138.';
    end if;
    -- Und das Ende selbst laesst sich nicht zuruecknehmen — sonst hiesse
    -- "fest": ended_at auf null, aendern, ended_at zurueck (Codex 138, Punkt 2).
    -- Kein Weg in beiden Clients und keine DB-Funktion setzt ended_at je
    -- zurueck (gemessen 12.10.2026); `startHunt` fasst es nicht an.
    if old.ended_at is not null and new.ended_at is null then
      raise exception 'Eine beendete Jagd laesst sich nicht wieder oeffnen'
        using errcode = '42501',
              hint = 'Datenkorrektur: Trigger trg_hunts_freigabe_pruefen kurz abschalten, s. Kopf von 138.';
    end if;
    if new.freigabe is not distinct from old.freigabe then
      return new;
    end if;
  end if;

  if new.freigabe is null then
    return new;
  end if;
  -- Die Laenge VOR der Schleife: sonst liefe eine riesige Liste erst durch jede
  -- Katalogabfrage, bevor der CHECK sie abweist (Codex 138, Punkt 4). Auf eine
  -- Nicht-Liste wirft jsonb_array_length selbst 22023.
  if jsonb_array_length(new.freigabe) > 40 then
    raise exception 'Hoechstens 40 Zeilen in der Freigabe' using errcode = '22023';
  end if;

  -- Keine eigene Formpruefung: eine Nicht-Liste wirft hier selbst 22023, ein
  -- Nicht-Objekt liefert bei ->> null und scheitert an "Unbekannte Wildart",
  -- und fremde Schluessel fallen beim Neubau der Zeile unten weg (Ponytail).
  for z in select value from jsonb_array_elements(new.freigabe) loop
    select w.id, w.name, w.geschlecht_implizit into art
      from wildarten w
     where w.id = (z->>'wildart_id')::uuid
       and w.besitzer_id is null;
    if not found then
      raise exception 'Unbekannte Wildart in der Freigabe' using errcode = '22023';
    end if;

    g := z->>'geschlecht';
    if g is not null and (g not in ('maennlich', 'weiblich') or art.geschlecht_implizit is not null) then
      raise exception 'Geschlecht passt nicht zur Wildart' using errcode = '22023';
    end if;

    gmin := (z->>'gewicht_min')::numeric;
    gmax := (z->>'gewicht_max')::numeric;
    if (gmin is not null and (gmin < 1 or gmin > 999 or gmin <> trunc(gmin)))
       or (gmax is not null and (gmax < 1 or gmax > 999 or gmax <> trunc(gmax)))
       or (gmin is not null and gmax is not null and gmin > gmax) then
      raise exception 'Gewicht ausserhalb des Bereichs' using errcode = '22023';
    end if;

    neu := neu || jsonb_build_array(jsonb_build_object(
      'wildart_id', art.id, 'name', art.name, 'geschlecht', g,
      'gewicht_min', gmin, 'gewicht_max', gmax));
  end loop;

  new.freigabe := neu;
  return new;
end;
$$;

revoke all on function public.hunts_freigabe_pruefen()
  from public, anon, authenticated, service_role;

create trigger trg_hunts_freigabe_pruefen
  before insert or update of freigabe, jagdregeln, ended_at on public.hunts
  for each row execute function public.hunts_freigabe_pruefen();

comment on column public.hunts.freigabe is
  'CN-277 (138): Freigabe der Jagdleitung, Liste {wildart_id, name, geschlecht, gewicht_min, gewicht_max}; name setzt der Server; null = nicht eingetragen; nach Jagdende fest. Ersetzt wildart_ids aus Wildartenkatalog §10.';
comment on column public.hunts.jagdregeln is
  'CN-277 (138): Jagdregeln der Jagdleitung, Freitext; null = nicht eingetragen; nach Jagdende fest.';

commit;

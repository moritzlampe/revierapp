-- 142: Jagdeinstellungen — Pirschweg "Nie" als Standard (CN-373) und
-- Standard-Jagdregeln je Jagdart (CN-376).
--
-- ANLASS: Moritz, 15.10.2026: "beim Pirschweg auch die Option 'gar nicht'
-- anbieten und zum Standard machen" — und: "unter du - Jagdeinstellungen -
-- die Jagdregeln (man kann ja Entwuerfe speichern) anzuzeigen und den
-- Standard zu waehlen".
-- Bauplan (F14 geprueft, GELOCKT V1.3 15.10.2026):
--   quickhunt-native/docs/konzepte/QuickHunt_Bauplan_Jagdeinstellungen_V1.md
-- Begruendung und Pruefkette: quickhunt-native/docs/migrationen/142_jagdeinstellungen.md
--
--
-- DIE REGEL IN SECHS SAETZEN
--
-- 1. `user_settings.weg_frist` bekommt den Wert 'nie' und den Standard 'nie'.
--    "Nie" heisst: kein anderer sieht den Weg (`positions`) — nicht waehrend
--    der Jagd, nicht danach, nicht in einer gesicherten Jagd, auf der
--    Drueckjagd auch die Leitung nicht (Bauplan §0 (1)–(3), (b)).
-- 2. Ein Konto ohne Einstellungszeile gilt als 'nie' (§0 (2)) — auch fuer
--    seine alten Wege. Die drei Zeilen mit 'folgejagdjahr' gehen mit (§0 (a)).
-- 3. Unberuehrt: der EIGENE Weg (Zweig 1 des Helfers), der Live-Punkt
--    (`live_sichtbare_teilnahmen`, ohne `user_settings`), die Aufzeichnung,
--    die Loeschsperre gesicherter Jagden, `konto_loeschen`.
-- 4. `user_settings.regel_standard_ansitz` / `_drueckjagd`: der TITEL einer
--    Vorlage aus `regel_vorlagen`; null = kein Standard.
-- 5. `trg_hunts_regeln_vorgabe` traegt beim Anlegen einer GRUPPENJAGD den
--    Text der Vorlage in `jagdregeln` ein — nur bei genau EINEM passenden,
--    gueltigen Treffer, nur wenn keine Regeln mitkommen.
-- 6. Ein Standard verhindert NIE das Anlegen einer Jagd: jeder andere Fall
--    (keine Zeile, keine Vorlage, mehrdeutig, leer, zu lang, kein Text)
--    traegt schlicht nichts ein.
--
--
-- WARUM "NIE" DICHT IST (Bauplan E1, Schlusslesung F12)
--
-- Die neue Bedingung steht im zweiten Zweig der Union als ein Glied des AND.
-- Ihre STELLUNG wirkt nicht — der Planer darf umordnen. Dicht ist es, weil
-- das AND fuer ein "Nie"-Konto falsch ist, und weil `weg_frist_ende(…, 'nie')`
-- einen CASE ohne Zweig trifft und NULL liefert statt eines Fehlers, falls es
-- trotzdem ausgewertet wird. Ein Gast ohne Konto (`hp.user_id` null) faellt
-- per `coalesce` ebenfalls auf 'nie'.
-- 133 Falle 1 bleibt erfuellt: eine Policy wertet `weg_frist` aus, und das
-- ist nur zulaessig, weil der Nutzer damit allein KUERZT. 'nie' kuerzt.
--
-- Benannt (Bauplan E1, Schlusslesung F11): (1) ist eine Zusage ueber die
-- Tabelle `positions`. `positions_current` ist Realtime-publiziert; ein
-- Abonnent KOENNTE daraus waehrend der Jagd einen Weg mitschreiben. Die App
-- tut das nicht. Entschieden in (1).
--
--
-- DIE AUFLOESUNG DES STANDARDS (Bauplan E7/E8 — EINE Regel fuer Server und App)
--
-- Eine Vorlage passt, wenn `lower(btrim(titel, E' \t\r\n'))` gleich ist
-- (ICU-`lower` = `toLocaleLowerCase('de')`, gemessen 15.10.2026). Eingetragen
-- wird nur bei GENAU EINEM Treffer, dessen `regeln` ein jsonb-String ist, nach
-- `btrim` nicht leer und hoechstens 4000 Zeichen lang (der CHECK
-- `hunts_jagdregeln_form` prueft NACH allen Triggern — eine zu lange Vorlage
-- liesse sonst jede Gruppenjagd des Kontos scheitern). Mehrere Treffer (nur
-- per REST moeglich, der Client verhindert gleiche Titel) tragen NICHTS ein:
-- ein "erster Treffer" hinge an einer Reihenfolge, die niemand sieht.
-- Kein `select … into strict` (zwei Treffer wuerfen sonst P0003). `->>` auf
-- ein Nicht-Objekt liefert NULL ohne Fehler (gemessen).
--
-- Reihenfolge der BEFORE-INSERT-Trigger auf `hunts` (alphabetisch):
-- auto_ende, endtermin, freigabe_pruefen, gesichert_fest, REGELN_VORGABE,
-- revier_erlaubt, sicht_vorgabe. `freigabe_pruefen` macht aus leeren Regeln
-- `null` — danach greift der Standard auch dann. Keiner der anderen aendert
-- `kind`/`type`. Freigabe und `freigabe_version` fasst dieser Trigger nicht an.
--
-- INVOKER (Muster `hunts_sicht_vorgabe`): liest `user_settings` des
-- `creator_id`. Die Insert-Policy `hunts_creator_all` erzwingt
-- `creator_id = auth.uid()` — also die eigene Zeile. Fremde `creator_id`:
-- RLS verbirgt die Zeile, der Trigger traegt nichts ein, die Policy lehnt ab.
-- Als `postgres`/`service_role` liest er die Zeile des eingetragenen
-- Erstellers — gewollt.
--
-- Benannt (Bauplan E8): PWA und Portal zeigen `jagdregeln` nirgends (CN-380);
-- der Portal-Wiederholungsweg aendert `type` per UPDATE, die beim INSERT
-- eingetragenen Regeln der alten Jagdart bleiben (CN-380 c).
--
--
-- RUECKWAERTS (Bauplan E2)
--
-- ⛔ VOR dem Einreichen von Build 51 applizieren. Umgekehrt zeigte Build 51
-- einem Konto ohne Zeile "Nie", waehrend der Server dessen Wege noch zeigt.
-- Build 50 nach dem Applizieren: Konten MIT Zeile sehen unter
-- Jagdeinstellungen ab dem naechsten Laden "konnte nicht geladen werden"
-- ('nie' ist ihm unbekannt); Konten ohne Zeile sehen "Bis Ende des folgenden
-- Jagdjahres". Beides in der harmlosen Richtung (angezeigt wird mehr, als der
-- Server gewaehrt). Jeder Build-50-Schreiber, der zum ersten Mal eine Zeile
-- anlegt (Sterne, Grundkarte, Ruhefenster, Sicht, Vorlage), legt sie mit
-- 'nie' an. Hingenommen bis zum Update.
-- Die Datenkorrektur loest `trg_user_settings_updated_at` aus: ein offener
-- Vorlagen-Editor prallt beim Compare-and-Swap einmal ab und liest neu
-- (`aendereVorlagen`, VERSUCHE = 3) — gewollt.
--
--
-- ⚠ DIESE DATEI TRAEGT BEWUSST KEIN `\set ON_ERROR_STOP on` (120-Muster).
-- Ueber psql:
--   psql -v ON_ERROR_STOP=1 -c "set lock_timeout = '10s'" \
--        -c "set statement_timeout = '120s'" -f 142_jagdeinstellungen.sql
-- Registrierung dann von Hand nachtragen.
-- ⚠ GEZIELT APPLIZIEREN, nie ueber "alle ausstehenden" (115, T9).

begin;

-- ---------------------------------------------------------------------------
-- 1. "Nie" als Frist und als Standard (CN-373, Bauplan E1)
-- ---------------------------------------------------------------------------
alter table public.user_settings
  drop constraint user_settings_weg_frist_check;
alter table public.user_settings
  add constraint user_settings_weg_frist_check
  check (weg_frist in ('nie', 'jagd', '30_tage', '6_monate', 'folgejagdjahr'));
alter table public.user_settings
  alter column weg_frist set default 'nie';

-- ---------------------------------------------------------------------------
-- 2. Datenkorrektur: der bisherige Standard geht mit (§0 (a))
-- ---------------------------------------------------------------------------
-- Ob die Konten 'folgejagdjahr' gewaehlt hatten, war nicht unterscheidbar
-- (es war der Spalten-Default). Moritz: "ja mit auf nie setzen als Basis".
-- Gezaehlt wird im Probelauf vorher/nachher; hier nur die Meldung.
do $$
declare
  v_geaendert integer;
begin
  update public.user_settings set weg_frist = 'nie' where weg_frist = 'folgejagdjahr';
  get diagnostics v_geaendert = row_count;
  raise notice '142 Datenkorrektur weg_frist folgejagdjahr -> nie: % Zeilen', v_geaendert;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Der Helfer: "nie" verbirgt jeden fremden Weg (Bauplan E1)
-- ---------------------------------------------------------------------------
-- Grundlage ist der Text aus 141 (= Katalog, gelesen 15.10.2026), nicht 133.
-- Geaendert: die Zeile `coalesce(us.weg_frist, 'nie') <> 'nie'` und der
-- Rueckfall im Frist-Aufruf ('folgejagdjahr' -> 'nie'). `create or replace`
-- behaelt die OID, `positions_sichtbar` bleibt gueltig, die Rechte bleiben.
create or replace function public.weg_sichtbare_teilnahmen()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select hp.id
    from hunt_participants hp
   where hp.user_id = auth.uid()
  union
  select hp.id
    from hunt_participants hp
    join hunts h on h.id = hp.hunt_id
    left join user_settings us on us.user_id = hp.user_id
   where hp.hunt_id in (select m.hunt_id from hunt_participants m
                         where m.user_id = auth.uid() and m.status = 'joined')
     and coalesce(us.weg_frist, 'nie') <> 'nie'
     and hp.position_consent is distinct from 'none'
     and (hp.position_consent is distinct from 'anon'
          or exists (select 1 from hunt_participants l
                      where l.hunt_id = hp.hunt_id
                        and l.user_id = auth.uid()
                        and l.status  = 'joined'
                        and l.role    = 'jagdleiter'))
     and (h.type is distinct from 'drueckjagd' or hp.role = 'treiber')
     and (   h.status not in ('completed', 'auto_completed')
          or h.gesichert_am is not null
          or now() < weg_frist_ende(coalesce(h.ended_at, h.last_activity_at),
                                    coalesce(us.weg_frist, 'nie')))
     and public.teilnahme_in_sicht(hp.id)
$$;

-- ---------------------------------------------------------------------------
-- 4. Standard-Jagdregeln je Jagdart (CN-376, Bauplan E7)
-- ---------------------------------------------------------------------------
-- Nur die zwei Jagdarten, die App und PWA anlegen (Gemeinschaftsansitz,
-- Drueckjagd). Pirsch/Erntejagd legt nur das Portal an (CN-380 b).
-- CHECK wie der Vorlagentitel im Client (≤ 60, `vorlageFehler`), dazu nicht
-- leer nach `btrim` (111-Regel: `btrim` ohne Zeichensatz nimmt nur Leerzeichen).
alter table public.user_settings
  add column regel_standard_ansitz text
    constraint user_settings_regel_standard_ansitz_check
    check (regel_standard_ansitz is null
           or (char_length(regel_standard_ansitz) between 1 and 60
               and btrim(regel_standard_ansitz, E' \t\r\n') <> '')),
  add column regel_standard_drueckjagd text
    constraint user_settings_regel_standard_drueckjagd_check
    check (regel_standard_drueckjagd is null
           or (char_length(regel_standard_drueckjagd) between 1 and 60
               and btrim(regel_standard_drueckjagd, E' \t\r\n') <> ''));

-- ---------------------------------------------------------------------------
-- 5. Der Trigger, der den Standard eintraegt (Bauplan E8)
-- ---------------------------------------------------------------------------
create or replace function public.hunts_regeln_vorgabe()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_titel   text;
  v_treffer integer;
  v_regeln  jsonb;
  v_text    text;
begin
  -- 1. Nur Gruppenjagden, nur ohne mitgeschickte Regeln, nur die zwei Arten.
  if new.kind is distinct from 'group'
     or new.jagdregeln is not null
     or new.type is null
     or new.type not in ('ansitz', 'drueckjagd') then
    return new;
  end if;

  -- 2. Der Standard des Erstellers. Keine Zeile oder null -> nichts.
  select case new.type
           when 'ansitz'     then us.regel_standard_ansitz
           when 'drueckjagd' then us.regel_standard_drueckjagd
         end
    into v_titel
    from public.user_settings us
   where us.user_id = new.creator_id;
  if v_titel is null then
    return new;
  end if;

  -- 3. Genau EIN Treffer (kein `strict`). Nicht-Objekte zaehlen nicht.
  select count(*), (array_agg(e.value -> 'regeln'))[1]
    into v_treffer, v_regeln
    from public.user_settings us
   cross join lateral jsonb_array_elements(us.regel_vorlagen) e
   where us.user_id = new.creator_id
     and jsonb_typeof(e.value) = 'object'
     and jsonb_typeof(e.value -> 'titel') = 'string'
     and lower(btrim(e.value ->> 'titel', E' \t\r\n'))
         = lower(btrim(v_titel, E' \t\r\n'));
  if v_treffer <> 1 or jsonb_typeof(v_regeln) is distinct from 'string' then
    return new;
  end if;

  -- 4. Nur ein Text, den der CHECK `hunts_jagdregeln_form` nimmt.
  v_text := v_regeln #>> '{}';
  if btrim(v_text, E' \t\r\n') = '' or char_length(v_text) > 4000 then
    return new;
  end if;

  new.jagdregeln := v_text;
  return new;
end;
$$;

revoke all on function public.hunts_regeln_vorgabe()
  from public, anon, authenticated, service_role;

create trigger trg_hunts_regeln_vorgabe
  before insert on public.hunts
  for each row execute function public.hunts_regeln_vorgabe();

-- ---------------------------------------------------------------------------
-- 6. Kommentare
-- ---------------------------------------------------------------------------
comment on column public.user_settings.weg_frist is
  'CN-239 (133), CN-373 (142): wie lange ANDERE den eigenen Weg sehen; nie (Standard) | jagd | 30_tage | 6_monate | folgejagdjahr. Keine Zeile = nie. Wird von weg_sichtbare_teilnahmen() ausgewertet (darf nur kuerzen, 133 Falle 1).';
comment on column public.user_settings.regel_standard_ansitz is
  'CN-376 (142): Titel der Vorlage aus regel_vorlagen, die neue Gemeinschaftsansitze als Jagdregeln bekommen; null = keiner. Aufloesung: trg_hunts_regeln_vorgabe.';
comment on column public.user_settings.regel_standard_drueckjagd is
  'CN-376 (142): Titel der Vorlage aus regel_vorlagen, die neue Drueckjagden als Jagdregeln bekommen; null = keiner. Aufloesung: trg_hunts_regeln_vorgabe.';
comment on function public.hunts_regeln_vorgabe() is
  'CN-376 (142): BEFORE INSERT auf hunts — traegt den Standard des Erstellers in jagdregeln ein, nur bei Gruppenjagd ohne Regeln und genau einem gueltigen Treffer; verhindert nie das Anlegen.';

commit;

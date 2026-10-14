-- 140: Regeln je Wildart an der Freigabe (CN-348) und Regel-Vorlagen je
-- Konto (CN-349).
--
-- ANLASS: Moritz, 13.10.2026: "Dann gibt es ggf noch Regeln grundlegend oder
-- je wildart , z.B. bei Rotwild: Aus Rudeln nur Kaelber. ; Kalb vor
-- Schmaltier, vor Alttier ; pro Schuetze nur 1 Stueck Rotwild" — und: "Bei
-- Regeln koennten wir noch ueberlegen ob wir vorgefertigte Texte speichern
-- koennten und auch aufrufen ?". Am 14.10.2026: beides in einer Migration.
-- Bauplan: quickhunt-native/docs/konzepte/QuickHunt_Bauplan_Regeln_je_Wildart_Vorlagen_V1.md (F14 geprueft)
-- Begruendung und Pruefkette: quickhunt-native/docs/migrationen/140_regeln_je_wildart_vorlagen.md
--
--
-- DIE REGEL IN FUENF SAETZEN
--
-- 1. `hunts.freigabe_regeln` ist eine Liste {wildart_id, name, regeln}: je
--    Wildart der Freigabe (die Oberart, sonst die Art selbst — der "Block"
--    der Ansicht, CN-347) hoechstens ein Eintrag, `regeln` ist Text im Format
--    der Jagdregeln ("• A\n• B"), `name` setzt der Server.
-- 2. Eine Regel ohne Block der Freigabe wird ABGELEHNT (22023), egal wer
--    schreibt. Der native Build 47 kennt die Regeln nicht: nimmt er eine
--    Wildart heraus, die Regeln traegt, scheitert sein Speichern mit dieser
--    Meldung, statt die Regeln ungesehen zu loeschen (Bauplan E2, Codex 3).
-- 3. `hunts.freigabe_version` zaehlt jede Aenderung an `freigabe` oder
--    `freigabe_regeln` hoch. Der Trigger setzt sie, nie der Client. Der
--    Compare-and-Swap des neuen Clients vergleicht NUR sie (Bauplan E3): der
--    Wert-Vergleich in der URL scheitert ab ~25 kB Anfrage an der
--    Cloudflare-Kante (gemessen 14.10.2026, Kopfzeilen zaehlen mit).
-- 4. Nach Jagdende sind auch die Regeln fest (wie 138, E11).
-- 5. `user_settings.regel_vorlagen` ist eine Liste {titel, regeln} je Konto.
--
--
-- WARUM SPALTEN UND KEINE TABELLEN (Bauplan E1, E7)
--
-- An `hunts`: dieselbe Begruendung wie 138 (Policies, Realtime ohne
-- Spaltenliste, Offline-Kopf, kein neuer Fremdschluessel).
-- An `user_settings`: nur der Besitzer liest und schreibt
-- (`user_settings_owner_all`), `konto_loeschen` loescht die Zeile schon
-- (133 §3/18). Eine eigene Tabelle braeuchte einen Fremdschluessel auf
-- `auth.users` — und die Kontoloeschung ist ein SOFT-Delete
-- (`auth.admin.deleteUser(uid, true)`, 132), ein `on delete cascade` feuerte
-- nie. 132 Falle 10 verlangte dann eine Neufassung von `konto_loeschen`.
-- KEINE Policy darf `regel_vorlagen` oder `freigabe_regeln` auswerten.
--
-- WARUM KEIN TRIGGER AUF `user_settings`: die Vorlagen liest nur ihr
-- Besitzer; was er per Direktaufruf hineinschreibt, schadet nur ihm. Der
-- Client liest unlesbare Eintraege als "unbekannt", nie als "keine". Der
-- CHECK ist nur der Riegel gegen ein unbegrenztes Feld (wie die 200 in 139):
-- 50 Vorlagen x 4000 Zeichen x 3 Byte ("•") plus Namen, mit Luft.
--
--
-- TRIGGER: dieselbe Funktion wie 138, erweitert; nicht SECURITY DEFINER,
-- `pg_temp` am Ende (076), REVOKE namentlich (081/082). Die Spaltenliste
-- waechst um `freigabe_regeln` und `freigabe_version` — die zweite, damit ein
-- mitgeschickter Wert IMMER ueberschrieben wird. Feuert weiter bei jedem
-- Beenden einer Jagd (`of ended_at`) und nicht bei `last_activity_at`.
-- Der Weg fuer eine Datenkorrektur steht im Kopf von 138 und gilt
-- unveraendert (gleicher Triggername). ⚠ Waehrenddessen zaehlt die Version
-- NICHT: wer bei abgeschaltetem Trigger `freigabe` oder `freigabe_regeln`
-- aendert, setzt in derselben Transaktion `freigabe_version =
-- freigabe_version + 1` — sonst ueberschriebe ein offener Editor die
-- Korrektur beim Speichern (Schlusslesung Bauplan, B9). Und `freigabe_regeln`
-- muss zur korrigierten `freigabe` passen (jede Regel an einem Block), denn
-- bei abgeschaltetem Trigger prueft das niemand (Schlusslesung Code, F6).
--
-- ABHAENGIGKEIT (Schlusslesung Code, S9): der Trigger ist INVOKER, seine
-- `wildarten`-Abfragen laufen unter der RLS des Schreibers
-- (`wildarten_select`: globale Arten fuer jeden `authenticated`). Wer diese
-- Policy einschraenkt (etwa nicht bejagdbare Arten verbergen), laesst den
-- Trigger bestehende Freigaben und Regeln als "Unbekannte Wildart" ablehnen.
--
-- REIHENFOLGE IM RUMPF (Schlusslesung Bauplan, B1): 1. Leeres → null.
-- 2. UPDATE: Jagdende-Sperren, Version := old, Ruecksprung nur, wenn
-- `freigabe` UND `freigabe_regeln` unveraendert sind; INSERT: Version := 0.
-- 3. Freigabe pruefen (nur wenn neu/geaendert). 4. Regeln pruefen — bei
-- JEDEM Durchlauf, auch beim INSERT (Klon) und wenn nur `freigabe` geaendert
-- wurde. 5. Version + 1, wenn sich der normalisierte Wert unterscheidet.
--
-- GRENZE DER REGELN: zusammen hoechstens 4000 Zeichen, so viel wie die
-- Jagdregeln (Schlusslesung Bauplan, S9/B8). Die PWA holt `hunts` an drei
-- Stellen mit `select('*')`, und der Jagdkopf liegt im Offline-Speicher —
-- 40 x 4000 Zeichen je Jagd haette beide ohne Nutzen aufgeblaeht.
--
-- VERSION: im UPDATE zuerst `old`, ganz am Ende `old + 1`, wenn sich der
-- NORMALISIERTE Wert von `freigabe` oder `freigabe_regeln` unterscheidet —
-- ein mitgeschickter veralteter `name` allein zaehlt also nicht (Codex 1).
-- INSERT setzt 0, auch beim Klonen einer Jagd.
--
--
-- ⚠ DIESE DATEI TRAEGT BEWUSST KEIN `\set ON_ERROR_STOP on` (120-Muster).
-- Ueber psql (Kartei psql, 132):
--   psql -v ON_ERROR_STOP=1 -c "set lock_timeout = '10s'" \
--        -c "set statement_timeout = '120s'" -f 140_regeln_je_wildart_vorlagen.sql
-- Registrierung dann von Hand nachtragen.
-- ⚠ GEZIELT APPLIZIEREN, nie ueber "alle ausstehenden" (115, T9).
-- ⛔ VOR dem nativen Build 48 applizieren: `fetchHuntSummary` fragt beide
-- neuen `hunts`-Spalten ab — ohne sie scheitert der ganze Jagdkopf. Build 47
-- fragt sie nicht ab und bleibt unveraendert.

begin;

alter table public.hunts
  add column freigabe_regeln  jsonb,
  add column freigabe_version integer not null default 0;

alter table public.hunts
  add constraint hunts_freigabe_regeln_form check (
    freigabe_regeln is null
    or (jsonb_typeof(freigabe_regeln) = 'array' and jsonb_array_length(freigabe_regeln) between 1 and 40));

alter table public.user_settings
  add column regel_vorlagen jsonb not null default '[]'::jsonb;

alter table public.user_settings
  add constraint user_settings_regel_vorlagen_form check (
    jsonb_typeof(regel_vorlagen) = 'array'
    and jsonb_array_length(regel_vorlagen) <= 50
    and octet_length(regel_vorlagen::text) <= 700000);

create or replace function public.hunts_freigabe_pruefen() returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
declare
  z jsonb;
  art record;
  g text;
  gmin numeric;
  gmax numeric;
  r text;
  neu jsonb := '[]'::jsonb;
  neu_regeln jsonb := '[]'::jsonb;
  bloecke uuid[];
  gesehen uuid[] := '{}';
  zeichen integer := 0;
begin
  -- Leeres wird null, in der DB und nicht nur im Client (138, E3).
  if new.jagdregeln is not null and btrim(new.jagdregeln, E' \t\r\n') = '' then
    new.jagdregeln := null;
  end if;
  if new.freigabe = '[]'::jsonb then
    new.freigabe := null;
  end if;
  if new.freigabe_regeln = '[]'::jsonb then
    new.freigabe_regeln := null;
  end if;

  if tg_op = 'UPDATE' then
    -- Nach Jagdende fest (138, E11) — jetzt auch die Regeln je Wildart.
    if old.ended_at is not null
       and (new.freigabe is distinct from old.freigabe
            or new.jagdregeln is distinct from old.jagdregeln
            or new.freigabe_regeln is distinct from old.freigabe_regeln) then
      raise exception 'Freigabe und Jagdregeln einer beendeten Jagd sind fest'
        using errcode = '42501',
              hint = 'Datenkorrektur: Trigger trg_hunts_freigabe_pruefen kurz abschalten, s. Kopf von 138.';
    end if;
    -- Das Ende selbst laesst sich nicht zuruecknehmen (138, Codex 138 Punkt 2).
    if old.ended_at is not null and new.ended_at is null then
      raise exception 'Eine beendete Jagd laesst sich nicht wieder oeffnen'
        using errcode = '42501',
              hint = 'Datenkorrektur: Trigger trg_hunts_freigabe_pruefen kurz abschalten, s. Kopf von 138.';
    end if;
    -- Die Version gehoert dem Server — ein mitgeschickter Wert gilt nie.
    new.freigabe_version := old.freigabe_version;
    if new.freigabe is not distinct from old.freigabe
       and new.freigabe_regeln is not distinct from old.freigabe_regeln then
      return new;
    end if;
  else
    new.freigabe_version := 0;
  end if;

  -- ── Freigabe (wie 138) — nur, wenn sie neu ist oder sich geaendert hat ──
  if new.freigabe is not null
     and (tg_op = 'INSERT' or new.freigabe is distinct from old.freigabe) then
    -- Die Laenge VOR der Schleife (Codex 138, Punkt 4).
    if jsonb_array_length(new.freigabe) > 40 then
      raise exception 'Hoechstens 40 Zeilen in der Freigabe' using errcode = '22023';
    end if;

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
  end if;

  -- ── Regeln je Wildart (CN-348) — bei JEDER Aenderung an einer der beiden
  -- Spalten, damit auch ein Schreiber, der nur `freigabe` kennt (Build 47),
  -- keine Regel ohne Block hinterlaesst ──
  if new.freigabe_regeln is not null then
    if jsonb_array_length(new.freigabe_regeln) > 40 then
      raise exception 'Hoechstens 40 Wildarten mit Regeln' using errcode = '22023';
    end if;

    -- Die Bloecke der Freigabe: je Zeile die Oberart, sonst die Art selbst
    -- (wie `wildartVon` im Client). Der Katalog hat genau zwei Ebenen
    -- (gemessen 14.10.2026).
    select coalesce(array_agg(distinct coalesce(w.eltern_id, w.id)), '{}')
      into bloecke
      from jsonb_array_elements(coalesce(new.freigabe, '[]'::jsonb)) e
      join wildarten w on w.id = (e.value->>'wildart_id')::uuid;

    for z in select value from jsonb_array_elements(new.freigabe_regeln) loop
      select w.id, w.name into art
        from wildarten w
       where w.id = (z->>'wildart_id')::uuid
         and w.besitzer_id is null
         and w.eltern_id is null;
      if not found then
        raise exception 'Unbekannte Wildart in den Regeln' using errcode = '22023';
      end if;
      if not (art.id = any(bloecke)) then
        raise exception 'Fuer % stehen Regeln je Wildart. Bitte die App aktualisieren.', art.name
          using errcode = '22023',
                hint = 'Regeln einer Wildart zusammen mit ihr entfernen (CN-348, Bauplan E2).';
      end if;
      if art.id = any(gesehen) then
        raise exception 'Wildart doppelt in den Regeln' using errcode = '22023';
      end if;
      gesehen := gesehen || art.id;

      -- Nur ein String — `->>` machte aus `false`, `0`, `[]` sonst still Text
      -- (Codex 140, Paket A Punkt 3).
      if jsonb_typeof(z->'regeln') is distinct from 'string' then
        raise exception 'Regeln fuer % sind kein Text', art.name using errcode = '22023';
      end if;
      r := z->>'regeln';
      if btrim(r, E' \t\r\n') = '' then
        raise exception 'Leere Regeln fuer %', art.name using errcode = '22023';
      end if;
      zeichen := zeichen + char_length(r);
      if zeichen > 4000 then
        raise exception 'Regeln je Wildart zusammen hoechstens 4000 Zeichen' using errcode = '22023';
      end if;

      neu_regeln := neu_regeln || jsonb_build_array(jsonb_build_object(
        'wildart_id', art.id, 'name', art.name, 'regeln', r));
    end loop;

    new.freigabe_regeln := neu_regeln;
  end if;

  if tg_op = 'UPDATE'
     and (new.freigabe is distinct from old.freigabe
          or new.freigabe_regeln is distinct from old.freigabe_regeln) then
    new.freigabe_version := old.freigabe_version + 1;
  end if;
  return new;
end;
$$;

revoke all on function public.hunts_freigabe_pruefen()
  from public, anon, authenticated, service_role;

drop trigger trg_hunts_freigabe_pruefen on public.hunts;
create trigger trg_hunts_freigabe_pruefen
  before insert or update of freigabe, jagdregeln, ended_at, freigabe_regeln, freigabe_version
  on public.hunts
  for each row execute function public.hunts_freigabe_pruefen();

comment on column public.hunts.freigabe_regeln is
  'CN-348 (140): Regeln je Wildart der Freigabe, Liste {wildart_id, name, regeln}; wildart_id = Block der Freigabe (Oberart oder Art ohne Klassen); name setzt der Server; null = keine; nach Jagdende fest.';
comment on column public.hunts.freigabe_version is
  'CN-348 (140): zaehlt jede Aenderung an freigabe oder freigabe_regeln; setzt nur der Trigger; Compare-and-Swap des Clients.';
comment on column public.user_settings.regel_vorlagen is
  'CN-349 (140): Regel-Vorlagen des Kontos, Liste {titel, regeln}; regeln im Format der Jagdregeln; nur der Besitzer liest.';

commit;

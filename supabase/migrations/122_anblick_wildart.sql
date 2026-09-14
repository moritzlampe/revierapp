-- 122 — Die Wildart eines Anblicks als Katalog-Referenz
--
-- ANLASS (14.09.2026). Johann, über Moritz: die drei Gäste hatten auf der
-- Jagd in Polen zum ersten Mal Elche gesehen und konnten das nicht
-- festhalten. `wild_events` kennt die Wildart bisher NUR als Freitext
-- `species`, in dem die Clients Werte des alten `wild_art`-Enums ablegen.
-- Von den 87 Katalogarten tragen aber nur 36 einen `enum_wert` — und
-- ALLE ZWÖLF nicht bejagdbaren Arten tragen keinen (Elchwild, Wolf, Luchs,
-- Biber, Fischotter, Auerhahn, Birkhahn, Goldschakal, Mäusebussard,
-- Rotmilan, Wachtel, Wildkatze). Das ist genau die Liste der Tiere, die man
-- sieht und nicht schießt — für ein „nur gesehen" also nicht die Randgruppe,
-- sondern der Kern.
--
-- WAS DIESE MIGRATION NICHT IST. Sie ist NICHT nötig, damit der Elch seinen
-- Namen behält — das war die tragende Annahme des Bauplans, und beide Prüfer
-- haben sie unabhängig widerlegt (Bauplan §7.2 W1): `species` ist `text`
-- ohne Trigger und ohne CHECK, ein Client kann dort „Elchwild" schreiben.
-- Sie ist der Schritt von „der Name ist Text" zu „die Art ist hinterlegt" —
-- dieselbe Entscheidung, die `kills` mit 096 bekommen hat, nachdem Moritz am
-- 04.08.2026 feststellte: „habe eine Bisamratte gewählt, wäre schön wenn da
-- auch Bisamratte steht."
--
-- DER RIEGEL IST DER EIGENTLICHE INHALT, NICHT DIE SPALTE.
-- Ein nackter Fremdschlüssel prüft als Tabellenbesitzer, AN RLS VORBEI. Jede
-- existierende UUID einer fremden PRIVATEN Wildart würde angenommen, und weil
-- der FK `on delete restrict` trägt, könnte ein Fremder damit deren Löschung
-- dauerhaft blockieren — ein Existenz-Orakel mit Nebenwirkung, genau das, was
-- 097 mit seinem Invoker-Trigger verhindert. Beide Prüfer haben das unabhängig
-- gefunden (Codex R6, Schlusslesung F2 [hoch]); der erste Entwurf hatte nur
-- die Spalte und berief sich fälschlich auf „das Muster von 096".
-- 096 IST NICHT EINE SPALTE, sondern Spalte PLUS `set_kill_katalog()` als
-- INVOKER mit `if not found` → „nicht sichtbar".
--
-- Heute ist der Angriff nicht ausführbar: `wildarten` hat 0 private Zeilen
-- (gemessen 14.09.2026, 87 von 87 global). Die Tabelle trägt aber
-- `besitzer_id` und eine INSERT-Policy — der Riegel gehört an die Stelle,
-- an der die Spalte entsteht, nicht an die Stelle, an der er weh tut.
--
-- WARUM DER TRIGGER AUCH `species` SETZT. Der Client soll nicht zwei Felder
-- konsistent halten müssen, die dasselbe meinen. Ist `wildart_id` gesetzt,
-- gewinnt der Katalog: `enum_wert` wenn es einen gibt, sonst der Klarname.
-- Damit tragen die 51 Arten ohne Enum-Gegenstück ihren Namen in genau dem
-- Feld, nach dem BEIDE Clients aggregieren (Schlusslesung F3) — ohne diesen
-- Satz fielen Elch und Wolf am selben Tag zu „2× Sonstiges" zusammen.
--
-- WAS SIE NICHT ANFASST. `sync_wild_event_for_kill()` bleibt unverändert:
-- der Kill-Spiegel schreibt weiter nur `species` und lässt `wildart_id` leer.
-- Die Erlegungsanzeige löst ihren Namen längst über `kills.wildart_id` auf;
-- `wild_events` ist für Erlegungen nur der Zähl-Spiegel. Der Preis ist
-- benannt: `wild_events.wildart_id` ist für Anblicke gefüllt und für
-- Erlegungen leer — wer über beide Arten hinweg auswertet, muss das wissen.
--
-- KEIN INDEX AUF `wildart_id` (Ponytail-Lesung 14.09.2026). `wild_events`
-- hat neun Zeilen, und keine Abfrage filtert nach dieser Spalte. Der einzige
-- Leser waere die FK-Pruefung beim Loeschen einer Wildart — 87 globale
-- Zeilen, seit August unveraendert. Nachruestbar, sobald die Tabelle waechst.
--
-- ⚠ ERSTER BEFORE-TRIGGER AUF DIESER TABELLE. Heute gibt es keinen. Kommt je
-- ein zweiter, feuern sie ALPHABETISCH (die 096-Falle) — ein Trigger, der
-- nach `trg_wild_events_katalog` sortiert und `species` überschreibt, machte
-- diesen hier zu einem Riegel, der etwas prüft, das nicht gespeichert wird.


-- ⚠ DIESE DATEI KLAMMERT NICHT SELBST (`begin;`/`commit;` fehlen bewusst) —
-- wie 120 und 121. Die Transaktion bringt der Aufrufer: `apply_migration`
-- klammert von sich aus, `psql` braucht dafuer `-1` bzw. `--single-transaction`.
-- Wer sie ohne Klammer ueber `psql -f` faehrt, bekommt KEINE Atomaritaet.

alter table public.wild_events
  add column if not exists wildart_id uuid references public.wildarten(id) on delete restrict;

comment on column public.wild_events.wildart_id is
  'Katalog-Referenz der Wildart (122). NULL bei Kill-Spiegelzeilen und bei '
  'Altbestand; dann trägt `species` den Freitext. Wird per '
  '`trg_wild_events_katalog` gegen die Sichtbarkeit geprüft.';

create or replace function public.set_wild_event_katalog()
returns trigger
language plpgsql
-- KEIN security definer: der Lookup MUSS mit den Rechten des Aufrufers
-- laufen, sonst sieht er fremde private Arten und der Riegel ist keiner.
set search_path = public, pg_temp
as $$
declare
  v_enum wild_art;
  v_name text;
begin
  if new.wildart_id is null then
    return new;
  end if;

  select w.enum_wert, w.name
    into v_enum, v_name
    from public.wildarten w
   where w.id = new.wildart_id;

  -- `not found` heißt hier zweierlei und soll es auch: es gibt die Art
  -- nicht, ODER `wildarten_select` lässt sie für diesen Aufrufer nicht
  -- durch. Beide Male ist die Antwort dieselbe — sonst wäre die
  -- Unterscheidung das Orakel.
  if not found then
    raise exception 'Diese Wildart gibt es nicht oder sie ist fuer dich nicht sichtbar'
      using errcode = 'insufficient_privilege';
  end if;

  new.species := coalesce(v_enum::text, v_name);

  return new;
end;
$$;

drop trigger if exists trg_wild_events_katalog on public.wild_events;
create trigger trg_wild_events_katalog
  -- KEIN `update of wildart_id`: das liesse ein UPDATE, das nur `species`
  -- anfasst, am Trigger vorbei — der Name koennte sich dann von der Referenz
  -- loesen, auf die er sich beruft. Der Rumpf kehrt bei `wildart_id is null`
  -- sofort um, der Mehraufwand ist also eine Abfrage auf NULL.
  before insert or update on public.wild_events
  for each row execute function public.set_wild_event_katalog();

-- REVOKE nach dem 082-Muster: `from public` allein entzieht bei Supabase
-- GAR NICHTS — die drei Rollen bekommen EXECUTE per ALTER DEFAULT PRIVILEGES
-- ausdrücklich zugeteilt und müssen namentlich genannt werden. Ohne das
-- könnte ein Angemeldeter die Funktion an eine EIGENE temporäre Tabelle als
-- Trigger hängen und `new` frei bestimmen (062/082).
revoke execute on function public.set_wild_event_katalog()
  from public, anon, authenticated, service_role;


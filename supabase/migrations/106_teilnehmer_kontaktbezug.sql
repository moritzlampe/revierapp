-- 106_teilnehmer_kontaktbezug.sql
-- Nativer Track. Das mittlere Glied der Kette Teilnehmerzeile -> Kontakt -> Konto.
--
-- ANLASS (Moritz, 05.08.2026), und es ist eine Produktentscheidung, keine
-- Aufraeumarbeit:
--   "es wird der Standard sein das man jagden plant und leuten dann einladungen
--    schickt und diese dann erst ein konto anlegen. sobald sie es anlegen muss
--    es natuerlich eine zuordnung zwischen dem konto und dem 'namen' der da
--    steht geben"
--
-- Damit HAENGT etwas an der Teilnehmerzeile, statt nur an ihr abgelesen zu
-- werden — genau die Bedingung, die Backlog A-G5 als Faelligkeit dieser Spalte
-- nennt ("Faellig, sobald etwas an der Zeile HAENGT statt nur an ihr abzulesen").
--
-- WARUM JETZT UND NICHT SPAETER — das ist die halbe Begruendung:
-- Es gibt heute **0 Zeilen mit `guest_name`** (gemessen 05.08.2026, 40
-- Teilnehmerzeilen gesamt). Die Spalte kostet in diesem Moment keinen einzigen
-- Nachtrag. Kommt sie nach dem ersten geplanten Jagdtag, sind es Hunderte
-- Zeilen, die sich nur ueber den NAMEN zuordnen lassen — und der traegt das
-- hier nachweislich nicht: 47 der 154 Kontakte teilen sich ein abgeleitetes
-- Kuerzel (086), und `namensschluessel()` in der Zentrale normalisiert nur
-- Gross-/Kleinschreibung und Leerraum, keine Satzzeichen ("Hans-Peter" gegen
-- "Hans Peter"). Ein Backfill waere Raten mit Personenbezug.
--
-- WER DIE SPALTE FUELLT — UND WER NICHT. Der Fremdpruefung vom 05.08.2026
-- (Punkt 11) ist aufgefallen, dass in DIESEM Repo kein Schreibpfad sie setzt,
-- und der Kopf hier las sich, als sei das Problem damit erledigt. Es ist
-- genauer:
--   * **quickhunt-native schreibt sie**, im selben Release wie diese Migration
--     (`src/lib/data/participants.ts`, `inviteToHunt`). Client und Migration
--     gehen zusammen aufs Geraet — die Spalte geht also nicht leer in Betrieb.
--   * **Die Zentrale schreibt sie NICHT**
--     (`app/zentrale/jagden/[id]/detail.tsx`, Gast-INSERT). Jede dort
--     eingetragene Gastzeile bleibt namensgebunden und traegt genau die
--     Schwaeche, gegen die diese Spalte gebaut ist.
-- Das ist eine bewusste Grenze, keine Auslassung: der Portal-Track gehoert
-- einer anderen Instanz (R1/R2 im AGENTS.md), und ein Griff in seine Dateien
-- waere ein Regelbruch fuer eine Zeile. Notiert als Backlog-Punkt, damit es
-- nicht als erledigt gilt.
-- Wer den Bestand spaeter zuordnen will, muss deshalb wissen: `kontakt_id`
-- gesetzt heisst "nativ eingeladen", NULL heisst "unbekannter Weg" — nicht
-- "kein Kontakt".
--
-- DER RIEGEL IST EIN NICHT-TUN, dieselbe Bauform wie bei 101:
-- **KEINE Policy darf `kontakt_id` auswerten.** Ein `uuid` ohne
-- Eigentumspruefung, das der Jagdleiter selbst schreibt, ist zeichengleich die
-- Bauform, an der `hunts.wildart_ids` in 096 gescheitert ist: dort leitete ein
-- Policy-Zweig Leserecht daraus ab, und wer eine fremde id kannte, trug sie bei
-- sich ein und las die Zeile. Heute leitet sich hier nichts ab. Der Trigger
-- unten sorgt dafuer, dass es auch dann nichts wird, wenn Glied 2 kommt.
-- Gegenprobe nach dem Applizieren (muss 0 Zeilen liefern):
--   select policyname from pg_policies
--    where qual like '%kontakt_id%' or with_check like '%kontakt_id%';
--
-- BEWUSST NICHT DABEI:
-- * Kein Setzer fuer `kontakte.profil_id` (Glied 2). Er braucht die
--   Entscheidung, nach welchem BEWEIS zugeordnet wird — der Praezedenzfall ist
--   `meine_einladungen()` (080): bestaetigte Auth-Adresse, kein Parameter (eine
--   uebergebene Adresse waere ein Orakel zum Durchprobieren), plus Riegel gegen
--   zwei bestaetigte Konten mit derselben kleingeschriebenen Adresse. Der Platz
--   dafuer ist seit 085 frei gehalten: deren Trigger `kontakt_feste_spalten()`
--   ist ausdruecklich als Invoker gebaut, "ein spaeterer
--   SECURITY-DEFINER-Setzer fuer `profil_id` kommt durch, ohne dass der Riegel
--   je gelockert werden muss".
-- * Kein Mailversand (Glied 3). quickhunt.de hat am 05.08.2026 weder MX noch
--   SPF noch DMARC und kann nicht senden; in beiden Repos existiert keine Zeile
--   Mail-Code.
-- * Kein Unique-Index ueber `lower(guest_name)` (A-G6 in seiner urspruenglichen
--   Fassung). Der Index unten deckt die Gaeste ab, die DIESES Repo kuenftig
--   schreibt; Gastzeilen ohne `kontakt_id` — die der Zentrale und die 0
--   Altzeilen — bleiben ungeschuetzt. Ein zweiter Index ueber den Namen waere
--   ein Riegel an einer Achse, die gerade abgeloest wird.
-- * Kein Index auf `kontakt_id`. Es gibt keine Abfrage, die danach filtert —
--   die Teilnehmerliste laedt ueber `hunt_id`. Faellig mit Glied 2, das die
--   Gegenrichtung braucht (welche Zeilen zeigen auf diesen Kontakt).
-- * Kein CHECK, der `user_id` und `kontakt_id` gegeneinander haelt. Der
--   Widerspruch (Zeile traegt Konto A, der Kontakt traegt `profil_id` B) wird
--   erst mit Glied 2 erreichbar, und dann gehoert er dorthin, wo die Zuordnung
--   entsteht — nicht auf jede Teilnehmerzeile.
--
-- ---------------------------------------------------------------------------

alter table public.hunt_participants
  add column if not exists kontakt_id uuid
    references public.kontakte(id) on delete set null;

-- `on delete set null`, nicht `cascade`: wer einen Adressbucheintrag loescht,
-- streicht damit keinen Menschen von einer Jagd. Die Zeile behaelt ihren
-- `guest_name` und bleibt eine gueltige Teilnehmerzeile — der CHECK
-- `hunt_participants_check` (user_id oder guest_name) haelt weiter.
comment on column public.hunt_participants.kontakt_id is
  'Welcher Adressbucheintrag hinter dieser Zeile steht. Nur eine Zuordnung, nie eine Berechtigung: keine Policy darf die Spalte auswerten (s. 101 und der Fehlschlag von hunts.wildart_ids in 096). Anker fuer die spaetere Verknuepfung mit einem Konto ueber kontakte.profil_id.';

-- ---------------------------------------------------------------------------

-- **Derselbe Gast nur einmal je Jagd.** `UNIQUE (hunt_id, user_id)` greift bei
-- einem Gast NICHT: `user_id` ist NULL, und NULL ist in Postgres zu nichts
-- gleich, auch nicht zu sich selbst. Zwei Jagdleiter, die denselben Kontakt
-- gleichzeitig antippen, lesen beide "noch nicht dabei" und fuegen beide ein;
-- danach steht ein Mensch zweimal auf der Liste, zaehlt doppelt und kann zwei
-- Staende bekommen (Backlog A-G6).
--
-- **Das stand hier zuerst als "bleibt offen", und die Fremdpruefung vom
-- 05.08.2026 hat die Begruendung zerlegt** (Befund 1, [high]): A-G6 war
-- deshalb teuer, weil ein Riegel ueber `lower(guest_name)` an einem Namen
-- haengt — an genau der Achse, die diese Migration ersetzt. Mit `kontakt_id`
-- ist derselbe Riegel eine Zeile und haengt an einer Kennung. Wer die Spalte
-- ohnehin einfuehrt, hat den Index geschenkt.
--
-- Partiell, weil `kontakt_id` bei Konten und bei jeder Zeile der Zentrale NULL
-- ist und mehrere NULLs sich nie ins Gehege kommen sollen.
-- **Folge fuer den Client, benannt:** der INSERT kann jetzt `23505` werfen, wo
-- er vorher stumm eine zweite Zeile anlegte. Der Fehler ist die Verbesserung,
-- nicht ein Rueckschritt.
-- Genauer, weil es seit dem 05.08.2026 ZWEI native Aufrufer gibt
-- (Schlusslesung, Hinweis 3): der Nachtrag im "Jaeger"-Reiter behandelt
-- `23505` ausdruecklich ("Jemand hat gerade dieselbe Person eingeladen"); der
-- Weg ueber `createHunt` tut es nicht — dort ist der Konflikt aber
-- unerreichbar, weil an einer frisch angelegten Jagd noch keine Zeile steht,
-- an der der Index greifen koennte.
create unique index if not exists hunt_participants_gast_je_jagd
  on public.hunt_participants (hunt_id, kontakt_id)
  where kontakt_id is not null;

-- ---------------------------------------------------------------------------

create or replace function public.teilnehmer_kontakt_muss_lesbar_sein()
returns trigger
language plpgsql
-- **Invoker, NICHT SECURITY DEFINER** — das ist die Entscheidung dieser
-- Funktion, nicht eine Auslassung. Die Pruefung laeuft dadurch durch RLS
-- (`kontakte_select`: besitzer_id in get_my_kontaktbuecher()), und ein Verweis
-- auf ein fremdes Adressbuch scheitert als "gibt es nicht", ohne dessen
-- Existenz zu bestaetigen. Ein DEFINER haette daraus ein Orakel gemacht:
-- "existiert diese uuid?" ist bei Personendaten schon die halbe Auskunft.
-- Muster von 097 (`wildart_eltern_pruefen`), aus demselben Grund.
--
-- `pg_temp` am ENDE des search_path ist bei einem Invoker-Trigger kein
-- Beiwerk: ohne die Angabe wird das Temp-Schema ZUERST durchsucht, und
-- `authenticated` darf temporaere Tabellen anlegen. Ein `create temp table
-- kontakte (id uuid)` mit einer selbst gewaehlten Zeile fuehrte die Pruefung
-- sonst an einer gefaelschten Tabelle vorbei (nachgestellt zu 076).
set search_path = public, pg_temp
as $$
begin
  if new.kontakt_id is null then
    return new;
  end if;

  -- **Nur pruefen, was sich AENDERT.** Ohne diesen Zweig zerbraeche jedes
  -- spaetere UPDATE an einer Zeile, deren Kontakt einmal gueltig war und dem
  -- Schreibenden inzwischen nicht mehr sichtbar ist — etwa nachdem eine
  -- Freigabe in `kontakt_mitfuehrende` widerrufen wurde. Der Jagdleiter wollte
  -- dann die Rolle aendern und bekaeme einen Fehler ueber einen Kontakt, von
  -- dem er nichts weiss. Geprueft wird die HANDLUNG (diesen Bezug setzen),
  -- nicht der Bestand.
  if tg_op = 'UPDATE' and old.kontakt_id is not distinct from new.kontakt_id then
    return new;
  end if;

  perform 1 from public.kontakte k where k.id = new.kontakt_id;

  -- `FOUND` setzt plpgsql nach PERFORM selbst.
  if not found then
    raise exception 'Diesen Kontakt gibt es nicht oder er ist fuer dich nicht sichtbar'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

-- **Die Spalte wird NICHT festgehalten, anders als die drei Spalten aus 087.**
-- Dort hing eine Berechtigung an der Herkunft, hier haengt eine Zuordnung
-- daran. Wer beim Antippen danebengreift, soll korrigieren koennen, statt zu
-- entfernen und neu einzuladen — deshalb prueft der Trigger auf INSERT UND
-- UPDATE, statt die Spalte einzufrieren.
drop trigger if exists trg_teilnehmer_kontakt on public.hunt_participants;
create trigger trg_teilnehmer_kontakt
  before insert or update on public.hunt_participants
  for each row execute function public.teilnehmer_kontakt_muss_lesbar_sein();

-- Niemand ruft eine Triggerfunktion direkt (082). Der Entzug muss die drei
-- Rollen NAMENTLICH nennen: `from public` allein entzieht bei Supabase gar
-- nichts, weil `ALTER DEFAULT PRIVILEGES` ihnen EXECUTE explizit vergibt.
-- Postgres prueft EXECUTE beim ANLEGEN des Triggers, nicht beim Feuern (082),
-- der Trigger oben laeuft danach also weiter.
revoke all on function public.teilnehmer_kontakt_muss_lesbar_sein()
  from public, anon, authenticated, service_role;

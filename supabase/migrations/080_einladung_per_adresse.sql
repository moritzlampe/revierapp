-- 080 — Einladung per Adresse statt per Code
--
-- Bis hierher lief die Vergabe eines Begehungsscheins nur über den
-- `invite_code`: der Revierinhaber legt die Zeile an, liest die zwölf Zeichen
-- ab und schickt sie auf irgendeinem Weg an den Nehmer, der sie abtippt.
--
-- Moritz' Einwand (31.07.2026): wer die App hat, soll die Einladung DARIN
-- sehen. Kein Link, kein Abtippen. Die Spalte `holder_email` existiert seit
-- 068 und war bis heute in KEINER Zeile belegt (gemessen: 0 von 2).
--
-- ---------------------------------------------------------------------------
-- Warum das eine Funktion braucht und keine Policy
-- ---------------------------------------------------------------------------
-- `hunting_licenses_holder` gibt die Zeile frei über `holder_id = auth.uid()`.
-- Vor der Annahme ist `holder_id` aber NULL — der Eingeladene ist der einzige,
-- der die Zeile sehen müsste, und der einzige, der sie nicht sehen darf.
--
-- Eine Policy könnte das nicht leisten: sie müsste `auth.users` lesen, um an
-- die Adresse des Aufrufers zu kommen, und darauf hat `authenticated` kein
-- Recht. Also eine `security definer`-Funktion, so schmal wie möglich.
--
-- ---------------------------------------------------------------------------
-- Der sicherheitskritische Teil: KEIN Parameter
-- ---------------------------------------------------------------------------
-- Die Funktion nimmt bewusst KEINE Adresse entgegen. Täte sie das, wäre sie
-- ein Adress-Orakel: wer `meine_einladungen('irgendwer@example.com')` rufen
-- kann, probiert Adressen durch und erfährt, für wen ein Revierinhaber gerade
-- einen Schein ausgestellt hat — samt Reviername und Aussteller.
--
-- Verglichen wird ausschließlich gegen `auth.users.email` des AUFRUFERS, und
-- nur wenn `email_confirmed_at` gesetzt ist. Unbestätigt heißt: der Aufrufer
-- hat nicht belegt, dass ihm diese Adresse gehört. Er könnte sich sonst bei
-- der Registrierung eine fremde Adresse eintragen und deren Einladungen
-- abholen — das wäre dieselbe Lücke wie ein Parameter, nur langsamer.
--
-- Auch NICHT `auth.jwt() ->> 'email'`: das Token trägt den Stand seiner
-- Ausstellung. Wer seine Adresse ändert, läuft bis zum nächsten Refresh mit
-- der alten herum, und die Bestätigung steht dort ohnehin nicht drin. Die
-- Tabelle ist die Wahrheit, das Token ist eine Kopie davon.
--
-- ---------------------------------------------------------------------------
-- Warum der `invite_code` mit herauskommt
-- ---------------------------------------------------------------------------
-- Damit es KEINEN zweiten Annahmepfad gibt. `schein_einloesen()` aus 068
-- prüft Code, Status und Ablauf, setzt `holder_id` und ist gegen zwei
-- gleichzeitige Annahmen dicht (das UPDATE filtert selbst auf
-- `holder_id is null` und liest bei null betroffenen Zeilen nach). Diese
-- Sorgfalt ein zweites Mal zu schreiben hieße, sie ein zweites Mal richtig
-- machen zu müssen.
--
-- Der Code an den Eingeladenen zu geben ist kein Zugeständnis: er DARF diesen
-- Schein annehmen, und mehr kann er mit dem Code nicht anfangen.
--
-- Additiv. Keine Policy, keine Spalte, keine bestehende Funktion wird
-- angefasst.

-- ---------------------------------------------------------------------------
-- Offene Einladungen an meine bestätigte Adresse
-- ---------------------------------------------------------------------------
-- Die drei Bedingungen sind ZEICHENGLEICH mit denen, die `schein_einloesen()`
-- vor dem UPDATE prüft — `holder_id is null`, `status = 'aktiv'`,
-- `valid_until >= current_date`. Das ist Absicht: was hier gelistet wird, muss
-- sich auch annehmen lassen. Liefe die Liste weiter als die Annahme, stünde
-- eine Karte da, deren Knopf nichts tut.
--
-- `valid_from` wird bewusst NICHT geprüft, ebenfalls wie in 068: einen Schein,
-- der erst im September gilt, darf man heute annehmen. Bis dahin hält 077 das
-- Revier zu, und die App zeigt „Ab später".
--
-- `lower(trim(...))` auf BEIDEN Seiten: `holder_email` tippt ein Mensch in ein
-- Formular, mit Großbuchstaben und Leerzeichen am Rand. `auth.users.email` ist
-- `varchar`, nicht `citext` — der Vergleich schreibt also selbst klein, sonst
-- ginge eine Einladung an „Heinrich@Test.de" ins Leere.
--
-- Der Riegel auf nichtleere Adressen ist kein Zierstück: ein Nutzer ohne
-- E-Mail (Telefon-Anmeldung) hat `email is null`, und eine Zeile mit
-- `holder_email = ''` würde sonst irgendwann auf ihn passen.
--
-- ---------------------------------------------------------------------------
-- Der Eindeutigkeits-Riegel — Codex-Befund vom 31.07.2026, „mittel"
-- ---------------------------------------------------------------------------
-- `lower()` auf die ganze Adresse setzt voraus, dass es zwei bestätigte Konten,
-- die sich NUR in der Groß-/Kleinschreibung unterscheiden, nicht geben kann.
-- Nachgemessen, und die Voraussetzung hält weniger als sie scheint:
--
--   auth.users                                 9 Konten
--   davon mit Großbuchstaben in `email`        0
--   Adressen, die nur in Gross/Klein kollidieren  0
--   users_email_partial_key   UNIQUE btree (email) WHERE is_sso_user = false
--   users_instance_id_email_idx   btree (instance_id, lower(email))  <- NICHT unique
--
-- Der Unique-Index liegt auf der ROHEN Adresse. Die Datenbank ließe
-- `Heinrich@test.de` neben `heinrich@test.de` also zu; was es verhindert, ist
-- GoTrue, das beim Anlegen kleinschreibt. Das ist eine Zusicherung der
-- Anwendungsschicht, und an dieser Funktion hängt Schreibrecht auf ein fremdes
-- Revier — zu viel, um es auf eine Schicht zu stützen, die diese Migration
-- nicht kontrolliert.
--
-- Also fällt die Annahme weg statt bestätigt zu werden: gibt es ZWEI bestätigte
-- Konten mit derselben kleingeschriebenen Adresse, bekommt KEINES die
-- Einladung. Das ist die richtige Richtung — eine Einladung, die niemand sieht,
-- fällt dem Aussteller auf; eine, die der Falsche sieht, nicht.
--
-- Nicht behandelt und bewusst so: Unicode-Normalisierung (NFC/NFD) und exotische
-- Leerzeichen, die `trim()` nicht kennt. Beides führt zu einem NICHT-Treffer,
-- also in die sichere Richtung — die Einladung erscheint nicht, statt beim
-- Falschen zu erscheinen.
--
-- `auth.users` steht voll qualifiziert da und ist damit gegen das
-- pg_temp-Shadowing aus 076 immun; `pg_temp` steht trotzdem ans Ende des
-- search_path, weil `hunting_licenses`, `districts` und `profiles` unqualifiziert
-- aufgelöst werden. Siehe AGENTS.md.
create or replace function public.meine_einladungen()
returns table (
  id            uuid,
  invite_code   text,
  district_id   uuid,
  district_name text,
  issuer_name   text,
  valid_from    date,
  valid_until   date,
  auflagen      text,
  zone_ids      uuid[],
  stand_ids     uuid[]
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select hl.id,
         hl.invite_code,
         hl.district_id,
         d.name,
         p.display_name,
         hl.valid_from,
         hl.valid_until,
         hl.auflagen,
         hl.zone_ids,
         hl.stand_ids
    from hunting_licenses hl
    join auth.users u
      on u.id = auth.uid()
     and u.email_confirmed_at is not null
     and u.email is not null
     and length(trim(u.email)) > 0
     and lower(trim(hl.holder_email)) = lower(trim(u.email))
     and not exists (
           select 1
             from auth.users u2
            where u2.id <> u.id
              and u2.email_confirmed_at is not null
              and u2.email is not null
              and lower(trim(u2.email)) = lower(trim(u.email))
         )
    left join districts d on d.id = hl.district_id
    left join profiles  p on p.id = hl.issuer_id
   where hl.holder_id is null
     and hl.status = 'aktiv'::jes_status
     and hl.valid_until >= current_date
   order by hl.valid_until;
$$;

comment on function public.meine_einladungen() is
  'Offene Begehungsscheine, die auf die BESTAETIGTE Auth-Adresse des Aufrufers '
  'ausgestellt sind. Nimmt bewusst keinen Parameter — eine uebergebene Adresse '
  'waere ein Adress-Orakel. Gibt den invite_code mit heraus, damit die Annahme '
  'ueber das bestehende schein_einloesen() laeuft und es keinen zweiten '
  'Annahmepfad gibt. Migration 080.';

-- Rechte. Beide Quellen entziehen, dann gezielt geben — die Lehre aus 069 und
-- 075: EXECUTE kommt aus `ALTER DEFAULT PRIVILEGES` (direkt an anon und
-- authenticated) UND aus dem impliziten Grant an PUBLIC beim `create function`.
-- Wer nur eine der beiden zudreht, hat nichts zugedreht.
--
-- Für `anon` ist das hier nicht bloß Formsache: ohne `auth.uid()` findet der
-- Join nichts, die Funktion gäbe also ohnehin 0 Zeilen zurück — aber sie
-- bleibt trotzdem zu, damit niemand später auf die Idee kommt, sie in einer
-- Policy zu verwenden und sich den `42501` aus 078 einzufangen.
revoke execute on function public.meine_einladungen() from public;
revoke execute on function public.meine_einladungen() from anon;
revoke execute on function public.meine_einladungen() from authenticated;
grant  execute on function public.meine_einladungen() to authenticated;

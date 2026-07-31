-- 084 — Empfänger einer Schein-Einladung auflösen (für die Push-Zustellung)
--
-- (Kurz als 083 geschrieben und umbenannt: die Nummer nahm der parallele Strang
-- im selben Moment. Die Reservierungszeile in AGENTS.md ist der einzige Schutz
-- dagegen, und sie stand beim Nachsehen noch auf 083.)
--
-- ANLASS
-- Seit 080 sieht ein Angemeldeter offene Begehungsscheine, die auf seine
-- bestätigte Adresse ausgestellt sind — aber nur, wenn er von selbst nachsieht.
-- Am 31.07.2026 fiel beim ersten echten Durchlauf auf, dass keine Benachrichti-
-- gung kommt. Sie kam nie: im ganzen Projekt existiert genau eine Push-Art
-- (Treiben an/aus). Diese Migration ist das fehlende Stück auf der Serverseite.
--
-- WARUM EINE FUNKTION UND KEINE ABFRAGE IN DER ROUTE
-- Die Push-Route müsste `auth.users` nach einer Adresse durchsuchen. Dieses
-- Schema ist über PostgREST nicht erreichbar, und die Admin-API kennt kein
-- „hol mir den Nutzer zu dieser Adresse". Vor allem aber: die Auswahl, WELCHER
-- Schein überhaupt eine offene Einladung ist, steht bereits in 080. Sie ein
-- zweites Mal in TypeScript zu schreiben hieße, sie ein zweites Mal richtig
-- machen zu müssen — und beim nächsten Mal nur eine der beiden zu ändern.
-- Deshalb ist der Rumpf hier zeichengleich mit `meine_einladungen()`, nur nach
-- der Schein-ID statt nach `auth.uid()` gefragt.
--
-- Die vier Bedingungen im Einzelnen, damit niemand eine davon für Beiwerk hält:
--   holder_id is null            — angenommen ist keine Einladung mehr
--   status = 'aktiv'             — ein pausierter Schein lädt niemanden ein
--   valid_until >= current_date  — abgelaufen ebenso wenig (077)
--   NOT EXISTS zweites Konto     — siehe unten
--
-- DER RIEGEL GEGEN DIE DOPPELTE ADRESSE
-- Supabase' Unique-Index liegt auf der ROHEN `email`, nicht auf `lower(email)`
-- (nachgemessen 31.07.2026: `users_email_partial_key UNIQUE btree (email)
-- WHERE is_sso_user = false`). Dass Adressen klein geschrieben ankommen,
-- garantiert GoTrue — die Anwendungsschicht, nicht die Datenbank. Gäbe es je
-- zwei bestätigte Konten, die sich nur in der Schreibweise unterscheiden,
-- bekäme sonst irgendeins die Nachricht. Also bekommt KEINES eine: eine
-- Einladung, die niemanden erreicht, fällt dem Aussteller auf; eine, die den
-- Falschen erreicht, nicht. Gleiche Entscheidung und gleiche Begründung wie 080.
--
-- WARUM EXECUTE NUR FÜR service_role
-- Die Funktion bildet eine E-Mail-Adresse auf ein Konto ab. Dürfte
-- `authenticated` sie rufen, wäre sie ein Orakel: man legt reihenweise Scheine
-- mit geratenen Adressen an und erfährt an der Rückgabe, welche davon ein
-- bestätigtes Konto haben. Genau diese Sorte Orakel hat 080 vermieden, indem
-- die Funktion dort keinen Parameter nimmt. Hier ist der Parameter nötig, also
-- muss die Schranke woanders stehen — beim EXECUTE.
--
-- Additiv und rückwärtskompatibel: legt nur eine neue Funktion an.

create or replace function public.schein_empfaenger(p_license_id uuid)
returns uuid
language sql
stable
security definer
-- `pg_temp` am ENDE, sonst durchsucht Postgres das Temp-Schema ZUERST und eine
-- untergeschobene `create temp table hunting_licenses (…)` entschiede, wer die
-- Einladung bekommt. Projektregel seit 076.
set search_path = public, pg_temp
as $$
  select u.id
    from hunting_licenses hl
    join auth.users u
      on u.email_confirmed_at is not null
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
   where hl.id = p_license_id
     and hl.holder_id is null
     and hl.status = 'aktiv'::jes_status
     and hl.valid_until >= current_date;
$$;

comment on function public.schein_empfaenger(uuid) is
  'Die User-ID, der die offene Einladung dieses Begehungsscheins zusteht — '
  'zeichengleiche Auswahl wie meine_einladungen() (080). NULL, wenn der Schein '
  'keine offene Einladung mehr ist, die Adresse zu keinem bestaetigten Konto '
  'gehoert, oder zwei Konten sich nur in der Schreibweise unterscheiden. '
  'EXECUTE bewusst nur fuer service_role: mit Parameter waere sie sonst ein '
  'Orakel Adresse -> Konto.';

-- ALLE VIER namentlich entziehen, dann gezielt EINER geben.
--
-- `revoke … from public` allein entzieht bei Supabase GAR NICHTS: EXECUTE auf
-- neue Funktionen kommt per `ALTER DEFAULT PRIVILEGES` **explizit** an `anon`,
-- `authenticated` und `service_role`. Ein Entzug von PUBLIC räumt nur den
-- PUBLIC-Eintrag ab und lässt die drei unberührt. Am 31.07.2026 vom parallelen
-- Strang an der frisch angelegten `stand_ist_belegt()` gemessen — nach dem
-- REVOKE weiterhin `anon=true, authenticated=true`, weshalb dort ein zweiter
-- Migrationssatz nötig war.
--
-- Auch `service_role` steht deshalb im Entzug, obwohl es das Recht gleich
-- darauf zurückbekommt: erst danach ist der Endzustand aus diesen vier Zeilen
-- ablesbar und hängt nicht mehr davon ab, was die Vorgaben des Projekts gerade
-- verteilen.
revoke all on function public.schein_empfaenger(uuid) from public;
revoke all on function public.schein_empfaenger(uuid) from anon;
revoke all on function public.schein_empfaenger(uuid) from authenticated;
revoke all on function public.schein_empfaenger(uuid) from service_role;
grant execute on function public.schein_empfaenger(uuid) to service_role;

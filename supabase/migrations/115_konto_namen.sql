-- ============================================================
-- 115 — konto_namen(): ein Name zu einer Kennung, sonst nichts
-- Nativer Track, 22.08.2026
-- ============================================================
--
-- WAS DIESE MIGRATION TUT
-- Sie legt eine SECURITY-DEFINER-Funktion an, die genau zwei Spalten
-- zurueckgibt: `id` und `display_name`, fuer alle Konten. Sie aendert KEINE
-- Policy und nimmt niemandem etwas weg. Nach dem Applizieren liest jeder
-- Angemeldete weiterhin jedes Profil vollstaendig.
--
-- **Sie ist die Vorbedingung fuer 116**, die diesen Vollzugriff zurueckzieht
-- (A-P1). 116 liegt bewusst NOCH NICHT als Datei vor — s. unten.
--
--
-- WOFUER SIE EINTRITT — NEUN LESEPFADE, EINE FRAGE
-- Neun Stellen in beiden Clients lesen heute die volle Profilzeile, um EINE
-- Frage zu beantworten: wie heisst der Mensch hinter dieser Kennung?
--
--   Einladelisten (Verzeichnis aller Konten, kein Zeilenbezug)
--     quickhunt-native  src/lib/data/hunts.ts:469        id, display_name, phone
--     revierapp  app/app/hunt/[id]/page.tsx:353          id, display_name
--     revierapp  app/app/hunt/create/page.tsx:167        id, display_name, phone
--     revierapp  app/app/chat/create/page.tsx:42         id, display_name
--     revierapp  app/app/chat/[groupId]/info/page.tsx:244    ohne jeden Filter
--     revierapp  app/zentrale/jagden/[id]/page.tsx:130       ohne Filter, ohne Limit
--
--   Namen zu einer bestehenden Beziehung, die KEIN Chat und KEINE Jagd ist
--     quickhunt-native  src/lib/data/licenses.ts:82   profiles:issuer_id(display_name)
--     quickhunt-native  src/lib/data/checks.ts:16     profiles:checked_by(display_name)
--     revierapp  app/zentrale/jagderlaubnisse/[id]/druck/page.tsx:185
--
-- **Die zweite Gruppe ist ein Befund der Fremdpruefung vom 22.08.2026** (F1
-- [hoch] und F3 [mittel]) und war im ersten Entwurf uebersehen. Er hiess
-- `einladbare_konten()` und schnitt den Aufrufer selbst weg — beides falsch:
--
--   * Ein Begehungsschein IST eine Beziehung zwischen Menschen, die keine
--     gemeinsame Jagd haben muessen; das ist sein Zweck. Nach 116 saehe ein
--     Scheininhaber nativ „Ausgestellt am …" ohne den Namen dessen, der ihm
--     die Erlaubnis erteilt hat. In der PWA ist es haerter: der Druckweg
--     gibt bei fehlendem Ausstellernamen ausdruecklich **kein Blatt** aus
--     (`druck/page.tsx:191`, Riegel aus der Pruefung vom 05.08.2026) —
--     erreichbar, sobald `districts.owner_id` nicht mehr der `issuer_id` ist.
--   * Ein Standpruefer kann ein JES-Inhaber sein, der Leser der
--     Revierbesitzer. `map_object_checks_read` haengt am sichtbaren
--     Kartenobjekt, nicht an einer Personenbeziehung. Das Pruefprotokoll
--     verloere still seine Verantwortlichkeitsangabe.
--
-- **Deshalb heisst sie jetzt nach dem, was sie liefert, nicht nach dem, wozu
-- der erste Aufrufer sie brauchte.** Ein „Verzeichnis einladbarer Konten"
-- haette die zweite Gruppe nie aufgenommen — der Name haette die Loesung
-- verschlossen, bevor jemand das Problem sah.
--
--
-- WARUM DAS VERZEICHNIS BLEIBT UND NICHT DURCH BEZIEHUNGEN ERSETZT WIRD
-- Der naheliegende Weg waere, nur noch anzuzeigen, wer schon Chat- oder
-- Jagdpartner ist — `fetchChatKandidaten` (`src/lib/data/chat.ts:870`) macht
-- das bereits und ist der richtige Pfad fuer eine Liste unter Bekannten.
--
-- **Fuer eine EINLADELISTE ist er zirkulaer.** `chat/create` haette dann
-- niemanden anzubieten, mit dem man noch nicht geschrieben hat: der erste
-- Chat mit einem Menschen waere unmoeglich. Dasselbe beim Einladen zu einer
-- Jagd — man laedt gerade den ein, mit dem man noch keine geteilt hat.
--
-- Die Verengung sitzt deshalb nicht bei den ZEILEN, sondern bei den SPALTEN:
-- wer ein Konto hat, bleibt auffindbar; was ueber ihn zu erfahren ist,
-- schrumpft von zwoelf Spalten auf seinen Namen.
--
--
-- WARUM KEIN PARAMETER
-- Die zweite Gruppe braucht genau einen Namen, nicht die Liste — ein
-- `ids uuid[]` waere sparsamer. Er ist bewusst nicht gebaut: ein Parameter,
-- den die Haelfte der Aufrufer weglaesst, ist eine zweite Aufrufform ohne
-- zweite Bedeutung. Bestand sind 9 Konten; wird das teuer, ist die Antwort
-- eine Suche, und die ist ohnehin eine andere Funktion.
--
--
-- WARUM SECURITY DEFINER
-- Nach 116 sieht `authenticated` nur noch Profile von Chat- und Jagdpartnern.
-- Eine Funktion mit Aufruferrechten saehe dann dasselbe und liefe leer. Die
-- Definer-Rechte sind hier also nicht Bequemlichkeit, sondern der ganze
-- Zweck: sie sind die einzige Stelle, an der noch das Verzeichnis steht —
-- und sie gibt genau zwei Spalten heraus.
--
-- `pg_temp` steht am ENDE des search_path (Projektregel seit 076): ungenannt
-- wird das Temp-Schema ZUERST durchsucht, und `authenticated` darf temporaere
-- Tabellen anlegen.
--
--
-- WER SIE RUFEN DARF
-- Nur `authenticated`, namentlich. `REVOKE ... FROM PUBLIC` entzieht bei
-- Supabase GAR NICHTS — die drei Rollen bekommen EXECUTE per ALTER DEFAULT
-- PRIVILEGES explizit und muessen einzeln genannt werden (gemessen 31.07.2026
-- an `stand_ist_belegt()`).
--
-- `anon` bleibt aussen vor. Der Gast-/Akquise-Layer der PWA braucht kein
-- Kontoverzeichnis, und ein Verzeichnis ohne Anmeldung waere ein Orakel fuer
-- jeden, der die Projekt-URL kennt.
--
--
-- WAS SIE BEWUSST NICHT TUT
--
-- **Kein Limit.** Die Aufrufer kappen heute bei 50, 100 bzw. gar nicht;
-- PostgREST kappt eine RPC-Antwort bei 1000 Zeilen. Bestand: 9 Konten. Die
-- Grenze ist damit genannt, nicht behoben — dieselbe Entscheidung wie bei
-- `get_my_chat_list()`. Faellig wird sie mit einer Suche ueber die Konten.
--
-- **Kein `anonymize_kills`.** Es wird ebenfalls von fremden Zeilen gelesen
-- (`src/lib/data/kills.ts:146`, `app/app/hunt/[id]/page.tsx:283`) und traegt
-- die Strecken-Maskierung. Es laeuft aber ueber einen ANDEREN Pfad —
-- `profiles_select_co_hunters` — und der bleibt in 116 unangetastet. Es hier
-- mitzugeben, machte einen zweiten Weg zu derselben Auskunft auf.
-- **Der Riegel dagegen gehoert in den Client** und ist Teil desselben Zuges:
-- beide `visibility.ts` lesen `killer?.anonymize_kills ?? false`, ein
-- fehlendes Profil gilt dort also als „nicht anonym" — und `isAnonymized`
-- verbirgt nicht nur den Namen, sondern das Kill-Detail samt Fotos.
--
-- **Kein `phone`.** Zwei Aufrufer selektieren es heute, gerendert wird es
-- nie: nativ ueberhaupt nicht, in der PWA nur im Zweig `!c.inApp`, den ein
-- Profil nie erreicht (`hunt/create/page.tsx:177` legt sie mit `inApp: true`
-- an). Ein toter Lesezugriff auf eine der vier heiklen Spalten.
--
--
-- WARUM 116 NOCH NICHT ALS DATEI EXISTIERT
-- Fremdpruefung 22.08.2026, F2 [hoch]: laegen beide Dateien zugleich als
-- pending vor, applizierte ein Lauf ueber alle ausstehenden Migrationen sie
-- unmittelbar nacheinander — und der Client-Rollout dazwischen ist bloss
-- ein Kommentar. **Eine Reihenfolge, die nur in einer Bemerkung steht, ist
-- keine.** Der Text von 116 liegt geprueft in
-- `quickhunt-native/docs/migrationen/116_profiles_nur_nach_beziehung.md`;
-- die `.sql` entsteht erst, wenn beide Clients umgestellt und ausgerollt
-- sind. Die Nummer 116 ist reserviert.
--
--
-- ⚠ DIESE DATEI GEZIELT APPLIZIEREN — NIE UEBER „ALLE AUSSTEHENDEN"
-- Schlusslesung 22.08.2026, T9. Derselbe Mechanismus, der 116 aus dem Paket
-- genommen hat, gilt fuer JEDE andere pending Datei im Ordner: ein
-- Sammel-Apply nimmt sie mit. Waehrend dies geschrieben wurde, lag dort
-- bereits `117_letzte_standpruefung.sql` des parallelen PWA-Strangs —
-- ebenfalls unappliziert und mit eigener, noch nicht gelaufener Pruefkette.
--
-- Also: `apply_migration` mit genau dieser Datei, bzw. `psql -f` auf genau
-- diesen Pfad. Kein `supabase db push`, kein Lauf ueber das Verzeichnis.
-- ============================================================

create or replace function public.konto_namen()
returns table (id uuid, display_name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.display_name
    from public.profiles p
   -- Der zweite Riegel neben dem EXECUTE-Entzug unten. Er ist NICHT
   -- redundant: die Funktion schneidet den Aufrufer nicht mehr selbst weg
   -- (die Namensaufloeser brauchen unter Umstaenden die eigene Zeile), es
   -- gibt hier also keinen `<> auth.uid()`-Vergleich mehr, dessen
   -- NULL-Ergebnis das Verzeichnis nebenbei verschliesst.
   where auth.uid() is not null
   order by p.display_name;
$$;

comment on function public.konto_namen() is
  'Ein Name zu einer Kennung — NUR id und display_name, fuer alle Konten. '
  'SECURITY DEFINER, weil 116 die Profiltabelle auf Chat- und Jagdpartner '
  'einengt, waehrend ein Verzeichnis und die Namen von Schein-Ausstellern '
  'und Standpruefern per Konstruktion darueber hinausreichen. Wer hier eine '
  'Spalte hinzufuegt, macht sie fuer JEDEN Angemeldeten ueber JEDES Konto '
  'sichtbar — das ist genau das Loch, das 116 schliesst. Ungepagt; PostgREST '
  'kappt bei 1000 Zeilen (Bestand 22.08.2026: 9).';

revoke execute on function public.konto_namen()
  from public, anon, authenticated, service_role;

grant execute on function public.konto_namen() to authenticated;

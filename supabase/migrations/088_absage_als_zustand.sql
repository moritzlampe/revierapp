-- 088_absage_als_zustand.sql
-- Nativer Track — 03.08.2026
--
-- EINE ABSAGE WAR BISHER EIN LOCH, KEIN ZUSTAND.
--
-- `decline_hunt_invitation` machte ein DELETE: nach dem Ablehnen existierte die
-- Zeile nicht mehr. Der Jagdleiter sah damit keine Absage, sondern eine Person
-- weniger — und konnte nicht unterscheiden, ob jemand abgesagt hat oder ob er
-- ihn nie eingeladen hatte.
--
-- Gemessen am 03.08.2026 über den Gesamtbestand: 41 Zeilen auf `invited`,
-- 47 auf `joined`, **0 auf `left`**. Der Eindruck "es sagt nie jemand ab"
-- stimmt nicht — er ist die Folge davon, dass Absagen spurlos verschwinden.
--
-- Anlass ist die Zu-/Absagen-Übersicht der Revierzentrale (Phase 4a). Der
-- Riegel gehört aber in die DB und nicht ins Portal, damit er für BEIDE
-- Clients gilt: nativ wird über denselben RPC abgesagt.
--
--
-- WAS SICH NICHT ÄNDERT, UND WARUM DAS GEMESSEN IST
--
-- Kein Client-Fix nötig. Beide Jagdlisten filtern bereits ausdrücklich auf die
-- zwei Zustände, die sie anzeigen wollen:
--   nativ  src/lib/data/hunts.ts:57      .in('status', ['joined', 'invited'])
--   PWA    app/app/page.tsx:25           .in('status', ['joined', 'invited'])
-- Eine abgesagte Jagd taucht also in keiner Liste wieder auf. Und der native
-- Fallback-Zweig in app/(app)/(jagd)/hunt/[id]/_layout.tsx fängt jeden Zustand
-- ab, der weder `invited` noch `joined` ist ("Kein Zugriff. Du bist kein
-- Teilnehmer von X") — `declined` fällt ohne Zutun genau dorthin.
--
-- `get_my_hunt_ids()` wird BEWUSST NICHT angefasst. Es filtert nicht auf
-- Status, eine abgesagte Jagd bleibt über `hunts_participant_select` also
-- lesbar (Name, Art, Termin, Status). Das ist kein neues Loch: erstens gilt es
-- heute schon für `left`, zweitens kannte genau diese Angaben jeder, der die
-- Einladung gesehen hat. Alles, was darüber hinausgeht — Strecke, Positionen,
-- Chat, Treiben — hängt an `get_my_joined_hunt_ids()` und bleibt zu.
-- Wer das ändern will, muss jeden Leser von get_my_hunt_ids() mitprüfen; das
-- ist ein eigener Vorgang, nicht ein Nebenzug dieser Migration.
--
--
-- DIE FALLE, DIE DIESE MIGRATION AUFSTELLT — BITTE LESEN
--
-- `hunt_participants` trägt UNIQUE (hunt_id, user_id).
--
-- Solange die Absage die Zeile LÖSCHTE, war erneutes Einladen ein gewöhnlicher
-- INSERT. Mit einer bleibenden Zeile scheitert der an 23505. Jeder Einladepfad,
-- der jemanden ein zweites Mal einladen können soll, muss deshalb ein UPDATE
-- (bzw. ein Upsert auf dem Unique-Schlüssel) sein — sonst lässt sich ein einmal
-- Abgesagter nie wieder einladen, und der Fehler, den der Nutzer sieht, ist
-- eine Constraint-Verletzung ohne jeden Bezug zur Absage.
--
-- Betroffen ist heute NICHT der native Anlege-Pfad (src/lib/data/hunts.ts:283):
-- er läuft nur bei einer frisch angelegten Jagd, dort kann es keine Kollision
-- geben. Betroffen ist der nachträgliche Einladepfad, den Phase 4a baut.
--
--
-- WARUM `left_at` MITGESETZT WIRD
--
-- Die Spalte existiert, sie heißt "Teilnahme beendet am", und eine Absage ist
-- genau das. Sie wird heute von keinem Client gelesen (geprüft in beiden
-- Repos), kostet also nichts — aber der Zeitpunkt einer Absage ist sonst für
-- immer verloren, und "hat zwei Tage vorher abgesagt" ist bei einer
-- Jagdplanung eine andere Auskunft als "hat vor drei Monaten abgesagt".
-- Unterschieden wird weiter über `status`, nicht über `left_at`.


-- ---------------------------------------------------------------------------
-- BLOCK 1 — GETRENNT AUSFÜHREN (im SQL-Editor allein markieren)
--
-- Postgres erlaubt seit v12 `ALTER TYPE … ADD VALUE` in einer Transaktion,
-- verbietet aber die VERWENDUNG des neuen Wertes in derselben Transaktion
-- ("unsafe use of new value of enum type"). Der Funktionsrumpf in Block 2 ist
-- davon nicht betroffen — PL/pgSQL speichert ihn als Text und löst den Wert
-- erst beim Aufruf auf. Eine GEGENPROBE, die die Funktion ruft, wäre es sehr
-- wohl. Deshalb: Block 1 markieren, ausführen, dann erst Block 2.
-- ---------------------------------------------------------------------------

alter type participant_status add value if not exists 'declined';


-- ---------------------------------------------------------------------------
-- BLOCK 2 — die Funktion
--
-- Unverändert übernommen: SECURITY DEFINER und
-- `search_path = public, extensions, pg_temp` (pg_temp am ENDE — sonst wird das
-- Temp-Schema zuerst durchsucht, und `authenticated` darf dort Tabellen
-- anlegen; s. AGENTS.md und Migration 076).
--
-- Ebenfalls unverändert: die Bedingung `status = 'invited'`. Wer schon `joined`
-- ist, sagt nicht ab, sondern verlässt die Jagd — dafür gibt es
-- `jagd_verlassen()` aus 067. Die beiden Wege bleiben getrennt, weil sie
-- verschiedene Dinge bedeuten.
-- ---------------------------------------------------------------------------

create or replace function public.decline_hunt_invitation(p_hunt_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  betroffen int;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  update hunt_participants
     set status  = 'declined',
         left_at = now()
   where hunt_id = p_hunt_id
     and user_id = v_uid
     and status  = 'invited';

  -- Vorher meldete ein DELETE ohne Treffer stillschweigend Erfolg. Das war
  -- verschmerzbar, solange "keine Zeile" das Ziel war — jetzt ist das Ziel ein
  -- Zustand, und "nichts geändert" davon nicht mehr zu unterscheiden.
  -- Der Wortlaut spiegelt jagd_verlassen() aus 067.
  get diagnostics betroffen = row_count;
  if betroffen = 0 then
    -- Aber: schon abgesagt ist kein Fehlschlag, sondern das Ziel.
    -- Befund 2 des Codex-Reviews vom 03.08.2026: der Doppelklick-Riegel im
    -- nativen handleDecline ist ein State (`processing`), kein Ref — zwei
    -- schnelle Tipps kommen beide durch. Der zweite Aufruf träfe 0 Zeilen und
    -- risse einen Alert "Ablehnen fehlgeschlagen" hoch, OBWOHL die Absage
    -- gerade geglückt ist. Unter dem alten DELETE fiel das nicht auf, weil ein
    -- Treffer-loses DELETE schwieg.
    -- Idempotenz gehört hierher und nicht in den Client: sonst braucht jeder
    -- Aufrufer denselben Riegel, und einer vergisst ihn.
    if exists (
      select 1 from hunt_participants
       where hunt_id = p_hunt_id and user_id = v_uid and status = 'declined'
    ) then
      return;
    end if;
    raise exception 'Keine offene Einladung zu dieser Jagd gefunden';
  end if;
end;
$function$;


-- ---------------------------------------------------------------------------
-- BLOCK 2b — hunt_photos_delete: das Loch, das diese Migration sonst aufrisse
--
-- BEFUND 11 des Codex-Reviews vom 03.08.2026, an der Produktion nachgeprüft.
--
-- `hunt_photos_delete` prüft heute:
--     uploaded_by = auth.uid()
--     OR hunt_id IN (select hunt_id from hunt_participants
--                     where user_id = auth.uid()
--                       and role = 'jagdleiter')
--
-- Da steht KEINE Statusbedingung. Solange eine Absage die Zeile löschte, war
-- das folgenlos — mit der Zeile verschwand das Recht. Ab Block 2 bleibt die
-- Zeile stehen, und ein als Jagdleiter Eingeladener, der ABSAGT, dürfte
-- weiterhin **sämtliche Fotos dieser Jagd löschen**. Die Migration risse also
-- ein Loch, das sie nicht meint.
--
-- Es ist zugleich ein VORBESTEHENDER Fehler: dasselbe gilt für `status='left'`
-- seit 067. Aufgefallen ist es nie, weil im ganzen Bestand 0 Zeilen auf 'left'
-- stehen — jagd_verlassen() hat nativ keinen Knopf. Der Fix repariert beide
-- Fälle in einem.
--
-- Die neue Fassung spiegelt istJagdleiter() im Client (src/lib/hunt/leitung.ts,
-- 03.08.2026): eigenes Foto ODER Ersteller ODER Jagdleiter, der auch dabei ist.
-- `get_my_joined_hunt_ids_as_leader()` ist die etablierte Fassung dieser Frage
-- und prüft 'joined' UND 'jagdleiter' — sie hier zu benutzen ist billiger und
-- weniger fehleranfällig, als die Bedingung ein zweites Mal auszuschreiben.
--
-- `to authenticated` ist NICHT nötig und wird bewusst weggelassen: `anon` hat
-- EXECUTE auf die Funktion (gemessen 03.08.2026), es kann also kein 42501
-- entstehen; und für `anon` ist auth.uid() null, die Policy trifft nichts.
-- Die Rolle unverändert zu lassen hält den Diff auf der Bedingung.
-- ---------------------------------------------------------------------------

drop policy if exists hunt_photos_delete on public.hunt_photos;

create policy hunt_photos_delete
  on public.hunt_photos
  for delete
  using (
    uploaded_by = auth.uid()
    or hunt_id in (select id from hunts where creator_id = auth.uid())
    or hunt_id in (select get_my_joined_hunt_ids_as_leader())
  );


-- ---------------------------------------------------------------------------
-- BLOCK 3 — Gegenproben (nach Block 2 ausführen, alles in EINER Selektion)
--
-- Alle drei laufen als Heinrich (c61d2d8d-…) gegen eine Wegwerf-Jagd, die der
-- Prüfer vorher anlegt. NICHT gegen die Pilotjagd a96c65d8-… fahren.
--
--   1. Positivkontrolle: eine `invited`-Zeile → nach dem Aufruf 'declined',
--      left_at gesetzt, Zeile existiert noch.
--   2. Zweiter Aufruf auf dieselbe Jagd → Exception "Keine offene Einladung".
--   3. Eine `joined`-Zeile → Exception, Status unverändert 'joined'
--      (Absage ist nicht Verlassen).
--   4. Erneutes Einladen nach Absage: INSERT muss an 23505 scheitern,
--      UPDATE auf status='invited' muss durchgehen. Das ist der Beleg für die
--      Falle oben — der Portal-Einladepfad muss den zweiten Weg nehmen.
--   5. IDEMPOTENZ (Befund 2): zweiter Aufruf auf eine bereits abgesagte
--      Einladung muss OHNE Fehler zurückkehren — und die Zeile unverändert
--      lassen (left_at darf NICHT neu gesetzt werden, der frühe `return`
--      steht vor jedem weiteren Schreiben).
--   6. FOTO-RECHT (Befund 11), die Probe, ohne die diese Migration ein Loch
--      aufmacht. Aufbau: Heinrich mit role='jagdleiter', status='invited' auf
--      der Wegwerf-Jagd; ein Foto, das Moritz hochgeladen hat.
--        a) VOR dem Fix, zur Kontrolle: als Heinrich absagen, dann
--           `delete from hunt_photos where id=<fremdes foto>` → 1 Zeile.
--           Das ist der Befund.
--        b) NACH dem Fix: derselbe Ablauf → 0 Zeilen.
--        c) POSITIVKONTROLLE, damit der Fix nicht zu viel schließt: Heinrich
--           als joined Jagdleiter → 1 Zeile. Und Moritz als Ersteller,
--           ohne joined-Zeile → 1 Zeile.
--        d) Eigenes Foto bleibt immer löschbar (uploaded_by-Zweig).
-- ---------------------------------------------------------------------------

-- 102 — Eine mehrtaegige Jagd laeuft bis zu ihrem Endtermin durch
--
-- ===========================================================================
-- Warum
-- ===========================================================================
--
-- Migration 095 hat `hunts.scheduled_until` angelegt, damit eine Drueckjagd
-- ueber ein Wochenende EIN Eintrag ist statt drei. Die Spalte allein genuegt
-- aber nicht: der Cron-Job `auto-end-stale-hunts` beendet jede Jagd, deren
-- letzte Aktivitaet 12 Stunden zurueckliegt — und `last_activity_at` heben
-- genau drei Trigger, `trg_kills_activity`, `trg_messages_activity` und
-- `trg_positions_current_activity`. Nachts laeuft keiner davon.
--
-- Damit rechnet sich eine zweitaegige Jagd so:
--
--     Tag 1, 19:00   letzte Position, letzte Nachricht
--     Nacht          nichts
--     Tag 2, 07:00   Cron: 12 h ohne Aktivitaet -> auto_completed
--     Tag 2, 08:00   Die Jagd ist beendet, bevor ihr zweiter Tag beginnt.
--
-- **Und sie kommt nicht zurueck.** `startHunt` im nativen Client hat
-- `.eq('status','scheduled')` als harten Riegel; eine `auto_completed` Jagd
-- ist endgueltig beendet (Backlog 0-neu-b, „Beenden ist ein Einweg-Schalter
-- ohne Rueckweg"). Der Jagdleiter verliert Live-Karte, GPS-Sharing und
-- Standbezug fuer den Rest des Termins.
--
-- **Der Mechanismus ist nicht theoretisch, er feuert im Bestand:** 18 von 41
-- Jagden stehen auf `auto_completed`, also 44 % (gemessen 04.08.2026).
--
-- ===========================================================================
-- Der Anlass ist ein Jagdtyp, kein Randfall
-- ===========================================================================
--
-- Moritz am 04.08.2026 zu den mehrtaegigen Jagden: „das sind manchmal auf
-- jagden in einem fremden revier ohne selbst eingezeichnete treiben. lebt
-- dann nur von den live positionen der gaeste."
--
-- Das ist der Punkt, an dem der 12-Stunden-Riegel am teuersten ist: eine
-- solche Jagd hat keine Treiben, oft kein eigenes Revier und keine
-- Kartenobjekte. Ihr gesamter Nutzen sind die Live-Positionen — und genau die
-- erloeschen mit dem Auto-Ende.
--
-- ===========================================================================
-- Warum ein ZEITPUNKT-Vergleich und nicht der Kalendervertrag aus 095
-- ===========================================================================
--
-- 095 definiert „mehrtaegig" ueber verschiedene BERLINER Kalenderdaten und
-- warnt ausdruecklich davor, `scheduled_until > scheduled_for` dafuer zu
-- nehmen — eine Jagd von 08:00 bis 16:00 erfuellt das auch.
--
-- **Hier lautet die Frage aber nicht „ist sie mehrtaegig", sondern „ist ihr
-- geplantes Ende schon vorbei".** Darauf antwortet der Zeitpunkt, nicht der
-- Kalendertag. Wer hier den 095-Vertrag einsetzte, liesse eine eintaegige
-- Jagd mit Endtermin um 07:00 des Folgetages einsammeln, obwohl ihr Ende
-- laut Termin erst um 16:00 kommt.
--
-- Bewusste Folge: **auch eine EINTAEGIGE Jagd mit Endtermin wird bis zu ihrem
-- Ende verschont.** Das ist richtig — ein gesetzter Endtermin ist eine
-- Aussage des Jagdleiters darueber, wann die Jagd vorbei ist, und sie wiegt
-- schwerer als eine Faustregel ueber Funkstille.
--
-- Nach dem Endtermin greift der 12-Stunden-Riegel unveraendert. Eine Jagd,
-- die abends noch laeuft, wird also nicht am Endtermin abgeschnitten — sie
-- faellt erst, wenn sie zusaetzlich 12 Stunden still ist. Genau so von Moritz
-- entschieden (04.08.2026: „einfach durchlaufen lassen bis zum endtermin").
--
-- ===========================================================================
-- Was diese Migration bewusst NICHT tut
-- ===========================================================================
--
--   * ~~Keine Obergrenze gegen ein weit entferntes `scheduled_until`.~~
--     **Der erste Entwurf liess sie weg, mit dem Argument „der Riegel gehoert
--     ins Formular" — die Fremdpruefung hat es zerlegt, und sie hat recht.**
--     Ein Formular-Riegel schuetzt gegen Vertipper, nicht gegen `curl`:
--     `kills_reporter`-Bauform, `hunts_creator_all` ist spaltenunabhaengig,
--     also darf jeder Ersteller und jeder Rollen-Jagdleiter `scheduled_until`
--     per PostgREST direkt auf 2099 setzen. Ab dieser Migration ist die Spalte
--     kein Anzeigewert mehr, sondern eine **Lebensdauer-Autorität** — und
--     damit gilt die Projektregel aus AGENTS.md: leitet sich etwas aus einer
--     Tabellenzeile ab, ist die Frage nicht „wer darf lesen", sondern „wer
--     darf diese Zeile schreiben". Dieselbe Wurzel wie 079, 083 und 087.
--     **Der Schaden waere nicht bloss eine Karteileiche:** die Jagd bliebe
--     `active`, und damit liefen Live-Positionen und GPS-Freigabe der
--     Teilnehmer jahrelang weiter — genau der Zustand, den das Auto-Ende
--     beenden soll.
--     **Die Grenze steht deshalb IM CRON, nicht als CHECK:** sie trifft keine
--     der 41 Altzeilen, bricht keinen Schreibpfad beider Clients und braucht
--     keinen Trigger. Wer einen unsinnigen Endtermin setzt, verliert schlicht
--     die Ausnahme und wird wie bisher nach 12 Stunden eingesammelt.
--     **14 Tage** deckt jede reale Jagd mit Reserve. Die Zahl ist eine
--     Produktentscheidung, und Moritz hat sie am 04.08.2026 mit der
--     Verteilung belegt: **95 % der Jagden sind eintaegig, 4 % mehrtaegig bis
--     zu einer Woche, 1 % eventuell bis 14 Tage.** Der Deckel liegt damit
--     genau am oberen Rand des Bestands statt an einer geratenen Zahl — und
--     die 95 % schreiben ohnehin `scheduled_until = NULL` und beruehren
--     diesen Zweig nie.
--     **Die Zahl steht an ZWEI Stellen:** hier und als `MAX_JAGD_TAGE` in
--     `quickhunt-native/src/app/(app)/(jagd)/create.tsx`, wo sie das
--     `maximumDate` des Bis-Waehlers setzt. Sie muessen gleich bleiben, sonst
--     bietet das Formular eine Dauer an, die der Server still nicht traegt
--     (S2, gefunden im Delta-Durchgang der Schlusslesung).
--     **Es sind ZWEI Deckel, und der erste Entwurf hatte nur einen** — die
--     Schlusslesung hat die Luecke gefunden (F1). Ein rein RELATIVER Deckel
--     (`until <= for + 14 Tage`) misst gegen `scheduled_for`, also gegen eine
--     Spalte, die derselbe Angreifer schreibt: `for = 2099-01-01,
--     until = 2099-01-10` haelt die Spanne bei neun Tagen und die Ausnahme
--     auf Dauer. Dagegen hilft nur ein ABSOLUTER Deckel gegen `now()`.
--     Der ehrliche Zusatz: ein boeswilliger Jagdleiter kann seine Jagd schon
--     heute per Aktivitaets-Heartbeat (ein Schreibvorgang alle 11 Stunden)
--     unbegrenzt offen halten. F1 schuf also keine neue Faehigkeit — es
--     haette sie nur lautlos und wartungsfrei gemacht.
--   * **Kein Anfassen von `activate-scheduled-hunts`.** Der Auto-Start haengt
--     an `scheduled_for + 4 h` und ist von einem Endtermin unberuehrt.
--   * **Keine Aenderung an `ended_at = last_activity_at`.** Wird eine Jagd
--     nach ihrem Endtermin eingesammelt, traegt sie weiterhin den Zeitpunkt
--     ihrer letzten Aktivitaet als Ende, nicht `now()` und nicht den
--     Endtermin. Das ist das bestehende Verhalten und die ehrlichere Angabe.
--   * **Kein Rueckweg aus `auto_completed`.** Der Einweg-Schalter bleibt, was
--     er ist (Backlog 0-neu-b); diese Migration nimmt ihm nur den Fall, in
--     dem er ohne jedes Zutun zuschlaegt.
--
-- ===========================================================================
-- Die Aenderung — `alter_job` per jobid, NICHT `cron.schedule`
-- ===========================================================================
--
-- **Der erste Entwurf nahm `cron.schedule` mit gleichem Jobnamen und nannte
-- das einen Upsert. Das ist falsch, und die Fremdpruefung hat die Quelle
-- mitgeliefert:** pg_cron loest den Konflikt auf `(jobname, username)`, wobei
-- `username` aus `current_user` kommt (job_metadata.c, v1.6.4). Liefe diese
-- Migration unter einer anderen Rolle als `postgres`, entstuende ein ZWEITER
-- Job gleichen Namens — und der alte, ungeschuetzte postgres-Job liefe weiter
-- und beendete mehrtaegige Jagden genau wie bisher. Die Migration haette
-- gemeldet, sie sei durchgelaufen, und nichts bewirkt.
-- Zweiter Punkt derselben Quelle: `schedule` aktualisiert nur Zeitplan,
-- Kommando und Datenbank — **einen inaktiven Job laesst es inaktiv.**
--
-- `cron.alter_job` aendert stattdessen genau die eine gefundene Zeile, und
-- `into strict` wirft bei 0 oder >1 Treffern (`NO_DATA_FOUND` /
-- `TOO_MANY_ROWS`), statt still das Falsche zu tun. `active => true` erzwingt
-- ausserdem den laufenden Zustand.
--
-- Der Rumpf ist der bisherige, ergaenzt um die Ausnahme — und `hunts` ist
-- jetzt als `public.hunts` qualifiziert, wie im Schwesterjob
-- `activate-scheduled-hunts` auch.

do $$
declare
  ziel bigint;
begin
  select jobid into strict ziel
    from cron.job
   where jobname = 'auto-end-stale-hunts'
     and username = 'postgres';

  perform cron.alter_job(
    job_id  => ziel,
    active  => true,
    command => $job$
    UPDATE public.hunts
    SET status   = 'auto_completed',
        ended_at = last_activity_at
    WHERE ended_at IS NULL
      AND status <> 'scheduled'
      AND last_activity_at < now() - interval '12 hours'
      -- Die Ausnahme fuer mehrtaegige Jagden. Positiv formuliert und unter
      -- NOT gesetzt, damit keine NULL-Falle entsteht: waeren die Bedingungen
      -- einzeln mit OR verknuepft, ergaebe ein NULL-Operand (etwa
      -- scheduled_for IS NULL) ein NULL statt eines FALSE, und die Zeile
      -- fiele lautlos aus dem WHERE — sie wuerde also verschont statt
      -- eingesammelt, genau falsch herum.
      AND NOT (
            scheduled_for   IS NOT NULL
        AND scheduled_until IS NOT NULL
        AND now() < scheduled_until
        -- Zwei Deckel, und der zweite ist der wichtigere. Der RELATIVE
        -- begrenzt die Dauer; er allein genuegt aber nicht, weil er sich auf
        -- `scheduled_for` stuetzt — eine Spalte, die derselbe Schreiber
        -- kontrolliert. Wer beide auf 2099 setzt, haelt die Spanne bei
        -- 9 Tagen und die Ausnahme auf Dauer (Schlusslesung F1). Der
        -- ABSOLUTE Deckel ist gegen nichts zu stellen, was der Client
        -- schreiben kann, und er heilt sich selbst: er trifft keine
        -- legitime Jagd, denn deren Ende liegt Tage voraus, nicht Jahre.
        AND scheduled_until <= scheduled_for + interval '14 days'
        AND scheduled_until <  now() + interval '14 days'
      )
    $job$
  );
end $$;

-- ---------------------------------------------------------------------------
-- Gegenproben (NACH dem Applizieren; die schreibenden mit ROLLBACK)
-- ---------------------------------------------------------------------------
--
--   -- 1 Der Job existiert GENAU EINMAL, gehoert `postgres`, ist aktiv und
--        traegt den neuen Rumpf. Die Zeile deckt Finding 1 der Fremdpruefung
--        ab und gehoert in jeden spaeteren Lauf:
--          select jobid, username, active, schedule,
--                 command like '%scheduled_until%' as neuer_rumpf
--            from cron.job where jobname = 'auto-end-stale-hunts';
--        -- erwartet GENAU EINE Zeile: jobid 4, postgres, true,
--        --          '*/30 * * * *', true
--
--   -- 2 `activate-scheduled-hunts` unberuehrt (Rumpf und Takt zeichengleich).
--
--   -- 3 Die Auswahl des Jobs als SELECT nachgefahren, gegen fuenf kuenstliche
--        Zeilen in EINER Transaktion mit ROLLBACK. Erwartet: nur (b) fehlt im
--        Ergebnis, alle anderen werden eingesammelt.
--          a) ohne scheduled_until, 13 h still                  -> beendet
--          b) scheduled_until in 2 Tagen, 13 h still            -> BLEIBT
--          c) scheduled_until gestern, 13 h still               -> beendet
--          d) scheduled_until 2099 (Vertipper/Angriff)          -> beendet
--             (Finding 2: die 14-Tage-Grenze nimmt ihm die Ausnahme)
--          e) scheduled_until gesetzt, scheduled_for NULL       -> beendet
--             (die NULL-Falle: mit OR statt NOT(...) bliebe sie stehen)
--
--   -- 4 Positivkontrolle Bestand: die Auswahl ueber die echten 43 Jagden
--        liefert dieselbe Menge wie vor der Aenderung, weil `scheduled_until`
--        in 0 von 43 Zeilen gesetzt ist. Die Migration aendert also fuer den
--        heutigen Bestand nichts — sie wirkt erst mit dem ersten Endtermin.
--
--   -- 5 Bestand je Status vorher wie nachher: **24 completed, 18
--        auto_completed, 1 scheduled**, gemessen unmittelbar vor dem
--        Applizieren am 04.08.2026.
--        *Der Bestand ist ein bewegtes Ziel:* zwei Stunden zuvor stand er auf
--        23/18/2 — eine geplante Jagd war inzwischen beendet worden. Wer die
--        Gegenprobe spaeter wiederholt, vergleicht die Summe (43) und die
--        Zahl der Zeilen mit Endtermin, nicht die einzelnen Status.
--
--   -- 6 Negativprobe zu `into strict`: laeuft die Migration ein zweites Mal,
--        muss sie sauber durchlaufen (ein Treffer bleibt ein Treffer). Ein
--        zweiter Job gleichen Namens waere ein TOO_MANY_ROWS und damit ein
--        lauter Fehlschlag statt eines stillen.

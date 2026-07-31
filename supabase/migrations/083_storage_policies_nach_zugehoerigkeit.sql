-- 083 — Storage-Policies hängen an der Zugehörigkeit des Fotos
--
-- ANLASS
-- Am 31.07.2026 wurde der als „größter offener Sicherheitsposten" notierte
-- Punkt untersucht: die direkt aufrufbaren SECURITY-DEFINER-Funktionen, die
-- für `anon` ausführbar sind. Ergebnis dieser Untersuchung: **dort ist nichts
-- offen.** Alle 18 haben ein `auth.uid()`-Tor, alle 34 Tabellen liefern `anon`
-- 0 Zeilen, jeder INSERT-Versuch endet in 42501 — gemessen erst per
-- `set local role anon`, dann über die echte Produktions-URL mit dem
-- anon-Key aus dem App-Bundle.
--
-- Offen war etwas anderes, das an denselben Schlüssel hängt und NICHT an den
-- Tabellen-Policies: der Storage. Zwei Befunde, beide gemessen.
--
-- BEFUND 1 — chat-photos stand für das ganze Internet offen
--
--     chat_photos_read   SELECT   to PUBLIC   using (bucket_id = 'chat-photos')
--
-- Als einzige der zehn Storage-Policies ohne Rollenbeschränkung UND ohne jede
-- `auth.uid()`-Bedingung. Nachgestellt gegen die Produktion, ohne Anmeldung:
--
--     POST /storage/v1/object/list/chat-photos          -> 4 Ordner
--     POST … {"prefix":"<gruppe>"}                      -> 4 Dateinamen + Größe
--     GET  /storage/v1/object/public/chat-photos/<pfad> -> HTTP 200,
--                                                          124.461 bytes,
--                                                          image/jpeg
--
-- Der letzte Aufruf lief OHNE jeden Key. Vollständige Aufzählung aller 17
-- Chat-Fotos und Abruf durch jeden, der die Bucket-Namen kennt.
--
-- BEFUND 2 — app-photos war für jeden Angemeldeten vollständig lesbar
--
--     app_photos_read    SELECT   to authenticated   using (bucket_id = 'app-photos')
--
-- Richtig eingeschränkt auf Angemeldete, aber sonst ungefiltert. Gegen
-- Heinrich (c61d2d8d…) gemessen: **201 von 201 Fotos aller Reviere**, 185
-- davon Kartenobjekt-Fotos. Das ist der Oktober-Fall: ein Begehungsschein-
-- Inhaber sieht Kanzel- und Streckenfotos JEDES fremden Reviers. Dieselbe
-- Wurzel wie 077 und 079 — die Leseseite der Tabellen ist sorgfältig gebaut,
-- die des Storage hat nie jemand angesehen.
--
-- DER ENTWURF, UND DER VERWORFENE ERSTE
-- Der erste Entwurf ließ die Foto-TABELLEN entscheiden: `map_object_photos`
-- und `hunt_photos` führen den Objektnamen als Spalte, also
-- `exists (select 1 from map_object_photos p where p.storage_path = …)`.
-- Das läuft mit den Rechten des Aufrufers, erbt deren RLS und sah sauber aus.
--
-- **Es war zu umgehen, und der Angriff ist nachgestellt.** Ein Codex-Review
-- markierte den Punkt als „hoch, aus dieser Datei nicht entscheidbar": die
-- Zweige vertrauen darauf, dass eine sichtbare Zeile nicht auf einen beliebigen
-- fremden Pfad zeigen darf. Gemessen als Heinrich, in einer Transaktion:
--
--     insert into map_object_photos (map_object_id, url, storage_path, …)
--     values ('<sein eigenes, sichtbares L7-Objekt>', 'https://x/egal',
--             '<Pfad eines fremden Söder-Fotos>', …);
--
--     fremdes Söder-Foto sichtbar:  vorher 0  ->  nachher 1
--
-- Er hängt einen fremden Pfad an sein eigenes Objekt und hat damit Zugriff.
-- Das ist wörtlich die Regel aus AGENTS.md, die seit 076 und 079 dort steht:
-- *leitet sich eine Berechtigung aus einer Tabellenzeile ab, ist die Frage
-- nicht „wer darf lesen", sondern „wer darf diese Zeile schreiben".* Beim
-- Entwurf ist genau sie übersehen worden.
--
-- DIE JETZIGE FASSUNG fragt keine Foto-Tabelle mehr. Der Pfad trägt die
-- Zugehörigkeit selbst — `<uid>/<art>/<entity_id>/<datei>` — und der Pfad ist
-- der Name des Objekts, den kein Client umschreiben kann. Verglichen wird
-- also: gehört die im PFAD genannte Entity zu etwas, das der Aufrufer sehen
-- darf? Damit gibt es keine Zeile mehr, über die sich etwas vortäuschen ließe,
-- und der Angriff oben endet bei 0 (gemessen, s. Gegenprobe unten).
--
-- Nebenwirkung, angenehm: kein `like`, kein Cast eines Pfadstücks auf uuid.
-- Verglichen wird `entity.id::text` gegen das Pfadstück, nie umgekehrt — ein
-- krummer Pfad ergibt damit `false` statt eines Abbruchs der ganzen Abfrage.
-- `case` sichert zusätzlich die Auswertungsreihenfolge zu, auf `and`-Kurzschluss
-- ist bei Policy-Ausdrücken kein Verlass (s. 078).
--
-- WARUM `storage.objects.name` ÜBERALL AUSGESCHRIEBEN IST
-- Nicht Stil, sondern ein Fehler, den erst die Messung fand: `map_objects` hat
-- selbst eine Spalte `name`. Innerhalb von `exists (select … from map_objects m
-- where … (storage.foldername(name))[3])` verdeckt sie den Bezug auf das
-- Storage-Objekt, und verglichen wird gegen den Kartenobjekt-Namen
-- („Sauberg 4"). Die Policy war damit still zu STRENG: die Positivkontrolle
-- stand auf 0. Codex hatte die Mehrdeutigkeit als Möglichkeit benannt; belegt
-- hat sie der Lauf.
--
-- WAS DIESE MIGRATION NICHT SCHLIESST
-- Alle drei Buckets sind `public: true`. Der Pfad
-- `/storage/v1/object/public/<bucket>/<name>` geht **an RLS vorbei** — wer
-- einen Pfad kennt, kommt weiter an die Datei, auch unangemeldet. Was hier
-- endet, ist das Aufzählen: ohne `list` gibt es keinen Weg an einen Pfad, den
-- man nicht ohnehin hat (zwei bis drei zufällige UUIDs tief).
--
-- Der zweite Schritt — Buckets auf `public: false` — ist teurer als er aussieht
-- und deshalb bewusst NICHT hier: die drei `getPublicUrl`-Aufrufe der PWA
-- laufen beim HOCHLADEN, und die fertige URL steht in der Datenbank
-- (`map_object_photos.url`, `kills.foto_url`, `wild_events.photo_url`,
-- Nachrichten-Inhalte). Signierte URLs laufen ab, lassen sich also nicht
-- speichern; es müssten 28 Render-Stellen auf „beim Anzeigen signieren"
-- umgebaut und die gespeicherten URLs zurück in Pfade überführt werden.
--
-- group-avatars bleibt unangetastet. Der eine dort liegende Ordner ist KEINE
-- `chat_groups.id` (nachgesehen), obwohl die vorhandenen UPDATE/DELETE-Policies
-- genau das unterstellen. Ein Riegel auf eine Pfad-Konvention, die sich nicht
-- belegen lässt, versteckt nur eine Datei ohne Sicherheitsgewinn — bei einem
-- einzigen Objekt und einem Gruppen-Avatar als Inhalt der schlechtere Tausch.
-- Als offener Punkt notiert, nicht als erledigt.
--
-- WARUM KEIN CLIENT SICH ÄNDERT — geprüft, nicht angenommen
--   * Kein Client ruft `.list()`. Nur dieser Weg geht über die SELECT-Policy.
--   * Bild-URLs entstehen per `getPublicUrl` (3 Stellen in der PWA). Das baut
--     einen String und fragt die Datenbank nicht — RLS ist daran unbeteiligt.
--   * Der native Client fasst Storage überhaupt nicht an (kein Treffer auf
--     `storage.from`, `getPublicUrl`, `createSignedUrl` in `src/`).
--   * `.remove()` (4 Stellen) hängt an den DELETE-Policies, die unverändert
--     bleiben. Die Storage-API liest das Objekt vor dem Löschen — dafür ist der
--     Zweig „eigener Upload" da, und die DELETE-Policy erlaubt ohnehin nur dem
--     Hochlader das Löschen.

-- ---------------------------------------------------------------------------
-- chat-photos — Mitgliedschaft in der Chat-Gruppe
-- ---------------------------------------------------------------------------
-- Der erste Pfad-Ordner IST die `chat_groups.id` (an allen 17 Objekten
-- nachgesehen). `get_my_group_ids()` ist SECURITY DEFINER und liefert die
-- Gruppen des Aufrufers; sie direkt zu rufen vermeidet die Frage, ob ein
-- `exists` auf `chat_group_members` sich mit dessen eigenen Policies im Kreis
-- dreht.
--
-- `to authenticated` ist hier Pflicht, nicht Stil: die Policy ruft eine
-- Funktion, und Policy-Ausdrücke laufen mit den Rechten des Aufrufers. Bliebe
-- sie `to PUBLIC`, bekäme ein Gast statt einer leeren Liste einen 42501 —
-- derselbe Fehler, den 078 auf `map_objects` behoben hat.
drop policy if exists chat_photos_read on storage.objects;

create policy chat_photos_read on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'chat-photos'
    and (storage.foldername(storage.objects.name))[1] in (
      select g::text from public.get_my_group_ids() g
    )
  );

-- ---------------------------------------------------------------------------
-- chat-photos, Schreibseite — dieselbe Bedingung, sonst ist die Leseseite hohl
-- ---------------------------------------------------------------------------
-- Beim Nachsehen der Schreib-Policies aufgefallen: `chat_photos_upload` prüfte
-- ausschließlich `bucket_id = 'chat-photos'`. Keine Mitgliedschaft, kein
-- `auth.uid()`. Als Heinrich nachgestellt, Zielgruppe fest verdrahtet:
--
--     insert into storage.objects (bucket_id, name)
--     values ('chat-photos','6bff13e7…/eingeschleust.jpg');   -- fremder Direktchat
--     -> Zeile angelegt
--
-- Jeder Angemeldete konnte also Dateien in JEDEN Chat-Ordner legen. Ohne
-- diesen Riegel wäre die neue Leseregel oben hohl: sie gibt Gruppenmitgliedern
-- Zugriff auf alles, was in ihrem Ordner liegt — und hineinlegen durfte es
-- jeder. Erst beide Seiten zusammen ergeben eine Grenze; genau das ist die
-- Regel aus AGENTS.md, an der der erste Entwurf dieser Migration gescheitert
-- ist.
drop policy if exists chat_photos_upload on storage.objects;

create policy chat_photos_upload on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'chat-photos'
    and (storage.foldername(storage.objects.name))[1] in (
      select g::text from public.get_my_group_ids() g
    )
  );

-- ---------------------------------------------------------------------------
-- app-photos — die im Pfad genannte Entity muss sichtbar sein
-- ---------------------------------------------------------------------------
-- Pfadform: <uploader_uid>/<art>/<entity_id>/<datei>, Tiefe 3.
-- Jeder Zweig liest genau die Tabelle, deren RLS ohnehin entscheidet, wer das
-- Ding sehen darf, zu dem das Foto gehört. Eine unbekannte `<art>` fällt auf
-- `false` — neue Fotoarten sind damit zunächst zu, nicht offen.
drop policy if exists app_photos_read on storage.objects;

create policy app_photos_read on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'app-photos'
    and (
      -- eigener Upload: hält den Zugriff auf die eigene Datei auch dann, wenn
      -- die zugehörige Zeile fehlt (11 solcher Waisen gemessen), und ist der
      -- Lesevorgang, den `.remove()` vor dem Löschen braucht.
      (storage.foldername(storage.objects.name))[1] = auth.uid()::text
      or case (storage.foldername(storage.objects.name))[2]
           when 'map_object' then exists (
             select 1 from public.map_objects m
              where m.id::text = (storage.foldername(storage.objects.name))[3])
           when 'hunt' then exists (
             select 1 from public.hunts h
              where h.id::text = (storage.foldername(storage.objects.name))[3])
           when 'kill' then exists (
             select 1 from public.kills k
              where k.id::text = (storage.foldername(storage.objects.name))[3])
           when 'wild_event' then exists (
             select 1 from public.wild_events w
              where w.id::text = (storage.foldername(storage.objects.name))[3])
           else false
         end
    )
  );

-- ---------------------------------------------------------------------------
-- Gegenprobe — alles vor dem Anwenden in Transaktionen mit ROLLBACK gemessen
-- ---------------------------------------------------------------------------
--   Heinrich sieht ein Kontrollfoto an einem L7-Objekt, das sein
--     Begehungsschein ihm öffnet                                     1   (Positivkontrolle)
--   Heinrich sieht ein fremdes Söder-Foto                            0
--   … nach dem Angriff oben (fremder Pfad an eigenem Objekt)         0   (alter Entwurf: 1)
--   Moritz (Besitzer), app-photos gesamt                           201   unverändert
--   anon, app-photos gesamt                                          0
--   anon, chat-photos auflisten über die echte URL                   0   (vorher 4 Ordner)
--
--   Schreibseite chat-photos, beide Richtungen:
--     Heinrich legt in EIGENE Gruppe ab                        angelegt   (Positivkontrolle)
--     Heinrich legt in FREMDEN Direktchat ab                      42501   (vorher: angelegt)
--
-- Ohne die Positivkontrolle bewiese die 0 nichts: eine Policy, die alles
-- sperrt, liefert dieselbe Zahl wie eine, die richtig unterscheidet.
--
-- Zwei Punkte, die das zweite Codex-Review als „aus der Datei nicht
-- entscheidbar" markiert hat — nachgemessen statt offengelassen:
--
--   * Der Zweig „eigener Upload" trägt nur, wenn KEIN Schreibweg ein Objekt
--     unter fremder uid anlegen oder dorthin verschieben kann. `app_photos_insert`
--     verlangt `auth.uid()::text = foldername[1]`; `app_photos_update` hat keinen
--     eigenen `with check`, womit Postgres dessen USING auch gegen die NEUE Zeile
--     prüft — Umbenennen, Verschieben und Kopieren laufen über dieselbe
--     Bedingung. Versuch als Moritz, ein eigenes Foto in Heinrichs Ordner zu
--     verschieben: **42501**.
--   * Der Textvergleich `entity.id::text = <pfadstueck>` verfehlt eine
--     nichtkanonisch geschriebene UUID (Großbuchstaben, Klammerform). Er würde
--     dann Zugriff VERWEIGERN, nie zusätzlichen gewähren. Bestand geprüft:
--     218 Pfade, davon 0 mit Großbuchstaben und 0 mit einem ersten Ordner, der
--     nicht kanonische UUID ist.
--
-- Kein Laufzeitfehler in irgendeinem Lauf: die vier gelesenen Tabellen sind
-- für `authenticated` zugreifbar, und keine ihrer SELECT-Policies liest
-- ihrerseits `storage.objects` (sonst wäre der Lauf mit einer zyklischen
-- Abhängigkeit abgebrochen statt mit einer Zahl geendet).

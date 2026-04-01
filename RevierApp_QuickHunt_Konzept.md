# RevierApp — QuickHunt Konzept & Umsetzungsplan

## Stand: 31.03.2026 — Brainstorming-Ergebnisse

---

## 1. Kernentscheidung: QuickHunt als Herz der App

**Desktop (Web)** = Revierzentrale. Revier verwalten, Grenzen zeichnen, JES ausstellen, Streckenbuch pflegen, Drückjagd im Detail planen, Jagdgruppen anlegen. Alles was Ruhe und Übersicht braucht.

**Mobile** = QuickHunt. Jagd starten, Leute einladen, Live-Karte, Chat, Strecke melden, Nachsuche. Alles was im Feld passiert.

**Die Brücke:** Was im Feld passiert fließt automatisch in die Web-Ansicht. Was am Schreibtisch geplant wird erscheint am Jagdtag auf Mobile.

---

## 2. Mobile — Vier Tabs (Bottom Navigation)

| Tab | Inhalt |
|-----|--------|
| 🎯 Jagd | QuickHunt-Kern: Jagd starten/beitreten, aktive Jagden, Hundeführer-Aufträge |
| 🗺️ Revier | Revierkarte kompakt (Hochsitze, Grenzen, Layer) |
| 📖 Strecke | Streckenbuch mobil, schnell melden |
| 👤 Profil | JES, Gäste, Beobachtungen, Kalender, Einstellungen |

---

## 3. Jagd erstellen — WhatsApp-Prinzip

### Flow
1. "Jagd starten" tippen
2. Name vergeben (optional, z.B. "Ansitz Brockwinkel")
3. Revier verknüpfen (falls vorhanden → Revierkarte wird Hintergrund)
4. Wildarten vorwählen (🐗🦌🦊🦡 als Toggle-Buttons → erscheinen als Schnellmeldung)
5. **"🔄 Wie letztes Mal"** — ein Tipp, letzte Mannschaft vorgeladen
6. **Kontakte einladen** aus dem Telefonbuch:
   - Suchfeld oben (Name oder Nummer)
   - App-Nutzer oben ("✓ In der App") → werden sofort hinzugefügt (Push)
   - Restliches Telefonbuch darunter ("Weitere Kontakte · bekommen Link") → WhatsApp-Link
   - Kein separater Bereich, alles in einer scrollbaren Liste
7. "Jagd starten →"

### Rollen (vereinfacht)
- **Jagdleiter** = wer die Jagd erstellt. Automatisch. Sieht alles + Kommandoleiste.
- **Schütze** = Standard für alle. Sieht Karte, Chat, Strecke, Nachsuche-Tab.
- **+👥 Gruppenleiter** = optionaler Zusatz-Tag. Kann neben jedem Kontakt angetippt werden.
- **+🐕 Hundeführer** = optionaler Zusatz-Tag. Bedeutet: "Hat Hund dabei, kann für Nachsuche eingeteilt werden." Jagt ganz normal als Schütze mit. Bekommt Nachsuche-Aufträge wenn der Jagdleiter sie zuweist.

### Wichtig
- Rollen schränken NICHT ein, sie ERWEITERN
- Jeder sieht die volle Jagd (Karte, Chat, Strecke, Nachsuche)
- Tags sind additiv, nicht exklusiv
- Nur der externe Nachsuchenführer (nicht in der Gruppe) bekommt eine reduzierte Ansicht

### Jagdgruppen (nur Web)
Am Desktop: Gruppen anlegen ("November Brockwinkel"), Mitglieder + Rollen pflegen. Auf Mobile erscheinen sie als Schnellauswahl.

---

## 4. Gast-Beitritt — Null Hürden

### Flow (was der 65-Jährige sieht)
1. Bekommt WhatsApp-Link
2. Tippt drauf → Beitrittsseite öffnet sich im Browser
3. Name ist vorausgefüllt (vom Handy/Kontakt), kann geändert werden
4. **Ein Button: "Dabei! 🎯"**
5. Sofort in der Jagd: Karte, Chat, sein zugewiesener Hochsitz, Navigation

### Kein Account, kein Download, kein Code
- Session-Token im Browser → App schließen, Link nochmal klicken → alles noch da
- Daten liegen auf dem Server, Browser ist nur das Fenster
- Bei gelöschtem Cache: Name nochmal eingeben → wird über Telefonnummer wieder zugeordnet

### Gast sieht dasselbe wie App-Nutzer
Karte, Chat, Nachsuche, Strecke — volle Jagd-Erfahrung. Einziger Unterschied: kann keine eigene Jagd erstellen, kein Profil, keine Historie.

### Gast kann Meldungen machen
Schäden, Defekte, Beobachtungen — der Gast sitzt auf dem Hochsitz und sieht's als erster. Schnellmeldung: Objekt antippen (z.B. Hochsitz Eicheneck) → Kategorie (Defekt, Beobachtung, Sonstiges) → Foto → kurze Beschreibung ("Sprosse 4 an der Leiter locker"). Geht direkt an den Jagdleiter/Pächter. Revierarbeit wird crowdsourced.

---

## 5. Live-Jagd — Vier Tabs im Vollbild

### 🗺️ Karte
- Dark-Mode-Karte mit Reviergrenze (falls verknüpft)
- Alle Teilnehmer als farbige Marker mit Name + Rollen-Icon
- Hochsitze, Parkplätze
- Entfernungsanzeige zu anderen Jägern
- Anschuss-Marker (rot pulsierend) bei Nachsuche

### 💬 Chat
- WhatsApp-Style Gruppenchat
- Fotos direkt aufnehmen und teilen
- Sprachnachrichten
- System-Nachrichten bei Nachsuche-Meldungen und Signalen

### 🔴 Nachsuche
- Nachsuche melden (Formular + Foto-Annotation → siehe Abschnitt 7)
- Übersicht aller Meldungen mit Priorität
- Status: offen → zugewiesen → erledigt
- Jagdleiter gibt frei und priorisiert
- Hundeführer (mit 🐕-Tag) bekommen Push bei Zuweisung

### 🦌 Strecke
- **Schnellmeldung-Buttons** oben: vorausgewählte Wildarten als große Icons (🐗🦌🦊🦡). Ein Tipp → Formular: Typ, Geschlecht (♂♀? als Buttons), Gewicht optional, Foto optional, GPS + Zeit automatisch.
- **Teilnehmer-Filter**: horizontale Chips mit Avataren, antippen → nur dessen Strecke
- **Pro Teilnehmer**: Karte mit Avatar, Hochsitz, Stücke mit Foto-Platzhalter, Wildart, Gewicht, Uhrzeit
- **🗑️ Löschen**: Mülleimer an jedem Eintrag, Zweistufig (1. Tipp = Bestätigung, 2. Tipp = weg)
- **Gesamtstrecke** als Zusammenfassung: 🐗 1 · 🦌 1 · 🦊 1

---

## 6. Jagdleiter-Kommandoleiste

Nur für den Jagdleiter sichtbar (goldenes 🎖️-Icon in Topbar). Horizontal scrollbare Buttons:

| Button | Aktion |
|--------|--------|
| 📢 Angeblasen! | Signal an alle: Jagd beginnt (Push an alle) |
| 🔴 Abgeblasen! | Signal an alle: Jagd beendet (Push an alle) |
| 👥 Rollen | Rollen live ändern/zuweisen |
| 🐕 +Nachsuche | Externen Nachsuchenführer per Link anfordern |

### Push-Benachrichtigungen
- **Drückjagd:** Signale kommen laut durch (Override wie Notruf) — sicherheitsrelevant bei 20 Schützen im Wald
- **Ansitz:** Alles stumm, nur Vibration — kein Gebimmel wenn ein Reh auf 30m steht
- Voreinstellung wird vom Jagdleiter beim Erstellen gesetzt (Jagdtyp: Ansitz/Drückjagd)
- Jeder Teilnehmer kann individuell überschreiben

### Timer (keine "Wie lange noch?"-Fragen)
- Jagdleiter setzt Endzeit beim Erstellen (z.B. "Ansitz bis 21:00")
- Alle sehen oben in der Topbar: **"⏱ noch 43 Min"** — live Countdown
- Bei Drückjagd zusätzlich: welches Treiben läuft, wann das nächste
- **Verlängern: ein "+15"-Button** neben dem Timer (nur Jagdleiter). Jeder Tipp = +15 Min ab jetzt. Dreimal tippen = 45 Min. Alle sehen den Timer springen + kurze Vibration. Kein Chatten nötig.

---

## 7. Nachsuche — Vision (Foto-Annotation + Luftbild)

### Schütze meldet (3 Marker auf dem Foto)
1. Macht Foto vom Anschussbereich
2. Setzt drei Marker durch Tippen auf das Bild:
   - 🟢 **Einwechsel** — woher das Wild kam
   - 🔴 **Schussabgabe** — seine Position
   - 🟠 **Flucht** — wohin das Wild abging
3. Gestrichelte Pfeile verbinden die Punkte automatisch
4. **Entfernung** als Scroll-Leiste (10m-Schritte)
5. **Stückzahl** (1, 2, 3, 4+)
6. GPS vom Hochsitz automatisch

### Hundeführer sieht (Split-View)
- **Oben:** Das annotierte Foto des Schützen mit allen Markern
- **Unten:** Luftbild-Karte mit:
  - Anschuss-Hochsitz in der Mitte
  - Einwechsel, Schuss, Fluchtrichtung als Overlay-Pfeile
  - Entfernungskreis (~45m)
  - **Alle anderen besetzten Stände** mit deren Strecke
  - **Automatische Überschneidungs-Erkennung**: "⚡ Peter (Südblick) hat Überläufer um 17:50 gemeldet — Fluchtrichtung zeigt zu seinem Stand"
  - → Nachsuche kann abgekürzt werden

---

## 8. Prototypen (Stand jetzt)

| Datei | Inhalt |
|-------|--------|
| RevierApp_Prototyp_v3.html | Desktop-Prototyp (Revierzentrale) — unverändert |
| RevierApp_Prototyp_v4_mobile.html | **Mobile-Prototyp** — QuickHunt komplett: Home, Jagd erstellen, Live-Jagd (Karte/Chat/Nachsuche/Strecke), Gast-Beitritt, Hundeführer |
| RevierApp_Nachsuche_Mockup.html | **Nachsuche-Vision** — Foto-Annotation + Hundeführer Split-View |

---

## 9. Umsetzungsplan — Schnell live gehen

### Woche 1–2: Lauffähiger QuickHunt-Kern
**Ziel: Jagd erstellen → Leute einladen → Live-Karte mit Standorten → Chat**

**Entwicklungsregel von Tag 1:** Alle Größen in `rem` statt `px`. Damit übernimmt die App automatisch die iPhone-Schriftgröße (Einstellungen → Anzeige → Textgröße). Kein eigener Schieberegler nötig — wer es am Handy groß hat, hat es in der App groß. Buttons mindestens 44x44pt (Apple-Richtlinie). Nachträglich umbauen wäre teuer, von Anfang an kostet es nichts.

1. **Auth simpel**: Telefonnummer + SMS-Code (wie Signal). Kein E-Mail/Passwort-Gedöns.
2. **Jagd erstellen**: Name, Revier (optional), Teilnehmer aus Kontakten → in Supabase speichern
3. **Einladungs-Link generieren**: /join/[code] → Gast gibt Namen ein → Session-Token → in DB
4. **Live-Karte**: Supabase Realtime → GPS-Positionen aller Teilnehmer auf Leaflet
5. **Einfacher Chat**: Supabase Realtime → Textnachrichten + Fotos (Supabase Storage)

**Tech: Next.js (bestehendes Projekt auf Hetzner), Supabase Realtime, Leaflet**

### Woche 3–4: Strecke + Nachsuche (Basis)
6. **Strecke melden**: Schnellmeldung-Buttons → in DB speichern → Echtzeit-Update für alle
7. **Nachsuche melden**: Formular (Wildart, Hochsitz, Flucht, Foto) → in DB
8. **Nachsuche-Liste**: Jagdleiter kann priorisieren, Hundeführer sieht Aufträge

### Woche 5–6: Polish + Revier-Anbindung
9. **Revier verknüpfen**: Wenn Jagd an Revier hängt → Hochsitze + Grenzen auf der Karte
10. **Sprachnachrichten**: Audio aufnehmen → Supabase Storage
11. **Push-Benachrichtigungen**: Einladung, Nachsuche, Signale
12. **Mobile PWA**: Installierbar, Offline-Grundfunktion

### Danach: Iteration basierend auf Feedback
- Foto-Annotation für Nachsuche (Vision aus Abschnitt 7)
- Jagdleiter-Kommandoleiste
- Revierverwaltung auf Desktop ausbauen
- JES-Verwaltung
- Drückjagd-Planung (Treiben, Stände, RSVP)

---

## 10. Bestehende Infrastruktur

| Komponente | Status |
|------------|--------|
| GitHub | github.com/moritzlampe/revierapp |
| Supabase | bzfevyqfkizmovoclysy.supabase.co (11 Tabellen, PostGIS) |
| Hetzner | 46.225.149.118 (CX22, Coolify) |
| Live-URL | http://d11fvwz5c1n65e871e5kbt3h.46.225.149.118.sslip.io |
| Stack | Next.js 16 + TypeScript + Tailwind + shadcn/ui + Leaflet |

---

## 11. GPS & Akku-Konzept

Grundprinzip: So wenig GPS wie möglich, so viel wie nötig. Alles automatisch, kein Nutzer-Eingriff.

### Drei Modi (automatische Erkennung)

| Modus | GPS-Intervall | Wann | Akku |
|-------|--------------|------|------|
| 🪵 Am Stand | GPS aus (gelockt) | Genauigkeit < 10m erreicht → Position fixiert | Quasi null |
| 🚶 Unterwegs | Alle 30–60 Sek | Geofence (5m) verlassen, Bewegung erkannt | Niedrig |
| 🏃 Drückjagd | Alle 5–10 Sek | Jagdleiter-Signal "Treiben!" aktiv | Mittel |

### Auto-Lock Ablauf
1. Schütze öffnet Jagd, GPS startet automatisch im Hintergrund
2. Jede Messung hat Genauigkeitswert (vom Handy geliefert)
3. Sobald Genauigkeit < 10m → **Position gelockt, GPS auf Sparflamme**
4. 10m-Geofence um die gelockte Position
5. Neue Messung wird NUR beachtet wenn Genauigkeit < 10m (schlechtes GPS wird ignoriert)
6. Ist Genauigkeit < 10m UND Entfernung > 10m vom Lock → neue Position senden + neu locken
7. Ist Genauigkeit < 10m UND Entfernung < 10m → nichts tun, Position bleibt
8. **Fallback:** Wird nach 2 Min keine Messung < 10m erreicht → beste bisherige Messung nehmen und locken (lieber 15m ungenau als kein Punkt)

**Warum 10m realistisch ist:** Auf einem Hochsitz (erhöht, halbwegs freier Himmel) schaffen moderne Smartphones 3–5m in 1–2 Minuten. Im dichten Wald dauert es länger, deswegen der Fallback.

**Wichtig:** GPS im Wald schwankt gern 20m hin und her. Ohne den Genauigkeits-Check würde ständig neu gesendet obwohl der Schütze stillsitzt. Deswegen: schlechte Messung (>10m) = wird komplett verworfen.

### Regeln
- Position wird nur gesendet wenn sie sich um >20m verändert hat (spart Datenvolumen)
- Manueller Refresh per 📍-Button jederzeit möglich
- "Treiben!" Signal vom Jagdleiter schaltet alle auf Live-Tracking
- "Hahn in Ruh" schaltet zurück auf Sparflamme
- Der Schütze merkt von alldem nichts — er sieht nur seinen Punkt auf der Karte

---

## 12. Kernprinzip: Eine Aktion, fünf Ergebnisse

### Der Flow (10 Sekunden)
1. App öffnen → fetter **"🎯 Erlegt!"**-Button direkt auf dem Homescreen
2. Tipp → Kamera öffnet sich sofort
3. Foto gemacht → App füllt alles vor was sie weiß:
   - Wildart (aus Jagd-Vorauswahl)
   - Hochsitz (aus GPS)
   - Uhrzeit, Datum, Revier (automatisch)
   - Waffe + Kaliber (aus Profil, wenn hinterlegt)
4. Alles antippbar und änderbar → **"Die App schlägt vor, der Jäger entscheidet."**
5. Ein Tipp auf ✓ → fertig

### Was im Hintergrund passiert (automatisch)
- ✅ Streckenbuch-Eintrag gespeichert
- ✅ Schusstagebuch aktualisiert
- ✅ Abschussplan-Zähler hochgezählt
- ✅ Streckenkarte generiert (Foto + Stats + Karte + Jäger)
- ✅ "Per WhatsApp teilen?" erscheint sofort

### Streckenkarte (das was bei WhatsApp ankommt)
Schicke Karte statt rohes Handyfoto: Foto groß oben, darüber Wildart + Geschlecht als Overlay, darunter vier Stats (Gewicht, Hochsitz, Jagdart, Entfernung), Mini-Karte mit Reviergrenze + Anschuss-Punkt, Jäger-Name + Revier, RevierApp-Branding mit Link.

Wer den Link antippt sieht die volle Karte, kann zum Hochsitz navigieren, sieht das Revier. Kein Account nötig. → Viraler Loop.

### Das Schusstagebuch füllt sich von allein
Jede Erlegung, jeder Ansitz (auch ohne Erlegung), Datum, Ort, Waffe. Am Jahresende ein komplettes Buch ohne je "Schusstagebuch" geöffnet zu haben.

---

## 13. Ganzjahres-Engagement & WhatsApp-Strategie

### WhatsApp nicht bekämpfen, sondern nutzen
- App generiert teilbare Inhalte FÜR WhatsApp (Streckenkarten, Wildkamera-Bilder, Jagd-Einladungen)
- Jede geteilte Karte hat einen Link zurück zur App → neue Nutzer
- WhatsApp ist der Verteiler, die App ist die Quelle

### Jagdgruppe lebt ganzjährig
Die Gruppe "November Brockwinkel" ist nicht nur für den Jagdtag. Zwischen den Jagden:
- Wildkamera-Bilder teilen
- Kirrung kontrolliert, Hochsitz repariert
- Wildschäden melden
- Rehkitz-Rettung koordinieren (Frühsommer)
- Jagdkalender: wer sitzt wann wo (keine Kollisionen)
- Abschussplan-Stand verfolgen

### Was nur die App kann (und WhatsApp nicht)
- Strecke über die Saison mitverfolgen (wer hat was, wie steht der Plan)
- Revierkarte mit Beobachtungen die sich über Monate aufbauen
- Schusstagebuch das sich automatisch füllt
- Nachsuche-Koordination mit Hundeführer
- Streckenkarten die zehnmal besser aussehen als ein Handyfoto

---

## 14. Geschäftsmodell

### Kostenlos (Schütze / Gast)
- Zur Jagd eingeladen werden und mitmachen
- Karte, Chat, Strecke melden, Fotos teilen, Nachsuche
- Streckenkarte per WhatsApp teilen
- Kein Account nötig für Gäste (per Link)

### Abo (Jagdleiter)
Sobald du selbst eine Jagd **erstellst** = zahlender Nutzer. Dafür:
- Unbegrenzt Jagden anlegen und Leute einladen
- Jagdleiter-Kommandoleiste (Signale, Rollen, Nachsuche-Zuweisung)
- **Komplette Webversion (Revierzentrale):**
  - Statistiken über alle Jagden
  - Abschussplan-Überwachung (Soll/Ist)
  - Jagderlaubnisschein-Vergabe (JES)
  - Jagdgruppen verwalten
  - Wildbretvermarktung: Rechnungen schreiben, Rundmails ("Frischlinge in der Decke", "Drückjagd am ... — Wild vorbestellen")
  - **Wildursprungsmarke als PDF:** Daten sind schon da (Jäger, Datum, Revier, Wildart, Gewicht, Ort). App erkennt Trichinenprobe-Pflicht bei Schwarzwild automatisch. QR-Code zur Rückverfolgung, Proben-Nummer, alles vorausgefüllt. Nächsten Morgen am PC ausdrucken, Probe einschicken, fertig. Ergebnis eintragen → Wildbret zum Verkauf freigeben → Rechnung an Kunden. Komplette Kette.
- **Abo weg = Daten weg.** Kein Freemium-Friedhof. Wer neu abschließt fängt bei null an.

### Einstieg: Eine Jagd kostenlos + 1 Monat Web
- Erste Jagd als Jagdleiter: voller Funktionsumfang, kostenlos
- Danach 30 Tage Web-Zugang: Statistiken angucken, Streckenkarte teilen, Abschussplan sehen, Wildbret-Tools ausprobieren
- Nach 30 Tagen: "Dein Testzugang endet in 3 Tagen. Deine Daten bleiben gespeichert — Abo starten um weiterzumachen."
- Kein Druck, aber die Daten sind schon drin

### Warum das funktioniert
- Ein Jagdleiter bringt 5–20 kostenlose Nutzer mit → viraler Trichter
- Kostenlose Nutzer erleben den vollen Flow → werden selbst Jagdleiter wenn sie ein Revier pachten
- Je länger das Abo läuft, desto mehr Daten drin (3 Saisons Streckenbuch, Kundenliste Wildbret) → kündigt keiner
- Wildbretvermarktung erzwingt Ganzjahres-Nutzung

---

## 15. Vision Phase 3: Jagdtourismus

### Die komplette Kette
Outfitter → Reisebüro → Jagdgast. Daten fließen automatisch nach oben, Karten und Fotos nach unten.

### Drei zahlende Stufen

| Stufe | Nutzer | Preis |
|-------|--------|-------|
| Jagdleiter | Privatjäger, Pächter | ~10€/Monat |
| Outfitter | Berufsjäger, Jagdanbieter | ~25€/Monat |
| Reisebüro | Mehrere Outfitter, Kundenstamm | ~50€/Monat |

### Mehrsprachigkeit
- App liest Handy-Sprache aus → Gast sieht alles automatisch in seiner Sprache
- Polnischer Outfitter erstellt auf Polnisch, französischer Gast sieht Französisch
- Icons (🐗🦌🔴📢) sind universal, Sprachbarriere verschwindet
- Fallback: Englisch. Manuell wechselbar per 🌐

### Gruppenleiter beim Strecke-Einsammeln
Einfacher Schnell-Flow — der Gruppenleiter läuft die Strecke ab:
1. **Schütze antippen** (Liste aller Teilnehmer)
2. **Wildart antippen** (vorausgewählte Icons)
3. **Foto** (optional, nur bei Bedarf)
4. **Wildmarke zuordnen** (Nummer eintippen oder scannen)
5. Fertig → nächstes Stück

Vier Tipps pro Stück, alles sofort dem richtigen Schützen zugeordnet.

### Reisebüro-Dashboard
- Empfängt Streckedaten automatisch vom Outfitter
- Generiert PDF-Paket pro Jagdgast: Streckenkarten mit Fotos, Trophäengewichte, Revierfotos, personalisiertes Grußwort, Rechnung
- Ein Tipp auf "An Kunden senden" → professionelle E-Mail raus

### Voraussetzung
Kern (QuickHunt) muss stehen. Jagdtourismus ist ein zusätzlicher Layer auf denselben Daten — nichts am Kern muss umgebaut werden.

---

## 16. Design-Grundregeln

1. **"Die App schlägt vor, der Jäger entscheidet."** — Alles vorausgefüllt, alles änderbar.
2. **`rem` statt `px`** — iPhone-Schriftgröße automatisch respektieren. Von Tag 1.
3. **Buttons mindestens 44x44pt** — Apple-Richtlinie, Handschuh-tauglich.
4. **Zwei echte Rollen** — Jagdleiter (automatisch) + Schütze (Standard). Tags (👥🐕) sind Zusätze.
5. **GPS smart** — Auto-Lock bei <10m, 10m-Geofence, schlechte Messungen verwerfen, Fallback nach 2 Min.
6. **Gast = volle Jagd** — Kein abgespecktes Erlebnis. Kein Account, kein Download.
7. **Eine Aktion, viele Ergebnisse** — Foto machen = Strecke + Schusstagebuch + Abschussplan + Karte + Share.
8. **Mobile = schnell handeln, Web = in Ruhe planen.**

---

## 17. Alle Prototypen & Mockups

| Datei | Inhalt |
|-------|--------|
| RevierApp_Prototyp_v3.html | Desktop-Prototyp (Revierzentrale) |
| RevierApp_Prototyp_v4_mobile.html | Mobile-Prototyp komplett (QuickHunt + Revier + Strecke + Profil) |
| RevierApp_Nachsuche_Mockup.html | Nachsuche-Vision (Foto-Annotation + Hundeführer Split-View) |
| RevierApp_Streckenkarte_Mockup.html | Streckenkarte (teilbare Karte für WhatsApp mit echtem Foto) |
| RevierApp_QuickHunt_Konzept.md | Dieses Dokument |

---

*Dokument erstellt: 31.03.2026 — Moritz Lampe & Claude*
*Brainstorming-Session: QuickHunt-Kern, Rollen, Gast-Flow, Nachsuche-Vision, GPS-Konzept, Streckenkarte, Viral-Loop*

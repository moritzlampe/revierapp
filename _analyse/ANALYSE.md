# RevierApp Analyse — 31.03.2026

Automatisierte Analyse aller 14 Seiten bei 1920x1080 (Desktop) und 390x844 (Mobile).
Vergleich mit `RevierApp_Prototyp_v3.html`.

---

## Seitenübersicht

| # | Seite | URL | HTTP | Status |
|---|-------|-----|------|--------|
| 01 | Startseite | `/` | 200 | Redirect auf Revierkarte |
| 02 | Revierkarte | `/revier/demo` | 200 | Funktioniert |
| 03 | Streckenbuch | `/revier/demo/strecke` | 200 | Funktioniert |
| 04 | Beobachtungen | `/revier/demo/beobachtungen` | 200 | Funktioniert |
| 05 | Jagdgäste | `/revier/demo/gaeste` | 200 | Funktioniert |
| 06 | JES | `/revier/demo/jes` | 200 | Funktioniert |
| 07 | Drückjagd | `/revier/demo/drueckjagd` | 200 | Funktioniert |
| 08 | Kalender | `/revier/demo/kalender` | 200 | Funktioniert |
| 09 | Einstellungen | `/revier/demo/settings` | 200 | Funktioniert |
| 10 | Login | `/login` | 200 | Funktioniert |
| 11 | JES Login | `/jes-login` | 200 | Funktioniert |
| 12 | Gästelink | `/r/demo` | 200 | Nur Ladetext, Karte fehlt |
| 13 | RSVP | `/rsvp/demo` | 200 | Nur Ladetext, Formular fehlt |
| 14 | Nachsuche | `/ns/demo` | 200 | Nur Ladetext, Karte fehlt |

---

## Detailanalyse pro Seite

### 01 — Startseite (`/`)

**Vorhanden:** Redirect auf `/revier/demo` — zeigt direkt die Revierkarte.
**Im Prototyp:** Kein separater Startscreen, Redirect ist korrekt.
**Bewertung:** OK

---

### 02 — Revierkarte (`/revier/demo`)

**Vorhanden und funktioniert:**
- Sidebar mit Logo ("RevierApp"), Sektionen ("REVIER", "VERWALTUNG"), alle 8 Nav-Items
- Nav-Badges (Streckenbuch: 12, Beobachtungen: 5, Jagderlaubnisse: 4)
- Revier-Info am Sidebar-Fuß ("Revier Brockwinkel · Reppenstedt · ~280 ha")
- Toolbar mit Tool-Buttons (Auswählen, Grenze zeichnen, Zone, Hochsitz, Foto, GPX Import)
- Layer-Switcher (Karte, Luftbild, Flurstücke, Hybrid) — alle klickbar
- "Revier teilen" Button (grün, rechts in Toolbar)
- Leaflet-Karte rendert korrekt mit OSM-Tiles
- Reviergrenze (Polygon) sichtbar mit gestrichelter grüner Linie
- Rechtes Panel "Revierobjekte" mit Zähler (9)
- Stat-Bar (7 Hochsitze, 2 Parkplätze, 3 Zonen)
- Panel-Tabs (Hochsitze, Parkplätze, Zonen)
- POI-Liste mit Icons (orange/grün/blau), Namen, Details, Koordinaten
- Share/Edit Action-Buttons pro POI
- Footer-Buttons ("Hinzufügen", "Import")

**Fehlt im Vergleich zum Prototyp:**
- Karten-Marker (Pins) auf der Karte sind NICHT sichtbar — im Prototyp haben alle POIs farbige Pin-Marker mit Labels direkt auf der Karte
- Share-Modal: Nicht getestet ob es beim Klick auf "Revier teilen" / Share-Icons erscheint
- Popup bei Klick auf Marker fehlt (da keine Marker sichtbar)

**UI-Probleme:**
- Layer-Switcher: Beim Wechsel auf "Luftbild" oder "Flurstücke" ändert sich die Karte optisch nicht erkennbar in den Screenshots — möglicherweise laden die WMS-Layer nicht
- Kein sichtbarer Unterschied zwischen den Layer-Zuständen

---

### 03 — Streckenbuch (`/revier/demo/strecke`)

**Vorhanden und funktioniert:**
- Header mit Titel "Streckenbuch", Beschreibung
- Buttons "Strecke melden" (grün) und "Export PDF" (sekundär)
- Stats-Grid: 12 Gesamt Saison 25/26, 5 Rehwild (Abschussplan: 8), 4 Schwarzwild (Kein Limit), 3 Raubwild (2 Fuchs, 1 Marder)
- Datentabelle mit allen 7 Spalten (Datum, Wildart, Geschlecht, Gewicht, Hochsitz, Jäger, Status)
- 7 Demodaten-Zeilen exakt wie im Prototyp
- Wildart-Emojis vorhanden
- Status-Badges ("Gemeldet" grün, "Nachsuche" orange)

**Fehlt:**
- "Nachsuche" bei letztem Eintrag ist nur orangefarbener Text statt Badge-Pill wie im Prototyp
- Stat-Cards haben keinen sichtbaren Border/Shadow — im Prototyp sind sie als Karten mit Border dargestellt

**UI-Probleme:**
- Tabelle nimmt nicht die volle Content-Breite ein (viel Leerraum unten)
- Kein Hover-Effekt auf Tabellenzeilen sichtbar

**Bewertung:** Sehr gut, fast 1:1 mit Prototyp

---

### 04 — Beobachtungen (`/revier/demo/beobachtungen`)

**Vorhanden und funktioniert:**
- Header "Beobachtungen" mit Beschreibung
- Buttons "Beobachtung eintragen" (grün) und "Auf Karte anzeigen" (sekundär)
- Datentabelle: Datum, Typ, Ort, Beschreibung, Jäger
- 5 Demo-Einträge wie im Prototyp
- Typ-Badges mit korrekten Farben (Wildschaden/orange, Wildwechsel/blau, Kirrung/grün, Salzlecke/grau)

**Fehlt:** Nichts Wesentliches

**Bewertung:** Sehr gut, 1:1 mit Prototyp

---

### 05 — Jagdgäste (`/revier/demo/gaeste`)

**Vorhanden und funktioniert:**
- Header "Jagdgäste" mit "Gast einladen" Button
- Datentabelle: Name, Telefon, Letzter Besuch, Besuche, Strecke, Aktionen
- 3 Gäste mit Avatar-Initialen (HW, KM, FS), Jagdschein-Nummern
- "Einweisen" Buttons in Aktionen-Spalte

**Fehlt:**
- Avatar-Farben: Alle gleich (grünlich) — im Prototyp unterschiedlich (HW grün, KM blau, FS orange)
- Klick auf "Einweisen" soll Share-Modal öffnen — nicht getestet

**Bewertung:** Gut

---

### 06 — Jagderlaubnisscheine (`/revier/demo/jes`)

**Vorhanden und funktioniert:**
- Header mit "JES ausstellen" und "PDF generieren" Buttons
- Stats-Grid: 4 Aktive JES, 1 Läuft bald ab (in 14 Tagen), 18/24 Gesamt Kontingent (75%), 2 Kurz-JES
- Datentabelle mit allen 7 Spalten (Inhaber, Zone, Wildarten, Kontingent, Gültig bis, Status, Aktionen)
- 4 JES-Einträge wie im Prototyp
- Status-Badges (Aktiv/grün, Läuft ab/orange, Kurz-JES/blau)
- "Link senden" und Edit-Pencil Buttons

**Fehlt:**
- "Entziehen" Button bei T. Braun (Kurz-JES) — im Prototyp rot
- "Verlängern" (↻) Button bei F. Schmidt — im Prototyp orange

**Bewertung:** Sehr gut

---

### 07 — Drückjagd (`/revier/demo/drueckjagd`)

**Vorhanden und funktioniert:**
- Header "Drückjagd-Planung" mit "Drückjagd anlegen" Button
- Event-Card: "Herbstdrückjagd Brockwinkel 2026", Datum, "Planung" Badge
- Stats-Zeile: 3 Treiben, 24 Stände, 18/24 Zusagen, 6 Hunde, 3 Offen (rot)
- Action-Buttons: Treiben planen, Einladungen senden, Stände zuweisen, Teilnehmerliste
- Treiben-Übersicht Tabelle (3 Treiben mit Details)
- RSVP-Übersicht Tabelle (5 Schützen mit Status)
- Alle Demodaten korrekt

**Fehlt:**
- "Zeitplan" Button — im Prototyp 5 Buttons, hier nur 4
- Emojis in Buttons fehlen (Prototyp hat Karten-/Brief-/Personen-Emojis)

**Bewertung:** Sehr gut

---

### 08 — Jagdkalender (`/revier/demo/kalender`)

**Vorhanden und funktioniert:**
- Header "Jagdkalender" mit "Termin anlegen" Button
- Tabelle: Datum, Typ, Titel, Teilnehmer, Hochsitz/Bereich, Status
- 4 Einträge wie im Prototyp
- Typ-Badges (Ansitz/grün, Drückjagd/orange)
- Status-Badges (Geplant/blau, Entwurf/grau, Erledigt/grün)

**Fehlt:**
- Kalender-Widget (Monats-/Wochenansicht) — nur Tabellenansicht vorhanden
- Für eine Kalender-Seite wäre eine echte Kalenderdarstellung wünschenswert

**Bewertung:** Gut — funktional, aber Kalender-UI fehlt

---

### 09 — Einstellungen (`/revier/demo/settings`)

**Vorhanden und funktioniert:**
- Header "Revier-Einstellungen"
- Alle 4 Settings-Gruppen: Allgemein, Gäste-Links, Karte & Daten, Account
- Allgemein: Reviername (Input), Fläche (~280 ha automatisch), Bundesland (Niedersachsen)
- Gäste-Links: 3 Einstellungen mit Toggles und Text-Input
- Karte & Daten: Standard-Kartenlayer, Flurstück-Overlay Toggle, Offline-Karten Toggle
- Account: Plan "Free — 1 Revier", Upgrade Button

**Fehlt:** Nichts Wesentliches

**Bewertung:** Exzellent, 1:1 mit Prototyp

---

### 10 — Login (`/login`)

**Vorhanden und funktioniert:**
- Zentrierte Karte mit RevierApp Logo und Branding
- "Anmelden als Revierinhaber" Untertitel
- E-Mail Feld mit Placeholder
- "Magic Link senden" Button (dunkelgrün)
- Link "Als JES-Inhaber anmelden →"

**Fehlt:** Nichts

**Bewertung:** Gut, sauber

---

### 11 — JES Login (`/jes-login`)

**Vorhanden und funktioniert:**
- Gleiche Karten-Struktur wie Login
- "Anmelden als JES-Inhaber" Untertitel
- Jagdschein-Nr. Feld mit Placeholder ("z.B. NI-2024-4829")
- "Anmelden" Button
- Link "← Als Revierinhaber anmelden"

**Fehlt:** Nichts

**Bewertung:** Gut, sauber

---

### 12 — Gästelink (`/r/demo`)

**Vorhanden:**
- Header-Bar: "Revier demo · Gäste-Ansicht" (dunkelgrün)
- Ladezustand: "Karte wird geladen..."

**FEHLT (kritisch):**
- Karte wird NICHT geladen — bleibt bei Ladetext stehen
- Keine Reviergrenzen, keine Hochsitz-Marker, keine Navigation
- Im Prototyp soll dies eine vollwertige Kartenseite ohne Login sein
- Kein Hochsitz-Name, keine Anfahrt, kein WhatsApp-Link

**UI-Probleme:**
- Leere Seite mit nur einem Header und Ladetext
- Mobile: Identisch leer

**Bewertung:** NICHT FUNKTIONAL — Hauptfeature für Gäste fehlt komplett

---

### 13 — RSVP (`/rsvp/demo`)

**Vorhanden:**
- Zentrierte Karte: "Drückjagd-Einladung"
- "Code: demo"
- Ladetext: "RSVP-Formular wird geladen..."

**FEHLT (kritisch):**
- RSVP-Formular lädt nicht
- Keine Drückjagd-Details (Datum, Ort, Zeitplan)
- Kein Antwort-Formular (Zusage/Absage, Auto, Hund, Schießnachweis, Übernachtung)

**Bewertung:** Placeholder — kein funktionales RSVP

---

### 14 — Nachsuche (`/ns/demo`)

**Vorhanden:**
- Header-Bar: "Nachsuche · Code: demo" (rot)
- Ladetext: "Anschuss-Position und Details werden geladen..."

**FEHLT (kritisch):**
- Karte mit Anschuss-Position fehlt
- Keine Details (Wildart, Zeitpunkt, Anschuss-Beschreibung)
- Keine Anfahrt/Navigation
- Roter Header passend zum Thema (gut)

**Bewertung:** Placeholder — nicht funktional

---

## Gesamtbewertung

### Design-Konsistenz (vs. Prototyp)
**8/10** — Die Hauptansichten (Streckenbuch, Beobachtungen, JES, Drückjagd, Einstellungen) sind fast 1:1 umgesetzt. Sidebar, Farbschema, Typografie und Layout stimmen sehr gut überein. Kleinere Abweichungen bei Badge-Styling und Avatar-Farben.

### Navigation
**9/10** — Sidebar-Navigation funktioniert einwandfrei. Alle 8 Nav-Items klickbar, korrekte Highlights, Badges vorhanden. Revier-Switcher am Fuß vorhanden.

### Karte (Leaflet)
**6/10** — Leaflet rendert, OSM-Tiles laden, Reviergrenze wird korrekt angezeigt. ABER: Karten-Marker (Hochsitz-Pins) sind nicht auf der Karte sichtbar. Layer-Switching scheint optisch keinen Unterschied zu machen (Luftbild/Flurstücke laden möglicherweise nicht). Rechtes Panel funktioniert als Liste, aber ohne Karten-Interaktion (Klick auf POI → Karte fliegt dahin + Popup).

### Responsive (Mobile 390x844)
**3/10** — Schwerwiegendes Problem: Die Sidebar bleibt auf mobilen Viewports sichtbar und nimmt ~60% der Breite ein. Content wird abgeschnitten. Es gibt keinen Hamburger-Button oder Sidebar-Collapse. Tabellen laufen aus dem Viewport. Stats-Cards sind unlesbar klein.

### Fehlende Komponenten
1. **Share-Modal** (WhatsApp-Teilen Dialog) — Im Prototyp zentral, hier unklar ob implementiert
2. **Karten-Marker** — POI-Pins auf der Karte fehlen
3. **Gästelink-Karte** (`/r/demo`) — Nur Ladetext
4. **RSVP-Formular** (`/rsvp/demo`) — Nur Ladetext
5. **Nachsuche-Karte** (`/ns/demo`) — Nur Ladetext
6. **Kalender-Widget** — Nur Tabelle, kein visueller Kalender
7. **Mobile Sidebar Collapse** — Keine responsive Sidebar
8. **Toast-Benachrichtigungen** — Unklar ob implementiert

---

## Priorisierter Prompt-Plan

### Priorität 1 — Kritische Funktionalität

**Prompt 1: Karten-Marker auf Revierkarte anzeigen**
```
Die Revierkarte unter /revier/demo zeigt zwar die Reviergrenze (Polygon), aber die POI-Marker (Hochsitze, Kanzeln, Parkplätze) sind nicht auf der Karte sichtbar.

Implementiere Leaflet-Marker für alle 9 POIs aus den Demo-Daten. Nutze farbige Pin-Marker wie im Prototyp (RevierApp_Prototyp_v3.html):
- Hochsitze: Orange Pin mit Holz-Emoji
- Kanzeln: Grün Pin mit Haus-Emoji
- Parkplätze: Blau Pin mit P-Emoji
- Jeder Marker bekommt ein Label mit dem Namen (z.B. "Eicheneck")
- Klick auf Marker öffnet Popup mit Name, Detail, Koordinaten und "Gast einweisen" + "Bearbeiten" Buttons
- Klick auf POI im rechten Panel soll die Karte zum Marker fliegen und das Popup öffnen

Orientiere dich exakt am Marker-Styling im Prototyp (Klasse .marker-pin mit CSS transform rotate(-45deg), border-radius 50% 50% 50% 0).
```

**Prompt 2: Gästelink-Seite (/r/[code]) funktional machen**
```
Die Gästelink-Seite unter /r/demo zeigt nur "Karte wird geladen..." und bleibt leer. Diese Seite ist ein Kernfeature — Jagdgäste sollen ohne Login eine Karte mit ihrem zugewiesenen Hochsitz sehen.

Implementiere die Gästelink-Seite mit:
1. Grüner Header-Bar mit Reviername
2. Vollbild-Leaflet-Karte mit OSM-Tiles
3. Reviergrenze (Polygon) anzeigen
4. Alle Hochsitze als Marker (oder nur den zugewiesenen, je nach Revier-Einstellung)
5. Parkplatz-Marker
6. Für Demo-Daten: Zeige alle POIs aus den Brockwinkel-Demodaten
7. Die Karte soll sofort laden (kein "wird geladen" Zustand im Demo-Modus)
8. Unten ein Banner: "Navigation starten" Button der Google Maps/Apple Maps öffnet
9. Mobile-optimiert (kein Sidebar, fullscreen Karte)
```

**Prompt 3: Mobile Responsive — Sidebar Collapse**
```
Die Sidebar ist auf mobilen Viewports (390x844) immer sichtbar und nimmt ~60% der Breite ein. Content wird abgeschnitten und ist unbenutzbar.

Implementiere responsive Sidebar:
1. Ab Viewport < 768px: Sidebar standardmäßig ausgeblendet (display: none oder transform: translateX(-100%))
2. Hamburger-Button (drei Striche) oben links in einer mobilen Top-Bar
3. Klick auf Hamburger: Sidebar als Overlay einblenden (z-index über Content)
4. Klick auf Nav-Item: Sidebar schließt automatisch und navigiert
5. Backdrop (halbtransparenter Hintergrund) beim offenen Sidebar
6. Karte soll auf Mobile den vollen Bildschirm einnehmen
7. Rechtes Panel auf Mobile: Unter der Karte als scrollbarer Bereich, nicht daneben
8. Toolbar auf Mobile: Horizontal scrollbar, kleinere Buttons
```

### Priorität 2 — Wichtige Features

**Prompt 4: Share-Modal (WhatsApp-Teilen)**
```
Implementiere das Share-Modal wie im Prototyp (RevierApp_Prototyp_v3.html). Das Modal soll erscheinen bei:
- Klick auf "Revier teilen" in der Toolbar
- Klick auf Share-Icon bei einem POI im rechten Panel
- Klick auf "Einweisen" bei Jagdgästen

Modal-Inhalt:
1. Titel: "Gast einweisen — [POI-Name]"
2. Beschreibungstext
3. Vorschau-Box mit vorgefertigter WhatsApp-Nachricht:
   "[POI-Name]
   Hallo! Morgen Ansitz auf [POI-Name].
   Hier findest du Anfahrt und Karte:
   revierapp.de/r/[revier-slug]/[poi-slug]
   Parkplatz ist markiert. Waidmannsheil!"
4. "Per WhatsApp teilen" Button (grün, #25D366) — öffnet wa.me Link
5. "Link kopieren" Button — kopiert URL in Zwischenablage
6. "Abbrechen" Button

Nutze den shadcn/ui Dialog als Basis, style es aber wie im Prototyp.
```

**Prompt 5: Layer-Switcher reparieren (Luftbild, Flurstücke, Hybrid)**
```
Der Layer-Switcher in der Revierkarten-Toolbar hat 4 Optionen (Karte, Luftbild, Flurstücke, Hybrid), aber beim Umschalten ändert sich die Karte optisch nicht.

Stelle sicher dass die Layer korrekt funktionieren:
1. "Karte": OpenStreetMap Standard-Tiles
2. "Luftbild": Esri World Imagery (https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x})
3. "Flurstücke": OSM + WMS-Overlay von LGLN (https://opendata.lgln.niedersachsen.de/doorman/noauth/alkis_wms, Layer: adv_alkis_flurstuecke)
4. "Hybrid": Luftbild + Flurstücke-WMS-Overlay

Die aktive Option soll visuell hervorgehoben sein (weißer Hintergrund mit Schatten wie im Prototyp).
```

**Prompt 6: RSVP-Formular (/rsvp/[code]) implementieren**
```
Die RSVP-Seite unter /rsvp/demo zeigt nur "RSVP-Formular wird geladen...". Implementiere das RSVP-Formular für Drückjagd-Einladungen.

Für den Demo-Modus:
1. Karte mit Logo und "Drückjagd-Einladung"
2. Event-Details: "Herbstdrückjagd Brockwinkel 2026", Samstag 18.10.2026, 08:00-15:00
3. Formular-Felder:
   - Name (Text)
   - Zusage (Zusagen / Absagen / Vielleicht — Radio-Buttons)
   - Auto 4x4 verfügbar? (Ja/Nein + Anzahl Plätze)
   - Hund? (Ja/Nein + Rasse wenn Ja)
   - Schießnachweis vorhanden? (Ja/Nein + Upload)
   - Übernachtung benötigt? (Ja/Nein)
   - Anmerkungen (Textarea)
4. "Antwort senden" Button
5. Mobile-optimiert, kein Login nötig
```

**Prompt 7: Nachsuche-Seite (/ns/[code]) implementieren**
```
Die Nachsuche-Seite unter /ns/demo zeigt nur "Anschuss-Position und Details werden geladen...". Implementiere die Nachsuchenführer-Seite.

Für den Demo-Modus:
1. Roter Header (bereits vorhanden, passt zum Dringlichkeits-Thema)
2. Karte mit Anschuss-Position als roter Marker
3. Details-Bereich:
   - Wildart: Rehbock
   - Zeitpunkt des Anschusses: 31.03.2026 18:30
   - Beschreibung: "Beschuss auf Rehbock, Flucht Richtung Südost, ca. 80m"
   - Pirschzeichen: "Schweiß auf Schnee, Kugelriss sichtbar"
   - Anschuss-Position: 53.2665, 10.3505 (Marker auf Karte)
   - Anfahrt: Button "Navigation starten"
4. Kontakt-Info des Jägers (Telefon)
5. Fullscreen-Karte mit Anschuss-Marker
6. Mobile-optimiert
```

### Priorität 3 — Verbesserungen

**Prompt 8: Streckenbuch — Status-Badges und Tabellen-Styling**
```
Im Streckenbuch sind kleine Styling-Abweichungen zum Prototyp:

1. "Nachsuche" Status (letzte Zeile): Soll ein orangefarbener Badge/Pill sein (wie "Gemeldet"), nicht nur orangefarbener Text
2. Stat-Cards: Border und leichten Schatten hinzufügen wie im Prototyp (border: 1px solid #e5e5e5, border-radius: 10px)
3. Hover-Effekt auf Tabellenzeilen: Hintergrund leicht grau bei hover (background: #f9f9f9)
4. Tabelle: Volle Breite mit weißem Hintergrund und abgerundeten Ecken (border-radius: 10px, overflow: hidden)
```

**Prompt 9: JES-Verwaltung — Fehlende Aktions-Buttons**
```
In der JES-Tabelle fehlen zwei Buttons die im Prototyp vorhanden sind:

1. Bei F. Schmidt (Status "Läuft ab"): Orange "↻" Button zum Verlängern des JES
   - Klick soll Toast zeigen: "JES verlängert bis 31.03.2027"
2. Bei T. Braun (Kurz-JES): Roter "Entziehen" Button
   - Klick soll Toast zeigen: "JES entzogen — T. Braun hat keinen Zugang mehr"

Füge diese Buttons in die Aktionen-Spalte ein, neben "Link senden" und dem Edit-Pencil.
```

**Prompt 10: Drückjagd — Fehlender "Zeitplan" Button und Emojis**
```
In der Drückjagd-Planung fehlt der "Zeitplan" Button. Im Prototyp gibt es 5 Action-Buttons:
1. "Treiben planen" (mit Karten-Emoji)
2. "Einladungen senden" (mit Brief-Emoji)
3. "Stände zuweisen" (mit Personen-Emoji)
4. "Teilnehmerliste" (mit Listen-Emoji)
5. "Zeitplan" (mit Uhr-Emoji) — FEHLT

Füge den "Zeitplan" Button hinzu und ergänze die Emojis bei allen 5 Buttons wie im Prototyp.
```

**Prompt 11: Jagdgäste — Avatar-Farben differenzieren**
```
Die Avatar-Kreise bei Jagdgästen sind alle gleich gefärbt. Im Prototyp haben sie unterschiedliche Farben:
- Heinrich Weber (HW): Grün (#E8F5E9 / #2D5016)
- Karl Meier (KM): Blau (#E3F2FD / #1565C0)
- Frank Schmidt (FS): Orange (#FFF3E0 / #E65100)

Passe die Avatar-Komponente an, sodass die Farben basierend auf dem Index oder einem Hash des Namens rotieren (grün → blau → orange → grün → ...).
```

**Prompt 12: Kalender — Monatsansicht mit Kalender-Grid**
```
Der Jagdkalender zeigt aktuell nur eine Tabelle. Füge eine Monats-Kalenderansicht hinzu:

1. Oben: Monat/Jahr Anzeige mit Vor/Zurück-Pfeilen
2. Kalender-Grid: 7 Spalten (Mo-So), Wochen als Zeilen
3. Tage mit Terminen: Farbige Dots oder kleine Labels
   - Grün: Ansitz
   - Orange: Drückjagd
4. Klick auf Tag: Zeigt Termine des Tages in einem Detail-Bereich
5. Toggle-Button "Kalender / Liste" um zwischen Kalender-Grid und Tabelle zu wechseln
6. Standardansicht: Kalender-Grid

Die Tabelle soll als alternative "Listen-Ansicht" erhalten bleiben.
```

### Priorität 4 — Polish

**Prompt 13: Toast-Benachrichtigungen**
```
Implementiere Toast-Benachrichtigungen wie im Prototyp:
- Erscheinen am unteren Bildschirmrand, zentriert
- Dunkler Hintergrund (#111), weiße Schrift, abgerundete Ecken
- Slide-in Animation von unten
- Automatisch nach 2.5 Sekunden ausblenden
- Nutze für Demo-Modus:
  - "Strecke melden" → Toast "Strecke-Formular öffnet sich..."
  - "GPX Import" → Toast "GPX / KML Import — Dateiauswahl..."
  - "Link kopieren" → Toast "Link in Zwischenablage kopiert"
  - Hochsitz-Button in Toolbar → Toast "Klicke auf die Karte um einen Hochsitz zu platzieren"
```

**Prompt 14: Content-Views Tabellen-Styling vereinheitlichen**
```
Alle Datentabellen (Strecke, Beobachtungen, Gäste, JES, Drückjagd, Kalender) sollen einheitlich gestyled werden wie im Prototyp:

1. Weißer Hintergrund mit border-radius: 10px und overflow: hidden
2. Border: 1px solid #e5e5e5
3. Spaltenheader: Uppercase, 11px, font-weight 600, Farbe #888, Hintergrund #f9f9f9
4. Zeilen: 13px, Farbe #111, padding 12px 16px
5. Hover: Hintergrund #f9f9f9
6. Letzte Zeile: Kein bottom-border
7. Content-Bereich: Hintergrund #f9f9f9 (leichtes Grau)
```

**Prompt 15: Sidebar Revier-Switcher Dropdown**
```
Der Revier-Switcher am Fuß der Sidebar zeigt "Revier Brockwinkel · Reppenstedt · ~280 ha" mit einem grünen Dot und Chevron. Implementiere ein Dropdown:

1. Klick auf den Revier-Block → Dropdown öffnet sich nach oben
2. Zeigt alle Reviere des Users (Demo: nur "Revier Brockwinkel")
3. "+ Neues Revier anlegen" Option am Ende
4. Aktives Revier mit Checkmark
5. Grüner Dot = Online/Verbunden Indikator
```

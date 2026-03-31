# RevierApp Analyse v2 — 31.03.2026

Automatisierte Analyse aller 14 Seiten bei 1920x1080 (Desktop).
Vergleich mit v1-Analyse und dem Prototyp (`RevierApp_Prototyp_v3.html`).

---

## Seitenübersicht

| # | Seite | URL | HTTP | Status v2 | Status v1 | Veränderung |
|---|-------|-----|------|-----------|-----------|-------------|
| 01 | Startseite | `/` | 200 | Redirect auf Revierkarte | Redirect | Unverändert |
| 02 | Revierkarte | `/revier/demo` | 200 | Voll funktional + Marker | Marker fehlten | **VERBESSERT** |
| 03 | Streckenbuch | `/revier/demo/strecke` | 200 | Funktioniert | Funktioniert | Unverändert |
| 04 | Beobachtungen | `/revier/demo/beobachtungen` | 200 | Funktioniert | Funktioniert | Unverändert |
| 05 | Jagdgäste | `/revier/demo/gaeste` | 200 | Funktioniert | Funktioniert | Unverändert |
| 06 | JES | `/revier/demo/jes` | **500** | **KAPUTT — Server Error** | Funktioniert (200) | **REGRESSION** |
| 07 | Drückjagd | `/revier/demo/drueckjagd` | 200 | Funktioniert + Zeitplan-Button | Zeitplan fehlte | **VERBESSERT** |
| 08 | Kalender | `/revier/demo/kalender` | 200 | Funktioniert | Funktioniert | Unverändert |
| 09 | Einstellungen | `/revier/demo/settings` | 200 | Funktioniert | Funktioniert | Unverändert |
| 10 | Login | `/login` | 200 | Funktioniert | Funktioniert | Unverändert |
| 11 | JES Login | `/jes-login` | 200 | Funktioniert | Funktioniert | Unverändert |
| 12 | Gästelink | `/r/demo` | 200 | **Voll funktional mit Karte** | Nur Ladetext | **VERBESSERT** |
| 13 | RSVP | `/rsvp/demo` | 200 | **Voll funktionales Formular** | Nur Ladetext | **VERBESSERT** |
| 14 | Nachsuche | `/ns/demo` | 200 | **Voll funktional mit Karte** | Nur Ladetext | **VERBESSERT** |

---

## Was ist jetzt BESSER (v1 → v2)

### 1. Karten-Marker auf Revierkarte (war: FEHLEND → jetzt: FUNKTIONIERT)
- **9 Marker** sind jetzt auf der Karte sichtbar (Hochsitze orange, Kanzeln grün, Parkplätze blau)
- Farbige Pin-Marker mit Labels direkt auf der Karte
- **Klick auf Marker öffnet Popup** mit Name, Details, Koordinaten
- Popup hat "Edit" und "Gast einweisen" Buttons
- Reviergrenze (Polygon) weiterhin sichtbar

### 2. Layer-Switcher funktioniert (war: KEIN VISUELLER UNTERSCHIED → jetzt: FUNKTIONIERT)
- **Luftbild** (Esri World Imagery) lädt korrekt — Satellitenansicht sichtbar
- **Flurstücke** zeigt Karte mit WMS-Overlay
- **Hybrid** zeigt Luftbild + Flurstücke-Overlay
- Aktiver Layer ist visuell hervorgehoben (unterstrichen)

### 3. Share-Modal implementiert (war: NICHT VORHANDEN → jetzt: FUNKTIONIERT)
- Modal öffnet sich bei Klick auf "Revier teilen"
- Titel: "Gast einweisen — Revier Brockwinkel"
- Beschreibungstext vorhanden
- Vorschau-Box mit vorgefertigter WhatsApp-Nachricht:
  - "Hallo! Morgen Ansitz auf Revier Brockwinkel."
  - "Hier findest du Anfahrt und Karte:"
  - "revierapp.de/r/brockwinkel/revier-brockwinkel"
  - "Parkplatz ist markiert. Waidmannsheil!"
- **"Per WhatsApp teilen"** Button (grün, WhatsApp-Farbe)
- **"Link kopieren"** Button
- **"Abbrechen"** Button
- Funktioniert exakt wie im Prototyp

### 4. Gästelink-Seite `/r/demo` (war: NUR LADETEXT → jetzt: VOLL FUNKTIONAL)
- Grüner Header-Bar mit Reviername ("Revier Brockwinkel · Reppenstedt · ~280 ha")
- Vollbild-Leaflet-Karte mit OSM-Tiles
- Reviergrenze (Polygon) angezeigt
- **9 Marker** (alle Hochsitze + Parkplätze) sichtbar
- Unten links: Gast-Info-Karte mit Avatar
- Unten rechts: **"Navigation starten"** Button + Leaflet-Attribution
- Kein Sidebar, kein Login — perfekt für Gäste
- Mobile-optimiertes Layout

### 5. RSVP-Formular `/rsvp/demo` (war: NUR LADETEXT → jetzt: VOLL FUNKTIONAL)
- Grüner Header mit Logo und "Drückjagd-Einladung / Du wurdest zur Drückjagd eingeladen"
- Event-Details: "Herbstdrückjagd Brockwinkel 2026", Samstag 18. Oktober 2026, 08:00-15:00
- Ort: Revier Brockwinkel, Reppenstedt
- Formular-Felder komplett:
  - Name (Textfeld)
  - Teilnahme (Zusagen / Absagen / Vielleicht — 3 Buttons)
  - Auto 4x4 verfügbar? (Ja / Nein)
  - Hund dabei? (Ja / Nein)
  - Schießnachweis vorhanden? (Ja / Nein)
  - Übernachtung benötigt? (Ja / Nein)
  - Anmerkungen (Textarea)
- "Antwort senden" Button (dunkelgrün)
- Sauberes, zentriertes Layout

### 6. Nachsuche-Seite `/ns/demo` (war: NUR LADETEXT → jetzt: VOLL FUNKTIONAL)
- **Roter Header** "Nachsuche angefordert" mit Wildart und Zeitpunkt
- Telefon-Button oben rechts (schneller Anruf)
- Leaflet-Karte mit **Anschuss-Marker** (roter Pin) und **rotem gestrichelten Suchradius-Kreis**
- Warnung: "Dringende Nachsuche — Bitte schnellstmöglich zum Anschuss" (rot hinterlegt)
- Detail-Bereich:
  - Wildart: Rehbock
  - Zeitpunkt: 31.03.2026, 18:30
  - Beschreibung: "Beschuss auf Rehbock, Flucht Richtung Südost, ca. 80m"
  - Pirschzeichen: "Schweiß auf Schnee, Kugelriss sichtbar"
  - Anschuss-Position: 53.26650, 10.35050
- Kontakt: Moritz Lampe mit Telefonnummer und "Anrufen" Button
- **Roter Footer-Banner: "Navigation zum Anschuss starten"**
- Hervorragendes Design — dringlicher Charakter gut transportiert

### 7. Drückjagd — Zeitplan-Button hinzugefügt (war: FEHLEND → jetzt: VORHANDEN)
- Alle 5 Action-Buttons jetzt vorhanden: Treiben planen, Einladungen senden, Stände zuweisen, Teilnehmerliste, **Zeitplan**
- Emojis bei allen Buttons vorhanden

---

## Was ist KAPUTT / REGRESSION

### KRITISCH: JES-Seite `/revier/demo/jes` — HTTP 500 Server Error

- **v1:** Funktionierte einwandfrei (200 OK), zeigte Stats-Grid, 4 JES-Einträge, alle Aktions-Buttons
- **v2:** Zeigt Next.js Fehler-Overlay
- **Fehler:** `Event handlers cannot be passed to Client Component props. <button className=... onClick={function onClick} children=...>`
- **Ursache:** Ein Server-Component versucht `onClick`-Handler an einen Button zu übergeben. Die Komponente muss `"use client"` haben oder der Button muss in eine Client-Component ausgelagert werden.
- **Priorität:** HOCH — muss sofort gefixt werden

---

## Was NOCH FEHLT

### Priorität 1 — Kritische Fixes

| # | Problem | Beschreibung | Aufwand |
|---|---------|-------------|---------|
| 1 | **JES 500-Error fixen** | Server Error durch onClick in Server-Component. `"use client"` hinzufügen oder interaktive Buttons auslagern. | Klein |

### Priorität 2 — Mobile Responsive

| # | Problem | Beschreibung | Aufwand |
|---|---------|-------------|---------|
| 2 | **Mobile Sidebar Collapse** | Sidebar ist auf Mobile (390px) weiterhin immer sichtbar, nimmt ~40% der Breite ein. Kein Hamburger-Button. Content wird abgeschnitten. | Mittel |
| 3 | **Mobile Tabellen** | Datentabellen (Strecke, Beobachtungen, etc.) laufen auf Mobile aus dem Viewport. Horizontales Scroll oder Card-Layout nötig. | Mittel |

### Priorität 3 — Styling-Verfeinerungen (Prototyp-Abgleich)

| # | Problem | Beschreibung | Aufwand |
|---|---------|-------------|---------|
| 4 | **Streckenbuch: "Nachsuche"-Badge** | Letzter Eintrag zeigt "Nachsuche" als orangefarbenen Text, nicht als Badge-Pill wie "Gemeldet" | Klein |
| 5 | **Streckenbuch: Stat-Cards Border** | Stat-Karten haben kaum sichtbare Borders — im Prototyp mit Border + leichtem Shadow | Klein |
| 6 | **Streckenbuch: Hover-Effekt** | Keine Hover-Effekte auf Tabellenzeilen | Klein |
| 7 | **Jagdgäste: Avatar-Farben** | Avatare (HW, KM, FS) sind alle gleich grünlich — sollen unterschiedliche Farben haben (grün, blau, orange) | Klein |
| 8 | **JES: Entziehen/Verlängern-Buttons** | Fehlende Aktions-Buttons (orange "Verlängern" bei F. Schmidt, roter "Entziehen" bei T. Braun) — kann erst nach Fix #1 geprüft werden | Klein |
| 9 | **Kalender: Monatsansicht** | Nur Tabellenansicht. Kalender-Grid (Monatsansicht mit farbigen Dots) fehlt. | Mittel |
| 10 | **Tabellen-Styling vereinheitlichen** | Spaltenheader Uppercase 11px, Hover-Effekte, einheitliche Borders, Content-BG #f9f9f9 | Klein |
| 11 | **Sidebar Revier-Switcher Dropdown** | Klick auf Revier-Block öffnet kein Dropdown. "+ Neues Revier" fehlt. | Klein |

### Priorität 4 — Nice-to-Have

| # | Problem | Beschreibung | Aufwand |
|---|---------|-------------|---------|
| 12 | **Share-Modal per POI** | Share-Modal öffnet aktuell nur "Revier Brockwinkel" generisch. Sollte den konkreten POI-Namen zeigen wenn von einem Marker aus geöffnet. | Klein |
| 13 | **Toast-Benachrichtigungen** | Toast-System scheint vorhanden (1 Toast-Element erkannt), aber visuell nicht getestet. | Klein |
| 14 | **Marker-Popup → Panel-Klick** | Klick auf POI im rechten Panel soll Karte zum Marker fliegen + Popup öffnen. Nicht getestet. | Klein |

---

## Gesamtbewertung v2 (vs. v1)

### Funktionalität
**v1: 7/10 → v2: 9/10** (+2)
- 3 komplett neue Seiten funktional (Gästelink, RSVP, Nachsuche)
- Karten-Marker + Layer-Switcher + Share-Modal implementiert
- ABER: JES-Seite hat Regression (500 Error)

### Design-Konsistenz (vs. Prototyp)
**v1: 8/10 → v2: 8.5/10** (+0.5)
- Neue Seiten (RSVP, Nachsuche) sind sauber designed
- Drückjagd jetzt mit allen 5 Buttons + Emojis
- Kleinere Styling-Abweichungen bestehen noch (Badges, Hover, Avatar-Farben)

### Karte (Leaflet)
**v1: 6/10 → v2: 9/10** (+3)
- Alle 9 Marker sichtbar mit farbigen Pins
- Layer-Switcher funktioniert (Luftbild, Flurstücke, Hybrid)
- Marker-Klick → Popup funktioniert
- Reviergrenze korrekt
- Gästelink-Karte und Nachsuche-Karte funktionieren

### Responsive (Mobile)
**v1: 3/10 → v2: 3/10** (unverändert)
- Sidebar ist auf Mobile immer noch sichtbar und blockiert Content
- Kein Hamburger-Button
- Tabellen nicht responsive
- BLEIBT das größte offene Problem

### Gesamtfortschritt
**v1: 6.5/10 → v2: 8/10** (+1.5)

---

## Aktualisierter Prompt-Plan

### Prompt 1: JES-Seite 500-Error fixen (KRITISCH)
```
Die JES-Seite unter /revier/demo/jes wirft einen HTTP 500 Error:
"Event handlers cannot be passed to Client Component props.
<button className=... onClick={function onClick} children=...>"

Das Problem ist, dass onClick-Handler in einer Server-Component verwendet werden.

Finde die JES-Seite-Komponente und:
1. Prüfe ob "use client" am Anfang der Datei steht
2. Falls es eine Server-Component ist: Füge "use client" hinzu ODER
3. Lagere die interaktiven Buttons (mit onClick) in eine separate Client-Component aus
4. Stelle sicher, dass die Seite wieder korrekt rendert wie vor der Regression

Die JES-Seite soll danach wieder anzeigen:
- Stats-Grid: 4 Aktive JES, 1 Läuft bald ab, 18/24 Kontingent, 2 Kurz-JES
- Datentabelle mit 4 JES-Einträgen
- Status-Badges und Aktions-Buttons
```

### Prompt 2: Mobile Responsive — Sidebar Collapse + Tabellen
```
Die App ist auf mobilen Viewports (< 768px) unbenutzbar:
- Sidebar ist immer sichtbar und blockiert ~40% der Breite
- Kein Hamburger-Button vorhanden
- Tabellen laufen aus dem Viewport

Implementiere:
1. Ab < 768px: Sidebar ausgeblendet (transform: translateX(-100%) + transition)
2. Mobile Top-Bar mit Hamburger-Button (drei Striche) links und RevierApp Logo
3. Klick auf Hamburger: Sidebar als Overlay (z-index über Content, halbtransparenter Backdrop)
4. Klick auf Nav-Item oder Backdrop: Sidebar schließt
5. Karte auf Mobile: Voller Bildschirm ohne rechtes Panel
6. Rechtes Panel auf Mobile: Unter der Karte als scrollbarer Bereich
7. Datentabellen: Horizontales Scroll mit overflow-x: auto wrapper
8. Toolbar auf Mobile: Horizontal scrollbar, kompaktere Buttons
```

### Prompt 3: Streckenbuch Styling-Feinschliff
```
Im Streckenbuch sind kleine Abweichungen zum Prototyp:

1. "Nachsuche" Status: Soll ein orangefarbener Badge-Pill sein (wie "Gemeldet"), nicht nur Text
2. Stat-Cards: Border (1px solid #e5e5e5) und leichten Shadow (box-shadow: 0 1px 3px rgba(0,0,0,0.08)) hinzufügen
3. Hover auf Tabellenzeilen: background: #f9faf8
4. Tabellen-Container: Weißer Hintergrund, border-radius: 10px, border: 1px solid #e5e5e5
5. Content-Bereich Hintergrund: #f5f7f3 (leichtes Graugrün)
```

### Prompt 4: Jagdgäste Avatar-Farben + JES Aktions-Buttons
```
Zwei kleine Fixes:

1. Jagdgäste — Avatar-Farben differenzieren:
   - Heinrich Weber (HW): Grün (#E8F5E9 bg / #2D5016 text)
   - Karl Meier (KM): Blau (#E3F2FD bg / #1565C0 text)
   - Frank Schmidt (FS): Orange (#FFF3E0 bg / #E65100 text)
   Rotiere die Farben basierend auf dem Index (0=grün, 1=blau, 2=orange, etc.)

2. JES — Fehlende Aktions-Buttons (nach Fix des 500-Errors):
   - Bei F. Schmidt (Status "Läuft ab"): Orange "↻ Verlängern" Button
   - Bei T. Braun (Kurz-JES): Roter "Entziehen" Button
   - Beide Buttons sollen im Demo-Modus einen Toast zeigen
```

### Prompt 5: Kalender Monatsansicht
```
Der Jagdkalender zeigt nur eine Tabelle. Füge eine Monats-Kalenderansicht hinzu:

1. Toggle-Button "Kalender / Liste" oben rechts neben "Termin anlegen"
2. Kalender-Grid: 7 Spalten (Mo-So), Wochen als Zeilen
3. Monat/Jahr mit Vor/Zurück-Pfeilen
4. Tage mit Terminen: Farbige Dots (Grün = Ansitz, Orange = Drückjagd)
5. Klick auf Tag mit Termin: Detail-Bereich unter dem Kalender
6. Standardansicht: Kalender-Grid
7. Tabelle bleibt als "Listen-Ansicht" erhalten

Nutze keine externe Kalender-Bibliothek, baue ein einfaches Grid mit CSS Grid.
```

### Prompt 6: Tabellen-Styling + Revier-Switcher Dropdown
```
Zwei Styling-Verbesserungen:

1. Einheitliches Tabellen-Styling für ALLE Datentabellen:
   - Container: Weißer BG, border-radius: 10px, border: 1px solid #e5e5e5, overflow: hidden
   - Header: Uppercase, 11px, font-weight 600, Farbe #888, BG #f9f9f9
   - Zeilen: 13px, Farbe #111, padding 12px 16px
   - Hover: BG #f9faf8
   - Content-Area BG: #f5f7f3

2. Sidebar Revier-Switcher Dropdown:
   - Klick auf Revier-Block öffnet Dropdown nach oben
   - Zeigt "Revier Brockwinkel" mit Checkmark
   - "+ Neues Revier anlegen" Option
   - Grüner Dot = Online-Indikator
```

---

## Zusammenfassung

**Massiver Fortschritt seit v1.** Die drei kritischsten Lücken (Gästelink, RSVP, Nachsuche) sind vollständig implementiert. Die Revierkarte hat jetzt Marker, funktionierende Layer und ein Share-Modal. Der Drückjagd-Zeitplan-Button wurde ergänzt.

**Einzige Regression:** JES-Seite hat einen 500-Error (einfacher Fix: "use client" Directive).

**Größtes verbleibendes Problem:** Mobile Responsive (Sidebar Collapse) — betrifft die gesamte App.

**Verbleibende Prompts: 6** (statt vorher 15), davon 1 kritisch, 1 wichtig, 4 Styling/Polish.

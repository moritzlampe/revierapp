# Design-Brief: Strecke-Tab Redesign (QuickHunt)

**Projekt:** QuickHunt — Jagdkoordinations-PWA für den deutschsprachigen Markt
**Scope:** Strecke-Tab innerhalb einer laufenden oder abgeschlossenen Jagd
**Sprint-Referenz (intern):** 58.1h
**Status heute:** Funktional, aber rein datenabbildend — keine visuelle Hierarchie, keine Aggregation, keine jagdliche Sprache

---

## 1. Kontext

**Nutzerrollen im Screen:**
- **Jagdleiter** — sieht alles, inklusive laufender Nachsuchen
- **Schütze** — sieht die Gesamt-Strecke plus eigene laufende Nachsuchen
- **Hundeführer** — sieht zusätzlich Nachsuchen, denen er zugewiesen ist
- **Gast / andere Schützen** — sehen nur die offizielle Strecke

**Nutzungssituation:** Mobile, draußen, oft bei Tageslicht/Dämmerung, teils mit Handschuhen, teils in stressigen Momenten (nach Schuss). Dark Mode ist Pflicht, Touch-Targets müssen großzügig sein.

**Datenbasis:** Das heutige System basiert auf:
- `kills`-Tabelle (Wildart, Alter, Geschlecht, Schütze, Zeit, Position, Foto, Status, Notiz)
- `hunt_participants` für Rollen-Zuordnung
- `profiles` für Namen/Avatare

---

## 2. Das Problem mit dem aktuellen Screen

Der heutige Strecke-Tab zeigt jeden Kill als identisches Rechteck mit technischem Header (E-Mail-Adresse statt Name, nackter Zeitstempel, keine Wildart-Ikonographie). Bei drei Kills um 16:19 stehen drei identische Header untereinander. Es gibt:

- **Keine Übersicht**, was eigentlich gelegt wurde
- **Keine Aggregation** bei Mehrfachabschüssen (3× Frischling = 3 lange Karten)
- **Keine jagdliche Sprache** (Wildart-Emojis fehlen, obwohl sie im Kill-Picker zentrales Element sind)
- **Keine Trennung** zwischen offizieller Strecke und laufenden Nachsuchen
- **Keinen visuellen Anker** — alles ist gleich gewichtet, flach, ohne Hierarchie

Das Ziel ist ein Screen, bei dem ein Jäger sofort denkt *"Okay, DAS war die Jagd"* — idealerweise so geil, dass er den Screenshot freiwillig in der WhatsApp-Gruppe teilt (Viral-Loop).

---

## 3. Das Zielbild

Der Screen gliedert sich in **drei vertikal gestapelte Bereiche**:

### Bereich A — Hero-Bilanz (oben, für alle sichtbar)

**Was:** Sofort scanbare Gesamt-Zusammenfassung der Jagd.

**Inhalt:**
- Gesamt-Count groß und prominent ("4 Stücke")
- Wildart-Aggregat nach **jagdlicher Streckenlegungs-Konvention**, Reihenfolge von oben nach unten: Rotwild → Damwild → Schwarzwild → Rehwild → Raubwild → sonstiges
- Pro Wildart-Gruppe eine Zeile mit: Emoji + Name + Count-Badge
- Zeilen sind **aufklappbar** (siehe Bereich B)

**Optischer Ankerpunkt:** Dieser Bereich soll das "Wow"-Element sein. Eine schöne typografische Hierarchie, viel Weißraum (bzw. Schwarzraum im Dark Mode), saubere Icon-Reihe. Wie ein Dashboard, nicht wie eine Liste.

**Beispiel (textuell):**
```
4 Stücke
─────────────────────
🐗 Schwarzwild      3  ›
🦌 Rehwild          1  ›
```

### Bereich B — Chronologische Detail-Liste (darunter, aufklappbar)

**Was:** Chronologischer Ablauf der Jagd als Protokoll, **älteste Kills zuerst** (damit der Jäger den Tagesverlauf rekonstruieren kann — wie ein Logbuch).

**Logik:**
- Wenn der Nutzer eine Wildart-Zeile in Bereich A antippt, klappt darunter die chronologische Liste **nur dieser Wildart** auf
- Alternativ: Alle Wildarten können gleichzeitig expandiert sein; Default-Zustand ist allerdings "collapsed" (weil der Hero-Blick wichtiger ist)

**Einzelkill-Zeile enthält:**
- Zeitstempel (kompakt, z.B. "16:19")
- Altersklasse + Geschlecht ("Bache ♀", "Keiler ♂", "Frischling")
- Schützen-Name (Vorname ausreichend, nicht E-Mail) + kleiner Avatar (falls vorhanden)
- Wenn Foto: kleines Thumbnail rechts
- Bei Mehrfachabschüssen durch einen Schützen innerhalb einer Minute: Zeilen stapeln (WhatsApp-Stacking-Pattern), Zeit + Name nur bei erster Zeile der Gruppe

**Zeit-Gruppierung:**
Wenn mehrere Kills in derselben Minute stehen, sollen sie visuell zu einem Cluster zusammengefasst werden — z.B. durch Sticky-Zeitlabel oder subtile visuelle Klammer.

### Bereich C — Offene Nachsuchen (nur Jagdleiter/Schütze/Hundeführer)

**Was:** Visuell klar abgetrennter Bereich für Kills mit Status `wounded`. Diese zählen **jagdrechtlich nicht zur Strecke**, bis sie gefunden sind.

**Inhalt:**
- Überschrift mit rotem Akzent ("🔴 Offene Nachsuchen · 2")
- Eigene Karten pro wounded Kill mit: Zeit, Schütze, Wildart, ggf. Anschuss-Position, Icon zur Nachsuche
- Tap auf Karte → öffnet Detail-Sheet mit Aktionen "Als erlegt markieren" / "Als verloren markieren"

**Wichtig:**
- Dieser Bereich ist **für Gäste unsichtbar** (Rendering-Bedingung je nach Rolle)
- Der Strecke-Count in Bereich A ignoriert diese Kills komplett (erst beim Übergang zu `harvested` wird der Count erhöht)
- Visuelle Trennung vom offiziellen Strecke-Bereich muss klar sein: Farbakzent (Rot/Orange), vielleicht ein dezenter Divider mit Label

---

## 4. Detail-Ansicht beim Tap

### Im Strecke-Tab: Bottom-Sheet

Tap auf eine Einzelkill-Zeile in Bereich B (oder auf eine Karte in Bereich C) öffnet ein **Bottom-Sheet**, das von unten hochfährt. Das Sheet darf maximal 85 % der Viewport-Höhe einnehmen, die Strecke-Liste im Hintergrund bleibt sichtbar.

**Inhalt des Sheets (in dieser Reihenfolge):**
- Hero: Foto wenn vorhanden, sonst großes Wildart-Emoji auf getöntem Background
- Wildart + Altersklasse + Geschlecht als Titel
- Meta-Reihe: Zeit · Schütze · Gewicht (falls erfasst) · Distanz (falls erfasst)
- Mini-Map mit Kill-Position (wenn GPS vorhanden)
- Notiz-Bereich (inline editierbar, wenn User = Schütze oder Jagdleiter)
- Wetter-Snapshot wenn vorhanden (Temperatur, Kondition)
- Aktionsleiste unten: "Teilen" (Streckenkarte), "Bearbeiten", "Löschen" (nur für Schütze/Jagdleiter)

### Konsistenz mit Jagdtagebuch (Sprint 60, später)

Im späteren Jagdtagebuch unter "Du"-Tab wird derselbe Kill als **eigene Route** (Page mit URL) dargestellt — wegen Shareability via Link und Push-Deep-Links.

**Anforderung an Claude Design:**
Der Sheet-Inhalt soll als separate wiederverwendbare Komponente modelliert werden (Platzhalter-Name: `KillDetailContent`). Die Hülle wechselt je nach Kontext (BottomSheet hier, Page im Jagdtagebuch), der Inhalt ist identisch.

---

## 5. Ausgeschlossen aus diesem Brief (Scope-Grenzen)

Nicht Teil dieses Designs:
- Der Nachsuche-Workflow selbst (existiert als eigener Tab in der App)
- Der Hunt-Header oben (Back-Pfeil, Hunt-Titel, Tab-Bar) — wird so wie heute belassen
- Die Bottom-Navigation (Jagd / Erlegung / Chat / Du)
- Chat- und Karten-Tabs der Jagd
- Streckenkarten-Generator (existiert bereits, wird vom Teilen-Button aufgerufen)
- Foto-Upload-Flow (existiert bereits über PhotoCapture-Komponente)

---

## 6. Screen-States, die designt werden sollen

Bitte generiere den Screen in diesen Zuständen:

1. **Empty State** — Jagd läuft, noch keine Kills. "Noch keine Strecke" + dezenter Hinweis
2. **Ein Kill** — eine Wildart, eine Zeile in Hero, eine Zeile in Liste (expanded default?)
3. **Typische Ansitzjagd** — 2-3 Kills, gemischt Schwarz- und Rehwild
4. **Gesellschaftsjagd / Drückjagd** — 10+ Kills, mehrere Schützen, verschiedene Wildarten (hier wird das Aggregations-Pattern richtig wichtig)
5. **Mit offenen Nachsuchen** — 4 Kills erlegt + 2 wounded (Bereich C sichtbar, Jagdleiter-Perspektive)
6. **Gast-Perspektive derselben Jagd** — identisch zu #5, aber Bereich C ausgeblendet, Count bleibt 4
7. **Bottom-Sheet geöffnet** — auf einen Kill getippt, Sheet überlagert die Liste

---

## 7. Design-System-Hooks

**Bitte beim Onboarding die QuickHunt-Codebase lesen.** Alle Farben, Typografie und Komponenten kommen aus dem bestehenden System. Wichtige Leitplanken:

- **Dark Theme only** — hellgrüner Akzent (`--green`), Surface-Schwarz-Töne
- **`rem`-basiert**, nicht `px` — muss iOS-Schriftgröße respektieren
- **Touch-Targets min. 44×44pt**
- **CSS-Variablen statt Tailwind-Farbklassen**
- **Jagdliche Ästhetik** — ruhig, ernsthaft, nicht verspielt; kein Gamification-Look; eher Strava/Linear als TikTok
- **Wildart-Emojis** sind etabliertes Designelement aus dem Erlegung-Picker und sollten hier konsistent eingesetzt werden

---

## 8. Visuelle Referenzen

Gute Orientierungspunkte für das Gesamt-Gefühl:
- **WhatsApp-Chat-Stacking** — wie mehrere Nachrichten desselben Senders kompakter werden
- **Strava-Activity-Summary** — wie Zahlen und Stats prominent inszeniert werden
- **Linear-Issue-List** — wie dichte Information trotzdem ruhig und lesbar bleibt
- **Apple Fitness Activity Rings-Ästhetik** — Klarheit + Reduktion + Premium-Feel

Nicht erwünscht:
- Bunte Gamification (Abzeichen, Konfetti, Progress-Bars überall)
- Verspielte Illustrationen
- Helle Backgrounds
- Pinterest-artige Foto-Overload

---

## 9. Deliverables

Bitte produziere:

1. **Interaktiver Prototyp** als klickbares Mobile-Mockup (iPhone-Größe, ca. 390×844)
2. **Alle Screen-States** aus Abschnitt 6 einzeln abrufbar
3. **Komponentenliste** der wiederverwendbaren Elemente (insbesondere `KillDetailContent` für Cross-Kontext-Nutzung)
4. **Kurz-Export-Option** zu Claude Code für die Implementierung

---

## 10. Was NICHT im Brief steht, aber eure Aufmerksamkeit verdient

- **Micro-Interactions**: Wie fühlt sich das Aufklappen einer Wildart-Zeile an? Springt das Sheet mit Gummi-Effekt hoch? Ein bisschen Liebe hier macht den Screen premium.
- **Zeit-Gruppierung**: Wenn drei Kills in einer Minute passieren, ist das fast immer eine Rotte — das ist eine jagdliche Geschichte, die visuell erzählt werden kann.
- **Hero-Kill-Moment**: Gibt es innerhalb der Liste ein Stück, das besonders heraussticht? (Kapitaler Keiler, erstes Stück eines Jungjägers?) Wenn ja, kann das optisch betont werden.

Überraschungs-Details in dieser Richtung sind willkommen, solange sie das Jagd-Ethos nicht verletzen (keine "High-Five"-Animationen, keine Score-Sounds).

---

*Dokument erstellt für QuickHunt / RevierApp, Sprint 58.1h, April 2026.*

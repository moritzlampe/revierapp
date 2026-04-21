# Handoff-Paket — Sprint 58.1h

**Scope:** Systemweiter Theme-A-Rollout + Strecke-Tab-Neubau
**Branch:** `feature/theme-a-rollout`
**Sicherheits-Tag:** `pre-theme-rebuild-2026-04-20` (auf main)
**Erstellt:** 20.04.2026

---

## Artefakte für Claude Code

Diese Dateien müssen im Projekt-Kontext liegen **bevor** der erste Sprint-Prompt abgesendet wird:

| Datei | Zweck |
|-------|-------|
| `design-system.md` | **Single Source of Truth** — alle Tokens, Komponenten-Specs, Regeln |
| `Claude_Design_Brief_Strecke_Tab.md` | Ursprünglicher Brief, Scope-Grenzen |
| `RevierApp_Uebergabe_Session_18042026_Nacht.md` | Letzte Übergabe, aktueller Projekt-Stand |
| Wireframe-PDF V3 (final) | IA-Struktur-Referenz für Strecke-Tab |

Alle vier müssen im Claude-Code-Chat als Anhang verfügbar sein oder im Projekt-Knowledge liegen.

---

## Übersicht der Sub-Sprints

| Sprint | Inhalt | Dauer (geschätzt) | STOP-Test |
|--------|--------|-------------------|-----------|
| **58.1h.a** | Recon (KEIN CODE) | 1 Durchlauf | Bericht-Review mit Moritz |
| **58.1h.b** | Token-Foundation systemweit (CSS-Variablen) | 1 Tag | Bestehende Screens noch dark aber theme-fähig |
| **58.1h.c** | Theme-Switch live (Theme A aktivieren) | 0.5 Tag | Alle Screens "Moos auf Papier" sichtbar |
| **58.1h.d** | Strecke-Tab Structural Rebuild | 1-2 Tage | iPhone-Test aller Strecke-States |
| **58.1h.e** | Visual Polish + Custom-Icons + Outdoor-Test | 1 Tag | Outdoor-Test-Protokoll |

Gesamt-Schätzung: 4-5 Arbeitstage. Kann länger werden abhängig von der Menge hartgecodeter Farben in der Codebase (Recon-Ergebnis).

---

## WICHTIGE VORAB-REGELN FÜR ALLE SUB-SPRINTS

**1. Arbeiten auf Feature-Branch:**
Alle Arbeit passiert auf `feature/theme-a-rollout`. NIE direkt auf `main` pushen. Bei Gerätewechsel: push auf altem Gerät, pull auf neuem Gerät, auf Branch bleiben.

**2. Commit-Disziplin:**
Nach jeder Implementation: `git add -A && git commit -m "..." && git push origin feature/theme-a-rollout`. Nicht auf main.

**3. Coolify-Autodeploy:**
Der Feature-Branch wird NICHT automatisch deployt. Falls manueller Test auf Produktions-URL nötig: erst mit Moritz absprechen.

**4. Pre-Test-Push-Check:**
Vor jedem iPhone-Test: `git log --oneline origin/feature/theme-a-rollout..HEAD` — Output muss leer sein.

**5. Recon vor Implementation:**
Jeder Sprint beginnt mit einem Erkundungs-Schritt (Bericht-Datei). Kein Code bevor Recon mit Moritz reviewed ist.

**6. Migrations:**
Falls neue Migrations nötig (z.B. user_settings für Theme-Toggle): vor jedem Migrations-Schritt `ls supabase/migrations/` ausführen zur Nummern-Verifikation. Manuell im Supabase SQL-Editor ausführen, dann Code pushen.

**7. Kein Scope-Creep:**
Bleib strikt beim Sprint-Inhalt. Wenn unterwegs Bugs oder Ideen auftauchen, die nicht zum aktuellen Sprint gehören: in `BERICHT_58_1h_followups.md` notieren, nicht sofort fixen.

---

## SPRINT 58.1h.a — RECON

### Prompt für Claude Code

```
Hi Claude, wir starten Sprint 58.1h — den systemweiten Theme-A-Rollout
plus Strecke-Tab-Neubau. Dieser Sprint ist die Recon-Phase. KEIN CODE
schreiben, nur erkunden und Bericht erstellen.

Branch: feature/theme-a-rollout (schon aktiv, bitte nicht wechseln)

Lies zuerst diese drei Dokumente aus dem Projekt-Kontext:
1. design-system.md — vollständige Token-Definition für Theme A
2. Claude_Design_Brief_Strecke_Tab.md — ursprünglicher UX-Brief
3. RevierApp_Uebergabe_Session_18042026_Nacht.md — letzter Projekt-Stand

═══════════════════════════════════════════════════
AUFGABE
═══════════════════════════════════════════════════

Erstelle einen detaillierten Recon-Bericht unter
`docs/recon/BERICHT_58_1h_a_Strecke_und_Theme_Recon.md`
(Pfad ist in .gitignore, wird nicht committed — richtig so).

Der Bericht muss folgende Fragen beantworten:

═══════════════════════════════════════════════════
TEIL 1 — Aktueller Theme-Zustand
═══════════════════════════════════════════════════

1.1 Wie ist app/globals.css aktuell aufgebaut?
    - Welche CSS-Variablen existieren bereits?
    - Welche Farbwerte sind hartgecodet vs. variabel?
    - Wie ist das Dark-Theme heute strukturell gelöst?

1.2 Wildwuchs-Inventur:
    - Suche in der gesamten src/ und app/ nach hartgecodeten Farbwerten
      (Hex-Codes wie #..., RGB-Werte, Tailwind-Farbklassen bg-gray-800 etc.)
    - Tabellarische Auflistung: Datei, Zeile, Wert, Kontext
    - Grobe Zählung: wie viele Stellen müssen beim Theme-Rollout angefasst werden?

1.3 Typografie:
    - Wie ist aktuell die Font-Definition (system font? custom font?)
    - Welche Größen sind in Nutzung? hartgecodet vs. variabel?

1.4 Spacing:
    - rem vs. px Nutzung in der Codebase
    - Gibt es schon ein Spacing-Token-System?

═══════════════════════════════════════════════════
TEIL 2 — Strecke-Tab Ist-Zustand
═══════════════════════════════════════════════════

2.1 Wo ist der aktuelle Strecke-Tab?
    - Datei-Pfad der Haupt-Komponente (vermutlich
      src/components/hunt/HuntStreckeTab.tsx oder ähnlich)
    - Wie wird er in der Hunt-Detail-Struktur eingebunden?

2.2 Aktuelle Daten-Flow:
    - Wie werden Kills geladen? (Query, Realtime-Subscription, Hook)
    - Welche Felder werden aktuell gerendert?
    - Welche sind im Schema, werden aber nicht angezeigt?

2.3 Wie sieht die aktuelle UI-Struktur aus?
    - Gibt es schon Batch-Card-ähnliche Konstrukte?
    - Wie wird zwischen "eigen" und "fremd" unterschieden?
    - Wo wird die E-Mail-Adresse statt Namen gerendert? (bekanntes Problem)
    - Gibt es schon Foto-Thumbnails in der Liste?

2.4 Nachsuche-Bereich:
    - Existiert bereits eine visuelle Trennung zu "normal erlegt"?
    - Wie wird kills.status (wounded/harvested) aktuell verarbeitet?

═══════════════════════════════════════════════════
TEIL 3 — Wiederverwendbare Patterns
═══════════════════════════════════════════════════

3.1 ChatPanel.tsx — welche Patterns können wir für Batch-Cards
    recyceln? (Avatar-Kreise, Grouping-Logik, Stacking)

3.2 ObjektDetailSheet.tsx — Bottom-Sheet-Pattern, das wir für
    Kill-Detail-Sheet nachbauen können. Struktur dokumentieren.

3.3 Bottom-Navigation — wie ist sie aufgebaut, wo werden
    aktive/inaktive Styles gesetzt?

3.4 Filter-Pill-Patterns — existieren sie schon irgendwo
    (z.B. im Chat-Tab)? Wenn ja: wiederverwendbar oder neu?

═══════════════════════════════════════════════════
TEIL 4 — Migrations-Stand
═══════════════════════════════════════════════════

4.1 ls supabase/migrations/ — aktueller Migrations-Stand
4.2 Gibt es user_settings bereits als Tabelle? (Sprint 60 hatte das
    geplant, vielleicht schon existent)
4.3 Welche Felder hat kills aktuell wirklich?

═══════════════════════════════════════════════════
TEIL 5 — Risiko-Einschätzung
═══════════════════════════════════════════════════

Basierend auf den Befunden: wie groß ist der Theme-Rollout-Umfang?

- Anzahl Dateien die angefasst werden müssen
- Komplexitäts-Hotspots (wo sind die meisten hartgecodeten Farben?)
- Potenzielle Breaking-Points (Komponenten die ohne Variablen gebaut
  sind und komplett refactored werden müssen)
- Geschätzte Dauer für Sprint 58.1h.b (Token-Foundation)

═══════════════════════════════════════════════════
OUTPUT
═══════════════════════════════════════════════════

Markdown-Bericht unter docs/recon/BERICHT_58_1h_a_Strecke_und_Theme_Recon.md.
Strukturiert nach den 5 Teilen oben. Tabellen wo sinnvoll.
Konkrete Datei-Pfade + Zeilennummern bei Befunden.

NICHTS VERÄNDERN, NUR LESEN UND DOKUMENTIEREN.
Kein Commit, kein Push.

Sag "Recon fertig, Bericht liegt unter docs/recon/..." wenn du durch bist.
```

### Was du danach tust

Bericht öffnen, lesen, mit mir hier besprechen. Wir entscheiden zusammen:
- Ist Sprint 58.1h.b handhabbar oder zu groß?
- Müssen wir den Scope reduzieren?
- Gibt es Überraschungen die wir einplanen müssen?

---

## SPRINT 58.1h.b — TOKEN-FOUNDATION

### Prompt für Claude Code

```
Sprint 58.1h.b startet. Basis: Recon-Bericht von 58.1h.a.

Ziel: globals.css komplett umbauen mit Theme-A-Tokens aus design-system.md,
UND alle hartgecodeten Farbwerte in der Codebase durch CSS-Variablen
ersetzen. Aber: das AKTUELLE Dark-Theme soll visuell noch erhalten bleiben.

Dieser Sprint ändert die Codebase-Architektur, NICHT die Optik.

═══════════════════════════════════════════════════
VORGEHEN
═══════════════════════════════════════════════════

Schritt 1 — Dual-Theme-Architektur in globals.css:

Baue das Token-System als zwei parallele Sets auf:

:root {
  /* Theme A — "Moos auf Papier" (Tag) */
  --theme-a-bg-base: #E7DDC7;
  --theme-a-bg-elevated: #D8D2BE;
  /* ... alle Tokens aus design-system.md */

  /* Theme C — "Waldboden-Dunkel" (Nacht, später) */
  --theme-c-bg-base: #2D3A28;
  --theme-c-bg-elevated: #3A4530;
  /* ... Mapping aus design-system.md Abschnitt 10 */

  /* Legacy — aktuelle Dark-Werte, damit die App bei Sprint-Ende
     noch aussieht wie vorher */
  --legacy-bg: #...; /* aus Recon-Bericht */
  --legacy-surface: #...;
  /* alle aktuellen Dark-Werte die wir heute verwenden */

  /* Active Tokens — zeigen aktuell auf Legacy, später auf Theme A */
  --bg-base: var(--legacy-bg);
  --bg-elevated: var(--legacy-surface);
  /* ... */
}

Schritt 2 — Systematisches Refactoring:

Alle im Recon-Bericht identifizierten hartgecodeten Farben durch
--active-Tokens ersetzen. Wichtig: die --active-Tokens zeigen in diesem
Sprint STILL auf die Legacy-Dark-Werte. Visuell soll sich nichts ändern.

Schritt 3 — Avatar-Color-Utility:

Erstelle src/lib/avatar-color.ts mit der djb2-Hash-Funktion aus
design-system.md Abschnitt 9.2. Palette als Konstanten definiert.
Exportiert getAvatarColor(input: string): string.

Aber: diesen Utility in bestehende Avatar-Rendering-Komponenten
NOCH NICHT einbauen — das machen wir in Sprint 58.1h.c wenn wir das
Theme aktiv schalten.

Schritt 4 — Typografie-Tokens:

Falls im Recon festgestellt wurde dass Typo noch nicht tokenized ist:
Typo-Skala aus design-system.md Abschnitt 3.1 als CSS-Variablen anlegen.
Bestehende Components referenzieren lassen.

═══════════════════════════════════════════════════
TESTS NACH DEM SPRINT
═══════════════════════════════════════════════════

npm run build — muss ohne Fehler durchlaufen.
Alle bestehenden Screens am iPhone testen — sollten visuell identisch
zum Vor-Sprint-Zustand aussehen.

Falls irgendwo eine Farbe sich geändert hat: Bug, zurück zu Legacy.

═══════════════════════════════════════════════════
OUTPUT
═══════════════════════════════════════════════════

Git-Commits in Etappen:
1. "feat: dual-theme token architecture in globals.css"
2. "refactor: replace hardcoded colors with CSS variables"
3. "feat: avatar color utility with djb2 hash"

Push auf origin/feature/theme-a-rollout.

Danach STOP. Sag "Sprint 58.1h.b abgeschlossen. Build grün, visuell
unverändert. Ready für Sprint 58.1h.c (Theme aktiv schalten)."
```

### Was du danach tust

- iPhone-Test aller Screens: Startseite, Jagd-Detail, Chat, Karte, Du-Tab, Hunt-Creation
- Falls irgendwo eine Farbe anders ist: Claude Code fixt es
- Erst wenn alles unverändert aussieht: grünes Licht für Sprint c

---

## SPRINT 58.1h.c — THEME-SWITCH LIVE

### Prompt für Claude Code

```
Sprint 58.1h.c. Ziel: Theme A aktiv schalten, die App sieht danach
überall "Moos auf Papier" aus.

═══════════════════════════════════════════════════
VORGEHEN
═══════════════════════════════════════════════════

Schritt 1 — Active-Token-Umschaltung in globals.css:

Die --active-Tokens, die in Sprint 58.1h.b auf Legacy-Dark zeigten,
jetzt auf Theme A umschalten:

:root {
  --bg-base: var(--theme-a-bg-base);
  --bg-elevated: var(--theme-a-bg-elevated);
  --text-primary: var(--theme-a-text-primary);
  /* alle Tokens */
}

Schritt 2 — Avatar-Utility aktiv schalten:

Überall wo Avatare gerendert werden (ChatPanel, Du-Tab, Hunt-Teilnehmer-
Listen, Chat-Liste): die bisherige Avatar-Farb-Logik durch
getAvatarColor(userId) aus src/lib/avatar-color.ts ersetzen.

Schritt 3 — Globales QA:

Alle Screens durchgehen und prüfen:
- Gibt es irgendwo noch hartgecodete Farben die wir im Recon übersehen
  haben? Wenn ja: jetzt nachziehen.
- Kontrast-Checks bei Text-auf-Surface-Kombinationen
- Sind die Marker auf der Karte noch sichtbar? (BKG TopPlusOpen ist
  beige — die Marker müssen darauf gut funktionieren)
- Chat-Bubbles: funktionieren Eigen vs. Fremd visuell noch?
- Bottom-Navigation: aktiv vs. inaktiv klar erkennbar?
- Safe-Area-Padding an iPhone-Home-Indicator — keine Farb-Brüche?

Schritt 4 — Bekannte kritische Stellen:

Aus design-system.md Abschnitt 11:
- --accent-primary #4A5A2A ist NIE als Textfarbe auf getönten Surfaces.
  Prüfe alle Stellen wo Primary als Text verwendet wird.
- --text-muted ist NUR für disabled/dekorative Elemente.
  Prüfe ob alle informativen 12px-Labels --text-secondary verwenden.

═══════════════════════════════════════════════════
TESTS NACH DEM SPRINT
═══════════════════════════════════════════════════

npm run build — ohne Fehler.
Komplette App am iPhone durchklicken — alles "Moos auf Papier".
Outdoor-Test erste Runde: bei Tageslicht ein paar Screens anschauen,
erste Lesbarkeit prüfen.

═══════════════════════════════════════════════════
OUTPUT
═══════════════════════════════════════════════════

Git-Commits:
1. "feat: activate theme A (Moos auf Papier)"
2. "refactor: avatar color utility applied globally"
3. "fix: remaining hardcoded colors after theme activation"

Push. Danach STOP. Sag "Sprint 58.1h.c abgeschlossen. Theme A überall
aktiv. Bereit für Strecke-Tab-Rebuild."

Screenshots der Haupt-Screens wären hilfreich für Moritz-Review.
```

### Was du danach tust

- Screenshots von Claude Code anschauen
- Selbst am iPhone durchklicken
- Falls irgendwo was nicht sitzt: zurück zu Claude Code mit konkreten Fotos
- Wenn's passt: weiter zu Sprint d

---

## SPRINT 58.1h.d — STRECKE-TAB STRUCTURAL REBUILD

### Prompt für Claude Code

```
Sprint 58.1h.d. Der große Strecke-Tab-Rebuild. Alles was design-system.md
und der Brief definieren.

Basis-Dokumente:
- design-system.md (Komponenten-Specs in Abschnitt 5)
- Claude_Design_Brief_Strecke_Tab.md (IA-Entscheidungen)
- Wireframe-PDF V3 (Referenz für States)

═══════════════════════════════════════════════════
SCOPE
═══════════════════════════════════════════════════

Kompletter Neubau der Strecke-Tab-UI. Die bisherige Struktur
(HuntStreckeTab.tsx und evtl. StreckePhotoSheet.tsx) wird ersetzt.

Was gebaut wird:

1. Hero-Bereich adaptiv:
   - ≤4 Kills gesamt: Compact-Hero (einzeilige Summary-Bar)
   - ≥5 Kills: Full-Hero mit Display-Zahl + Species-Aggregat
   - Wildart-Reihenfolge: Rotwild → Damwild → Schwarzwild → Rehwild
     → Raubwild → Sonstiges (jagdliche Streckenlegungs-Konvention)
   - Chevron auf Wildart-Zeilen NUR wenn ≥5 Kills dieser Art
   - Nachsuche-Warnzeile "⚠ N in Nachsuche" als dezenter roter Streifen
     unter dem Hero, nur für Jagdleiter/Schütze/Hundeführer sichtbar

2. Filter-Pill-Leiste:
   - Drei Pills: Alle (N) · Eigene (N) · Nachsuche (N)
   - Wildart-Pills dynamisch aus Hero-Aggregat
   - Pills funktionieren als Filter auf die chronologische Liste
   - Rechts abgesetzt durch Trennstrich: Foto-Button 📷
   - Filter "Nachsuche": blendet andere Kills aus, zeigt nur Nachsuche-
     Sektion — Hero-Warnzeile wird dann ausgeblendet (redundant)

3. Chronologische Batch-Liste:
   - Älteste Kills zuerst (Tagesablauf-Rekonstruktion)
   - Batch-Card: Avatar + Name + Zeit + Kill-Count
   - DU-Badge rechts neben Namen wenn es der eigene User ist
   - Sub-Items: Species-Icon (SVG) + Wildart + Details (Alter, Geschlecht,
     ggf. Gewicht)
   - Foto-Indicator: kleines 📷-Icon rechts im Sub-Item wenn Foto vorhanden
   - Nachsuche-Badge am einzelnen Kill wenn kills.status = 'wounded'
   - Rotten-Stacking: Kills gleicher Minute gleichen Schützen als
     visuelle Gruppe mit vertikaler Klammer links (Variante A aus
     Wireframe-Empfehlung war das Bracket-Pattern — oder das was besser
     passt, wir haben uns auf Bracket festgelegt)
   - Label "Rotte · N× in derselben Minute" unter der Gruppe

4. Nachsuche-Sektion (nur für Jagdleiter/Schütze/Hundeführer):
   - Eigener Abschnitt nach der chronologischen Liste
   - Rote Überschrift "⚠ IN NACHSUCHE · N"
   - Karten mit rotem Rahmen-Akzent
   - Pro Nachsuche: Wildart + Status ("krank") + Schütze + Dauer +
     Anschuss-Position
   - Tap → öffnet Kill-Detail-Sheet mit Aktionen
     "Als erlegt markieren" / "Als verloren markieren"

5. Mood-Foto-Chip am Listen-Ende:
   - Dezenter Chip: "🌅 N Stimmungsfotos ›"
   - Tap → öffnet Hunt-Photo-Gallery Sheet (separat, noch nicht bauen —
     nur Placeholder)

6. Empty-States (drei Varianten je nach Rolle):
   - Jagdleiter: "Noch keine Strecke" + ermutigender Subtext + CTA
     "Erstes Stück melden"
   - Schütze: "Noch nichts gemeldet" + Subtext zu Team-Feed + CTA
     "Stück melden"
   - Gast: "Noch keine Strecke" + "Die Jagd läuft. Gemeldete Stücke
     erscheinen hier automatisch." — KEIN CTA
   - Mit dezenter Line-Art-Illustration (Geweih + Kopf)

7. Foto-Button und Foto-Ziel-Flow:
   - Tap auf 📷-Button öffnet Bottom-Sheet mit drei Zielen:
     * "🎯 Streckenfoto" (hängt an Hunt)
     * "🌅 Jagd-Stimmung" (hängt an Hunt)
     * "🦌 Zu einer Erlegung" (öffnet Kill-Auswahl)
   - Bei "Zu einer Erlegung": zweites Sheet mit filterbarer Kill-Liste,
     Default "Meine (N)", Toggle "Alle anzeigen"
   - Upload via bestehender upload-batch.ts oder Pattern daraus

8. Kill-Detail-Sheet als wiederverwendbare Komponente:
   - Pfad: src/components/kill/KillDetailContent.tsx
   - Props: killId, onClose, onEdit, onDelete
   - Inhalt: Foto-Hero (oder Emoji-Fallback), Titel (Wildart + Alter +
     Geschlecht), Meta-Reihe (Zeit, Schütze, Gewicht, Distanz),
     Mini-Map, Notiz-Feld (inline editierbar), Weather-Snapshot,
     Aktionsleiste (Teilen, Bearbeiten, Löschen)
   - Im Strecke-Tab: rendern in Bottom-Sheet-Wrapper
   - Später im Jagdtagebuch (Sprint 60): rendern als eigene Page

═══════════════════════════════════════════════════
DATEN-ANFORDERUNGEN
═══════════════════════════════════════════════════

Query-Anpassungen falls nötig:
- Kills mit Wildart-Gruppe joinen (für Hero-Aggregat)
- kills.status als 'harvested' / 'wounded' / 'recovered' / 'lost'
  (falls nur binär aktuell: Migration 030 für erweiterten Enum)
- hunt_photos-Tabelle oder -Feld falls noch nicht existent
- hunts.kill_count Column mit Trigger (aus Sprint 58.1h-Plan)

Recon-Bericht aus 58.1h.a hat diese Felder geklärt. Falls Migration
nötig: sauber nummerieren, manuell im Supabase-SQL-Editor ausführen
vor dem Code-Push.

═══════════════════════════════════════════════════
ROLLEN-LOGIK
═══════════════════════════════════════════════════

- Jagdleiter: alles sichtbar, Nachsuchen + Hero-Warnzeile sichtbar
- Schütze (Teilnehmer): Nachsuchen NUR für eigene sichtbar,
  Hero-Warnzeile "+N in Nachsuche" sichtbar wenn eigene offen
- Hundeführer-Tag: zusätzlich Nachsuchen sichtbar, die ihm zugewiesen
  sind
- Gast (ohne Account, Link-Join): Nachsuchen-Sektion komplett
  ausgeblendet, Hero-Warnzeile nicht sichtbar, Filter-Pills ohne
  "Nachsuche"-Option

═══════════════════════════════════════════════════
NICHT TEIL DIESES SPRINTS
═══════════════════════════════════════════════════

- Hunt-Photo-Gallery (für Mood-Fotos) — nur Placeholder, bauen später
- Nachsuche-Flow-View beim Tap auf Kill (Als erlegt/verloren markieren)
  — gehört zum Nachsuche-Tab, Placeholder reicht
- Streckenkarten-Generator vom Teilen-Button — existiert bereits,
  nur anbinden
- Real-Time-Updates neuer Kills während der Jagd — bestehender
  Realtime-Mechanismus bleibt, wird nur neu angezeigt
- Custom SVG-Species-Icons — im Sprint e, hier noch Emoji verwenden

═══════════════════════════════════════════════════
TESTS NACH DEM SPRINT
═══════════════════════════════════════════════════

Am iPhone alle 9 States durchspielen:
1. Empty (Jagdleiter)
2. Empty (Schütze)
3. Empty (Gast)
4. Ansitzjagd mit 3 Kills
5. Drückjagd mit 12 Kills und 2 Nachsuchen (Jagdleiter-Sicht)
6. Gast-Perspektive derselben Jagd (Nachsuchen unsichtbar)
7. Filter "Nachsuche" aktiv (Hero-Warnzeile weg, nur Nachsuche-Sektion)
8. Filter "Eigene" aktiv (chronologisch gefiltert)
9. Kill-Detail-Sheet geöffnet

Für jeden State Screenshot an Moritz.

═══════════════════════════════════════════════════
OUTPUT
═══════════════════════════════════════════════════

Git-Commits pro Sub-Feature:
- "feat: adaptive hero block"
- "feat: filter pill leiste mit foto button"
- "feat: batch card chronologie mit rotten stacking"
- "feat: nachsuche sektion role-aware"
- "feat: mood foto chip am listen ende"
- "feat: empty states per rolle"
- "feat: foto target picker sheet"
- "feat: kill detail sheet als wiederverwendbare komponente"
- evtl. Migration: "feat: migration N kill_count auf hunts"

Push. STOP. Screenshots aller 9 States.
Sag "Sprint 58.1h.d abgeschlossen. 9 States getestet, ready für Polish."
```

### Was du danach tust

Screenshots durchgehen mit mir hier. Wir gehen kritisch drüber:
- Sitzen Proportionen?
- Ist die Rollen-Logik korrekt?
- Funktioniert Rotten-Stacking visuell?
- Sind Empty-States differenziert genug?

Ggf. Fix-Runde, dann Sprint e.

---

## SPRINT 58.1h.e — VISUAL POLISH + OUTDOOR-TEST

### Prompt für Claude Code

```
Sprint 58.1h.e — der Polish-Schritt. Structurelle Arbeit ist fertig,
jetzt Feintuning.

═══════════════════════════════════════════════════
AUFGABE 1 — Custom SVG-Species-Icons
═══════════════════════════════════════════════════

Aus design-system.md Abschnitt 6.3 — vier Silhouetten:
- Rehwild: schlanke Silhouette, kleines Geweih
- Damwild: breitere Silhouette, Schaufel-Geweih-Andeutung
- Schwarzwild: kompakt, niedrig, Eber-Form
- Raubwild: Fuchs-Silhouette, spitze Ohren

Stil: gefüllt, reduziert, kein Outline, robust auch bei 16px.

Datei: src/components/icons/SpeciesIcons.tsx mit Named Exports.
Verwendung per <RehwildIcon size={20} /> etc.

Fallback für nicht-klassifizierte Wildarten: <PawIcon /> mit 🐾-ähnlicher
Silhouette.

Alle Stellen wo aktuell Emojis für Wildarten genutzt werden durch
diese Icons ersetzen (Strecke-Tab, Kill-Detail-Sheet, Filter-Pills,
Foto-Ziel-Sheet).

═══════════════════════════════════════════════════
AUFGABE 2 — Micro-Interactions
═══════════════════════════════════════════════════

- Tap-State auf Cards: BG -5-8% Helligkeit, Transition 100ms ease-out
- Expand-Chevron-Rotation: 180deg beim Aufklappen, 250ms ease
- Filter-Pill-Active-Transition: BG-Farbe-Änderung 150ms
- Bottom-Sheet-Slide-In: 300ms ease-out, mit backdrop-blur auf Basis
- Primary-Button Tap: --accent-primary-hover für 100ms

═══════════════════════════════════════════════════
AUFGABE 3 — Nachsuche-Icon
═══════════════════════════════════════════════════

Dreieck mit Ausrufezeichen, SVG, Farbe --alert-text.
Ersetzt den aktuellen ⚠-Emoji an allen Stellen.

═══════════════════════════════════════════════════
AUFGABE 4 — Elevation/Schatten
═══════════════════════════════════════════════════

Aus design-system.md Abschnitt 7:
- Cards: 0 1px 2px rgba(0,0,0,0.08)
- FAB: 0 4px 12px rgba(0,0,0,0.18)
- Bottom-Sheet: 0 -4px 16px rgba(0,0,0,0.2)

Sparsam einsetzen — nicht jede Card braucht Schatten.

═══════════════════════════════════════════════════
AUFGABE 5 — Outdoor-Test gemäß Protokoll
═══════════════════════════════════════════════════

design-system.md Abschnitt 12 listet 5 Pflicht-Szenarien:
1. Direkte Sonne (Brockwinkel bei Mittagssonne)
2. Dämmerung (Sonnenuntergang + 15 Min)
3. Mit Handschuhen
4. Nasses Display
5. Nachtadaption (30 Min nach Sonnenuntergang)

Pro Szenario:
- Screenshot machen
- In docs/outdoor-tests/2026-04-XX-session-1.md dokumentieren:
  Datum, Zeit, Wetter, Licht, iPhone-Helligkeit, Screenshot-Pfad,
  Beobachtungen

Kritische Elemente unter realen Bedingungen prüfen (aus Abschnitt 12.2):
- Caption/Meta-Texte (Text-Secondary bei Sonne)
- Pill-Labels (besonders inaktive)
- Warnzeile im Hero
- Aktive vs. inaktive Tabs
- Avatar-Farben bei 36px-Größe

═══════════════════════════════════════════════════
AUFGABE 6 — Bugfixes aus Moritz-Review
═══════════════════════════════════════════════════

Falls nach Sprint d Feedback offen geblieben ist: jetzt abarbeiten.

═══════════════════════════════════════════════════
OUTPUT
═══════════════════════════════════════════════════

Git-Commits:
- "feat: custom SVG species icons"
- "feat: micro interactions and transitions"
- "feat: nachsuche alert icon"
- "feat: elevation system"
- "fix: post-review bugs"

Ordner docs/outdoor-tests/ mit Session-Bericht.

Push. Sprint 58.1h abgeschlossen.

Sag "Sprint 58.1h.e fertig. Strecke-Tab final + outdoor getestet.
Bereit für merge in main und Coolify-Redeploy."
```

### Was du danach tust

- Finaler iPhone-Test komplett
- Outdoor-Test-Berichte lesen
- Wenn alles gut: Feature-Branch mergen

Merge-Procedure:
```bash
git checkout main
git pull origin main
git merge --no-ff feature/theme-a-rollout -m "Merge: Theme A rollout + Strecke-Tab rebuild (Sprint 58.1h)"
git push origin main
```

Dann Coolify-Redeploy manuell auf main.

Feature-Branch kann bleiben (als Historie) oder gelöscht werden:
```bash
git branch -d feature/theme-a-rollout
git push origin --delete feature/theme-a-rollout
```

---

## Troubleshooting / Rollback-Plan

**Falls Sprint 58.1h.b oder .c fehlschlägt und bestehende Screens kaputt sind:**

```bash
git reset --hard HEAD~N   # N = Anzahl der Commits zurück
git push origin feature/theme-a-rollout --force
```

Auf Feature-Branch ist Force-Push okay (du bist alleine drauf).

**Falls alles unrettbar kaputt ist:**

```bash
git checkout main
git branch -D feature/theme-a-rollout
git push origin --delete feature/theme-a-rollout
# neu starten ab dem Tag
git checkout pre-theme-rebuild-2026-04-20
git checkout -b feature/theme-a-rollout-v2
```

---

## Nach Abschluss von Sprint 58.1h

**Übergabe-Dokument schreiben:** `RevierApp_Uebergabe_Session_XX_Theme_A_Rollout.md` mit:
- Was gebaut wurde
- Welche Migrations liefen
- Welche Screens angefasst wurden
- Welche Edge-Cases beim Outdoor-Test aufkamen
- Offene Follow-ups für Sprint 58.1i oder weiter

**Pipeline-Update:** Falls unterwegs neue Bugs oder Ideen in `BERICHT_58_1h_followups.md` landen: daraus nächste Sprints ableiten.

---

*Handoff-Paket erstellt 20.04.2026 für QuickHunt Sprint 58.1h.*
*Basis: design-system.md v1.0 + Claude_Design_Brief_Strecke_Tab.md + Wireframe V3.*

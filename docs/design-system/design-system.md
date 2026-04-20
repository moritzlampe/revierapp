# QuickHunt Design System

**Version:** 1.0 (Foundation — Theme A "Moos auf Papier")
**Status:** Initial — Ausgangspunkt für Strecke-Tab-Redesign (Sprint 58.1h), später systemweiter Rollout
**Basis:** Light Theme für Tageslicht-Einsatz. Theme C ("Waldboden-Dunkel") als späteres Nacht-Theme via User-Settings-Toggle.

---

## Inhalt

1. [Designphilosophie](#1-designphilosophie)
2. [Farbpalette](#2-farbpalette)
3. [Typografie](#3-typografie)
4. [Spacing-System](#4-spacing-system)
5. [Komponenten-Spezifikationen](#5-komponenten-spezifikationen)
6. [Icon-System](#6-icon-system)
7. [Elevation / Schatten](#7-elevation--schatten)
8. [Zustände / Interactions](#8-zustände--interactions)
9. [Avatar-System](#9-avatar-system)
10. [Dark-Mode-Korrespondenz (Theme C)](#10-dark-mode-korrespondenz-theme-c)
11. [Strukturelle Prinzipien & Einschränkungen](#11-strukturelle-prinzipien--einschränkungen)
12. [Outdoor-Test-Protokoll](#12-outdoor-test-protokoll)
13. [Versionshinweise](#13-versionshinweise)

---

## 1. Designphilosophie

**Drei Kernprinzipien:**

1. **Tageslicht zuerst.** QuickHunt wird zu ~95% draußen bei Tageslicht genutzt. Jedes Design-Element muss primär in dieser Umgebung funktionieren. Dunkle Modi sind Sekundär-Fall (Nacht, tiefe Dämmerung).
2. **Jagdlich ernsthaft, nicht folkloristisch.** Klare, ruhige Ästhetik (Strava, Linear, Apple Fitness). Keine Gamification, keine "Jägerhut-Folklore", keine verspielten Illustrationen. Das Werkzeug-Gefühl zählt mehr als Dekoration.
3. **Ein Werkzeug, nicht ein Showcase.** Der Hero-Moment darf auftreten (große Display-Zahl bei Strecke), aber die meisten Screens sind dichte Arbeits-UIs. Lesbarkeit schlägt visuelle Raffinesse.

**Farbwelt-Metapher:** "Moos auf Papier" — warme, papierige Basis mit gesättigten Grün-Akzenten. Jagd-tradition trifft moderne UI-Klarheit.

---

## 2. Farbpalette

Alle Hex-Werte sind final nach ChatGPT-Review. Kontrastwerte sind exakt berechnet nach WCAG 2.x Formel.

### 2.1 Hintergründe & Surfaces

| Token | Hex | Verwendung |
|-------|-----|------------|
| `--bg-base` | `#E7DDC7` | Haupt-Hintergrund der App |
| `--bg-elevated` | `#D8D2BE` | Karten, leicht abgehoben (Batch-Cards) |
| `--bg-sunken` | `#CFC7B0` | eingelassene Sektionen (Filter-Bar) |
| `--surface-hero` | `#A4AF8D` | Hero-Block (Display-Zahl + Species-Pills) |

**Wichtig zu `--surface-hero`:** Dieser Wert wurde im Review von `#C7CFB4` auf `#A4AF8D` verschärft, um ausreichenden Flächenkontrast zum Base-Hintergrund herzustellen (1.71:1 statt zuvor 1.20:1). Nur so hebt sich der Hero-Bereich visuell klar vom Rest ab.

### 2.2 Text-Farben

| Token | Hex | Kontrast auf `--bg-base` | Verwendung |
|-------|-----|--------------------------|------------|
| `--text-primary` | `#1F2618` | 13:1 (AAA) | Haupttext, Überschriften, Display-Zahlen |
| `--text-secondary` | `#5C644F` | 4.59:1 (AA, knapp) | Meta-Infos, Subtitles, Captions |
| `--text-muted` | `#5D634F` | 4.63:1 (AA) | Disabled-artige Labels, Skeleton-States, dekorative Mikrotexte |

**Wichtig zu `--text-muted`:** Diese Farbe wurde ursprünglich als "Tertiary" (`#8A907C`) geführt, der Wert war aber mit 2.45:1 klar unter AA. Nach Review:

- Umbenennung von "Tertiary" zu "Muted"
- Nutzung **strikt limitiert** auf disabled-artige Labels, Skeleton-Placeholder, dekorative Mikrotexte
- **Nicht für Informationsträger** (echte Captions, Overlines, Labels mit Inhalt)
- Für informative 12px-Labels (Overline, Caption) immer `--text-secondary` nutzen

### 2.3 Akzente

| Token | Hex | Verwendung |
|-------|-----|------------|
| `--accent-primary` | `#4A5A2A` | Buttons, aktive Tabs, wichtige Labels, FAB, Icons |
| `--accent-primary-hover` | `#5E6F38` | Tap/Hover-State des Primary-Akzents |
| `--accent-success` | `#3F6B3A` | Bestätigte Erlegung, "erledigt"-States |
| `--accent-gold` | `#8C6A2E` | Optionaler Status (z.B. "Kapital"-Markierung) — dekorativ, kein Primär-Text |

**Wichtige Regel zu `--accent-primary`:**

Primary ist **ausschließlich Akzent- und Fill-Farbe** für Buttons, aktive Tabs und Icons. **Nicht automatisch als Textfarbe** auf jeder Fläche nutzen. Auf `--surface-hero` erreicht Primary nur 3.26:1 — zu schwach für kleinere Texte. Auf getönten Flächen (Hero, Nachsuche-BG) immer `--text-primary` verwenden.

### 2.4 Borders

| Token | Hex | Verwendung |
|-------|-----|------------|
| `--border-default` | `#B8B29E` | Subtile Trennlinien, Card-Outlines |
| `--border-strong` | `#8E8874` | Aktive States, stärkere Trennungen, aktive Tab-Underlines |

### 2.5 Nachsuche (Alert)

| Token | Hex | Verwendung |
|-------|-----|------------|
| `--alert-text` | `#6B2C2C` | Nachsuche-Text, Alert-Icons |
| `--alert-bg` | `#E3C4C4` | Nachsuche-Karten-Hintergrund |
| `--alert-border` | `#6B2C2C` | Nachsuche-Karten-Rahmen (1px) |

**Anmerkung zum Alert-BG:** Auf warmer Basis kann `#E3C4C4` leicht rosa wirken. Beim ersten Real-World-Test prüfen, ob ein erdigerer Ton (z.B. `#D4B5B0` mit mehr Braun-Einschlag) besser passt.

### 2.6 Mood-Foto-Chip (Stimmungsfoto-Akzent)

| Token | Hex | Verwendung |
|-------|-----|------------|
| `--mood-chip-bg` | `#D8D2BE` | Hintergrund des Mood-Chip am Listen-Ende (Sonnenauf-/untergang-Symbol) |
| `--mood-chip-text` | `--text-secondary` | Text "🌅 N Stimmungsfotos" |

---

## 3. Typografie

**Font:** iOS SF Pro (Systemfont) als Primary, Fallback `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.

Begründung: native Rendering-Qualität, respektiert iOS-Textgröße-Einstellung automatisch, optimal lesbar outdoor.

**Basis:** 16px = 1rem

### 3.1 Typo-Skala

| Rolle | Size | Weight | Line-height | Letter-spacing | Verwendung |
|-------|------|--------|-------------|----------------|------------|
| Display | 4.5rem (72px) | 600 | 1.05 | -0.02em | Hero-Zahl "12 Stücke" |
| H1 | 1.5rem (24px) | 600 | 1.3 | -0.01em | Page-Titel ("Jagd am 18.4.2026") |
| H2 | 1.125rem (18px) | 600 | 1.3 | 0 | Sektions-Überschriften ("IN NACHSUCHE") |
| Body-Large | 1rem (16px) | 500 | 1.4 | 0 | Batch-Card-Name ("Andreas Berg") |
| Body | 0.9375rem (15px) | 400 | 1.5 | 0 | Standard-Text, Kill-Details |
| Caption | 0.8125rem (13px) | 400 | 1.4 | 0.01em | Meta-Info ("09:42 · 3 Stücke") |
| Overline | 0.75rem (12px) | 600 | 1.2 | 0.08em | Kleine Labels ("HEUTIGE STRECKE"), UPPERCASE |
| Badge | 0.75rem (12px) | 600 | 1.2 | 0.04em | Kurz-Labels ("DU", "KAPITAL", "NACHSUCHE") |

### 3.2 Regeln

- **Overline/Caption immer mit `--text-secondary`**, nie mit `--text-muted`, weil informationstragend
- **Display ausschließlich im Hero** — nicht als generelle "große Zahl"-Lösung recyceln
- **Badge-Text auf farbigem BG** immer weiß oder `--text-primary`, nie `--accent-primary`

---

## 4. Spacing-System

**Token-basiert in rem für iPhone-Textgröße-Respekt:**

| Token | rem | px |
|-------|-----|-----|
| `--space-xs` | 0.25rem | 4px |
| `--space-sm` | 0.5rem | 8px |
| `--space-md` | 0.75rem | 12px |
| `--space-lg` | 1rem | 16px |
| `--space-xl` | 1.5rem | 24px |
| `--space-2xl` | 2rem | 32px |
| `--space-3xl` | 3rem | 48px |

### 4.1 Layout-Abstände

| Übergang | Abstand |
|----------|---------|
| Header → Hero | `--space-lg` (16px) |
| Hero → Filter-Leiste | `--space-xl` (24px) |
| Filter → Liste | `--space-lg` (16px) |
| Zwischen Batch-Cards | `--space-md` (12px) |
| Innerhalb Cards (Padding) | `--space-md` bis `--space-lg` (12–16px) |

---

## 5. Komponenten-Spezifikationen

### 5.1 Batch-Card

- Hintergrund: `--bg-elevated`
- Rahmen: 1px `--border-default`
- Radius: 12px
- Padding: `--space-lg`
- Typografie: Body-Large (Name) + Caption (Zeit/Count)

### 5.2 Kill-Sub-Item (innerhalb Batch-Card)

- Hintergrund: transparent
- Divider zwischen Items: 1px `--border-default`
- Padding vertikal: `--space-sm`
- Icon links (20px), Label + Detail mittig, optional Badge/Foto-Count rechts

### 5.3 Nachsuche-Card

- Hintergrund: `--alert-bg`
- Rahmen: 1px `--alert-border`
- Radius: 12px
- Typografie: Body (Wildart/Status) + Badge (Zeitdauer)
- Text-Farbe: `--text-primary` (nicht `--alert-text` — zu dunkel auf hellem Rosa-BG)

### 5.4 Filter-Pill

| State | BG | Text |
|-------|-----|------|
| Inaktiv | `--bg-sunken` | `--text-secondary` |
| Aktiv | `--accent-primary` | `#FFFFFF` |

- Radius: 999px
- Padding: `--space-sm` vertikal + `--space-md` horizontal

### 5.5 Species-Pill (im Hero)

- Hintergrund: etwas dunklere Variante des `--surface-hero` (z.B. `#94A07D`, beim Rendering durch Claude Design fein abstimmen)
- Radius: 999px
- Typografie: Caption
- Icon links (20px), Count mittig, Wildart-Name rechts
- Text-Farbe: `--text-primary`

### 5.6 Foto-Button

- Hintergrund: `--bg-sunken`
- Icon: `--accent-primary`
- Größe: 40–44px × 40–44px
- Platzierung: rechts neben Filter-Pills, durch 1px `--border-default` abgesetzt

### 5.7 Hero-Block gesamt

- Hintergrund: `--surface-hero` (`#A4AF8D`)
- Radius: 16px
- Padding: `--space-xl`
- Inhalt von oben nach unten:
  1. Overline "HEUTIGE STRECKE" (`--text-primary`)
  2. Display-Zahl + "Stücke" (`--text-primary`)
  3. Species-Pills (2×2 Grid oder horizontale Flex)
  4. Optional Nachsuche-Warnzeile (`--alert-text` auf eigenem `--alert-bg`-Streifen)

### 5.8 Avatar-Circle

- Größe: 36–40px (Batch-Card), 24px (inline), 56px (Detail-Sheet)
- Text-Farbe: `#FFFFFF` immer
- Font: 600 weight
- Letter-spacing: 0.02em
- Farbe: deterministisch aus User-ID (siehe [Avatar-System](#9-avatar-system))

### 5.9 Primary-Button

- Hintergrund: `--accent-primary`
- Text: `#FFFFFF`
- Radius: 12px
- Padding: `--space-md` vertikal + `--space-lg` horizontal
- Tap-State: Hintergrund → `--accent-primary-hover`

### 5.10 Tab-Bar (Karte/Chat/Nachsuche/Strecke)

| State | Text | Underline |
|-------|------|-----------|
| Inaktiv | `--text-secondary` | keine |
| Aktiv | `--accent-primary` | 2px `--border-strong` |

### 5.11 Bottom-Navigation

- Hintergrund: `--bg-elevated`
- Border-top: 1px `--border-default`
- Aktiv: Icon + Label in `--accent-primary`
- Inaktiv: Icon + Label in `--text-muted`
- Safe-Area-Padding für iPhone-Home-Indicator

### 5.12 Erlegung-FAB

- Größe: 56px × 56px
- Hintergrund: `--accent-primary`
- Icon: `#FFFFFF`, 24px
- Radius: 50%
- Position: zentriert in Bottom-Navigation, leicht angehoben

---

## 6. Icon-System

### 6.1 Grundsatz

**Custom SVG statt Emoji.** Gründe:

- Konsistenz quer durch iOS-Versionen und Android (falls später)
- Volle Kontrolle über Farbe, Stroke, Anti-Aliasing
- Outdoor-Lesbarkeit auch bei Sonneneinstrahlung

### 6.2 Stil

- Gefüllt + leicht reduziert (keine Outlines)
- Stroke: minimal oder none
- Form robust, keine filigranen Details
- Ein Style durch alle Icons

### 6.3 Species-Icons (Wildart-Differenzierung)

**Kritisches Prinzip: Unterscheidung läuft primär über Silhouette + Label, nicht über Farbton.**

| Wildart | Silhouette-Merkmal |
|---------|---------------------|
| Rehwild | schlanke Silhouette, kleines Geweih |
| Damwild | breitere Silhouette, charakteristische Schaufel-Geweih-Andeutung |
| Schwarzwild | kompakt, niedrig, Eber-Form |
| Raubwild | Fuchs-Silhouette, spitze Ohren |

**Fallback-Regel:** Wildarten ohne klare Silhouette (Marder, Iltis, Dachs) → `🐾`-Icon, Label macht Unterschied.

### 6.4 Icon-Größen

| Kontext | Größe |
|---------|-------|
| Inline (in Text) | 16px |
| Species-Pills | 20px |
| Batch-Card-Icons | 24px |
| Hero-Pills | 20px |

### 6.5 Nachsuche-Icon

- Dreieck mit Ausrufezeichen (Standard-Mental-Model für Alert)
- Farbe: `--alert-text`
- Nicht mit `#FFFFFF` auf rotem BG füllen — behält auf Papier-BG besseren Kontrast

### 6.6 Meta-Icons

| Bedeutung | Icon |
|-----------|------|
| Zeit | 🕐 Uhr-Outline |
| User/Schütze | 👤 Person-Outline |
| Gewicht | ⚖ Waage |
| Distanz | 📏 Maßband oder Strecke-Indikator |
| Foto | 📷 Kamera |
| Position | 📍 Pin |

---

## 7. Elevation / Schatten

**Grundsatz:** Sparsam einsetzen. Helle Themes nutzen Schatten zurückhaltender als Dark-Themes.

| Element | Schatten |
|---------|----------|
| Card | `0 1px 2px rgba(0,0,0,0.08)` |
| FAB | `0 4px 12px rgba(0,0,0,0.18)` |
| Bottom-Sheet | `0 -4px 16px rgba(0,0,0,0.2)` |

**Keine Schatten bei:** Filter-Pills, Species-Pills, Inline-Badges, Batch-Cards-Sub-Items.

---

## 8. Zustände / Interactions

### 8.1 Tap-State

- BG leicht dunkler (−5 bis −8% Helligkeit)
- Keine Opacity-Änderung (verwischt Farb-Identität)
- Kurze Transition: 100ms ease-out

### 8.2 Active-State

- Primary-Fill + Weiß-Text
- Gilt für: Filter-Pills aktiv, Tabs aktiv, Primary-Buttons gedrückt

### 8.3 Disabled

- Opacity: 40%
- Kein Schatten
- Kein Tap-Feedback

### 8.4 Loading (Skeleton)

- BG: `#DDD6C2` (zwischen `--bg-base` und `--bg-elevated`)
- Shimmer: `#EAE3D0` (leicht heller), Animation 1.5s linear infinite

---

## 9. Avatar-System

### 9.1 Farbpalette (12 Töne)

Alle entsättigt, natürlich, harmonisch zum Theme. Kontrast zu weißem Text jeweils ≥AA.

| Token | Hex | Charakter | Kontrast zu Weiß |
|-------|-----|-----------|------------------|
| Forest Blue | `#4F6D7A` | kühles gedämpftes Blau | 4.8:1 |
| Slate Blue | `#5A6FA8` | klassisches Grau-Blau | 4.6:1 |
| Moss Green | `#5E7A3A` | natürliches Moosgrün | 4.7:1 |
| Deep Olive | `#6B7A2E` | erdiges Oliv | 4.9:1 |
| Earth Brown | `#7A5C3A` | warmer Braunton | 5.2:1 |
| Walnut | `#6A4E3B` | dunkler neutraler Braunton | 5.8:1 |
| Dark Gold | `#8A6E2E` | warmes gedecktes Gold | 4.83:1 |
| Deep Slate Blue | `#465E7A` | tiefes natürliches Blau-Grau | 6.68:1 |
| Dusty Purple | `#6A5A7A` | entsättigtes Violett | 6.26:1 |
| Heather Violet | `#7A6A8F` | helleres Violett | 4.90:1 |
| Stone Grey | `#6B6F5A` | neutral mit Grünanteil | 4.8:1 |
| Dark Teal | `#3F6B6A` | grün-blau, technisch ruhig | 5.4:1 |

**Regeln:**

- Avatar-Text immer `#FFFFFF`
- Keine Farbverläufe
- Kein Wechsel pro Session — Farbe ist stabil pro Nutzer

**Bewusst ausgeschlossen:** Muted Red und Bordeaux wurden aus der ursprünglichen Palette entfernt, weil sie im gleichen Farbraum wie `--alert-text` (Nachsuche) liegen. Alarmrot muss semantisch exklusiv bleiben.

### 9.2 Deterministischer Zuordnungs-Algorithmus

**Input-Priorität:**

1. Primär: `userId` (falls vorhanden)
2. Fallback: `name` (String)

**Algorithmus** (djb2-Variante, gute Verteilung):

```typescript
const avatarColors = [
  "#4F6D7A", "#5A6FA8", "#5E7A3A", "#6B7A2E",
  "#7A5C3A", "#6A4E3B", "#8A6E2E", "#465E7A",
  "#6A5A7A", "#7A6A8F", "#6B6F5A", "#3F6B6A"
];

function getAvatarColor(input: string): string {
  const str = input.toLowerCase().trim();
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return avatarColors[Math.abs(hash) % avatarColors.length];
}
```

### 9.3 Design-Regeln für Avatar-Rendering

- Mindestgröße: 36px × 36px (kleiner nur inline, dann ohne Initialen)
- Initialen: max. 2 Buchstaben
- Schrift: 600 weight
- Letter-spacing: 0.02em
- Vertikale Zentrierung optisch korrigieren (nicht nur mathematisch)

### 9.4 Kollisionsbehandlung (optional, für Jagdgesellschaften >100 Nutzer)

Falls in Zukunft große Gruppen auftreten und Farb-Kollisionen häufiger werden:

- Option A: leichter Hellheits-Unterschied (±5%) pro kollidierendem User
- Option B: dünner Ring in `--accent-primary` um den Avatar als Zweit-Differenzierung
- Option C: Palette auf 16+ Farben erweitern

Für MVP/Launch nicht relevant — typische Jagdgesellschaften haben 5–40 Teilnehmer.

---

## 10. Dark-Mode-Korrespondenz (Theme C)

**Theme C** ("Waldboden-Dunkel") ist der spätere Nacht-Modus, aktivierbar via User-Settings-Toggle. Alle Theme-A-Tokens haben eine entsprechende C-Variante, damit ein sauberer Auto-Switch möglich ist.

| Token | Theme A (Hell) | Theme C (Dunkel) |
|-------|----------------|-------------------|
| `--bg-base` | `#E7DDC7` | `#2D3A28` |
| `--bg-elevated` | `#D8D2BE` | `#3A4530` |
| `--bg-sunken` | `#CFC7B0` | `#2A3324` |
| `--surface-hero` | `#A4AF8D` | `#5A6B3D` |
| `--accent-primary` | `#4A5A2A` | `#8FA45A` |
| `--text-primary` | `#1F2618` | `#F1F3EA` |
| `--text-secondary` | `#5C644F` | `#C7D0B0` |
| `--text-muted` | `#5D634F` | `#9FA88A` |
| `--alert-text` | `#6B2C2C` | `#8A3A3A` |
| `--alert-bg` | `#E3C4C4` | `#3F1F1F` |

**Roadmap:** Theme C wird nach Strecke-Tab-Rollout als separater Sprint eingeführt. Zuerst Theme A für alle Screens, dann Toggle-Mechanismus, dann Theme C als Mapping.

---

## 11. Strukturelle Prinzipien & Einschränkungen

Vier systemische Regeln, die bei jeder Implementierung beachtet werden müssen:

### 11.1 Text-Hierarchie ist zweistufig mit optionaler Dekor-Ebene

Frühere Versionen des Systems hatten drei vollwertige Text-Ebenen (Primary / Secondary / Tertiary). Das hat sich als strukturell schwierig erwiesen: Wenn Secondary bereits knapp an der AA-Grenze liegt, lässt sich keine dritte Ebene darüber definieren, die gleichzeitig WCAG-AA einhält und visuell unterscheidbar ist.

**Geltende Logik:**

- `--text-primary` — Hauptinformation
- `--text-secondary` — unterstützende Information, aber immer noch informationstragend
- `--text-muted` — **nur** für dekorative/disabled Zwecke, niemals für Informationsträger

Informative 12px-Labels (Overline, Caption) nutzen immer `--text-secondary`, nicht `--text-muted`.

### 11.2 Primary ist Akzent, nicht Text

`--accent-primary` (`#4A5A2A`) ist **ausschließlich** Akzent- und Fill-Farbe:

- Button-Hintergründe
- Aktive Tab-Marker
- Icons in aktiven Zuständen
- FAB-Fill

**Nicht als Textfarbe** auf getönten Surfaces nutzen. Auf `--surface-hero` erreicht Primary nur 3.26:1 — unter AA. Auf Surfaces immer `--text-primary` verwenden.

### 11.3 Wildart-Unterscheidung läuft nie nur über Farbe

Farbcodierung ist **nie primäre Unterscheidungsebene**. Immer Kombination aus:

1. Silhouette (SVG-Form)
2. Label (Wildart-Name)
3. Farbe (unterstützend)

Gründe:

- Farbenfehlsichtigkeit (ca. 8% der männlichen Nutzer)
- Outdoor-Lichtverhältnisse verschieben Farbwahrnehmung stark
- Kleine Icons (16–20px) haben schwachen Farbeindruck

Silhouette muss auch schwarz-weiß lesbar sein.

### 11.4 Kein Auto-Kapital, kein Auto-Ranking

"Kapital" ist ausschließlich manuelle User-Markierung im Kill-Detail-Sheet. Nicht aus Gewicht, Alter oder anderen Metadaten ableiten. Jagdliches Werturteil bleibt User-Entscheidung.

Gleiches gilt für andere "wertende" Flags: Trophäe, Ehrenstück, etc. — alles User-kontrolliert.

---

## 12. Outdoor-Test-Protokoll

**WCAG-Konformität reicht nicht.** Das Design muss im echten Jagdkontext validiert werden, bevor es produktiv geht.

### 12.1 Pflicht-Testszenarien

| Szenario | Test-Ort | Zu prüfen |
|----------|----------|-----------|
| Direkte Sonne | Brockwinkel, freies Feld, Mittagssonne | Lesbarkeit aller Texte, besonders Caption/Meta |
| Dämmerung | Sonnenuntergang bis 15 Min danach | Hero-Zahl, Farbunterschiede zwischen Pills, Nachsuche-Rot |
| Mit Handschuhen | Winterhandschuhe | Touch-Targets, Filter-Pills, FAB |
| Nasses Display | Regen oder feuchtes Tuch | Tap-Genauigkeit, Icon-Klarheit |
| Nachtadaption | 30 Min nach Sonnenuntergang | Gesamt-Look (evtl. Trigger für Theme-C-Wechsel) |

### 12.2 Kritische Elemente für Outdoor-Review

- **Caption/Meta-Texte** mit `--text-secondary` bei Sonne (4.59:1 ist theoretisch, praktisch knapp)
- **Pill-Labels** (Species-Pills, Filter-Pills) — besonders inaktive
- **Warnzeile im Hero** — soll ernst, nicht überdramatisch wirken
- **Aktive vs. inaktive Tabs** — Unterscheidbarkeit unter starkem Seitenlicht
- **Avatar-Farben** — ob Identifikation bei 36px-Größe noch funktioniert

### 12.3 Dokumentation der Tests

Pro Test-Session:

- Datum, Zeit, Wetterlage, Lichtverhältnisse
- iPhone-Modell + Display-Helligkeit-Einstellung
- Screenshot am Gerät (zur Referenz später)
- Schriftliche Notiz: Was ging, was ging nicht, was muss nachgezogen werden

Diese Dokumentation landet im Repo unter `docs/outdoor-tests/` als Teil des Change-Logs.

---

## 13. Versionshinweise

**v1.0 — Initial (April 2026)**

- Erstellt im Kontext von Sprint 58.1h (Strecke-Tab-Redesign)
- Basis: ChatGPT-Design-System-Spec + ChatGPT-Avatar-System + Claude-Review + ChatGPT-Review
- Theme A als Haupt-Theme, Theme C als dokumentierte Dark-Mode-Korrespondenz
- Keine Codebase-Integration — dieses Dokument ist Vorlage, nicht Ist-Zustand

**Nächste Schritte:**

1. Claude Design Rendering aller 9 Strecke-Tab-States mit Theme A (Token-exakt aus diesem Dokument)
2. Claude Code Implementation in drei Phasen (Tokens → Struktur → Polish)
3. Outdoor-Validierung nach Phase 2
4. Theme-C-Rollout als separater Sprint post-Strecke-Tab

**Dokument-Ort:** Soll in Repo als `docs/design-system.md` eingecheckt werden, damit Claude Code bei späteren Sprints auf dieselbe Quelle zugreifen kann.

---

*Erstellt April 2026 für QuickHunt / RevierApp. Basis: ChatGPT-Design-Spec (Moritz Lampe) + Claude-Review + ChatGPT-Review-Korrekturen.*

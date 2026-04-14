# Grenze-Scoping + FAB-Reduktion — Erkundungsbericht 57.1a

**Datum:** 2026-04-14
**Status:** Nur Analyse, kein Code verändert

---

## 1. Grenze-Editor heute

### 1.1 Komponenten

Es gibt **zwei unabhängige Grenze-Zeichner:**

| # | Komponente | Technik | Speichert in | Benutzt von |
|---|-----------|---------|-------------|-------------|
| A | `src/components/map/boundary-editor.tsx` | leaflet-draw (L.Draw.Polygon) | **`reviere`** Tabelle (001_initial_schema) | Revierzentrale (alter Desktop-Flow) |
| B | `src/components/hunt/MapContent.tsx` :961-1175 + `BoundarySheet.tsx` | Manuell (click-to-draw, Vertex-Drag) | **`districts`** Tabelle (003_quickhunt_schema) | Live-Jagd (alle Jagden) |

**Wichtig:** `reviere` (Schema 001) und `districts` (Schema 003) sind **zwei verschiedene Tabellen** mit gleichem Zweck. Der aktive QuickHunt-Flow und Du-Flow nutzen `districts`. Der alte Revierzentrale-Flow nutzt `reviere`. Die boundary-editor.tsx (A) ist im aktiven Produkt effektiv tot — sie wird nur von der archivierten Revierzentrale verwendet.

### 1.2 Einsatzorte

| Ort | Editor | Einschränkung | Status |
|-----|--------|---------------|--------|
| **Live-Jagd (MapContent.tsx)** | B (manuell) | Keine — Button IMMER sichtbar (Zeile 1331) | ⚠ Bug: Auch bei Jagd mit verknüpftem Revier |
| **Revier-Einstellungen (Du → Revier)** | Keiner | — | ⚠ Bug: Kein Grenze-Editor vorhanden |
| **Alter Setup-Flow** (`app/app/revier/[id]/setup/`) | Eigener simpler Editor | setup-map.tsx, speichert in `districts` | Altbestand |
| **Revierzentrale** (archiviert) | A (leaflet-draw) | activeTool === "boundary" | Archiv, inaktiv |

### 1.3 State-Kopplung (Live-Jagd, MapContent.tsx)

```
drawingMode (boolean) → Zeichnen aktiv/inaktiv
drawPoints ({ lat, lng }[]) → Gezeichnete Vertices
boundarySheetMode ('save' | 'hidden') → Sheet zum Speichern/Benennen
```

**Sichtbarkeit des "Grenze zeichnen"-Buttons** (Zeile 1331):
```tsx
{!drawingMode && (
  <button onClick={startDrawing}>
    ✏️ {boundary?.length > 0 ? 'Grenze bearbeiten' : 'Grenze zeichnen'}
  </button>
)}
```

**Kein Guard für `districtId`, `isJagdleiter` oder sonstige Bedingung.** Der Button ist immer da — auch wenn ein Revier verknüpft ist, auch für Nicht-Jagdleiter.

### 1.4 Persistierung

**BoundarySheet.tsx** (Zeile 50-112):
- **Neues Revier:** `INSERT INTO districts (name, boundary, owner_id)` als EWKT
- **Bestehendes Revier:** `UPDATE districts SET boundary = $ewkt WHERE id = $id`
- **Verknüpfung:** Bei Neuerstellung optional `UPDATE hunts SET district_id = $id`

### 1.5 Boundary-Lesefluss bei Jagd mit verknüpftem Revier

`app/app/hunt/[id]/page.tsx` (Zeile ~153):
```
districts.boundary WHERE id = hunt.district_id → parsePolygonHex() → MapContent.boundary prop
```

Die Boundary kommt aus `districts` — wird **nicht** in `hunts` dupliziert. `hunts` hat kein eigenes `boundary`-Feld. Bei Jagd mit Revier ist die Grenze also eine **Referenz**, kein Klon.

---

## 2. Live-FAB heute

### 2.1 Zwei separate Erstellungspfade

Es gibt **zwei** Wege, Objekte auf der Karte zu erstellen:

| # | Auslöser | UI | Erstellt | Tabelle | Guard |
|---|----------|-----|---------|---------|-------|
| **FAB** | Grüner + Button | Subtype-Sheet (3 Optionen) | Adhoc-Stände | `hunt_seat_assignments` | `isJagdleiter && !districtId` |
| **Long-Press** | 500ms Druck auf Karte | MapObjectSheet (8 Typen) | Revier-Objekte | `map_objects` | Keiner (alle User, alle Jagden) |

### 2.2 FAB (Zeile 1712-1802)

**Pfad:** `src/components/hunt/MapContent.tsx`

**Sichtbarkeitsbedingung** (Zeile 1713-1715):
```tsx
isJagdleiter && huntId && !districtId && !isMovingActive && !drawingMode
  && !assignStand && !detailStand && !awaitingAdhocPlacement
  && sheetMode === 'hidden' && boundarySheetMode === 'hidden'
```

→ FAB erscheint **NUR** bei freier Jagd (ohne verknüpftes Revier) und nur für Jagdleiter.

**Sub-Typ-Menü** (hardcoded inline, Zeile 1750-1753):
```tsx
[
  { key: 'leiter',    icon: '🪜', label: 'Leiter' },
  { key: 'hochsitz',  icon: '🏠', label: 'Hochsitz' },
  { key: 'sitzstock', icon: '🪑', label: 'Sitzstock' },
]
```

**Alle drei sind Adhoc-Stand-Subtypen** — sie landen in `hunt_seat_assignments` mit `seat_type = 'adhoc'`. Das FAB-Menü enthält **keine** Revier-Objekte wie Kirrung oder Salzlecke.

### 2.3 Long-Press → MapObjectSheet (Zeile 1006-1010, 1462)

**Pfad:** `src/components/hunt/MapObjectSheet.tsx`

**Sichtbarkeitsbedingung:** Keine. Aktiv für alle User, in allen Jagdtypen.

**Typ-Auswahl** (hardcoded in MapObjectSheet.tsx, Zeile 7-19):
```tsx
MAP_OBJECT_TYPES = [
  { value: 'hochsitz',         label: 'Hochsitz',         icon: '🪵' },
  { value: 'kanzel',           label: 'Kanzel',            icon: '🏠' },
  { value: 'drueckjagdstand',  label: 'Drückjagdstand',    icon: '🎯' },
  { value: 'parkplatz',        label: 'Parkplatz',         icon: '🅿️' },
  { value: 'kirrung',          label: 'Kirrung',           icon: '🌾' },
]
MORE_TYPES = [
  { value: 'salzlecke',  label: 'Salzlecke',  icon: '🧂' },
  { value: 'wildkamera',  label: 'Wildkamera', icon: '📷' },
  { value: 'sonstiges',   label: 'Sonstiges',  icon: '📌' },
]
```

**Alle 8 Typen werden als `map_objects` in der `districts`-Zuordnung gespeichert.** Das sind permanente Revier-Objekte — kein ephemerer Jagd-Content.

### 2.4 Korrektur der Bug-Beschreibung

Der Prompt beschreibt "FAB zeigt Hochsitz, Kirrung, adhoc, etc." — tatsächlich ist die Aufschlüsselung:

- **FAB** (+ Button) zeigt nur 3 Adhoc-Stand-Subtypen → **bereits korrekt geschnitten**
- **Long-Press → MapObjectSheet** zeigt alle 8 Revier-Objekttypen → **DAS ist das Problem**

Der FAB selbst braucht keine Reduktion. Der Long-Press-Flow (MapObjectSheet) gehört in Revier-Einstellungen und sollte in der Live-Jagd deaktiviert oder auf adhoc-Stände beschränkt werden.

---

## 3. Revier-Einstellungen heute

### 3.1 Dateien

```
app/app/du/revier/[id]/
├── page.tsx              (Server: Lädt districts + map_objects)
└── revier-content.tsx    (Client: State-Machine-UI, ~510 Zeilen)
```

Keine Unter-Routes, keine verschachtelten Seiten. Alles über State-Machine-Stages:

```typescript
type CreationStage =
  | { stage: 'idle' }
  | { stage: 'category-sheet' }       // Stand oder Sonstiges?
  | { stage: 'type-sheet'; ... }      // Konkreten Typ wählen
  | { stage: 'awaiting-tap'; ... }    // Auf Karten-Tap warten
  | { stage: 'positioning'; ... }     // Marker verschieben
  | { stage: 'metadata'; ... }        // Name/Beschreibung eingeben
  | { stage: 'detail'; ... }          // Objekt anzeigen/bearbeiten
```

### 3.2 Karte vorhanden

**Ja.** `RevierMap.tsx` ist integriert (dynamisch importiert, SSR deaktiviert):
- Leaflet MapContainer mit TileLayer (BKG TopPlus Open)
- Boundary wird als GeoJSON-Polygon angezeigt (read-only)
- Objekt-Marker mit Click-Handling
- Preview-Pins bei Erstellung
- GPS + Kompass-Overlay

### 3.3 Grenze-Bearbeitungsmöglichkeit

**Fehlt komplett.** Die Boundary wird nur read-only angezeigt (Zeile 199-208 in RevierMap.tsx):
```tsx
{boundary && boundary.length > 0 && (
  <Polygon positions={boundary[0]} pathOptions={...} />
)}
```

Kein Edit-Layer, kein Draw-Control, kein "Grenze bearbeiten"-Button.

### 3.4 Integrationspunkte

| Wo | Wie | Aufwand |
|----|-----|---------|
| **Header-Bar** (Zeile 326-355) | Button neben Back-Button, togglet neue Stage | Gering |
| **State-Machine** | Neue Stage `{ stage: 'boundary-edit' }` | Gering |
| **RevierMap.tsx** | Neue Props `editBoundary`, `onBoundaryChange` + leaflet-draw Integration | Mittel |
| **Sheet-Pattern** | Analog zu ObjektDetailSheet — Speichern/Abbrechen/Löschen | Gering |

leaflet + leaflet-draw sind bereits installiert und konfiguriert. Die deutsche Übersetzung existiert in boundary-editor.tsx und kann wiederverwendet werden.

---

## 4. Schema / Datenmodell für Grenzen

### 4.1 Zwei Tabellen, ein Zweck

| Tabelle | Schema | Typ | Benutzt von |
|---------|--------|-----|-------------|
| `reviere` | 001_initial_schema.sql | `geography(Polygon, 4326)` | Archivierte Revierzentrale, boundary-editor.tsx |
| `districts` | 003_quickhunt_schema.sql | `geometry(Polygon, 4326)` | QuickHunt, Du-Flow, Live-Jagd |

**`reviere` ≠ `districts`.** Unterschiedliche Tabellen, unterschiedliche PostGIS-Typen (`geography` vs `geometry`), unterschiedlicher Code.

### 4.2 Hunts und Boundaries

```sql
-- 003_quickhunt_schema.sql
CREATE TABLE hunts (
  ...
  district_id UUID REFERENCES districts(id),  -- optionale FK
  -- KEIN boundary-Feld!
);
```

- `hunt.district_id IS NOT NULL` → Boundary aus `districts.boundary` lesen
- `hunt.district_id IS NULL` → Freie Jagd, Boundary wird über BoundarySheet neu erstellt und in `districts` gespeichert, dann verknüpft

### 4.3 Wer liest was

| Kontext | Tabelle | Wie |
|---------|---------|-----|
| Hunt-Create: Revier wählen | `districts.boundary` | `.from('districts').select('boundary').eq('id', selectedDistrictId)` |
| Live-Jagd: Grenze anzeigen | `districts.boundary` | Via `hunt.district_id` → districts JOIN |
| Du-Flow: Revier bearbeiten | `districts.boundary` | `.from('districts').select('...').eq('id', id)` |
| BoundarySheet: Grenze speichern | `districts` | INSERT oder UPDATE |
| boundary-editor.tsx (Archiv) | `reviere` | `.from('reviere').update(...)` |

---

## 5. Empfehlung Sub-Prompt-Struktur 57.1b ff.

### 57.1b — Grenze-Editor in Revier-Einstellungen integrieren

**Scope:**
- Neue Stage `boundary-edit` in revier-content.tsx State-Machine
- Header-Button "Grenze bearbeiten" (oder "Grenze zeichnen" wenn keine existiert)
- leaflet-draw Integration in RevierMap.tsx (kann Pattern aus boundary-editor.tsx übernehmen)
- Speichern → `UPDATE districts SET boundary = $ewkt WHERE id = $id`
- Löschen-Option mit Bestätigung

**Abnahme:**
- [ ] Button in Revier-Einstellungen sichtbar
- [ ] Polygon zeichnen funktioniert (>= 3 Punkte)
- [ ] Bestehendes Polygon bearbeiten (Vertices verschieben/löschen/einfügen)
- [ ] Speichern aktualisiert `districts.boundary` + `area_ha`
- [ ] Löschen entfernt Boundary
- [ ] Fläche (ha) wird beim Zeichnen live angezeigt

**Abhängigkeiten:** Keine. Kann unabhängig gebaut werden.

### 57.1c — Grenze-Editor in Live-Jagd einschränken

**Scope:**
- "Grenze zeichnen/bearbeiten"-Button in MapContent.tsx nur noch anzeigen wenn:
  - `!districtId` (freie Jagd ohne verknüpftes Revier)
  - `isJagdleiter` (nur Jagdleiter darf Grenze zeichnen)
- Bei Jagd mit verknüpftem Revier: Grenze wird read-only angezeigt (schon der Fall), Button verschwindet

**Abnahme:**
- [ ] Freie Jagd + Jagdleiter: Button sichtbar, Zeichnen funktioniert
- [ ] Freie Jagd + Schütze: Button nicht sichtbar
- [ ] Jagd mit Revier: Button nicht sichtbar, Grenze read-only angezeigt
- [ ] Bestehendes Verhalten für freie Jagd bleibt intakt

**Abhängigkeiten:** Keine. Kann parallel zu 57.1b gebaut werden.

### 57.1d — Long-Press-Flow in Live-Jagd einschränken

**Scope:**
- Long-Press → MapObjectSheet: In der Live-Jagd deaktivieren oder auf eine Teilmenge beschränken
- Empfehlung: Long-Press komplett deaktivieren in der Jagd. Grund:
  - Revier-Objekte (Hochsitz, Kirrung, etc.) gehören in Revier-Einstellungen
  - Adhoc-Stände werden über den FAB erstellt
  - Long-Press hat keine Rollenbeschränkung (jeder User kann Revier-Objekte anlegen)

**Alternative:** Long-Press beibehalten, aber MapObjectSheet nur Adhoc-Stand-Erstellung erlauben (analog zum FAB-Flow). In dem Fall:
- Long-Press → direkt Adhoc-Stand platzieren (ohne Subtype-Auswahl)
- Oder: Long-Press → gleiches Subtype-Sheet wie FAB

**Abnahme:**
- [ ] Long-Press in Live-Jagd erstellt keine permanenten Revier-Objekte mehr
- [ ] Adhoc-Stand-Erstellung weiterhin möglich (via FAB)
- [ ] Bestehende Revier-Objekte auf der Karte bleiben sichtbar + anklickbar

**Abhängigkeiten:** Keine. Kann parallel gebaut werden.

### Empfohlene Reihenfolge

```
57.1b (Grenze in Revier-Einstellungen)  ← zuerst, weil es den neuen Weg aufmacht
  ↓
57.1c (Grenze in Jagd einschränken)     ← danach, weil der neue Weg existiert
  ↓
57.1d (Long-Press einschränken)          ← zuletzt, geringstes Risiko
```

57.1b und 57.1c können auch parallel gebaut werden — 57.1c hat kein funktionales Dependency auf 57.1b, aber aus UX-Sicht sollte der neue Weg existieren bevor der alte gesperrt wird.

---

## 6. Risiko-Hotspots / Migrationsbedarf

### 6.1 Zwei Tabellen (reviere vs districts)

**Risiko:** Die `reviere`-Tabelle aus Schema 001 und die `districts`-Tabelle aus Schema 003 existieren nebeneinander. Der aktive Code nutzt ausschließlich `districts`. Die einzigen aktiven Referenzen auf `reviere` sind:
- `src/components/map/boundary-editor.tsx` (nur von archivierter Revierzentrale importiert)
- `src/components/map/gpx-importer.tsx`

**Empfehlung:** Kein Migrationsbedarf jetzt. Mittelfristig `reviere` deprecated/entfernen. Für 57.1b ausschließlich `districts` nutzen.

### 6.2 Bestehende Hunts mit eigener Boundary

**Kein Risiko.** `hunts` hat kein eigenes `boundary`-Feld. Alle Boundaries liegen in `districts`. Wenn die Grenze eines Districts geändert wird, sehen alle verknüpften Jagden sofort die neue Grenze — das ist gewünschtes Verhalten.

### 6.3 Long-Press-erstellte Objekte in bestehenden Jagden

**Geringes Risiko.** Objekte die per Long-Press in einer Jagd erstellt wurden, liegen als `map_objects` mit `district_id` in der DB. Sie bleiben bestehen und werden in Revier-Einstellungen sichtbar. Das Entfernen des Long-Press-Flows ändert nichts an bestehenden Daten.

### 6.4 FAB-Sichtbarkeit bei Jagd mit Revier

**Kein Risiko.** Der FAB ist bereits korrekt auf `!districtId` geprüft. Er erscheint nur bei freier Jagd. Keine Änderung nötig.

### 6.5 BoundarySheet existingDistrict-Prop

**Achtung:** `MapContent.tsx` Zeile 1821 übergibt `existingDistrict` basierend auf `districtId && districtName`. Wenn 57.1c den Zeichenmodus für Jagd mit Revier sperrt, wird BoundarySheet für diesen Fall nie aufgerufen — kein Problem.

---

## 7. Offene Fragen an Moritz

### Vor 57.1b:

1. **Soll der Grenze-Editor im Du-Flow leaflet-draw nutzen** (wie boundary-editor.tsx, Vertices auf dem Polygon ziehen) **oder click-to-draw** (wie in MapContent.tsx, Punkte einzeln setzen)? Empfehlung: leaflet-draw — ausgereifter, bietet Vertex-Insert/Delete.

2. **Wo genau soll der "Grenze bearbeiten"-Button hin?** Optionen:
   - Im Header neben dem Back-Button
   - Als eigener FAB-Button auf der Karte
   - Als Menüpunkt in einem Options-Menü

### Vor 57.1d:

3. **Soll Long-Press in der Jagd komplett deaktiviert werden**, oder soll er auf Adhoc-Stände umgebaut werden? Die aktuelle Nutzung (permanente Revier-Objekte per Long-Press erstellen) widerspricht dem Architektur-Prinzip, aber vielleicht gibt es einen Use-Case dafür ("spontan eine Kirrung markieren während der Jagd")?

4. **Falls Long-Press beibehalten:** Soll er für alle User oder nur für Jagdleiter verfügbar sein?

### Generell:

5. **GPX-Import** (`gpx-importer.tsx`) nutzt noch die `reviere`-Tabelle. Soll das auf `districts` migriert werden, oder ist GPX-Import vorerst irrelevant?

---

## Anhang: Datei-Referenz

| Datei | Zeilen | Relevanz |
|-------|--------|----------|
| `src/components/hunt/MapContent.tsx` | 961-1175, 1330-1392, 1462, 1712-1802 | Boundary-Zeichner + FAB + Long-Press |
| `src/components/hunt/BoundarySheet.tsx` | 1-265 | Boundary speichern/benennen (districts) |
| `src/components/hunt/MapObjectSheet.tsx` | 1-100+ | Revier-Objekte erstellen (8 Typen) |
| `src/components/map/boundary-editor.tsx` | 1-270 | Alter leaflet-draw Editor (reviere) |
| `src/components/revier/RevierMap.tsx` | 1-210 | Karte in Revier-Einstellungen |
| `app/app/du/revier/[id]/revier-content.tsx` | 1-510 | Revier-Einstellungen UI |
| `app/app/du/revier/[id]/page.tsx` | 1-33 | Server-Loader für Revier |
| `app/app/hunt/[id]/page.tsx` | ~153 | Boundary laden via district_id |
| `supabase/migrations/001_initial_schema.sql` | 25-34 | `reviere` Tabelle |
| `supabase/migrations/003_quickhunt_schema.sql` | 124-136 | `districts` Tabelle |
| `supabase/migrations/022_adhoc_subtype.sql` | — | adhoc_subtype CHECK constraint |

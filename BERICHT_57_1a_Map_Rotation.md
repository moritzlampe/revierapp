# Map Rotation — Erkundungsbericht 57.1a

**Datum:** 14.04.2026
**Zweck:** Reconnaissance vor Implementation der Zwei-Finger-Rotations-Geste

---

## 1. Leaflet-Setup heute

### Versionen

| Paket | Version |
|---|---|
| leaflet | 1.9.4 |
| react-leaflet | ^5.0.0 |
| leaflet-draw | ^1.0.4 |
| @tmcw/togeojson | ^7.1.2 |
| @turf/turf | ^7.3.4 |

**react-leaflet WIRD verwendet** — entgegen der ursprünglichen Annahme nutzen alle drei Hauptkarten `MapContainer`, `useMap`, `Marker`, `Tooltip`, `Polygon` etc. aus react-leaflet. Leaflet wird zusätzlich direkt für `L.divIcon`, `L.latLngBounds`, `L.marker` etc. verwendet.

### Initialisierung der drei Hauptkarten

| Komponente | Datei | MapContainer-Optionen | Besonderheiten |
|---|---|---|---|
| **Hunt-Karte** | `src/components/hunt/MapContent.tsx` (~1700 Zeilen) | `zoomControl: false`, `attributionControl: true`, `touchZoom: true`, `doubleClickZoom: true`, `scrollWheelZoom: true` | Long-Press-Handler, Draw-Modus (manuell via click, nicht leaflet-draw), Layer-Switcher (3 Layer), Kataster-Overlay, WMS |
| **StandAssignment-Karte** | `src/components/hunt/StandAssignmentMap.tsx` (~427 Zeilen) | `zoomControl: false`, `attributionControl: false`, `touchZoom: true`, `doubleClickZoom: false`, `scrollWheelZoom: true` | Stand-Drag, Move-Mode, Layer-Switcher |
| **Revier-Karte** | `src/components/revier/RevierMap.tsx` (~245 Zeilen) | `zoomControl: false`, `attributionControl: false` | Preview-Pin, Objekt-Klick, GPS on-demand |

### Weitere Karten (Sekundär)

| Komponente | Datei | Rotation relevant? |
|---|---|---|
| Revierzentrale-Karte | `src/components/map/revier-map.tsx` | Nein (Desktop, Revierzentrale) |
| Setup-Karte | `app/app/revier/[id]/setup/setup-map.tsx` | Nein (Setup-Wizard) |
| Gast-Karte | `src/components/map/guest-map.tsx` | Nein (Demo/statisch) |
| Nachsuche-Karte | `src/components/map/nachsuche-map.tsx` | Nein (statischer Punkt) |
| Boundary-Editor | `src/components/map/boundary-editor.tsx` | Indirekt (nutzt leaflet-draw) |
| Zone-Editor | `src/components/map/zone-editor.tsx` | Indirekt (nutzt leaflet-draw) |

### SSR-Handling

Alle Karten werden via `dynamic(() => import(...), { ssr: false })` geladen:
- `MapContent` → via `src/components/hunt/MapView.tsx`
- `StandAssignmentMap` → via `src/components/hunt/StandAssignmentMapView.tsx`
- `RevierMap` → via `app/app/du/revier/[id]/revier-content.tsx`

### Gemeinsamer Abstraktions-Layer

**Keiner.** Jede Karte ist eigenständig. Gemeinsam genutzt werden nur:
- `useInvalidateOnResize` Hook (einfacher resize/orientationchange Handler)
- `OwnPositionMarker` Komponente (Hunt + StandAssignment + Revier)
- `CompassToggleButton` Komponente (Hunt + StandAssignment + Revier)
- `useCompassHeading` Hook (Hunt + StandAssignment + Revier)
- `pin-svg.ts` / `marker-labels.ts` (Hunt + Revier)

Es gibt keinen gemeinsamen Map-Wrapper. Das leaflet-rotate-Plugin müsste an jeder Karte einzeln aktiviert werden.

---

## 2. Plugin-Empfehlung

### Empfehlung: Raruto/leaflet-rotate

**Repository:** https://github.com/Raruto/leaflet-rotate
**npm:** `leaflet-rotate` v0.2.8 (Juli 2023)
**Downloads:** ~8.900/Woche
**Lizenz:** ⚠️ **GPL-3.0** (Copyleft — muss geprüft werden für kommerzielles SaaS!)
**Bundle:** ~22 kB minified, ~7-8 kB gzipped
**Abhängigkeiten:** Keine

#### Funktionsweise

Das Plugin monkey-patcht Leaflet core via `L.Class.include()`. Es erweitert die Map-Klasse um Rotation. Dadurch funktioniert es UNTER react-leaflet, da react-leaflet nur ein Wrapper ist.

#### Kompatibilität

| Kriterium | Status |
|---|---|
| Leaflet 1.9.4 | ✅ Explizit kompatibel lt. README |
| react-leaflet 5.x | ⚠️ Keine offizielle Doku, sollte funktionieren (monkey-patch auf Leaflet-Ebene) |
| Next.js SSR | ✅ Kein Problem — wird zusammen mit Leaflet im `dynamic(ssr: false)` Block geladen |
| leaflet-draw | ⚠️ **Bekannte Probleme**: Edit-Handles driften auf rotierter Karte |

#### Aktivierung

```js
import 'leaflet-rotate'  // Monkey-patcht L.Map

<MapContainer
  rotate={true}
  touchRotate={true}
  bearing={0}
  // ...
>
```

#### API

- `map.setBearing(degrees)` — Rotation setzen (0 = Nord)
- `map.getBearing()` — Aktuelle Rotation lesen
- `map.touchRotate.enable()` / `.disable()` — Runtime-Toggle
- `map.shiftKeyRotate.enable()` / `.disable()` — Desktop Shift+Drag

#### Zwei-Finger-Geste

**Out of the box** mit `touchRotate: true`. Die Geste erkennt automatisch Zwei-Finger-Drehung und rotiert die Karte entsprechend. Pinch-Zoom bleibt parallel funktionsfähig (Kombination aus Zoom + Rotation bei Zwei-Finger-Geste).

### Bekannte Risiken

1. **GPL-3.0 Lizenz** — Copyleft. Bei SaaS-Nutzung im Browser technisch unklar ob "distribution" vorliegt. Moritz sollte das prüfen.
2. **Dormant Maintenance** — Letzter Commit ~3 Jahre her. Funktional, aber keine Bugfixes zu erwarten.
3. **leaflet-draw Konflikte** — Polygon-Editing auf rotierter Karte hat bekannte Drift-Probleme. Betrifft die Revierzentrale (Boundary-Editor, Zone-Editor), NICHT die drei Haupt-Karten.

### Alternativen

| Alternative | Bewertung |
|---|---|
| CSS `transform: rotate()` auf Map-Container | ❌ Bricht Koordinaten-Mapping (`containerPointToLatLng`). Marker/Popups verschoben. Tiles unscharf. Nicht praktikabel. |
| MapLibre GL JS | Nativ-Rotation + Vector Tiles. Langfristig besser, aber riesiger Migrationsaufwand (~200 kB gzip Bundle). Nicht für 57.x. |
| Eigene L.Map-Extension | Möglich aber enormer Aufwand — leaflet-rotate hat Jahre Entwicklung. |

**Klare Empfehlung: leaflet-rotate verwenden.** Risiko = Lizenz + leaflet-draw auf rotierter Karte.

---

## 3. Marker- und Label-Rotation

### Betroffene Marker-Typen

| Marker-Typ | Rendering | Datei | Bei Rotation |
|---|---|---|---|
| Teilnehmer (Hunt) | `L.divIcon` mit CSS-Klassen | `MapContent.tsx:360-378` | Bleiben aufrecht (DivIcons werden separat positioniert, nicht rotiert) ✅ |
| Stand-Pins | `L.divIcon` mit SVG aus `pin-svg.ts` | `MapContent.tsx:434-456` | Bleiben aufrecht ✅ |
| Freie Positionen | `L.divIcon` mit Avatar-Div | `MapContent.tsx:532-540` | Bleiben aufrecht ✅ |
| OwnPositionMarker | `L.divIcon` mit SVG (Dot + Kegel) | `OwnPositionMarker.tsx` | Dot bleibt aufrecht ✅, **Kegel muss kompensiert werden** ⚠️ |
| Assign-Stand-Marker | `L.divIcon` mit HTML | `StandAssignmentMap.tsx:164-174` | Bleiben aufrecht ✅ |
| Revier-Pin-Icons | `L.divIcon` mit SVG | `RevierMap.tsx:37-47` | Bleiben aufrecht ✅ |

### leaflet-rotate Marker-Verhalten

leaflet-rotate rotiert den **Tile-Layer und Vektor-Overlays** (Polygone, Polylines, Circles). **DivIcons/Marker bleiben standardmäßig aufrecht** — sie werden nur neu positioniert. Das ist das gewünschte Verhalten: Marker-Text soll immer lesbar bleiben.

### Tooltips und Popups

Tooltips (`direction: "top"`, `direction: "bottom"`) und Popups positionieren sich relativ zum Marker-Anchor. Da Marker aufrecht bleiben, bleiben auch Tooltips/Popups korrekt positioniert. **Kein Anpassungsbedarf.**

### Polygone und Overlays

| Overlay | Verhalten bei Rotation |
|---|---|
| Reviergrenze (Polygon) | Rotiert korrekt mit ✅ |
| Accuracy-Kreis (Circle) | Rotiert korrekt mit ✅ |
| Distanz-Linien (Polyline) | Rotieren korrekt mit ✅ |
| Zone-Hatching (SVG Pattern) | ⚠️ Muss getestet werden — SVG-Pattern mit `patternTransform: rotate(45)` könnte Artefakte zeigen |

---

## 4. Kegel / OwnPositionMarker

### Aktueller Stand

Der Kegel in `OwnPositionMarker.tsx` wird imperativ über `coneRef.current.style.transform = rotate(${deg}deg)` gesteuert. Das `deg` ist das **absolute Device-Heading** (0° = Nord, clockwise) direkt aus dem Kompass-Sensor.

### Problem bei rotierter Karte

Wenn die Karte z.B. um 45° rotiert ist (Osten zeigt nach oben), zeigt der Kegel trotzdem nach dem absoluten Heading. Da der DivIcon NICHT mitrotiert, stimmt die Richtung relativ zur Karte nicht mehr.

### Lösung

```
visueller_kegel_winkel = device_heading - map.getBearing()
```

Der `handleHeading`-Callback in allen drei Karten muss angepasst werden:

```ts
const handleHeading = useCallback((deg: number) => {
  const bearing = mapRef.current?.getBearing() ?? 0
  ownPositionRef.current?.setHeading(deg - bearing)
}, [])
```

Zusätzlich muss bei jeder Bearing-Änderung der Kegel aktualisiert werden (Event `rotate` oder `bearing`).

### Aufwand

- `OwnPositionMarker.tsx`: Interface unverändert (nimmt weiterhin berechneten Winkel)
- Alle drei Karten: `handleHeading` anpassen + Map-Bearing-Change-Listener
- Geschätzt ~15-20 Zeilen pro Karte

---

## 5. Kompass-Button-Logik

### Aktueller Stand

| Karte | State-Variable | Verhalten |
|---|---|---|
| Hunt (`MapContent.tsx`) | `compassEnabled` (boolean) + `getCompassEnabled()` aus localStorage | Ein/Aus Toggle. Zeigt Kegel auf eigenem Marker. |
| StandAssignment | `compassEnabled` (boolean) + `getCompassEnabled()` aus localStorage | Identisch |
| Revier (`RevierMap.tsx`) | `orientationActive` (boolean) | Ein/Aus Toggle. Aktiviert GPS + Kompass gleichzeitig. |

Die `CompassToggleButton`-Komponente (`src/components/map/CompassToggleButton.tsx`) kennt nur zwei visuelle Zustände: aktiv (grün, opacity 1) und inaktiv (dimmed, opacity 0.5).

### Geplanter Dreifach-Switch

| State | Anzeige | Button-Aktion |
|---|---|---|
| **Aus** | Kompass-Icon dimmed, Karte nord-oben | → Kompass an (Kegel zeigen) |
| **An (Kegel)** | Kompass-Icon grün, Kegel sichtbar, Karte frei drehbar | → Karte auf Nord zurücksetzen |
| **Zurück-auf-Nord** | Kompass-Icon dimmed, Karte nord-oben, Kegel weg | → Aus |

### Empfohlene State-Struktur

Kein dritter State nötig. Ableitung aus zwei bestehenden Werten:

```
compassEnabled (boolean) + mapBearing (number, aus map.getBearing())
```

| compassEnabled | mapBearing | Nächste Aktion bei Tap |
|---|---|---|
| false | 0 | → compassEnabled = true |
| true | !== 0 | → map.setBearing(0), compassEnabled bleibt true |
| true | 0 | → compassEnabled = false |

Das Button-Icon kann den Bearing visuell anzeigen (CSS-Rotation der Kompass-Nadel um `-bearing` Grad), sodass die Nadel immer nach Nord zeigt — genau wie Google Maps.

### Anpassungen an CompassToggleButton

- Neues Prop: `bearing: number`
- SVG-Nadel rotiert um `-bearing` Grad
- Opacity/Farbe: drei Zustände statt zwei
- Geschätzt ~20 Zeilen Änderung

---

## 6. Rollout-Empfehlung

### Empfehlung: Alle drei Karten gleichzeitig

**Begründung:**

1. Die Plugin-Aktivierung ist global (monkey-patch auf `L.Map`). Sobald `import 'leaflet-rotate'` geladen wird, sind ALLE Karten betroffen.
2. Ohne `rotate: true` in den MapContainer-Props bleibt Rotation deaktiviert — aber das Plugin ist trotzdem geladen.
3. Konsistente UX: Wenn die Hunt-Karte drehbar ist, erwartet der User dasselbe in StandAssignment und Revier.
4. Die OwnPositionMarker-Kegel-Kompensation muss ohnehin in allen drei Karten implementiert werden.

### Reihenfolge innerhalb eines Sub-Prompts

1. Plugin installieren + Import (global, einmalig)
2. Hunt-Karte aktivieren (größte, meiste Features → höchstes Risiko)
3. StandAssignment-Karte aktivieren
4. Revier-Karte aktivieren
5. CompassToggleButton → Dreifach-Logik
6. OwnPositionMarker-Kegel-Kompensation

### Risiko-Hotspots (Code der "Karte ist nord-oben" annimmt)

| Stelle | Datei:Zeile | Risiko |
|---|---|---|
| `containerPointToLatLng` (Long-Press) | `MapContent.tsx:232, 254` | ✅ Kein Problem — leaflet-rotate überschreibt diese Methode, kompensiert Rotation automatisch |
| `fitBounds` / `flyTo` | Diverse Stellen (6+ Aufrufe) | ✅ leaflet-rotate überschreibt diese Methoden |
| `map.getCenter()` Distanz-Berechnung | `MapContent.tsx:160` | ✅ Kein Problem — getCenter() liefert korrekte LatLng |
| `distanceInMeters` (Haversine) | `MapContent.tsx:357` | ✅ Rein mathematisch, nicht kartenabhängig |
| **Boundary-Editor (leaflet-draw)** | `boundary-editor.tsx` | ⚠️ **Edit-Handles können driften auf rotierter Karte** |
| **Zone-Editor (leaflet-draw)** | `zone-editor.tsx` | ⚠️ Gleiches Problem wie Boundary-Editor |
| Zone-Hatching SVG Pattern | `zone-layers.tsx:28` | ⚠️ Visuell testen — Pattern könnte bei Rotation komisch aussehen |

### Leaflet-Draw-Entschärfung

Boundary-Editor und Zone-Editor laufen nur in der **Revierzentrale** (Desktop). Dort kann Rotation initial deaktiviert oder die Rotation temporär auf 0 gesetzt werden, solange ein Draw-Tool aktiv ist. Das ist ein akzeptabler Kompromiss.

---

## 7. Vorschlag Sub-Prompt-Struktur 57.1b ff.

### 57.1b — Plugin-Integration + Drei-Karten-Aktivierung

**Scope:**
1. `npm install leaflet-rotate`
2. `import 'leaflet-rotate'` in allen drei Map-Wrappern (vor Leaflet-Nutzung)
3. `rotate: true`, `touchRotate: true`, `bearing: 0` als Props an alle drei `<MapContainer>`
4. TypeScript-Typen erweitern (MapOptions um `rotate`, `touchRotate`, `bearing`)
5. Kegel-Kompensation in `handleHeading` aller drei Karten
6. Map `rotateend`/`rotate` Event-Listener für Kegel-Update

**Abnahme-Kriterien:**
- Zwei-Finger-Rotation funktioniert auf allen drei Karten
- Pinch-Zoom funktioniert weiterhin
- OwnPositionMarker-Kegel zeigt korrekte Richtung auf rotierter Karte
- Marker und Tooltips bleiben aufrecht und lesbar
- Build ohne TypeScript-Fehler

### 57.1c — Kompass-Button Dreifach-Logik

**Scope:**
1. `CompassToggleButton` um `bearing`-Prop erweitern
2. Nadel-SVG rotiert um `-bearing` (zeigt immer Nord)
3. Dreifach-Tap-Logik: Aus → An → Nord-Reset → Aus
4. `map.setBearing(0)` bei Nord-Reset (mit Animation)
5. `mapBearing` State in allen drei Karten tracken (via `rotateend` Event)

**Abnahme-Kriterien:**
- Dreifach-Tap-Zyklus funktioniert korrekt
- Kompass-Nadel zeigt auf rotierter Karte nach Nord
- Bei Bearing=0 automatisch zurück in Aus-Zustand
- Smooth Animation bei Nord-Reset

### 57.1d — Polish + Edge Cases

**Scope:**
1. Leaflet-draw Schutz: Rotation temporär deaktivieren wenn Boundary/Zone-Editor aktiv
2. Zone-Hatching bei Rotation testen und ggf. fixen
3. Doppelklick-Zoom testen (darf nicht von Touch-Rotation beeinflusst werden)
4. Stand-Drag (Move-Mode) bei rotierter Karte testen
5. Landscape-Modus bei rotierter Karte testen (useInvalidateOnResize)

**Abnahme-Kriterien:**
- Boundary-Editor funktioniert ohne Drift
- Stand-Verschiebung korrekt auf rotierter Karte
- Keine Regression bei Landscape-Rotation

---

## 8. Test-Matrix

### Kritische Test-Szenarien (iPhone Safari)

| # | Szenario | Karte | Worauf achten |
|---|---|---|---|
| 1 | **Zwei-Finger-Rotation** | Hunt | Karte rotiert smooth, kein Ruckeln |
| 2 | **Pinch-Zoom bei rotierter Karte** | Hunt | Zoom funktioniert, Rotation bleibt stabil |
| 3 | **Kompass-Kegel auf rotierter Karte** | Hunt | Kegel zeigt korrekte Himmelsrichtung |
| 4 | **Kompass-Button Dreifach-Zyklus** | Hunt | Aus → An → Nord-Reset → Aus, korrekte Icons |
| 5 | **Long-Press auf rotierter Karte** | Hunt | Pin wird an korrekter Stelle gesetzt (containerPointToLatLng) |
| 6 | **Teilnehmer-Marker auf rotierter Karte** | Hunt | Marker aufrecht, Popup korrekt positioniert, Distanz korrekt |
| 7 | **Stand-Drag (Move-Mode) bei Rotation** | Hunt | Stand landet an korrekter Position |
| 8 | **Boundary-Editor aktiv → Rotation deaktiviert** | Revierzentrale | Polygon-Editing ohne Drift |

### Sekundäre Tests

| # | Szenario | Karte |
|---|---|---|
| 9 | RecenterButton ("Zurück zu mir") auf rotierter Karte | Hunt |
| 10 | FitAllButton ("Alle Teilnehmer") auf rotierter Karte | Hunt |
| 11 | Layer-Wechsel bei rotierter Karte (Topo → Satellit) | Hunt |
| 12 | Revier-Objekte tippen auf rotierter Karte | Revier |
| 13 | Landscape-Rotation (Handy kippen) bei rotierter Karte | Alle drei |

---

## 9. Offene Fragen an Moritz

1. **GPL-3.0 Lizenz von leaflet-rotate:** Ist das akzeptabel für RevierApp als kommerzielles SaaS? Das Plugin wird im Browser-Bundle ausgeliefert. Alternativen wären: (a) eigene Implementation des Rotation-Patches, (b) Kontaktaufnahme mit dem Maintainer für dual-licensing, (c) MapLibre-Migration (langfristig).

2. **Rotation in Revierzentrale (Desktop):** Soll die Karte dort auch rotierbar sein? Aktuell nutzt die Revierzentrale leaflet-draw für Boundary/Zone-Editing — das kollidiert mit Rotation. Empfehlung: Desktop-Karten vorerst NICHT rotierbar machen.

3. **Maximaler Rotationswinkel:** Soll die Rotation auf ±180° begrenzt werden oder frei 360° drehbar sein? leaflet-rotate unterstützt beides.

4. **Nord-Reset Animation:** Soll der Nord-Reset smooth animiert sein (0.3s) oder instant? Smooth fühlt sich besser an, aber zeigt kurz eine "verwirrende" Zwischen-Rotation.

5. **Rotation persistieren?** Soll der letzte Bearing-Wert beim Verlassen der Karte gespeichert werden (localStorage) oder immer bei 0 starten? Empfehlung: Immer bei 0 starten — konsistenter.

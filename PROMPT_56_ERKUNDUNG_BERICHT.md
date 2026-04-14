# Prompt 56 — Erkundungsbericht: Kompass am eigenen Standort

Stand: 2026-04-14

---

## 1. User-Standort-Marker — wo lebt der?

### Datei

**`src/components/hunt/OwnPositionMarker.tsx`** (73 Zeilen)

Zentrale, wiederverwendbare Komponente. Wird an **zwei Stellen** eingebunden:

| Karten-View | Datei | Zeile |
|---|---|---|
| Hunt Live Map | `src/components/hunt/MapContent.tsx` | 1574–1579 |
| Stand-Zuweisung | `src/components/hunt/StandAssignmentMap.tsx` | 346–351 |

Es gibt **keine Duplikate** — beide Views nutzen dieselbe Komponente.

### Leaflet-Primitive

Drei gestapelte react-leaflet-Elemente, **alle SVG-basiert**:

1. **`<Circle>`** — Accuracy-Radius (Meter-genau, blau-transluzent)
2. **`<CircleMarker>` (outer)** — Puls-Ring, `radius={12}`, CSS-Klasse `gps-pulse`
3. **`<CircleMarker>` (inner)** — Blauer Punkt, `radius={6}`, weißer Rand

### Styling

- Farbe: `#42A5F5` (CSS-Variable `--blue`), weiße Border `#ffffff`
- Opacity variiert nach Accuracy: `>30m` → 70%, `≤30m` → 100%
- Pulse-Animation in `globals.css:204–211`:
  ```css
  .gps-pulse path { animation: gps-pulse-ring 2s ease-out infinite; }
  ```
- **Kein SVG-Inline, kein Emoji, kein `L.divIcon`.** Alles `pathOptions` auf `CircleMarker`.

### Implikation für Kompass

`CircleMarker` erzeugt einen **SVG `<circle>`** — das kann man nicht rotieren
(ein Kreis hat keine Richtung). Für einen Sichtkegel/Pfeil brauchen wir ein
**zusätzliches** Element, das per CSS-Transform gedreht werden kann. Optionen:

- **`L.divIcon` mit SVG/CSS** (bevorzugt): Eigener Marker mit `transform: rotate(Xdeg)`
- **SVG `<path>`** als Overlay (z.B. ein Kegel-Polygon via react-leaflet `Polygon`)
- **Canvas-Layer** (Overkill für einen einzelnen Kegel)

**Empfehlung:** Neues `<Marker>` mit `L.divIcon` **zusätzlich** zum bestehenden
`CircleMarker`-Stack. Das `divIcon` enthält einen SVG-Kegel, dessen `transform: rotate()`
per Ref direkt am DOM manipuliert wird (kein React-Re-Render).

---

## 2. Marker-Update-Pattern

### Aktuelles Verhalten

`OwnPositionMarker` bekommt `position` und `accuracy` als Props. Bei GPS-Update
ändert sich der State in `useGeolocation` → React re-rendert → react-leaflet
aktualisiert die Marker intern via `setLatLng` / Leaflet-Lifecycle.

**Kein Ref, kein direkter DOM-Zugriff.** Die Komponente nutzt aktuell nur Props.

### Implikation für Heading

GPS-Updates: ~1/s → React-Re-Render ist ok.
Heading-Updates: bis 60 Hz → **React-Re-Render ist NICHT ok.**

**Lösung:** Ein `useRef<HTMLDivElement>` auf das DOM-Element des `divIcon`,
darin per `requestAnimationFrame` die `transform: rotate()` setzen.

Konkretes Pattern:
```tsx
const headingRef = useRef<HTMLDivElement>(null)
// Im DeviceOrientation-Handler (rAF-throttled):
if (headingRef.current) {
  headingRef.current.style.transform = `rotate(${heading}deg)`
}
```

react-leaflet's `<Marker>` bietet leider kein direktes Ref auf das DOM.
Workaround: `useMap()` + Leaflet's `L.marker` manuell erzeugen, oder über
`eventHandlers={{ add: (e) => markerRef.current = e.target }}` die Leaflet-
Instanz greifen und dann `marker.getElement()` nutzen.

**Empfehlung:** Eigener `useEffect` in `OwnPositionMarker`, der einen
`L.marker` mit `L.divIcon` imperativ erstellt (nicht react-leaflet declarative).
So hat man volle Kontrolle über das DOM-Element und kann direkt rotieren.

---

## 3. DeviceOrientation — schon was im Codebase?

**Nichts gefunden.** Kein einziger Treffer für:
- `DeviceOrientationEvent`
- `deviceorientation`
- `deviceorientationabsolute`
- `requestPermission` (im Orientation-Kontext)
- `compass`, `heading`, `orientation` (im Sensor-Kontext)
- `webkitCompassHeading`

**Alles muss neu gebaut werden.** Kein Code zum Wiederverwenden.

---

## 4. iOS-Permission-Flow — wo anhängen?

### Das Problem

iOS 13+ verlangt `DeviceOrientationEvent.requestPermission()` nach User-Geste.
Android braucht keine Permission — `deviceorientationabsolute` feuert sofort.

### Einhängpunkt für Button

Aktuelle Karten-Controls-Positionen in `MapContent.tsx`:

| Position | Was | z-Index |
|---|---|---|
| top-left `0.75rem` | GpsStatusBadge | 1000 |
| top-right `0.75rem` | LayerSwitcher | 1000 |
| bottom-right `4.25rem` | Recenter-Button | 1000 |
| bottom-right `0.75rem` | Fit-All-Button | 1000 |
| bottom-right `7.5rem+` | FAB (+) | 1050 |

**Freie Positionen:**
- **top-left unter GpsStatusBadge** (~`top: 3.25rem, left: 0.75rem`) — gut erreichbar, visuell nah an GPS-Info
- **bottom-right `7.5rem`** (über Recenter) — knapp, kollidiert mit FAB
- **top-right unter LayerSwitcher** (~`top: 3.25rem, right: 0.75rem`) — kollidiert mit Layer-Panel wenn offen

**Empfehlung:** Kompass-Toggle **unter den GpsStatusBadge** (top-left, `3.25rem`).
Nutzt die bestehende `.map-btn` CSS-Klasse. Einhäng-Punkt: `MapContent.tsx:1281`.

### Alternativer Approach: Integration IN den GpsStatusBadge

Statt separatem Button: den GpsStatusBadge selbst als Tap-Target für die
Kompass-Permission nutzen. Text ändert sich zu "📍 Fixiert — 🧭 Kompass?"
beim ersten Mal. Spart einen Button.

**Empfehlung:** Separater Button ist klarer. GpsStatusBadge hat eine andere
Semantik (Feedback) als ein Toggle (Aktion).

### Permission-Status merken

Bestehendes Pattern: `localStorage` für Map-Layer-Präferenz (`LAYER_STORAGE_KEY`,
MapContent.tsx:38). Gleiche Strategie:

```ts
localStorage.setItem('revierapp-compass-enabled', 'true')
```

**Aber:** iOS DeviceOrientation-Permission ist **session-basiert** — überlebt
nicht den Browser-Restart. Der Toggle merkt sich nur "User will Kompass" und
triggert `requestPermission()` beim nächsten Load automatisch nach einer Geste.

**Bestehendes Permission-Pattern:** `usePushNotifications.ts` prüft State
(`unsupported | prompt | granted | denied`) und bietet `subscribe()`-Callback.
Gleiches Pattern für Heading sinnvoll: `useDeviceHeading()` Hook mit States.

---

## 5. rAF-Throttle — Pattern vorhanden?

### Bestehendes

`requestAnimationFrame` wird in `ChatPanel.tsx` benutzt — aber nur für
`scrollIntoView()`-Aufrufe (DOM-Sync), **nicht** für Event-Stream-Throttling.

**Kein Throttle-Pattern vorhanden.** Muss gebaut werden.

### Benötigtes Pattern

```ts
const rafId = useRef<number>(0)
const latestHeading = useRef<number>(0)

function onOrientation(event: DeviceOrientationEvent) {
  // Heading extrahieren (plattformabhängig)
  latestHeading.current = getAbsoluteHeading(event)
  if (!rafId.current) {
    rafId.current = requestAnimationFrame(() => {
      applyRotation(latestHeading.current)
      rafId.current = 0
    })
  }
}
```

Garantiert max 1 DOM-Update pro Frame (~60Hz cap), verarbeitet aber immer den
**neuesten** Wert (kein Stale-Heading).

---

## 6. HTTPS / Sensor-Requirements

### HTTPS-Status

- **Live:** `quickhunt.de` mit Let's Encrypt → HTTPS ✅
- **Coolify/sslip:** HTTP-only laut CLAUDE.md → DeviceOrientation wird **NICHT**
  funktionieren auf der sslip-URL. Nur auf `quickhunt.de`.
- **localhost:** Browser erlauben Sensor-APIs auf localhost ohne HTTPS ✅

### Plattformübergreifende Heading-Abstraktion

| Plattform | Event | Property | Wertebereich |
|---|---|---|---|
| **iOS Safari** | `deviceorientation` | `event.webkitCompassHeading` | 0–360° (Grad von Nord, im Uhrzeigersinn) |
| **Chrome Android** | `deviceorientationabsolute` | `event.alpha` | 0–360° (invertiert: `360 - alpha`) |
| **Firefox Android** | `deviceorientation` | `event.alpha` (wenn `absolute: true`) | 0–360° (invertiert) |

Empfohlene Abstraktion:

```ts
function getAbsoluteHeading(event: DeviceOrientationEvent): number | null {
  // iOS: webkitCompassHeading ist bereits absolute Gradzahl von Nord
  if ('webkitCompassHeading' in event) {
    return (event as any).webkitCompassHeading as number
  }
  // Android/Chrome: alpha ist relativ zu geräte-spezifischem Nullpunkt
  // Bei absolutem Event: heading = 360 - alpha
  if (event.absolute && event.alpha != null) {
    return (360 - event.alpha) % 360
  }
  return null // Kein absolutes Heading verfügbar
}
```

**iOS Permission-Flow:**
```ts
if (typeof DeviceOrientationEvent !== 'undefined'
    && 'requestPermission' in DeviceOrientationEvent) {
  // iOS 13+
  const result = await (DeviceOrientationEvent as any).requestPermission()
  if (result === 'granted') { /* listener registrieren */ }
} else {
  // Android / Desktop — direkt registrieren
  window.addEventListener('deviceorientationabsolute', handler)
  // Fallback auf deviceorientation
  window.addEventListener('deviceorientation', handler)
}
```

---

## 7. Kegel vs. Pfeil — visuelle Optionen

### Option A: Schmaler Pfeil (Google-Maps-Stil)

```
    ▲          (Pfeilspitze zeigt Blickrichtung)
   / \
  /   \       Höhe: ~18px, an den blauen Punkt angehängt
```

- **Pro:** Kleiner Footprint, bekanntes Pattern, lenkt nicht von der Karte ab
- **Contra:** Zeigt nur Richtung, nicht Sichtfeld
- **Passt zu:** Aktuellem Marker (klein, subtil, ~6px Radius)

### Option B: Breiter Sichtkegel (~60°)

```
   \   |   /
    \  |  /
     \ | /
      \|/
       ●       (blauer Punkt)
```

- **Pro:** Kommuniziert Blickrichtung UND Unsicherheit/Sichtfeld
- **Contra:** Verdeckt Karten-Detail, visuell dominant
- **Passt zu:** Jagd-Kontext (Schussfeld-Visualisierung, "wo gucke ich hin")

### Option C: Kreis + Pfeilspitze außen (Empfehlung)

```
       ▲       (kleine Dreiecks-Spitze am Rand des blauen Punkts)
      ╭─╮
      │●│      (bestehender blauer Punkt bleibt unverändert)
      ╰─╯
```

- **Pro:** Minimal-invasiv, bestehender Marker bleibt intakt, Pfeil dreht am Rand
- **Contra:** Bei kleinem Zoom schwer sichtbar
- **Passt am besten zum aktuellen Design:** Der blaue Punkt (6px Radius, 12px Ring)
  ist bewusst dezent. Ein 60°-Kegel würde das domieren.

**Empfehlung:** Option C als Default, Option B als spätere "Schussfeld"-Erweiterung
(z.B. konfigurierbar im Jagd-Setup: Sichtkegel ein/aus).

---

## 8. Edge Cases / Stolpersteine

### GPS noch keine Position, Kompass liefert schon Heading

`OwnPositionMarker` wird nur gerendert wenn `geoState.position` vorhanden ist
(MapContent.tsx:1574). **Heading-Werte ohne Position werden automatisch ignoriert**
— der Marker existiert schlicht nicht.

**Maßnahme:** Heading im Hook trotzdem puffern. Sobald Position kommt, sofort
den aktuellen Heading anwenden. Kein extra Handling nötig.

### Accuracy > 10m (noch nicht gelockt)

Aktuell zeigt der Marker bei `>30m` reduzierten Opacity (70%). Der Punkt ist
trotzdem sichtbar und hat eine Position.

**Empfehlung:** Kegel/Pfeil **immer** zeigen wenn Heading vorhanden — unabhängig
vom Lock-Status. Begründung: Selbst bei 30m Ungenauigkeit ist die Blickrichtung
trotzdem korrekt (Kompass ≠ GPS).

### User lehnt Permission ab

**iOS:** `requestPermission()` gibt `'denied'` zurück → Kein Listener registriert,
kein Heading, kein Kegel. Nur der bestehende blaue Punkt.

**Maßnahme:** Stiller Fallback (kein Toast, kein Error-Badge). Der Kompass-Button
zeigt visuell "inaktiv" (z.B. ausgegraut). Tap öffnet ggf. Hinweis:
"Kompass wurde blockiert — in Browser-Einstellungen freigeben."

### Kompass-Kalibrierung / Drift

**iOS:** Figure-8-Kalibrierung wird vom OS automatisch angefordert. Kein App-seitiger
Eingriff nötig.

**Android:** Magnetometer kann driften, besonders bei Metall in der Nähe (Hochsitz,
Waffe). Ein `accuracy`-Property existiert auf dem Event — bei schlechter Kalibrierung
könnten wir den Kegel schwächer zeichnen (z.B. reduzierte Opacity).

**Empfehlung:** V1 ohne Kalibrierungs-UI. Wenn in der Praxis Drift-Beschwerden
kommen → Hinweis-Toast "Kompass kalibrieren: Handy in 8er-Bewegung drehen" als V2.

### Safari Compass True North

`webkitCompassHeading` liefert **True North** (geografisch), nicht Magnetic North.
Android's `alpha` kann magnetisch sein. Für Jagd-Zwecke (50m-Genauigkeit, nicht
Navigation) ist der Unterschied (~2° Deklination in Norddeutschland) irrelevant.

---

## 9. Abhängigkeiten & Aufwand

### Neue Libraries

**Keine.** Alles geht mit:
- `window.DeviceOrientationEvent` (native Web API)
- `requestAnimationFrame` (native)
- `L.marker` + `L.divIcon` (Leaflet, bereits im Projekt)
- CSS `transform: rotate()` (native)

### Dateien & geschätzte LOC

| Datei | Aktion | ~LOC |
|---|---|---|
| `src/hooks/useDeviceHeading.ts` | **NEU** — Hook für Heading + Permission + rAF-Throttle | ~80 |
| `src/components/hunt/OwnPositionMarker.tsx` | **ERWEITERN** — Heading-Pfeil als `L.marker` + `divIcon` | +40 |
| `src/components/hunt/MapContent.tsx` | **ERWEITERN** — Kompass-Toggle-Button + State | +25 |
| `app/globals.css` | **ERWEITERN** — CSS für Heading-Pfeil, Transition, Button-Style | +15 |

**Gesamt: ~160 LOC neu, 0 Libraries, 4 Dateien.**

---

## Implementierungs-Plan (Skizze für Prompt 57)

### Schritt 1: `useDeviceHeading` Hook

- Neuer Hook in `src/hooks/useDeviceHeading.ts`
- States: `'unsupported' | 'prompt' | 'active' | 'denied'`
- iOS requestPermission-Flow + Android auto-start
- rAF-Throttle: `latestHeading` Ref + 1 rAF pro Frame
- Plattform-Abstraktion: `getAbsoluteHeading()` (iOS webkitCompassHeading vs. Android alpha)
- Gibt zurück: `{ heading: number | null, state, requestPermission }`
- localStorage-Toggle: `revierapp-compass-enabled`

### Schritt 2: Heading-Pfeil in OwnPositionMarker

- `L.marker` mit `L.divIcon` erzeugen (imperativ via `useMap()` + `useEffect`)
- SVG-Pfeil (Dreieck/Kegel) als innerHTML des divIcon
- Ref auf `marker.getElement()` → `style.transform = rotate(Xdeg)` direkt setzen
- Bestehende CircleMarker bleiben unverändert (kein Breaking Change)
- Prop `heading: number | null` — wenn `null`, Pfeil verstecken

### Schritt 3: Kompass-Toggle-Button

- Neuer `.map-btn` in `MapContent.tsx`, Position: top-left unter GpsStatusBadge
- Icon: 🧭 (aktiv: grün, inaktiv: grau)
- Tap: `requestPermission()` aus dem Hook
- State aus `useDeviceHeading` → Button-Farbe + Icon

### Schritt 4: CSS

- `.heading-arrow` Klasse: `transition: transform 0.1s ease-out` (smooth rotation)
- SVG-Pfeil-Style passend zum blauen Punkt (#42A5F5, leicht transluzent)
- `.map-btn.compass-active` und `.map-btn.compass-inactive` Zustände

### Schritt 5: Edge Cases & Polish

- Heading ohne Position → puffern, nicht rendern
- Permission denied → Button grau, kein Toast
- StandAssignmentMap: Heading dort ebenfalls durchreichen (gleiche Prop)
- Cleanup: Event-Listener + rAF in useEffect-Cleanup

---

## Ende

**Bericht fertig. Keine Code-Änderungen vorgenommen. Warte auf Freigabe.**

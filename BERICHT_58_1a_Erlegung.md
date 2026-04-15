# Erlegung melden — Erkundungsbericht 58.1a

**Datum:** 15.04.2026
**Autor:** Claude (Recon-Agent)
**Basis:** Codebase-Stand `4b9b9df` (main)

---

## 1. Bottom-Bar heute + Refactor-Aufwand

### Ist-Zustand

**Datei:** `src/components/bottom-tab-bar.tsx` (102 Zeilen)
**Eingebunden in:** `app/app/layout.tsx` (im Suspense-Wrapper)

**Aktuelle 3 Tabs:**

| # | Key | Label | Icon (lucide) | Route |
|---|-----|-------|----------------|-------|
| 1 | `jagden` | Jagden | `Crosshair` | `/app?tab=jagden` |
| 2 | `chats` | Chats | `MessageSquare` | `/app?tab=chats` |
| 3 | `du` | Du | `User` | `/app/du` |

**Sichtbarkeit:**
- Sichtbar auf: `/app`, `/app/chat/*`, `/app/du`, `/app/hunt/[id]`
- Versteckt auf: `/app/hunt/create` (via `HIDE_ON_ROUTES`)
- Versteckt bei: Keyboard offen (via Custom Event `quickhunt:keyboard`)

**Technische Details:**
- Fixed bottom, z-index 40, Höhe 3.5rem
- `paddingBottom: var(--safe-bottom)` für iOS Safe Area
- Active-Tab-Erkennung: pathname + searchParams-basiert
- Kein Context, kein globaler State — rein URL-basiert

### Refactor auf 4 Tabs

**Aufwand: Klein (ca. 30 Min)**

Änderungen:
1. `tabs`-Array erweitern um "Erlegung"-Tab (z.B. Icon `Target` oder Custom SVG)
2. Tab-Breite wird automatisch 25% statt 33% (Flex-Layout)
3. Active-Key-Logik erweitern
4. Click-Handler für "Erlegung" muss kontextabhängig sein:
   - **Aktive Hunt vorhanden** → Wildart-Picker öffnen (hunt_id bekannt)
   - **Keine aktive Hunt** → Auto-Solo-Hunt erstellen, dann Wildart-Picker

**Architektur-Frage:**
Der Erlegung-Tab ist kein Link zu einer Route, sondern ein **Action-Button**, der ein Sheet/Modal öffnet. Das erfordert eine Änderung: Statt `<Link>` wird es ein `<button>` mit `onClick`-Handler. Die anderen 3 Tabs bleiben Links.

**Empfehlung:** Der Erlegung-Tab sollte visuell hervorgehoben sein (z.B. `var(--green)` Hintergrund-Circle, ähnlich einem FAB-im-Tab). Das signalisiert "Hauptaktion" vs. "Navigation".

### In-Hunt Top-Tab-Bar

Die Hunt-Detail-Seite (`app/app/hunt/[id]/page.tsx:254-258`) hat bereits 4 Tabs:

| # | Key | Label | Icon | Status |
|---|-----|-------|------|--------|
| 1 | `karte` | Karte | 🗺️ | Implementiert |
| 2 | `chat` | Chat | 💬 | Implementiert |
| 3 | `nachsuche` | Nachsuche | 🔴 | Placeholder |
| 4 | `strecke` | Strecke | 🦌 | Placeholder |

Kein Refactor nötig — Strecke-Tab existiert bereits als Placeholder.

---

## 2. Hunt-Type (Hochwild/Niederwild)

### Ist-Zustand

**Enum existiert:** `003_quickhunt_schema.sql:22-27`
```sql
create type hunt_type as enum (
  'ansitz', 'pirsch', 'drueckjagd', 'erntejagd'
);
```

**Spalte existiert:** `hunts.type` mit Default `'ansitz'` (Zeile 175)

**UI:** Hardcoded auf `'ansitz'` in `app/app/hunt/create/page.tsx:59`:
```tsx
const [type, setType] = useState('ansitz')
```
Es gibt **keinen UI-Toggle** zum Ändern des Hunt-Types.

### Hochwild/Niederwild-Unterscheidung

Die bestehende `hunt_type`-Enum (`ansitz`, `pirsch`, `drueckjagd`, `erntejagd`) beschreibt die **Jagdart**, nicht die **Wildkategorie**. Für die Top-8-Wildarten-Auswahl brauchen wir eine separate Unterscheidung.

**Optionen:**

| Option | Beschreibung | Pro | Contra |
|--------|-------------|-----|--------|
| A) Neue Enum-Spalte `hunts.wild_category` | `hochwild` / `niederwild` / `gemischt` | Sauber, querybar, filterbar | Schema-Change nötig |
| B) Aus `wild_presets` ableiten | Wenn Preset Niederwild enthält → Niederwild | Kein Schema-Change | Fragil, unzuverlässig |
| C) Neue Enum-Werte in `hunt_type` | `hochwild_ansitz`, `niederwild_ansitz`... | Kein neues Feld | Kombinatorische Explosion |

**Empfehlung: Option A** — Neue Spalte `hunts.wild_category` als eigene Enum (`hochwild`, `niederwild`, `gemischt`). Default `hochwild`. Toggle in Hunt-Settings (oder beim Erstellen). Steuert die System-Top-8 im Wildart-Picker.

---

## 3. Datenmodell-Vorschlag (species, kills, Migrations)

### kills-Tabelle: EXISTIERT BEREITS

**Datei:** `003_quickhunt_schema.sql:268-299` — Vollständig definiert mit 20+ Spalten:

| Spalte | Typ | Beschreibung |
|--------|-----|-------------|
| `id` | UUID PK | Auto-generiert |
| `hunt_id` | UUID FK → hunts | Optional (auch ohne Jagd meldbar) |
| `district_id` | UUID FK → districts | Optional (Revier-Zuordnung) |
| `participant_id` | UUID FK → hunt_participants | Wer hat erlegt |
| `reporter_id` | UUID FK → profiles | Wer hat gemeldet (NOT NULL) |
| `wild_art` | wild_art enum | NOT NULL |
| `geschlecht` | geschlecht enum | NOT NULL |
| `altersklasse` | text | Freitext |
| `gewicht_kg` | float | Aufgebrochen |
| `jagdart` | jagdart enum | Jagdart |
| `foto_url` | text | Foto in app-photos |
| `position` | geometry(Point, 4326) | GPS |
| `hochsitz_id` | UUID FK → map_objects | Stand |
| `waffe` / `kaliber` | text | Aus Profil oder manuell |
| `nachsuche` | boolean | Default false |
| `verbleib` | verbleib enum | Eigenverbrauch etc. |
| `wildmarke_nr` | text | Wildursprungsmarke |
| `shooting_plan_id` | UUID | Abschussplan-Referenz |
| `trichinen_pflicht` | boolean | Auto-Trigger bei Schwarzwild |
| `trichinen_ergebnis` | text | positiv/negativ/ausstehend |
| `freigabe_verkauf` | boolean | Verkaufs-Freigabe |
| `erlegt_am` | timestamptz | Default now() |

**Trigger:** `trg_kills_trichinen` setzt `trichinen_pflicht = true` bei Schwarzwild.
**Realtime:** Bereits aktiviert (Zeile 679).
**Indexes:** 5 Indexes existieren (district, hunt, reporter, wild_art, erlegt_am + GiST-Index auf position).

### wild_art: ENUM, keine eigene Tabelle

**Datei:** `003_quickhunt_schema.sql:54-62`

```sql
create type wild_art as enum (
  'rehbock', 'ricke', 'rehkitz',
  'keiler', 'bache', 'ueberlaeufer', 'frischling',
  'rothirsch', 'rottier', 'rotkalb',
  'damhirsch', 'damtier', 'damkalb',
  'fuchs', 'dachs', 'waschbaer', 'marderhund',
  'fasan', 'taube', 'kraehe', 'gans',
  'sonstiges'
);
```

**22 Werte** — bereits nach Geschlecht/Altersklasse aufgefächert (rehbock vs. ricke vs. rehkitz).

### Species-Tabelle: ENTSCHEIDUNG NÖTIG

**Status quo:** `wild_art` ist ein Postgres-Enum. Das bedeutet:
- Neue Wildarten erfordern Schema-Migration (`ALTER TYPE wild_art ADD VALUE`)
- Kein Icon, kein `name_lat`, keine Kategorie (hochwild/niederwild) gespeichert
- Kein `sort_order` für die Picker-Reihenfolge
- `hunts.wild_presets` ist `wild_art[]` (Array des Enums)

**Vorschlag im Konzept:** Eigene `species`-Tabelle mit `icon_key`, `category`, `sort_order`, etc.

**Trade-off-Analyse:**

| Ansatz | Pro | Contra |
|--------|-----|--------|
| **Enum beibehalten** | Kein Schema-Change, einfach, DB-Validierung | Keine Metadaten (Icon, Kategorie), unflexibel |
| **Species-Tabelle** | Metadaten, erweiterbar, UI-Daten in DB | Migration: `wild_art` Enum → FK. Bricht `wild_presets`, `kills.wild_art`, `shooting_plans.wild_art` |
| **Hybrid: Enum + Client-seitige Metadaten** | Kein DB-Change, sofort nutzbar | Metadaten in Code statt DB |

**Empfehlung: Hybrid-Ansatz (kurzfristig)**

Für 58.1 den **bestehenden Enum beibehalten** und Metadaten client-seitig in einer TypeScript-Datei pflegen:

```typescript
// src/lib/species-config.ts
export const SPECIES_CONFIG: Record<WildArt, SpeciesInfo> = {
  rehbock: { label: 'Rehbock', category: 'hochwild', icon: '🦌', sortOrder: 1 },
  ricke:   { label: 'Ricke',   category: 'hochwild', icon: '🦌', sortOrder: 2 },
  // ...
}
```

**Langfristig** (nach 58.1) kann eine echte `species`-Tabelle kommen, wenn Individualisierung (Custom-Wildarten, regionale Unterschiede) gebraucht wird.

### Fehlende Status-Spalte

Das Konzept sieht `kills.status` als Enum vor: `harvested` / `wounded` / `missed`. Die bestehende `kills`-Tabelle hat **kein `status`-Feld**. Es gibt `nachsuche: boolean`, was nur "wounded" abdeckt.

**Migration nötig:**
```sql
CREATE TYPE kill_status AS ENUM ('harvested', 'wounded', 'missed');
ALTER TABLE kills ADD COLUMN status kill_status DEFAULT 'harvested';
```

### TypeScript Kill-Type: FEHLT

Es existiert nur der alte `Strecke`-Type in `src/lib/types/strecke.ts`. Ein moderner `Kill`-Type für die `kills`-Tabelle muss erstellt werden.

### System-Default Top-8

Vorschlag basierend auf jagdlicher Praxis in Niedersachsen:

**Hochwild Top-8:**
1. Rehbock, 2. Ricke, 3. Rehkitz, 4. Keiler, 5. Bache, 6. Überläufer, 7. Frischling, 8. Fuchs

**Niederwild Top-8:**
1. Fasan, 2. Taube, 3. Krähe, 4. Gans, 5. Fuchs, 6. Dachs, 7. Waschbär, 8. Marderhund

---

## 4. Auto-Solo-Hunt-Mechanik

### Hunt-Erstellung heute

**Einziger Ort:** `app/app/hunt/create/page.tsx` (Zeilen 453-467)
- Direkte Supabase-Insert (kein RPC)
- Erstellt Hunt + Participant (als Jagdleiter) + Chat-Gruppe + Seat-Assignments
- Invite-Code wird client-seitig generiert
- Hunt startet als `status: 'active'`, `started_at: new Date()`

**Es gibt keine RPC-Funktion** für Hunt-Erstellung. Alles ist client-seitig.

### Auto-Solo-Hunt Design

**Vorschlag:** Neue Server-Funktion (Supabase RPC):

```sql
CREATE FUNCTION create_solo_hunt(
  p_user_id UUID,
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION
) RETURNS UUID
```

**Ablauf:**
1. GPS-Position empfangen
2. District-Lookup via PostGIS: `SELECT id FROM districts WHERE ST_Within(ST_SetSRID(ST_MakePoint(lng, lat), 4326), boundary)`
3. Hunt erstellen: `type='ansitz'`, `status='active'`, `name='Einzeljagd DD.MM.YYYY'`
4. Participant erstellen: User als `jagdleiter`
5. Hunt-ID zurückgeben

### GPS-zu-Revier-Lookup: EXISTIERT NICHT

**Aktueller Stand:** `districts.boundary` ist `geometry(Polygon, 4326)` mit GiST-Index (`idx_districts_geo`). Die Infrastruktur für `ST_Within` ist da, aber **keine Funktion nutzt es bisher**.

Kein `ST_Within`, `ST_Contains`, `ST_Intersects` oder `ST_DWithin` im gesamten Codebase gefunden.

### Edge-Cases

| Edge-Case | Empfehlung |
|-----------|-----------|
| **GPS nicht in Revier** | `district_id = NULL` → Solo-Hunt ohne Revier-Zuordnung. Erlegung hat trotzdem GPS-Position. Kein Blocker. |
| **GPS in zwei Revieren** | Theoretisch möglich bei überlappenden Polygonen. Lösung: Revier mit kleinstem Flächeninhalt (`ST_Area`) gewinnt (inneres Revier). Alternativ: User hat "Haupt-Revier" in Profil — kommt erst mit Multi-Revier. |
| **Solo-Hunt auto-schließen** | **Empfehlung: Nach 12h Inaktivität automatisch `status='completed'`.** Kann als DB-Cron (pg_cron) oder Edge-Function laufen. Für 58.1 reicht manuelles Schließen. |
| **Aktive Hunt vorhanden** | Erlegung-Tab erkennt aktive Hunt → verwendet deren hunt_id. Kein Solo-Hunt nötig. |
| **Zwei aktive Hunts** | Unwahrscheinlich (User kann nur einer Hunt beitreten). Falls doch: jüngste Hunt (neuestes `started_at`) gewinnt. Oder: User wird gefragt. |

### Kollision aktive Hunt vs. Solo-Hunt

**Bestätigt:** Wenn User in aktiver Hunt → Erlegung-Tab nutzt aktive Hunt. Solo-Hunt wird NUR erstellt wenn keine aktive Hunt existiert.

**Aktive-Hunt-Erkennung:** Query `SELECT h.id FROM hunts h JOIN hunt_participants hp ON hp.hunt_id = h.id WHERE hp.user_id = ? AND h.status = 'active' ORDER BY h.started_at DESC LIMIT 1`.

---

## 5. Wildart-Picker UI

### Verfügbare UI-Patterns

**Sheet-Komponente:** `src/components/ui/sheet.tsx` (138 Zeilen) — @base-ui/react basiert, Bottom-Sheet mit Slide-Animation. Bereits im Einsatz für StandDetailSheet, BoundarySheet, MapObjectSheet.

**Vergleichbares Pattern:** `MapObjectSheet` hat bereits ein Quick-Type-Grid (7 Typen + "Mehr..."). Sehr ähnlich zum geplanten Wildart-Picker.

### Empfohlenes UI-Pattern

**Bottom-Sheet mit Tile-Grid** (konsistent mit bestehendem Design):

```
┌─────────────────────────────────┐
│  Wildart wählen            [X]  │
│                                 │
│  🦌 Rehbock  🦌 Ricke  🦌 Kitz │
│  🐗 Keiler   🐗 Bache  🐗 ÜL  │
│  🐗 Frischl. 🦊 Fuchs          │
│                                 │
│  [🔍 Mehr Wildarten...]        │
│                                 │
│  🎯 Tap = Erlegt               │
│  ⏳ Long-Press = Krank          │
└─────────────────────────────────┘
```

**"Mehr..."-Suche:** Zweites Sheet mit allen 22 Wildarten + Suchfeld oben. Filter tippt live durch `SPECIES_CONFIG`.

### Long-Press auf Tile = Wounded

**Technisch:**
- `onTouchStart` → Timer starten (500ms)
- `onTouchEnd` vor Timer → Normal-Tap → `status: 'harvested'`
- Timer feuert → Haptic (`navigator.vibrate(15)`) + visueller Feedback (Tile wird rot/orange) → `status: 'wounded'`
- Bereits bewährtes Pattern: `SwipeToAction` nutzt ähnliche Touch-Events

**Visuell:**
- Normal-Tap: Grüner Checkmark-Flash auf dem Tile
- Long-Press: Orange/Rot-Flash + "Krank" Text-Overlay + Haptic

### Icon-Speicherung

**Empfehlung:** Emoji-basiert für MVP, SVG-Icons als Enhancement.
- Emojis: Sofort verfügbar, kein Asset-Management
- SVGs: Können in `src/lib/species-icons.ts` als Strings gespeichert werden
- Bestehende Icons: lucide-react hat keine Wildtier-Icons

**Icon-Library:** App nutzt lucide-react (`^1.7.0`). Für Wildtiere gibt es keine passenden Icons. Emojis (🦌🐗🦊🦡🦆) oder Custom-SVGs sind der Weg.

---

## 6. Karten-Marker für Erlegung

### Stand-Marker heute

**Datei:** `src/components/hunt/MapContent.tsx` (Zeilen 324-446)

- Custom SVG-Pins via `buildPinSvg()` aus `src/lib/markers/pin-svg.ts`
- Varianten basierend auf Stand-Typ und Belegung (occupied/unoccupied)
- Größen: Belegt 32x40px, Unbelegt 28x36px (kleiner visuell: 22x28)
- Tooltips: Zoom-abhängig (Initialen bei Zoom 14-15, voller Name bei ≥16)
- GiST-Index existiert: `idx_kills_geo` auf `kills.position`

### Erlegung-Marker-Optionen

| Option | Beschreibung | Pro | Contra |
|--------|-------------|-----|--------|
| **A) Sub-Icon am Stand** | Kleines Wildart-Icon unten-rechts am Stand-Pin | Zuordnung sofort klar, kein Clutter | Komplexer SVG-Build, bei vielen Erlegungen unübersichtlich |
| **B) Eigener Marker am GPS** | Separater Pin am exakten Erlegungsort | Genau, eigene Interaktion möglich | Mehr Clutter, ggf. überlappt mit Stand |
| **C) Badge-Zähler am Stand** | Zahlen-Badge (wie iOS-App-Badge) am Stand | Minimal, informativ | Keine Wildart-Info sichtbar |
| **D) Hybrid: Badge + Tap-Detail** | Zähler-Badge am Stand + Tap öffnet Detail-Liste | Übersichtlich + detailliert bei Bedarf | Zwei Interaktionen nötig |

**Empfehlung: Option D (Hybrid)**

1. **Default-Ansicht:** Kleiner Zähler-Badge am Stand-Pin (z.B. roter Kreis mit Zahl, ähnlich Notification-Badge). Position: oben-rechts am Pin.
2. **Tap auf Stand:** StandDetailSheet zeigt zusätzlich Erlegungen an diesem Stand (Wildart + Zeitpunkt + Schütze).
3. **Ohne Stand-Zuordnung** (Long-Press auf Karte oder Erlegung ohne Stand): Eigener kleiner Marker am GPS-Punkt mit Wildart-Emoji.
4. **Erlegungen anderer Teilnehmer:** Nur sichtbar je nach `kill_visibility`-Setting.

### Long-Press auf Karte

**Aktueller Stand:** Die Hunt-Map hat bereits eine `tempMarker`-State-Variable für Long-Press-Erstellung (Zeile 862), aber **kein Long-Press-Handler ist implementiert**. Der State existiert, der Trigger fehlt.

Für das Konzept "Long-Press auf Karte → Wildart-Picker" müsste:
1. Ein Touch-Timer auf der Map implementiert werden (Leaflet `contextmenu` Event oder Custom Touch-Handler)
2. Position als `tempMarker` gespeichert werden
3. Wildart-Picker-Sheet geöffnet werden mit der Position vorausgefüllt

**Kollision:** Der bestehende Long-Press-Platzhalter ist für Hochsitz-Erstellung gedacht. Es braucht eine klare Unterscheidung — z.B. Long-Press öffnet ein Kontext-Menü: "Erlegung melden" / "Stand erstellen".

---

## 7. Realtime-Sync

### Ist-Zustand

Supabase Realtime ist aktiv auf 5 Tabellen (Zeile 676-681):
- `positions_current` → Teilnehmer-Positionen
- `messages` → Chat
- `kills` → **Bereits aktiviert!**
- `tracking_requests` → Nachsuche
- `hunts` → Status-Änderungen

### Bestehende Realtime-Patterns

**positions_current** (`src/hooks/useHuntPositions.ts`):
- Channel: `hunt-positions-${huntId}`
- Filter: `hunt_id=eq.${huntId}`
- Events: `*` (INSERT, UPDATE, DELETE)
- Map-basiert: `Map<participantId, PositionData>`
- Initial Load + Realtime-Subscription

**messages** (`src/components/hunt/ChatPanel.tsx`):
- Channel: `chat-${channelId}`
- Filter: `hunt_id=eq.${huntId}` oder `group_id=eq.${groupId}`
- Events: INSERT + DELETE
- Optimistic Updates für eigene Messages

### kills-Realtime Pattern (NEU)

Empfehlung: Analog zu `useHuntPositions` einen `useHuntKills`-Hook bauen:

```typescript
// src/hooks/useHuntKills.ts
const channel = supabase
  .channel(`hunt-kills-${huntId}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'kills',
    filter: `hunt_id=eq.${huntId}`,
  }, handleKillChange)
  .subscribe()
```

**Wichtig:** Der Filter `hunt_id=eq.${huntId}` funktioniert, weil `kills.hunt_id` nullable ist — aber bei Solo-Hunts hat jede Kill eine hunt_id. Kills ohne hunt_id (theoretisch möglich lt. Schema) fallen nicht in den Channel.

---

## 8. Sichtbarkeits-Toggle

### Hunt-Settings heute: EXISTIEREN NICHT

Es gibt **keine Hunt-Settings-Seite**. Die Hunt-Detail-Seite (`app/app/hunt/[id]/page.tsx`) zeigt:
- Top-Bar mit Name, Status, Rolle
- Kommandoleiste (Jagdleiter only): "Treiben!", "Hahn in Ruh", "Rollen", "+Nachsuche"
- 4 Content-Tabs

Kein Settings-Dialog, kein Settings-Tab, kein Settings-Icon.

### Empfehlung

**Neues Settings-Sheet** für Hunt-Einstellungen, erreichbar über ein Zahnrad-Icon in der Top-Bar (nur Jagdleiter). Inhalte:

1. **Kill-Visibility** (Dropdown/Radio):
   - "Alle sehen Erlegungen" (default)
   - "Nur Jagdleiter"
   - "Jagdleiter + Gruppenleiter"
2. **Hunt-Type** (Hochwild/Niederwild-Toggle)
3. **Signal-Mode** (bereits vorhanden, aber nicht in UI)
4. **Timer** (end_time, bereits in Schema)

### Datenmodell

**Migration nötig:**
```sql
CREATE TYPE kill_visibility AS ENUM ('all', 'leader_only', 'leader_and_groupleader');
ALTER TABLE hunts ADD COLUMN kill_visibility kill_visibility DEFAULT 'all';
```

### RLS-Policy-Vorschlag

```sql
-- Alle Hunt-Teilnehmer sehen Kills (visibility = 'all')
CREATE POLICY "kills_hunt_member_all" ON kills FOR SELECT USING (
  hunt_id IN (
    SELECT hp.hunt_id FROM hunt_participants hp
    WHERE hp.user_id = auth.uid()
  )
  AND (
    SELECT h.kill_visibility FROM hunts h WHERE h.id = kills.hunt_id
  ) = 'all'
);

-- Jagdleiter sieht immer alles
CREATE POLICY "kills_hunt_leader" ON kills FOR SELECT USING (
  hunt_id IN (
    SELECT hp.hunt_id FROM hunt_participants hp
    WHERE hp.user_id = auth.uid() AND hp.role = 'jagdleiter'
  )
);

-- Leader + Gruppenleiter
CREATE POLICY "kills_hunt_groupleader" ON kills FOR SELECT USING (
  hunt_id IN (
    SELECT hp.hunt_id FROM hunt_participants hp
    WHERE hp.user_id = auth.uid()
      AND (hp.role = 'jagdleiter' OR 'gruppenleiter' = ANY(hp.tags))
  )
  AND (
    SELECT h.kill_visibility FROM hunts h WHERE h.id = kills.hunt_id
  ) IN ('all', 'leader_and_groupleader')
);
```

**Achtung:** Diese Policies nutzen Subqueries auf `hunt_participants` — Rekursions-Risiko! CLAUDE.md warnt vor genau diesem Pattern (Regel 8). Empfehlung: `get_my_hunt_ids()`-Funktion (SECURITY DEFINER) verwenden, analog zu `get_my_group_ids()` aus Migration 009.

---

## 9. Migrations + RLS

### Nächste freie Migration

**027** — Letzte Migration ist `026_hunt_boundary.sql`.

(Hinweis: Nummern 007, 018, 019 wurden übersprungen.)

### Migration 027: Erlegung-Foundation

**Inhalt:**
1. `kill_status` Enum (harvested / wounded / missed)
2. `kills.status` Spalte (mit Default `harvested`)
3. `wild_category` Enum (hochwild / niederwild / gemischt)
4. `hunts.wild_category` Spalte (Default `hochwild`)
5. `kill_visibility` Enum (all / leader_only / leader_and_groupleader)
6. `hunts.kill_visibility` Spalte (Default `all`)
7. `get_my_hunt_ids()` SECURITY DEFINER Funktion
8. Neue RLS-Policies für kills (SELECT abhängig von visibility + Rolle)
9. Bestehende kills-Policies ggf. ersetzen

### RLS-Übersicht

**Bestehende kills-Policies (003):**
- `kills_reporter`: INSERT/UPDATE/DELETE eigene Kills (`reporter_id = auth.uid()`)
- `kills_district_owner`: SELECT alle Kills im eigenen Revier

**Fehlend:**
- SELECT für Hunt-Teilnehmer (abhängig von `kill_visibility`)
- Heute kann ein Hunt-Teilnehmer die Kills anderer Teilnehmer **nicht sehen** (nur der Reporter und der Revier-Besitzer)

**Für `species` (wenn Tabelle kommt):**
- SELECT für alle authentifizierten User
- INSERT/UPDATE/DELETE nur für Admins (oder gar nicht — Seed-only)

---

## 10. Sub-Prompt-Struktur 58.1b ff.

### Empfohlene Reihenfolge

```
58.1b — DB-Foundation
  └─ kill_status Enum + kills.status Spalte
  └─ wild_category Enum + hunts.wild_category Spalte
  └─ kill_visibility Enum + hunts.kill_visibility Spalte
  └─ get_my_hunt_ids() Funktion
  └─ Neue kills RLS-Policies (SELECT nach visibility)
  └─ species-config.ts (Client-seitige Wildart-Metadaten)
  └─ Kill TypeScript-Type
  └─ Migration 027
  └─ TEST: Migration ausführen, RLS testen

58.1c — Bottom-Bar Refactor
  └─ 4. Tab "Erlegung" als Action-Button
  └─ Aktive-Hunt-Erkennung (Hook oder Query)
  └─ Erlegung-Tab: kontextabhängiger Click-Handler
  └─ TEST: Tab erscheint, Click-Handler loggt korrekt

58.1d — Wildart-Picker + Insert
  └─ WildartPicker Bottom-Sheet (Top-8 Grid + "Mehr...")
  └─ Tap → INSERT kills (status: harvested)
  └─ Long-Press → INSERT kills (status: wounded)
  └─ Haptic Feedback + visuelles Feedback
  └─ Toast-Bestätigung nach Insert
  └─ TEST: Erlegung erscheint in Supabase kills-Tabelle

58.1e — Auto-Solo-Hunt
  └─ create_solo_hunt() RPC-Funktion
  └─ GPS-zu-Revier-Lookup (ST_Within)
  └─ Erlegung-Tab ohne aktive Hunt → Solo-Hunt + Picker
  └─ TEST: Solo-Hunt wird erstellt, Kill zugeordnet

58.1f — Strecke-Tab + Karten-Marker
  └─ useHuntKills Hook (Realtime)
  └─ Strecke-Tab: Liste aller Kills der Hunt
  └─ Karten-Marker: Badge am Stand + eigener Marker ohne Stand
  └─ TEST: Erlegung erscheint live auf Karte + in Strecke-Tab

58.1g — Sichtbarkeits-Toggle
  └─ Hunt-Settings-Sheet (Zahnrad in Top-Bar)
  └─ kill_visibility Dropdown
  └─ RLS-Enforcement verifizieren
  └─ TEST: Zweiter User sieht/sieht nicht je nach Setting

58.1h — Polish + Edge-Cases
  └─ Long-Press auf Karte → Kontext-Menü (Erlegung / Stand)
  └─ Karte: Tap auf Stand → Detail-Sheet mit Erlegungen
  └─ Toast-Phrasen finalisieren
  └─ Error-Handling (Offline, GPS fehlt, etc.)
```

### Abhängigkeiten

```
58.1b ─────────────────────────────────────┐
  │                                         │
  ├──→ 58.1c (braucht Kill-Type)           │
  │      │                                  │
  │      └──→ 58.1d (braucht Bottom-Tab)   │
  │             │                           │
  │             └──→ 58.1e (braucht Picker) │
  │                                         │
  ├──→ 58.1f (braucht kills-Tabelle)  ←────┘
  │
  └──→ 58.1g (braucht kill_visibility)
  
58.1h ←── alle vorherigen
```

### Parallelisierungsmöglichkeiten

- **58.1c + 58.1f** könnten parallel laufen (Bottom-Bar-Refactor ist unabhängig von Karten-Markern), ABER 58.1f braucht auch 58.1d (Kill-Daten zum Anzeigen). Daher: sequentiell besser.
- **58.1g** kann parallel zu 58.1f laufen (Settings-Sheet ist unabhängig von Karten-Markern).
- **Empfehlung:** Strikt sequentiell (b→c→d→e→f→g→h). Jeder Prompt baut auf dem vorherigen auf. Parallelisierung spart hier wenig, erhöht aber Merge-Konflikte.

---

## 11. Risiko-Hotspots

### Hoch

| Risiko | Beschreibung | Mitigation |
|--------|-------------|-----------|
| **RLS-Rekursion** | kills-SELECT-Policy mit Subquery auf hunt_participants → bekanntes Rekursions-Problem (CLAUDE.md Regel 8) | `get_my_hunt_ids()` SECURITY DEFINER Funktion als Zwischenschicht |
| **Long-Press-Kollision auf Karte** | Bestehender Long-Press-Platzhalter (Hochsitz erstellen) vs. neuer Long-Press (Erlegung melden) | Kontext-Menü bei Long-Press mit beiden Optionen |
| **kills.geschlecht NOT NULL** | Bestehendes Schema erzwingt Geschlecht bei jedem Kill. "2-Sekunden-Feature" → User will nur Wildart tippen | Migration: `ALTER TABLE kills ALTER COLUMN geschlecht DROP NOT NULL` oder Default `'unbekannt'` |

### Mittel

| Risiko | Beschreibung | Mitigation |
|--------|-------------|-----------|
| **kills.participant_id FK** | Referenziert hunt_participants. Bei Solo-Hunt muss erst Participant existieren | Auto-Solo-Hunt muss Participant MIT-erstellen (in einer Transaktion) |
| **Enum-Erweiterung** | Neue Wildarten erfordern Schema-Migration | Kurzfristig: Client-seitige Config. Langfristig: species-Tabelle |
| **Toast ohne globales System** | Bestehende MapToast ist Map-spezifisch (MapContext). Erlegung-Toast braucht globalen Toast | Neuen globalen Toast-Provider erstellen oder Sonner installieren |

### Niedrig

| Risiko | Beschreibung | Mitigation |
|--------|-------------|-----------|
| **Bottom-Bar 4 Tabs auf kleinem Screen** | 4 statt 3 Tabs → weniger Platz pro Tab | Icons + Kurzlabel reichen (44pt Minimum einhalten) |
| **GPS-Lookup Performance** | PostGIS ST_Within bei vielen Revieren | GiST-Index existiert bereits (`idx_districts_geo`) |

---

## 12. Offene Fragen an Moritz

### Vor 58.1b zu entscheiden

1. **Top-8 Hochwild bestätigen:**
   Rehbock, Ricke, Rehkitz, Keiler, Bache, Überläufer, Frischling, Fuchs — korrekt?

2. **Top-8 Niederwild bestätigen:**
   Fasan, Taube, Krähe, Gans, Fuchs, Dachs, Waschbär, Marderhund — korrekt?

3. **`kills.geschlecht` NOT NULL aufweichen?**
   Aktuell erzwingt das Schema Geschlechtsangabe. Für "2-Sekunden-Feature" müsste das optional werden (Default `'unbekannt'`). Oder: Geschlecht wird automatisch aus der Wildart abgeleitet (Rehbock → männlich, Ricke → weiblich)?

4. **Species-Tabelle vs. Enum beibehalten?**
   Empfehlung: Enum beibehalten + Client-Config für 58.1. Species-Tabelle als separates Projekt. Einverstanden?

5. **Auto-Solo-Hunt: Name-Format?**
   z.B. "Einzeljagd 15.04.2026" oder "Ansitz 15.04.2026" oder nur Datum?

6. **Solo-Hunt auto-schließen?**
   Empfehlung: Vorerst manuell. Später Cron nach 12h. OK?

7. **Karten-Marker-Style?**
   Empfehlung: Badge-Zähler am Stand + Detail bei Tap. Einverstanden?

### Vor 58.1d zu entscheiden

8. **Toast-Phrasen?**
   z.B. "Waidmannsheil!" / "Rehbock erlegt" / "Schöner Schuss!" / "Erlegt" — welcher Stil?

9. **"Krank geschossen"-Feedback?**
   Was passiert nach dem Long-Press? Nur Insert + Toast? Oder direkt Nachsuche-Flow anbieten?

10. **"Fehlschuss" (missed) mit aufnehmen?**
    Oder nur harvested/wounded? Fehlschuss hat keinen jagdlichen Wert im Streckenbuch, könnte aber für persönliche Statistik relevant sein.

### Vor 58.1e zu entscheiden

11. **GPS nicht im Revier — trotzdem Solo-Hunt?**
    Empfehlung: Ja, mit `district_id = NULL`. Später zuordnbar.

### Vor 58.1g zu entscheiden

12. **Default Kill-Visibility?**
    Empfehlung: `all` (alle sehen alles). Passt das?

---

## Zusammenfassung

| Bereich | Status | Aufwand |
|---------|--------|---------|
| kills-Tabelle | Existiert, braucht `status`-Spalte | Klein |
| wild_art Enum | Existiert (22 Werte), reicht für MVP | Kein Change |
| species-Tabelle | Nicht nötig für 58.1 | - |
| Bottom-Bar | 3→4 Tabs, moderater Refactor | Mittel |
| Hunt-Settings | Existiert nicht, muss neu gebaut werden | Mittel |
| Auto-Solo-Hunt | Neu, braucht RPC + PostGIS-Query | Mittel |
| Wildart-Picker | Neu, aber Pattern existiert (MapObjectSheet) | Mittel |
| Karten-Marker | Infrastruktur da, neuer Marker-Typ nötig | Mittel |
| Realtime für kills | Bereits aktiviert, Hook muss gebaut werden | Klein |
| RLS für kills | Teilweise da, Visibility-Logik fehlt | Mittel |
| Migration 027 | Nächste freie Nummer | - |

**Gesamtschätzung:** 7 Sub-Prompts (58.1b bis 58.1h), strikt sequentiell, jeweils testbar.

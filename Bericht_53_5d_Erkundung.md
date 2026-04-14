# Bericht 53.5d — Erkundung PhotoCapture-Integration

---

## 1. PhotoCapture — Ist-Zustand

**Pfad:** `src/components/photo/PhotoCapture.tsx` (182 Zeilen)

**Props-Interface (Zeile 26–32):**
```ts
interface PhotoCaptureProps {
  quality: PhotoQuality          // 'chat' | 'avatar' | 'documentation'
  onCapture: (file: File) => void | Promise<void>
  onError?: (error: Error) => void
  disabled?: boolean
  children?: ReactNode           // Optionaler Custom-Trigger
}
```

**Quality-Presets (Zeile 13–20):**
- `chat`: 1200px, 0.5 MB
- `avatar`: 400px, 0.1 MB
- `documentation`: 2000px, 1.2 MB

Für Revier-Objekte ist `documentation` passend (gute Qualität, 2000px, 1.2 MB max).

**Funktionsweise:**
1. Hidden `<input type="file" accept="image/*,.heic,.heif" capture="environment">`
2. HEIC-Konvertierung via `heic2any` (dynamischer Import)
3. Komprimierung via `browser-image-compression`
4. Ergebnis als `File`-Objekt an `onCapture` zurück

**Verwendungsstellen:**
- `app/test/photo-capture/page.tsx` (Zeile 151) — reine Test-Seite
- **Keine produktive Verwendung** außerhalb der Test-Seite

**Kein Kontext (entityType/entityId/userId)** wird an PhotoCapture übergeben — die Komponente kennt nur `quality` und gibt ein `File` zurück. Der Upload-Kontext wird separat beim Aufruf von `uploadPhoto` gesetzt.

---

## 2. uploadPhoto — Ist-Zustand

**Pfad:** `src/lib/photos/upload.ts` (51 Zeilen)

**Signatur:**
```ts
interface UploadPhotoArgs {
  file: File
  userId: string
  entityType: string       // z.B. 'map_object', 'message', 'group_avatar', 'kill'
  entityId: string         // z.B. die Objekt-UUID
  oldPath?: string         // optional: alter Pfad zum Löschen vor Neu-Upload (Replace)
}

interface UploadPhotoResult {
  url: string              // public URL für DB-Speicherung
  path: string             // bucket-relativer Pfad für spätere Lösch-Operationen
}
```

**Storage-Pfad (Zeile 31):**
```ts
const path = `${userId}/${entityType}/${entityId}/${crypto.randomUUID()}.jpg`
```
→ Bestätigt: `{userId}/{entityType}/{entityId}/{uuid}.jpg`

**Replace-Logik:** `oldPath` wird vor dem Upload gelöscht (Fehler nur geloggt, nicht geworfen).

### Vorhandene Gegen-Helper

| Helper | Pfad | Vorhanden? |
|--------|------|------------|
| `deletePhoto(path)` | `src/lib/photos/delete.ts` | ✅ Ja |
| `listPhotos(...)` | — | ❌ Nein — TODO für 53.5d |
| `getPhotoUrl(...)` | — | ❌ Nicht nötig (URLs werden in DB gespeichert) |

**`deletePhoto`** (13 Zeilen):
```ts
export async function deletePhoto(path: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.storage.from('app-photos').remove([path])
  if (error) throw new Error(`Bild loeschen fehlgeschlagen: ${error.message}`)
}
```

---

## 3. PhotoThumbnail — Ist-Zustand

**Pfad:** `src/components/photo/PhotoThumbnail.tsx` (162 Zeilen)

**Props-Interface (Zeile 6–14):**
```ts
interface PhotoThumbnailProps {
  url: string
  alt?: string
  shape?: 'circle' | 'square'   // default 'square'
  size?: number                  // in rem, default 5 (= 80px)
  onDelete?: () => void | Promise<void>
  onTap?: () => void
  className?: string
}
```

**Rendering:**
- **Größe:** Konfigurierbar via `size` (rem), default 5rem (80px)
- **Loading-State:** Pulsierender Placeholder (`var(--surface-2)`, `pulse-dot` Animation)
- **Error-State:** `ImageOff`-Icon in surface-2 Box
- **Click-Verhalten:** `onTap` optional — wird für Vollbild-Ansicht verwendet
- **Löschen:** `onDelete` optional — rendert X-Button in schwarzem Kreis (oben rechts), 44px Touch-Target

**Kein Lightbox-/Vollbild-Viewer vorhanden** in PhotoThumbnail selbst. Es gibt aber:

### Existierende Fullscreen-Lösung im Repo

`app/globals.css` (Zeile 1197–1229):
```css
.chat-fullscreen-overlay { position: fixed; inset: 0; z-index: 2000; background: rgba(0,0,0,0.92); ... }
.chat-fullscreen-img { max-width: 95%; max-height: 90vh; object-fit: contain; }
.chat-fullscreen-close { position: absolute; top: 1rem; right: 1rem; width: 2.75rem; height: 2.75rem; ... }
```

Verwendet in:
- `src/components/hunt/ChatPanel.tsx` (Zeile 1072–1075)
- `app/app/chat/[groupId]/info/page.tsx` (Zeile 772ff)

Pattern: `useState<string | null>(null)` → onClick setzt URL → Overlay mit `<img>` + Close-Button.

**Für 53.5d:** Fullscreen-Viewer kann direkt im ObjektDetailSheet implementiert werden mit denselben CSS-Klassen (`chat-fullscreen-*`) — oder besser: generische Klassen (`fullscreen-overlay`, `fullscreen-img`, `fullscreen-close`) hinzufügen.

---

## 4. ObjektDetailSheet — Einbau-Stelle

**Pfad:** `src/components/revier/ObjektDetailSheet.tsx` (379 Zeilen)

### Props
```ts
type Props = {
  object: MapObject
  onClose: () => void
  onPositionChange: () => void
  onDelete: () => void
  onUpdate: (changes: Partial<MapObject>) => Promise<void>
}
```

### Aufbau (Sections)

| Zeilen | Section |
|--------|---------|
| 112–116 | Overlay + Sheet-Container + Handle |
| 117–174 | **Name** (Inline-Edit) + **Typ-Label** |
| 176–265 | **Notiz** (3 Zustände: leer/editierend/anzeigend) |
| 267–272 | Trennlinie |
| 274–316 | **Aktions-Liste** (Position ändern, Löschen) |
| 318–374 | Lösch-Bestätigung (Stufe 2) |

### Einbau-Stelle für Foto-Section

**Zwischen Notiz-Bereich (Zeile 265) und Trennlinie (Zeile 267–272).**

Empfohlener Platz: **Nach der Notiz, vor der Trennlinie** — neue Section "Fotos" mit:
1. Horizontal-Scroll-Grid der vorhandenen Fotos (PhotoThumbnail)
2. "Foto hinzufügen"-Button (PhotoCapture mit `documentation`-Quality)

Alternativ: "Foto hinzufügen" in die Aktions-Liste (Zeile 274ff) als weiterer Button zwischen "Position ändern" und "Löschen". Das würde dem bestehenden Muster folgen (Camera-Icon + "Foto hinzufügen" wie ein Action-Item).

### Edit/Read-Modus?

**Kein expliziter Edit/Read-Modus.** Stattdessen Inline-Edit per Element:
- Name: Click → Input → Blur speichert
- Notiz: Click → Textarea → Blur speichert
- Fotos sollten demselben Muster folgen: immer sichtbar, sofort hinzufügen/löschen möglich.

### Aufruf in revier-content.tsx (Zeile 468–476)

```tsx
<ObjektDetailSheet
  object={creation.object}
  onClose={handleDetailClose}
  onPositionChange={handleDetailPositionChange}
  onDelete={handleDetailDelete}
  onUpdate={handleDetailUpdate}
/>
```

Die `handleDetailUpdate` Funktion (Zeile 249–265) macht ein `supabase.from('map_objects').update(changes)` — das funktioniert für einfache Spalten-Updates. Für Foto-Management (wenn separate Tabelle) braucht man zusätzliche Handler.

---

## 5. Datenmodell-Empfehlung (Array vs. Join-Tabelle)

### Ist-Zustand map_objects

```sql
create table map_objects (
  id            uuid primary key default uuid_generate_v4(),
  district_id   uuid references districts(id) on delete cascade, -- nullable seit Mig 004
  type          map_object_type not null,
  name          text not null,
  position      geometry(Point, 4326) not null,
  description   text,
  photo_url     text,                    -- ← EINZELNES Foto, aktuell ungenutzt
  zone_id       uuid,
  created_by    uuid references profiles(id),  -- seit Mig 004
  created_at    timestamptz default now()
);
```

**Wichtig:** `photo_url TEXT` existiert bereits — aber nur für **ein** Foto.

### Wie werden Fotos anderswo persistiert?

| Entität | Feld | Typ | Tabelle |
|---------|------|-----|---------|
| map_objects | `photo_url` | `text` (einzeln) | map_objects |
| profiles | `avatar_url` | `text` (einzeln) | profiles |
| chat_groups | `avatar_url` | `text` (einzeln) | chat_groups |
| messages | `media_url` | `text` (einzeln) | messages (type='photo') |
| kills | `photo_url` | `text` (einzeln) | kills |

**Kein einziger Fall von Array-Spalte oder Join-Tabelle im aktuellen Schema.**

### Analyse: Array vs. Join-Tabelle

**Option A: `photos TEXT[]` Array auf map_objects**
- ✅ Einfach, kein neuer Table, kein Join
- ✅ Konsistent mit bisherigem 1-Spalten-Ansatz (nur erweitert auf Array)
- ❌ Keine Metadaten (uploaded_at, uploaded_by, caption)
- ❌ Kein Audit-Trail beim Löschen
- ❌ Array-Manipulation in Supabase/PostgREST ist umständlich (`array_append`, `array_remove`)
- ❌ Speichert nur URLs, nicht die Storage-Pfade (für Lösch-Operationen braucht man beides)

**Option B: Join-Tabelle `map_object_photos`**
```sql
create table map_object_photos (
  id            uuid primary key default uuid_generate_v4(),
  map_object_id uuid not null references map_objects(id) on delete cascade,
  url           text not null,           -- Public URL
  storage_path  text not null,           -- Bucket-relativer Pfad für Storage-Operationen
  uploaded_by   uuid references profiles(id),
  created_at    timestamptz default now()
);
```
- ✅ Metadaten (wer, wann)
- ✅ Einfaches Löschen einzelner Fotos (DELETE BY id)
- ✅ `storage_path` sauber persistiert (nötig für `deletePhoto`)
- ✅ Zukunftssicher für Prompt 55 (Wartungs-Historie)
- ❌ Mehr Komplexität (neuer Table, RLS, Migration)

### Blick auf Prompt 55 (Wartungs-Historie)

History-Einträge brauchen Vorher/Nachher-Fotos. Eine gemeinsame Tabelle wäre:

```sql
create table object_photos (
  id                uuid primary key default uuid_generate_v4(),
  map_object_id     uuid not null references map_objects(id) on delete cascade,
  history_entry_id  uuid references maintenance_history(id) on delete cascade, -- nullable
  url               text not null,
  storage_path      text not null,
  uploaded_by       uuid references profiles(id),
  created_at        timestamptz default now()
);
```

- `history_entry_id = NULL` → Objekt-Foto (allgemein)
- `history_entry_id = UUID` → Foto zu einem Wartungs-Eintrag

**Empfehlung: Join-Tabelle `map_object_photos`** (ohne history_entry_id vorerst).
Prompt 55 kann die Spalte `history_entry_id` per ALTER TABLE hinzufügen. Das bestehende `photo_url`-Feld auf map_objects bleibt als "Haupt-/Titelbild" nutzbar oder wird als deprecated ignoriert.

---

## 6. RLS-Anpassungen

### Bestehende map_objects Policies

| Policy | Typ | Wer |
|--------|-----|-----|
| `map_objects_district_owner` | ALL | Revier-Owner (`district_id in (select id from districts where owner_id = auth.uid())`) |
| `map_objects_hunt_member` | SELECT | Jagd-Teilnehmer (über hunts.district_id) |
| `map_objects_creator_manage` | ALL | Ersteller (`created_by = auth.uid()`) |
| `map_objects_own_no_district` | SELECT | Eigene Objekte ohne Revier |

### Nötige Policies für map_object_photos

Wenn Join-Tabelle gewählt:

```sql
alter table map_object_photos enable row level security;

-- Lesen: Wer das map_object sehen darf, darf auch Fotos sehen
create policy "map_object_photos_read" on map_object_photos for select using (
  map_object_id in (select id from map_objects)
  -- RLS von map_objects greift implizit über den Subquery
);

-- Hinzufügen: Wer das map_object bearbeiten darf
create policy "map_object_photos_insert" on map_object_photos for insert with check (
  uploaded_by = auth.uid()
  AND map_object_id in (select id from map_objects)
);

-- Löschen: Eigene Fotos oder Revier-Owner
create policy "map_object_photos_delete" on map_object_photos for delete using (
  uploaded_by = auth.uid()
  OR map_object_id in (
    select mo.id from map_objects mo
    join districts d on d.id = mo.district_id
    where d.owner_id = auth.uid()
  )
);
```

**Hinweis:** Der `select id from map_objects`-Subquery nutzt die bestehenden map_objects RLS-Policies transitiv. Wer map_objects nicht sehen darf, bekommt auch keine Fotos.

### Storage-Policies

Bereits vorhanden (Migration 024):
- **Read:** Alle authenticated User
- **Insert/Update/Delete:** Nur eigene Dateien (`auth.uid()::text = folder[1]`)

→ **Keine Änderung nötig** an Storage-Policies.

---

## 7. UI-Muster (aus bestehenden Komponenten)

### Trigger-Button: "Foto hinzufügen"

Zwei Optionen aus bestehenden Mustern:

**A) Als Aktions-Button (wie "Position ändern"):**
In die Aktions-Liste (Zeile 274–316) einfügen, zwischen "Position ändern" und "Löschen":
```
📷 Foto hinzufügen
```
Das `PhotoCapture`-children-Prop erlaubt einen Custom-Trigger → den ganzen Button als `children` wrappen.

**B) Als Plus-Button im Foto-Grid:**
Kleines `+`-Kästchen am Ende der Foto-Reihe (wie in vielen Photo-Apps). PhotoCapture mit children-Prop.

**Empfehlung:** Option A für den Trigger (konsistent mit bestehendem Sheet-Design), Fotos als Grid darüber anzeigen.

### Grid oder Horizontal-Scroll?

**Horizontal-Scroll** — passt besser in ein Bottom-Sheet mit begrenzter Höhe. Kein bestehendes Horizontal-Scroll-Pattern im Repo, aber trivial umsetzbar:
```css
display: flex; overflow-x: auto; gap: 0.5rem; padding: 0.5rem 0;
```
PhotoThumbnail mit `size={4.5}` (72px) in einer Flex-Row.

### Max. Anzahl Fotos

**Keine Limit-Konvention im Repo.** Empfehlung: **10 Fotos pro Objekt** als sinnvolles Limit (UI-Hinweis, kein DB-Constraint). Realistisch: 2–5 Fotos pro Hochsitz/Kirrung.

### Löschen-Geste

PhotoThumbnail hat bereits einen **X-Button** (oben rechts, immer sichtbar wenn `onDelete` gesetzt). Kein Long-Press, kein Swipe, kein Edit-Mode nötig.

SwipeToAction wird im Repo für Listen-Items verwendet (Chat-Gruppen, Jagden), nicht für Foto-Grids — passt hier nicht.

### Vollbild-Ansicht

Kein separates Lightbox-Komponente. Bestehender Pattern (ChatPanel + Chat-Info):
```tsx
const [fullscreenPhoto, setFullscreenPhoto] = useState<string | null>(null)

// In PhotoThumbnail: onTap={() => setFullscreenPhoto(url)}

// Am Ende des Sheet:
{fullscreenPhoto && (
  <div className="chat-fullscreen-overlay" onClick={() => setFullscreenPhoto(null)}>
    <img src={fullscreenPhoto} className="chat-fullscreen-img" />
    <button className="chat-fullscreen-close" onClick={() => setFullscreenPhoto(null)}>✕</button>
  </div>
)}
```

**Empfehlung:** CSS-Klassen umbenennen in generischere Namen (`photo-fullscreen-*`) oder die bestehenden `chat-fullscreen-*` Klassen mitnutzen (funktioniert, ist nur unschön benannt).

---

## 8. Fallstricke + offene Fragen

### iOS-PWA: HEIC-Fotos
✅ **Behandelt.** PhotoCapture hat explizite HEIC-Erkennung (Zeile 38–45) und Konvertierung via `heic2any` (Zeile 47–58). Accept-Attribut inkludiert `.heic,.heif`.

### EXIF-Orientation
✅ **Kein bekanntes Problem.** `browser-image-compression` behandelt EXIF-Rotation standardmäßig korrekt. Kein Bug-Report im Code.

### Offline-Verhalten / Retry-Queue
❌ **Keine Retry-Queue vorhanden.** Upload fehlschlägt → Error wird geworfen → User muss manuell wiederholen. Für Prompt 53.5d akzeptabel — Fotos von Hochsitzen werden typischerweise bei gutem Empfang gemacht (nicht im Feld während der Jagd). Retry-Queue ist ein späteres Enhancement.

### Supabase Storage URLs: public vs. signed
**Public.** Bucket ist `public: true` (Migration 024, Zeile 17). URLs via `getPublicUrl()` — keine Ablaufzeit, kein Token nötig. Das ist korrekt für Revier-Fotos (kein sensitiver Content).

### Bestehende photo_url Spalte
`map_objects.photo_url TEXT` existiert bereits, ist aber **nirgends produktiv beschrieben** (keine UI zum Setzen/Anzeigen). Die Spalte wird bei SELECT geladen (`revier-content.tsx:166`), aber nie angezeigt.

**Risiko:** Falls bestehende Objekte einen `photo_url`-Wert haben, muss die neue Foto-Section das berücksichtigen (Migration: vorhandene photo_url → erster Eintrag in map_object_photos).

**Prüfung:** Im Testbetrieb (6 User) ist photo_url wahrscheinlich überall NULL. Kann mit `SELECT count(*) FROM map_objects WHERE photo_url IS NOT NULL` verifiziert werden.

### ObjektDetailSheet maxHeight
Das Sheet hat `maxHeight: '70dvh'` (Zeile 114). Mit Foto-Grid + allen Sections könnte der Content überlaufen. Sheet hat aber kein `overflow-y: auto` → muss hinzugefügt werden.

---

## Empfehlung für Prompt 53.5d (Implementation)

### Empfohlener Datenbank-Ansatz

**Join-Tabelle `map_object_photos`** mit folgenden Spalten:
- `id` (UUID, PK)
- `map_object_id` (UUID, FK → map_objects, ON DELETE CASCADE)
- `url` (TEXT, public URL)
- `storage_path` (TEXT, bucket-relativer Pfad)
- `uploaded_by` (UUID, FK → profiles)
- `created_at` (TIMESTAMPTZ)

**Begründung:** Storage-Pfad muss persistiert werden (für `deletePhoto`). Metadaten (wer, wann) sind für Wartungs-Historie (Prompt 55) relevant. Array-Spalte kann `storage_path` nicht sauber abbilden.

### Reihenfolge der Änderungen

1. **Migration 025:** Tabelle `map_object_photos` + RLS-Policies anlegen
2. **ObjektDetailSheet erweitern:**
   - Foto-Grid (Horizontal-Scroll mit PhotoThumbnail)
   - "Foto hinzufügen" Aktion (PhotoCapture mit `documentation` Quality)
   - Fullscreen-Viewer (bestehende CSS-Klassen)
   - Fotos laden via Supabase-Query auf `map_object_photos`
   - Upload-Handler (uploadPhoto + INSERT in map_object_photos)
   - Delete-Handler (deletePhoto + DELETE aus map_object_photos)
3. **Props erweitern:** `userId` muss an ObjektDetailSheet übergeben werden (für uploadPhoto)
4. **revier-content.tsx:** `userId` an ObjektDetailSheet durchreichen (kommt bereits als Prop)
5. **overflow-y: auto** auf dem Sheet-Container hinzufügen

### Nötige Migration

**Ja — Migration 025_map_object_photos.sql**

### Geschätzte Dateien die angefasst werden

| Datei | Änderung |
|-------|----------|
| `supabase/migrations/025_map_object_photos.sql` | **Neu:** Tabelle + RLS |
| `src/components/revier/ObjektDetailSheet.tsx` | **Erweitert:** Foto-Section, Fullscreen, Upload/Delete |
| `app/app/du/revier/[id]/revier-content.tsx` | **Minimal:** userId an ObjektDetailSheet übergeben |
| `src/lib/types/revier.ts` | **Optional:** MapObjectPhoto Type hinzufügen |

### Mandatory Hinweis

**Kein separater Migrations-Prompt vor 53.5d nötig.** Die Migration ist klein genug, um im selben Prompt wie die UI-Änderungen gemacht zu werden. Die Migration muss aber **vor** dem Browser-Test manuell in Supabase ausgeführt werden (SQL Editor).

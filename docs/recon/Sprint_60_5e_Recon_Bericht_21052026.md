# Sprint 60.5e — Recon-Bericht

**Datum:** 21.05.2026 (Abend)
**Erstellt von:** Claude Code, Phase 0 Recon nach Brief V3
**Status bei Abgabe:** STOP — wartet auf Strategie-Entscheidung Punkt 1–4

---

## TL;DR — Zwei Blocker

### Blocker A — Die "ErlegungSheet"-Maske aus dem Mockup existiert heute nicht

Der Brief geht davon aus, dass das ErlegungSheet bereits eine Detail-Maske
mit den Feldern Wildart / Geschlecht / Alter / Entfernung / Treffer /
Gewicht / Foto / Notiz / Standort / Zeitstempel hat und nur ein Toggle
fehlt.

Tatsächlich ist `ErlegungSheet` ein dünner Wrapper um `WildartPicker.tsx`
— und WildartPicker ist ein 3-Stufen-Tap-Zähler, keine Detail-Maske:

- **Stufe 1:** 4×N-Grid der Wildgruppen (Tap = zählen, Long-Press =
  Schnellzähler)
- **Stufe 2a:** Altersklasse-Chips + Geschlecht-Buttons (Schalenwild)
- **Stufe 2b:** Flat-Grid (Raubwild / Hasen / Federwild)
- **Sticky-Bar unten:** "Krank"-Toggle, Reset, Foto-Buffer,
  "N Stück melden"

Es gibt keine Felder für Entfernung, Treffer, Gewicht, Notiz, keinen
Zeitstempel-Anzeige, keine Standort-Zeile, keine "wild-card mit ändern".
Das Modell ist Multi-Tap-Batch (N Kills auf einmal), nicht Einzel-Eintrag.

Das Mockup V2 zeigt eine fundamental andere UI — eine Einzel-Eintrag-
Detailmaske. Das Mockup umzusetzen heißt: ein neues Sheet bauen, in dem
der heutige WildartPicker bestenfalls als Wildart-Unter-Picker
("ändern" → Picker) weiterlebt. Das ist deutlich mehr als
"Toggle + Stepper + Submit-Verzweigung" aus Phase 1.2.

### Blocker B — `wild_events` kann die Detailfelder des Mockups nicht speichern

`wild_events` (Migration 036, seither unverändert) hat exakt diese Spalten:

| Spalte      | Typ                   | Constraint                                                     |
|-------------|-----------------------|----------------------------------------------------------------|
| id          | uuid                  | PK, default gen_random_uuid()                                  |
| user_id     | uuid                  | NOT NULL, FK auth.users, ON DELETE CASCADE                     |
| hunt_id     | uuid                  | NULL erlaubt, FK hunts, ON DELETE SET NULL                     |
| type        | wild_event_type       | NOT NULL (enum: sighting, shot, kill, miss, wounded, fallwild) |
| species     | text                  | NULL erlaubt                                                   |
| count       | integer               | default 1, CHECK (count >= 1) — keine Obergrenze               |
| occurred_at | timestamptz           | NOT NULL                                                       |
| location    | geography(Point,4326) | NULL erlaubt                                                   |
| note        | text                  | NULL erlaubt                                                   |
| created_at  | timestamptz           | default now()                                                  |

Abgleich mit dem `InsertSightingInput`-Typ aus dem Brief / den Mockup-Feldern:

| Mockup-/Brief-Feld           | wild_events-Spalte | Status          |
|------------------------------|--------------------|-----------------|
| species (Wildart)            | species            | ✅              |
| count (Anzahl)               | count              | ✅              |
| occurred_at (Zeitstempel)    | occurred_at        | ✅              |
| location (Standort)          | location           | ✅              |
| notes (Notiz)                | note (Singular!)   | ✅              |
| gender (Geschlecht)          | —                  | ❌ keine Spalte |
| age_class (Alter)            | —                  | ❌ keine Spalte |
| weight_estimate_kg (Gewicht) | —                  | ❌ keine Spalte |
| distance_m (Entfernung)      | —                  | ❌ keine Spalte |
| hit_zone (Treffer)           | —                  | ❌ keine Spalte |
| photo_url (Foto)             | —                  | ❌ keine Spalte |

6 der 12 Input-Felder lassen sich heute nicht persistieren. Das kollidiert
direkt mit der verbindlichen Mockup-Decision-Tag "Datenqualität bleibt —
auch Anblicke dürfen Geschlecht, Alter und geschätztes Gewicht enthalten."
Brief-Vorgabe für diesen Fall: Migration vorschlagen, STOP.

---

## Die 8 Pflicht-Punkte des Recon-Berichts

### R1. ErlegungSheet — Pfad + State-Management

- **Datei:** `src/components/erlegung/ErlegungSheet.tsx` (Wrapper) +
  `src/components/erlegung/WildartPicker.tsx` (die eigentliche Maske,
  797 Zeilen)
- **State:** Lokal via `useState` in beiden Components. Kein Hook, kein
  Context für den Sheet-State. ErlegungSheet hält nur `phase` (`'wildart'
  | 'solo-creating' | 'picking-district'`) + GPS-Watch + `soloHuntIdRef`.
  WildartPicker hält den ganzen Picker-State (step, `pendingKills[]`,
  `pendingPhotos[]`, krankMode, ...)
- **Geöffnet wird es** aus `src/components/bottom-tab-bar.tsx`:
  zentraler FAB (Slot 3, 56px Bullseye) setzt `erlegungOpen`. Zusätzlich
  via globalem Window-Event `quickhunt:open-erlegung` (vom Strecke-Tab-
  Empty-State). Der FAB ist auf jeder `/app/*`-Route sichtbar außer
  `/app/hunt/create` (HIDE_ON_ROUTES)
- **Heutige Felder in der Maske:** Wildgruppe → Altersklasse (=
  `wild_art`-Enum-Wert) → Geschlecht. Foto nur als Buffer-Button. Nicht
  vorhanden: Entfernung, Treffer, Gewicht, Notiz, Zeitstempel-Anzeige,
  Standort-Zeile
- **Pflichtfelder heute:** Es gibt keine Form-Validation im klassischen
  Sinn. Submit ist sichtbar/aktiv, sobald `pendingKills.length > 0`
  (mindestens ein Tap). Wildart ist implizit Pflicht (ohne Tap kein
  Eintrag). Geschlecht/Alter sind im Schalenwild-Flow faktisch erzwungen,
  weil man eine Altersklasse antippen muss, um zu zählen — also kein
  lockerbares Pflichtfeld-Flag, sondern Folge der Flow-Struktur
- **Submit-Pfad:** `WildartPicker.handleConfirmBatch()` →
  `insertKillBatch()` (Helper) → Foto-Upload → `router.refresh()` →
  `onKillSuccess(killIds, photos)` → zurück im
  `ErlegungSheet.handleKillSuccess()` (Solo-Hunt-Anlage + Redirect).
  Kein einzelner `insertKill.ts`-Call im Sheet — der Batch-Helper wird
  verwendet

### R2. wild_events Schema-Snapshot

Siehe Tabelle in Blocker B. Ergänzend:

- **Indizes:** `user_id`, `hunt_id`, `occurred_at DESC`, `type`
- **RLS:** eine Policy `wild_events_owner_all` — `FOR ALL USING
  (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())`. Ein client-
  seitiger Insert mit `user_id = session.user.id` ist damit erlaubt —
  kein `SECURITY DEFINER` nötig, anders als beim Trigger
- **Trigger auf wild_events:** keine. Der Trigger
  `trg_kills_sync_wild_event` (037) sitzt auf `kills`, nicht auf
  `wild_events`. Er legt ausschließlich `type='kill'`-Rows an und synct
  `hunt_id`, `species`, `occurred_at`, `location`. Sightings laufen
  komplett an ihm vorbei — `insertSighting` schreibt direkt und
  unabhängig in `wild_events`
- **Format location:** `geography(Point,4326)`. `insertKill.ts` schreibt
  EWKT-Strings (`SRID=4326;POINT(lng lat)`) in `kills.position`
  (geometry). Derselbe EWKT-String funktioniert auch für die geography-
  Spalte (PostGIS castet). Empfehlung für `insertSighting`: identisches
  EWKT-Pattern
- **Migrationen 038–046 geprüft:** keine berührt `wild_events`. Schema =
  036 unverändert

### R3. Schema-Lücke

6 Mockup-Felder gehen heute nicht ohne Migration: Geschlecht, Alter,
Gewicht-Schätzung, Entfernung, Treffer, Foto (siehe Blocker B). `notes →
note` ist okay. → Entscheidungspunkt 3.

### R4. AnblickCard — existiert, Solo-Pfad bereits implementiert

- **Datei:** `src/components/diary/cards/AnblickCard.tsx`. Existiert.
- **Verhalten bei `hunt_id=NULL`:** bereits voll unterstützt.
  `isHuntContext = item.huntId !== null` — bei Solo wird kein Hunt-Sub-
  Label gerendert, nur Datum + die sightings-Zeile (N× Wildart) + ggf.
  Notiz. Routing-Key fällt auf `toBerlinDateKey(occurredAt)` zurück
- **Geladen über** `getTimelineItems()` (`src/lib/diary/timeline.ts`,
  Server). Sightings werden bereits gezogen:
  `wild_events.eq('type','sighting')`, nach Hunt vs. orphan gesplittet;
  orphan-Sightings → pro Tag eine `TimelineAnblick` (Solo-Tag),
  Hunt-Sightings → eine AnblickCard pro Hunt "ohne Strecke"
- **Filter:** `src/lib/diary/filter.ts` kennt `inhalt='anblicke'` und
  `jagdart='solo'/'gesell'` — Solo-Anblicke und Hunt-Anblicke werden
  korrekt einsortiert

**Befund:** Phase 1.4 (AnblickCard Solo-Render-Pfad) ist faktisch
bereits erledigt. Der gesamte Anzeige-Pfad für Anblicke — Card, Timeline-
Aggregation, Filter, sogar die Detailseite (`AnblickDetailContent.tsx` +
Route `/app/du/tagebuch/[type]/[id]`) — ist bereits gebaut und funktioniert.
Es fehlt nur die Erfassung. Das verkleinert den Sprint-Scope erheblich auf
der einen Seite (1.4 entfällt), vergrößert ihn auf der anderen (Blocker A).

### R5. Wiederverwendbares Karten-Modal — existiert nicht

- Kein standalone Vollbild-Modal mit draggable Pin, das eine Koordinate
  zurückgibt
- Draggable-Marker-Logik existiert eingebettet in Seiten-Karten:
  `StandAssignmentMap.tsx` (`draggable={isMoving}` + dragend-Handler an
  Stand-Markern), `MapContent.tsx`, `BoundaryDrawLayer.tsx`. Alles
  react-leaflet, nicht als Picker gekapselt
- **Stack:** leaflet + react-leaflet (MapContainer, TileLayer, Marker,
  useMap). Leaflet-Default-Icon-Fix-Pattern ist etabliert
  (`/leaflet/marker-icon*.png`)
- **BKG TopPlusOpen Tile-URL** ist im Code vorhanden
  (StandAssignmentMap:345):
  `https://sgx.geodatenzentrum.de/wmts_topplus_open/tile/1.0.0/web/default/WEBMERCATOR/{z}/{y}/{x}.png`
  — kann 1:1 für LocationPickerModal übernommen werden
- **GPS:** Das Sheet bezieht GPS heute direkt über
  `navigator.geolocation.watchPosition` im ErlegungSheet (eigener
  `useEffect`, kein Hook). Daneben existiert `useGeolocation.ts`
  (Lock/Geofence/Fallback) und `waitForAccurateGpsFix()` (Promise-
  basiert, im Solo-Hunt-Flow genutzt). → Neuanlage `LocationPickerModal`
  nötig; GPS kann vom Sheet als Prop reingereicht werden

### R6. Hunt-Kontext-Erkennung + Auto-Solo-Hunt

- `current_hunt_id` kommt aus `useActiveHunt()`
  (`src/contexts/ActiveHuntContext.tsx`). `ActiveHuntProvider` lädt die
  jüngste hunts-Row mit `status='active'` + eigener `hunt_participants`-
  Teilnahme. Sauberer Boolean: `activeHunt !== null`
- **Im Sheet:** `effectiveHuntId = activeHunt?.id ??
  soloHuntIdRef.current`
- **Auto-Solo-Hunt** wird im ErlegungSheet angelegt, NICHT im Helper:
  `handleKillSuccess()` → falls keine aktive Hunt: GPS-Fix → Revier-
  Lookup → `createSoloHunt()` (`src/lib/supabase/hunts.ts`) → Kills per
  update zuordnen → Redirect. `insertKillBatch.ts` selbst ist agnostisch
  und bekommt `huntId` reingereicht
- → Für `insertSighting`: Die Sighting-Logik darf
  `handleKillSuccess` nicht durchlaufen. Vorgabe `hunt_id = activeHunt?.id
  ?? null` ist sauber abbildbar — `useActiveHunt()` liefert genau diesen
  Wert ohne Auto-Solo-Hunt-Nebeneffekt

### R7. `router.refresh()`-Realität

- Das Tagebuch ist eine Server Component (`app/app/du/tagebuch/page.tsx`,
  async, lädt `getTimelineItems`/`getDiaryStats` serverseitig).
  `DiaryTimelineList` ist Client, hält aber keinen eigenen Daten-Cache —
  es filtert nur die Props. → `router.refresh()` reicht aus, kein STOP
  nötig
- Im Erlegung-Pfad ist `router.refresh()` korrekt verdrahtet:
  `WildartPicker.handleConfirmBatch()` ruft es nach dem Batch-Insert,
  `ErlegungSheet.handleKillSuccess()` ruft es nochmal nach
  `createSoloHunt()`. Das C3-Pattern ist an dieser Mutation-Site real
  vorhanden — `insertSighting` kann es spiegeln

### R8. Hunt-Stream-Sichtbarkeit von Sightings — sauber, kein STOP

Wenn `hunt_id = current_hunt_id` an einem Sighting gesetzt wird:

- **Strecke-Tab:** `useHuntKills` / `useHuntStrecke` queryen ausschließlich
  die `kills`-Tabelle (`.from('kills').eq('hunt_id', …)`). `wild_events`
  wird dort nie gelesen. ✅ Sightings tauchen nicht auf
- **Realtime:** Die Subscriptions hängen am Channel
  `hunt-strecke-${huntId}` und filtern `table: 'kills'`. `wild_events`
  ist nicht in der Realtime-Publication `supabase_realtime` (CLAUDE.md-
  Regel 11). ✅ Kein Realtime-Push
- **Chat:** Kein Trigger und keine App-Logik erzeugt eine Chat-Message
  aus einem `wild_events`-Insert (`wild_events` hat null Trigger, ist
  nicht in Realtime). ✅ Kein Chat-Eintrag
- **Aggregationen:** `aggregateByWildGroup()` wird in `timeline.ts` nur
  mit kills-Rows gefüttert (`allKillsByHunt`). `hunts.share_total_strecke`
  ist ein Flag, kein Aggregat. `getDiaryStats.erlegungen` zählt
  `wild_events` mit explizitem `.eq('type','kill')` — Sightings
  (`type='sighting'`) werden nicht mitgezählt. `jagdtage` zählt Kill-
  Daten + Hunt-Teilnahme, nicht Sightings. ✅
- **Side-Effect-Check:** Trigger `trg_kills_activity` (039,
  `last_activity_at`-Heartbeat) sitzt auf `kills`, nicht `wild_events`.
  ✅ Ein Hunt-gebundenes Sighting verändert `last_activity_at` nicht

**Fazit R8:** Das Setzen von `hunt_id` an Anblicken hat keine ungewollten
Nebenwirkungen in der Hunt-UI. Sprint 60.5e kann sicher
`hunt_id = current_hunt_id` setzen.

---

## Entscheidungspunkte (am 21.05.2026 abends von Moritz entschieden)

1. **UI-Strategie:** H1 strikt — Batch-Picker bleibt unverändert,
   Mockup V2 wird zur Bearbeiten-Maske auf Card-Detail-Page (eigener
   Folge-Sprint 60.5e-2)
2. **Code-Struktur:** Modus-State im ErlegungSheet-Parent, Toggle nur
   sichtbar wenn `pendingKills.length === 0` (kein Mid-Flow-Switch)
3. **Schema-Migration 047:** JA, ABER zuerst `kills`-Schema-Snapshot
   abwarten für Symmetrie-Spiegelung
4. **Phase 1.4 (AnblickCard Solo-Pfad):** Bestätigt raus aus Scope —
   bereits implementiert

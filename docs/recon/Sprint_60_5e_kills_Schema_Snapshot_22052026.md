# Sprint 60.5e — `kills`-Schema-Snapshot (Nachforderung K1–K4)

**Datum:** 22.05.2026
**Erstellt von:** Claude Code — Antwort auf Nachforderung K1–K4 der Strategie-Reaktion
**Status:** Recon-Ergänzung. Kein Code, keine Migration. Eingabe für finalen Sprint-Brief 60.5e.

**Quelle:** Abgeleitet aus den Migrationen 003, 027, 028, 034, 036, 037, 039, 044
(`grep -ln "kills"` bestätigt: keine weitere Migration berührt die Tabelle).
Gleiche Methodik wie der `wild_events`-Snapshot im Recon-Bericht — **keine
Live-DB-Introspektion**, da kein `.recon_db`-Connection-Stub vorhanden ist
(gitignored, nach Mac-Neustart nicht regeneriert). Migrationen sind hier
deckungsgleich mit dem Live-Stand, solange keine Out-of-Band-Änderung im
Supabase-Dashboard erfolgt ist.

---

## TL;DR — Die eine wichtige Antwort

**`kills` hat heute schon ALLE 6 in `wild_events` fehlenden Detailfelder.**
Deine Hypothese aus Punkt 3 ("falls `kills` `gender`/`age_class` schon hat …")
löst sich auf: nicht nur diese zwei — **alle sechs** existieren bereits.

→ **Migration 047 braucht KEINEN `kills`-seitigen ALTER.** Sie ist eine reine
`wild_events`-Erweiterung.

Die Symmetrie-Frage dreht sich damit aber um: Nicht "fehlt was in `kills`?",
sondern **"`kills` benutzt deutsche Namen + zwei abweichende Typen — auf welche
Namen legt 047 die `wild_events`-Spalten?"** Das ist die Entscheidung, die der
finale Brief treffen muss (Abschnitt K1, Tabelle 2).

---

## K1 — Spalten-Liste mit Typen und Constraints

`kills` hat heute **31 Spalten**. Vollständige Liste (alle ALTERs angewendet):

| Spalte             | Typ                    | Constraint / Default                                              | Quelle |
|--------------------|------------------------|-------------------------------------------------------------------|--------|
| id                 | uuid                   | PK, default `uuid_generate_v4()`                                  | 003    |
| hunt_id            | uuid                   | NULL erlaubt, FK `hunts(id)`                                      | 003    |
| district_id        | uuid                   | NULL erlaubt, FK `districts(id)`                                  | 003    |
| participant_id     | uuid                   | NULL erlaubt, FK `hunt_participants(id)`                          | 003    |
| reporter_id        | uuid                   | **NOT NULL**, FK `profiles(id)`                                  | 003    |
| wild_art           | wild_art (enum)        | **NOT NULL**                                                      | 003 (+028 Enum-Werte) |
| geschlecht         | geschlecht (enum)      | **NULL erlaubt**, DEFAULT NULL — *027 hat NOT NULL gedroppt*       | 003 → 027 |
| altersklasse       | text                   | NULL erlaubt                                                      | 003    |
| gewicht_kg         | float                  | NULL erlaubt — Kommentar: *"aufgebrochen"*                         | 003    |
| jagdart            | jagdart (enum)         | NULL erlaubt                                                      | 003    |
| foto_url           | text                   | NULL erlaubt                                                      | 003    |
| position           | geometry(Point,4326)   | NULL erlaubt                                                      | 003    |
| hochsitz_id        | uuid                   | NULL erlaubt, FK `map_objects(id)`                               | 003    |
| waffe              | text                   | NULL erlaubt                                                      | 003    |
| kaliber            | text                   | NULL erlaubt                                                      | 003    |
| nachsuche          | boolean                | DEFAULT false                                                     | 003    |
| verbleib           | verbleib (enum)        | NULL erlaubt                                                      | 003    |
| wildmarke_nr       | text                   | NULL erlaubt                                                      | 003    |
| shooting_plan_id   | uuid                   | NULL erlaubt — **kein erzwungener FK** (nur Kommentar im Schema)   | 003    |
| trichinen_pflicht  | boolean                | DEFAULT false — *Trigger setzt true bei Schwarzwild*              | 003    |
| trichinen_ergebnis | text                   | NULL erlaubt                                                      | 003    |
| freigabe_verkauf   | boolean                | DEFAULT false                                                     | 003    |
| erlegt_am          | timestamptz            | DEFAULT now()                                                     | 003    |
| created_at         | timestamptz            | DEFAULT now()                                                     | 003    |
| updated_at         | timestamptz            | DEFAULT now() — *Trigger `trg_kills_updated`*                     | 003    |
| status             | kill_status (enum)     | **NOT NULL**, DEFAULT `'harvested'` (Werte: harvested, wounded)    | 027    |
| kapital            | boolean                | **NOT NULL**, DEFAULT false                                       | 034    |
| notiz              | text                   | NULL erlaubt                                                      | 034    |
| wild_event_id      | uuid                   | NULL erlaubt, FK `wild_events(id)` ON DELETE SET NULL             | 036    |
| weather_snapshot   | jsonb                  | NULL erlaubt                                                      | 036    |
| distance_m         | integer                | NULL erlaubt, CHECK `(distance_m IS NULL OR distance_m >= 0)`      | 036    |
| hit_location       | hit_location (enum)    | NULL erlaubt (Werte: kammer, blattschuss, traeger, weidwund, krellschuss, lauf, sonstige) | 044 |

### Tabelle 2 — Abgleich gegen die 6 fehlenden `wild_events`-Felder

| Brief-/Mockup-Feld (`wild_events`) | `kills`-Spalte heute | Typ in `kills`        | Befund |
|------------------------------------|----------------------|-----------------------|--------|
| gender (Geschlecht)                | **geschlecht**       | geschlecht (enum)     | ✅ vorhanden — Enum, nicht text. Name DE. |
| age_class (Alter)                  | **altersklasse**     | text                  | ✅ vorhanden (text). Zusätzlich kodiert `wild_art` die Altersklasse (bockkitz, schmalbock, schmaltier_rot …) — heute der faktische Träger. |
| weight_estimate_kg (Gewicht)       | **gewicht_kg**       | float                 | ⚠ vorhanden, aber Semantik = *"aufgebrochen"* (Ist-Gewicht), nicht *"Schätzung"*. |
| distance_m (Entfernung)            | **distance_m**       | integer, CHECK ≥ 0    | ✅ vorhanden (036). **Name identisch.** |
| hit_zone (Treffer)                 | **hit_location**     | hit_location (enum)   | ⚠ vorhanden, aber Name + Typ weichen ab (Enum mit 7 Werten vs. im Brief geplantes `hit_zone`). |
| photo_url (Foto)                   | **foto_url**         | text                  | ✅ vorhanden — Name weicht ab (`foto_url` vs. `photo_url`). |

**Notiz:** `kills.notiz` (text, seit Migration 034) ↔ `wild_events.note`. Beide
vorhanden, beide Singular, semantisch deckungsgleich.

**Standort:** `kills.position` ist **`geometry(Point,4326)`** ↔ `wild_events.location`
ist **`geography(Point,4326)`**. Beide vorhanden — aber `geometry` vs. `geography`.
Der Sync-Trigger 037 castet `NEW.position::geography`. `insertKill.ts` schreibt
EWKT (`SRID=4326;POINT(lng lat)`) in beide problemlos.

### → Entscheidung für den finalen Brief: Namens-/Typ-Strategie für Migration 047

`kills` deckt alles ab, also ist 047 wild_events-only. Aber für die symmetrische
Edit-Maske (Folge-Sprint 60.5e-2, die Erlegung *und* Anblick bearbeiten soll)
muss eine von zwei Linien gewählt werden:

- **Option A — DE-aligned:** 047 legt die `wild_events`-Spalten unter den
  `kills`-Namen an (`geschlecht`, `altersklasse`, `gewicht_kg`, `foto_url`,
  `hit_location`). DB-konsistent über beide Tabellen, eine gemeinsame Edit-Maske
  ohne Mapping-Layer. Bricht mit dem englischen `InsertSightingInput`-Typ aus dem
  Brief — der Typ müsste umbenannt werden.
- **Option B — EN wie Brief:** 047 legt sie unter `gender`, `age_class`,
  `weight_estimate_kg`, `hit_zone`, `photo_url` an. Hält den Brief-Typ, aber die
  DB ist zweisprachig und die Edit-Maske braucht eine Mapping-Schicht
  (`kills.geschlecht` ↔ `wild_events.gender` usw.).

Zwei Sonderfälle unabhängig von A/B:
1. **Gewicht-Semantik:** `kills.gewicht_kg` = aufgebrochenes Ist-Gewicht. Der
   Brief will eine *Schätzung*. Wenn beide Tabellen ein "Schätzgewicht" tragen
   sollen, ist das eine **neue** Spalte (`wild_events` + ggf. `kills`), keine
   Spiegelung von `gewicht_kg`.
2. **Treffer-Typ:** `kills.hit_location` ist ein 7-Werte-Enum. Soll `wild_events`
   denselben Enum bekommen (`hit_location`-Typ wiederverwenden) oder ein freies
   `text hit_zone`? Enum-Wiederverwendung ist sauberer und edit-symmetrisch.

---

## K2 — Trigger auf `kills`

Vier Trigger, alle aktiv:

| Trigger                      | Timing                     | Funktion                       | Quelle | Zweck |
|------------------------------|----------------------------|--------------------------------|--------|-------|
| `trg_kills_trichinen`        | BEFORE INSERT OR UPDATE     | `set_trichinen_pflicht()`      | 003    | Setzt `trichinen_pflicht=true` bei wild_art ∈ (keiler, bache, ueberlaeufer, frischling) |
| `trg_kills_updated`          | BEFORE UPDATE               | `update_updated_at()`          | 003    | `updated_at := now()` |
| `trg_kills_sync_wild_event`  | AFTER INSERT OR UPDATE OR DELETE | `sync_wild_event_for_kill()` | 037    | Spiegelt `kills` → `wild_events` (Typ `'kill'`) |
| `trg_kills_activity`         | AFTER INSERT OR UPDATE      | `update_hunt_last_activity()`  | 039    | Heartbeat `hunts.last_activity_at` (1-Min-Throttle, nur wenn `hunt_id` gesetzt) |

### Kritischer Punkt — `trg_kills_sync_wild_event` erweitert sich NICHT automatisch

Der Sync-Trigger kopiert heute **ausschließlich 4 Felder** von `kills` nach
`wild_events`:

```
INSERT-Branch:  user_id (←reporter_id), hunt_id, type='kill',
                species (←wild_art::text), occurred_at (←COALESCE(erlegt_am,created_at)),
                location (←position::geography), created_at
UPDATE-Sync:    hunt_id, species, occurred_at, location   (mit Diff-Check)
```

Der Funktions-Header von 037 sagt explizit (Zeilen 44–45):

> *"Andere Spalten (notiz, kapital, weather_snapshot, distance_m) bleiben bewusst
> kill-lokal."*

**Konsequenz für Migration 047:** Wenn 047 Detailfelder zu `wild_events` hinzufügt
und diese bei einer **Erlegung** (nicht nur beim Anblick) befüllt sein sollen —
damit die Tagebuch-Detailseite einer Erlegung Geschlecht/Alter/Gewicht/Treffer
zeigt — dann **muss der Trigger manuell erweitert werden**: sowohl der
INSERT-Branch (`INSERT INTO wild_events (…)`) als auch der UPDATE-Sync-Branch
inkl. dem Diff-Check (`IS DISTINCT FROM`). Der Trigger picks neue Spalten **nicht
von allein** auf.

Offene Design-Frage, die der Brief beantworten muss: Sollen Erlegungs-Details
überhaupt nach `wild_events` gespiegelt werden, oder bleibt `wild_events` für
`type='kill'` weiter ein dünner Index und die Detailseite einer Erlegung liest
direkt aus `kills` (via `kills.wild_event_id`)? Recon R8 + die heutige
Strecke-Tab-Logik (liest nur `kills`) sprechen dafür, dass **`kills` die Source
of Truth für Erlegungen bleibt** und der Trigger schlank bleibt — dann braucht
047 keine Trigger-Änderung, und `wild_events`-Detailspalten werden **nur vom
Anblick-Pfad (`insertSighting`)** befüllt. Empfehlung: so lassen, Trigger nicht
anfassen. Finale Entscheidung im Brief.

---

## K3 — RLS und Insert-Pfad

### RLS-Policies auf `kills` (RLS ist aktiviert)

| Policy                              | Befehl     | Bedingung | Quelle |
|-------------------------------------|------------|-----------|--------|
| `kills_reporter`                    | FOR ALL    | USING `reporter_id = auth.uid()` — **kein explizites WITH CHECK** (fällt für INSERT auf die USING-Expression zurück) | 003 |
| `kills_district_owner`              | FOR SELECT | `district_id IN (SELECT id FROM districts WHERE owner_id = auth.uid())` | 003 |
| `kills_visibility_all`              | FOR SELECT | Hunt-Teilnehmer (`get_my_hunt_ids()`) UND `hunts.kill_visibility = 'all'` | 027 |
| `kills_visibility_leader`           | FOR SELECT | Jagdleiter (`get_my_hunt_ids_as_leader()`) UND `kill_visibility = 'leader_only'` | 027 |
| `kills_visibility_leader_groupleader` | FOR SELECT | Jagdleiter/Gruppenleiter UND `kill_visibility = 'leader_and_groupleader'` | 027 |

**Bedeutung für den Insert-Pfad:** `kills_reporter` deckt INSERT/UPDATE/DELETE/SELECT
des eigenen Users ab. Ein **client-seitiger Insert mit `reporter_id = user.id`
ist erlaubt — kein `SECURITY DEFINER` nötig.** Identisch zur `wild_events`-Lage
(`wild_events_owner_all`) aus dem Recon-Bericht R2. Die 4 SELECT-Policies regeln
nur das Lesen *fremder* Kills im Hunt-Kontext.

### `insertKillBatch` (`src/lib/erlegung/insertKill.ts`)

Reiner Client-Helper (Browser-Supabase-Client). Ablauf:

1. `supabase.auth.getUser()` → wirft bei fehlendem Login
2. Mappt jedes `BatchKillInput` auf eine Row mit **exakt diesen 6 Feldern:**
   `reporter_id` (=user.id), `hunt_id`, `wild_art`, `status`, `geschlecht`,
   `position` (EWKT `SRID=4326;POINT(lng lat)`), `erlegt_am`
3. Ein einziges `.from('kills').insert(rows).select('id')` → Array von IDs

**Wichtig für den Brief:** Der Batch-Helper schreibt **keine** Detailfelder —
`altersklasse`, `gewicht_kg`, `distance_m`, `hit_location`, `foto_url`, `notiz`
bleiben beim Batch-Insert NULL bzw. Default. Das bestätigt direkt Moritz'
Entscheidung 1: Im Erfassungs-Moment entstehen schlanke Kills (Wildart +
Geschlecht + Standort), Detail-Anreicherung passiert nachträglich über die
Edit-Maske (Folge-Sprint 60.5e-2). Der `insertSighting`-Helper kann `insertKill.ts`
strukturell 1:1 spiegeln — gleiche RLS-Lage, gleiches EWKT-Pattern.

Alle übrigen `kills`-Spalten werden beim Insert von DB-Defaults / Triggern
gefüllt: `status` default `'harvested'`, `trichinen_pflicht` per
`trg_kills_trichinen`, `wild_event_id` per `trg_kills_sync_wild_event`,
`created_at`/`updated_at`/`erlegt_am` per Default.

---

## K4 — Index-Snapshot

8 Indizes (zzgl. Primary Key auf `id`):

| Index                   | Spalte(n)                    | Quelle |
|-------------------------|------------------------------|--------|
| idx_kills_district      | district_id                  | 003    |
| idx_kills_hunt          | hunt_id                      | 003    |
| idx_kills_reporter      | reporter_id                  | 003    |
| idx_kills_wild_art      | wild_art                     | 003    |
| idx_kills_erlegt_am     | erlegt_am DESC               | 003    |
| idx_kills_geo           | position (GiST)              | 003    |
| idx_kills_status        | status                       | 027    |
| idx_kills_wild_event_id | wild_event_id                | 036    |

---

## Sonstiges (relevant für Brief / Migration 047)

- **Realtime:** `kills` ist in der Publication `supabase_realtime` (003:679) —
  anders als `wild_events`. Recon R8 hat das bereits korrekt eingeordnet.
- **`wild_art`-Enum-Domäne:** Die für die Erlegung relevanten Werte stammen aus
  003 + 027 + 028 (Schmaltier/Spießer für Rot-/Damwild, `*_unspez`-Sammelwerte,
  bockkitz/schmalbock/schmalreh, hase/wildkaninchen/ente). Falls `insertSighting`
  Anblicke auf `wild_events.species` als **text** schreibt, gibt es keine
  Enum-Bindung — anders als bei `kills.wild_art`.
- **`shooting_plan_id`** ist im Schema nur `uuid` mit Kommentar "FK zu
  shooting_plans" — **kein erzwungener Foreign Key.** Für 047 irrelevant, nur
  zur Vollständigkeit notiert.

---

## Status

K1–K4 geliefert. Kernaussage: **Migration 047 = reine `wild_events`-Erweiterung,
kein `kills`-ALTER.** Offene Entscheidungen für den finalen Sprint-Brief 60.5e:

1. Namens-Linie für die neuen `wild_events`-Spalten (Option A DE-aligned /
   B EN wie Brief)
2. Gewicht: neue "Schätzgewicht"-Spalte vs. Wiederverwendung `gewicht_kg`
3. Treffer: `hit_location`-Enum wiederverwenden vs. freies `text hit_zone`
4. `trg_kills_sync_wild_event`: schlank lassen (Empfehlung) vs. um Detailfelder
   erweitern

Nächster Schritt laut Vorgabe: Claude schreibt den finalen Sprint-Brief 60.5e.

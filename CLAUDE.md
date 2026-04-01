# RevierApp — Jagd-App für Gruppenkoordination

## Projekt

**Mobile-first Jagd-App** (QuickHunt) mit Desktop-Revierzentrale als Abo.
KI-gestützte Streckenerfassung (später), Live-Karte, Chat, Nachsuche-Koordination.
Ziel: Kommerzielle SaaS-Lösung für Jagdpächter, Jagdleiter, Berufsjäger.

**USP:** Jagd starten wie WhatsApp-Gruppe — Gäste ohne Account, ohne Download, ein Link.

**Betreiber:** Moritz Lampe (BioGut Brockwinkel)
**Pilotrevier:** Brockwinkel bei Reppenstedt (53.264, 10.354)
**Sprache:** Deutsch (UI, Variablennamen deutsch, Code-Kommentare deutsch)
**Stand:** April 2026

### Aktueller Stand (01.04.2026)

- Auth funktioniert (Login, Registrierung, Profil-Trigger)
- Jagd erstellen funktioniert (mit Kontakten, Rollen, Wildarten, Invite-Code)
- Dark Theme v4 funktioniert (CSS-Variablen, DM Sans Font)
- Deployed auf Hetzner via Coolify (Auto-Deploy aus GitHub)
- 6 User registriert
- **Nächster Schritt:** Live-Karte (Supabase Realtime + Leaflet + GPS-Positionen)

---

## Tech-Stack

- **Frontend:** Next.js 16 (App Router, TypeScript), Tailwind CSS, shadcn/ui
- **Karten:** Leaflet (react-leaflet) + WMS-Support
- **Backend:** Supabase (PostgreSQL + PostGIS, Auth, Realtime, Storage)
- **Design:** Dark Theme, DM Sans Font, CSS-Variablen (kein Tailwind-Farbsystem)
- **Auth:** Supabase Auth (aktuell E-Mail+Passwort, später Telefon+SMS)
- **Hosting:** Hetzner CX22 (46.225.149.118), Coolify, GitHub Auto-Deploy
- **Lokal:** `npm run dev` → `http://localhost:3000`
- **API-Keys:** In `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)

---

## ⚠ KRITISCHE REGELN

1. **Alle Größen in `rem` statt `px`** — von Tag 1, nachträglich umbauen wäre teuer.
2. **Buttons mindestens 44×44pt** — Apple-Richtlinie, Handschuh-tauglich im Wald.
3. **Keine Tailwind-Farbklassen** (bg-green-700 etc.) — stattdessen CSS-Variablen: `style={{ background: 'var(--green)' }}`.
4. **Kein `localStorage`** — Supabase ist die einzige Datenquelle.
5. **Keine Mock-Daten hardcoden** — immer aus Supabase laden.
6. **Server Components wo möglich**, `'use client'` nur bei Interaktivität (State, Event-Handler).
7. **PostGIS für Geodaten** — `geometry(Point, 4326)`, nicht separate lat/lng-Spalten.
8. **RLS-Policies: `get_my_hunt_ids()`** verwenden statt Subquery auf hunt_participants (Rekursion!).
9. **E-Mail-Bestätigung ist AUS** in der Entwicklung (Supabase Dashboard).
10. **Prototyp v4 ist die Design-Referenz** — `RevierApp_Prototyp_v4_mobile.html` zeigt das Ziel-Design.

### Supabase-Regeln

11. **Realtime nur auf 5 Tabellen:** positions_current, messages, kills, tracking_requests, hunts.
12. **positions_current ist UPSERT**, positions ist Append-Log. Nicht verwechseln.
13. **Trichinen-Trigger ist automatisch** — bei Schwarzwild wird `trichinen_pflicht = true` gesetzt.
14. **Gast-Beitritt:** hunt_participants hat CHECK (user_id OR guest_name). Nie beide NULL.
15. **Invite-Code:** 8 Zeichen alphanumerisch, unique. Wird beim Jagd-Erstellen generiert.
16. **Profil-Trigger braucht SET search_path = public** — ohne das findet die Funktion die profiles-Tabelle nicht.
17. **Confirm sign up muss AUS sein** in Supabase Authentication → Configuration. Sonst bouncen Test-E-Mails.

---

## Strategische Richtung

- **Mobile = QuickHunt.** Jagd starten, Leute einladen, Live-Karte, Chat, Strecke, Nachsuche.
- **Desktop = Revierzentrale.** Statistiken, Abschussplan, JES, Wildbretvermarktung, Drückjagd-Planung.
- **Brücke:** Was im Feld passiert → fließt automatisch in die Web-Ansicht. Was am Schreibtisch geplant wird → erscheint am Jagdtag auf Mobile.
- **Führendes Dokument:** `RevierApp_QuickHunt_Konzept.md` — 17 Abschnitte, alle Entscheidungen.

### Kernprinzipien

- **"Die App schlägt vor, der Jäger entscheidet."** — Alles vorausgefüllt, alles änderbar.
- **Gast = volle Jagd** — Kein abgespecktes Erlebnis. Kein Account, kein Download.
- **Eine Aktion, fünf Ergebnisse** — Ein Foto = Streckenbuch + Schusstagebuch + Abschussplan + Streckenkarte + WhatsApp-Share.
- **WhatsApp nicht bekämpfen, sondern nutzen** — App generiert teilbare Inhalte FÜR WhatsApp.

---

## Design-System (CSS-Variablen in globals.css)

```css
--bg: #0a0f08          /* Hintergrund */
--surface: #141c10     /* Cards, Panels */
--surface-2: #1c2818   /* Erhöhte Flächen */
--surface-3: #243220   /* Akzentflächen */
--green: #6B9F3A       /* Primary */
--green-bright: #8BC34A /* Primary hell */
--green-dim: #3d5e22   /* Primary dunkel */
--orange: #FF8F00      /* Hundeführer, Warnungen */
--red: #EF5350         /* Live-Dot, Fehler */
--blue: #42A5F5        /* Gruppenleiter, Info */
--gold: #FFD700        /* Jagdleiter-Badge */
--text: #f0f0e8        /* Primärtext */
--text-2: rgba(240,240,232,0.6) /* Sekundärtext */
--text-3: rgba(240,240,232,0.3) /* Tertiärtext */
--border: rgba(107,159,58,0.12) /* Standardrahmen */
--radius: 14px         /* Standard-Borderradius */
```

**Font:** DM Sans (Google Fonts Import in globals.css)

---

## Rollen (vereinfacht)

| Rolle | Beschreibung | Vergabe |
|---|---|---|
| Jagdleiter | Sieht alles + Kommandoleiste | Automatisch: wer Jagd erstellt |
| Schütze | Karte, Chat, Strecke, Nachsuche | Standard für alle |
| +👥 Gruppenleiter | Zusatz-Tag, additiv | Manuell antippbar |
| +🐕 Hundeführer | Zusatz-Tag, bekommt Nachsuche-Aufträge | Manuell antippbar |

Rollen ERWEITERN, schränken NICHT ein. Jeder sieht die volle Jagd.

---

## Dateistruktur

```
├── app/
│   ├── layout.tsx              # Root-Layout (DM Sans, Dark Theme, Viewport)
│   ├── globals.css             # Design-System (CSS-Variablen, Input/Button-Styles, Avatare, Badges)
│   ├── page.tsx                # Root-Redirect → /app oder /login
│   ├── login/page.tsx          # Login (E-Mail + Passwort)
│   ├── signup/page.tsx         # Registrierung (Name + E-Mail + Passwort)
│   ├── auth/callback/route.ts  # E-Mail-Bestätigung Callback
│   ├── join/[code]/page.tsx    # Gast-Beitritt (öffentlich, kein Login nötig)
│   └── app/
│       ├── page.tsx            # QuickHunt Home (Quick Actions, Jagdliste)
│       ├── logout-button.tsx   # Client Component: Abmelden
│       └── hunt/
│           ├── create/page.tsx # Jagd erstellen (Kontakte, Rollen, Wildarten)
│           └── [id]/page.tsx   # Live-Jagd (Top Bar, Kommandoleiste, 4 Tabs)
├── lib/
│   └── supabase/
│       ├── client.ts           # Browser-Client (createBrowserClient)
│       └── server.ts           # Server-Client (createServerClient mit Cookies)
├── middleware.ts                # Session-Refresh + Route-Schutz
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql      # Alt (Archiv)
│       ├── 002_zone_policies.sql       # Alt (Archiv)
│       └── 003_quickhunt_schema.sql    # AKTUELL: 22 Tabellen + RLS + Realtime + Triggers
├── RevierApp_QuickHunt_Konzept.md      # Führendes Dokument (alle Entscheidungen)
├── RevierApp_Uebergabe_v2.md           # Technischer Stand + Plan
├── RevierApp_Datenfluss_Revierzentrale.md # Datenfluss-Übersicht
├── RevierApp_Prototyp_v4_mobile.html   # DESIGN-REFERENZ für alle Mobile-Seiten
├── RevierApp_Prototyp_v3.html          # Desktop-Referenz (Revierzentrale)
├── RevierApp_Nachsuche_Mockup.html     # Vision: Foto-Annotation
├── RevierApp_Streckenkarte_Mockup.html # Vision: WhatsApp-Share-Karte
└── .env.local                          # NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
```

---

## Datenbank-Schema (22 Tabellen)

Schema in `supabase/migrations/003_quickhunt_schema.sql`.

### QuickHunt-Tabellen (entstehen im Feld)

| Tabelle | Zweck |
|---|---|
| profiles | Erweitert auth.users (display_name, phone, waffe, kaliber) |
| hunts | Jagd-Events (name, type, status, invite_code, wild_presets) |
| hunt_participants | Teilnehmer (user_id ODER guest_name, role, tags) |
| positions | GPS-History (Append-Log für Tracks/Heatmaps) |
| positions_current | Aktuelle Position pro Teilnehmer (UPSERT → Realtime) |
| messages | Chat (text, photo, audio, signal, kill_report) |
| kills | Strecke — ZENTRALE TABELLE (speist Streckenbuch, Abschussplan, Wildbret, Statistik) |
| tracking_requests | Nachsuche-Meldungen mit Foto-Annotation (3 Marker) |
| observations | Beobachtungen (Wildschaden, auffälliges Wild, Raubwild) |

### Revierzentrale-Tabellen (Schreibtisch)

| Tabelle | Zweck |
|---|---|
| districts | Reviere mit PostGIS-Grenze |
| map_objects | Hochsitze, Parkplätze, Kirrungen etc. |
| zones | Jagdzonen, Ruhezonen |
| shooting_plans | Abschussplan (Soll, Ist wird live aus kills berechnet) |
| hunting_licenses | JES-Verwaltung (Inhaber, Kontingente, Zonen, PDF) |
| hunt_groups / hunt_group_members | Jagdgruppen pflegen |
| driven_hunts / driven_hunt_stands / driven_hunt_rsvps | Drückjagd-Planung |
| game_meat_customers / game_meat_invoices | Wildbretvermarktung |

---

## GPS-Konzept

| Modus | GPS-Intervall | Wann | Akku |
|---|---|---|---|
| Am Stand | GPS aus (gelockt) | Genauigkeit <10m erreicht | Quasi null |
| Unterwegs | Alle 30–60s | Geofence verlassen | Niedrig |
| Drückjagd | Alle 5–10s | "Treiben!" aktiv | Mittel |

Schlechte Messungen (>10m Genauigkeit) werden komplett verworfen. Fallback nach 2 Min.

---

## Debugging-Workflow

### Grundregel: Code zuerst lesen, DANN im Browser verifizieren

**Bei Bugs IMMER zuerst die relevanten Dateien komplett lesen**, den Root Cause im Code finden, und DANN gezielt testen. NICHT blind in Supabase-Tabellen oder DevTools suchen — das kostet 10x so viele Roundtrips.

**Typischer Fehler:** Styling kaputt → statt globals.css + layout.tsx zu lesen, im Browser Element-für-Element inspizieren. Besser: Die CSS-Variablen-Kette komplett lesen → Root Cause in 2 Minuten statt 20.

### Debugging-Schritte

```
1. Relevante Quelldateien KOMPLETT lesen
2. Root Cause im Code identifizieren (Hypothese bilden)
3. Gezielt verifizieren: DevTools Console ODER Supabase SQL Editor
4. Fix basierend auf tatsächlichem Verhalten (nicht Vermutung!)
5. Browser-Cache löschen wenn nötig: Remove-Item -Recurse -Force .next
6. npm run dev neu starten
7. Testen im Browser mit echten Supabase-Daten
```

### Dateien-Zuordnung bei Bugs

| Bug-Kategorie | Zuerst lesen |
|---|---|
| Styling/Dark Theme greift nicht | app/globals.css + app/layout.tsx |
| Tailwind-Klassen funktionieren nicht | tailwind.config.ts + app/globals.css (Tailwind v4 nutzt @import) |
| Auth/Login funktioniert nicht | lib/supabase/server.ts + middleware.ts |
| RLS-Rekursion / infinite recursion | 003_quickhunt_schema.sql (get_my_hunt_ids Funktion) |
| Jagd erstellen schlägt fehl | app/app/hunt/create/page.tsx + hunts/hunt_participants RLS-Policies |
| Gast-Beitritt geht nicht | app/join/[code]/page.tsx + hunt_participants RLS-Policies |
| GPS/Positionen | positions_current Policies + Realtime-Config |
| Daten laden nicht | Supabase RLS-Policies prüfen (SQL Editor → als User testen) |
| Seite nicht gefunden (404) | Ordnerstruktur in app/ prüfen (Next.js App Router: Ordner = Route) |
| Hydration Mismatch | Server- vs. Client-Rendering prüfen, 'use client' Direktive |
| Build-Fehler | TypeScript-Errors in Terminal, fehlende Imports |

**NIEMALS blind in Supabase-Tabellen suchen ohne vorher den Code gelesen zu haben.**

---

## Deploy-Workflow

```bash
# 1. Lokal entwickeln + testen
npm run dev
# Browser: localhost:3000

# 2. Committen + Pushen
git add -A
git commit -m "Beschreibung"
git push

# 3. Coolify deployt automatisch (oder manuell in Coolify Dashboard klicken)

# 4. Live testen
# Browser: http://d11fvwz5c1n65e871e5kbt3h.46.225.149.118.sslip.io
```

### Bei Problemen auf dem Server

```bash
# SSH auf Hetzner
ssh -i ~/.ssh/revierapp_hetzner root@46.225.149.118

# Coolify-Logs prüfen
# → Coolify Dashboard → Application → Deployment Logs
```

---

## Infrastruktur

| Komponente | Wert |
|---|---|
| GitHub | github.com/moritzlampe/revierapp |
| Supabase | bzfevyqfkizmovoclysy.supabase.co |
| Hetzner | 46.225.149.118 (CX22, Ubuntu 24.04, Coolify) |
| SSH | `ssh -i ~/.ssh/revierapp_hetzner root@46.225.149.118` |
| Live-URL | http://d11fvwz5c1n65e871e5kbt3h.46.225.149.118.sslip.io |

---

## Geschäftsmodell

- **Kostenlos (Schütze/Gast):** Eingeladen werden, voller Jagd-Flow, Streckenkarte teilen
- **Abo (Jagdleiter):** Sobald man selbst Jagd erstellt. Inkl. Revierzentrale.
- **Einstieg:** 1 Jagd kostenlos + 30 Tage Web-Zugang
- **Abo weg = Daten weg.** Kein Freemium-Friedhof.
- **Später:** Outfitter-Stufe (~25€/Mo), Reisebüro-Stufe (~50€/Mo)

---

## Code-Konventionen

- Deutsch für UI-Texte und Variablennamen (`jagdleiter`, `wild_art`, `erlegt_am`)
- CSS-Variablen für alle Farben (niemals hardcoded Hex in Komponenten)
- `rem` für alle Größen, `px` nur in CSS-Variablen-Definitionen
- Supabase-Client: `createClient()` aus lib/supabase/client.ts (Browser) oder server.ts (Server)
- Enums in der DB (wild_art, geschlecht, etc.) — TypeScript-Types daraus ableiten
- Ordnerbasiertes Routing (Next.js App Router): `app/[route]/page.tsx`
- `'use client'` Direktive nur in Dateien mit useState, useEffect, Event-Handler
- Keine externen UI-Libraries außer shadcn/ui und Leaflet
- Prompts für Claude Code einzeln ausführen, `/clear` dazwischen, testen nach jedem Prompt

---

## Nächste Schritte

### Spur 1 — Dark Theme / Design fixen
1. CSS-Variablen aus globals.css zum Laufen bringen (Tailwind v4 Kompatibilität prüfen)
2. Alle Seiten auf v4-Prototyp-Design bringen
3. DM Sans Font laden und anwenden

### Spur 2 — QuickHunt-Kern funktional
1. Live-Karte: Supabase Realtime + Leaflet + GPS-Positionen
2. Chat: Supabase Realtime + Text + Fotos (Supabase Storage)
3. Strecke melden: Schnellmeldung-Buttons → kills-Tabelle
4. Nachsuche melden: Formular → tracking_requests

### Spur 3 — Polish + Revier
1. Revier verknüpfen (Hochsitze + Grenzen auf Karte)
2. Push-Benachrichtigungen (Einladung, Signale, Nachsuche)
3. Mobile PWA (installierbar)

### Offene Bugs
- Profil-Name zeigt "Jäger" bei Moritz (alter User, Trigger existierte beim Registrieren noch nicht). Fix: `UPDATE profiles SET display_name = 'Moritz' WHERE display_name LIKE '%@%' OR display_name = 'Jäger'`
- Playwright MCP nicht konfiguriert in Claude Code
- Next.js 16 Middleware-Warnung (deprecated, auf "proxy" umbauen)

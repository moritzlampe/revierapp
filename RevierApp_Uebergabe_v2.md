# RevierApp — Übergabe & Nächste Sessions

## Stand: 01.04.2026 (nach Brainstorming-Session)

---

## Strategiewechsel: QuickHunt ist der Kern

Die alte FeatureMap (Desktop-first, Revierverwaltung als Kern) ist überholt. Neue Richtung:

- **Mobile = QuickHunt.** Jagd starten, Leute einladen, Live-Karte, Chat, Strecke, Nachsuche. Das ist die App.
- **Desktop = Revierzentrale.** Statistiken, Abschussplan, JES, Wildbretvermarktung, Jagdgruppen verwalten. Das ist das Abo.
- **Führendes Dokument:** `RevierApp_QuickHunt_Konzept.md` (17 Abschnitte, alle Entscheidungen)

---

## Infrastruktur (unverändert)

- **GitHub:** github.com/moritzlampe/revierapp
- **Supabase:** bzfevyqfkizmovoclysy.supabase.co (11 Tabellen, RLS, PostGIS)
- **Hetzner:** 46.225.149.118 (CX22, Ubuntu 24.04, Coolify)
- **Live-URL:** http://d11fvwz5c1n65e871e5kbt3h.46.225.149.118.sslip.io
- **SSH:** ssh -i ~/.ssh/revierapp_hetzner root@46.225.149.118
- **Stack:** Next.js 16 + TypeScript + Tailwind + shadcn/ui + Leaflet + Supabase

---

## Was existiert

### Code auf Hetzner ✅
- Next.js App mit Sidebar-Navigation (8 Views)
- Revierkarte mit Leaflet, Layer-Switcher, Reviergrenze, Share-Modal
- Alle Views mit Demo-Daten (Strecke, Beobachtungen, Gäste, JES, Drückjagd, Kalender, Einstellungen)
- Öffentliche Seiten: Gästelink, RSVP, Nachsuche, Login-Seiten
- Supabase .env.local konfiguriert

### Prototypen & Mockups (aus Brainstorming) ✅
- `RevierApp_Prototyp_v3.html` — Desktop-Prototyp (Revierzentrale)
- `RevierApp_Prototyp_v4_mobile.html` — **Mobile-Prototyp komplett** mit:
  - Bottom-Nav (Jagd, Revier, Strecke, Profil)
  - Jagd erstellen mit Telefonbuch-Kontakte, Rollen-Tags (👥🐕), Suchfeld
  - Live-Jagd: Karte + Chat + Nachsuche + Strecke (4 Tabs)
  - Jagdleiter-Kommandoleiste (Angeblasen/Abgeblasen, Timer, +15 Min)
  - Strecke: Schnellmeldung-Buttons, Teilnehmer-Filter, 🗑️ Löschen
  - Gast-Beitritt: Link → Name vorausgefüllt → "Dabei!" → sofort in der Jagd
  - Hundeführer-Auftragsliste
- `RevierApp_Nachsuche_Mockup.html` — Foto-Annotation (3 Marker) + Hundeführer Split-View
- `RevierApp_Streckenkarte_Mockup.html` — Teilbare WhatsApp-Karte mit echtem Foto

### Was NICHT funktioniert ❌
- Kein echtes Login (nur UI)
- Keine Formulare funktional (nur Toasts)
- Keine Daten aus Supabase (hardcoded Demo-Daten)
- Karte nicht interaktiv (keine Zeichentools)
- Mobile nicht responsive (alte Codebase)
- Kein Auto-Deploy

---

## Kernentscheidungen aus dem Brainstorming

### Architektur
- Mobile-first, QuickHunt als Kern
- Desktop baut drum herum für Abo-Features
- Alle Größen in `rem` (iPhone-Schriftgröße respektieren, von Tag 1)
- Buttons min. 44x44pt

### Jagd erstellen (wie WhatsApp)
- Telefonbuch als Kontaktliste, Suchfeld oben
- App-Nutzer → sofort hinzugefügt (Push)
- Nicht-App-Nutzer → WhatsApp-Link, kein Account nötig
- "🔄 Wie letztes Mal" als Schnellauswahl
- Jagdgruppen verwalten nur am Desktop

### Rollen (vereinfacht)
- Jagdleiter = wer erstellt (automatisch)
- Schütze = Standard für alle
- 👥 Gruppenleiter + 🐕 Hundeführer = additive Tags, kein eigener Modus
- Rollen erweitern, schränken nicht ein

### Gast-Beitritt (null Hürden)
- Link klicken → Name vorausgefüllt (vom Handy) → "Dabei!" → drin
- Session-Token im Browser, Daten auf Server → App schließen, Link nochmal → alles noch da
- Gast sieht volle Jagd (Karte, Chat, Strecke, Nachsuche)
- Gast kann Meldungen machen (Hochsitz defekt, Beobachtungen)

### GPS & Akku
- Auto-Lock bei Genauigkeit <10m → GPS aus
- 10m-Geofence, nur bei <10m Genauigkeit wird neu gesendet
- Fallback nach 2 Min: beste bisherige Messung
- Drückjagd: Live-Tracking alle 5-10s, nur während Treiben aktiv

### Strecke-Flow (10 Sekunden)
- "🎯 Erlegt!" Button auf Homescreen → Kamera sofort
- App füllt vor (Wildart, Hochsitz, Zeit, Revier) → alles änderbar
- "Die App schlägt vor, der Jäger entscheidet"
- Ein Foto → 5 Ergebnisse: Streckenbuch + Schusstagebuch + Abschussplan + Streckenkarte + WhatsApp-Share

### Push-Signale
- Drückjagd: laut (Override)
- Ansitz: stumm, nur Vibration
- Voreinstellung vom Jagdleiter, individuell überschreibbar
- Timer mit Countdown + "+15"-Button zum Verlängern

### Geschäftsmodell
- Kostenlos: eingeladen werden, mitmachen, alles nutzen
- Abo: sobald man selbst Jagd erstellt (= Jagdleiter)
- Einstieg: 1 kostenlose Jagd + 30 Tage Web-Zugang
- Abo weg = Daten weg
- Abo-Inhalte: Jagden erstellen + komplette Web-Revierzentrale
- Inkl. Wildursprungsmarke (Trichinenprobe-Pflicht automatisch), Wildbretvermarktung, Rechnungen

### Vision Phase 3: Jagdtourismus
- Outfitter-Stufe (~25€/Mo), Reisebüro-Stufe (~50€/Mo)
- Mehrsprachig (Handy-Sprache automatisch)
- Gruppenleiter-Schnellflow: Schütze → Wild → Foto → Wildmarke (4 Tipps)
- Reisebüro-Dashboard: PDF-Paket pro Gast (Streckenkarten, Trophäen, Rechnung)

---

## Priorisierter Plan

### Woche 1–2: Lauffähiger QuickHunt-Kern
1. Auth simpel: Telefonnummer + SMS-Code
2. Jagd erstellen: Name, Revier (optional), Teilnehmer → Supabase
3. Einladungs-Link: /join/[code] → Gast gibt Namen ein → Session-Token
4. Live-Karte: Supabase Realtime → GPS-Positionen auf Leaflet
5. Einfacher Chat: Supabase Realtime → Text + Fotos

### Woche 3–4: Strecke + Nachsuche
6. Schnellmeldung-Buttons → Supabase → Echtzeit-Update
7. Nachsuche-Formular (Wildart, Hochsitz, Flucht, Foto)
8. Nachsuche-Liste: Jagdleiter priorisiert, Hundeführer sieht Aufträge

### Woche 5–6: Polish + Revier
9. Revier verknüpfen → Hochsitze + Grenzen auf Karte
10. Sprachnachrichten (Audio → Supabase Storage)
11. Push-Benachrichtigungen (Einladung, Signale, Nachsuche)
12. Mobile PWA (installierbar)

### Danach: Iteration
- Foto-Annotation Nachsuche
- Timer + Signale
- Revierverwaltung Desktop
- JES, Drückjagd-Planung
- Wildbretvermarktung + Wildursprungsmarke
- Jagdtourismus-Layer

---

## Dokumente im Projekt

| Datei | Rolle |
|-------|-------|
| `RevierApp_QuickHunt_Konzept.md` | **Führendes Dokument** — alle Entscheidungen, 17 Abschnitte |
| `RevierApp_Uebergabe.md` | **Dieses Dokument** — technischer Stand + Plan |
| `RevierApp_Prototyp_v3.html` | Desktop-Referenz |
| `RevierApp_Prototyp_v4_mobile.html` | Mobile-Referenz (QuickHunt komplett) |
| `RevierApp_Nachsuche_Mockup.html` | Vision-Referenz Nachsuche |
| `RevierApp_Streckenkarte_Mockup.html` | Vision-Referenz Share-Flow |
| `RevierApp_FeatureMap.docx/pdf` | Archiv — überholt durch QuickHunt-Konzept |

---

*Erstellt: 01.04.2026 — Moritz Lampe & Claude*

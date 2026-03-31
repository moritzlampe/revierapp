# RevierApp

Digitale Revierverwaltung für Jäger. Desktop-first Webapp (PWA), dann mobile Optimierung.

## Projektkontext

- **Entwickler:** Moritz Lampe & Peter (BioGut Brockwinkel)
- **Pilotrevier:** Brockwinkel bei Reppenstedt (53.264, 10.354)
- **Zielgruppe:** Revierinhaber/Pächter, JES-Inhaber (Begehungsscheininhaber), Drückjagd-Gäste, einmalige Jagdgäste
- **Kernprinzip:** "Zwei Dinge extrem gut: Orientierung im Revier und schnelle Jagddokumentation"
- **Wichtigster Designgrundsatz:** "Viele Features aber extrem einfach in der Handhabung" — nicht genutzte Module dürfen NICHT sichtbar sein

## Tech Stack

- Next.js 14+ (App Router, TypeScript)
- Tailwind CSS + shadcn/ui
- Leaflet (react-leaflet) für Karten mit WMS-Support
- Supabase (PostgreSQL + PostGIS, Auth, Storage)
- Eigener Hetzner-Server (Docker/Coolify), lokal entwickeln mit `next dev`

## Rollenmodell (5 Rollen)

1. **Pächter/Admin** — Voller Zugriff, verwaltet Revier, erstellt JES, organisiert Drückjagden
2. **Mitjäger/JES-Inhaber** — Login mit Jagdschein-Nr, sieht nur eigene Zone (Revierteilkarte), meldet Strecke, sieht eigenes Kontingent
3. **Drückjagd-Gast** — Temporärer RSVP-Zugang, sieht zugewiesenen Stand, kann Notizen/Fotos machen
4. **Einmaliger Jagdgast** — Kein Login, nur WhatsApp-Link mit Karte zum Hochsitz
5. **Nachsuchenführer** — Spezieller Link mit Anschuss-Position, Anfahrt und Details

## Module (MVP)

- **Revierkarte:** Grenzen (GPX/KML Import + Editor), Hochsitze, Kanzeln, Parkplätze, Kirrungen, Salzlecken, Wildkameras, Jagdzonen, Ruhezonen, Wildschadenflächen
- **Gäste-Link:** WhatsApp-Link pro Hochsitz/Revier, kein Login nötig, Navigation
- **Streckenbuch:** Pflichtfelder (Wildart, Geschlecht, Altersklasse, Jäger, Jagdart). OPTIONAL: Foto, GPS, Zeitstempel, Gewicht — Jäger sind misstrauisch mit Daten!
- **JES-Verwaltung:** JES erstellen (inkl. Kurzerlaubnisse 1-3 Tage), Inhaber einladen, Revierteilkarte, Kontingent-Tracking, JES entziehen, PDF mit QR-Code generieren
- **Multi-Revier:** Revier-Switcher in Sidebar

## Module (Phase 2)

- Drückjagd-Planung (Treiben, Stände, Zeitplan, RSVP)
- Gruppeneinladung + RSVP (Zusage, Auto 4x4, Hund, Schießnachweis, Übernachtung)
- Live-GPS bei Drückjagd
- Nachsuchenführer-Link
- Beobachtungen (Wildschaden, auffällige Tiere, Raubwild) mit Heatmap
- PDF-Exports (Strecke, Drückjagdprotokoll)
- Offline-Karten

## Kartenlayer (Niedersachsen)

- OpenStreetMap (Standard)
- Luftbild (Esri World Imagery)
- Flurstücke: `https://opendata.lgln.niedersachsen.de/doorman/noauth/alkis_wms` (ALKIS, kostenlos, CC BY 4.0)
- Orthophotos: `https://opendata.lgln.niedersachsen.de/doorman/noauth/dop_wms` (DOP20, kostenlos)

## Farbschema

- Primary: #2D5016 (Dunkelgrün)
- Secondary: #4A7C2E
- Accent: #6B9F3A
- Sidebar-BG: #1a3409
- Highlight: #E8F0E0

## Sichtbarkeitsregeln JES-Inhaber

JES-Inhaber dürfen NICHT sehen: andere JES-Inhaber, das Gesamtrevier (nur eigene Zone), Strecke anderer Jäger, Beobachtungen anderer, Wildkamera-Standorte. Nur eigene Zone, eigene Strecke, eigenes Kontingent.

## KI-Integration (vorbereitet, nicht aktiv)

Die App wird SPÄTER eine KI-Bilderkennung für die Streckenerfassung bekommen (Foto → Wildart/Geschlecht-Vorschlag). Dafür JETZT schon vorbereiten:

- **Strecke-Formular:** Foto-Upload als eigenständige Komponente mit klarer Schnittstelle (`onPhotoAnalyzed?: (suggestion: { wildart: string, geschlecht: string }) => void`)
- **lib/ai/analyze-photo.ts:** Placeholder-Funktion die später den API-Call macht, jetzt `null` zurückgibt
- **Strecke-Formular:** Wenn `onPhotoAnalyzed` Daten liefert, Felder vorausfüllen mit "KI-Vorschlag" Badge, User kann bestätigen oder überschreiben
- **KEINE Anthropic SDK installieren** — nur die Interfaces und Placeholder vorbereiten

## Referenzdateien

- `RevierApp_FeatureMap.docx` — Vollständige Feature-Spezifikation mit Datenmodell
- `RevierApp_Prototyp_v3.html` — Interaktiver UI-Prototyp (zeigt exaktes Design)
- `RevierApp_Konzeptpapier.docx` — Geschäftskonzept und Marktanalyse

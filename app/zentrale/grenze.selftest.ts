// Gegenprobe fuer die Grenzen-Logik der Revierzentrale. Kein Test-Runner im
// Repo, deshalb ein eigenstaendiges Skript (Muster: src/lib/safe-next.selftest.ts):
//
//   node --experimental-strip-types app/zentrale/grenze.selftest.ts
//
// Laeuft ohne Ausgabe durch, wenn alles stimmt; wirft sonst.
import assert from 'node:assert/strict'
import { nurEinRing, pruefeGrenze, ewktAus, type Punkt } from './grenze.ts'

// --- nurEinRing: Enklaven erkennen, statt sie zu verlieren (E-R4) ---
assert.equal(nurEinRing(null), true, 'keine Grenze = nichts zu verlieren')
assert.equal(nurEinRing([]), true)
assert.equal(nurEinRing([[[53.2, 10.3], [53.3, 10.3], [53.3, 10.4]]]), true)
assert.equal(
  nurEinRing([
    [[53.2, 10.3], [53.3, 10.3], [53.3, 10.4]],
    [[53.25, 10.33], [53.26, 10.33], [53.26, 10.34]], // Enklave
  ]),
  false,
  'mehrringige Grenze darf nicht zum Bearbeiten freigegeben werden',
)

// --- pruefeGrenze: zu wenige Punkte ---
assert.match(pruefeGrenze([])!, /mindestens 3 Punkte/)
assert.match(pruefeGrenze([{ lat: 53.2, lng: 10.3 }])!, /gesetzt sind 1/)
assert.match(pruefeGrenze([{ lat: 53.2, lng: 10.3 }, { lat: 53.3, lng: 10.3 }])!, /gesetzt sind 2/)

// --- pruefeGrenze: saubere Polygone gehen durch ---
const quadrat: Punkt[] = [
  { lat: 53.20, lng: 10.30 },
  { lat: 53.20, lng: 10.40 },
  { lat: 53.30, lng: 10.40 },
  { lat: 53.30, lng: 10.30 },
]
assert.equal(pruefeGrenze(quadrat), null, 'Quadrat ist gueltig')
// Dreieck: Minimalfall, alle Kanten benachbart — darf keinen Fehlalarm geben.
assert.equal(pruefeGrenze(quadrat.slice(0, 3)), null, 'Dreieck ist gueltig')
// Konkav (L-Form) ist gueltig und darf nicht als Ueberschneidung gelten.
assert.equal(
  pruefeGrenze([
    { lat: 53.20, lng: 10.30 },
    { lat: 53.20, lng: 10.40 },
    { lat: 53.25, lng: 10.40 },
    { lat: 53.25, lng: 10.35 },
    { lat: 53.30, lng: 10.35 },
    { lat: 53.30, lng: 10.30 },
  ]),
  null,
  'konkaves Polygon ist gueltig',
)

// --- pruefeGrenze: Selbstueberschneidung faellt auf ---
// Fliege/Schleife: die Diagonalen kreuzen sich.
const fliege: Punkt[] = [
  { lat: 53.20, lng: 10.30 },
  { lat: 53.30, lng: 10.40 },
  { lat: 53.20, lng: 10.40 },
  { lat: 53.30, lng: 10.30 },
]
assert.match(pruefeGrenze(fliege)!, /überschneidet oder berührt sich selbst/)

// Berührung, nicht Durchkreuzung: ein Vertex liegt GENAU auf einer anderen Kante.
// Eine erste Fassung liess das durch (nur strikte Orientierungswechsel geprueft).
// PostGIS nennt so ein Polygon ungueltig und die generierte area_ha rechnet
// Unsinn — 3.718 ha fuer ein ~180-ha-Revier. Von Codex gefunden, 27.07.2026.
assert.match(
  pruefeGrenze([
    { lat: 53.20, lng: 10.30 },
    { lat: 53.20, lng: 10.40 },
    { lat: 53.30, lng: 10.40 },
    { lat: 53.20, lng: 10.35 }, // liegt mitten auf der ersten Kante
    { lat: 53.30, lng: 10.30 },
  ])!,
  /überschneidet oder berührt sich selbst/,
  'Vertex auf einer anderen Kante muss abgelehnt werden',
)

// Kollinear zur GERADEN einer fernen Kante, aber ausserhalb der Strecke: gueltig.
// Das ist der Fall, den ein zu grosszuegiges "<= 0" faelschlich ablehnen wuerde.
assert.equal(
  pruefeGrenze([
    { lat: 53.20, lng: 10.30 },
    { lat: 53.20, lng: 10.34 },
    { lat: 53.24, lng: 10.34 },
    { lat: 53.24, lng: 10.40 }, // auf der Geraden lat=53.24, aber weit rechts
    { lat: 53.28, lng: 10.40 },
    { lat: 53.28, lng: 10.30 },
  ]),
  null,
  'kollinear zur Geraden, aber aussterhalb der Strecke, ist gueltig',
)

// --- ewktAus: Ring schliessen, Reihenfolge lng lat ---
const ewkt = ewktAus(quadrat)
assert.ok(ewkt.startsWith('SRID=4326;POLYGON(('), `Praefix fehlt: ${ewkt}`)
assert.ok(ewkt.endsWith('))'), `Abschluss fehlt: ${ewkt}`)

// Der Ring muss geschlossen sein: 4 Punkte -> 5 Koordinatenpaare.
const paare = ewkt.slice('SRID=4326;POLYGON(('.length, -2).split(', ')
assert.equal(paare.length, 5, 'Ring muss geschlossen sein')
assert.equal(paare[0], paare[4], 'letzter Punkt = erster Punkt')

// Die Swap-Falle aus AGENTS.md: WKT ist "lng lat". Reppenstedt liegt bei
// lng 10.35 / lat 53.26 — "53.26 10.35" waere der Indische Ozean.
assert.equal(ewktAus([{ lat: 53.26, lng: 10.35 }, ...quadrat.slice(1)]).slice(19, 30), '10.35 53.26')

console.log('zentrale/grenze: alle Faelle ok')

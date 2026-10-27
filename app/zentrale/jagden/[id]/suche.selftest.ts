// Gegenprobe für `suche.ts`. Die Fälle sind die aus der App —
// quickhunt-native `src/lib/wild/__tests__/suche.test.ts`, Stand 27.10.2026.
// Wer dort einen Fall ändert, ändert ihn hier mit.
//
//   node --experimental-strip-types app/zentrale/jagden/[id]/suche.selftest.ts
//
// Läuft ohne Ausgabe durch, wenn alles stimmt; wirft sonst.
import assert from 'node:assert/strict'
import { normalisiere, sucheArten, type SuchbareArt } from './suche.ts'

// Ausschnitt aus dem echten Seed (096), wie in der App.
const KATALOG: SuchbareArt[] = [
  { name: 'Überläufer', suchbegriffe: ['sau', 'schwein', 'wildschwein', 'schwarzwild'] },
  { name: 'Keiler', suchbegriffe: ['sau', 'schwein', 'wildschwein', 'schwarzwild', 'basse'] },
  { name: 'Rehbock', suchbegriffe: ['bock', 'reh', 'rehwild'] },
  { name: 'Bockkitz', suchbegriffe: ['kitz', 'bock', 'reh', 'rehwild'] },
  { name: 'Schmalreh', suchbegriffe: ['reh', 'rehwild', 'schmalricke'] },
  { name: 'Ricke', suchbegriffe: ['reh', 'rehwild', 'geiß'] },
  { name: 'Gamsgeiß', suchbegriffe: ['gams', 'gamswild', 'gämse', 'gemse', 'geiß'] },
  { name: 'Sikahirsch', suchbegriffe: ['sika', 'sikawild', 'hirsch'] },
  { name: 'Nutria', suchbegriffe: ['biberratte', 'neozoon'] },
  { name: 'Mäusebussard', suchbegriffe: ['bussard', 'greifvogel'] },
  { name: 'Blässgans', suchbegriffe: ['gans'] },
  { name: 'Rotschmaltier', suchbegriffe: ['schmaltier', 'rotwild'] },
  { name: 'Auerhahn', suchbegriffe: ['auerwild', 'raufußhuhn'] },
]

const namen = (eingabe: string) => sucheArten(KATALOG, eingabe).map((a) => a.name)

// --- normalisiere ---
assert.equal(normalisiere('Überläufer'), 'uberlaufer')
assert.equal(normalisiere('Gamsgeiß'), 'gamsgeiss')
assert.equal(normalisiere('Blässhuhn'), 'blasshuhn')
{
  // 'u' + kombinierendes Trema statt des vorkomponierten 'ü' (iOS-Zwischenablage).
  const dekomponiert = 'U\u0308berla\u0308ufer'
  assert.notEqual(dekomponiert, 'Überläufer')
  assert.equal(normalisiere(dekomponiert), normalisiere('Überläufer'))
}
assert.equal(normalisiere('ueberlaeufer'), normalisiere('Überläufer'))
assert.equal(normalisiere('koeter'), normalisiere('Köter'))
assert.equal(normalisiere('maeusebussard'), normalisiere('Mäusebussard'))
assert.equal(normalisiere('Gams-Geiß'), normalisiere('Gamsgeiß'))
assert.equal(normalisiere('schmal reh'), 'schmal reh')

// --- sucheArten ---
assert.deepEqual(namen('Überläufer'), ['Überläufer'])
assert.deepEqual(namen('uberlaufer'), ['Überläufer'])
assert.deepEqual(namen('ueberlaeufer'), ['Überläufer'])
// „Sau" und „Schwein" stehen in keinem Namen — nur in suchbegriffe.
assert.deepEqual(namen('sau'), ['Überläufer', 'Keiler'])
assert.deepEqual(namen('schwein'), ['Überläufer', 'Keiler'])
assert.deepEqual(namen('geiss'), ['Gamsgeiß', 'Ricke'])
assert.deepEqual(namen('geiß'), ['Gamsgeiß', 'Ricke'])
// Namenstreffer vor Suchbegriffstreffern.
assert.deepEqual(namen('reh'), ['Rehbock', 'Schmalreh', 'Bockkitz', 'Ricke'])
// Unabhängig von der Wortreihenfolge.
assert.deepEqual(namen('reh bock'), namen('bock reh'))
assert.equal(namen('reh bock')[0], 'Rehbock')
assert.deepEqual(namen('schmal reh'), ['Schmalreh'])
assert.deepEqual(namen('reh schmal'), ['Schmalreh'])
assert.deepEqual(namen('reh gams'), [])
assert.deepEqual(namen('maeusebussard'), ['Mäusebussard'])
assert.deepEqual(namen('blaessgans'), ['Blässgans'])
assert.deepEqual(namen('gaemse'), ['Gamsgeiß'])
// Nicht im internen Schlüssel.
assert.deepEqual(namen('schmaltier'), ['Rotschmaltier'])
assert.deepEqual(namen('tier_rot'), [])
assert.deepEqual(namen('Auerhahn'), ['Auerhahn'])
assert.deepEqual(namen('auer'), ['Auerhahn'])
assert.equal(sucheArten(KATALOG, '').length, KATALOG.length)
assert.equal(sucheArten(KATALOG, '   ').length, KATALOG.length)
assert.deepEqual(namen('NUTRIA'), ['Nutria'])
assert.deepEqual(namen('sIkA'), ['Sikahirsch'])
assert.deepEqual(namen('elefant'), [])
for (const eingabe of ['.*', '(', '[a-z', '\\', '+++', '?']) {
  assert.doesNotThrow(() => sucheArten(KATALOG, eingabe))
}
assert.deepEqual(namen('.*'), [])
{
  const eigen: SuchbareArt[] = [{ name: 'Nachbars Köter', suchbegriffe: [] }]
  for (const eingabe of ['koter', 'koeter', 'Köter']) {
    assert.deepEqual(
      sucheArten(eigen, eingabe).map((a) => a.name),
      ['Nachbars Köter'],
    )
  }
}

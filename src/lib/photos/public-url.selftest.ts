// Gegenprobe fuer splitPublicUrl. Dieses Repo hat keinen Test-Runner,
// deshalb ein eigenstaendiges Skript statt eines Frameworks:
//
//   node --experimental-strip-types src/lib/photos/public-url.selftest.ts
//
// Laeuft ohne Ausgabe durch, wenn alles stimmt; wirft sonst.
//
// signStorageUrl selbst ist hier nicht geprueft — es braucht einen echten
// Supabase-Client. Geprueft ist der Teil, der schiefgehen KANN: die Zerlegung.
import assert from 'node:assert/strict'
import { splitPublicUrl } from './public-url.ts'

const BASIS = 'https://bzfevyqfkizmovoclysy.supabase.co/storage/v1/object/public'

// --- die drei echten Bauformen aus der Produktions-DB (01.08.2026) ---
assert.deepEqual(
  splitPublicUrl(`${BASIS}/app-photos/7e88910e-1ca8-4868-9313-6c5207406d23/map_object/c4c6f292-9261-4b25-8e8a-a6a1416a6c1b/abc.jpg`),
  { bucket: 'app-photos', path: '7e88910e-1ca8-4868-9313-6c5207406d23/map_object/c4c6f292-9261-4b25-8e8a-a6a1416a6c1b/abc.jpg' },
)
assert.deepEqual(
  splitPublicUrl(`${BASIS}/chat-photos/72b3947a-51e4-4666-8402-fc119a491aa3/2ee3c141-2d49-42dc-86d1-b4daaf1a3cc4.jpg`),
  { bucket: 'chat-photos', path: '72b3947a-51e4-4666-8402-fc119a491aa3/2ee3c141-2d49-42dc-86d1-b4daaf1a3cc4.jpg' },
)
assert.deepEqual(
  splitPublicUrl(`${BASIS}/group-avatars/04c1dbb0-c114-4603-91d6-2e7098f52c2e/8ffe383d.jpg`),
  { bucket: 'group-avatars', path: '04c1dbb0-c114-4603-91d6-2e7098f52c2e/8ffe383d.jpg' },
)

// --- Query-Anhaengsel gehoert nicht zum Pfad ---
assert.deepEqual(
  splitPublicUrl(`${BASIS}/app-photos/uid/kill/id/a.jpg?width=400`),
  { bucket: 'app-photos', path: 'uid/kill/id/a.jpg' },
)

// --- kodierte Zeichen zurueckdrehen: createSignedUrl will den rohen Pfad ---
assert.deepEqual(
  splitPublicUrl(`${BASIS}/app-photos/uid/hunt/id/mein%20foto.jpg`),
  { bucket: 'app-photos', path: 'uid/hunt/id/mein foto.jpg' },
)

// --- durchreichen, nicht zerlegen: nichts davon ist eine Public-URL ---
// Diese Unsplash-Zeile liegt echt in hunt_photos — sie darf nie signiert werden.
assert.equal(splitPublicUrl('https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=1600'), null)
assert.equal(splitPublicUrl(null), null)
assert.equal(splitPublicUrl(undefined), null)
assert.equal(splitPublicUrl(''), null)
assert.equal(splitPublicUrl('blob:http://localhost:3000/abc-def'), null)
// bereits signiert: der Weg heisst /object/sign/, nicht /object/public/
assert.equal(splitPublicUrl(`https://x.supabase.co/storage/v1/object/sign/app-photos/uid/a.jpg?token=y`), null)
// Transform-URL: heisst /render/image/public/ und wird bewusst NICHT zerlegt.
// Steht hier, damit der Fall benannt ist — s. den Hinweis in public-url.ts.
assert.equal(splitPublicUrl(`https://x.supabase.co/storage/v1/render/image/public/app-photos/uid/a.jpg?width=400`), null)

// --- kaputte Formen duerfen null liefern, nicht raten ---
assert.equal(splitPublicUrl(`${BASIS}/app-photos`), null)      // Bucket ohne Pfad
assert.equal(splitPublicUrl(`${BASIS}/app-photos/`), null)     // Pfad leer
assert.equal(splitPublicUrl(`${BASIS}//uid/a.jpg`), null)      // Bucket leer

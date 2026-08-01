/**
 * Zerlegung gespeicherter Supabase-Public-URLs. Bewusst ohne jeden Import,
 * damit der Selbsttest daneben mit `node --experimental-strip-types` laeuft.
 *
 * Das Signieren steht in `signed-url.ts` — es braucht einen Client.
 */

const MARKER = '/storage/v1/object/public/'

/**
 * Zerlegt eine gespeicherte Public-URL in Bucket und bucket-relativen Pfad.
 * Gibt `null` fuer alles, was nicht auf diesen Weg zeigt — externe Bilder
 * (es liegt eine Unsplash-URL in `hunt_photos`), Blob-URLs aus einer frischen
 * Auswahl, leere Strings, bereits signierte URLs (`/object/sign/`).
 */
export function splitPublicUrl(
  url: string | null | undefined,
): { bucket: string; path: string } | null {
  if (!url) return null
  const i = url.indexOf(MARKER)
  if (i === -1) return null

  // Query-Anhaengsel (Transform-Optionen, Cache-Buster) gehoeren nicht zum Pfad.
  const rest = url.slice(i + MARKER.length).split('?')[0]
  const slash = rest.indexOf('/')
  if (slash <= 0) return null

  const bucket = rest.slice(0, slash)
  const roh = rest.slice(slash + 1)
  if (!roh) return null

  // getPublicUrl kodiert den Pfad; createSignedUrl erwartet ihn roh.
  let path: string
  try {
    path = decodeURIComponent(roh)
  } catch {
    path = roh
  }
  return { bucket, path }
}

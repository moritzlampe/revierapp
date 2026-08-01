import { createClient } from '@/lib/supabase/client'
import { splitPublicUrl } from './public-url'

/**
 * Signierte Storage-URLs.
 *
 * Hintergrund: die drei Buckets werden auf `public: false` gestellt (A-S6).
 * Der Weg `/storage/v1/object/public/<bucket>/<pfad>` fragt KEINE Policy — wer
 * einen Pfad kennt, kommt unangemeldet an die Datei. Danach ist jede in der
 * Datenbank gespeicherte oeffentliche URL tot.
 *
 * Der Umbau geht bewusst NICHT ueber neue Pfad-Spalten: die gespeicherte URL
 * traegt den Pfad bereits (alles hinter `/object/public/<bucket>/`), und die
 * Ableitung ist mechanisch — nachgemessen am 01.08.2026 gegen alle 206
 * belegten Zeilen, 0 Ausnahmen. Die Spalten bleiben also, was sie sind; nur
 * beim Anzeigen wird frisch signiert.
 *
 * Was NICHT hier haengt: `getPublicUrl` beim Hochladen bleibt stehen. Die
 * dabei entstehende URL ist nach dem Umschalten nicht mehr direkt abrufbar,
 * aber sie ist weiterhin der kanonische Traeger des Pfades — und ein String,
 * der nie ablaeuft. Eine signierte URL in einer Spalte waere schlimmer als
 * gar keine.
 */

/** Gueltigkeit einer signierten URL. */
const TTL_SEKUNDEN = 3600

/** Wird eine gecachte URL innerhalb dieser Spanne fallig, signieren wir neu. */
const PUFFER_MS = 5 * 60 * 1000

// ponytail: Prozess-weiter Cache ohne Groessengrenze. Der Schluessel ist die
// gespeicherte URL, es gibt 206 davon — eine LRU lohnt erst, wenn Fotos in
// die Tausende gehen.
const cache = new Map<string, { signiert: string; gueltig_bis: number }>()

/**
 * Signiert eine gespeicherte Public-URL fuer die Anzeige.
 *
 * Faellt bewusst auf die Eingabe zurueck, wenn nichts zu signieren ist oder das
 * Signieren scheitert: solange die Buckets public sind, aendert sich damit gar
 * nichts, und danach ist ein sichtbar kaputtes Bild ehrlicher als ein stilles
 * Nichts. Das Signieren scheitert genau dann, wenn die SELECT-Policy aus
 * Migration 083 den Treffer nicht durchlaesst — die Berechtigung sitzt also
 * weiter in der Datenbank, nicht hier.
 */
export async function signStorageUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null

  const teile = splitPublicUrl(url)
  if (!teile) return url

  const treffer = cache.get(url)
  if (treffer && treffer.gueltig_bis > Date.now() + PUFFER_MS) return treffer.signiert

  const { data, error } = await createClient()
    .storage.from(teile.bucket)
    .createSignedUrl(teile.path, TTL_SEKUNDEN)

  if (error || !data?.signedUrl) {
    console.warn('[signStorageUrl] signieren fehlgeschlagen', teile.path, error?.message)
    return url
  }

  cache.set(url, { signiert: data.signedUrl, gueltig_bis: Date.now() + TTL_SEKUNDEN * 1000 })
  return data.signedUrl
}

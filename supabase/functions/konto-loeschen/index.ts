// konto-loeschen — Konto löschen aus der App (CN-236).
//
// Bauplan: quickhunt-native/docs/konzepte/QuickHunt_Bauplan_Konto_Loeschen_V1.md
// Datenbankteil: revierapp/supabase/migrations/132_konto_loeschen.sql
//
// ABLAUF (Bauplan §2), Reihenfolge DB → Storage → Auth, fortsetzbar:
//   a. auth.getUser(jwt) → uid                 die tragende Prüfung
//   b. rpc konto_loeschen(uid, fotos_behalten)  eine Transaktion; Abbruch
//                                              mit Klartext ODER Dateiliste
//   c. Storage entfernen und zählen            weicht die Zahl ab → Abbruch
//                                              VOR d
//   d. auth.admin.deleteUser(uid, true)        Soft-Delete (GoTrue)
//   e. rpc konto_loeschung_abschliessen(uid)   Status „abgeschlossen"
//   f. 200 { geloescht: true }
// Mit { pruefen: true } läuft nur die Vorbedingung (V1/V2), ohne etwas zu
// ändern — die App fragt das VOR dem Passwort (E3).
//
// ⚠ `verify_jwt = true` lässt auch den nackten Anon-Key durch (er ist ein
// gültig signiertes JWT). Tragend ist allein `auth.getUser(jwt)`: ohne
// echten Nutzer gibt es keine uid und damit keinen RPC-Aufruf (SL Punkt 6).
//
// ⚠ Deploy nur unter Anker 2 (CLAUDE.md, Edge-Function-Zusatz, 26.09.2026),
// und erst NACH Migration 132 — sonst ruft die Function RPCs, die es nicht
// gibt.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Obergrenze je Storage-Löschaufruf (Storage-API). */
const STORAGE_BATCH = 1000

function antwort(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * `sub` aus dem JWT, OHNE eigene Signaturprüfung — die hat das Gateway
 * gemacht (verify_jwt = true). Gebraucht nur im Wiederholungsfall nach dem
 * Soft-Delete, in dem `auth.getUser` scheitert, weil das Konto schon weg ist.
 * Selbst ein gefälschter `sub` könnte dort nur ein bereits gelöschtes Konto
 * als gelöscht melden: `konto_loeschung_abschliessen` prüft
 * `auth.users.deleted_at`.
 */
function subAusJwt(jwt: string): string | null {
  try {
    const teil = jwt.split('.')[1]
    if (!teil) return null
    const json = atob(teil.replace(/-/g, '+').replace(/_/g, '/'))
    const sub = JSON.parse(json)?.sub
    return typeof sub === 'string' && UUID.test(sub) ? sub : null
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  let body: { pruefen?: unknown; fotos_behalten?: unknown }
  try {
    body = await req.json()
  } catch {
    return antwort(400, { fehler: 'Anfrage ohne gültiges JSON' })
  }
  const pruefen = body?.pruefen === true
  // Nur ein echtes `true` behält Fotos. Alles andere — fehlt, "true", 1 —
  // ist die Voreinstellung „aus" (M6).
  const fotosBehalten = body?.fotos_behalten === true

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  // a. Wer ruft?
  const { data: nutzer, error: nutzerFehler } = await admin.auth.getUser(jwt)
  // Eine Störung bei GoTrue ist kein „nicht angemeldet" (Schlusslesung 132,
  // F4) — sonst läse ein Client das als Sitzungsende. Nur eine echte
  // Ablehnung (4xx außer 429) führt in den Wiederholungsweg; Netzfehler
  // (status 0), Proxy-Seiten (ohne status) und 5xx nicht (Delta-SL, F-B).
  const s = nutzerFehler?.status
  const abgelehnt = typeof s === 'number' && s >= 400 && s < 500 && s !== 429
  if (nutzerFehler && !abgelehnt) {
    console.error('konto-loeschen: getUser', nutzerFehler.status, nutzerFehler.message)
    return antwort(500, { fehler: 'Anmeldedienst gestört' })
  }
  if (nutzerFehler || !nutzer?.user) {
    // Wiederholungsfall (Bauplan §2): die Antwort auf einen erfolgreichen
    // Lauf ging verloren, das Konto ist schon soft-gelöscht.
    const sub = pruefen ? null : subAusJwt(jwt)
    if (sub) {
      const { data: fertig, error } = await admin.rpc('konto_loeschung_abschliessen', {
        p_uid: sub,
      })
      // Ein vorübergehender Fehler ist KEIN „nicht angemeldet" — sonst gäbe
      // der Client nach dem Soft-Delete auf, statt es noch einmal zu
      // versuchen (Fremdprüfung 132, F9).
      if (error) {
        console.error('konto-loeschen: abschliessen (Wiederholung)', sub, error.message)
        return antwort(500, { fehler: 'Abschluss fehlgeschlagen' })
      }
      if (fertig === true) {
        return antwort(200, { geloescht: true })
      }
    }
    return antwort(401, { fehler: 'nicht angemeldet' })
  }
  const uid = nutzer.user.id

  if (pruefen) {
    const { data, error } = await admin.rpc('konto_loeschung_pruefen', { p_uid: uid })
    if (error) {
      console.error('konto-loeschen: pruefen', uid, error.code, error.message)
      return antwort(500, { fehler: 'Prüfung fehlgeschlagen' })
    }
    return antwort(200, { pruefung: data })
  }

  // b. Datenbank
  const { data: liste, error: dbFehler } = await admin.rpc('konto_loeschen', {
    p_uid: uid,
    p_fotos_behalten: fotosBehalten,
  })
  if (dbFehler) {
    if (dbFehler.code === 'P0001' && dbFehler.details) {
      try {
        return antwort(409, { pruefung: JSON.parse(dbFehler.details) })
      } catch {
        // fällt durch auf den allgemeinen Fehler
      }
    }
    console.error('konto-loeschen: db', uid, dbFehler.code, dbFehler.message)
    return antwort(500, { fehler: 'Löschen in der Datenbank fehlgeschlagen' })
  }

  // c. Storage — gezählt, weil ein stilles Weniger sonst Dateien stehen ließe,
  // deren Zeilen schon weg sind.
  const dateien = (liste?.dateien ?? []) as { bucket: string; name: string }[]

  const jeBucket = new Map<string, string[]>()
  for (const d of dateien) {
    jeBucket.set(d.bucket, [...(jeBucket.get(d.bucket) ?? []), d.name])
  }

  let entfernt = 0
  for (const [bucket, namen] of jeBucket) {
    for (let i = 0; i < namen.length; i += STORAGE_BATCH) {
      const { data, error } = await admin.storage
        .from(bucket)
        .remove(namen.slice(i, i + STORAGE_BATCH))
      if (error) {
        console.error('konto-loeschen: storage', uid, bucket, error.message)
        return antwort(500, { fehler: 'Löschen der Dateien fehlgeschlagen' })
      }
      entfernt += data?.length ?? 0
    }
  }
  if (entfernt !== dateien.length) {
    // Ein Wiederholungsaufruf findet die schon entfernten Dateien nicht mehr
    // in storage.objects und zählt dann richtig.
    console.error('konto-loeschen: storage-zahl', uid, dateien.length, entfernt)
    return antwort(500, { fehler: 'Nicht alle Dateien entfernt' })
  }

  // d. Anmeldung unbrauchbar machen (Soft-Delete, gemessen Bauplan §1.3).
  const { error: authFehler } = await admin.auth.admin.deleteUser(uid, true)
  if (authFehler) {
    console.error('konto-loeschen: auth', uid, authFehler.message)
    return antwort(500, { fehler: 'Löschen der Anmeldung fehlgeschlagen' })
  }

  // e. Status. Scheitert nur dieser Schritt, holt ihn der Wiederholungsfall
  // oben nach (getUser scheitert dann, `sub` führt hierher zurück).
  const { data: fertig, error: abschlussFehler } = await admin.rpc(
    'konto_loeschung_abschliessen',
    { p_uid: uid },
  )
  if (abschlussFehler || fertig !== true) {
    console.error('konto-loeschen: abschliessen', uid, abschlussFehler?.message)
    return antwort(500, { fehler: 'Abschluss fehlgeschlagen' })
  }

  return antwort(200, { geloescht: true })
})

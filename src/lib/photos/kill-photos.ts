import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/database.types'
import { uploadPhoto } from './upload'
import { insertHuntPhoto } from './hunt-photos'

// Generierter Row-Typ (taken_at/created_at nullable) — deckungsgleich mit
// ErlegungDetail.photos aus detail-types, damit der Editor-State ohne Cast passt.
type HuntPhoto = Database['public']['Tables']['hunt_photos']['Row']

/**
 * Foto an eine Erlegung (kill) anhängen — Tagebuch-Erlegungs-Detail.
 *
 * Nutzt exakt das bestehende hunt_photos.kill_ids[]-Pattern (kein neues
 * Foto-Pattern): Upload in den app-photos-Bucket unter entityType 'kill',
 * danach eine hunt_photos-Row mit kill_ids = [killId].
 *
 * huntId ist Pflicht — hunt_photos.hunt_id ist NOT NULL. Der Caller rendert
 * den Add-Pfad nur, wenn kill.hunt_id gesetzt ist (Recon E4).
 *
 * Gibt die neue Foto-Row (id, url, storage_path, …) zurück, damit der Caller
 * sie sofort optimistisch in den lokalen State übernehmen kann.
 */
export async function addKillPhoto(args: {
  killId: string
  huntId: string
  file: File
  userId: string
}): Promise<HuntPhoto> {
  const { killId, huntId, file, userId } = args

  const { url, path } = await uploadPhoto({
    file,
    userId,
    entityType: 'kill',
    entityId: killId,
  })

  return insertHuntPhoto({
    huntId,
    killIds: [killId],
    storagePath: path,
    url,
    uploadedBy: userId,
  })
}

/**
 * Foto von einer Erlegung entfernen — geteilte Fotos respektieren (Recon E5).
 *
 * Ein hunt_photos-Eintrag kann mehreren Kills zugeordnet sein (kill_ids[] ist
 * ein Array, z.B. ein Gruppen-Foto mehrerer Stücke aus dem Strecke-Flow).
 * Darum:
 *   - killId aus kill_ids[] entfernen
 *   - bleibt das Array LEER → Row löschen + Storage-Objekt best-effort löschen
 *     (non-fatal; DB ist Source of Truth — Pattern aus PhotoSheet)
 *   - bleiben andere kill_ids drin → nur das Array aktualisieren, Row +
 *     Storage BLEIBEN (sonst verlöre der andere Kill sein Foto)
 *
 * Die Storage-Löschung ist bewusst best-effort: ein verwaistes Objekt ist
 * unkritisch, eine fehlende DB-Zeile wäre es nicht.
 */
export async function removeKillPhoto(args: {
  photo: HuntPhoto
  killId: string
}): Promise<void> {
  const { photo, killId } = args
  const supabase = createClient()

  const remaining = (photo.kill_ids ?? []).filter((id) => id !== killId)

  if (remaining.length === 0) {
    // Kein anderer Kill referenziert dieses Foto → ganze Row entfernen.
    const { error: dbError } = await supabase
      .from('hunt_photos')
      .delete()
      .eq('id', photo.id)
    if (dbError) {
      throw new Error(`Foto entfernen fehlgeschlagen: ${dbError.message}`)
    }

    // Storage best-effort — Fehler nur loggen, nicht werfen.
    const { error: storageError } = await supabase.storage
      .from('app-photos')
      .remove([photo.storage_path])
    if (storageError) {
      console.warn('[removeKillPhoto] storage remove failed', storageError.message)
    }
    return
  }

  // Andere Kills referenzieren das Foto noch → nur die Zuordnung lösen.
  // .select() erzwingt, dass wir die betroffene Row zurückbekommen; bleibt
  // sie leer (z.B. RLS verweigert das UPDATE), werfen wir statt still zu
  // scheitern — der andere Kill darf sein Foto nicht unbemerkt behalten/​verlieren.
  const { data, error: updateError } = await supabase
    .from('hunt_photos')
    .update({ kill_ids: remaining })
    .eq('id', photo.id)
    .select('id')

  if (updateError) {
    throw new Error(`Foto-Zuordnung aktualisieren fehlgeschlagen: ${updateError.message}`)
  }
  if (!data || data.length === 0) {
    throw new Error('Foto-Zuordnung konnte nicht aktualisiert werden.')
  }
}

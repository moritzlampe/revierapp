import type { HuntPhoto } from '@/lib/types/hunt-photo'

/**
 * Fotos die zu einem Batch gehören.
 *
 * Ein Foto gehört zu einem Batch, wenn mindestens eine seiner
 * kill_ids in den Kill-IDs des Batches enthalten ist.
 *
 * Edge Case: Foto mit kill_ids = [killA, killB], wobei killA in
 * Batch1 und killB in Batch2 liegt — Foto erscheint unter beiden.
 * Das ist akzeptiert und konsistent mit "dieses Foto zeigt diesen
 * Kill". Batches splitten nur wenn Tap-Abstand > 2s, Edge ist
 * praktisch selten.
 */
export function getPhotosForBatch(
  batchKillIds: ReadonlyArray<string>,
  photos: ReadonlyArray<HuntPhoto>,
): HuntPhoto[] {
  const killIdSet = new Set(batchKillIds)
  return photos.filter(p => {
    if (!p.kill_ids || p.kill_ids.length === 0) return false
    return p.kill_ids.some(kid => killIdSet.has(kid))
  })
}

/**
 * "Stimmung"-Fotos — kein Kill-Bezug.
 * Deckt kill_ids = null UND kill_ids = [] ab.
 */
export function getMoodPhotos(
  photos: ReadonlyArray<HuntPhoto>,
): HuntPhoto[] {
  return photos.filter(p => !p.kill_ids || p.kill_ids.length === 0)
}

/**
 * "Hat dieser Kill mindestens ein Foto?" — für Thumb-Indicator.
 * Verwendung: in useMemo ein Set<string> pre-computen für O(1)-Lookup.
 */
export function killHasPhoto(
  killId: string,
  photos: ReadonlyArray<HuntPhoto>,
): boolean {
  return photos.some(p => p.kill_ids?.includes(killId))
}

/**
 * Defensive Bereinigung: Entfernt kill_ids die auf nicht-existierende
 * Kills zeigen (z.B. nach Kill-Delete).
 *
 * Wenn nach Bereinigung keine IDs mehr übrig sind, wird kill_ids auf
 * null gesetzt — Foto landet dann in "Stimmung & Strecke" statt stumm
 * zu verschwinden.
 */
export function cleanDanglingKillIds(
  photo: HuntPhoto,
  existingKillIds: ReadonlySet<string>,
): HuntPhoto {
  if (!photo.kill_ids || photo.kill_ids.length === 0) return photo
  const cleaned = photo.kill_ids.filter(kid => existingKillIds.has(kid))
  if (cleaned.length === photo.kill_ids.length) return photo
  return { ...photo, kill_ids: cleaned.length > 0 ? cleaned : null }
}

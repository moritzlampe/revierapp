import { uploadPhoto } from './upload'
import { insertHuntPhoto } from './hunt-photos'

export interface UploadPendingPhotosArgs {
  huntId: string
  killIds: string[]
  photos: File[]
  userId: string
  onProgress?: (current: number, total: number) => void
  onItemError?: (index: number, total: number, err: unknown) => void
}

export interface UploadPendingPhotosResult {
  uploaded: number
  failed: number
}

// Sequentieller Upload-Loop mit Per-Foto-Try/Catch.
// Ein einzelner Fehler bricht den Loop nicht ab — verlorene Fotos werden
// nur gezählt. Semantik muss mit dem bisherigen Inline-Loop in
// WildartPicker.handleConfirmBatch übereinstimmen.
export async function uploadPendingPhotosForHunt(
  args: UploadPendingPhotosArgs,
): Promise<UploadPendingPhotosResult> {
  const { huntId, killIds, photos, userId, onProgress, onItemError } = args
  let uploaded = 0
  let failed = 0

  for (let i = 0; i < photos.length; i++) {
    onProgress?.(i + 1, photos.length)
    try {
      const { url, path } = await uploadPhoto({
        file: photos[i],
        userId,
        entityType: 'hunt',
        entityId: huntId,
      })
      await insertHuntPhoto({
        huntId,
        killIds,
        storagePath: path,
        url,
        uploadedBy: userId,
      })
      uploaded++
    } catch (err) {
      failed++
      console.error(`[uploadPendingPhotosForHunt] photo ${i + 1}/${photos.length} failed`, err)
      onItemError?.(i, photos.length, err)
    }
  }

  return { uploaded, failed }
}

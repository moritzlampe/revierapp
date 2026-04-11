import { createClient } from '@/lib/supabase/client'

export interface UploadPhotoArgs {
  file: File
  userId: string
  entityType: string       // z.B. 'map_object', 'message', 'group_avatar', 'kill'
  entityId: string         // z.B. die Objekt-UUID
  oldPath?: string         // optional: alter Pfad zum Loeschen vor Neu-Upload (Replace-Fall)
}

export interface UploadPhotoResult {
  url: string              // public URL fuer DB-Speicherung
  path: string             // bucket-relativer Pfad fuer spaetere Loesch-Operationen
}

export async function uploadPhoto(args: UploadPhotoArgs): Promise<UploadPhotoResult> {
  const { file, userId, entityType, entityId, oldPath } = args
  const supabase = createClient()

  // Falls Replace: altes Bild loeschen (Fehler nur loggen, nicht throwen)
  if (oldPath) {
    const { error: removeError } = await supabase.storage
      .from('app-photos')
      .remove([oldPath])
    if (removeError) {
      console.warn('Altes Bild loeschen fehlgeschlagen (ignoriert):', removeError.message)
    }
  }

  // Neuen Pfad bauen
  const path = `${userId}/${entityType}/${entityId}/${crypto.randomUUID()}.jpg`

  // Upload
  const { error: uploadError } = await supabase.storage
    .from('app-photos')
    .upload(path, file, {
      contentType: 'image/jpeg',
      cacheControl: '3600',
    })

  if (uploadError) {
    throw new Error(`Upload fehlgeschlagen: ${uploadError.message}`)
  }

  // Public URL holen
  const { data: { publicUrl } } = supabase.storage
    .from('app-photos')
    .getPublicUrl(path)

  return { url: publicUrl, path }
}

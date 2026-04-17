import { createClient } from '@/lib/supabase/client'
import type { HuntPhoto } from '@/lib/types/hunt-photo'
import { deletePhoto } from './delete'

export async function listHuntPhotos(huntId: string): Promise<HuntPhoto[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('hunt_photos')
    .select('*')
    .eq('hunt_id', huntId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Hunt-Fotos laden fehlgeschlagen: ${error.message}`)

  return (data ?? []) as HuntPhoto[]
}

export interface InsertHuntPhotoArgs {
  huntId: string
  killIds: string[] | null
  storagePath: string
  url: string
  uploadedBy: string
}

export async function insertHuntPhoto(args: InsertHuntPhotoArgs): Promise<HuntPhoto> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('hunt_photos')
    .insert({
      hunt_id: args.huntId,
      kill_ids: args.killIds,
      storage_path: args.storagePath,
      url: args.url,
      uploaded_by: args.uploadedBy,
    })
    .select('*')
    .single()

  if (error) throw new Error(`Hunt-Foto speichern fehlgeschlagen: ${error.message}`)

  return data as HuntPhoto
}

export async function deleteHuntPhoto(photoId: string, storagePath: string): Promise<void> {
  const supabase = createClient()

  const { error: dbError } = await supabase
    .from('hunt_photos')
    .delete()
    .eq('id', photoId)

  if (dbError) throw new Error(`Hunt-Foto löschen fehlgeschlagen: ${dbError.message}`)

  await deletePhoto(storagePath)
}

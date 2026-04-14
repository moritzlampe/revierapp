import { createClient } from '@/lib/supabase/client'
import type { MapObjectPhoto } from '@/lib/types/revier'

export async function listMapObjectPhotos(
  mapObjectId: string
): Promise<MapObjectPhoto[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('map_object_photos')
    .select('*')
    .eq('map_object_id', mapObjectId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Fotos laden fehlgeschlagen: ${error.message}`)

  return (data ?? []) as MapObjectPhoto[]
}

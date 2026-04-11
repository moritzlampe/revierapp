import { createClient } from '@/lib/supabase/client'

export async function deletePhoto(path: string): Promise<void> {
  const supabase = createClient()

  const { error } = await supabase.storage
    .from('app-photos')
    .remove([path])

  if (error) {
    throw new Error(`Bild loeschen fehlgeschlagen: ${error.message}`)
  }
}

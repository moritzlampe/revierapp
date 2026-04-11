import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import RevierContent from './revier-content'

export default async function RevierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Revier laden
  const { data: district } = await supabase
    .from('districts')
    .select('id, name, owner_id, boundary, area_ha, bundesland')
    .eq('id', id)
    .single()

  if (!district || district.owner_id !== user.id) redirect('/app/du')

  // Bestehende Revier-Objekte laden
  const { data: objects } = await supabase
    .from('map_objects')
    .select('id, district_id, type, name, position, description, photo_url, created_by, created_at')
    .eq('district_id', id)

  return (
    <RevierContent
      district={district}
      objects={objects || []}
      userId={user.id}
    />
  )
}

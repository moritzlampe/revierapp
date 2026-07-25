import type { Viewport } from 'next'
import { createClient } from '@/lib/supabase/server'
import Seitenleiste, { type RevierEintrag } from './seitenleiste'
import './zentrale.css'

// ACHTUNG: Next merged Viewports FELDWEISE mit dem Root-Layout. Felder einfach
// wegzulassen genügt nicht — die Handy-Werte aus app/layout.tsx blieben sonst
// erhalten, inklusive user-scalable=no. Jedes zu neutralisierende Feld muss
// deshalb hier explizit gesetzt werden.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5, // überschreibt maximumScale:1 → Browser-Zoom bleibt möglich
  userScalable: true, // überschreibt userScalable:false
  viewportFit: 'auto', // überschreibt 'cover' (Notch-Logik ist Handy-Sache)
  interactiveWidget: 'resizes-visual', // überschreibt 'resizes-content'
  themeColor: '#EDE8DA',
}

export default async function ZentraleLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // `hidden` ist der Ausblenden-Schalter aus dem Du-Tab. Moritz hat die sechs
  // Testreviere dort bereits ausgeblendet — damit ist der Wechsler ohne eigene
  // Aufräumlogik brauchbar (Konzept §4.4).
  const { data: reviere, error } = user
    ? await supabase
        .from('districts')
        .select('id, name')
        .eq('owner_id', user.id)
        .eq('hidden', false)
        .order('name')
    : { data: [], error: null }

  // Nicht auf einen leeren Wechsler zurückfallen: ein stiller Fehler sähe aus
  // wie „keine Reviere" und stünde dann neben einer Seite, die welche zeigt.
  if (error) throw new Error(`Reviere konnten nicht geladen werden: ${error.message}`)

  return (
    <div className="zentrale">
      <Seitenleiste reviere={(reviere ?? []) as RevierEintrag[]} />
      <main className="zentrale-main">{children}</main>
    </div>
  )
}

'use client'

import dynamic from 'next/dynamic'
import type { KarteProps } from './revierkarte-map'

// react-leaflet fasst beim Import `window` an — ssr:false ist Pflicht, und
// next/dynamic mit ssr:false geht nur aus einer Client-Komponente heraus.
// Deshalb dieser dünne Mantel zwischen Server-Seite und Karte.
const Karte = dynamic(() => import('./revierkarte-map'), {
  ssr: false,
  loading: () => <div className="zentrale-karte-lade">Karte lädt …</div>,
})

export default function Revierkarte(props: KarteProps) {
  return <Karte {...props} />
}

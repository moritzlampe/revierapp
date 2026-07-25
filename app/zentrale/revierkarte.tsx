'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import type { KarteProps } from './revierkarte-map'

// react-leaflet fasst beim Import `window` an — ssr:false ist Pflicht, und
// next/dynamic mit ssr:false geht nur aus einer Client-Komponente heraus.
// Deshalb dieser dünne Mantel zwischen Server-Seite und Karte.
const Karte = dynamic(() => import('./revierkarte-map'), {
  ssr: false,
  loading: () => <div className="zentrale-karte-lade">Karte lädt …</div>,
})

/**
 * Vollbild über die native Fullscreen-API statt über einen selbstgebauten
 * „Kinomodus": ESC zum Verlassen, Zustandsverwaltung und Bildschirmgröße macht
 * der Browser. Leaflet misst sich danach von allein neu — das erledigt
 * useInvalidateOnResize in der Karte über das resize-Ereignis.
 */
export default function Revierkarte(props: KarteProps) {
  const kasten = useRef<HTMLDivElement>(null)
  const [voll, setVoll] = useState(false)

  // Nur abonnieren, nicht ableiten: der Zustand kommt aus dem Browser, auch
  // wenn ESC das Vollbild verlässt, ohne dass der Knopf beteiligt war.
  useEffect(() => {
    const wechsel = () => setVoll(document.fullscreenElement === kasten.current)
    document.addEventListener('fullscreenchange', wechsel)
    return () => document.removeEventListener('fullscreenchange', wechsel)
  }, [])

  const umschalten = () => {
    if (voll) {
      document.exitFullscreen().catch(() => {})
    } else {
      // Kann vom Browser abgelehnt werden (Berechtigung, iframe) — dann bleibt
      // es beim eingebetteten Kasten, ohne unbehandelte Rejection.
      kasten.current?.requestFullscreen().catch(() => {})
    }
  }

  return (
    <div ref={kasten} className="zentrale-karte-kasten">
      <button type="button" className="zentrale-karte-voll" onClick={umschalten}>
        {voll ? 'Vollbild beenden' : 'Vollbild'}
      </button>
      <Karte {...props} />
    </div>
  )
}

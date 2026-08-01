'use client'

import { useEffect, useState } from 'react'
import { signStorageUrl } from '@/lib/photos/signed-url'

type Props = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string | null | undefined
}

/**
 * Ein `<img>`, das gespeicherte Supabase-URLs vor dem Anzeigen signiert.
 *
 * Ueberall dort einzusetzen, wo eine URL aus der Datenbank kommt — sonst bricht
 * das Bild, sobald die Buckets auf `public: false` stehen (A-S6). Alle anderen
 * Quellen (externe Bilder, `blob:`-Vorschauen aus einer frischen Dateiauswahl,
 * Data-URIs) reicht `signStorageUrl` unveraendert durch; die Komponente ist
 * damit auch dort unschaedlich, wo beides vorkommen kann.
 *
 * Waehrend des Signierens wird nichts gerendert. Das ist Absicht: ein `<img>`
 * ohne `src` feuert weder `onLoad` noch `onError`, und Aufrufer wie
 * PhotoThumbnail zeigen so ihren eigenen Platzhalter weiter — statt fuer einen
 * Wimpernschlag ein kaputtes Bild.
 */
export default function StorageImg({ src, alt = '', ...rest }: Props) {
  // Das Ergebnis traegt die Quelle mit, zu der es gehoert. Sonst muesste der
  // Effekt beim Wechsel von `src` erst synchron zuruecksetzen — und bis dahin
  // stuende das ALTE Bild unter der neuen Quelle.
  const [signiert, setSigniert] = useState<{ fuer: string; url: string } | null>(null)

  useEffect(() => {
    if (!src) return
    let aktuell = true
    signStorageUrl(src).then((u) => {
      if (aktuell && u) setSigniert({ fuer: src, url: u })
    })
    return () => {
      aktuell = false
    }
  }, [src])

  if (!src || signiert?.fuer !== src) return null

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={signiert.url} alt={alt} {...rest} />
}

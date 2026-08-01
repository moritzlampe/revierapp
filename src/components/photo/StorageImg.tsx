'use client'

import { useEffect, useState } from 'react'
import { signStorageUrl, verwerfeSignatur } from '@/lib/photos/signed-url'
import { splitPublicUrl } from '@/lib/photos/public-url'

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
export default function StorageImg({ src, alt = '', onError, ...rest }: Props) {
  // Beide Zustaende tragen die Quelle mit, zu der sie gehoeren. Sonst muesste
  // der Effekt beim Wechsel von `src` erst synchron zuruecksetzen — und bis
  // dahin stuende das ALTE Bild unter der neuen Quelle. Nebenbei setzt sich so
  // der Nachsignier-Versuch von selbst zurueck, wenn `src` wechselt.
  const [signiert, setSigniert] = useState<{ fuer: string; url: string } | null>(null)
  const [nachsigniert, setNachsigniert] = useState<string | null>(null)

  useEffect(() => {
    if (!src) return
    let aktuell = true
    signStorageUrl(src)
      .then((u) => {
        if (aktuell && u) setSigniert({ fuer: src, url: u })
      })
      .catch((err) => {
        // signStorageUrl gibt Supabase-Fehler zurueck statt zu werfen; hier
        // landet nur, was darunter liegt (Netz, Client-Aufbau). Ohne diesen
        // Zweig waere es eine unbehandelte Rejection und das Bild bliebe
        // stumm leer.
        console.warn('[StorageImg] signieren geworfen', err)
      })
    return () => {
      aktuell = false
    }
  }, [src, nachsigniert])

  // Eine signierte URL laeuft nach einer Stunde ab, der `src` im DOM aber
  // nicht. Laedt der Browser das Bild erst danach, ist der erste Fehler kein
  // echter — genau einmal frisch signieren, und erst wenn das auch scheitert,
  // den Fehler an den Aufrufer durchreichen (PhotoThumbnail zeigt daraufhin
  // sein Kaputt-Symbol).
  function beiFehler(e: React.SyntheticEvent<HTMLImageElement>) {
    if (src && nachsigniert !== src && splitPublicUrl(src)) {
      verwerfeSignatur(src)
      setSigniert(null)
      setNachsigniert(src)
      return
    }
    onError?.(e)
  }

  if (!src || signiert?.fuer !== src) return null

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={signiert.url} alt={alt} onError={beiFehler} {...rest} />
}

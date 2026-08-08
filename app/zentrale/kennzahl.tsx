/**
 * Eine Zahl mit Beschriftung, Einheit und Fußnote.
 *
 * **Herausgezogen am 08.08.2026**, weil die Kennzahlenreihe mit Konzept §1.3a
 * auf zwei Seiten liegt: *Jagden* und *Strecke* auf der Übersicht (sie wachsen
 * von selbst), *Fläche* und *Sitze* beim Revier (sie ändern sich nur durch die
 * Pflegearbeit dort). Vorher stand sie als lokale Funktion in `page.tsx`.
 *
 * **Eine Datei statt zweier Kopien**, obwohl es nur drei `div` sind: die
 * Fußnote unter der Zahl ist in diesem Verzeichnis kein Schmuck, sondern die
 * Stelle, an der eine Einschränkung steht („nur über Jagden zuordenbar",
 * „keine Grenze gezeichnet"). Zwei Fassungen davon liefen genau dort
 * auseinander, wo eine Zahl ohne ihren Vorbehalt falsch gelesen wird.
 *
 * Kein `'use client'`: reine Darstellung, kein Zustand, kein Ereignis.
 */
export function Kennzahl({
  label,
  wert,
  einheit,
  fuss,
}: {
  label: string
  wert: string
  einheit?: string
  fuss: string
}) {
  return (
    <div className="zentrale-kennzahl">
      <div className="lbl">{label}</div>
      <div className="wert">
        {wert}
        {einheit && <span className="einheit"> {einheit}</span>}
      </div>
      <div className="fuss">{fuss}</div>
    </div>
  )
}

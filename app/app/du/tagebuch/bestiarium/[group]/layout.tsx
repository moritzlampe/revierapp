import type { Viewport } from 'next'

// Route-scoped: gilt nur solange ein Bestiarium-Detail-Segment aktiv ist (Next
// unmountet das Layout beim Wegnavigieren). Färbt die PWA-/Browser-Statusbar
// passend zur dunklen Tagebuch-Detailseite — KEINE globale theme-color-
// Änderung, andere (helle Theme-A-)Seiten bleiben unberührt. 1:1 wie das
// [type]/[id]-Detail-Layout.
export const viewport: Viewport = {
  themeColor: '#11140F',
}

/**
 * Der globale body-Background ist Theme-A (hell). Auf der dunklen Detailseite
 * blitzt er unter der Bottom-Nav / beim Overscroll durch. var(--bg-base) wäre
 * hier wirkungslos: die Variable ist im :root Theme-A-Wert — nur INNERHALB
 * .tagebuch-surface ist sie #11140F. Daher Literal #11140F (== Tagebuch --bg /
 * --bg-base). Route-scoped via Segment-Layout statt globalem body-Override.
 */
export default function BestiariumDetailLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <style>{`body{background:#11140F !important}`}</style>
      {children}
    </>
  )
}

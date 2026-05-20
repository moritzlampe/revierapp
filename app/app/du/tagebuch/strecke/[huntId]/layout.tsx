import type { Viewport } from 'next'

// Klon des [type]/[id]-Layouts: route-scoped theme-color + body-bg-Literal.
// Begründung siehe ../[type]/[id]/layout.tsx (Phase 4c Bug 6).
export const viewport: Viewport = {
  themeColor: '#11140F',
}

export default function StreckeDetailLayout({
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

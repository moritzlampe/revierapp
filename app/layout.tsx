import type { Metadata, Viewport } from 'next'
import './globals.css'
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration'

export const metadata: Metadata = {
  title: 'QuickHunt',
  description: 'Jagd-App für Gruppenkoordination',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'QuickHunt',
  },
  icons: {
    apple: '/icons/icon-192.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: '#E7DDC7',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="de">
      <body className="antialiased">
        <ServiceWorkerRegistration />
        {/* Der Mobile-Wrapper (max-width 430px) sitzt bewusst NICHT mehr hier,
            sondern in app/app/layout.tsx. Sonst zwängt er jede Route in eine
            Handy-Spalte — auch die Revierzentrale unter /zentrale, die die volle
            Breite braucht. Siehe AGENTS.md, Abschnitt Portal-Track. */}
        {children}
      </body>
    </html>
  )
}

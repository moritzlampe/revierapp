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
        <div className="min-h-viewport app-mobile-wrapper" style={{
          margin: '0 auto',
          position: 'relative',
        }}>
          {children}
        </div>
      </body>
    </html>
  )
}

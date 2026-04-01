import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'RevierApp',
  description: 'Jagd-App für Gruppenkoordination',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0a0f08',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="de">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        <div className="min-h-viewport" style={{
          maxWidth: '430px',
          margin: '0 auto',
          position: 'relative',
          borderLeft: '1px solid rgba(107,159,58,0.15)',
          borderRight: '1px solid rgba(107,159,58,0.15)',
        }}>
          {children}
        </div>
      </body>
    </html>
  )
}

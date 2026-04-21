'use client'

type CompassPermission = 'idle' | 'pending' | 'granted' | 'denied' | 'unsupported'

interface CompassToggleButtonProps {
  enabled: boolean
  permission: CompassPermission
  onToggle: () => void
}

/**
 * Kompass-Toggle-Button: .map-btn Stil, oben links unter GpsStatusBadge.
 * Rendert nicht wenn DeviceOrientation nicht unterstützt wird.
 */
export default function CompassToggleButton({ enabled, permission, onToggle }: CompassToggleButtonProps) {
  if (permission === 'unsupported') return null

  const isActive = enabled && permission === 'granted'
  const isDenied = permission === 'denied'

  return (
    <button
      className="map-btn"
      style={{
        top: '3.25rem',
        left: '0.75rem',
        opacity: isActive ? 1 : 0.5,
        transition: 'opacity 0.2s',
      }}
      onClick={onToggle}
      title={isDenied ? 'Kompass-Zugriff verweigert — in Browser-Einstellungen freigeben' : enabled ? 'Kompass deaktivieren' : 'Kompass aktivieren'}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke={isActive ? 'var(--accent-primary)' : isDenied ? 'var(--red)' : 'var(--text)'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Kompass-Kreis */}
        <circle cx="12" cy="12" r="10" />
        {/* Kompass-Nadel: Nord (rot) + Süd */}
        <polygon points="12,2.5 14.5,12 12,14 9.5,12" fill={isActive ? 'var(--red)' : isDenied ? 'var(--red)' : 'var(--text-3)'} stroke="none" />
        <polygon points="12,21.5 14.5,12 12,10 9.5,12" fill={isActive ? 'var(--text-3)' : 'var(--text-3)'} stroke="none" opacity="0.5" />
      </svg>
    </button>
  )
}

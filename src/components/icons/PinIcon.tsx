'use client'

import type { IconProps } from './SpeciesIcons'

/**
 * Klassischer Tropfen-Pin-Marker mit Kreis-Innenraum.
 * viewBox 24x24, Fill = currentColor. Ersetzt das 📍-Emoji in
 * Strecke-/Nachsuche-Zeilen (Spec §6.1: Custom SVG statt Emoji).
 */
export default function PinIcon({
  size = 16,
  className,
  style,
  ariaLabel,
}: IconProps) {
  const hidden = !ariaLabel
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={style}
      role={hidden ? undefined : 'img'}
      aria-hidden={hidden ? 'true' : undefined}
      aria-label={ariaLabel}
      focusable="false"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2.5c-4.14 0-7.5 3.28-7.5 7.33 0 4.62 4.27 9.15 6.71 11.48a1.14 1.14 0 0 0 1.58 0c2.44-2.33 6.71-6.86 6.71-11.48 0-4.05-3.36-7.33-7.5-7.33Zm0 10.1a2.77 2.77 0 1 1 0-5.54 2.77 2.77 0 0 1 0 5.54Z"
      />
    </svg>
  )
}

'use client'

import type { IconProps } from './SpeciesIcons'

/**
 * Warnsymbol für Nachsuche-Zeilen. Gefülltes Dreieck mit ausgespartem
 * Ausrufezeichen (evenodd-Cutout). Farbe über currentColor.
 */
export default function AlertTriangleIcon({
  size = 18,
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
        d="M11.13 3.64a1 1 0 0 1 1.74 0l9.33 16.17a1 1 0 0 1-.87 1.5H2.67a1 1 0 0 1-.87-1.5L11.13 3.64ZM12 9.25a1 1 0 0 0-1 1v4.5a1 1 0 1 0 2 0v-4.5a1 1 0 0 0-1-1Zm0 7.15a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2Z"
      />
    </svg>
  )
}

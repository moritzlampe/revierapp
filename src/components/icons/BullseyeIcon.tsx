'use client'

import type { IconProps } from './SpeciesIcons'

interface BullseyeIconProps extends IconProps {
  weight?: 'regular' | 'fill'
}

/**
 * Signature-Motiv der App. Drei konzentrische Kreise mit zentralem
 * Fadenkreuz. Editorial-schlank — kein Gradient, kein Farbkern;
 * currentColor adaptiert an den Kontext (FAB farbig, Watermark muted).
 *
 * Varianten:
 * - regular: Alle drei Kreise als Stroke + Fadenkreuz
 * - fill: Innerster Kreis gefüllt (aktive States, FAB)
 */
function BullseyeIcon({
  size = 24,
  className,
  style,
  ariaLabel,
  weight = 'regular',
}: BullseyeIconProps) {
  const hidden = !ariaLabel
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      role={hidden ? undefined : 'img'}
      aria-hidden={hidden ? 'true' : undefined}
      aria-label={ariaLabel}
      focusable="false"
    >
      <circle cx="12" cy="12" r="11" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.2" />
      {weight === 'fill' ? (
        <circle cx="12" cy="12" r="3" fill="currentColor" />
      ) : (
        <>
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.2" />
          <line x1="12" y1="10" x2="12" y2="14" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
          <line x1="10" y1="12" x2="14" y2="12" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        </>
      )}
    </svg>
  )
}

export default BullseyeIcon
export { BullseyeIcon }

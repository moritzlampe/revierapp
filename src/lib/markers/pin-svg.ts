// Pin-SVG-Generator fuer Leaflet divIcon-Marker
// Flat-Design Tropfen-Pin mit Typ-Icons

export type PinVariant =
  | { kind: 'sitzstand'; occupied: boolean }
  | { kind: 'adhoc'; occupied: boolean }
  | { kind: 'parkplatz' }
  | { kind: 'kirrung' }
  | { kind: 'salzlecke' }
  | { kind: 'wildkamera' }
  | { kind: 'sonstiges' }

// --- Farbtabelle ---

interface PinColors {
  bgFill: string
  bgStroke: string
  iconColor: string
}

const SURFACE_2 = '#1c2818'

function getPinColors(variant: PinVariant): PinColors {
  switch (variant.kind) {
    case 'sitzstand':
    case 'adhoc':
      return variant.occupied
        ? { bgFill: '#FFFFFF', bgStroke: 'rgba(0,0,0,0.4)', iconColor: SURFACE_2 }
        : { bgFill: SURFACE_2, bgStroke: '#FFFFFF', iconColor: '#FFFFFF' }
    case 'parkplatz':
      return { bgFill: '#3B82F6', bgStroke: 'rgba(0,0,0,0.4)', iconColor: '#FFFFFF' }
    case 'kirrung':
      return { bgFill: '#D97706', bgStroke: 'rgba(0,0,0,0.4)', iconColor: '#FFFFFF' }
    case 'salzlecke':
      return { bgFill: '#9CA3AF', bgStroke: 'rgba(0,0,0,0.4)', iconColor: '#FFFFFF' }
    case 'wildkamera':
      return { bgFill: '#A78BFA', bgStroke: 'rgba(0,0,0,0.4)', iconColor: '#FFFFFF' }
    case 'sonstiges':
      return { bgFill: '#6B7280', bgStroke: 'rgba(0,0,0,0.4)', iconColor: '#FFFFFF' }
  }
}

// --- Icon-SVGs (18x18, im <g translate(9,7)> Slot) ---

function sitzstandIcon(c: string): string {
  return `<path d="M 9 1 L 2 6 L 16 6 Z" fill="${c}"/>
<rect x="3" y="6" width="12" height="5" fill="${c}"/>
<rect x="7" y="8" width="4" height="3" fill="rgba(0,0,0,0.3)"/>
<line x1="4" y1="11" x2="2" y2="17" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/>
<line x1="14" y1="11" x2="16" y2="17" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/>
<line x1="3" y1="14" x2="15" y2="14" stroke="${c}" stroke-width="1" stroke-linecap="round"/>`
}

function adhocIcon(c: string): string {
  return `<circle cx="9" cy="9" r="7" fill="none" stroke="${c}" stroke-width="1.5"/>
<circle cx="9" cy="9" r="2" fill="${c}"/>
<line x1="9" y1="0" x2="9" y2="3" stroke="${c}" stroke-width="1.5"/>
<line x1="9" y1="15" x2="9" y2="18" stroke="${c}" stroke-width="1.5"/>
<line x1="0" y1="9" x2="3" y2="9" stroke="${c}" stroke-width="1.5"/>
<line x1="15" y1="9" x2="18" y2="9" stroke="${c}" stroke-width="1.5"/>`
}

function parkplatzIcon(c: string): string {
  return `<text x="9" y="14" text-anchor="middle" font-family="system-ui, sans-serif" font-size="14" font-weight="700" fill="${c}">P</text>`
}

function kirrungIcon(c: string): string {
  return `<path d="M 2 9 L 16 9 L 14 16 L 4 16 Z" fill="${c}"/>
<circle cx="6" cy="6" r="1.2" fill="${c}"/>
<circle cx="9" cy="5" r="1.2" fill="${c}"/>
<circle cx="12" cy="6" r="1.2" fill="${c}"/>`
}

function salzleckeIcon(c: string): string {
  return `<path d="M 9 2 L 16 6 L 16 13 L 9 17 L 2 13 L 2 6 Z" fill="${c}"/>
<line x1="9" y1="2" x2="9" y2="17" stroke="rgba(0,0,0,0.2)" stroke-width="0.8"/>
<line x1="2" y1="6" x2="16" y2="6" stroke="rgba(0,0,0,0.2)" stroke-width="0.8"/>`
}

function wildkameraIcon(c: string): string {
  return `<rect x="2" y="5" width="14" height="10" rx="1.5" fill="${c}"/>
<circle cx="9" cy="10" r="2.8" fill="rgba(0,0,0,0.35)"/>
<circle cx="9" cy="10" r="1.4" fill="${c}"/>
<rect x="6" y="3" width="4" height="2" rx="0.5" fill="${c}"/>
<circle cx="13.5" cy="7" r="0.6" fill="rgba(0,0,0,0.35)"/>`
}

function sonstigesIcon(c: string): string {
  return `<circle cx="9" cy="9" r="4" fill="${c}"/>`
}

function getIconSvg(variant: PinVariant, iconColor: string): string {
  switch (variant.kind) {
    case 'sitzstand': return sitzstandIcon(iconColor)
    case 'adhoc': return adhocIcon(iconColor)
    case 'parkplatz': return parkplatzIcon(iconColor)
    case 'kirrung': return kirrungIcon(iconColor)
    case 'salzlecke': return salzleckeIcon(iconColor)
    case 'wildkamera': return wildkameraIcon(iconColor)
    case 'sonstiges': return sonstigesIcon(iconColor)
  }
}

// --- Hauptfunktion ---

export function buildPinSvg(variant: PinVariant, uniqueId: string): string {
  const { bgFill, bgStroke, iconColor } = getPinColors(variant)
  const iconSvg = getIconSvg(variant, iconColor)
  const filterId = `pin-shadow-${uniqueId}`

  return `<svg width="36" height="44" viewBox="0 0 36 44" xmlns="http://www.w3.org/2000/svg">
<defs>
<filter id="${filterId}" x="-50%" y="-50%" width="200%" height="200%">
<feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.6"/>
</filter>
</defs>
<path d="M 18 42 L 6 26 Q 2 22 2 16 Q 2 2 18 2 Q 34 2 34 16 Q 34 22 30 26 Z" fill="${bgFill}" stroke="${bgStroke}" stroke-width="1.5" filter="url(#${filterId})"/>
<g transform="translate(9, 7)">
${iconSvg}
</g>
</svg>`
}

// --- Typ-Mapping ---

const SITZSTAND_TYPES = new Set(['hochsitz', 'kanzel', 'drueckjagdstand'])
const ASSIGNABLE_TYPES = new Set(['hochsitz', 'kanzel', 'drueckjagdstand', 'adhoc'])

export function getPinVariant(type: string, occupied: boolean): PinVariant {
  if (SITZSTAND_TYPES.has(type)) return { kind: 'sitzstand', occupied }
  if (type === 'adhoc') return { kind: 'adhoc', occupied }
  if (type === 'parkplatz') return { kind: 'parkplatz' }
  if (type === 'kirrung') return { kind: 'kirrung' }
  if (type === 'salzlecke') return { kind: 'salzlecke' }
  if (type === 'wildkamera') return { kind: 'wildkamera' }
  return { kind: 'sonstiges' }
}

export function isAssignableStand(type: string): boolean {
  return ASSIGNABLE_TYPES.has(type)
}

'use client'

import type { WildArt, WildGroup } from '@/lib/species-config'
import { WILD_ART_TO_GROUP } from '@/lib/species-config'

export interface IconProps {
  size?: number | string
  className?: string
  style?: React.CSSProperties
  ariaLabel?: string
}

// Einheitliche Silhouetten, Seitenprofil, viewBox 24x24.
// Gefüllt mit currentColor, keine Outlines, robust bis 16px.

function Svg({
  size = 20,
  className,
  style,
  ariaLabel,
  children,
}: IconProps & { children: React.ReactNode }) {
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
      {children}
    </svg>
  )
}

// Rehwild — schlank, einfaches 2-endiges Geweih
export function RehwildIcon(props: IconProps) {
  return (
    <Svg {...props}>
      {/* Geweih: zwei kurze Spieße */}
      <path d="M5.6 2.5 L6.1 5.4 L5.1 5.4 Z" />
      <path d="M7.4 2.5 L7.9 5.4 L6.9 5.4 Z" />
      {/* Kopf + Schnauze */}
      <path d="M4 6.2 Q5.2 5 6.5 5 H8 Q9 5 9.4 5.8 L9.8 7.2 L7.2 8.3 L4 7.6 Z" />
      {/* Hals */}
      <path d="M8.2 7.8 L11 9 L11.2 11 L9 11 Z" />
      {/* Körper (schlank) */}
      <path d="M10 10.5 L20 10.5 Q21 10.5 21 11.5 L21 14 Q21 14.8 20 14.8 L10 14.8 Q9 14.8 9 14 L9 11.5 Q9 10.5 10 10.5 Z" />
      {/* Schwänzchen */}
      <path d="M20.8 11.2 L22 10.4 L21.4 12 Z" />
      {/* Beine, schlank */}
      <rect x="10.4" y="14.5" width="1" height="6" rx="0.3" />
      <rect x="13" y="14.5" width="1" height="6" rx="0.3" />
      <rect x="16.2" y="14.5" width="1" height="6" rx="0.3" />
      <rect x="18.8" y="14.5" width="1" height="6" rx="0.3" />
    </Svg>
  )
}

// Rotwild — breiter gebautes Geweih mit mehreren Enden
export function RotwildIcon(props: IconProps) {
  return (
    <Svg {...props}>
      {/* Geweih: mehrzackige Krone */}
      <path d="M3.6 3.8 L4.4 6 L3.4 6 Z" />
      <path d="M5 2 L5.6 6 L4.4 6 Z" />
      <path d="M6.6 3.2 L7 6 L5.8 6 Z" />
      <path d="M7.8 2 L8.4 6 L7.2 6 Z" />
      <path d="M9 3.8 L9.4 6 L8.4 6 Z" />
      {/* Kopf + Schnauze */}
      <path d="M3.6 6.6 Q5 5.6 6.5 5.6 H8.6 Q9.6 5.6 10 6.4 L10.4 8 L7.2 9.2 L3.6 8.4 Z" />
      {/* Hals, kräftiger */}
      <path d="M8.6 8.8 L12 10 L12.2 11.5 L9 11.5 Z" />
      {/* Körper, kräftiger */}
      <path d="M10.5 10.8 L21 10.8 Q22 10.8 22 12 L22 14.4 Q22 15.2 21 15.2 L10.5 15.2 Q9.5 15.2 9.5 14.4 L9.5 12 Q9.5 10.8 10.5 10.8 Z" />
      {/* Schwanz */}
      <path d="M21.6 11.6 L22.8 10.8 L22.2 12.4 Z" />
      {/* Beine */}
      <rect x="11" y="14.8" width="1.2" height="6" rx="0.3" />
      <rect x="13.6" y="14.8" width="1.2" height="6" rx="0.3" />
      <rect x="17" y="14.8" width="1.2" height="6" rx="0.3" />
      <rect x="19.6" y="14.8" width="1.2" height="6" rx="0.3" />
    </Svg>
  )
}

// Damwild — breitere Silhouette, Schaufel-Geweih-Andeutung
export function DamwildIcon(props: IconProps) {
  return (
    <Svg {...props}>
      {/* Schaufelgeweih: zwei Schaufeln mit Spitzen am Rand */}
      <path d="M3.2 5 Q3.2 2 4.8 1.8 Q6.4 2 7 3.6 L6.8 5.4 Z" />
      <path d="M3.4 1.6 L3.8 3 L2.8 3 Z" />
      <path d="M5 1 L5.4 2.6 L4.4 2.6 Z" />
      <path d="M6.6 1.6 L6.6 3 L5.6 3 Z" />
      {/* Zweite Schaufel */}
      <path d="M7.2 5 Q7.8 3 8.8 2.8 L9.6 5.4 Z" />
      {/* Kopf + Schnauze */}
      <path d="M3.6 5.8 Q5 5 6.5 5 H9 Q10 5 10.4 5.8 L10.8 7.2 L7.4 8.4 L3.6 7.6 Z" />
      {/* Hals */}
      <path d="M8.8 7.8 L12 9.2 L12.2 11 L9 11 Z" />
      {/* Körper, breit */}
      <path d="M10.4 10.4 L21 10.4 Q22 10.4 22 11.6 L22 14.4 Q22 15.2 21 15.2 L10.4 15.2 Q9.4 15.2 9.4 14.4 L9.4 11.6 Q9.4 10.4 10.4 10.4 Z" />
      <path d="M21.6 11.2 L22.8 10.4 L22.2 12 Z" />
      {/* Beine */}
      <rect x="10.8" y="14.8" width="1.2" height="5.8" rx="0.3" />
      <rect x="13.4" y="14.8" width="1.2" height="5.8" rx="0.3" />
      <rect x="16.8" y="14.8" width="1.2" height="5.8" rx="0.3" />
      <rect x="19.4" y="14.8" width="1.2" height="5.8" rx="0.3" />
    </Svg>
  )
}

// Schwarzwild — kompakt, niedrig, Eber-Form
export function SchwarzwildIcon(props: IconProps) {
  return (
    <Svg {...props}>
      {/* Borsten auf Rücken */}
      <path d="M8.5 6.5 L9 8 M10.5 6 L11 7.8 M12.5 5.8 L13 7.6 M14.5 6 L15 7.8 M16.5 6.5 L17 8" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" />
      {/* Schnauze mit Hauer-Andeutung */}
      <path d="M3 11 Q3 9 5 9 L6 9 L6.5 10 L5.8 11.2 L5 12 L3 12 Z" />
      {/* Hauer */}
      <path d="M5.8 10.4 L4.8 9.6 L4.8 10.6 Z" />
      {/* Ohr, klein dreieckig */}
      <path d="M6.8 8.5 L8 8.2 L7.5 9.8 Z" />
      {/* Auge (winzig ausgespart negativ geht nicht — weglassen, Silhouette reicht) */}
      {/* Körper, rundlich kompakt */}
      <path d="M6 10 Q8 8 12 8 L17 8 Q20 8 21 10.5 L21.5 13.5 Q21.5 15 20 15 L6 15 Q4.5 15 4.5 13.5 Q4.5 11.5 6 10 Z" />
      {/* Schwänzchen eingerollt */}
      <path d="M21 11.5 Q22.5 11 22.6 12.5 Q22.5 13.2 22 13 Z" />
      {/* Sehr kurze Beine */}
      <rect x="7" y="14.5" width="1.3" height="4" rx="0.4" />
      <rect x="10.5" y="14.5" width="1.3" height="4" rx="0.4" />
      <rect x="15" y="14.5" width="1.3" height="4" rx="0.4" />
      <rect x="18" y="14.5" width="1.3" height="4" rx="0.4" />
    </Svg>
  )
}

// Raubwild — Fuchs: spitze Ohren, langer buschiger Schwanz
export function RaubwildIcon(props: IconProps) {
  return (
    <Svg {...props}>
      {/* Spitze Ohren */}
      <path d="M4.5 3.5 L5.6 7 L3.2 6 Z" />
      <path d="M8.4 3 L8.8 6.6 L6.5 6.2 Z" />
      {/* Kopf, dreieckig schlank */}
      <path d="M3 7.5 Q3 6 5 5.8 L9 6 Q10.4 6 10.8 7 L11 9 L9.2 10 L3 9.5 Z" />
      {/* Schnauze, spitz */}
      <path d="M2.2 8 L3 7.8 L3.2 9 L2.2 9 Z" />
      {/* Körper, schlank lang */}
      <path d="M9 9.5 L18 9.5 Q19.5 9.5 19.5 11 L19.5 13.2 Q19.5 14.5 18 14.5 L9 14.5 Q7.8 14.5 7.8 13.2 L7.8 11 Q7.8 9.5 9 9.5 Z" />
      {/* Buschiger, langer Schwanz */}
      <path d="M18.8 10 Q22 9 23 12 Q23.5 14.5 21 14 Q20 13.5 19.2 12.5 Z" />
      <path d="M22.8 10 L21.8 11.5 L22.2 11.8 Z" />
      {/* Beine, lang dünn */}
      <rect x="9" y="14.2" width="1" height="5.8" rx="0.3" />
      <rect x="11.5" y="14.2" width="1" height="5.8" rx="0.3" />
      <rect x="15" y="14.2" width="1" height="5.8" rx="0.3" />
      <rect x="17.2" y="14.2" width="1" height="5.8" rx="0.3" />
    </Svg>
  )
}

// Hasenartig — lange Ohren, kompakt hockend
export function HasenartigIcon(props: IconProps) {
  return (
    <Svg {...props}>
      {/* Zwei lange Ohren */}
      <path d="M7.5 2 Q8 1 8.8 1.4 Q9.2 2.2 9 5 L8 7 Z" />
      <path d="M10.5 1.4 Q11.4 1.2 11.8 2 Q12 3 11.2 5.6 L10 6.8 Z" />
      {/* Kopf rund */}
      <circle cx="9.2" cy="9" r="3" />
      {/* Kleines Auge entfällt — Silhouette */}
      {/* Körper, hockend */}
      <path d="M7 11.5 Q9 10.5 13 10.8 L17 11.4 Q19.5 11.8 19.5 14 Q19.5 16 17.5 16.2 L8 16.2 Q6 16 6 13.8 Q6 12.4 7 11.5 Z" />
      {/* Hinterlauf-Andeutung hinten groß */}
      <path d="M17 16 L19 20 L16 20 Z" />
      <path d="M8 16 L8.8 19.6 L6.4 19.6 Z" />
      {/* Kleines Vorderbein */}
      <rect x="11.5" y="15.5" width="1" height="4" rx="0.3" />
      <rect x="13.5" y="15.5" width="1" height="4" rx="0.3" />
      {/* Puschel-Schwanz */}
      <circle cx="19.3" cy="13.4" r="1.1" />
    </Svg>
  )
}

// Federwild — Ente/Schwimmvogel-Profil
export function FederwildIcon(props: IconProps) {
  return (
    <Svg {...props}>
      {/* Kopf */}
      <circle cx="7" cy="8" r="2.6" />
      {/* Auge (Aussparung ist negativ — lassen wir weg für flat) */}
      {/* Schnabel, flach */}
      <path d="M2.5 8 L6 7.2 L6 9.2 L2.5 9.8 Q1.8 9 2.5 8 Z" />
      {/* Hals */}
      <path d="M7.4 10 L10.2 10.4 L10.2 12 L7.4 12 Z" />
      {/* Körper, Schwimm-Profil mit Schwanzspitze */}
      <path d="M8 11.5 Q10 10.5 14 10.8 L20 11.5 Q22.5 12 22 14 L21.5 14.8 L20 15 L8 15 Q6 15 6 13.5 Q6 12.2 8 11.5 Z" />
      {/* Kleine Schwanzspitze hinten */}
      <path d="M20 12.5 L23 11.2 L22 14 Z" />
      {/* Wellenlinie Wasser */}
      <path d="M3 17.6 Q5 16.6 7 17.6 Q9 18.6 11 17.6 Q13 16.6 15 17.6 Q17 18.6 19 17.6 Q21 16.6 22 17.2 L22 18.6 Q21 17.8 19 18.8 Q17 19.8 15 18.8 Q13 17.8 11 18.8 Q9 19.8 7 18.8 Q5 17.8 3 18.8 Z" />
    </Svg>
  )
}

// Sonstiges — generische Pfote
export function SonstigesIcon(props: IconProps) {
  return (
    <Svg {...props}>
      {/* 4 Zehenballen */}
      <ellipse cx="6" cy="8" rx="2" ry="2.6" />
      <ellipse cx="10" cy="5.2" rx="2" ry="2.8" />
      <ellipse cx="14" cy="5.2" rx="2" ry="2.8" />
      <ellipse cx="18" cy="8" rx="2" ry="2.6" />
      {/* Hauptballen */}
      <path d="M12 10 Q6.5 10 6.5 15 Q6.5 19 12 19 Q17.5 19 17.5 15 Q17.5 10 12 10 Z" />
    </Svg>
  )
}

// Router-Helper
export function getSpeciesIcon(wild_art: WildArt | string): React.ComponentType<IconProps> {
  const group = WILD_ART_TO_GROUP[wild_art as WildArt]
  return getGroupIcon(group)
}

export function getGroupIcon(group: WildGroup | undefined): React.ComponentType<IconProps> {
  switch (group) {
    case 'rehwild':
      return RehwildIcon
    case 'rotwild':
      return RotwildIcon
    case 'damwild':
      return DamwildIcon
    case 'schwarzwild':
      return SchwarzwildIcon
    case 'raubwild':
      return RaubwildIcon
    case 'hasenartig':
      return HasenartigIcon
    case 'federwild':
      return FederwildIcon
    case 'sonstiges':
    default:
      return SonstigesIcon
  }
}

// Convenience: inline rendering als React-Element
export function SpeciesIcon({
  wildArt,
  group,
  size,
  className,
  style,
  ariaLabel,
}: {
  wildArt?: WildArt | string
  group?: WildGroup
  size?: number | string
  className?: string
  style?: React.CSSProperties
  ariaLabel?: string
}) {
  const Component = group ? getGroupIcon(group) : getSpeciesIcon(wildArt ?? '')
  return <Component size={size} className={className} style={style} ariaLabel={ariaLabel} />
}

'use client'

/**
 * Schlichter Rehkopf-Umriss mit Geweih, monochrom --text-secondary.
 *
 * Historisch Empty-State-Grafik in StreckeEmptyState. In Sprint 58.1k.3
 * durch Bullseye-Watermark abgelöst, aber als Komponente erhalten —
 * möglicher Einsatz in einem späteren Empty-State, einer Onboarding-
 * Illustration oder einem Hero-Detail.
 */
export default function AntlerIllustration() {
  return (
    <svg
      width="120"
      height="120"
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <g
        stroke="var(--text-secondary)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.7"
      >
        {/* Geweih links */}
        <path d="M40 40 L30 18" />
        <path d="M30 18 L22 22" />
        <path d="M30 18 L24 10" />
        <path d="M30 18 L34 8" />
        <path d="M40 40 L26 28" />
        {/* Geweih rechts */}
        <path d="M80 40 L90 18" />
        <path d="M90 18 L98 22" />
        <path d="M90 18 L96 10" />
        <path d="M90 18 L86 8" />
        <path d="M80 40 L94 28" />
        {/* Kopf-Umriss (abstrakter Rehkopf) */}
        <path d="M40 40 C 40 32, 48 28, 60 28 C 72 28, 80 32, 80 40 L 80 68 C 80 82, 72 92, 60 96 C 48 92, 40 82, 40 68 Z" />
        {/* Augen-Andeutung */}
        <circle cx="50" cy="54" r="1.5" fill="var(--text-secondary)" stroke="none" />
        <circle cx="70" cy="54" r="1.5" fill="var(--text-secondary)" stroke="none" />
        {/* Nase */}
        <path d="M56 76 Q60 80 64 76" />
      </g>
    </svg>
  )
}

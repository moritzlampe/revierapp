type HeroVariant = 'erlegung' | 'gesell' | 'anblick' | 'neutral'

/**
 * Hero der Tagebuch-Detailseite. Vier Akzent-Varianten:
 *  - erlegung → bronze (Default-Rail), 16:9, Foto oder Bronze-Fallback
 *  - gesell   → slate-Rail, 16:9, Foto oder Bronze-Fallback, Status-Chip
 *  - anblick  → forest (150px, kein Foto v1), Forest-Pattern-Overlay
 *  - neutral  → kein Akzent-Rail, dezenter Kicker (Sprint 60.5a: StreckeDetail,
 *               offen für künftige Wildgruppen-spezifische Akzente)
 *
 * Styles in globals.css unter .tagebuch-surface .hero*.
 */
export function DetailHero({
  variant,
  photoUrl = null,
  kicker = null,
  title,
  subtitle,
  statusChip = null,
  capitalChip = false,
}: {
  variant: HeroVariant
  photoUrl?: string | null
  kicker?: string | null
  title: string
  subtitle: string
  statusChip?: string | null
  capitalChip?: boolean
}) {
  const heroClass =
    variant === 'gesell'
      ? 'hero slate'
      : variant === 'anblick'
        ? 'hero forest'
        : variant === 'neutral'
          ? 'hero neutral'
          : 'hero'

  return (
    <div className={heroClass}>
      {variant === 'anblick' ? (
        // Anblick hat v1 kein Foto — Forest-Pattern statt Bild.
        <div className="forest-pattern" aria-hidden="true" />
      ) : photoUrl ? (
        <img className="hero-photo" src={photoUrl} alt="" decoding="async" />
      ) : (
        <div className="hero-fallback" aria-hidden="true" />
      )}

      {statusChip ? <div className="status-chip">{statusChip}</div> : null}

      <div className="hero-copy">
        {kicker ? <div className="hero-kicker">{kicker}</div> : null}
        <div className="hero-heading-row">
          <h1>{title}</h1>
          {capitalChip ? <span className="chip-inline">Kapital</span> : null}
        </div>
        <div className="hero-subtitle">{subtitle}</div>
      </div>
    </div>
  )
}

import Link from 'next/link'

export default function StreckeDetailNotFound() {
  return (
    <div
      className="tagebuch-surface min-h-dvh flex flex-col items-center justify-center"
      style={{ padding: '2rem 1.5rem', gap: '1rem', textAlign: 'center' }}
    >
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.5rem',
          fontWeight: 500,
          color: 'var(--text)',
          margin: 0,
        }}
      >
        Strecke nicht gefunden
      </h1>
      <p
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.9375rem',
          color: 'var(--text-2)',
          margin: 0,
          maxWidth: '22rem',
        }}
      >
        Diese Strecken-Aggregation existiert nicht oder ist nicht für dich
        sichtbar.
      </p>
      <Link
        href="/app/du/tagebuch"
        style={{
          marginTop: '0.5rem',
          padding: '0.75rem 1.25rem',
          minHeight: '2.75rem',
          display: 'inline-flex',
          alignItems: 'center',
          borderRadius: 'var(--radius)',
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
          fontFamily: 'var(--font-body)',
          fontSize: '0.9375rem',
          textDecoration: 'none',
        }}
      >
        Zurück zum Tagebuch
      </Link>
    </div>
  )
}

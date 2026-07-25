'use client'

/**
 * Fehlergrenze des Portals. Existiert, weil die Seiten bei DB- und RLS-Fehlern
 * bewusst werfen statt auf 0 zurückzufallen — dann muss aber auch etwas
 * Brauchbares dastehen und nicht Nexts nackte Standardseite.
 *
 * Kein Alarmrot: ein Ladefehler ist kein Feldalarm (Konzept §2.6).
 */
export default function ZentraleFehler({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="zentrale-wrap">
      <h1>Daten nicht geladen</h1>
      <p className="zentrale-sub">Die Übersicht zeigt lieber nichts als eine falsche Zahl</p>

      <div className="zentrale-note">
        <p style={{ margin: 0 }}>{error.message}</p>
        {error.digest && (
          <p style={{ margin: '10px 0 0' }}>
            Kennung: <code>{error.digest}</code>
          </p>
        )}
        <p style={{ margin: '14px 0 0' }}>
          <button type="button" className="zentrale-knopf" onClick={reset}>
            Erneut versuchen
          </button>
        </p>
      </div>
    </div>
  )
}

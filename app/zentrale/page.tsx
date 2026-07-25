export default function ZentraleUebersicht() {
  return (
    <div className="zentrale-wrap">
      <h1>Revierzentrale</h1>
      <p className="zentrale-sub">Phase 1 — Fundament steht, Inhalte folgen</p>

      <div className="zentrale-note">
        <p style={{ margin: 0 }}>
          Diese Schale beweist dreierlei: die Route ist erreichbar und durch den
          Auth-Guard geschützt, sie erbt nichts vom Handy-Shell (keine
          BottomTabBar, keine 430-px-Spalte, Browser-Zoom nicht gesperrt), und
          die Portal-Palette greift.
        </p>
        <p style={{ margin: '10px 0 0' }}>
          Als Nächstes Phase 2: Revier-Übersicht, ausschließlich lesend. Fahrplan
          in <code>QuickHunt_Konzept_Revierzentrale_V1.md</code> §5.
        </p>
      </div>
    </div>
  )
}

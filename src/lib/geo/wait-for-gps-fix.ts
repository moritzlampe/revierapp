/**
 * Promise-basierter GPS-One-Shot mit Genauigkeits-Schwelle und Timeout.
 *
 * Nutzt navigator.geolocation.watchPosition, wartet bis accuracy <= maxAccuracyMeters
 * oder bis timeoutMs abgelaufen. Bei Timeout wird die beste verfügbare Position
 * zurückgegeben (auch wenn > maxAccuracy), oder ein Error geworfen wenn gar nichts kam.
 *
 * 15m Genauigkeit reicht für Revier-Zuordnung (PostGIS-Polygone sind groß genug).
 */
export function waitForAccurateGpsFix(
  timeoutMs = 10_000,
  maxAccuracyMeters = 15,
): Promise<{ lng: number; lat: number; accuracy: number }> {
  return new Promise((resolve, reject) => {
    let bestFix: { lng: number; lat: number; accuracy: number } | null = null

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const fix = {
          lng: pos.coords.longitude,
          lat: pos.coords.latitude,
          accuracy: pos.coords.accuracy,
        }

        // Beste Position merken
        if (!bestFix || fix.accuracy < bestFix.accuracy) {
          bestFix = fix
        }

        if (pos.coords.accuracy <= maxAccuracyMeters) {
          navigator.geolocation.clearWatch(watchId)
          clearTimeout(timer)
          resolve(fix)
        }
      },
      (err) => {
        navigator.geolocation.clearWatch(watchId)
        clearTimeout(timer)
        reject(err)
      },
      { enableHighAccuracy: true, maximumAge: 3000 },
    )

    const timer = setTimeout(() => {
      navigator.geolocation.clearWatch(watchId)
      if (bestFix) {
        // Beste verfügbare Position nutzen, auch wenn > maxAccuracy
        resolve(bestFix)
      } else {
        reject(new Error('GPS timeout'))
      }
    }, timeoutMs)
  })
}

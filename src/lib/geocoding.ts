/**
 * Reverse-Geocoding via OpenStreetMap Nominatim.
 * Rate-Limit: 1 req/sec laut Nominatim Usage Policy.
 * User-Agent Pflicht.
 *
 * Präferenz-Reihenfolge für Ortsnamen:
 *   village > hamlet > suburb > town > city > municipality
 *
 * Fallback: "Unbekannter Ort"
 */

type NominatimAddress = {
  village?: string
  hamlet?: string
  suburb?: string
  town?: string
  city?: string
  municipality?: string
  county?: string
  state?: string
  country?: string
}

type NominatimResponse = {
  address?: NominatimAddress
  display_name?: string
}

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse'
const USER_AGENT = 'QuickHunt/1.0 (https://quickhunt.de; support@quickhunt.de)'

export async function reverseGeocode(
  lng: number,
  lat: number,
  signal?: AbortSignal
): Promise<{ name: string; raw?: NominatimResponse }> {
  const url = new URL(NOMINATIM_URL)
  url.searchParams.set('lat', lat.toString())
  url.searchParams.set('lon', lng.toString())
  url.searchParams.set('format', 'json')
  url.searchParams.set('accept-language', 'de')
  url.searchParams.set('zoom', '14') // Zoom 14 ≈ Ortsteil/Gemeinde-Ebene

  try {
    const res = await fetch(url.toString(), {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
      signal,
    })

    if (!res.ok) {
      return { name: 'Unbekannter Ort' }
    }

    const data = (await res.json()) as NominatimResponse
    const addr = data.address

    const name =
      addr?.village ??
      addr?.hamlet ??
      addr?.suburb ??
      addr?.town ??
      addr?.city ??
      addr?.municipality ??
      addr?.county ??
      'Unbekannter Ort'

    return { name, raw: data }
  } catch (err) {
    // AbortError oder Netzwerkfehler — Solo-Hunt soll auch ohne Ortsname
    // funktionieren, daher Fallback statt Exception
    console.warn('[reverseGeocode] failed:', err)
    return { name: 'Unbekannter Ort' }
  }
}

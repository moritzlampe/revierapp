import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { safeNext, splitNext } from '@/lib/safe-next'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Session refreshen (wichtig: nicht entfernen)
  const { data: { user } } = await supabase.auth.getUser()

  // Nicht eingeloggt → Login-Redirect (außer öffentliche Routen)
  const isPublicRoute =
    request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/signup') ||
    request.nextUrl.pathname.startsWith('/join') ||
    request.nextUrl.pathname.startsWith('/auth') ||
    request.nextUrl.pathname.startsWith('/rsvp') ||
    request.nextUrl.pathname.startsWith('/ns')

  // Redirect-Helper: überträgt die von Supabase refreshten Cookies auf die
  // Redirect-Response. Ohne das gehen rotierte Auth-Tokens verloren, da
  // NextResponse.redirect() eine frische Response ohne diese Cookies ist
  // (Logout-Loop-Keim).
  // `ziel` ist bereits geprüft (safeNext) und darf Pfad + Query enthalten.
  const redirectMitCookies = (ziel: string, next?: string) => {
    const { pathname, search } = splitNext(ziel)
    const url = request.nextUrl.clone()
    url.pathname = pathname
    url.search = search
    if (next) url.searchParams.set('next', next)
    const redirectResponse = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach((cookie) =>
      redirectResponse.cookies.set(cookie)
    )
    return redirectResponse
  }

  if (!user && !isPublicRoute) {
    // Wunschziel inkl. Query mitnehmen, damit der Login dorthin zurückführt.
    // Fragmente (#…) erreichen den Server grundsätzlich nicht.
    return redirectMitCookies('/login', request.nextUrl.pathname + request.nextUrl.search)
  }

  // Eingeloggt + auf Login-Seite → weiter zum Wunschziel, sonst in die Feld-App.
  // Die Weiche existiert, damit ein Desktop-Login unter /zentrale nicht in der
  // Handy-PWA landet (siehe AGENTS.md, Abschnitt Portal-Track).
  if (user && (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/signup')) {
    return redirectMitCookies(safeNext(request.nextUrl.searchParams.get('next')) ?? '/app')
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /**
     * Alles außer statischen Dateien und API.
     *
     * **Die vier Pfade aus `public/` sind seit dem 26.08.2026 dabei (CP-81),
     * und sie fehlten seit jeher.** Der Matcher nannte nur `_next/*`; alles
     * andere in `public/` lief durch die Anmeldeprüfung oben und bekam für
     * einen nicht angemeldeten Abruf die Login-Seite als HTML — mit 307,
     * nicht mit dem Inhalt.
     *
     * **Chrome holt das Manifest grundsätzlich OHNE Cookies**, weil
     * `<link rel="manifest">` kein `crossorigin="use-credentials"` trägt. Es
     * bekam also HTML und meldete `Manifest: Line 1, column 1, Syntax error` —
     * die einzige Konsolenzeile, die die Zentrale je produziert hat, und sie
     * stand da, ohne dass sie jemanden störte.
     *
     * **Die Folge war größer als die Meldung:** ohne gültiges Manifest greifen
     * `display: standalone`, Icons, `theme_color` und `orientation` nicht —
     * „Zum Homescreen hinzufügen" liefert eine Browser-Verknüpfung statt einer
     * App. Genau das ist der erste Handgriff jedes Testlauf-Teilnehmers.
     *
     * **Nichts davon ist schützenswert:** das Manifest trägt Name, Icons und
     * Farben, `sw.js` ist ein reiner Push-Handler ohne `fetch`-Handler und
     * ohne Cache, `icons/` und `leaflet/` sind Bilddateien.
     *
     * ⚠ **Hier stand ein Satz, der schief war** (Schlusslesung 26.08.2026,
     * Punkt 7): *„Ein Service Worker MUSS ohnehin ohne Anmeldung abrufbar sein
     * — er wird registriert, bevor irgendetwas geladen ist."* Die Registrierung
     * startet aus einer Seite, die selbst hinter der Anmeldung liegt, und der
     * Skript-Abruf schickt Cookies mit; **für Angemeldete funktionierte
     * `sw.js` auch vorher.** Richtig ist der Schluss, nicht die Begründung:
     * **ein Redirect auf ein Service-Worker-Skript lässt Registrierung und
     * Update-Check hart scheitern** — die Spec setzt den Skript-Abruf auf
     * redirect mode `error`. Sobald die Sitzung abgelaufen ist, kommt der
     * Update-Check also nicht mehr durch.
     *
     * ⚠ **Und hier stand schon wieder eine zu genaue Begründung**
     * (Delta-Durchgang 26.08.2026, F-D3). Erst: „er wird registriert, bevor
     * irgendetwas geladen ist" — falsch. Dann, als Korrektur: „per Spec ein
     * harter `SecurityError`" — **der Fehlername ist Chromes Wahl, nicht die
     * der Spec**; die lässt den Fetch scheitern, was spec-seitig eher auf
     * einen `TypeError` hinausliefe. **Zweiter Anlauf an derselben Zeile,
     * zweite unsaubere Zuschreibung.** Wer eine Begründung schärfer macht,
     * als er sie belegen kann, hat sie nicht verbessert — er hat den nächsten
     * Prüfer nur ein weiteres Mal beschäftigt.
     *
     * ⚠ **Die Gegenprobe braucht einen Cache-Buster**, sonst misst sie
     * Cloudflare statt der Anwendung (s. AGENTS.md, Storage-Abschnitt):
     * `curl -s -o /dev/null -w "%{http_code}" "https://quickhunt.de/manifest.json?cb=$(date +%s)"`
     * muss **200** liefern, nicht 307.
     *
     * ---
     *
     * ⚠ **Jeder Eintrag ist verankert, und das ist keine Kosmetik**
     * (Fremdprüfung Codex 26.08.2026, `[medium]`).
     *
     * Die ursprüngliche Fassung schrieb die Namen roh hin. **Der Punkt in
     * `manifest.json` ist im Regex ein Platzhalter für jedes Zeichen**, und
     * kein Eintrag war ans Pfadende gebunden. Am laufenden Build gemessen —
     * `404` heisst hier „die Middleware lief gar nicht erst", denn sonst käme
     * ein `307` auf `/login`:
     *
     *     /manifestXjson   404 → 307     /faviconXico   404 → 307
     *     /swXjs           404 → 307     /apixyz        404 → 307
     *     /manifest.jsonx  404 → 307
     *     /sw.js/x         404 → 307
     *
     * **`faviconXico` und `apixyz` sind KEIN Schaden dieses Diffs — sie
     * standen seit jeher offen.** Codex hat sie nicht gemeldet, weil sein
     * Fokus der Diff war; die Messung hat sie mitgenommen. Sie hier weich zu
     * lassen, während die vier neuen verankert sind, hiesse einen Ausdruck zu
     * hinterlassen, dem man nicht ansieht, welche Hälfte gilt.
     *
     * **Heute trifft keiner dieser Pfade eine Route** — sie liefern 404, und
     * darin liegt genau die Falle: **ein Ausschluss, der breiter ist als
     * gemeint, sieht aus wie ein enger Ausschluss.** Wer später eine Route
     * oder ein Rewrite mit einem solchen Namen anlegt, bekommt sie ohne
     * Anmeldung ausgeliefert und hat nichts falsch gemacht.
     *
     * **Die doppelten Backslashes sind Pflicht, nicht Zierat:** in einem
     * JavaScript-String ist `'\.'` schlicht `'.'` — ein unbekanntes Escape
     * fällt auf sein Zeichen zurück. Wer hier einfach schreibt, baut den
     * Platzhalter wieder ein, den er gerade entfernen wollte, und **der
     * Ausdruck sieht danach korrekt aus.**
     *
     * `(?:/|$)` statt `/` bei den Verzeichnissen: sonst fiele `/icons` ohne
     * Schrägstrich wieder unter die Anmeldeprüfung — kein Schaden, aber eine
     * Ausnahme, die ihre eigene Grenze nicht kennt.
     *
     * **Dot-Segmente sind geprüft und unbedenklich** (Schlusslesung
     * 26.08.2026, offener Punkt — die Stelle war bis dahin ungemessen). Der
     * Matcher SELBST überspringt `/icons/../zentrale`; entscheidend ist, dass
     * Next.js vor dem Routing normalisiert. Am Build gemessen, mit
     * `curl --path-as-is`, weil curl sonst selbst aufräumt und man die eigene
     * Bibliothek misst statt des Servers:
     *
     *     /icons/../zentrale          307 → /login?next=%2Fzentrale
     *     /manifest.json/../zentrale  307 → /login?next=%2Fzentrale
     *     /api/../zentrale            307 → /login?next=%2Fzentrale
     *
     * Das Umleitungsziel ist der Beleg: `next=%2Fzentrale` heisst, die
     * Middleware hat den **normalisierten** Pfad gesehen.
     */
    '/((?!_next/static(?:/|$)|_next/image(?:/|$)|favicon\\.ico$|api(?:/|$)|manifest\\.json$|sw\\.js$|icons(?:/|$)|leaflet(?:/|$)).*)',
  ],
}

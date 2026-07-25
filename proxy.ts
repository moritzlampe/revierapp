import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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
  const redirectMitCookies = (pathname: string, next?: string) => {
    const url = request.nextUrl.clone()
    url.pathname = pathname
    url.search = ''
    if (next) url.searchParams.set('next', next)
    const redirectResponse = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach((cookie) =>
      redirectResponse.cookies.set(cookie)
    )
    return redirectResponse
  }

  // `next` kommt aus der URL und ist damit nicht vertrauenswürdig: nur
  // repo-interne Pfade zulassen. '//host' und 'http://host' wären sonst eine
  // offene Weiterleitung, '\' umgeht in manchen Parsern die Slash-Prüfung.
  const sicheresZiel = (kandidat: string | null): string | null => {
    if (!kandidat) return null
    if (!kandidat.startsWith('/')) return null
    if (kandidat.startsWith('//') || kandidat.includes('\\')) return null
    return kandidat
  }

  if (!user && !isPublicRoute) {
    // Wunschziel mitnehmen, damit der Login danach dorthin zurückführen kann
    return redirectMitCookies('/login', request.nextUrl.pathname)
  }

  // Eingeloggt + auf Login-Seite → weiter zum Wunschziel, sonst in die Feld-App.
  // Die Weiche existiert, damit ein Desktop-Login unter /zentrale nicht in der
  // Handy-PWA landet (siehe AGENTS.md, Abschnitt Portal-Track).
  if (user && (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/signup')) {
    const ziel = sicheresZiel(request.nextUrl.searchParams.get('next'))
    return redirectMitCookies(ziel ?? '/app')
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // Alles außer statische Dateien und API
    '/((?!_next/static|_next/image|favicon.ico|api).*)',
  ],
}

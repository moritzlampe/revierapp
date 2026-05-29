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
  const redirectMitCookies = (pathname: string) => {
    const url = request.nextUrl.clone()
    url.pathname = pathname
    const redirectResponse = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach((cookie) =>
      redirectResponse.cookies.set(cookie)
    )
    return redirectResponse
  }

  if (!user && !isPublicRoute) {
    return redirectMitCookies('/login')
  }

  // Eingeloggt + auf Login-Seite → weiter zur App
  if (user && (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/signup')) {
    return redirectMitCookies('/app')
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // Alles außer statische Dateien und API
    '/((?!_next/static|_next/image|favicon.ico|api).*)',
  ],
}

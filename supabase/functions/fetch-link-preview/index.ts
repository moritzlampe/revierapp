import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const FETCH_TIMEOUT_MS = 5000
const MAX_BODY_BYTES = 500 * 1024 // 500 KB
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 Tage

/** URL normalisieren: lowercase host, trailing slash entfernen */
function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw)
    u.hostname = u.hostname.toLowerCase()
    u.protocol = u.protocol.toLowerCase()
    // Trailing slash nur vom Pfad entfernen (nicht bei root "/")
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.slice(0, -1)
    }
    return u.toString()
  } catch {
    return raw.trim()
  }
}

/** Ersten Match eines Regex im HTML zurückgeben */
function extractMeta(html: string, pattern: RegExp): string | null {
  const match = html.match(pattern)
  return match?.[1]?.trim() || null
}

/** Relative URL zu absoluter URL auflösen */
function resolveUrl(base: string, relative: string | null): string | null {
  if (!relative) return null
  try {
    return new URL(relative, base).toString()
  } catch {
    return relative
  }
}

/** HTML-Entities dekodieren (nur die häufigsten) */
function decodeEntities(text: string | null): string | null {
  if (!text) return null
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

/** OG/Meta-Tags aus HTML extrahieren */
function parsePreview(html: string, url: string) {
  // og:title → Fallback <meta name="title"> → Fallback <title>
  const ogTitle = extractMeta(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    || extractMeta(html, /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)
  const metaTitle = extractMeta(html, /<meta[^>]+name=["']title["'][^>]+content=["']([^"']+)["']/i)
    || extractMeta(html, /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']title["']/i)
  const htmlTitle = extractMeta(html, /<title[^>]*>([^<]+)<\/title>/i)
  const title = decodeEntities(ogTitle || metaTitle || htmlTitle)

  // og:description → Fallback meta description
  const ogDesc = extractMeta(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)
    || extractMeta(html, /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i)
  const metaDesc = extractMeta(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
    || extractMeta(html, /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)
  const description = decodeEntities(ogDesc || metaDesc)

  // og:image
  const ogImage = extractMeta(html, /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    || extractMeta(html, /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
  const image_url = resolveUrl(url, ogImage)

  // og:type
  const og_type = extractMeta(html, /<meta[^>]+property=["']og:type["'][^>]+content=["']([^"']+)["']/i)
    || extractMeta(html, /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:type["']/i)

  // og:site_name
  const site_name = decodeEntities(
    extractMeta(html, /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)
    || extractMeta(html, /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i)
  )

  // Favicon: <link rel="icon"> → Fallback /favicon.ico
  const faviconRel = extractMeta(html, /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i)
    || extractMeta(html, /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut )?icon["']/i)
  const favicon_url = resolveUrl(url, faviconRel || '/favicon.ico')

  return { title, description, image_url, favicon_url, site_name, og_type }
}

Deno.serve(async (req) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  try {
    const { url: rawUrl } = await req.json()
    if (!rawUrl || typeof rawUrl !== 'string') {
      return new Response(JSON.stringify({ error: 'url ist erforderlich' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const url = normalizeUrl(rawUrl)

    // Supabase-Client mit Service Role Key (darf in link_previews schreiben)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Cache prüfen
    const { data: cached } = await supabase
      .from('link_previews')
      .select('*')
      .eq('url', url)
      .single()

    if (cached) {
      const age = Date.now() - new Date(cached.fetched_at).getTime()
      if (age < CACHE_MAX_AGE_MS) {
        if (cached.fetch_failed) {
          return new Response(JSON.stringify({ error: 'Vorschau nicht verfügbar' }), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          })
        }
        return new Response(JSON.stringify({
          title: cached.title,
          description: cached.description,
          image_url: cached.image_url,
          favicon_url: cached.favicon_url,
          site_name: cached.site_name,
          og_type: cached.og_type,
        }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        })
      }
    }

    // HTML fetchen
    let html: string
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
        },
        signal: controller.signal,
        redirect: 'follow',
      })
      clearTimeout(timeout)

      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      // Body-Größe begrenzen
      const contentLength = response.headers.get('content-length')
      if (contentLength && parseInt(contentLength) > MAX_BODY_BYTES) {
        throw new Error('Body zu groß')
      }

      const buffer = await response.arrayBuffer()
      if (buffer.byteLength > MAX_BODY_BYTES) {
        html = new TextDecoder().decode(buffer.slice(0, MAX_BODY_BYTES))
      } else {
        html = new TextDecoder().decode(buffer)
      }
    } catch (fetchErr) {
      // Fehler cachen, damit nicht ständig retry
      await supabase.from('link_previews').upsert({
        url,
        title: null,
        description: null,
        image_url: null,
        favicon_url: null,
        site_name: null,
        og_type: null,
        fetched_at: new Date().toISOString(),
        fetch_failed: true,
      })

      return new Response(JSON.stringify({ error: 'Seite nicht erreichbar' }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    // HTML parsen
    const preview = parsePreview(html, url)

    // In DB cachen
    await supabase.from('link_previews').upsert({
      url,
      ...preview,
      fetched_at: new Date().toISOString(),
      fetch_failed: false,
    })

    return new Response(JSON.stringify(preview), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Interner Fehler' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})

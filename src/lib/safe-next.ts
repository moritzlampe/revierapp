/**
 * Prüft ein Weiterleitungsziel aus der URL (`?next=`).
 *
 * `next` ist Nutzereingabe und damit eine Vertrauensgrenze: ohne Prüfung wäre
 * es eine offene Weiterleitung. Der Wert wird an zwei Stellen ausgewertet —
 * serverseitig in `proxy.ts` und clientseitig nach dem Login in
 * `app/login/page.tsx`. Deshalb liegt die Prüfung hier und nicht doppelt:
 * Sicherheitslogik, die an zwei Orten gepflegt wird, driftet auseinander.
 *
 * Erlaubt sind ausschließlich repo-interne Pfade. Abgelehnt werden:
 *  - alles ohne führenden '/'   → 'https://evil.example'
 *  - '//host'                   → protokoll-relativ, wechselt den Host
 *  - '\' in jeder Form          → manche Parser lesen '\' als '/'
 *  - Steuerzeichen inkl. Tab/NL → '/<TAB>evil' umgeht naive Slash-Prüfungen
 *
 * Gegenprobe: `node --experimental-strip-types src/lib/safe-next.selftest.ts`
 */
export function safeNext(kandidat: string | null | undefined): string | null {
  if (!kandidat) return null
  if (!kandidat.startsWith('/')) return null
  if (kandidat.startsWith('//')) return null
  if (kandidat.includes('\\')) return null
  // Steuerzeichen (inkl. TAB, CR, LF, DEL) rauswerfen. Bewusst ohne Regex:
  // literale Steuerzeichen im Quelltext sind unsichtbar und fehleranfaellig.
  for (let i = 0; i < kandidat.length; i++) {
    const code = kandidat.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) return null
  }
  return kandidat
}

/** Zerlegt ein geprüftes Ziel in Pfad und Query — `url.pathname` verträgt kein '?'. */
export function splitNext(ziel: string): { pathname: string; search: string } {
  const i = ziel.indexOf('?')
  if (i === -1) return { pathname: ziel, search: '' }
  return { pathname: ziel.slice(0, i), search: ziel.slice(i) }
}

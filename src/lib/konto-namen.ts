/**
 * Ein Name zu einer Kennung — der Typ zu `konto_namen()` (Migration 115).
 *
 * **Warum es diese Datei gibt, und warum sie nur einen Typ enthält.** Der
 * Browser-Client der PWA wird ohne `<Database>` erzeugt
 * (`src/lib/supabase/client.ts`), eine RPC-Antwort kommt also als `any` an.
 * Ohne diesen Typ stünde die Annotation an fünf Aufrufstellen wörtlich
 * gleich da.
 *
 * **Keine Funktion, und das ist Absicht.** Nativ gibt es einen echten Helfer
 * (`quickhunt-native/src/lib/data/konto-namen.ts`); hier ginge das nicht:
 * einer der Aufrufer steht in einem `Promise.all` und braucht die rohe
 * `{ data, error }`-Form (`app/zentrale/jagden/[id]/page.tsx`). Ein Helfer,
 * den ein Aufrufer umgehen muss, ist ein Helfer, der driftet.
 *
 * ## Wofür die Funktion eintritt
 *
 * Bis zum 22.08.2026 gab `profiles_select_authenticated`
 * (`using (auth.role() = 'authenticated')`) jedem Angemeldeten jede
 * Profilzeile mit allen zwölf Spalten — `phone`, `jagdschein_nr`, `waffe`
 * und `kaliber` eingeschlossen (Backlog A-P1). Migration 116 nimmt sie weg;
 * danach sieht man nur noch Profile von Chat-Partnern und Mitjägern
 * derselben beigetretenen Jagd.
 *
 * **Neun Lesepfade in beiden Clients brauchten aber nur EINES davon: den
 * Namen.** Sechs Einladelisten und drei Auflöser, deren Beziehung weder Chat
 * noch Jagd ist — der Aussteller eines Begehungsscheins und der Prüfer eines
 * Standes. Die zweite Gruppe ist ein Befund der Fremdprüfung vom 22.08.2026:
 * **ein Begehungsschein IST die Beziehung, die keine gemeinsame Jagd
 * voraussetzt.** Das ist sein Zweck.
 *
 * `konto_namen()` ist SECURITY DEFINER und gibt genau `id` und
 * `display_name` heraus. **Wer dort eine Spalte ergänzt, macht sie für jeden
 * Angemeldeten über jedes Konto sichtbar** — das ist genau das Loch, das 116
 * schließt.
 *
 * **Ungepagt:** PostgREST kappt eine RPC-Antwort bei 1000 Zeilen, Bestand
 * sind 9 Konten (22.08.2026). Genannt, nicht behoben — fällig mit einer
 * Suche über die Konten.
 *
 * Volle Begründung: `quickhunt-native/docs/migrationen/115_konto_namen.md`.
 */
export type KontoName = { id: string; display_name: string }

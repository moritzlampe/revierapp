/**
 * Selbsttest für den Anonymisierungs-Riegel in `visibility.ts`. Ausführen:
 *
 *   node --experimental-strip-types src/lib/strecke/visibility.selftest.ts
 *
 * Relativer Import MIT `.ts` — der `@/`-Alias existiert unter blankem `node`
 * nicht. `tsconfig.json` schließt `**​/*.selftest.ts` aus, deshalb stört die
 * Endung `tsc` nicht.
 *
 * **Warum es diesen Test gibt, und warum genau JETZT.** Am 22.08.2026 wurde
 * `killer?.anonymize_kills ?? false` zu `?? true` — ein fehlendes Profil galt
 * bis dahin als „nicht anonym". Im Schwesterprojekt hat dieselbe Umkehrung
 * **keinen einzigen Test gebrochen**: der Fall war schlicht ungedeckt. Ein
 * Riegel ohne Probe ist eine Behauptung.
 *
 * **Erreichbar wird der Fall mit Migration 116**, die `profiles` auf
 * Chat-Partner und Mitjäger einengt: `kills_district_owner` lässt den
 * Revierbesitzer jede Erlegung in seinem Revier sehen, auch von einem
 * Schein-Inhaber, mit dem er weder Chat noch Jagd teilt — dessen Profil ist
 * dann nicht lesbar, `killer` also `undefined`.
 *
 * **Diese Datei ist die Kopie des nativen Tests**
 * (`quickhunt-native/src/lib/strecke/__tests__/visibility.test.ts`), weil die
 * beiden `visibility.ts` getrennte Kopien sind und unabhängig driften können.
 * Wer eine ändert, prüft die andere.
 */
import assert from 'node:assert/strict'

import { ANONYMOUS_NAME, maskKillForViewer } from './visibility.ts'
import type { Kill, KillerProfile, ViewerContext } from './visibility.ts'

const HEINRICH = 'heinrich-id'
const MORITZ = 'moritz-id'

const kill = (over: Partial<Kill> = {}): Kill =>
  ({ id: 'kill-1', reporter_id: HEINRICH, status: 'harvested', ...over }) as Kill

const viewer = (over: Partial<ViewerContext> = {}): ViewerContext =>
  ({ user_id: MORITZ, role: 'schuetze', anonymize_kills: false, ...over }) as ViewerContext

const killer = (over: Partial<KillerProfile> = {}): KillerProfile =>
  ({
    user_id: HEINRICH,
    display_name: 'Heinrich',
    anonymize_kills: false,
    ...over,
  }) as KillerProfile

// Der Riegel selbst: unlesbares Profil → anonym, nicht offen.
{
  const out = maskKillForViewer(kill(), undefined, viewer())
  assert.ok(out, 'ein unlesbares Profil darf das Stück nicht ganz verbergen')
  assert.equal(out.is_anonymized, true, 'unlesbares Profil muss als anonym gelten')
  assert.equal(out.display_name, ANONYMOUS_NAME)
}

// Gegenprobe: die zwei Zweige VOR der Anonymisierung dürfen nicht erfasst
// werden — sonst verlöre der Jagdleiter seine Sicht und der Melder sein
// eigenes Stück, sobald ein Profilabruf klemmt.
{
  const eigenes = maskKillForViewer(kill({ reporter_id: MORITZ }), undefined, viewer())
  assert.equal(eigenes?.is_anonymized, false, 'das eigene Stück bleibt im Klartext')

  const leiter = maskKillForViewer(kill(), undefined, viewer({ role: 'jagdleiter' }))
  assert.equal(leiter?.is_anonymized, false, 'der Jagdleiter sieht weiterhin alles')
}

// Positivkontrolle: ein LESBARES, nicht anonymes Profil bleibt im Klartext —
// sonst wäre der Test auch grün, wenn alles anonymisiert würde.
{
  const offen = maskKillForViewer(kill(), killer(), viewer())
  assert.equal(offen?.is_anonymized, false)
  assert.equal(offen?.display_name, 'Heinrich')
}

console.log('visibility: Anonymisierungs-Riegel haelt')

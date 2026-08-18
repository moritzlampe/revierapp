/**
 * Standgruppen — die Rechenregeln, Portal-Phase 4b.
 *
 * Eine Standgruppe ist eine benannte, wiederverwendbare Standmenge AM REVIER
 * (Migration 112, `QuickHunt_Konzept_Standgruppen_V1.md`). Sie ist die Vorlage,
 * aus der ein Treiben kopiert — sie verweist nicht, und ein Treiben zeigt nie
 * auf eine Gruppe zurück.
 *
 * Bewusst **ohne jeden Import**, wie `schreiben.ts`, `treiben.ts` und
 * `namen.ts`: dadurch mit `node --experimental-strip-types` prüfbar, ohne
 * Bundler, Pfad-Alias oder Netz (`standgruppen.selftest.ts`).
 */

/** Eine Gruppe (`standgruppen`) samt ihren Mitgliedern. */
export interface Standgruppe {
  id: string
  name: string
  /**
   * `map_objects.id` je Mitglied. Eine **Menge**, keine Reihenfolge: der
   * Primärschlüssel ist `(gruppe_id, map_object_id)`, es gibt kein `sequence`.
   * Die Anstell-Reihenfolge ist in `QuickHunt_Konzept_Treiben_V1.md` §9
   * vertagt — hier steht sie deshalb nicht als Array-Ordnung getarnt herum.
   */
  staende: string[]
}

/** Eine Zeile aus `standgruppen` samt eingebetteten Mitgliedern, wie PostgREST sie liefert. */
export interface StandgruppeZeile {
  id: string
  name: string
  standgruppen_staende: { map_object_id: string }[]
}

/**
 * DB-Zeilen → `Standgruppe`.
 *
 * **Deutlich kürzer als `ausZeilen()` bei den Treiben, und das ist der Grund,
 * warum dort nichts wiederverwendet wird:** `hunt_drive_stands` trägt zwei
 * einander ausschließende Fremdschlüssel (`map_object_id` /
 * `seat_assignment_id`), die dort in einen Schlüsselraum zusammenfallen müssen.
 * `standgruppen_staende` hat nur den einen — es gibt keine Ad-hoc-Sitze in einer
 * Revier-Vorlage, weil ein Ad-hoc-Sitz zu einer JAGD gehört.
 */
export function ausZeilen(zeilen: readonly StandgruppeZeile[]): Standgruppe[] {
  return zeilen.map((z) => ({
    id: z.id,
    name: z.name,
    staende: z.standgruppen_staende.map((s) => s.map_object_id),
  }))
}

/**
 * Der Ausgangszustand der Karte beim Öffnen einer Gruppe: welche Mitglieder
 * stehen als **angetippt** da?
 *
 * **Nur die WÄHLBAREN, und das ist der Fund der Schlusslesung vom 17.08.2026
 * (F1) — der Fix davor war halb.** Vorher seedete die Komponente
 * `new Set(g.staende)`, also alle Mitglieder. Ein Mitglied, dessen Objekt
 * jemand vom Hochsitz zum Parkplatz umgetypt hat, war damit **markiert**,
 * bekam auf der Karte aber keinen Marker (die zeigt nur Standtypen) — und
 * `gruppenDiff` entfernt nur, was NICHT markiert ist. Es blieb also still in
 * der Gruppe, unabwählbar, genau wie vorher. Die Trennung von „sichtbar" und
 * „wählbar" allein genügte nicht; sie muss auch beim Seeding gelten.
 *
 * **Warum die Funktion hier steht und nicht als Einzeiler im Bereich:** die
 * erste Fassung hatte sie als `new Set(g.staende)` inline, und genau deshalb
 * hat kein Test sie gesehen. Der Selbsttest prüfte `gruppenDiff` mit einer
 * Markierung, die die Komponente nie herstellt — eine korrekte Messung der
 * falschen Frage. Hier ist sie prüfbar.
 *
 * Papierkorb-Mitglieder fallen ebenfalls heraus (sie sind nicht wählbar), und
 * das ist im Ruhezustand folgenlos: `gruppenDiff` entfernt nur, was `sichtbar`
 * ist, und unsichtbar sind sie ja gerade.
 *
 * **Ein Fenster macht das auf, und es ist durch genau diesen Fix entstanden**
 * (Delta-Durchgang 17.08.2026, D6, `[niedrig]`): wird ein Stand aus dem
 * Papierkorb ZURÜCKGEHOLT, während der Editor offen steht, und trifft danach
 * ein Refresh ein, ist er plötzlich sichtbar UND unmarkiert — das nächste
 * Speichern nähme ihm die Mitgliedschaft, die der Papierkorb-Schutz gerade
 * bewahren soll. Vorher hielt ihn das fehlerhafte Voll-Seeding zufällig fest.
 *
 * **Der Tausch ist trotzdem eindeutig richtig:** der alte Zustand fing JEDES
 * umgetypte Mitglied, immer und unsichtbar; dieser hier braucht zwei Menschen
 * gleichzeitig, einen Restore und einen Refresh — und weist sich am Zähler als
 * `−N` aus, bevor jemand speichert. Ein garantierter stiller Fehler gegen ein
 * seltenes sichtbares Rennen.
 *
 * **Nicht geheilt, mit Grund:** die Markierung bei jeder Prop-Änderung
 * nachzuziehen hieße, dem Nutzer die Auswahl unter der Hand zu ändern — der
 * teurere Fehler. Fällig mit der Revisionsspalte, die auch C-33 braucht.
 */
export function markierungAus(
  staende: readonly string[],
  waehlbar: ReadonlySet<string>,
): Set<string> {
  return new Set(staende.filter((id) => waehlbar.has(id)))
}

/**
 * Ist der Name im Revier schon vergeben?
 *
 * **Ein UI-Gate vor einem echten Riegel, keine zweite Wahrheit.**
 * `UNIQUE (district_id, name)` aus Migration 112 hält ihn; das hier erspart dem
 * Nutzer nur die Rohmeldung `23505`.
 *
 * Verglichen wird **zeichengenau, nicht case-insensitiv** — genau wie der
 * Constraint. Ein `toLowerCase()` sperrte „sauberg" neben „Sauberg", obwohl die
 * DB beide nebeneinander erlaubt: ein Gate, das mehr verbietet als die Regel
 * dahinter, ist ein Fehler, kein Extra.
 *
 * Verglichen wird gegen den GESPEICHERTEN Wert, weil beim Anlegen auch der
 * gespeicherte Wert entsteht (Entscheidung Moritz 17.08.2026).
 *
 * **Kein `kandidat.length > 0`-Frühausstieg**, obwohl er im ersten Entwurf
 * stand: `standgruppen_name_nicht_leer` verbietet den leeren Namen in der DB,
 * kein `g.name` kann also leer sein — die Bedingung hätte nie ein anderes
 * Ergebnis erzeugt. Ein Prädikat, das nichts entscheidet, sieht beim nächsten
 * Lesen wie eine Prüfung aus.
 *
 * **Steht seit dem 18.08.2026 hier statt in der Komponente**, weil zwei Seiten
 * sie brauchen: das Anlegen in der Liste und das Umbenennen am Band der Karte.
 * Dieselbe Lehre wie bei `markierungAus` — was inline lebt, sieht kein Test.
 */
export function vergeben(
  gruppen: readonly Standgruppe[],
  kandidat: string,
  ausserId?: string,
): boolean {
  return gruppen.some((g) => g.id !== ausserId && g.name === kandidat)
}

/**
 * **Stufe 1 der Kartenanzeige: jeder Stand, der in IRGENDEINER Gruppe liegt**
 * (C-43, 18.08.2026).
 *
 * Moritz' Vorgabe war „grundlegend alle gleichzeitig sichtbar": vorher zeigte
 * die Karte genau die eine angewählte Gruppe, und bei den vier Söder-Mengen
 * hätte man viermal umschalten müssen, um zu sehen, welcher Stand schon vergeben
 * ist.
 *
 * **Die AKTIVE Gruppe steuert ihre GEZEIGTE Menge bei, nicht ihre gespeicherte,
 * und das ist der ganze Grund für diese Funktion.** Nimmt man überall
 * `g.staende`, blieben beim Bearbeiten die eben abgewählten Stände in Stufe 1
 * stehen und leuchteten weiter, während der Zähler daneben `−1` meldet — Karte
 * und Zähler behaupteten Verschiedenes über denselben Klick. Dieselbe Falle wie
 * bei `aktiveMenge` in der Spalte, nur eine Ebene tiefer: was die Karte zeigt,
 * muss zu dem passen, was daneben gezählt wird.
 *
 * `gezeigt` ist `null`, solange keine Gruppe angewählt ist; dann zählt schlicht
 * jede gespeicherte Menge.
 *
 * **Steht hier und nicht als Einzeiler in der Komponente** — dieselbe Lehre wie
 * bei `markierungAus` und `vergeben`: die erste Fassung war ein inline
 * `flatMap`, und genau deshalb hätte kein Test sie je gesehen.
 *
 * **Ein Refresh-Fenster bleibt offen, benannt statt geheilt** (Fremdprüfung
 * Codex 18.08.2026, Q3): nach dem Löschen einer Gruppe setzt `zeige(null)` die
 * Auswahl sofort zurück, die `gruppen`-Prop trägt die gelöschte Zeile aber bis
 * zum Eintreffen der Serverdaten weiter. Ihre exklusiven Stände leuchten
 * deshalb ein bis zwei Sekunden nach, obwohl die Gruppe weg ist.
 *
 * Nicht behoben, weil der Fix teurer wäre als der Fehler: eine Menge gelöschter
 * IDs mitzuführen wäre der Grabstein-Mechanismus aus `revierkarte.tsx`
 * (`geschrieben: Record<string, Punkt | null>`) — ein zweiter Zustand, der mit
 * dem ersten widerspruchsfrei gehalten werden muss, für ein Fenster, das von
 * selbst heilt und in dem die DB die ganze Zeit recht hat. Dieselbe Abwägung
 * wie bei E-R8. Fällig, wenn es je auffällt.
 */
export function alleStaende(
  gruppen: readonly Standgruppe[],
  aktiveId: string | null,
  gezeigt: ReadonlySet<string> | null,
): Set<string> {
  return new Set(
    gruppen.flatMap((g) => (g.id === aktiveId && gezeigt ? [...gezeigt] : g.staende)),
  )
}

/** Was an `standgruppen_staende` geschrieben werden muss, um `markiert` zu erreichen. */
export interface GruppenAenderung {
  /** `map_object_id` je zu entfernender Mitgliedschaft. */
  entfernen: string[]
  /** `map_object_id` je neu anzulegender Mitgliedschaft. */
  legen: string[]
}

/**
 * Ein DIFF, kein delete-all-insert — hier aus einem anderen Grund als bei den
 * Treiben.
 *
 * Dort schützt der Diff den Sitzplan (`hunt_drive_stands.participant_id`), der
 * an der Zeile hängt. Eine Mitgliedschaft hier trägt nichts außer `created_at` —
 * **verlustfrei wäre ein delete-all-insert deshalb trotzdem nicht**, und genau
 * das behauptete der erste Entwurf dieses Absatzes. Er löschte nämlich auch die
 * Mitgliedschaften, die der Nutzer gar nicht sehen kann:
 *
 * **`sichtbar` ist der eigentliche Riegel, und der Fall ist real, nicht
 * konstruiert.** Es gibt einen Papierkorb für Kartenobjekte (Migrationen
 * 072/073). Ein weich gelöschter Stand behält seine Mitgliedschaft — der
 * Fremdschlüssel ist `on delete cascade`, und ein Soft-Delete löscht keine
 * Zeile —, verschwindet aber von der Karte: an der Produktion gemessen
 * (17.08.2026) blenden alle SELECT-Policies auf `map_objects` Zeilen mit
 * `deleted_at` aus, auch für den Revierbesitzer. Ohne diesen Riegel räumte der
 * erste Speichervorgang die Mitgliedschaft still weg — und wer den Stand später
 * aus dem Papierkorb zurückholte, bekäme ihn ohne seine Gruppen zurück.
 *
 * **`sichtbar` trägt BEIDE Zweige, und `vorhanden` ist kein zweiter Riegel —
 * das ist per Mutationsprobe belegt und stand hier zuerst falsch.** Der erste
 * Kommentar behauptete, `vorhanden` müsse gegen ALLE Mitglieder prüfen (statt
 * nur gegen die sichtbaren), sonst liefe ein erneutes Anlegen in den
 * Primärschlüssel `(gruppe_id, map_object_id)` und damit in `23505`. Die
 * Mutation `new Set(staende.filter((id) => sichtbar.has(id)))` ließ den
 * Selbsttest jedoch GRÜN — und zwar zu Recht: `legen` verlangt selbst
 * `sichtbar.has(id)`, ein sichtbares Mitglied liegt also in beiden Fassungen
 * von `vorhanden`. Die beiden Ausdrücke sind nicht verschieden stark, sie sind
 * gleich. `new Set(staende)` bleibt, weil es die kürzere Form ist, nicht weil
 * es die sicherere wäre.
 *
 * **Dasselbe gilt für `standDiff()` in `jagden/[id]/treiben.ts`**, wo derselbe
 * Kommentar dieselbe Behauptung trägt (dort an `UNIQUE (drive_id,
 * map_object_id)`). Nicht mitgeändert — fremder Schnitt, und der Code ist
 * richtig, nur seine Begründung nicht. Liegt als Notiz für die nächste
 * Treiben-Sitzung bei.
 *
 * **Was der Diff NICHT kann** — wörtlich dieselbe Grenze wie bei den Treiben: er
 * trägt keine Revision. Zwei Browser-Tabs auf derselben Gruppe führen zu einem
 * MERGE, nicht zu einem Konflikt, und zwar in beide Richtungen (zwei Tabs, die
 * je einen anderen Stand abwählen, hinterlassen eine Gruppe, in der beiden ein
 * Stand fehlt). Getragen aus denselben zwei Gründen: es ist normale
 * Nebenläufigkeit, und ein echter Compare-and-Swap braucht eine Revisionsspalte
 * — also eine Migration, Anker 2 und Moritz' Freigabe.
 *
 * Bei einer Gruppe wiegt das leichter als bei einem Treiben: verloren geht eine
 * Mitgliedschaft, die man nachklickt, kein Schütze auf einem Stand.
 */
export function gruppenDiff(
  staende: readonly string[],
  markiert: ReadonlySet<string>,
  sichtbar: ReadonlySet<string>,
): GruppenAenderung {
  const vorhanden = new Set(staende)

  return {
    entfernen: staende.filter((id) => sichtbar.has(id) && !markiert.has(id)),
    legen: [...markiert].filter((id) => !vorhanden.has(id) && sichtbar.has(id)),
  }
}

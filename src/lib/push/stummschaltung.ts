/**
 * Die Entscheidung, ob ein stummgeschalteter Empfänger eine Push trotzdem
 * bekommt (CN-201).
 *
 * **Warum das eine eigene Funktion ist und keine Bedingung in der Route:**
 * sie hat vier Eingänge und drei Ausgänge, und zwei davon kamen erst aus der
 * Bauplan-Prüfung dazu. Am 18.09.2026 waren in diesem Projekt **die vier
 * schwersten von 72 Findings Folgen eigener Fixes** — Regeln, die sich beim
 * Nachbessern vermischt hatten, an Stellen, die kein Test erreichte. Diese
 * Datei ist die Antwort darauf: die Regel steht an einer Stelle, und der
 * Selbsttest daneben wird rot, wenn jemand sie wieder vermischt.
 *
 * **Die Regel in einem Satz:** stumm ist stumm — ausser der Empfänger ist
 * selbst Jagdleiter, oder der Absender ist Jagdleiter einer Jagd, der dieser
 * Empfänger beigetreten ist.
 */

export type PushEntscheidung = {
  /** Hat dieser Empfänger diesen Chat für sich stummgeschaltet? */
  istStumm: boolean
  /**
   * Ist der EMPFÄNGER Jagdleiter oder Ersteller der Jagd dieses Chats?
   *
   * Ohne diesen Eingang verpasst ein Jagdleiter, der den Chat am Vorabend
   * stummgeschaltet hat, am nächsten Morgen die Meldung „krank geschossen"
   * eines Schützen — der Durchstich unten ist absenderseitig und hilft ihm
   * nicht (Bauplan-Schlusslesung 19.09.2026, B8).
   */
  empfaengerIstLeiter: boolean
  /** Ist der ABSENDER Jagdleiter oder Ersteller der Jagd dieses Chats? */
  absenderIstLeiter: boolean
  /**
   * Ist der Empfänger dieser Jagd selbst beigetreten (`status='joined'`)?
   *
   * ⛔ **Dieser Eingang ist der Riegel, nicht der Titel des Absenders.**
   * `chat_groups_update` trägt kein `with_check` und auf `chat_groups` liegt
   * kein Trigger (gemessen 19.09.2026): der Ersteller einer beliebigen
   * Gruppe darf deren `hunt_id` auf eine selbst angelegte leere Jagd setzen
   * (`hunts.district_id` ist nullable, 092 greift dort nicht) — und wäre
   * damit „Jagdleiter" seines eigenen Stammtisch-Chats.
   *
   * Wer der Jagd BEIGETRETEN ist, hat den Jagdleiter akzeptiert. Eine
   * erfundene leere Jagd hat keine Teilnehmer; der erschlichene Titel trägt
   * dann keinen einzigen Empfänger.
   */
  empfaengerIstJagdteilnehmer: boolean
}

/** `true` = die Push geht raus. */
export function darfPushEmpfangen(e: PushEntscheidung): boolean {
  // Nicht stumm: nichts zu entscheiden. Der häufigste Fall, zuerst.
  if (!e.istStumm) return true

  // Der Empfänger führt diese Jagd. Er darf sich Geplauder abschalten, aber
  // nicht die Meldungen, für die er verantwortlich ist.
  if (e.empfaengerIstLeiter) return true

  // Der Durchstich: der Jagdleiter erreicht seine Leute auch im stummen Chat —
  // aber nur die, die dieser Jagd beigetreten sind.
  if (e.absenderIstLeiter && e.empfaengerIstJagdteilnehmer) return true

  return false
}

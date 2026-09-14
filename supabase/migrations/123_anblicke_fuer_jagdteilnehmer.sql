-- 123 — Anblicke einer Jagd sind für ihre Teilnehmer sichtbar
--        (und die drei Schreibriegel, ohne die diese Freigabe ein Loch wäre)
--
-- ANLASS (14.09.2026). Moritz, auf die Frage, wo die Gruppe einen gemeldeten
-- Anblick sehen soll: „unter Strecke noch die Option Anblicke anzuzeigen?"
-- und zur Stufung: „bau jetzt gerne so das es alle sehen aber wir wollen das
-- später einstellbar machen für den nutzer / Jagdleiter."
--
-- Bis heute trägt `wild_events` GENAU EINE Policy — `wild_events_owner_all`
-- (036), `using (user_id = auth.uid())` für alle Kommandos. Ein Anblick ist
-- strikt privat: Johann könnte seinen Elch festhalten, Henner und Frank
-- sähen nichts davon, obwohl alle drei danebenstanden.
--
-- ═══════════════════════════════════════════════════════════════════════
-- WARUM DIESE MIGRATION VIER TEILE HAT UND NICHT EINEN
-- ═══════════════════════════════════════════════════════════════════════
--
-- Der erste Entwurf war die Policy allein. Die Fremdprüfung des
-- UNAPPLIZIERTEN Textes (Codex, 14.09.2026) fand drei Wege, sie zu
-- missbrauchen — und alle drei sind dieselbe Wurzel, die in AGENTS.md steht:
--
--   „Leitet sich eine Berechtigung aus einer Tabellenzeile ab, ist die Frage
--    nicht «wer darf lesen», sondern «wer darf diese Zeile SCHREIBEN»."
--
-- Die Lesefreigabe ist harmlos. Was sie gefährlich macht, ist die UNGEPRÜFTE
-- SCHREIBSEITE, die es schon gibt — und die erst dadurch erreichbar wird,
-- dass fremde Anblick-IDs und Jagd-Zuordnungen sichtbar werden.
--
-- ⛔ DESHALB STEHT ALLES IN EINER DATEI. Wer sie aufteilt, kann die Policy
-- ohne die Riegel applizieren — und genau das ist am 08.09.2026 bei 120
-- passiert, wo von zwei geplanten Teilen nur einer appliziert wurde und die
-- andere Lücke bis heute offen steht.
--
-- ── R1 (Codex [high]) — FREMDLÖSCHUNG ÜBER DIE KILL-VERKNÜPFUNG ──────────
-- `kills.wild_event_id` ist nullable, hat keinen Default und wird von keinem
-- Riegel geschützt (gemessen 14.09.2026). Ein Teilnehmer kann also eine
-- FREMDE `wild_events.id` als `wild_event_id` seiner EIGENEN Erlegung
-- eintragen und diese Erlegung anschließend löschen. `kills_reporter`
-- erlaubt beides. `sync_wild_event_for_kill()` (037) löscht daraufhin als
-- SECURITY DEFINER die Zeile allein anhand `OLD.wild_event_id` — ohne
-- Eigentümer- und ohne Typprüfung.
-- **Der Defekt besteht heute schon. Was fehlt, ist die Kenntnis der ID —
-- und genau die liefert diese Policy systematisch.**
--
-- ── R2 (Codex [medium]) — UMTYPISIERUNG DER EIGENEN SPIEGELZEILE ─────────
-- `wild_events_owner_all` erlaubt dem Eigentümer JEDE Änderung, auch an
-- `type`. Der Melder kann seine Kill-Spiegelzeile also auf `'sighting'`
-- setzen; sie passiert danach diese Policy — samt Ort, Zeitpunkt und
-- Melder-ID —, obwohl die Jagd auf `kill_visibility = 'leader_only'` steht.
-- **Die Stufung wäre über die Spiegeltabelle umgangen, und zwar lautlos.**
--
-- ── R3 (Codex [medium]) — EINSCHLEUSEN IN FREMDE JAGDEN ──────────────────
-- Beim Schreiben verlangt `wild_events_owner_all` nur `user_id = auth.uid()`;
-- `hunt_id` ist frei setzbar, und der Fremdschlüssel prüft keine
-- Mitgliedschaft. Ein AUSGESCHIEDENER Teilnehmer mit bekannter Jagd-ID kann
-- daher eigene Anblicke dieser Jagd zuordnen. Ohne Policy blieben sie
-- privat; mit ihr erscheinen sie bei allen Verbliebenen — samt beliebigem
-- Text und Foto.
--
-- ═══════════════════════════════════════════════════════════════════════
--
-- ⛔ `type = 'sighting'` IN DER POLICY IST EBENFALLS EIN RIEGEL.
-- `wild_events` enthält NICHT nur Anblicke: `sync_wild_event_for_kill()`
-- spiegelt JEDE Erlegung als Zeile mit `type = 'kill'` hinein. Für
-- Erlegungen gilt die ABGESTUFTE Sichtbarkeit aus `hunts.kill_visibility`,
-- durchgesetzt von drei eigenen Policies auf `kills`. Ohne diese
-- Einschränkung wäre jede gespiegelte Erlegung für jeden Teilnehmer lesbar.
-- R2 ist die Kehrseite desselben Riegels: er nützt nichts, solange der
-- Eigentümer `type` selbst umschreiben darf.
--
-- WARUM NICHT AN `hunts.kill_visibility` GEKOPPELT. Die Stufen dort regeln,
-- wer ERLEGTES WILD sieht. Ein Anblick ist keine Strecke, und ihn zu zeigen
-- ist sein ganzer Zweck; eine Jagd mit verdeckter Strecke würde sonst auch
-- Johanns Elch verstecken, obwohl alle drei ihn gesehen haben. Die Policy
-- bekommt trotzdem die BAUFORM von `kills_visibility_all` — dieselbe
-- Hilfsfunktion, dieselbe Gestalt —, damit eine spätere Stufung genau hier
-- ansetzt und nichts umbauen muss (Backlog CN-156).
--
-- `to authenticated` IST PFLICHT, nicht Kosmetik: der Ausdruck ruft eine
-- Funktion, und Policy-Ausdrücke laufen mit den Rechten des Aufrufers. Ohne
-- die Rollenangabe würde aus einer leeren Liste für `anon` ein hartes
-- `42501` — der Gast-Layer liefe in einen Serverfehler statt in eine leere
-- Antwort (gemessen an `map_objects`, 069).
--
-- ⚠ NEBENWIRKUNG, DIE MAN WISSEN MUSS: DIE FOTOS GEHEN MIT AUF.
-- `app_photos_read` (083) erlaubt den Pfad `<uid>/wild_event/<id>/…`, wenn
-- `exists (select 1 from public.wild_events w where w.id::text = …)` — und
-- dieser Ausdruck läuft als INVOKER. Wer die Zeile lesen darf, findet damit
-- auch die Datei. Das ist gewollt (die Gruppe soll das Elchbild sehen), es
-- gehört nur gesehen, bevor es auffällt.
--
-- ⚠ WAS DIE POLICY NICHT LEISTET, und das bleibt so:
-- Die freigegebene Zeile trägt `location` und `user_id`. Der Client maskiert
-- den Namen bei `consent = 'anon'` (`maskKillForViewer`-Regel), aber wer die
-- REST-Schnittstelle direkt abfragt, liest Ort und Melder. Das ist
-- zeichengleich die Lage bei `kills.position` und damit keine neue
-- Entscheidung — nur eine, die hier zum zweiten Mal getroffen wird.

begin;

-- ── Teil 1: die Lesefreigabe ────────────────────────────────────────────

drop policy if exists wild_events_hunt_member on public.wild_events;
create policy wild_events_hunt_member on public.wild_events
  for select
  to authenticated
  using (
    type = 'sighting'
    and hunt_id in (select public.get_my_joined_hunt_ids())
  );

-- ── Teil 2: R2 + R3 — `type` eingefroren, `hunt_id` nur auf eigene Jagden ─

create or replace function public.pruefe_wild_event_zuordnung()
returns trigger
language plpgsql
-- KEIN security definer: die Mitgliedschaftsprüfung MUSS mit den Rechten des
-- Aufrufers laufen. `participants_own_row` zeigt ihm seine eigene Zeile —
-- mehr braucht er nicht, und mehr soll er hier nicht sehen.
set search_path = public, pg_temp
as $$
begin
  -- R2: `type` steht mit der Zeile fest. Ein Anblick wird nie zur Erlegung
  -- und eine Erlegung nie zum Anblick — der zweite Weg ist der Angriff, der
  -- erste hat schlicht keinen Sinn. Ohne diesen Satz ist die
  -- `type = 'sighting'`-Bedingung der Policy wertlos.
  if tg_op = 'UPDATE' and new.type is distinct from old.type then
    raise exception 'Die Art eines Wildereignisses steht mit der Meldung fest'
      using errcode = 'insufficient_privilege';
  end if;

  -- R3: nur ANBLICKE werden hier geprüft, weil der Spiegel jede Erlegung als
  -- SECURITY DEFINER hereinschreibt — eine Prüfung für alle Typen träfe ihn
  -- und nicht den Angreifer. Zusätzlich lässt 090 für Erlegungen `invited`
  -- genügen, diese Prüfung verlangt `joined`: pauschal angewandt wiese sie
  -- die Spiegelzeilen eingeladener Gäste ab.
  --
  -- ⚠ RICHTIGSTELLUNG (Schlusslesung 14.09.2026, F3): die frühere Fassung
  -- berief sich auf „für Erlegungen ist die Herkunft dreifach geriegelt
  -- (087/090/092)". **Diese Riegel sitzen auf `kills`, nicht hier.** Ein
  -- Client kann per `wild_events_owner_all` sehr wohl eine Zeile mit
  -- `type = 'kill'` (oder `shot`/`miss`/`wounded`/`fallwild`) und beliebiger
  -- `hunt_id` direkt anlegen; dieser Trigger kehrt bei jedem Typ ausser
  -- `sighting` um, und niemand prüft die Mitgliedschaft.
  -- **Folgenlos, solange die Policy oben NUR `sighting` öffnet** — die Zeile
  -- bleibt privat, der Melder fälscht allein seinen eigenen Zähler.
  -- ⛔ **Wer je einen zweiten Typ für Mitglieder freigibt — CN-156 ist der
  -- naheliegende Anlass —, öffnet damit R3 durch die Hintertür.** Diese
  -- Prüfung muss dann von „am Typ" auf „an der Herkunft"
  -- (`pg_trigger_depth()`) umgestellt werden, samt der `invited`-Ausnahme
  -- aus 090.
  if new.type <> 'sighting' or new.hunt_id is null then
    return new;
  end if;

  -- Unverändert gelassene Zuordnung nicht erneut prüfen: sonst schlüge ein
  -- späteres UPDATE fehl, nur weil der Melder die Jagd inzwischen verlassen
  -- hat — seine alte Zeile soll er weiter pflegen dürfen.
  if tg_op = 'UPDATE' and new.hunt_id is not distinct from old.hunt_id then
    return new;
  end if;

  if not exists (
    select 1 from public.hunt_participants p
     where p.hunt_id = new.hunt_id
       and p.user_id = new.user_id
       and p.status = 'joined'
  ) and not exists (
    select 1 from public.hunts h
     where h.id = new.hunt_id
       and h.creator_id = new.user_id
  ) then
    raise exception 'Zu dieser Jagd gehoerst du nicht'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

-- ⚠ ALPHABETISCH NACH `trg_wild_events_katalog` (122) — BEFORE-Trigger
-- feuern in Namensreihenfolge (die 096-Falle). Das ist hier richtig: 122
-- SETZT `species` aus dem Katalog, dieser hier PRÜFT `type` und `hunt_id`.
-- Die beiden fassen verschiedene Spalten an; wer je einen dritten baut,
-- prüfe die Reihenfolge erneut.
drop trigger if exists trg_wild_events_zuordnung on public.wild_events;
create trigger trg_wild_events_zuordnung
  before insert or update on public.wild_events
  for each row execute function public.pruefe_wild_event_zuordnung();

revoke execute on function public.pruefe_wild_event_zuordnung()
  from public, anon, authenticated, service_role;

-- ── Teil 3: R1a — `kills.wild_event_id` ist eine SERVER-Zuordnung ────────

create or replace function public.kills_wild_event_id_ist_server_sache()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Beim Anlegen bestimmt der Client sie NIE. `sync_wild_event_for_kill()`
  -- läuft AFTER INSERT und trägt danach die Zeile ein, die es selbst
  -- angelegt hat. Ein mitgeschickter Wert wird still verworfen statt
  -- abgewiesen: er ist immer ein Fehler, aber nie einer, der den Melder
  -- etwas angeht — und ein abgewiesener INSERT kostete eine Erlegung.
  if tg_op = 'INSERT' then
    new.wild_event_id := null;
    return new;
  end if;

  -- Beim Ändern ist genau EIN Übergang erlaubt: NULL → Wert. Jeder andere —
  -- auf eine andere Zeile oder zurück auf NULL — wäre das Umhängen der
  -- Verknüpfung, und darauf beruht R1.
  --
  -- ⚠ RICHTIGSTELLUNG (Schlusslesung 14.09.2026, F1): der erlaubte Übergang
  -- ist NICHT „der Spiegel selbst". Dieser Trigger kann den Spiegel von
  -- einem Client nicht unterscheiden — wer eine `kills`-Zeile mit
  -- `wild_event_id IS NULL` erwischt, darf die Verknüpfung frei setzen.
  -- Heute gibt es keine solche Zeile (gemessen: 0 von 3), der INSERT-Weg
  -- lässt kein NULL sichtbar werden (AFTER-Trigger feuern im selben
  -- Statement), und der Weg über `ON DELETE SET NULL` ist durch genau
  -- diesen Riegel zu. Erreichbar bleibt er damit nur für `service_role`.
  -- **Teil 4 ist deshalb nicht die zweite Linie, sondern die tragende** —
  -- er verhindert den Schaden, auch wenn die Verknüpfung falsch steht.
  -- Wer den Rest schliessen will: `pg_trigger_depth()` unterscheidet das
  -- Client-Statement (Tiefe 1) vom Spiegel (≥ 2). Bewusst NICHT gebaut —
  -- ein Riegel gegen einen Weg, den heute niemand hat, gegen den Preis
  -- eines weiteren Prüflaufs.
  -- ⚠ NEBENWIRKUNG, gefunden von der Schlusslesung (F2), nicht vom Entwurf:
  -- `kills.wild_event_id` trägt `on delete set null` (036). Eine
  -- Referential Action läuft als gewöhnliches UPDATE und FEUERT DIESEN
  -- TRIGGER. Wer künftig eine `wild_events`-Zeile löscht, auf die noch eine
  -- `kills`-Zeile zeigt, bekommt deshalb `42501` — mit einer Meldung, die
  -- von einer Erlegung spricht, obwohl er ein Wildereignis gelöscht hat.
  -- **Das ist hier der gewollte Ausgang** (es schliesst den SET-NULL-Weg aus
  -- F1), aber es ist eine Verhaltensänderung: heute ginge die Löschung durch
  -- und der Spiegel legte die Zeile sofort neu an. Gemessen: KEIN Client in
  -- beiden Repos löscht `wild_events` (0 Treffer), und die Kontolöschung
  -- scheitert schon vorher an `kills_reporter_id_fkey` (NO ACTION).
  if old.wild_event_id is not null
     and new.wild_event_id is distinct from old.wild_event_id then
    raise exception 'Die Verknuepfung einer Erlegung steht fest'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_kills_wild_event_id on public.kills;
create trigger trg_kills_wild_event_id
  before insert or update on public.kills
  for each row execute function public.kills_wild_event_id_ist_server_sache();

revoke execute on function public.kills_wild_event_id_ist_server_sache()
  from public, anon, authenticated, service_role;

-- ── Teil 4: R1b — der Spiegel greift nur noch nach seinen eigenen Zeilen ──

-- Zweite Verteidigungslinie. Teil 3 verhindert, dass eine fremde Zeile je
-- verknüpft wird; hier wird sichergestellt, dass eine dennoch verknüpfte
-- fremde Zeile nicht gelöscht oder überschrieben werden KANN. Die Bedingung
-- steht in der WHERE-Klausel statt in einer Exception, und das ist Absicht:
-- eine Exception im Aufräumpfad blockierte das Löschen der eigenen Erlegung.
-- Wer eine fremde Zeile verknüpft hat, löscht damit einfach nichts.
--
-- Der Rest der Funktion ist ZEICHENGLEICH zu 037 — nur die beiden
-- WHERE-Klauseln sind enger.
create or replace function public.sync_wild_event_for_kill()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  new_event_id uuid;
begin
  if tg_op = 'DELETE' then
    if old.wild_event_id is not null then
      delete from wild_events
       where id = old.wild_event_id
         and type = 'kill'
         and user_id = old.reporter_id;
    end if;
    return old;
  end if;

  if new.wild_event_id is null then
    insert into wild_events
      (user_id, hunt_id, type, species, occurred_at, location, created_at)
    values (
      new.reporter_id,
      new.hunt_id,
      'kill'::wild_event_type,
      new.wild_art::text,
      coalesce(new.erlegt_am, new.created_at),
      new.position::geography,
      new.created_at
    )
    returning id into new_event_id;

    update kills set wild_event_id = new_event_id where id = new.id;
    return new;
  end if;

  if tg_op = 'UPDATE' and (
       new.hunt_id     is distinct from old.hunt_id
    or new.wild_art    is distinct from old.wild_art
    or coalesce(new.erlegt_am, new.created_at)
         is distinct from coalesce(old.erlegt_am, old.created_at)
    or new.position    is distinct from old.position
  ) then
    update wild_events set
      hunt_id     = new.hunt_id,
      species     = new.wild_art::text,
      occurred_at = coalesce(new.erlegt_am, new.created_at),
      location    = new.position::geography
    where id = new.wild_event_id
      and type = 'kill'
      and user_id = new.reporter_id;
  end if;

  return new;
end;
$$;

-- Wiederholt nach dem `create or replace` (Schlusslesung F4, 090-Muster).
-- Gemessen ist, dass `create or replace` die bestehende ACL erhält — der
-- Entzug aus 082 gilt also weiter. Die Zeile steht trotzdem hier: sie kostet
-- nichts und trägt, falls die Funktion je neu angelegt statt ersetzt wird.
revoke execute on function public.sync_wild_event_for_kill()
  from public, anon, authenticated, service_role;

commit;

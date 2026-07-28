-- 065: Der Standbezug räumt vollständig auf
--
-- BEFUND (28.07.2026, am Gerät beobachtet und auf der Produktion nachgemessen):
-- Der Trigger aus 062 löschte beim Treiben-Ende NUR Bezüge auf Ständen, die zu
-- eben diesem Treiben gehören. Ein Bezug auf einem Stand AUSSERHALB des
-- Treibens überlebte damit jedes Treiben-Ende — und mangels eigener Kante auch
-- das Jagd-Ende.
--
-- Das traf ausgerechnet den Fall, für den der Standbezug gebaut wurde: „Baum
-- auf dem Hochsitz, ich sitze woanders" (Standbezug §5). Ein abweichend
-- besetzter Stand liegt per Definition außerhalb der Planung, also außerhalb
-- des Treibens. Sein Bezug stand unbegrenzt, bis der Mensch selbst auscheckte
-- oder GPS zurückkam. Wer keinen Empfang hat, checkt aber gerade manuell ein —
-- für den kam GPS nie zurück.
--
-- Warum das zählt: der Nachbarschütze entscheidet an „besetzt", ob er in diese
-- Richtung schießen darf. Ein stehengebliebener Bezug sagt ihm nicht mehr „da
-- ist jemand", sondern „da war mal jemand". Eine Karte, die in diese Richtung
-- lügt, ist schlimmer als keine.
--
-- ENTSCHEID (Moritz, 28.07.2026): eine Regel statt zweier —
--   neues Treiben = neue Besetzung, jeder checkt neu ein.
-- GPS-Nutzer merken davon nichts, der Geofence setzt sie binnen Sekunden
-- zurück. Manuell Eingecheckte tippen einmal — dieselben Kosten, die Stände
-- INNERHALB des Treibens seit 062 schon tragen. Die Ungleichbehandlung
-- verschwindet, nicht die Reibung.
--
-- Ein ZEITABLAUF bleibt ausgeschlossen (Standbezug L7): geräumt wird an einer
-- Kante, die etwas bedeutet, nie nach Ablauf einer Uhr.
--
-- SICHER, WEIL: `hunt_drives_one_active_per_hunt` (Unique-Index auf hunt_id
-- WHERE status='active') lässt höchstens ein aktives Treiben je Jagd zu. Das
-- verbreiterte DELETE kann deshalb keinem parallel laufenden Treiben seine
-- Belegung wegräumen — es gibt keins.
--
-- Additiv und rückwärtskompatibel: beide Clients teilen die DB, keiner muss
-- mitziehen. Idempotent: nur CREATE OR REPLACE und DROP ... IF EXISTS.

-- 1) Treiben-Ende räumt die ganze Jagd, nicht nur die Stände des Treibens.
create or replace function public.clear_stand_bezug_on_drive_end()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.hunt_stand_bezug b
  where b.hunt_id = new.hunt_id;
  return new;
end;
$$;

-- 2) Jagd-Ende bekommt eine eigene Kante. Nicht redundant zu (1): eine Jagd
--    ohne Treiben — Ansitz, Pirsch — feuert den Treiben-Trigger nie, und ihre
--    Bezüge blieben sonst nach dem Ende der Jagd stehen.
create or replace function public.clear_stand_bezug_on_hunt_end()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.hunt_stand_bezug b
  where b.hunt_id = new.id;
  return new;
end;
$$;

-- DER NAME IST LASTTRAGEND, NICHT KOSMETIK — nicht umbenennen ohne diesen
-- Absatz zu lesen (Codex, 28.07.):
-- Postgres feuert gleichartige Trigger in ALPHABETISCHER Reihenfolge. Dieser
-- muss NACH `trg_hunts_close_drives` laufen ('c' < 's'), damit beide Wege ihre
-- Sperren in derselben Reihenfolge nehmen: erst hunt_drives, dann
-- hunt_stand_bezug.
--
-- Sonst entsteht ein Sperrzyklus: Transaktion A beendet ein Treiben (sperrt
-- hunt_drives, will dann hunt_stand_bezug), Transaktion B beendet die Jagd
-- (sperrte mit einem früher einsortierten Namen zuerst hunt_stand_bezug und
-- wollte dann über close_drives an hunt_drives). Postgres bricht eine der
-- beiden mit einem Deadlock ab. Der Fall ist selten, aber nicht theoretisch:
-- die Auto-Beendigung einer Jagd läuft nicht im selben Prozess wie der
-- Jagdleiter, der gerade ein Treiben abbläst.
drop trigger if exists trg_hunts_clear_stand_bezug on public.hunts;
drop trigger if exists trg_hunts_stand_bezug_clear on public.hunts;

create trigger trg_hunts_stand_bezug_clear
after update of status on public.hunts
for each row
when (
  new.status in ('completed', 'auto_completed')
  and old.status is distinct from new.status
)
execute function public.clear_stand_bezug_on_hunt_end();

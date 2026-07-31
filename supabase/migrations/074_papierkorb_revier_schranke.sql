-- 074 — Das Revier als Pflichtparameter der Papierkorb-Funktionen
--
-- Aufgefallen beim Umbau der vier Löschknöpfe auf `kartenobjekt_loeschen()`.
--
-- In `app/zentrale/revierkarte.tsx` steht der Löschpfad heute so:
--
--     .from('map_objects').delete().eq('id', id).eq('district_id', revierId)
--
-- und darüber ein langer Kommentar, warum die zweite Bedingung dort das
-- schwerste Gewicht hat: **RLS hält eine verirrte Objekt-ID nicht auf.** Sie
-- deckt alle Reviere desselben Besitzers, also auch Brockwinel mit den echten
-- Pilotdaten. Bei einem UPDATE wäre die Folge ein falscher Wert, bei einem
-- DELETE eine gelöschte Zeile im falschen Revier.
--
-- Eine RPC, die nur `p_id` nimmt, hätte diese Schranke ersatzlos gestrichen —
-- der Umbau auf den Papierkorb hätte also nebenbei eine Sicherung entfernt, die
-- jemand bewusst gesetzt hat. Statt sie im Client nachzubauen (und dort in drei
-- von vier Fällen wieder zu vergessen), wandert sie in die Funktion: dann gilt
-- sie überall, und man kann sie nicht mehr weglassen, ohne es zu merken.
--
-- Deshalb PFLICHTPARAMETER, nicht optional mit Default. Ein `default null`
-- wäre bequemer und wäre genau das Loch: der eine Aufrufer, der ihn vergisst,
-- fällt nicht auf, sondern löscht ungeschützt. So scheitert er stattdessen
-- laut — der Aufruf findet keine passende Signatur.
--
-- Nicht beim Kompilieren, wohlgemerkt: PostgREST löst die Funktion zur Laufzeit
-- über die JSON-Schlüssel auf, ein vergessener Parameter fällt also erst beim
-- Request auf (PGRST202). Laut genug, aber es ersetzt nicht, jeden der vier
-- Aufrufer einmal anzufassen. (Codex-Review, 31.07.2026)
--
-- Der Papierkorb macht das Ganze übrigens nicht überflüssig, nur milder: ein
-- Objekt, das im falschen Revier verschwindet, ist jetzt wiederherstellbar
-- statt weg. „Wiederherstellbar" ist trotzdem nicht „harmlos" — es verschwindet
-- still, und niemand sucht in einem Papierkorb, von dem er nichts weiß.

-- ---------------------------------------------------------------------------
-- Die alten Fassungen müssen weg, nicht ersetzt werden
-- ---------------------------------------------------------------------------
-- `create or replace` kann keine Signatur ändern. Bliebe die einstellige
-- Fassung stehen, gäbe es beide nebeneinander — und der Aufruf mit einem
-- Argument träfe weiter die ungeschützte. Also erst droppen.
--
-- Gefahrlos: seit 073 (heute appliziert) ruft sie noch kein Client auf, die
-- vier Löschknöpfe löschen bis zu ihrem Umbau weiter hart.
drop function if exists public.kartenobjekt_loeschen(uuid);
drop function if exists public.kartenobjekt_wiederherstellen(uuid);

-- ---------------------------------------------------------------------------
-- Wegwerfen
-- ---------------------------------------------------------------------------
-- `p_district_id` ist eine reine Gegenprobe, keine zweite Berechtigung: die
-- Berechtigung beantwortet weiter kann_kartenobjekt_verwalten() an einer
-- Stelle. Hier wird nur nachgesehen, ob der Aufrufer das Objekt meint, das er
-- zu meinen glaubt.
create or replace function public.kartenobjekt_loeschen(p_id uuid, p_district_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update map_objects o
     set deleted_at = now()
   where o.id = p_id
     and o.district_id is not distinct from p_district_id
     and o.deleted_at is null
     and kann_kartenobjekt_verwalten(p_id);

  -- Eine Meldung für alle Fälle: eine genauere Auskunft verriete einem Fremden,
  -- ob eine id existiert. `is not distinct from` statt `=`, damit ein Ad-hoc-
  -- Objekt (district_id null) mit p_district_id => null ansprechbar bleibt;
  -- mit `=` wäre jeder Vergleich gegen null unbekannt und die Zeile für immer
  -- unlöschbar. Heute gibt es keine solchen Objekte, die Funktion soll aber
  -- nicht davon abhängen.
  if not found then
    raise exception 'Objekt nicht gefunden oder keine Berechtigung'
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Zurückholen
-- ---------------------------------------------------------------------------
-- Dieselbe Schranke, derselbe Grund: der Papierkorb wird pro Revier gelesen
-- (`papierkorb_kartenobjekte(district)`), also gehört zu jedem Zurückholen auch
-- das Revier, aus dessen Papierkorb es kommt.
create or replace function public.kartenobjekt_wiederherstellen(p_id uuid, p_district_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update map_objects o
     set deleted_at = null
   where o.id = p_id
     and o.district_id is not distinct from p_district_id
     and o.deleted_at is not null
     and kann_kartenobjekt_verwalten(p_id);

  if not found then
    raise exception 'Objekt nicht im Papierkorb oder keine Berechtigung'
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

revoke execute on function public.kartenobjekt_loeschen(uuid, uuid)          from public, anon;
revoke execute on function public.kartenobjekt_wiederherstellen(uuid, uuid)  from public, anon;
grant  execute on function public.kartenobjekt_loeschen(uuid, uuid)          to authenticated;
grant  execute on function public.kartenobjekt_wiederherstellen(uuid, uuid)  to authenticated;

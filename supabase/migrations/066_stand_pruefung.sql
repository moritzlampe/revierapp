-- 066: Standprüfung und Schadensmeldung am Revierobjekt
--
-- ANLASS (Moritz, 28.07.2026): „in nativ besser geht: schäden dokumentieren
-- bzw. prüfung der hochsitze vor einer jagd, auch markieren wenn sie heile
-- sind als 'geprüft am … von …'."
--
-- Das ist die eine Revierarbeit, die auf dem Handy BESSER aufgehoben ist als
-- am Schreibtisch: man steht davor. Alles andere an der Revierpflege
-- (Objekte anlegen, Grenzen zeichnen, Treiben planen) kann das Portal
-- mindestens genauso gut — das hier nicht.
--
--
-- WARUM EIN LOG UND KEIN STATUSFELD AUF map_objects
--
-- Die verlangte Auskunft ist „geprüft am … von …", und das ist eine Historie,
-- keine Eigenschaft. Ein überschriebenes Feld beantwortet „wann zuletzt" nur
-- bis zur nächsten Prüfung; die Frage „wer hat den Sauberg vor der letzten
-- Drückjagd abgegangen" wäre danach nicht mehr zu beantworten.
--
-- Es kostet nichts: „der aktuelle Zustand" ist ein `order by checked_at desc
-- limit 1` je Objekt, und genau dafür steht der Index unten.
--
--
-- WARUM DREI WERTE UND NICHT ZWEI
--
-- 'ok' und 'mangel' allein wären die bequeme Wahl. 'gesperrt' ist der Wert,
-- der den Unterschied macht: er ist das einzige, das der Jagdleiter beim
-- EINTEILEN sehen muss. Ein Hochsitz mit gebrochener Sprosse ist kein
-- Schönheitsfehler, sondern ein Sturzrisiko — und wer ihn einteilt, schickt
-- jemanden hinauf.
--
-- Die Sperrlogik (Zuweisung tatsächlich verhindern) ist bewusst NICHT Teil
-- dieser Migration. Erst die Aussage, dann die Konsequenz: eine Sperre, die
-- niemand gesetzt hat, blockiert nur.
--
--
-- WARUM KEIN UPDATE UND KEIN DELETE
--
-- Ein Prüfeintrag wird nicht korrigiert, sondern überholt. Ein versehentliches
-- 'gesperrt' hebt man auf, indem man 'ok' nachlegt — nicht, indem man
-- Geschichte löscht. Deshalb gibt es unten nur Policies für SELECT und INSERT;
-- ohne Policy ist die Operation unter RLS verboten, das ist die Durchsetzung.
--
-- Die CASCADE auf map_objects ist die einzige Ausnahme und richtig so: ist das
-- Objekt weg, ist seine Prüfgeschichte gegenstandslos.

create table if not exists public.map_object_checks (
  id            uuid primary key default uuid_generate_v4(),
  map_object_id uuid not null references public.map_objects(id) on delete cascade,
  checked_by    uuid not null references public.profiles(id),
  checked_at    timestamptz not null default now(),
  status        text not null check (status in ('ok', 'mangel', 'gesperrt')),
  note          text
);

-- Die eine Abfrage, die diese Tabelle beantworten muss: „letzter Stand je
-- Objekt". DESC im Index, damit das Sortieren entfällt.
create index if not exists map_object_checks_object_time_idx
  on public.map_object_checks (map_object_id, checked_at desc);

alter table public.map_object_checks enable row level security;

-- Lesen darf, wer das Objekt sieht. Der Subselect trägt die ganze Regel: die
-- RLS von map_objects gilt darin mit, also erbt die Prüfung automatisch
-- dieselbe Sichtbarkeit wie der Stand, an dem sie hängt. Eine eigene,
-- nachgebaute Bedingung wäre eine zweite Wahrheit, die beim nächsten
-- map_objects-Policy-Wechsel still auseinanderläuft.
drop policy if exists map_object_checks_read on public.map_object_checks;
create policy map_object_checks_read on public.map_object_checks
  for select using (
    exists (select 1 from public.map_objects o where o.id = map_object_id)
  );

-- Schreiben darf derselbe Kreis, und das ist Absicht: die Prüfung wird
-- delegiert („geh du mal den Sauberg ab"). Sie auf den Revierbesitzer zu
-- begrenzen hieße, dass genau der sie machen muss, der sie verteilt.
--
-- `checked_by = auth.uid()` ist der Riegel dagegen, eine Prüfung unter fremdem
-- Namen einzutragen — „geprüft von" muss tragen, sonst ist die Zeile wertlos.
drop policy if exists map_object_checks_insert on public.map_object_checks;
create policy map_object_checks_insert on public.map_object_checks
  for insert with check (
    checked_by = auth.uid()
    and exists (select 1 from public.map_objects o where o.id = map_object_id)
  );

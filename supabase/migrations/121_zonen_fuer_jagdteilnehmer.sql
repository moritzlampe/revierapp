-- 121_zonen_fuer_jagdteilnehmer.sql
--
-- Wer an einer Jagd teilnimmt, darf die Zonen des zugehoerigen Reviers LESEN.
--
-- ANLASS, gemessen am 09.09.2026:
-- `zones` trug bis hierher genau zwei Policies —
--   zones_district_owner   (ALL)    -> nur der Revierbesitzer
--   zones_jes_select       (SELECT) -> nur Inhaber eines AKTIVEN Begehungs-
--                                      scheins, dessen zone_ids die Zone nennt
-- Fuer Jagdteilnehmer gab es KEINE. `map_objects` hat seine
-- `map_objects_hunt_member` dagegen seit 003 (verschaerft in 048). Wer an
-- einer Jagd teilnimmt, sah deshalb die Staende des Reviers, aber keine Zonen.
--
-- DIE FALLE IST DIE RICHTUNG DES FEHLERS: kein 42501, sondern NULL ZEILEN.
-- Eine leere Zonenliste liest sich als "dieses Revier hat keine Zonen" (S4) —
-- der Defekt bleibt unsichtbar, solange niemand weiss, dass Zonen angelegt
-- wurden. Genau deshalb ist er jahrelang niemandem aufgefallen: bisher hat
-- kein Revier mit Zonen eine Jagd mit Gaesten gehabt.
--
-- Gefunden hat ihn die Fremdpruefung des Bauplans zur Polen-Jagd, nicht der
-- Bauplan selbst. Der Bauplan belegte, dass die Jagd-Karte Zonen ZEICHNET —
-- nicht, dass die Gaeste sie LESEN duerfen. Zwischen beidem lag der Ausfall.
--
-- DRINGLICHKEIT: die Jagdreise vom 13.-17.09.2026 nach Ermland-Masuren stellt
-- die drei polnischen Jagdbezirke (obw. low. 106, 108, 142) als Zonen dar,
-- weil sie nicht zusammenhaengen und `districts.boundary` nur ein einzelnes
-- Polygon aufnimmt. Ohne diese Policy saehen die drei Gaeste eine leere Karte.
--
-- FORM: wortgleich zum Muster aus 048, damit beide Policies dieselbe
-- Vorstellung von "Teilnehmer" haben. `get_my_joined_hunt_ids()` filtert auf
-- status = 'joined' — eine blosse Einladung genuegt also nicht (088er Absicht).
--
-- ADDITIV: die Policy nimmt niemandem etwas weg. RLS verknuepft mehrere
-- SELECT-Policies mit ODER; Besitzer und Scheininhaber behalten ihren Zugang
-- unveraendert.
--
-- BEWUSST NUR SELECT. Zonen anlegen, aendern und loeschen bleibt beim
-- Revierbesitzer (zones_district_owner). Ein Gast, der eine Zone verschieben
-- koennte, verschoebe die Grenze, an der sich alle anderen orientieren.
--
-- ⚠ ABWEICHUNG VOM 048er MUSTER, gefunden von der Fremdpruefung (F7):
-- die Jagd muss vom REVIERBESITZER angelegt sein (`h.creator_id = d.owner_id`).
--
-- Ohne diesen Zusatz waere die Policy eine Rechteausweitung. Der Trigger
-- `hunt_revier_muss_erlaubt_sein` (092) laesst eine Jagd zu, wenn der
-- Ersteller ENTWEDER Revierbesitzer ist ODER einen aktiven, gueltigen
-- Begehungsschein auf das Revier hat — er prueft dabei NICHT die `zone_ids`
-- des Scheins. Ein Schein, der bewusst auf EINE Zone beschraenkt ist, haette
-- damit gereicht:
--
--   eigene Jagd auf das Revier anlegen  ->  selbst auf 'joined' setzen
--   ->  ueber diese Policy SAEMTLICHE Zonen des Reviers lesen
--
-- Genau die Beschraenkung, fuer die `zones_jes_select` die `zone_ids` fuehrt,
-- waere so ausgehebelt worden — und zwar durch eine Zeile, die der Angreifer
-- selbst schreiben darf. Das ist die S3-Bauform: "leitet sich eine
-- Berechtigung aus einer Tabellenzeile ab, ist die Frage nicht, wer lesen
-- darf, sondern wer diese Zeile schreiben darf".
--
-- DER PREIS, benannt: legt ein Jagdleiter MIT Schein (aber ohne Revier) eine
-- Jagd an und laedt Gaeste ein, sehen diese Gaeste keine Zonen. Das ist
-- hinnehmbar — der Fall ist heute keiner, und die enge Fassung laesst sich
-- spaeter aufweiten, wenn jemand ihn braucht. Umgekehrt waere es ein stiller
-- Verlust einer bestehenden Schranke.

-- BEWUSST KEINE Aenderung an `zones_jes_select`. Deren zone_ids-Bedingung ist
-- enger als diese hier (sie nennt einzelne Zonen), und ein Schein soll weiter
-- auf einzelne Zonen begrenzt werden koennen. Die zwei Wege stehen
-- nebeneinander, weil sie verschiedene Fragen beantworten.

drop policy if exists "zones_hunt_member" on zones;

create policy "zones_hunt_member" on zones for select
  using (
    district_id in (
      select h.district_id
        from hunts h
        join districts d on d.id = h.district_id
       where h.id in (select public.get_my_joined_hunt_ids())
         and h.district_id is not null
         -- Der Zusatz gegenueber dem 048er Muster, und der Grund steht im Kopf:
         -- die Jagd muss vom REVIERBESITZER stammen.
         and h.creator_id = d.owner_id
    )
  );

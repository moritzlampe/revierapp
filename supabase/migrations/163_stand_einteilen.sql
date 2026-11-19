-- 163: Schuetzen ohne Treiben auf Staende einteilen (CN-566).
-- Begruendung und Pruefkette: quickhunt-native/docs/migrationen/163_stand_einteilen.md,
-- Bauplan quickhunt-native/docs/konzepte/QuickHunt_Bauplan_Einteilen_ohne_Treiben_V1.md (V2, R6/R7).
--
-- ANLASS (Moritz 19.11.2026, Jagd Barnbruch): „man muss eigentlcih auch
-- schuetzen ohne treiben verteilen koennen ... wenn es nur ein treiben gibt
-- oder gar keins (dann ist es eins)". Einteilen geht heute nur im
-- Besetzen-Modus eines Treibens. Die jagdweite Sitzordnung scheidet aus: sie
-- haengt an `user_id`, Gaeste ohne Konto lassen sich dort nicht einteilen.
--
-- DIE AENDERUNG: eine RPC `stand_einteilen`, die in EINER Transaktion
--   - kein Treiben  -> „Treiben 1" anlegt und den Stand aufnimmt,
--   - ein Treiben (geplant) -> den fehlenden Stand ergaenzt,
--   - ein Treiben (laufend) -> nur Staende umsetzt, die schon drin sind,
-- und dann ueber `treiben_stand_umsetzen` (141) den Schuetzen setzt.
-- Ein Advisory-Lock je Jagd haelt zwei gleichzeitige Aufrufe auseinander:
-- ohne ihn legen zwei Jagdleiter im selben Augenblick zwei „Treiben 1" an
-- (Codex F14 Punkt 6; der Live-Fall Barnbruch 19.11. zeigte, wie das aussieht).
--
-- SECURITY INVOKER: RLS von `hunt_drives`/`hunt_drive_stands` (056, 089)
-- entscheidet weiter, wer schreiben darf (Ersteller, zugesagter Jagdleiter).
-- Die Funktion fuegt nur Riegel hinzu, keine Rechte.
--
-- RIEGEL (jeder mit eigener Meldung, die App liest `message`):
--   genau_ein_stand      p_objekt XOR p_sitz
--   keine_teilnahme      Aufrufer ist an der Jagd nicht beteiligt — er saehe
--                        die Treiben nicht (hunt_drives hat keine
--                        Ersteller-SELECT-Policy) und legte sonst ein zweites an
--   jagd_beendet         completed / auto_completed / gesichert
--   teilnahme_fremd      p_teilnahme gehoert nicht zu dieser Jagd (oder nicht
--                        invited/joined)
--   stand_fremd          Kartenobjekt nicht im Revier der Jagd bzw. Ad-hoc-Sitz
--                        nicht an dieser Jagd
--   mehrere_treiben      zwei oder mehr Treiben: Einteilen im Treiben (App)
--   treiben_beendet      das einzige Treiben ist beendet
--   keine_berechtigung   das einzige Treiben ist sichtbar, aber nicht sperrbar
--                        (kein UPDATE-Recht) oder eben geloescht (42501)
--   laeuft_stand_fehlt   das einzige Treiben laeuft, der Stand ist nicht drin
--                        (Standmenge eines laufenden Treibens bleibt fest, wie
--                        „Staende aendern" in der App)
--
-- NEBENLAEUFIGKEIT: der Advisory-Lock haelt zwei Aufrufe dieser Funktion
-- auseinander; die Treiben-Zeile wird FOR NO KEY UPDATE gelesen, damit ein
-- gleichzeitiges Starten/Beenden nicht zwischen Lesen und Schreiben faellt.
-- Der Jagdstatus wird NICHT gesperrt (Jagdleiter duerfen `hunts` nicht immer
-- schreiben, ein FOR UPDATE saehe die Zeile dann nicht): endet die Jagd genau
-- in diesem Augenblick, steht hoechstens ein Stand mehr in einem geplanten
-- Treiben einer beendeten Jagd — hingenommen.
--
-- WAS GLEICH BLEIBT: `treiben_stand_umsetzen`, `stand_umsetzen`, alle Policies,
-- alle Trigger. Der manuelle Anlegeweg (DrivesSheet, Portal) nimmt den Lock
-- nicht — er legt bewusst ein weiteres Treiben an.
--
-- p_teilnahme NULL = Zuweisung entfernen: nur, wenn der Stand schon im
-- Treiben steht; sonst gibt es nichts zu entfernen, die Funktion legt dann
-- nichts an und liefert NULL.
--
-- Rueckgabe: die id der `hunt_drive_stands`-Zeile (oder NULL, s. oben).

begin;

create function public.stand_einteilen(
  p_hunt      uuid,
  p_objekt    uuid,
  p_sitz      uuid,
  p_teilnahme uuid
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_status    public.hunt_status;
  v_gesichert timestamptz;
  v_revier    uuid;
  v_zahl      integer;
  v_treiben   uuid;
  v_t_status  public.drive_status;
  v_zeile     uuid;
begin
  if (p_objekt is null) = (p_sitz is null) then
    raise exception 'genau_ein_stand' using errcode = '22023';
  end if;

  -- Erst die Teilnahme, dann der Lock: wer nicht beteiligt ist, sperrt
  -- niemanden (Bauregel 152, Schlusslesung F13).
  if not exists (select 1 from public.get_my_teilnahme_hunt_ids() t(id) where t.id = p_hunt) then
    raise exception 'keine_teilnahme' using errcode = '42501';
  end if;

  -- Vor jedem Lesen des Treiben-Stands: wer zweiter ist, liest NACH dem ersten.
  perform pg_advisory_xact_lock(hashtextextended('cn566:' || p_hunt::text, 0));

  select h.status, h.gesichert_am, h.district_id
    into v_status, v_gesichert, v_revier
    from public.hunts h
   where h.id = p_hunt;
  if not found then
    raise exception 'keine_teilnahme' using errcode = '42501';
  end if;
  if v_status in ('completed', 'auto_completed') or v_gesichert is not null then
    raise exception 'jagd_beendet' using errcode = 'P0001';
  end if;

  if p_teilnahme is not null and not exists (
    select 1 from public.hunt_participants hp
     where hp.id = p_teilnahme
       and hp.hunt_id = p_hunt
       and hp.status in ('invited', 'joined')
  ) then
    raise exception 'teilnahme_fremd' using errcode = '22023';
  end if;

  if p_objekt is not null and not exists (
    select 1 from public.map_objects mo
     where mo.id = p_objekt
       and mo.district_id = v_revier
  ) then
    raise exception 'stand_fremd' using errcode = '22023';
  end if;
  if p_sitz is not null and not exists (
    select 1 from public.hunt_seat_assignments sa
     where sa.id = p_sitz
       and sa.hunt_id = p_hunt
       and sa.seat_type = 'adhoc'
  ) then
    raise exception 'stand_fremd' using errcode = '22023';
  end if;

  select count(*) into v_zahl from public.hunt_drives d where d.hunt_id = p_hunt;

  if v_zahl = 0 then
    if p_teilnahme is null then
      return null;
    end if;
    insert into public.hunt_drives (hunt_id, name, sequence)
    values (p_hunt, 'Treiben 1', 1)
    returning id into v_treiben;
    v_t_status := 'pending';
  elsif v_zahl = 1 then
    -- FOR UPDATE (Codex A B1): Starten/Beenden schreibt dieselbe Zeile und wartet
    -- bis zum Ende dieser Transaktion — oder wir warten und lesen den neuen Status.
    -- Der Advisory-Lock bindet diese Wege nicht ein, die Zeilensperre schon.
    -- NO KEY UPDATE statt UPDATE (Schlusslesung F2): haelt Starten, Beenden
    -- und Loeschen genauso auf, laesst aber FK-Pruefungen (KEY SHARE) durch —
    -- sonst Deadlock mit einem gleichzeitigen „Staende aendern".
    select d.id, d.status into v_treiben, v_t_status
      from public.hunt_drives d
     where d.hunt_id = p_hunt
       for no key update;
    -- Gesehen (count = 1), aber nicht sperrbar: ohne UPDATE-Recht auf das
    -- Treiben (Schuetze, Gruppenleiter) liefert FOR UPDATE unter RLS keine
    -- Zeile — oder es wurde eben geloescht. Beides: nicht einteilbar, neu laden.
    if not found then
      raise exception 'keine_berechtigung' using errcode = '42501';
    end if;
    -- Nach der Sperre neu zaehlen (Schlusslesung F8): der manuelle Anlegeweg
    -- nimmt den Advisory-Lock nicht und kann zwischen Zaehlen und Sperren ein
    -- zweites Treiben angelegt haben.
    if (select count(*) from public.hunt_drives d where d.hunt_id = p_hunt) <> 1 then
      raise exception 'mehrere_treiben' using errcode = 'P0001';
    end if;
    if v_t_status = 'completed' then
      raise exception 'treiben_beendet' using errcode = 'P0001';
    end if;
  else
    raise exception 'mehrere_treiben' using errcode = 'P0001';
  end if;

  select ds.id into v_zeile
    from public.hunt_drive_stands ds
   where ds.drive_id = v_treiben
     and (ds.map_object_id = p_objekt or ds.seat_assignment_id = p_sitz);

  if v_zeile is null then
    -- Erst „nichts zu entfernen", dann die Sperre des laufenden Treibens (Codex A B2).
    if p_teilnahme is null then
      return null;
    end if;
    if v_t_status = 'active' then
      raise exception 'laeuft_stand_fehlt' using errcode = 'P0001';
    end if;
    insert into public.hunt_drive_stands (drive_id, map_object_id, seat_assignment_id)
    values (v_treiben, p_objekt, p_sitz)
    returning id into v_zeile;
  end if;

  perform public.treiben_stand_umsetzen(v_zeile, p_teilnahme);

  -- Ein Ereignis fuer die anderen Geraete (Schlusslesung F1): `hunt_drive_stands`
  -- steht nicht in der Realtime-Publication, nur `hunt_drives`. Seit das einzige
  -- Treiben Banner und Geofence bestimmt, muss eine Einteilung dort ankommen. Ein
  -- leeres UPDATE erzeugt das Ereignis; die Trigger auf `hunt_drives` feuern nur
  -- bei UPDATE OF status.
  update public.hunt_drives set name = name where id = v_treiben;

  return v_zeile;
end;
$$;

revoke all on function public.stand_einteilen(uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.stand_einteilen(uuid, uuid, uuid, uuid) to authenticated;

commit;

-- 161: Die Freigabe der Staende gibt auch die Revierkarte frei (CN-539).
-- Begruendung und Pruefkette: quickhunt-native/docs/migrationen/161_revierkarte_mit_freigabe.md
--
-- ANLASS (gemessen 17.11.2026): Schuetzen sehen Jagdzonen und Einrichtungen
-- des Reviers unter `alles`/`umkreis` erst ab 0 Uhr Berlin am Jagdtag
-- (`jagd_ist_offen`, 141 V12). Ein Revier ohne Grenze (Polen: Zonen statt
-- Grenze, CN-510) zeigt ihnen bis dahin keine Flaeche — die App waehlt dann die
-- deutsche Topo statt des polnischen Luftbilds und bietet keine Offline-Karte
-- an. Die Gaeste der Polen-Jagd koennten die Karte nicht vor der Abreise laden.
--
-- DIE AENDERUNG (Moritz 17.11.2026: „das ich als jagdleiter mit staende
-- freigeben einfach auch die karte mit freigebe die sie sonst am jagdtag
-- sehen", Ablauf bestaetigt): Das Revierfenster ist offen am Jagdtag (wie
-- bisher) ODER nach der Freigabe der Staende (`hunts.map_open`), solange die
-- Jagd noch nicht begonnen hat (`draft`, `scheduled`) und ihr Termin nicht
-- verstrichen ist (Ende wie `jagd_ist_offen`). Laufend gilt ohnehin
-- `jagd_ist_offen`. Nach dem Ende (`completed`, `auto_completed`) gilt die
-- Freigabe NICHT mehr — sonst saehe ein Schuetze die Revierkarte jeder
-- beendeten, einmal freigegebenen Jagd auf Dauer (141 V7 bliebe offen).
--
-- Neu: `revier_offen(status, von, bis, map_open)`, INVOKER, EXECUTE fuer
-- niemanden (wie `jagd_ist_offen`, 141) — die eine Stelle der Regel.
-- `zonen_in_sicht` (Zweig `alles`) und `objekt_in_sicht` (Zweige `alles` und
-- `umkreis`) rufen sie statt `jagd_ist_offen`. Sonst Zeichen fuer Zeichen die
-- Ruempfe wie live (gemessen 17.11.2026 per pg_get_functiondef; objekt_in_sicht
-- = 159, zonen_in_sicht = 141): SECURITY DEFINER, STABLE, search_path mit
-- pg_temp am Ende, Signatur und Rueckgabe unveraendert.
--
-- WAS GLEICH BLEIBT:
-- - `eigener` und `treiber` bekommen keine Zonen und keine Einrichtungen
--   (ausser dem eigenen Stand und den immer sichtbaren Typen, 159).
-- - Zonen gibt es weiterhin nur unter `alles` und fuer die Leitung (141 b).
-- - Der 121-Riegel (Jagd des Revierbesitzers oder Objekt vom Schein des
--   Erstellers gedeckt) und der Teilnahme-Riegel (`joined`) bleiben.
-- - Die Staende selbst (Sitzordnung, Treiben-Staende) haengen weiter an
--   `staende_offen` (146), das `map_open` schon heute liest.
--
-- WER ES SONST RUFT: Policies `zones_hunt_member` und `map_objects_hunt_member`;
-- `stand_ort_im_treiben` und `sitz_ort_der_jagd` (155) fragen `objekt_in_sicht`
-- fuer Stand-Objekte und pruefen die Freigabe zusaetzlich ueber
-- `stand_zeile_in_sicht` (146/153). Unter `alles` war `stand_zeile_in_sicht`
-- nach der Freigabe schon offen, `objekt_in_sicht` bis zum Jagdtag noch nicht —
-- dieser zweite Riegel faellt jetzt mit der Freigabe: der Ort eines Fremdeintrags
-- am Stand ist ab der Freigabe lesbar statt ab dem Jagdtag (Codex 161 M5). Das
-- ist dieselbe Sicht, die die freigegebene Karte zeigt.
-- `jagd_ist_offen` hat ausser diesen beiden Funktionen keinen Aufrufer
-- (gemessen 17.11.2026) und bleibt unveraendert.
--
-- WIRKUNG BEIM APPLIZIEREN (gemessen 17.11.2026): zwei geplante Gruppenjagden
-- tragen `map_open = true` (Polanow - Jagdgeschwader, Milomlyn (Oberland)),
-- beide `alles`. Ihre zugesagten Schuetzen sehen ab dem Commit die Zonen und
-- Einrichtungen. Eine beendete Jagd mit `map_open = true` bleibt zu.
--
-- RECHTE: `create or replace` behaelt die ACL der beiden Ja/Nein-Funktionen
-- (live: postgres + authenticated). Der Block am Ende haelt den Stand fest und
-- entzieht namentlich (REVOKE FROM PUBLIC allein genuegt bei Supabase nicht).

begin;

create function public.revier_offen(p_status hunt_status,
                                    p_von timestamptz,
                                    p_bis timestamptz,
                                    p_map_open boolean)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select public.jagd_ist_offen(p_status, p_von, p_bis)
      or (p_map_open
          and p_status in ('draft', 'scheduled')
          -- Die Freigabe endet mit dem Termin wie das Jagdtag-Fenster: eine
          -- verstrichene, nie beendete Jagd bleibt nicht offen (Codex 161 M2).
          -- Ohne Ende bis Mitternacht nach dem Jagdtag (141 d); ohne Termin
          -- bis zum Statuswechsel.
          and (p_von is null
               or now() <= coalesce(
                             p_bis,
                             (date_trunc('day', p_von at time zone 'Europe/Berlin')
                              + interval '1 day') at time zone 'Europe/Berlin')));
$$;

create or replace function public.zonen_in_sicht(p_district_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1
      from public.hunts h
      join public.districts d on d.id = h.district_id
      join public.hunt_participants m
        on m.hunt_id = h.id
       and m.user_id = auth.uid()
       and m.entfernt_am is null
       and (m.status = 'joined'
            or (m.status = 'left' and m.joined_at is not null))
     where h.district_id = p_district_id
       and h.creator_id = d.owner_id
       and case public.sicht_stufe(h.id)
             when 'leitung' then true
             when 'alles' then
                  m.status = 'joined'
                  and public.revier_offen(h.status, h.scheduled_for,
                                          h.scheduled_until, h.map_open)
             else false
           end
  );
$$;

create or replace function public.objekt_in_sicht(p_object_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1
      from public.map_objects o
      join public.hunts h on h.district_id = o.district_id
      join public.districts d on d.id = h.district_id
      join public.hunt_participants m
        on m.hunt_id = h.id
       and m.user_id = auth.uid()
       and m.entfernt_am is null
       and (m.status = 'joined'
            or (m.status = 'left' and m.joined_at is not null))
     where o.id = p_object_id
       -- Auch hier, obwohl die Policy es prueft: sonst verriete die RPC
       -- eine Papierkorb-ID (Schlusslesung Delta D3, 130 F5).
       and o.deleted_at is null
       and (h.creator_id = d.owner_id
            or public.schein_deckt_objekt(h.creator_id, o.district_id,
                                          o.id, o.position))
       and (
             public.sicht_stufe(h.id) = 'leitung'
          or (m.status = 'joined'
              and (o.type in ('notfall_treffpunkt', 'parkplatz',
                              'treffpunkt', 'unterkunft')
                   or case public.sicht_stufe(h.id)
                        when 'alles' then
                             public.revier_offen(h.status, h.scheduled_for,
                                                 h.scheduled_until, h.map_open)
                        when 'umkreis' then
                             public.revier_offen(h.status, h.scheduled_for,
                                                 h.scheduled_until, h.map_open)
                             and public.ort_in_umkreis(h.id, o.position)
                        else false
                      end))
          or exists (select 1
                       from public.staende_der_teilnahme(m.id) e
                      where e.objekt_id = o.id)
           )
  );
$$;

revoke all on function public.revier_offen(hunt_status, timestamptz, timestamptz, boolean)
  from public, anon, authenticated, service_role;

revoke all on function public.zonen_in_sicht(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.zonen_in_sicht(uuid) to authenticated;

revoke all on function public.objekt_in_sicht(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.objekt_in_sicht(uuid) to authenticated;

commit;

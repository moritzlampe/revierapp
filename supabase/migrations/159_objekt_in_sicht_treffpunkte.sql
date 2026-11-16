-- 159: Treffpunkt und Unterkunft sehen zugesagte Jagdteilnehmer immer — wie
-- Notfall-Treffpunkt und Parkplatz (CN-511).
-- Begruendung und Pruefkette: quickhunt-native/docs/migrationen/159_objekt_in_sicht_treffpunkte.md
--
-- VORAUSSETZUNG: 158 ist appliziert UND committet. Der Rumpf nennt die neuen
-- Enum-Werte; `create function` validiert ihn (check_function_bodies) und
-- scheitert in derselben Transaktion wie das ADD VALUE an 55P04.
--
-- DIE AENDERUNG: in `objekt_in_sicht` (141, live wortgleich, gemessen
-- 16.11.2026 per pg_get_functiondef) die Liste der „immer sichtbaren" Typen
-- fuer `joined` um 'treffpunkt' und 'unterkunft' erweitert. Sonst Zeichen fuer
-- Zeichen der Rumpf aus 141 — Sicherheitsattribute, search_path mit pg_temp am
-- Ende, Rueckgabe und Signatur unveraendert.
--
-- WAS DARAUS FOLGT (Moritz 16.11.2026, Ablauf Punkt 4): wer einer Jagd
-- zugesagt hat (`joined`), sieht Treffpunkt und Unterkunft des Reviers in jedem
-- Jagdstatus und jeder Sichtstufe — auch Wochen vor der Jagd und nach ihrem
-- Ende, solange die Teilnahme besteht. Genau so sieht er heute Parkplatz und
-- Notfall-Treffpunkt. Der Typ-Sonderzweig gilt nur fuer `joined`; Ausgetretene
-- sehen sie darueber nicht — bestehende Leitungs- und Standrechte (auch eines
-- ausgetretenen Jagdleiters, 156) bleiben unveraendert. Der 121-Riegel (nur Jagden des
-- Revierbesitzers oder Objekte, die der Schein des Erstellers deckt) bleibt.
--
-- WER ES SONST RUFT: die Policy `map_objects_hunt_member` sowie
-- `stand_ort_im_treiben` und `sitz_ort_der_jagd` (155). Die beiden Funktionen
-- fragen nur Stand-Objekte; fuer sie aendert sich nichts.
--
-- RECHTE: `create or replace` behaelt die ACL (141 setzt sie, live:
-- postgres + authenticated). Der Block am Ende ist bewusst redundant: er haelt
-- den Stand in DIESER Datei fest, damit niemand ihn erst in 141 suchen muss,
-- und entzieht namentlich (Projektregel: REVOKE FROM PUBLIC allein genuegt bei
-- Supabase nicht).

begin;

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
                             public.jagd_ist_offen(h.status, h.scheduled_for,
                                                   h.scheduled_until)
                        when 'umkreis' then
                             public.jagd_ist_offen(h.status, h.scheduled_for,
                                                   h.scheduled_until)
                             and public.ort_in_umkreis(h.id, o.position)
                        else false
                      end))
          or exists (select 1
                       from public.staende_der_teilnahme(m.id) e
                      where e.objekt_id = o.id)
           )
  );
$$;

revoke all on function public.objekt_in_sicht(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.objekt_in_sicht(uuid) to authenticated;

commit;

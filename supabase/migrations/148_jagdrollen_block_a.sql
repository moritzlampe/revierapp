-- 148: Jagdrollen Block A (CN-327, CN-443).
--
-- Bauplan (F14, Codex + Schlusslesung + Deltas):
-- quickhunt-native/docs/konzepte/QuickHunt_Bauplan_Jagdrollen_BlockA_V1.md
-- Begruendung und Pruefkette:
-- quickhunt-native/docs/migrationen/148_jagdrollen_block_a.md
--
-- DREI DINGE
--
-- 1. Tag `schweisshundfuehrer`. `hundefuehrer` bleibt als Wert und heisst im
--    Text kuenftig Stoeberhundfuehrer. Keine Funktion muss den neuen Wert
--    kennen: bis zum Auftrag (Block D) ist er ein gewoehnlicher Teilnehmer.
--    Der Wert darf in DIESER Transaktion nicht benutzt werden, auch nicht als
--    Literal in einer SQL-Funktion. Ein Enum-Wert laesst sich nicht
--    zuruecknehmen.
-- 2. `kills.durch_hund`: mit dem Hund erlegt. Ohne Angabe wie bisher: Waffe.
--    Alte Builds und alte Postausgang-Eintraege bekommen den Standard.
-- 3. Fremde `wounded` am Server verborgen (CN-443). `kills_visibility_all` und
--    `kills_visibility_leader_groupleader` lieferten sie bisher jedem
--    Teilnehmer in Sicht. Sichtbar bleiben sie Melder und Leitung (Ersteller,
--    Revierbesitzer, Jagdleiter). Block B ergaenzt den Erleger, Block D den
--    Auftrag.
--
-- WARUM AUCH `hunt_photos_select`
--
-- `jagdtag.ts` wirft ein Foto weg, wenn sein Stueck geladen, aber maskiert
-- ist. Liefert der Server das Stueck nicht mehr, gilt dessen Kennung dort als
-- tot: Das Foto wuerde angezeigt, und `ohneStueck` wuerde wahr. Punkt 3 allein
-- machte die App also undichter. Darum verschwindet die Fotozeile mit.
-- Der Hochlader behaelt seine Zeile, sonst koennte er sie nicht mehr entfernen.
--
-- BEKANNTER REST (CN-449): Die Datei eines Sammelfotos liegt unter
-- `<uid>/hunt/<hunt_id>/`, der Zweig `hunt` von `app_photos_read` fragt nur
-- nach der Jagd. Eine Bedingung ueber `hunt_photos` schiede aus, weil Nutzer
-- diese Zeile selbst schreiben (083).

begin;

alter type public.participant_tag add value if not exists 'schweisshundfuehrer';

alter table public.kills
  add column durch_hund boolean not null default false;

comment on column public.kills.durch_hund is
  'Mit dem Hund erlegt (Jagdrollen Block A, E-A4). false = Waffe, auch bei alten Builds.';

-- Wortgleich zum Stand vor 148, ergaenzt um die Klammer zu `wounded`.
-- `status` ist NOT NULL; `auth.uid()` null ergibt null und ueber `coalesce`
-- false.
create or replace function public.erlegung_in_sicht(p_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  select coalesce((
    select ((k.hunt_id in (select public.get_my_teilnahme_hunt_ids())
             and h.kill_visibility = 'all'::kill_visibility)
            or (k.hunt_id in (select public.get_my_joined_hunt_ids_as_leader_or_groupleader())
                and h.kill_visibility = 'leader_and_groupleader'::kill_visibility))
           and public.meldung_in_sicht(k.hunt_id, k.position, k.reporter_id)
           and (k.status <> 'wounded'::kill_status
                or k.reporter_id = auth.uid()
                or public.sicht_stufe(k.hunt_id) = 'leitung')
      from public.kills k
      join public.hunts h on h.id = k.hunt_id
     where k.id = p_id), false);
$function$;

-- Antwortet nur fuer Stuecke aus Jagden, an denen der Aufrufer teilnimmt: zu
-- einer beliebigen fremden Kennung sagt sie false und bestaetigt also keine
-- Nachsuche.
create function public.foto_zeigt_verborgene_nachsuche(p_kill_ids uuid[])
 returns boolean
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    select 1
      from public.kills k
     where k.id = any (p_kill_ids)
       and k.hunt_id in (select public.get_my_teilnahme_hunt_ids())
       and k.status = 'wounded'::kill_status
       and k.reporter_id is distinct from auth.uid()
       and public.sicht_stufe(k.hunt_id) <> 'leitung');
$function$;

revoke all on function public.foto_zeigt_verborgene_nachsuche(uuid[])
  from public, anon, service_role;
grant execute on function public.foto_zeigt_verborgene_nachsuche(uuid[])
  to authenticated;

-- `to authenticated` statt bisher `public`: Eine Policy, die eine Funktion
-- ruft, liefe fuer `anon` sonst in 42501. `anon` sah hier schon vorher nichts,
-- weil `get_my_teilnahme_hunt_ids()` und `auth.uid()` ohne Sitzung leer sind.
drop policy hunt_photos_select on public.hunt_photos;

create policy hunt_photos_select on public.hunt_photos
  for select
  to authenticated
  using (
    (hunt_id in (select public.get_my_teilnahme_hunt_ids())
     or hunt_id in (select h.id from public.hunts h where h.creator_id = auth.uid()))
    and (uploaded_by = auth.uid()
         or not public.foto_zeigt_verborgene_nachsuche(kill_ids))
  );

commit;

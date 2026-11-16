-- 157: Gaesteliste und Namen nur nach Beziehung (CN-484, Datenschutz). Nativer Track, 14.11.2026.
--
-- ANLASS: Ein Tester sah in der Einladeliste alle 17 Konten der Plattform. Zwei Tueren standen offen:
-- `konto_namen()` (115, DEFINER) gab jedem Angemeldeten alle Konten, und die nur live existierende Policy
-- `profiles_select_authenticated` liess jeden Angemeldeten jede Profilzeile lesen, alle zwoelf Spalten (A-P1).
-- Moritz: "riesiges datenschutzproblem".
-- Bauplan (F14, Codex + Fable ueber drei Fassungen, freigegeben 14.11.2026):
--   quickhunt-native/docs/konzepte/QuickHunt_Bauplan_Gaesteliste_Datenschutz_V1.md
-- Begruendung und Pruefkette: quickhunt-native/docs/migrationen/157_gaesteliste_namen_nach_beziehung.md
--
--
-- DIE REGEL (Moritz, 12.11.2026, woertlich)
--
--   "eigentlich duerften die nur eine eigene gaesteliste haben und leute die mit ihnen auf jagden sind und
--    nicht anonym dann ihrer liste hinzufuegen sozusagen" -- "nicht automatisch das gaestebuch fuellen bei mir"
--
-- Ein Konto sieht von einem anderen Konto Namen und die unkritischen Profilspalten nur, wenn eine Beziehung
-- besteht. Eingeladen wird nur aus der eigenen Gaesteliste = dem Adressbuch (`kontakte`), ein Konto steht
-- darin als Eintrag mit `profil_id`.
--
--
-- WAS SICH AENDERT
--
--  1. `profiles_select_authenticated` faellt weg. Migration 116 war dafuer seit 22.08.2026 reserviert und
--     wurde nie Datei; sie geht HIER auf (116 nachtraeglich einzuloesen liefe beim Neuaufbau vor 132/136/152).
--  2. `profiles_select_hunt_creator` (Text aus 116): wer eine Jagd anlegt, sieht ihre Teilnehmer.
--  3. `profiles_select_beziehung`: Absender sichtbarer GRUPPEN-Nachrichten, Ersteller sichtbarer Jagden,
--     Aussteller sichtbarer Scheine, Pruefer an Objekten, die man als Besitzer oder Scheininhaber sieht,
--     Melder sichtbarer Erlegungen. Grundsatz: sichtbar wird, wer SELBST gehandelt hat, ueber eine Spalte, die
--     der Server auf auth.uid() zwingt und die danach niemand umschreiben kann.
--  4. Spaltenrechte: `phone`, `jagdschein_nr`, `waffe`, `kaliber` liest ueber die API niemand mehr, auch nicht
--     die eigene Zeile, weder `authenticated` noch `anon` (116-Vorbedingung 7).
--  5. `konto_namen()` wird SECURITY INVOKER: das Verzeichnis ist genau die Menge der sichtbaren Profile.
--  6. `konto_loeschungen`: die Loeschung eines sichtbaren Kontos ist lesbar, aber nur `user_id`.
--  7. `hunting_licenses.issuer_id` ist fest (sonst haette ein Revierbesitzer per UPDATE einen Fremden zum
--     Aussteller gemacht und dessen Profil gesehen).
--  8. Gaesteliste: Unique-Index je Besitzer und Konto, zwei RPCs `gaesteliste_aufnehmen` (aus gemeinsamer
--     Jagd, beide zugesagt, nicht anonym) und `gaesteliste_per_email` (exakte Adresse, Drossel aus 136), beide
--     ueber die gesperrte Hilfe `gaesteliste_eintragen`.
--  9. `teilnehmer_kontakt_muss_lesbar_sein()` (106): eine GASTzeile aus einem Konto-Eintrag wirft -- sonst legte
--     ein alter Build still einen Gast an, wo eine Einladung gemeint war.
--
-- NICHT in dieser Datei: die einmalige Uebernahme der Mitjaeger in die Gaestelisten. Sie laeuft als eigener
-- Datenschritt (Anker 2), direkt wenn der neue Build installierbar ist (Bauplan E8).
--
--
-- REIHENFOLGE: NACH 156. Gezielt applizieren (psql -X -v ON_ERROR_STOP=1 -f), nie ueber "alle ausstehenden".
--
--
-- FALLEN (stehen auch im Register)
--
-- * REKURSION: Keine Policy auf einer Tabelle, die von einer `profiles`-Policy aus erreicht wird (messages,
--   hunts, hunting_licenses, kills, hunt_participants, chat_group_members, map_objects, map_object_checks,
--   kontakte, districts), darf `profiles` oder `konto_loeschungen` lesen oder `konto_namen()` rufen -- sonst
--   42P17 auf jeder Profilabfrage.
-- * SPALTENRECHTE: jede neue `profiles`-Spalte braucht einen eigenen Grant. Ein `select *` auf `profiles` (auch
--   `.select()` ohne Spalten, `profiles(*)`) scheitert mit 42501. Wer eine der vier Spalten fuellt, braucht fuer
--   die eigene Zeile eine DEFINER-RPC.
-- * ZWEITE FASSUNG DER OBJEKTSICHT: `get_my_pruefer_ids()` bildet `map_objects_owner_select` und
--   `map_objects_jes_select` nach (die Pruef-Policy unter RLS kostete 2-4 s je Profilabfrage bei 20-fachem
--   Bestand). Aendert sich eine der beiden oder `schein_deckt_objekt`, zieht die Hilfe mit.
-- * MELDER: allein `kills_reporter` (for all) haelt `reporter_id` auf auth.uid(). Eine zweite UPDATE-Policy auf
--   `kills` oeffnete den Melder-Zweig still.
-- ============================================================

begin;

-- 1. Die weite Policy. Sie stand in keiner Datei (116) -- `if exists`, damit ein Neuaufbau durchlaeuft.
drop policy if exists profiles_select_authenticated on public.profiles;

-- 2. Ersteller sieht die Teilnehmer seiner Jagd (116, F1): `participants_creator_all` zeigt ihm die Zeilen,
--    `profiles_select_co_hunters` haengt aber an der EIGENEN Teilnahme.
drop policy if exists profiles_select_hunt_creator on public.profiles;
create policy profiles_select_hunt_creator
  on public.profiles for select
  to authenticated
  using (
    id in (
      select hp.user_id
        from public.hunt_participants hp
       where hp.hunt_id in (select h.id from public.hunts h where h.creator_id = auth.uid())
    )
  );

-- 3a. Pruefer an Objekten, die der Aufrufer als Besitzer oder als Scheininhaber sieht -- dieselben
--     Bedingungen wie `map_objects_owner_select` und `map_objects_jes_select`, ohne Papierkorb.
--     Bewusst OHNE Jagdgaeste: die exakte Fassung ueber `objekt_in_sicht` kostete 3,5 s (Bauplan M12); ein Gast
--     sieht an einer Pruefung "geprueft am ..." ohne Namen, ausser er kennt den Pruefer anderweitig.
create or replace function public.get_my_pruefer_ids()
  returns setof uuid
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select distinct c.checked_by
    from public.map_object_checks c
    join public.map_objects o on o.id = c.map_object_id
   where o.deleted_at is null
     and (   o.district_id in (select d.id from public.districts d where d.owner_id = auth.uid())
          or (o.district_id in (select public.get_my_jes_district_ids())
              and public.schein_deckt_objekt(o.district_id, o.id, o.position)));
$$;

revoke all on function public.get_my_pruefer_ids() from public, anon, authenticated, service_role;
grant execute on function public.get_my_pruefer_ids() to authenticated;

-- 3b. Die neuen Beziehungen. Jede Teilabfrage laeuft unter den Policies des Aufrufers ("sichtbar"), ausser
--     der Pruefer-Hilfe (3a).
--     Absender NUR aus Nachrichten ohne `hunt_id`: `messages_insert_group` zwingt `sender_id = auth.uid()`,
--     `messages_insert_member` (Jagdchat) prueft `sender_id` nicht -- dort koennte jemand eine Nachricht mit
--     fremder `sender_id` in die eigene Jagd schreiben. Jagdchat-Absender sind ueber `co_hunters` gedeckt.
--     `hunts.creator_id` ist fest (067); `issuer_id` ab hier ebenfalls (Abschnitt 6).
drop policy if exists profiles_select_beziehung on public.profiles;
create policy profiles_select_beziehung
  on public.profiles for select
  to authenticated
  using (
       id in (select m.sender_id   from public.messages m where m.hunt_id is null)
    or id in (select h.creator_id  from public.hunts h)
    or id in (select l.issuer_id   from public.hunting_licenses l)
    or id in (select public.get_my_pruefer_ids())
    or id in (select k.reporter_id from public.kills k)
  );

-- 4. Spaltenrechte. Alle 23 Lese- und Schreibstellen beider Repos nennen ihre Spalten (Bauplan M11).
revoke select on public.profiles from authenticated, anon;
grant select (id, display_name, avatar_url, availability_status, anonymize_kills, wildart_favoriten)
  on public.profiles to authenticated, anon;
-- `anon` ebenso (Schlusslesung 157 F3): er sieht heute keine Profilzeile, aber eine spaetere Gast-Policy (etwa der
-- Ersteller auf /join) oeffnete sonst alle zwoelf Spalten. Kein Gast-Pfad liest `*`.

-- 5. Loeschstatus eines sichtbaren Kontos -- nur `user_id`. Der einzige Client-Leser
--    (`src/lib/konto/loeschen.ts`) liest nur `user_id`; 132/133 sind DEFINER, die Edge Function `service_role`.
drop policy if exists konto_loeschungen_select_sichtbar on public.konto_loeschungen;
create policy konto_loeschungen_select_sichtbar
  on public.konto_loeschungen for select
  to authenticated
  using (user_id in (select p.id from public.profiles p));

revoke select on public.konto_loeschungen from authenticated, anon;
grant select (user_id) on public.konto_loeschungen to authenticated;

-- 5b. Das Verzeichnis ist die Menge der sichtbaren Profile. ACL bleibt (create or replace; 115/132: EXECUTE
--     nur `authenticated`).
create or replace function public.konto_namen()
  returns table(id uuid, display_name text, geloescht boolean)
  language sql
  stable
  security invoker
  set search_path = public, pg_temp
as $$
  select p.id,
         p.display_name,
         exists (select 1 from public.konto_loeschungen k where k.user_id = p.id)
    from public.profiles p
   -- Zweiter Riegel neben dem EXECUTE-Entzug (115).
   where auth.uid() is not null
   order by p.display_name;
$$;

comment on function public.konto_namen() is
  'Namen der Konten, zu denen der Aufrufer eine Beziehung hat (157): SECURITY INVOKER ueber die Policies von '
  'profiles. Bis 157 gab sie als DEFINER jedem Angemeldeten alle Konten (CN-484). Kein Verzeichnis aller Konten.';

-- 6. `issuer_id` ist fest -- bedingungslos wie `hunting_licenses_holder_fixieren` (068) und
--    `hunts_creator_id_ist_fest` (067). Keine Schreibstelle aendert ihn nach dem Anlegen; der FK auf
--    `profiles` hat keine Loeschaktion (das Profil bleibt als Grabstein, 132).
create or replace function public.hunting_licenses_issuer_fest()
  returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
begin
  if new.issuer_id is distinct from old.issuer_id then
    raise exception 'issuer_id ist fest — Schein % bleibt bei seinem Aussteller', old.id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_hunting_licenses_issuer_fest on public.hunting_licenses;
create trigger trg_hunting_licenses_issuer_fest
  before update on public.hunting_licenses
  for each row execute function public.hunting_licenses_issuer_fest();

-- Niemand ruft eine Triggerfunktion direkt (082); EXECUTE wird beim Anlegen geprueft, nicht beim Feuern.
revoke all on function public.hunting_licenses_issuer_fest() from public, anon, authenticated, service_role;

-- 7. Kein Gast aus einem Konto-Eintrag (Bauplan E8b). Der Rest ist der Text aus 106; ACL bleibt.
create or replace function public.teilnehmer_kontakt_muss_lesbar_sein()
  returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
begin
  if new.kontakt_id is null then
    return new;
  end if;

  -- **Nur pruefen, was sich AENDERT** (106): sonst zerbraeche jedes spaetere UPDATE an einer Zeile, deren
  -- Kontakt einmal gueltig war und dem Schreibenden inzwischen nicht mehr sichtbar ist.
  if tg_op = 'UPDATE' and old.kontakt_id is not distinct from new.kontakt_id then
    return new;
  end if;

  perform 1 from public.kontakte k where k.id = new.kontakt_id;

  -- `FOUND` setzt plpgsql nach PERFORM selbst.
  if not found then
    raise exception 'Diesen Kontakt gibt es nicht oder er ist fuer dich nicht sichtbar'
      using errcode = 'insufficient_privilege';
  end if;

  -- 157: ein Konto-Eintrag der Gaesteliste wird als KONTO eingeladen (user_id), nie als Gast. Ein alter Build
  -- kennt `profil_id` nicht und bietet den Eintrag als "ohne Konto" an; ohne diesen Riegel entstuende still eine
  -- Gastzeile -- keine Einladung, keine Push.
  if new.user_id is null then
    perform 1 from public.kontakte k where k.id = new.kontakt_id and k.profil_id is not null;
    if found then
      raise exception 'Diese Person hat ein QuickHunt-Konto — bitte die App aktualisieren und als Konto einladen'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end;
$$;

-- 8. Gaesteliste: hoechstens ein Eintrag je Besitzer und Konto.
create unique index if not exists kontakte_besitzer_profil_uq
  on public.kontakte (besitzer_id, profil_id)
  where profil_id is not null;

comment on column public.kontakte.profil_id is
  'Konto in der Gaesteliste des Besitzers (157). Gesetzt NUR von gaesteliste_aufnehmen, gaesteliste_per_email '
  'oder der einmaligen Uebernahme (CN-484) -- durch eine Handlung des BESITZERS, nicht der Person. Kein Beleg, '
  'dass die Person ihre Kennung bestaetigt hat (A-S3 braucht einen eigenen). 132 setzt sie beim Loeschen des '
  'Kontos auf NULL; der Eintrag bleibt als Gast ohne Konto.';

-- 9. Eintragen ins EIGENE Buch (nie ein mitgefuehrtes) -- der gemeinsame Teil beider RPCs. Prueft NICHTS ueber
--    die Beziehung: das tun die Aufrufer. Deshalb fuer jede Rolle gesperrt; nur die zwei DEFINER-RPCs (Eigentuemer
--    postgres) rufen sie. Ergebnis: 'schon_drin' | 'aufgenommen' | 'geloescht'.
create or replace function public.gaesteliste_eintragen(p_ziel uuid)
  returns text
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_kontakt uuid;
  v_inaktiv timestamptz;
begin
  select c.id, c.inaktiv_seit into v_kontakt, v_inaktiv
    from public.kontakte c
   where c.besitzer_id = v_uid
     and c.profil_id = p_ziel
     for update;
  if found then
    if v_inaktiv is null then
      return 'schon_drin';
    end if;
    -- Wer bewusst erneut aufnimmt, will den Eintrag aktiv (sonst faende der Picker ihn nicht).
    update public.kontakte c set inaktiv_seit = null where c.id = v_kontakt;
    return 'aufgenommen';
  end if;

  insert into public.kontakte as c (besitzer_id, vorname, profil_id)
  select v_uid,
         case when p.display_name is null or p.display_name !~ '[^[:space:]]'
              then 'Konto ' || left(p_ziel::text, 8)
              else p.display_name end,
         p_ziel
    from public.profiles p
   where p.id = p_ziel
  on conflict (besitzer_id, profil_id) where profil_id is not null do nothing
  returning c.id into v_kontakt;

  if v_kontakt is null then
    return 'schon_drin';
  end if;

  -- Nachpruefung gegen ein gleichzeitiges Loeschen des Kontos (132): verengt das Fenster, schliesst es nicht
  -- (Bauplan E6, benannter Preis).
  if exists (select 1 from public.konto_loeschungen k where k.user_id = p_ziel) then
    delete from public.kontakte c where c.id = v_kontakt;
    return 'geloescht';
  end if;

  return 'aufgenommen';
end;
$$;

revoke all on function public.gaesteliste_eintragen(uuid) from public, anon, authenticated, service_role;

-- 10. Aus einer gemeinsamen Jagd aufnehmen. Die Pruefreihenfolge ist Vertrag: ohne gemeinsame Jagd verraet die
--     Funktion nichts ueber das Ziel (kein Orakel fuer "anonym"/"geloescht"; eine NULL-Kennung landet ebenfalls
--     bei 'keine_gemeinsame_jagd').
--     Zusage = Teilnahme ohne `entfernt_am` und (`joined` oder `left` mit `joined_at`). Sie traegt an ZWEI Riegeln:
--     ein Ersteller kann `joined` nicht fuer Fremde setzen (`trg_teilnehmer_annahme_nur_selbst`, 152), und er kann
--     eine Gastzeile mit Zusage nicht per `user_id` zu einem Konto machen (`teilnahme_anonym_fest_schutz`, 143,
--     BEFORE UPDATE OF anonym_fest, user_id). Wer einen der beiden lockert, macht diese Funktion faelschbar.
--     Wirksam anonym (143): jetzt anonym, ODER in keiner gemeinsamen Jagd mit beiderseitiger Zusage offen
--     (`anonym_fest` haelt den Stand ab Jagdende fest) -- die strengere von zwei Lesarten.
create or replace function public.gaesteliste_aufnehmen(p_user uuid)
  returns text
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_uid       uuid := auth.uid();
  v_gemeinsam boolean;
  v_offen     boolean;
begin
  if v_uid is null then
    raise exception 'gaesteliste_aufnehmen: nicht angemeldet' using errcode = '42501';
  end if;

  if p_user = v_uid then
    return 'selbst';
  end if;

  select bool_or(true), bool_or(b.anonym_fest is not true) into v_gemeinsam, v_offen
    from public.hunt_participants a
    join public.hunt_participants b on b.hunt_id = a.hunt_id
   where a.user_id = v_uid
     and b.user_id = p_user
     and a.entfernt_am is null
     and b.entfernt_am is null
     and (a.status = 'joined' or (a.status = 'left' and a.joined_at is not null))
     and (b.status = 'joined' or (b.status = 'left' and b.joined_at is not null));

  if v_gemeinsam is not true then
    return 'keine_gemeinsame_jagd';
  end if;

  if v_offen is not true
     or not exists (select 1 from public.profiles p where p.id = p_user and p.anonymize_kills = false) then
    return 'anonym';
  end if;

  if exists (select 1 from public.konto_loeschungen k where k.user_id = p_user) then
    return 'geloescht';
  end if;

  return public.gaesteliste_eintragen(p_user);
end;
$$;

revoke all on function public.gaesteliste_aufnehmen(uuid) from public, anon, authenticated, service_role;
grant execute on function public.gaesteliste_aufnehmen(uuid) to authenticated;

-- 11. Per exakter E-Mail-Adresse aufnehmen -- einseitig (Moritz, Entscheidung 7), auch Anonyme (FA). Die Suche
--     und ihre Drossel (20 je 24 h, geteilt mit dem Chat) stammen aus `konto_per_email` (136); sie meldet
--     geloeschte Konten als 'kein_konto', eine nicht eindeutige Adresse wirft dort P0001.
create or replace function public.gaesteliste_per_email(p_email text)
  returns table(ergebnis text, id uuid, display_name text)
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_erg  text;
  v_ziel uuid;
  v_name text;
begin
  if v_uid is null then
    raise exception 'gaesteliste_per_email: nicht angemeldet' using errcode = '42501';
  end if;

  select s.ergebnis, s.id, s.display_name into v_erg, v_ziel, v_name
    from public.konto_per_email(p_email) s;

  if v_erg is distinct from 'treffer' then
    return query select v_erg, null::uuid, null::text;
    return;
  end if;

  if v_ziel = v_uid then
    return query select 'selbst'::text, null::uuid, null::text;
    return;
  end if;

  -- Derselbe Ersatzname wie im gespeicherten Eintrag (gaesteliste_eintragen) -- sonst meldete die Antwort Leerraum
  -- (Codex 157, Punkt 5).
  if v_name is null or v_name !~ '[^[:space:]]' then
    v_name := 'Konto ' || left(v_ziel::text, 8);
  end if;

  v_erg := public.gaesteliste_eintragen(v_ziel);
  if v_erg = 'geloescht' then
    return query select 'kein_konto'::text, null::uuid, null::text;
    return;
  end if;

  return query select v_erg, v_ziel, v_name;
end;
$$;

revoke all on function public.gaesteliste_per_email(text) from public, anon, authenticated, service_role;
grant execute on function public.gaesteliste_per_email(text) to authenticated;

comment on table public.profiles is
  'Profil je Konto. Lesbar seit 157 NUR nach Beziehung: eigene Zeile, gemeinsame Chatgruppe, Teilnehmer einer '
  'Jagd mit eigener Teilnahme oder einer selbst angelegten Jagd, Absender sichtbarer Gruppennachrichten, '
  'Ersteller sichtbarer Jagden, Aussteller sichtbarer Scheine, Pruefer (get_my_pruefer_ids), Melder sichtbarer '
  'Erlegungen. phone, jagdschein_nr, waffe und kaliber sind fuer authenticated gar nicht lesbar (Spaltenrechte). '
  'Bis 157 las jeder Angemeldete jede Zeile (A-P1). Wer hier eine weite Policy ergaenzt, hebt alle '
  'Zeilenbedingungen auf -- Policies sind OR-verknuepft, und genau so entstand das Loch.';

commit;

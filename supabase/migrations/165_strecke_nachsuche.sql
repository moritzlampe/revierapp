-- 165: Strecke nach dem Sichern und Nachsuche (Paket ③).
-- Bauplan: quickhunt-native/docs/konzepte/QuickHunt_Bauplan_Strecke_Nachsuche_V1.md
--          (FREIGEGEBEN 24.11.2026, Fassung 3; E1, E2, E5, E9).
-- Begruendung und Pruefkette: quickhunt-native/docs/migrationen/165_strecke_nachsuche.md
--
-- ANLASS: CN-570 (Feedback #54) -- nach „Jagd sichern" liess sich die Strecke
-- auch fuer die Leitung nicht mehr korrigieren. CN-571 (Feedback #51) -- eine
-- falsche Nachsuche liess sich nicht herausnehmen. CN-584 (Feedback #52) -- eine
-- abends gefundene Nachsuche liess sich nicht als erlegt melden.
--
-- INHALT
--   1. erlegung_kontrollieren (152):
--      a) gesicherte Jagd: abgelehnt nur noch fuer Nicht-Leitung (E1).
--      b) Nachsuche (`wounded`): die Leitung darf `aus_strecke`, `zurueck`,
--         `gefunden`; der Melder eines Fremdeintrags darf `gefunden` (E2, E4 C).
--         `v_fremd` wird dafuer VOR der Pruefung gesetzt.
--      c) neue Aktion `gefunden`: Status `harvested`, Kontrolle `bestaetigt`
--         (Stufe des Aufrufers). `kontrolle_am` aendert sich -- die Aktivitaet
--         feuert nicht, die `for share`-Sperre der Jagd wird nie hochgestuft.
--   2. set_kill_herkunft (152/153/155/156/160 -- Katalogfassung): Fremdeintrag in
--      einer gesicherten Jagd fuer die Leitung erlaubt (E1).
--   3. kill_verlauf_schreiben (152/156): Ereignis `gefunden` bei
--      `wounded -> harvested`, vor dem Kontroll-Zweig (E5).
--   4. CHECK kill_verlauf_ereignis_wert um `gefunden` erweitert (Obermenge).
--
-- BAUREGEL: alle drei Funktionen aus `pg_get_functiondef` des Katalogs (24.11.2026),
-- nicht aus einer Datei (076-Loch). Signaturen, SECURITY DEFINER, search_path mit
-- pg_temp am Ende und EXECUTE-Rechte bleiben (CREATE OR REPLACE behaelt die ACL).
--
-- UNVERAENDERT: Loeschsperre 55006 (133/135), Selbstkontrolle (`selbst`),
-- Einzeljagd (`einzeljagd`), Sicht 148 (fremde Nachsuchen nur Melder, Erleger,
-- Leitung), Ablehnung von `bestaetigen`/`aendern` an einer Nachsuche,
-- `gast_aufnehmen` in gesicherten Jagden.
--
-- SPERRE: der CHECK-Tausch nimmt ACCESS EXCLUSIVE auf kill_verlauf bis zum
-- Transaktionsende (er steht deshalb ZULETZT). Es warten: jeder Schreibweg an
-- `kills`, der eine Verlaufszeile schreibt (Meldung, Kontrolle, Art, Geschlecht,
-- Status, Treiben, Ort -- reine Gewichts-/Notizaenderungen nicht, Codex 165 B4),
-- jedes LOESCHEN einer Erlegung (FK ON DELETE CASCADE, auch `konto_loeschen`;
-- Schlusslesung 165 F2) und jedes LESEN von kill_verlauf (Jaeger-Blatt, Codex 165
-- S9). Probelauf und Apply nur ohne laufende Jagd (Bauplan E9). PREIS (Codex 165
-- B3, Schlusslesung 165 F3, wie 164): das Tor liest nur und sieht keine Kontrolle
-- in einer BEENDETEN Jagd -- wer waehrend der Sekunden des Laufs meldet, prueft
-- oder loescht, wartet bis zum Ende der Transaktion (transaction_timeout 60 s).
--
-- PREISE (CN-598): eigene Stuecke der Leitung und Einzeljagden bleiben in der
-- gesicherten Jagd fest; der Verlauf protokolliert Gewicht, Notiz, Schuesse,
-- tier_position nicht; `gefunden` hat keinen Rueckweg ausser der Fehlmeldung.

begin;

-- ===== 1. erlegung_kontrollieren =====
CREATE OR REPLACE FUNCTION public.erlegung_kontrollieren(p_kill uuid, p_aktion text, p_erwartet jsonb, p_ziel jsonb DEFAULT NULL::jsonb, p_grund text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  k             public.kills%rowtype;
  v_ich         uuid := auth.uid();
  v_stufe       text;
  v_gesichert   timestamptz;
  v_erleger_uid uuid;
  v_fremd       boolean;
  v_ort_neu     boolean := false;
  v_art_roh     uuid;
  v_enum        public.wild_art;
  v_gruppe      text;
  v_tp          boolean;
  v_treiben_jagd uuid;
  v_treiben_ziel uuid;
  v_art          public.hunt_kind;
  v_treiben_da   boolean := false;
  e_wildart     uuid;
  e_wild_art    public.wild_art;
  e_geschlecht  public.geschlecht;
  e_drive       uuid;
  e_status      public.kill_status;
  e_kontrolle   text;
  e_von         uuid;
  e_stufe       text;
  z_wildart     uuid;
  z_wild_art    public.wild_art;
  z_trichinen   boolean;
  z_geschlecht  public.geschlecht;
  z_drive       uuid;
  z_position    extensions.geometry;
  z_kontrolle   text;
  z_status      public.kill_status;  -- 165
begin
  if v_ich is null then
    raise exception 'Nicht angemeldet' using errcode = '42501', hint = 'nicht_berechtigt';
  end if;
  if p_aktion is null or p_aktion not in ('bestaetigen', 'aendern', 'aus_strecke', 'zurueck', 'gefunden') then
    raise exception 'Unbekannte Aktion' using errcode = '22023';
  end if;
  if p_erwartet is null or jsonb_typeof(p_erwartet) <> 'object'
     or not (p_erwartet ?& array['wildart_id', 'wild_art', 'geschlecht', 'drive_id', 'status',
                                 'kontrolle', 'kontrolle_von', 'kontrolle_stufe']) then
    raise exception 'p_erwartet braucht alle acht Felder' using errcode = '22023';
  end if;
  if p_aktion = 'aendern'
     and (p_ziel is null or jsonb_typeof(p_ziel) <> 'object'
          or not (p_ziel ?& array['wildart_id', 'geschlecht', 'drive_id'])) then
    raise exception 'p_ziel braucht wildart_id, geschlecht und drive_id' using errcode = '22023';
  end if;
  if p_aktion = 'aus_strecke' and (p_grund is null or p_grund not in ('doppelt', 'fehlmeldung')) then
    raise exception 'Grund: doppelt oder fehlmeldung' using errcode = '22023';
  end if;

  e_wildart    := (p_erwartet ->> 'wildart_id')::uuid;
  e_wild_art   := (p_erwartet ->> 'wild_art')::public.wild_art;
  e_geschlecht := (p_erwartet ->> 'geschlecht')::public.geschlecht;
  e_drive      := (p_erwartet ->> 'drive_id')::uuid;
  e_status     := (p_erwartet ->> 'status')::public.kill_status;
  e_kontrolle  := p_erwartet ->> 'kontrolle';
  e_von        := (p_erwartet ->> 'kontrolle_von')::uuid;
  e_stufe      := p_erwartet ->> 'kontrolle_stufe';

  select * into k from public.kills where id = p_kill;
  if not found then
    return jsonb_build_object('ergebnis', 'nicht_sichtbar');
  end if;

  -- 1. Recht (vor jeder Sperre: ohne Stufe sperrt niemand eine Zeile)
  v_stufe := public.kontroll_stufe(k.hunt_id);
  if v_stufe is null then
    raise exception 'Fuer diese Jagd nicht (mehr) berechtigt'
      using errcode = '42501', hint = 'nicht_berechtigt';
  end if;

  -- Sperrfolge Erlegung -> Treiben -> Jagd (FALLEN), wie jeder Client-Schreibweg
  -- an `kills` (Zeile, dann ueber den Aktivitaets-Trigger die Jagd) und das
  -- Loeschen eines Treibens. Andersherum lief ein gleichzeitiger Notiz-Nachtrag am
  -- selben Stueck (Codex B4) bzw. das Loeschen des Ziel-Treibens (Codex Delta D2)
  -- in einen Deadlock. Die Zeile wird neu gelesen, weil sie sich seit dem ersten
  -- Lesen geaendert haben kann; ihre `hunt_id` ist fest (`set_kill_herkunft`,
  -- UPDATE-Zweig, fuer jede Rolle).
  select * into k from public.kills where id = p_kill for no key update;
  if not found then
    return jsonb_build_object('ergebnis', 'nicht_sichtbar');
  end if;
  if p_aktion = 'aendern' then
    v_treiben_ziel := (p_ziel ->> 'drive_id')::uuid;
    if v_treiben_ziel is not null and v_treiben_ziel is distinct from k.drive_id then
      select d.hunt_id into v_treiben_jagd
        from public.hunt_drives d
       where d.id = v_treiben_ziel
         for key share;
      v_treiben_da := found;
    end if;
  end if;

  -- Gegen das Sichern (Fable F9, Codex V4 DB-P8): `jagd_sichern` wartet bis
  -- zum Ende dieser Kontrolle, oder die Kontrolle liest danach "gesichert".
  -- Kein Hochstufen-Problem: diese Transaktion schreibt `hunts` nie (die
  -- Aktivitaet feuert nicht, `kontrolle_am` aendert sich).
  select h.gesichert_am, h.kind into v_gesichert, v_art
    from public.hunts h
   where h.id = k.hunt_id
     for share;
  -- Nach dem Sperrwarten neu: wer waehrenddessen die Stufe verloren oder
  -- gewechselt hat, kontrolliert mit der Stufe von jetzt (Codex Delta D2).
  v_stufe := public.kontroll_stufe(k.hunt_id);
  if v_stufe is null then
    raise exception 'Fuer diese Jagd nicht (mehr) berechtigt'
      using errcode = '42501', hint = 'nicht_berechtigt';
  end if;
  if not (v_stufe = 'leitung' or k.reporter_id = v_ich or public.erlegung_in_sicht(p_kill)) then
    return jsonb_build_object('ergebnis', 'nicht_sichtbar');
  end if;
  -- 165 (CN-570): in einer gesicherten Jagd kontrolliert weiter die Leitung --
  -- die Stufe ist oben NACH dem Sperrwarten neu gelesen. Loeschen bleibt fuer
  -- alle gesperrt (55006, 133/135); jede Kontrolle schreibt `kill_verlauf`.
  if v_gesichert is not null and v_stufe is distinct from 'leitung' then
    raise exception 'Diese Jagd ist gesichert' using errcode = '42501', hint = 'gesichert';
  end if;
  if k.participant_id is not null then
    select p.user_id into v_erleger_uid
      from public.hunt_participants p
     where p.id = k.participant_id;
  end if;
  -- Selbstkontrolle: der Aufrufer ist der Erleger, auch wenn ein anderer fuer
  -- ihn eingetragen hat (Fable F8).
  if (k.participant_id is null and k.reporter_id = v_ich) or v_erleger_uid = v_ich then
    raise exception 'Eigene Stuecke kontrolliert jemand anders'
      using errcode = '42501', hint = 'selbst';
  end if;
  -- Keine Kontrolle in der Einzeljagd (wie kein Fremdeintrag und kein Gast dort,
  -- E-B2/E-B14): es gibt keine Leitung ausser dem Jaeger selbst. Sonst sperrte ein
  -- Revierbesitzer per API einen Scheininhaber aus dessen eigenem Stueck aus
  -- (Schlusslesung 13.11.2026, B1, lokal gemessen).
  if v_art = 'solo' then
    raise exception 'In einer Einzeljagd wird nicht kontrolliert' using errcode = '42501', hint = 'einzeljagd';
  end if;
  -- Nachsuche gehoert zum Recht (E-B6, Schritt 1 -- Codex Delta D5): am Stand,
  -- auf den der Aufrufer sich bezieht. Ist das Stueck erst seither eine
  -- Nachsuche, meldet Schritt 3 `ueberholt` (Bauplan §4, Probe E10b);
  -- geschrieben wird ohnehin nur, wenn Ist = erwartet.
  -- 165: `v_fremd` VOR der Nachsuche-Pruefung -- die Ausnahme fuer den Melder
  -- eines Fremdeintrags liest es (Codex Delta B1; vorher stand die Zuweisung
  -- erst danach und die Ausnahme haette mit NULL gearbeitet).
  v_fremd := k.participant_id is not null and v_erleger_uid is distinct from k.reporter_id;
  -- 165 (CN-571, CN-584): an einer Nachsuche nimmt die Leitung heraus, holt
  -- zurueck und meldet „gefunden"; der Melder eines Fremdeintrags (Gruppen-
  -- leiter oder Leitung) meldet „gefunden". Alles andere bleibt abgelehnt.
  -- Fremde Nachsuchen sieht ein Gruppenleiter nicht (148) -- dort endete der
  -- Aufruf schon oben mit `nicht_sichtbar`.
  if e_status = 'wounded' then
    -- `coalesce(..., false)`: im Zweifel ablehnen -- ein NULL im IF wuerfe sonst nicht
    -- (lokal belegt: mit `v_fremd` NULL lief die Ausnahme still durch).
    if not coalesce((v_stufe = 'leitung' and p_aktion in ('aus_strecke', 'zurueck', 'gefunden'))
                    or (p_aktion = 'gefunden' and v_fremd and k.reporter_id = v_ich), false) then
      raise exception 'Eine Nachsuche wird nicht kontrolliert' using errcode = '42501', hint = 'nachsuche';
    end if;
  elsif p_aktion = 'gefunden' then
    raise exception 'Nur eine Nachsuche laesst sich als gefunden melden' using errcode = '42501', hint = 'uebergang';
  end if;

  -- Ziel
  z_kontrolle := case p_aktion
                   when 'bestaetigen' then 'bestaetigt'
                   when 'aendern'     then 'korrigiert'
                   when 'aus_strecke' then p_grund
                   else 'bestaetigt'               -- zurueck (Fable F7); 165: gefunden -- wer findet, hat gesehen
                 end;
  -- 165: `gefunden` macht aus der Nachsuche ein erlegtes Stueck. Alle anderen
  -- Aktionen lassen den Status, wie er erwartet ist. Weil `kontrolle_am` sich
  -- dabei aendert, feuert die Aktivitaet nicht -- die `for share`-Sperre auf
  -- der Jagd wird nie hochgestuft (Bauplan 1.6).
  z_status := case when p_aktion = 'gefunden' then 'harvested'::public.kill_status else e_status end;
  z_wild_art := e_wild_art;
  if p_aktion = 'aendern' then
    v_art_roh := (p_ziel ->> 'wildart_id')::uuid;
    -- An einem Katalog-Stueck laesst sich die Art nicht entfernen; an einem
    -- Enum-Stueck heisst null "Art bleibt" (Fable F8).
    if v_art_roh is null and e_wildart is not null then
      raise exception 'Eine Wildart laesst sich nicht entfernen'
        using errcode = '42501', hint = 'art';
    end if;
    z_wildart    := coalesce(v_art_roh, e_wildart);
    z_geschlecht := (p_ziel ->> 'geschlecht')::public.geschlecht;
    z_drive      := (p_ziel ->> 'drive_id')::uuid;
  else
    z_wildart    := e_wildart;
    z_geschlecht := e_geschlecht;
    z_drive      := e_drive;
  end if;

  -- 2. Ist = Ziel. `aendern` ohne Feldaenderung ist `unveraendert`, macht also
  --    aus `bestaetigt` kein `korrigiert` (Fable F8).
  --    Status und Enum-Art muessen dem erwarteten Stand entsprechen, auch bei
  --    `aendern` -- sonst hiesse ein inzwischen zur Nachsuche gewordenes oder vom
  --    Melder umbenanntes Enum-Stueck "unveraendert" statt `ueberholt` (Codex/Fable
  --    Delta 2 E4, Codex Delta 4 G2). AUSNAHME nur der Katalogwechsel: er leitet die
  --    Enum-Art neu ab, und seine Wiederholung nach verlorener Antwort muss
  --    `unveraendert` bleiben (Codex Delta 3, F3).
  if (k.wildart_id, k.geschlecht, k.drive_id)
       is not distinct from (z_wildart, z_geschlecht, z_drive)
     and k.status is not distinct from z_status   -- 165: Ziel, nicht Erwartung
     and (k.wild_art is not distinct from e_wild_art
          or (p_aktion = 'aendern' and z_wildart is distinct from e_wildart))
     and (p_aktion = 'aendern'
          or (k.kontrolle, k.kontrolle_von, k.kontrolle_stufe)
               is not distinct from (z_kontrolle, v_ich, v_stufe)) then
    return jsonb_build_object('ergebnis', 'unveraendert', 'stand', public.kill_stand(k));
  end if;

  -- 3. Ist != p_erwartet
  if (k.wildart_id, k.wild_art, k.geschlecht, k.drive_id, k.status,
      k.kontrolle, k.kontrolle_von, k.kontrolle_stufe)
       is distinct from
     (e_wildart, e_wild_art, e_geschlecht, e_drive, e_status,
      e_kontrolle, e_von, e_stufe) then
    return jsonb_build_object('ergebnis', 'ueberholt', 'stand', public.kill_stand(k));
  end if;

  -- 4. Tabelle (Ist = p_erwartet; die Nachsuche ist schon Schritt 1)
  if v_stufe = 'gruppenleiter' and k.kontrolle_stufe = 'leitung' then
    raise exception 'Von der Jagdleitung entschieden' using errcode = '42501', hint = 'nicht_berechtigt';
  end if;
  if p_aktion in ('bestaetigen', 'aendern', 'gefunden') and k.kontrolle in ('doppelt', 'fehlmeldung') then
    raise exception 'Erst zurueck in die Strecke' using errcode = '42501', hint = 'uebergang';
  end if;
  if p_aktion = 'zurueck' and coalesce(k.kontrolle, '') not in ('doppelt', 'fehlmeldung') then
    raise exception 'Das Stueck ist nicht aus der Strecke genommen' using errcode = '42501', hint = 'uebergang';
  end if;
  -- Gleicher Grund: nur die Leitung ueber einer Gruppenleiter-Entscheidung
  -- uebernimmt sie, sonst bleibt alles (Codex V4 DB-P1).
  if p_aktion = 'aus_strecke' and k.kontrolle = p_grund
     and not (v_stufe = 'leitung' and k.kontrolle_stufe = 'gruppenleiter') then
    return jsonb_build_object('ergebnis', 'unveraendert', 'stand', public.kill_stand(k));
  end if;

  if p_aktion = 'aendern' then
    -- Wildart nur aus dem Katalog, sichtbar fuer den Aufrufer nach der Regel
    -- von `wildarten_select` (E-B6; die vier Zweige wie in §16 -- wer eine
    -- aendert, aendert beide, Codex 13.11.2026, B12); Enum und Trichinen neu
    -- abgeleitet, nicht geklebt.
    if z_wildart is distinct from k.wildart_id then
      select w.enum_wert, w.gruppe, w.trichinenpflichtig
        into v_enum, v_gruppe, v_tp
        from public.wildarten w
       where w.id = z_wildart
         and (w.besitzer_id is null
              or w.besitzer_id = v_ich
              or exists (select 1 from public.kills x
                          where x.wildart_id = w.id and x.reporter_id = v_ich)
              or exists (select 1 from public.kills x
                          where x.wildart_id = w.id
                            and x.participant_id in (select public.meine_angenommenen_teilnahmen())));
      if not found then
        raise exception 'Diese Wildart gibt es nicht oder sie ist fuer dich nicht sichtbar'
          using errcode = '42501', hint = 'art';
      end if;
      z_wild_art  := coalesce(v_enum, 'sonstiges'::public.wild_art);
      z_trichinen := coalesce(v_tp, false) or v_gruppe = 'schwarzwild';
    end if;

    if z_drive is distinct from k.drive_id then
      -- Gesperrt (`for key share`) schon vor der Jagd, s. oben; z_drive ist
      -- derselbe Wert wie v_treiben_ziel.
      if z_drive is not null then
        -- Neu gelesen: die Sperre haelt das Treiben, nicht seine Jagd (Codex Delta 2 E2).
        if v_treiben_da then
          select d.hunt_id into v_treiben_jagd from public.hunt_drives d where d.id = z_drive;
        end if;
        if not v_treiben_da or v_treiben_jagd is distinct from k.hunt_id then
          raise exception 'Das Treiben gehoert nicht zu dieser Jagd'
            using errcode = '42501', hint = 'treiben';
        end if;
      end if;

      -- Ort beim Treibenwechsel (E-B3, Fassung 4.1): nur am Fremdeintrag --
      -- die Eigenmeldung behaelt ihren GPS-Ort. Stand im neuen Treiben ->
      -- dessen Ort; hatte er im alten einen Stand -> Jagdsitz, sonst ohne
      -- Ort; sonst bleibt der Ort (er kam vom Sitz oder vom GPS).
      if v_fremd then
        z_position := public.stand_ort_im_treiben(k.participant_id, z_drive);
        if z_position is null then
          if public.stand_ort_im_treiben(k.participant_id, k.drive_id) is not null then
            z_position := public.sitz_ort_der_jagd(k.participant_id);
            v_ort_neu := true;
          end if;
        else
          v_ort_neu := true;
        end if;
      end if;
    end if;
  end if;

  update public.kills
     set status            = z_status,   -- 165
         wildart_id        = z_wildart,
         wild_art          = z_wild_art,
         trichinen_pflicht = coalesce(z_trichinen, trichinen_pflicht),
         geschlecht        = z_geschlecht,
         drive_id          = z_drive,
         position          = case when v_ort_neu then z_position else position end,
         kontrolle         = z_kontrolle,
         kontrolle_von     = v_ich,
         kontrolle_stufe   = v_stufe,
         kontrolle_am      = clock_timestamp()
   where id = p_kill
     and wildart_id      is not distinct from e_wildart
     and wild_art        =  e_wild_art
     and geschlecht      is not distinct from e_geschlecht
     and drive_id        is not distinct from e_drive
     and status          =  e_status
     and kontrolle       is not distinct from e_kontrolle
     and kontrolle_von   is not distinct from e_von
     and kontrolle_stufe is not distinct from e_stufe
     and (v_stufe = 'leitung' or kontrolle_stufe is distinct from 'leitung')
  returning * into k;

  if not found then
    select * into k from public.kills where id = p_kill;
    if not found
       or not (v_stufe = 'leitung' or k.reporter_id = v_ich or public.erlegung_in_sicht(p_kill)) then
      return jsonb_build_object('ergebnis', 'nicht_sichtbar');
    end if;
    return jsonb_build_object('ergebnis', 'ueberholt', 'stand', public.kill_stand(k));
  end if;

  return jsonb_build_object('ergebnis', 'ok', 'stand', public.kill_stand(k));
end;
$function$;

-- ===== 2. set_kill_herkunft =====
CREATE OR REPLACE FUNCTION public.set_kill_herkunft()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_schein_revier uuid;
  v_jagd_revier   uuid;
  v_ersteller     uuid;
  v_tag           date;
  -- 152
  v_erleger       public.hunt_participants%rowtype;
  v_fremd         boolean := false;
  v_art           public.hunt_kind;
  v_gesichert     timestamptz;
  v_ende          timestamptz;
  v_stufe         text;
  v_treiben       uuid;
  v_treiben_jagd  uuid;
begin
  if tg_op = 'UPDATE' then
    if new.hunting_license_id is distinct from old.hunting_license_id then
      raise exception 'Der Begehungsschein einer Erlegung steht mit der Meldung fest'
        using errcode = 'insufficient_privilege';
    end if;
    if new.district_id is distinct from old.district_id then
      raise exception 'Das Revier einer Erlegung wird abgeleitet, nicht gesetzt'
        using errcode = 'insufficient_privilege';
    end if;
    if new.hunt_id is distinct from old.hunt_id then
      raise exception 'Die Jagd einer Erlegung steht mit der Meldung fest'
        using errcode = 'insufficient_privilege';
    end if;
    if new.erlegt_am is distinct from old.erlegt_am then
      raise exception 'Der Zeitpunkt einer Erlegung steht mit der Meldung fest'
        using errcode = 'insufficient_privilege';
    end if;
    if new.participant_id is distinct from old.participant_id then
      raise exception 'Die Teilnehmerzeile einer Erlegung steht mit der Meldung fest'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  -- 152: Melder ist der Aufrufer. RLS (`kills_reporter`) prueft das erst NACH
  -- diesem Trigger; ohne den Riegel hier antwortete der Trigger einem Client
  -- mit gefaelschter `reporter_id` je nach Teilnahme verschieden (Codex Delta
  -- 13.11.2026, D3). Weiche an der Rolle des Aufrufers (`current_setting('role')`
  -- zeigt sie auch im DEFINER, gemessen): `anon` und `authenticated` muessen,
  -- Server-Wege (`none`, `service_role`) nicht. `anon` hat INSERT auf `kills` und
  -- kaeme sonst ohne Konto an das Orakel (Fable Delta 2, E3).
  -- `reporter_id is null` ausdruecklich: fuer `anon` ist `auth.uid()` null, und
  -- `null is distinct from null` ist falsch (Codex Delta 3, F1).
  if coalesce(current_setting('role', true), '') in ('anon', 'authenticated')
     and (new.reporter_id is null or new.reporter_id is distinct from auth.uid()) then
    raise exception 'Melder ist immer das eigene Konto'
      using errcode = 'insufficient_privilege';
  end if;

  new.erlegt_am := coalesce(new.erlegt_am, now());
  -- 152: nur ein Fremdeintrag behaelt das mitgeschickte Treiben (E-B4).
  v_treiben := new.drive_id;
  new.drive_id := null;
  -- 152: den Kontrollzustand setzt nur der Server (E-B5).
  new.kontrolle := null;
  new.kontrolle_von := null;
  new.kontrolle_am := null;
  new.kontrolle_stufe := null;

  if new.erlegt_am > now() + interval '15 minutes' then
    raise exception 'Der Zeitpunkt einer Erlegung kann nicht in der Zukunft liegen'
      using errcode = 'integrity_constraint_violation';
  end if;

  if new.participant_id is not null then
    select * into v_erleger
      from public.hunt_participants p
     where p.id = new.participant_id;
    if not found or v_erleger.hunt_id is distinct from new.hunt_id then
      raise exception 'Die Teilnehmerzeile gehoert nicht zu dieser Jagd und diesem Melder'
        using errcode = 'insufficient_privilege';
    end if;
    v_fremd := v_erleger.user_id is distinct from new.reporter_id;
  end if;

  if v_fremd then
    -- Die Stufe des AUFRUFERS, nicht von `new.reporter_id`: RLS prueft den
    -- Melder erst nach diesem Trigger (FALLEN). Vor der Sperre, damit ein
    -- Konto ohne Stufe keine Jagdzeile sperrt und nichts ueber sie erfaehrt.
    -- Die Scheinpruefung des Erstellers am Tag von `erlegt_am` gilt hier
    -- nicht: das Recht kommt aus der Leitung (E-B2).
    -- Ohne Stufe DIESELBE Meldung wie oben, wie heute fuer jeden Nicht-Melder:
    -- sonst verriete der Unterschied einem Fremden, ob eine Teilnahme zu einer
    -- Jagd gehoert (Codex 13.11.2026, A2).
    v_stufe := public.kontroll_stufe(new.hunt_id);
    if v_stufe is null then
      raise exception 'Die Teilnehmerzeile gehoert nicht zu dieser Jagd und diesem Melder'
        using errcode = 'insufficient_privilege';
    end if;

    -- Treiben (E-B4). Gibt es das Treiben nicht mehr, bleibt der Eintrag ohne
    -- -- sonst verwuerfe der Postausgang ihn an 23503. `for key share` haelt ein
    -- gleichzeitiges Loeschen bis zum Ende dieser Transaktion auf (Codex V3 DB-P4).
    -- VOR der Jagd-Sperre (Codex 13.11.2026, A11): das Loeschen eines Treibens
    -- sperrt Treiben -> Erlegungen (SET NULL) -> Jagd (Aktivitaet). Hielte der
    -- Fremdeintrag zuerst die Jagd und wartete dann auf das Treiben, liefen
    -- beide in einen Deadlock (lokal gemessen, `rennen-a11b4.sh`).
    if v_treiben is not null then
      select d.hunt_id into v_treiben_jagd
        from public.hunt_drives d
       where d.id = v_treiben
         for key share;
      if not found then
        v_treiben := null;
      elsif v_treiben_jagd is distinct from new.hunt_id then
        raise exception 'Das Treiben gehoert nicht zu dieser Jagd'
          using errcode = 'insufficient_privilege';
      end if;
      new.drive_id := v_treiben;
    end if;

    -- Abweichung a (Kopf): `for no key update`. Haelt `jagd_sichern` auf
    -- (Fable F9, Codex V4 DB-P8) und laesst zwei gleichzeitige Fremdeintraege
    -- nacheinander laufen; mit `for share` stuenden beide beim Aktivitaets-
    -- UPDATE derselben Zeile gegeneinander.
    select h.district_id, h.kind, h.gesichert_am, h.ended_at
      into v_jagd_revier, v_art, v_gesichert, v_ende
      from public.hunts h
     where h.id = new.hunt_id
       for no key update;
    -- Nach dem Sperrwarten neu: wer waehrenddessen die Stufe verloren hat, traegt
    -- nicht mehr ein (Codex Delta 13.11.2026, D2). Die Pruefung oben bleibt, damit
    -- ohne Stufe keine Sperre entsteht.
    v_stufe := public.kontroll_stufe(new.hunt_id);
    if v_stufe is null then
      raise exception 'Die Teilnehmerzeile gehoert nicht zu dieser Jagd und diesem Melder'
        using errcode = 'insufficient_privilege';
    end if;
    -- Ebenso der Erleger (entfernt, abgesagt, Konto geloescht -- Pruefung unten)
    -- und die Jagd des Treibens: `for key share` haelt das Treiben fest, nicht
    -- seine `hunt_id` (Codex Delta 2 E10/E2, Fable Delta 2 E1).
    select * into v_erleger from public.hunt_participants p where p.id = new.participant_id;
    if not found then
      raise exception 'Die Teilnehmerzeile gehoert nicht zu dieser Jagd und diesem Melder'
        using errcode = 'insufficient_privilege';
    end if;
    if v_treiben is not null then
      select d.hunt_id into v_treiben_jagd from public.hunt_drives d where d.id = v_treiben;
      if v_treiben_jagd is distinct from new.hunt_id then
        raise exception 'Das Treiben gehoert nicht zu dieser Jagd'
          using errcode = 'insufficient_privilege';
      end if;
    end if;

    if v_art = 'solo' then
      raise exception 'In einer Einzeljagd traegt man nicht fuer andere ein'
        using errcode = 'insufficient_privilege';
    end if;
    -- 165 (CN-570): nachtragen darf in einer gesicherten Jagd weiter die
    -- Leitung; `v_stufe` ist oben nach dem Sperrwarten neu gelesen.
    if v_gesichert is not null and v_stufe is distinct from 'leitung' then
      raise exception 'Diese Jagd ist gesichert -- es laesst sich nichts mehr eintragen'
        using errcode = 'insufficient_privilege';
    end if;
    -- Erleger: nicht entfernt, nicht abgesagt, kein geloeschtes Konto. `left`
    -- zaehlt: wer frueh gegangen ist, hat trotzdem geschossen.
    if v_erleger.entfernt_am is not null
       or coalesce(v_erleger.status, 'invited') not in ('invited', 'joined', 'left')
       or exists (select 1 from public.konto_loeschungen k
                   where k.user_id = v_erleger.user_id) then
      raise exception 'Fuer diesen Teilnehmer laesst sich nichts mehr eintragen'
        using errcode = 'insufficient_privilege';
    end if;
    if new.hunting_license_id is not null then
      raise exception 'Ein Eintrag fuer andere traegt keinen Begehungsschein'
        using errcode = 'insufficient_privilege';
    end if;

    -- Ort (E-B3): Stand im Treiben, sonst Jagdsitz, sonst der GPS-Punkt, den
    -- der Client nur bei offener Jagd mitschickt, sonst ohne Ort.
    new.position := coalesce(public.stand_ort_im_treiben(new.participant_id, new.drive_id),
                             public.sitz_ort_der_jagd(new.participant_id),
                             new.position);

    -- Zeit (E-B4): kein Stueck hinter das Jagdende.
    if v_ende is not null then
      new.erlegt_am := least(new.erlegt_am, v_ende);
    end if;

    new.kontrolle       := 'eingetragen';
    new.kontrolle_von   := new.reporter_id;
    new.kontrolle_am    := now();
    new.kontrolle_stufe := v_stufe;
    new.district_id     := v_jagd_revier;
    return new;
  end if;

  if new.hunt_id is not null then
    select h.district_id, h.creator_id into v_jagd_revier, v_ersteller
      from public.hunts h
     where h.id = new.hunt_id;

    if v_ersteller = new.reporter_id then
      if v_jagd_revier is not null
         and not exists (select 1 from public.districts d
                          where d.id = v_jagd_revier and d.owner_id = new.reporter_id)
         and not exists (select 1 from public.hunting_licenses l
                          where l.district_id = v_jagd_revier
                            and l.holder_id = new.reporter_id
                            and l.status = 'aktiv'
                            and (new.erlegt_am at time zone 'Europe/Berlin')::date
                                between l.valid_from and l.valid_until)
      then
        raise exception 'Zum Revier dieser Jagd bist du zum Zeitpunkt der Erlegung nicht berechtigt'
          using errcode = 'insufficient_privilege';
      end if;

    elsif not exists (select 1
                        from public.hunt_participants p
                       where p.hunt_id = new.hunt_id
                         and p.user_id = new.reporter_id
                         and coalesce(p.status, 'invited') in ('invited', 'joined'))
    then
      raise exception 'Zu dieser Jagd gehoerst du nicht'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  if new.hunting_license_id is null then
    new.district_id := v_jagd_revier;
    return new;
  end if;

  v_tag := (new.erlegt_am at time zone 'Europe/Berlin')::date;

  select l.district_id into v_schein_revier
    from public.hunting_licenses l
   where l.id = new.hunting_license_id
     and l.holder_id = new.reporter_id
     and l.status = 'aktiv'
     and v_tag between l.valid_from and l.valid_until;

  if v_schein_revier is null then
    raise exception 'Begehungsschein gehoert nicht zum Melder oder war zum Zeitpunkt der Erlegung nicht gueltig'
      using errcode = 'insufficient_privilege';
  end if;

  if v_jagd_revier is not null and v_jagd_revier <> v_schein_revier then
    raise exception 'Begehungsschein und Jagd gehoeren zu verschiedenen Revieren'
      using errcode = 'integrity_constraint_violation';
  end if;

  new.district_id := v_schein_revier;
  return new;
end;
$function$;

-- ===== 3. kill_verlauf_schreiben =====
CREATE OR REPLACE FUNCTION public.kill_verlauf_schreiben()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_ereignis text;
  v_von      uuid;
  v_grund    text;
  v_rolle    text;
begin
  if tg_op = 'INSERT' then
    v_von := new.reporter_id;
    v_ereignis := case
                    when new.status = 'wounded' then 'nachsuche'
                    when new.kontrolle = 'eingetragen' then 'eingetragen'
                    else 'gemeldet'
                  end;
  else
    v_von := auth.uid();
    if old.kontrolle in ('doppelt', 'fehlmeldung')
       and coalesce(new.kontrolle, '') not in ('doppelt', 'fehlmeldung') then
      v_ereignis := 'zurueck';
    -- 165 (CN-584): Nachsuche gefunden -- vor dem Kontroll-Zweig, damit
    -- auch das „gefunden" der Leitung (das zugleich bestaetigt) so heisst; der
    -- Melder-Weg aendert `kontrolle_am` nicht und kaeme sonst als `geaendert`.
    elsif old.status = 'wounded' and new.status = 'harvested' then
      v_ereignis := 'gefunden';
    elsif new.kontrolle_am is distinct from old.kontrolle_am then
      v_ereignis := case new.kontrolle
                      when 'bestaetigt'  then 'bestaetigt'
                      when 'korrigiert'  then 'geaendert'
                      when 'doppelt'     then 'aus_strecke'
                      when 'fehlmeldung' then 'aus_strecke'
                    end;
      if v_ereignis = 'aus_strecke' then
        v_grund := new.kontrolle;
      end if;
    elsif (new.wildart_id, new.wild_art, new.geschlecht, new.status, new.drive_id)
            is distinct from
          (old.wildart_id, old.wild_art, old.geschlecht, old.status, old.drive_id)
       or new.position is distinct from old.position then
      v_ereignis := 'geaendert';
    end if;

    if v_ereignis is null then
      return null;
    end if;
  end if;

  -- Rolle zum Zeitpunkt (Schnappschuss). Jagdleiter vor Ersteller: so
  -- heisst die Rolle, die der Ersteller in seiner Jagd fast immer traegt.
  -- 156 (CN-507): kein 'revierbesitzer' mehr -- der Besitzer bekommt die
  -- Rolle seiner Teilnahme.
  select case
           when v_von is null then null
           when t.role = 'jagdleiter' then 'jagdleiter'
           when h.creator_id = v_von then 'ersteller'
           when 'gruppenleiter' = any (t.tags) then 'gruppenleiter'
           when t.role = 'treiber' then 'treiber'
           when t.id is not null then 'schuetze'
         end
    into v_rolle
    from public.hunts h
    left join public.hunt_participants t on t.hunt_id = h.id and t.user_id = v_von
   where h.id = new.hunt_id;

  insert into public.kill_verlauf (kill_id, ereignis, von, von_rolle, vorher, nachher, grund)
  values (new.id, v_ereignis, v_von, v_rolle,
          case when tg_op = 'UPDATE' then public.kill_stand(old) end,
          public.kill_stand(new),
          v_grund);

  return null;
end;
$function$;

-- ===== 4. CHECK kill_verlauf_ereignis_wert (Obermenge) =====
alter table public.kill_verlauf
  drop constraint kill_verlauf_ereignis_wert,
  add constraint kill_verlauf_ereignis_wert check (ereignis = any (array[
    'gemeldet', 'eingetragen', 'nachsuche', 'geaendert', 'bestaetigt', 'aus_strecke', 'zurueck', 'gefunden']));

commit;

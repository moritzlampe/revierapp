-- 127_chat_stummschaltung.sql — CN-201
--
-- Ein Nutzer schaltet einen einzelnen Chat für sich stumm. Vorbild ist die
-- Chatinfo von WhatsApp (Screenshot Moritz, 19.09.2026): ein Schalter, mehr
-- nicht. Der Riegel wirkt serverseitig in der Push-Route, nicht im Client —
-- sonst umginge ihn jeder alte Build und die PWA.
--
-- ============================================================================
-- WARUM EINE EIGENE TABELLE UND NICHT EINE SPALTE AUF chat_group_members
-- ============================================================================
-- Die naheliegende Bauform wäre eine Spalte `stumm_seit` auf der
-- Mitgliedszeile: die Zeile existiert schon, sie trägt bereits `hidden_at`
-- und `last_read_at`, und `chat_group_members_update_own` würde eine neue
-- Spalte ohne weitere Arbeit tragen.
--
-- Dagegen steht die LESESEITE, und die hat die Bauplan-Fremdprüfung gefunden:
-- `chat_group_members_select` gibt jedem Mitglied JEDE Mitgliedszeile seiner
-- Gruppe frei. Eine Spalte dort wäre damit für die ganze Gruppe lesbar — jeder
-- Jagdteilnehmer könnte auslesen, wer den Chat seit wann stummgeschaltet hat.
-- Die App zeigte es nicht; offen stünde es trotzdem.
--
-- Moritz, 19.09.2026: „verbergen wir auch".
--
-- Der Einwand, `last_read_at` liege heute schon offen in derselben Zeile,
-- stimmt — aber eine Lesebestätigung ist ein Merkmal, das man ZEIGEN will,
-- eine Stummschaltung eines, das man verbirgt.
--
-- ============================================================================
-- EINE ZEILE HEISST STUMM. KEINE ZEILE HEISST LAUT.
-- ============================================================================
-- Der Zustand steckt in der EXISTENZ der Zeile, nicht in einem Wert.
-- Stummschalten ist ein INSERT, Aufheben ein DELETE. Das ist kein Geschmack,
-- es schliesst eine Falle:
--
-- `stumm_seit` käme sonst vom GERÄT (dieselbe Bauform wie 126, Falle 5), und
-- eine falsch gestellte Uhr könnte einen stummen Chat wieder laut schalten,
-- sobald irgendwo gegen `now()` verglichen wird.
--
-- ⛔ AUFLAGE FÜR JEDEN LESER DIESER TABELLE: NUR die Existenz der Zeile
--    auswerten, NIE den Wert von `stumm_seit`. Der Wert ist Anzeige-
--    Information („stumm seit gestern"), kein Entscheidungsmerkmal. Wer je
--    `where stumm_seit < now()` schreibt, baut die Falle wieder ein, die
--    diese Bauform gerade vermeidet.
--
-- `default now()` steht deshalb hier: der Client schickt den Wert NICHT, die
-- Serverzeit gilt. Schickt er doch einen, schadet es nichts, weil ihn niemand
-- auswertet.

begin;

create table if not exists public.chat_stummschaltungen (
  besitzer_id uuid        not null references auth.users(id)       on delete cascade,
  group_id    uuid        not null references public.chat_groups(id) on delete cascade,
  stumm_seit  timestamptz not null default now(),
  primary key (besitzer_id, group_id)
);

comment on table public.chat_stummschaltungen is
  'Stummgeschaltete Chats je Nutzer (CN-201). EINE ZEILE HEISST STUMM, keine '
  'Zeile heisst laut — Leser werten ausschliesslich die EXISTENZ aus, nie den '
  'Wert von stumm_seit. Eigene Tabelle statt Spalte auf chat_group_members, '
  'weil chat_group_members_select jedem Mitglied jede Zeile der Gruppe '
  'freigibt und die Einstellung damit fuer alle lesbar waere.';

comment on column public.chat_stummschaltungen.stumm_seit is
  'Nur fuer die Anzeige ("stumm seit ..."). NIE als Bedingung auswerten: '
  'der Wert kaeme vom Geraet, wenn ein Client ihn mitschickt (126, Falle 5).';

-- Der Index auf der PK deckt die Client-Abfrage (alle stummen Chats EINES
-- Nutzers). Die Push-Route fragt umgekehrt: alle stummen Nutzer EINER Gruppe.
create index if not exists idx_chat_stummschaltungen_gruppe
  on public.chat_stummschaltungen (group_id);

alter table public.chat_stummschaltungen enable row level security;

-- ============================================================================
-- RLS: strikt privat. Das ist der ganze Zweck der eigenen Tabelle.
-- ============================================================================
-- Vier getrennte Policies statt einer `for all`, weil eine `for all` ihr USING
-- auch gegen die NEUE Zeile prueft (AGENTS.md, belegt 31.07.2026) — hier
-- harmlos, aber die getrennte Form sagt, was sie meint.
--
-- `to authenticated` ist Pflicht, kein Schmuck: ohne sie laeuft der Ausdruck
-- auch fuer `anon`, und der Gast-Layer der PWA ist `anon`.

create policy chat_stummschaltungen_select on public.chat_stummschaltungen
  for select to authenticated
  using (besitzer_id = auth.uid());

-- ⚠ Die INSERT-Bedingung prueft NICHT NUR den Besitzer, sondern auch die
--   Mitgliedschaft — und das ist kein Zierrat (Schlusslesung 19.09.2026, F6).
--
--   Mit `besitzer_id = auth.uid()` allein duerfte jeder Angemeldete fuer JEDE
--   `group_id` eine Zeile anlegen. Der Fremdschluessel auf `chat_groups`
--   antwortet dann unterschiedlich, je nachdem ob die Gruppe existiert
--   (Erfolg) oder nicht (`23503`) — **ein Existenz-Orakel auf eine fremde
--   Tabelle, genau das Muster, das 097 und 122 mit einem Invoker-Trigger
--   abgewehrt haben.**
--
--   `get_my_group_ids()` ist dieselbe Funktion, an der `chat_group_members_select`
--   haengt. Eine Zeile entsteht damit nur fuer einen Chat, den man ohnehin
--   sieht — und der Fehlschlag ist fuer eine fremde und fuer eine nicht
--   existierende Gruppe derselbe.
create policy chat_stummschaltungen_insert on public.chat_stummschaltungen
  for insert to authenticated
  with check (
    besitzer_id = auth.uid()
    and group_id in (select get_my_group_ids())
  );

create policy chat_stummschaltungen_delete on public.chat_stummschaltungen
  for delete to authenticated
  using (besitzer_id = auth.uid());

-- ⚠ **Die Stummschaltung UEBERLEBT einen Austritt und einen Rauswurf**, weil
--   der Fremdschluessel an `chat_groups` haengt und nicht an der
--   Mitgliedszeile. Wer zurueckkommt, ist weiter stumm.
--   **Bewusst so** (19.09.2026): wer Ruhe wollte, will sie vermutlich weiter,
--   und die Glocke in der Chatliste sagt ihm sofort, dass es so ist.
--   ⚠ Der Bauplan behauptete in §5.7 das Gegenteil („wer austritt, kommt
--   unstumm zurueck") — das galt fuer die verworfene Spaltenform auf
--   `chat_group_members`, die beim Loeschen der Mitgliedszeile mitging. Mit
--   der eigenen Tabelle ist es umgekehrt. Gefunden von der Schlusslesung, die
--   ausdruecklich danach gesucht hat (F6).
--   Loeschen bleibt in jedem Fall moeglich: `chat_stummschaltungen_delete`
--   prueft nur den Besitzer, nicht die Mitgliedschaft.
--
-- BEWUSST KEINE UPDATE-POLICY. Es gibt nichts zu aendern: eine Zeile heisst
-- stumm, keine Zeile heisst laut. Ein UPDATE koennte nur `stumm_seit`
-- verschieben — also genau den Wert, den niemand auswerten darf.

-- ============================================================================
-- ZWEI RIEGEL AN chat_groups — ohne die waere der Durchstich eine Attrappe
-- ============================================================================
-- Die Fremdpruefung dieses Codes (19.09.2026, F1 `[high]` und F2) hat gezeigt,
-- dass die Ausnahme „Nachrichten des Jagdleiters kommen durch" sich erschleichen
-- laesst, solange die Jagd-Zuordnung einer Chatgruppe frei bestimmbar ist:
--
--   `chat_groups_update` traegt kein `with_check`, auf `chat_groups` liegt kein
--   Trigger (gemessen). Der Ersteller einer Gruppe durfte ihre `hunt_id`
--   jederzeit auf eine andere Jagd setzen — auch auf eine selbst angelegte
--   leere (`hunts.district_id` ist nullable, 092 greift dort nicht) oder auf
--   eine, die das OPFER leitet. Im zweiten Fall wird der Schutz „ein
--   Jagdleiter wird als Empfaenger nie gefiltert" selbst zum Einfallstor.
--
-- **Riegel 1 schliesst das nachtraegliche UMHAENGEN. Er schliesst NICHT das
-- Anlegen einer neuen Gruppe an einer fremden Jagd.**
--
-- ⚠ Hier stand bis zum 19.09.2026 der Satz „Der Angriff lohnt nur an einer
--   BESTEHENDEN Gruppe, denn nur dort gibt es eine Stummschaltung zu
--   umgehen". **Die Schlusslesung hat ihn widerlegt**, und zwar an der
--   Ausnahme, die dieser Riegel selbst mitbringt: ein Angreifer legt eine
--   NEUE Gruppe an einer fremden Jagd an (`chat_groups_insert` prueft nur
--   `created_by`), fuegt das Opfer hinzu (`chat_group_members_insert` erlaubt
--   dem Ersteller jeden) — und wenn das OPFER diese Jagd leitet, greift
--   `empfaengerIstLeiter` und laesst jede Nachricht des Angreifers durch,
--   sobald das Opfer stummschaltet.
--   **Der Schutz „ein Jagdleiter wird als Empfaenger nie gefiltert" wird
--   damit selbst zum Einfallstor** — dieselbe Umkehrung wie schon einmal an
--   diesem Feature.
--
-- **Gemessen am 19.09.2026: 0 Jagden mit Revier tragen heute keinen Chat** —
-- es gibt also kein Ziel im Bestand. Jede kuenftige Solojagd auf einem Revier
-- waere eines.
--
-- **Riegel 3 schliesst ihn** (Freigabe Moritz, 19.09.2026). S. unten.
--
-- Gemessen, bevor er gebaut wurde: **kein Client setzt `hunt_id` per UPDATE.**
-- Alle Schreibzugriffe auf `chat_groups` betreffen `name` oder `avatar_url`
-- (nativ `chat.ts:1586/1638/1666`, PWA `info/page.tsx:285/304`). Der Riegel
-- bricht also nichts.

create or replace function public.chat_groups_hunt_id_ist_fest()
returns trigger
language plpgsql
-- ⚠ BEWUSST **INVOKER**, nicht SECURITY DEFINER: die Funktion prueft nur die
--   eigenen beiden Zeilenwerte und liest keine fremde Tabelle. Ein DEFINER
--   waere hier Rechte ohne Zweck — und jede DEFINER-Funktion braeuchte nach
--   076 wieder `pg_temp` am Ende und nach 082 einen namentlichen REVOKE.
set search_path = public, pg_temp
as $$
begin
  if new.hunt_id is distinct from old.hunt_id then
    raise exception 'Die Jagd-Zuordnung eines Chats ist fest (chat_groups.hunt_id)'
      using errcode = '42501';
  end if;
  return new;
end $$;

-- Nach 082: Trigger-Funktionen gehoeren niemandem. `FROM PUBLIC` allein
-- entzieht bei Supabase NICHTS — die Rollen muessen namentlich stehen.
revoke execute on function public.chat_groups_hunt_id_ist_fest()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_chat_groups_hunt_id_fest on public.chat_groups;
create trigger trg_chat_groups_hunt_id_fest
  before update on public.chat_groups
  for each row
  execute function public.chat_groups_hunt_id_ist_fest();

-- Riegel 2: genau EINE Chatgruppe je Jagd.
--
-- Ohne ihn kann ein gewoehnlicher Jagdteilnehmer eine ZWEITE Gruppe mit
-- derselben `hunt_id` anlegen (`chat_groups_insert` prueft nur `created_by`)
-- und ihr ein frueheres `created_at` geben — der Spalten-Default ist `now()`,
-- aber kein Riegel haelt einen mitgeschickten Wert auf. Der huntId-Zweig der
-- Push-Route waehlt dann diese vorgeschobene Gruppe, sucht die
-- Stummschaltungen dort und findet keine: der Filter laeuft ins Leere und
-- sendet an alle (Fremdpruefung 19.09.2026, F2).
--
-- Gemessen: **0 Jagden tragen heute mehr als einen Chat** (7 Jagdchats auf 7
-- Jagden, 1:1). Der Index kann also ohne Datenkorrektur angelegt werden — und
-- er macht die Auswahl „die Gruppe dieser Jagd" ueberhaupt erst eindeutig.
create unique index if not exists chat_groups_eine_gruppe_je_jagd
  on public.chat_groups (hunt_id)
  where hunt_id is not null;

-- ============================================================================
-- RIEGEL 3 — einen Chat AN EINE JAGD HAENGEN darf nur, wer die Jagd angelegt hat
-- ============================================================================
-- Riegel 1 verbietet das nachtraegliche Umhaengen. Er verbietet NICHT, eine
-- NEUE Gruppe gleich an einer fremden Jagd anzulegen — `chat_groups_insert`
-- prueft bis hierher nur `created_by = auth.uid()`.
--
-- **Der Angriff, den das offenlaesst** (Schlusslesung 19.09.2026, F1): A legt
-- eine Gruppe mit der `hunt_id` einer Jagd an, die V LEITET, und fuegt V
-- hinzu (`chat_group_members_insert` erlaubt dem Ersteller jeden). Schaltet V
-- stumm, greift `empfaengerIstLeiter` — V leitet diese Jagd ja — und jede
-- Nachricht von A kommt durch.
--
-- ⚠ **WAS DIESER RIEGEL NICHT TUT, und das ist Moritz' ausdrueckliche
--    Vorgabe (19.09.2026): „Chats erstellen erlauben natuerlich, aber nicht
--    sie selbst an eine Jagd zu haengen."**
--    Eine Gruppe ohne `hunt_id` darf weiterhin JEDER anlegen, mit beliebigen
--    Mitgliedern. Der Fall, den Moritz dabei im Blick hat — fuenf Freunde auf
--    einer fremden Jagd wollen einen eigenen Chat —, bleibt also moeglich;
--    dieser Chat ist dann ein reiner Chat ohne Jagd-Bezug. Ihn spaeter mit
--    einer Jagd zu verbinden, waere ein eigenes Vorhaben mit eigener
--    Berechtigungsfrage, kein Nebenprodukt dieser Zeile.
--
-- **Gemessen vor dem Bau, an allen sieben Jagd-Chats im Bestand: bei JEDEM
-- ist `chat_groups.created_by` = `hunts.creator_id`.** Der Riegel haette nie
-- einen bestehenden Chat verhindert. Und alle drei Anlagepfade legen den
-- Chat als Jagdersteller an (nativ `hunts.ts:334`, PWA
-- `hunt/create/page.tsx:629`, Zentrale `zentrale/jagden/liste.tsx:277`);
-- `get_or_create_direct_chat` ist SECURITY DEFINER und setzt keine `hunt_id`.
--
-- `alter policy` statt `drop`+`create`: es aendert nur den Ausdruck und
-- laesst Name, Kommando und Rollenbindung unangetastet — kein Fenster, in dem
-- die Policy fehlt.
--
-- ⚠ Die Unterabfrage laeuft als INVOKER. Fuer `anon` liefert sie still null
--    Zeilen — folgenlos, weil `created_by = auth.uid()` fuer `anon` ohnehin
--    nie wahr wird (`auth.uid()` ist dort NULL).
alter policy chat_groups_insert on public.chat_groups
  with check (
    created_by = auth.uid()
    and (
      hunt_id is null
      or hunt_id in (select id from public.hunts where creator_id = auth.uid())
    )
  );

-- ============================================================================
-- get_my_chat_list() um den stummen Zustand erweitern
-- ============================================================================
-- Ohne dieses Zeichen in der Chatliste erinnert sich nach zwei Wochen niemand
-- an den eigenen Schalter und haelt den Push fuer kaputt (Moritz, 19.09.2026:
-- „ja, mitnehmen"). Getrennt waeren es zwei Migrationen und zwei Freigaben.
--
-- DROP + CREATE, nicht CREATE OR REPLACE: die Rueckgabe-Tabelle bekommt eine
-- Spalte, und das lehnt Postgres bei REPLACE mit 42P13 ab.
--
-- Der Rumpf ist der bestehende, zeichengleich uebernommen (aus
-- pg_get_functiondef gelesen, nicht nachgebaut) — ergaenzt ist AUSSCHLIESSLICH
-- die Spalte `stumm_seit` und ihr LEFT JOIN. Die Funktion bleibt SECURITY
-- DEFINER mit pg_temp am ENDE des search_path (076).

drop function if exists public.get_my_chat_list();

create function public.get_my_chat_list()
returns table (
  id uuid, name text, kind text, emoji text, avatar_url text,
  hunt_id uuid, hunt_status text, updated_at timestamptz,
  last_message_content text, last_message_type text,
  last_message_created_at timestamptz, last_message_sender_id uuid,
  last_message_sender_name text, members jsonb,
  my_last_read_at timestamptz, hidden_at timestamptz,
  unread_count integer, stumm_seit timestamptz
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  SELECT
    cg.id,
    cg.name,
    cg.kind,
    cg.emoji,
    cg.avatar_url,
    cg.hunt_id,
    h.status::text                                          AS hunt_status,
    cg.updated_at,
    lm.content                                              AS last_message_content,
    lm.type::text                                           AS last_message_type,
    lm.created_at                                           AS last_message_created_at,
    lm.sender_id                                            AS last_message_sender_id,
    lm_sender.display_name                                  AS last_message_sender_name,
    COALESCE(mem.members, '[]'::jsonb)                      AS members,
    me.last_read_at                                         AS my_last_read_at,
    me.hidden_at,
    COALESCE(uc.unread_count, 0)                            AS unread_count,
    stumm.stumm_seit
  FROM chat_groups cg
  INNER JOIN chat_group_members me
    ON me.group_id = cg.id
   AND me.user_id  = auth.uid()
  LEFT JOIN hunts h
    ON h.id = cg.hunt_id
  LEFT JOIN LATERAL (
    SELECT m.content, m.type, m.created_at, m.sender_id
    FROM messages m
    WHERE m.group_id = cg.id
    ORDER BY m.created_at DESC
    LIMIT 1
  ) lm ON TRUE
  LEFT JOIN profiles lm_sender
    ON lm_sender.id = lm.sender_id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
             jsonb_build_object(
               'user_id',      cgm.user_id,
               'display_name', p.display_name
             )
           ) AS members
    FROM chat_group_members cgm
    LEFT JOIN profiles p ON p.id = cgm.user_id
    WHERE cgm.group_id = cg.id
  ) mem ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::integer AS unread_count
    FROM messages m
    WHERE m.group_id   = cg.id
      AND m.created_at > me.last_read_at
      AND m.sender_id IS DISTINCT FROM auth.uid()
  ) uc ON TRUE
  -- Der stumme Zustand des AUFRUFERS. Die Funktion ist SECURITY DEFINER, sieht
  -- also an RLS vorbei — deshalb steht `auth.uid()` hier ausgeschrieben und
  -- nicht bloss als Verlass auf die Policy.
  LEFT JOIN public.chat_stummschaltungen stumm
    ON stumm.group_id    = cg.id
   AND stumm.besitzer_id = auth.uid()
  WHERE me.hidden_at IS NULL
  ORDER BY cg.updated_at DESC;
$function$;

-- ⚠ DROP NIMMT DIE GRANTS MIT. Gemessen VOR dieser Migration (19.09.2026):
--   anon = true, authenticated = true, service_role = true.
--
-- Supabase vergibt EXECUTE auf NEU angelegte Funktionen per
-- `ALTER DEFAULT PRIVILEGES` an genau diese drei Rollen (AGENTS.md, belegt
-- 31.07.2026 an stand_ist_belegt). Der alte Zustand stellt sich damit von
-- selbst wieder her. Der GRANT unten ist die Absicherung fuer den Fall, dass
-- er es nicht tut — ohne EXECUTE waere die Chatliste fuer jeden Angemeldeten
-- ein hartes 42501, nicht eine leere Liste.
--
-- ⛔ GEGENPROBE NACH DEM APPLIZIEREN (Pflicht, nicht optional):
--   select has_function_privilege('anon', 'public.get_my_chat_list()', 'EXECUTE'),
--          has_function_privilege('authenticated', 'public.get_my_chat_list()', 'EXECUTE');
-- Steht `anon` danach auf false, ist das eine unbeabsichtigte Verschaerfung
-- dieser Migration — sie gehoert dann benannt, nicht stillschweigend behalten.
grant execute on function public.get_my_chat_list() to authenticated;

commit;

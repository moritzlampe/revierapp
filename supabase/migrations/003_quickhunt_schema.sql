-- ============================================================
-- RevierApp — Supabase Schema
-- Stand: 01.04.2026
-- ============================================================
-- Reihenfolge: Extensions → Enums → Tabellen → RLS → Realtime → Indexes
-- Alte Tabellen vorher manuell droppen oder neue Migration drüber.
-- ============================================================

-- === EXTENSIONS ===
create extension if not exists "postgis";
create extension if not exists "uuid-ossp";

-- === ENUMS ===

create type hunt_status as enum (
  'draft',       -- Jagd wird gerade erstellt
  'active',      -- Jagd läuft (Teilnehmer sehen Karte)
  'paused',      -- Pause (z.B. zwischen Treiben)
  'completed'    -- Jagd beendet → Archiv
);

create type hunt_type as enum (
  'ansitz',      -- Einzelansitz / Gemeinschaftsansitz
  'pirsch',
  'drueckjagd',
  'erntejagd'
);

create type participant_role as enum (
  'jagdleiter',
  'schuetze'
);

create type participant_tag as enum (
  'gruppenleiter',
  'hundefuehrer'
);

create type participant_status as enum (
  'invited',     -- Einladung verschickt
  'joined',      -- Ist in der Jagd (Link geklickt oder Push bestätigt)
  'left'         -- Hat die Jagd verlassen
);

create type message_type as enum (
  'text',
  'photo',
  'audio',
  'signal',      -- System: "Angeblasen!", "Abgeblasen!", "+15 Min"
  'kill_report', -- System: "Hans hat einen Überläufer gemeldet"
  'tracking'     -- System: "Nachsuche angefordert für Frischling"
);

create type wild_art as enum (
  'rehbock', 'ricke', 'rehkitz',
  'keiler', 'bache', 'ueberlaeufer', 'frischling',
  'rothirsch', 'rottier', 'rotkalb',
  'damhirsch', 'damtier', 'damkalb',
  'fuchs', 'dachs', 'waschbaer', 'marderhund',
  'fasan', 'taube', 'kraehe', 'gans',
  'sonstiges'
);

create type geschlecht as enum ('maennlich', 'weiblich', 'unbekannt');

create type jagdart as enum ('ansitz', 'pirsch', 'drueckjagd', 'erntejagd');

create type verbleib as enum (
  'eigenverbrauch', 'wildhandel', 'verkauf_privat',
  'tierfund', 'unfall', 'sonstiges'
);

create type tracking_status as enum (
  'gemeldet',    -- Schütze hat Nachsuche gemeldet
  'zugewiesen',  -- Hundeführer zugewiesen
  'aktiv',       -- Hundeführer ist unterwegs
  'gefunden',    -- Wild gefunden
  'nicht_gefunden',
  'abgebrochen'
);

create type tracking_priority as enum ('niedrig', 'mittel', 'hoch', 'sofort');

create type observation_type as enum (
  'wildschaden', 'auffaelliges_wild', 'raubwild',
  'wildkamera', 'infrastruktur', 'sonstiges'
);

create type map_object_type as enum (
  'hochsitz', 'kanzel', 'drueckjagdstand', 'parkplatz',
  'kirrung', 'salzlecke', 'wildkamera', 'sonstiges'
);

create type zone_type as enum ('jagdzone', 'ruhezone', 'wildschaden');

create type jes_status as enum ('aktiv', 'abgelaufen', 'entzogen', 'pausiert');

create type driven_hunt_status as enum ('entwurf', 'einladung', 'aktiv', 'abgeschlossen');

create type rsvp_status as enum ('offen', 'zugesagt', 'abgesagt');


-- ============================================================
-- KERN: Profile (erweitert auth.users)
-- ============================================================

create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  phone         text,                    -- Telefonnummer (aus Auth)
  display_name  text not null,           -- Anzeigename
  avatar_url    text,
  jagdschein_nr text,                    -- optional, für JES-Login
  waffe         text,                    -- Standardwaffe (fürs Schusstagebuch)
  kaliber       text,                    -- Standardkaliber
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);


-- ============================================================
-- REVIER (Desktop-Verwaltung, erscheint auf Mobile als Karten-Hintergrund)
-- ============================================================

create table districts (
  id            uuid primary key default uuid_generate_v4(),
  owner_id      uuid not null references profiles(id),
  name          text not null,            -- "Revier Brockwinkel"
  boundary      geometry(Polygon, 4326),  -- Reviergrenze
  area_ha       float generated always as (
                  ST_Area(boundary::geography) / 10000
                ) stored,
  bundesland    text,                     -- für WMS-Layer
  settings      jsonb default '{}',       -- Layer-Defaults, Gäste-Link-Config
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create table map_objects (
  id            uuid primary key default uuid_generate_v4(),
  district_id   uuid not null references districts(id) on delete cascade,
  type          map_object_type not null,
  name          text not null,            -- "Eicheneck"
  position      geometry(Point, 4326) not null,
  description   text,
  photo_url     text,
  zone_id       uuid,                     -- FK zu zones, gesetzt nach zones-Erstellung
  created_at    timestamptz default now()
);

create table zones (
  id            uuid primary key default uuid_generate_v4(),
  district_id   uuid not null references districts(id) on delete cascade,
  type          zone_type not null,
  name          text not null,            -- "Nordfeld"
  polygon       geometry(Polygon, 4326) not null,
  color         text default '#4CAF50',   -- Hex für Kartendarstellung
  created_at    timestamptz default now()
);

-- FK nachträglich setzen (zirkuläre Abhängigkeit vermeiden)
alter table map_objects
  add constraint fk_map_objects_zone
  foreign key (zone_id) references zones(id) on delete set null;


-- ============================================================
-- QUICKHUNT: Jagd + Teilnehmer
-- ============================================================

create table hunts (
  id            uuid primary key default uuid_generate_v4(),
  creator_id    uuid not null references profiles(id),
  district_id   uuid references districts(id),  -- optional: Revier verknüpfen
  name          text not null,                   -- "Ansitz Brockwinkel"
  type          hunt_type default 'ansitz',
  status        hunt_status default 'draft',
  invite_code   text unique not null,            -- 8-stellig, für /join/[code]
  -- Vorauswahl Wildarten (Toggle-Buttons beim Erstellen)
  wild_presets  wild_art[] default '{}',
  -- Jagdleiter-Einstellungen
  signal_mode   text default 'silent',           -- 'silent' (Ansitz) oder 'loud' (Drückjagd)
  end_time      timestamptz,                     -- Timer-Endzeit
  -- Drückjagd-Referenz (optional, nur wenn detailliert geplant)
  driven_hunt_id uuid,                           -- FK zu driven_hunts, gesetzt nach Erstellung
  -- Metadaten
  started_at    timestamptz,
  ended_at      timestamptz,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create table hunt_participants (
  id            uuid primary key default uuid_generate_v4(),
  hunt_id       uuid not null references hunts(id) on delete cascade,
  -- Entweder registrierter User ODER Gast (einer von beiden)
  user_id       uuid references profiles(id),
  guest_name    text,                     -- Gast ohne Account
  guest_token   text,                     -- Session-Token für Gast
  -- Rolle + Tags
  role          participant_role default 'schuetze',
  tags          participant_tag[] default '{}',   -- ['gruppenleiter', 'hundefuehrer']
  status        participant_status default 'invited',
  -- Zugewiesener Stand (aus Drückjagd-Planung oder manuell)
  stand_id      uuid references map_objects(id),
  -- Metadaten
  joined_at     timestamptz,
  left_at       timestamptz,
  created_at    timestamptz default now(),

  -- Ein User/Gast pro Jagd
  unique(hunt_id, user_id),
  -- Constraint: entweder user_id oder guest_name
  check (user_id is not null or guest_name is not null)
);


-- ============================================================
-- QUICKHUNT: Live-Karte (GPS-Positionen, Supabase Realtime)
-- ============================================================

create table positions (
  id            uuid primary key default uuid_generate_v4(),
  hunt_id       uuid not null references hunts(id) on delete cascade,
  participant_id uuid not null references hunt_participants(id) on delete cascade,
  location      geometry(Point, 4326) not null,
  accuracy      float,                    -- Genauigkeit in Metern
  is_locked     boolean default false,    -- Auto-Lock aktiv (<10m erreicht)
  heading       float,                    -- Blickrichtung (optional)
  speed         float,                    -- m/s (für Bewegungserkennung)
  recorded_at   timestamptz default now(),
  created_at    timestamptz default now()
);

-- Aktuelle Position pro Teilnehmer (für Realtime-Subscription)
-- Wird per UPSERT aktualisiert, nicht als Append-Log
create table positions_current (
  participant_id uuid primary key references hunt_participants(id) on delete cascade,
  hunt_id       uuid not null references hunts(id) on delete cascade,
  location      geometry(Point, 4326) not null,
  accuracy      float,
  is_locked     boolean default false,
  heading       float,
  speed         float,
  updated_at    timestamptz default now()
);


-- ============================================================
-- QUICKHUNT: Chat
-- ============================================================

create table messages (
  id            uuid primary key default uuid_generate_v4(),
  hunt_id       uuid not null references hunts(id) on delete cascade,
  participant_id uuid not null references hunt_participants(id),
  type          message_type default 'text',
  content       text,                     -- Text oder Signal-Typ
  media_url     text,                     -- Foto/Audio in Supabase Storage
  -- Metadaten
  created_at    timestamptz default now()
);


-- ============================================================
-- QUICKHUNT + REVIERZENTRALE: Strecke (Erlegungen)
-- ============================================================

create table kills (
  id            uuid primary key default uuid_generate_v4(),
  hunt_id       uuid references hunts(id),          -- optional (auch ohne Jagd meldbar)
  district_id   uuid references districts(id),       -- optional (Revier-Zuordnung)
  participant_id uuid references hunt_participants(id),
  reporter_id   uuid not null references profiles(id), -- wer hat gemeldet
  -- Pflichtfelder
  wild_art      wild_art not null,
  geschlecht    geschlecht not null,
  altersklasse  text,                     -- Freitext oder Enum je nach Wildart
  -- Optionale Felder ("App schlägt vor, Jäger entscheidet")
  gewicht_kg    float,                    -- aufgebrochen
  jagdart       jagdart,
  foto_url      text,
  position      geometry(Point, 4326),
  hochsitz_id   uuid references map_objects(id),
  waffe         text,                     -- aus Profil oder manuell
  kaliber       text,
  nachsuche     boolean default false,
  verbleib      verbleib,
  wildmarke_nr  text,                     -- Wildursprungsmarke-Nummer
  -- Abschussplan-Referenz
  shooting_plan_id uuid,                  -- FK zu shooting_plans
  -- Wildbret-Status
  trichinen_pflicht boolean default false, -- automatisch bei Schwarzwild
  trichinen_ergebnis text,                -- 'positiv', 'negativ', 'ausstehend'
  freigabe_verkauf boolean default false,
  -- Zeitstempel
  erlegt_am     timestamptz default now(),
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);


-- ============================================================
-- QUICKHUNT: Nachsuche
-- ============================================================

create table tracking_requests (
  id            uuid primary key default uuid_generate_v4(),
  hunt_id       uuid references hunts(id),
  district_id   uuid references districts(id),
  reporter_id   uuid not null references profiles(id),  -- Schütze
  handler_id    uuid references profiles(id),            -- zugewiesener Hundeführer
  handler_participant_id uuid references hunt_participants(id),
  -- Meldung
  wild_art      wild_art not null,
  stueck_anzahl int default 1,
  entfernung_m  int,                     -- geschätzte Entfernung
  -- Drei Marker (Foto-Annotation)
  foto_url      text,
  marker_einwechsel   jsonb,             -- {x, y} auf dem Foto
  marker_schuss       jsonb,             -- {x, y}
  marker_flucht       jsonb,             -- {x, y}
  -- GPS-Daten
  anschuss_position   geometry(Point, 4326),
  hochsitz_id         uuid references map_objects(id),
  fluchtrichtung_grad float,             -- Kompass-Grad
  -- Status
  status        tracking_status default 'gemeldet',
  priority      tracking_priority default 'mittel',
  ergebnis_text text,                    -- Freitext zum Ergebnis
  -- Zeitstempel
  gemeldet_am   timestamptz default now(),
  zugewiesen_am timestamptz,
  abgeschlossen_am timestamptz,
  created_at    timestamptz default now()
);


-- ============================================================
-- QUICKHUNT + REVIERZENTRALE: Beobachtungen
-- ============================================================

create table observations (
  id            uuid primary key default uuid_generate_v4(),
  district_id   uuid references districts(id),
  reporter_id   uuid not null references profiles(id),
  hunt_id       uuid references hunts(id),         -- optional: während einer Jagd
  type          observation_type not null,
  description   text,
  foto_url      text,
  position      geometry(Point, 4326),
  observed_at   timestamptz default now(),
  created_at    timestamptz default now()
);


-- ============================================================
-- REVIERZENTRALE: Jagdgruppen
-- ============================================================

create table hunt_groups (
  id            uuid primary key default uuid_generate_v4(),
  owner_id      uuid not null references profiles(id),
  district_id   uuid references districts(id),
  name          text not null,            -- "November Brockwinkel"
  created_at    timestamptz default now()
);

create table hunt_group_members (
  id            uuid primary key default uuid_generate_v4(),
  group_id      uuid not null references hunt_groups(id) on delete cascade,
  user_id       uuid references profiles(id),
  phone         text,                     -- falls noch kein Account
  display_name  text not null,
  default_role  participant_role default 'schuetze',
  default_tags  participant_tag[] default '{}',
  created_at    timestamptz default now(),
  unique(group_id, user_id)
);


-- ============================================================
-- REVIERZENTRALE: Abschussplan
-- ============================================================

create table shooting_plans (
  id            uuid primary key default uuid_generate_v4(),
  district_id   uuid not null references districts(id) on delete cascade,
  jagdjahr      text not null,            -- "2025/2026"
  wild_art      wild_art not null,
  geschlecht    geschlecht,
  altersklasse  text,
  soll          int not null default 0,   -- Freigabe
  -- Ist wird per Query auf kills berechnet (kein doppeltes Zählen)
  created_at    timestamptz default now(),
  unique(district_id, jagdjahr, wild_art, geschlecht, altersklasse)
);


-- ============================================================
-- REVIERZENTRALE: JES-Verwaltung
-- ============================================================

create table hunting_licenses (
  id            uuid primary key default uuid_generate_v4(),
  district_id   uuid not null references districts(id) on delete cascade,
  issuer_id     uuid not null references profiles(id),   -- Pächter
  holder_id     uuid references profiles(id),             -- JES-Inhaber (nach Registrierung)
  -- Inhaber-Daten (vor Registrierung)
  holder_name   text not null,
  holder_phone  text,
  holder_email  text,
  holder_jagdschein_nr text,
  -- Gültigkeit
  valid_from    date not null,
  valid_until   date not null,
  status        jes_status default 'aktiv',
  -- Berechtigungen
  zone_ids      uuid[] default '{}',      -- erlaubte Zonen
  -- Kontingent als JSONB: [{wild_art, geschlecht, altersklasse, soll}]
  kontingent    jsonb default '[]',
  -- Auflagen
  auflagen      text,
  jagdarten     jagdart[] default '{}',   -- erlaubte Jagdarten
  kfz_kennzeichen text,
  -- Einladung
  invite_code   text unique,              -- für /jes/[code]
  -- PDF
  pdf_url       text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);


-- ============================================================
-- REVIERZENTRALE: Drückjagd-Planung (Detail am Desktop)
-- ============================================================

create table driven_hunts (
  id            uuid primary key default uuid_generate_v4(),
  district_id   uuid not null references districts(id),
  creator_id    uuid not null references profiles(id),
  name          text not null,            -- "Herbstdrückjagd 2026"
  datum         date not null,
  status        driven_hunt_status default 'entwurf',
  -- Zeitplan
  zeitplan      jsonb default '[]',       -- [{treiben_nr, name, start, ende, polygon}]
  -- Sicherheit
  sicherheitseinweisung_url text,         -- PDF/Link
  -- RSVP
  rsvp_code     text unique,              -- für /rsvp/[code]
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- FK nachträglich setzen
alter table hunts
  add constraint fk_hunts_driven_hunt
  foreign key (driven_hunt_id) references driven_hunts(id) on delete set null;

create table driven_hunt_stands (
  id            uuid primary key default uuid_generate_v4(),
  driven_hunt_id uuid not null references driven_hunts(id) on delete cascade,
  treiben_nr    int,                      -- zu welchem Treiben gehört der Stand
  map_object_id uuid references map_objects(id), -- Verweis auf permanenten Hochsitz
  position      geometry(Point, 4326),     -- oder temporärer Stand
  name          text,
  assigned_participant text,               -- Name oder user_id
  sort_order    int,                       -- Anstell-Reihenfolge
  created_at    timestamptz default now()
);

create table driven_hunt_rsvps (
  id            uuid primary key default uuid_generate_v4(),
  driven_hunt_id uuid not null references driven_hunts(id) on delete cascade,
  -- Gast-Daten
  name          text not null,
  phone         text,
  email         text,
  user_id       uuid references profiles(id),
  -- RSVP-Antwort
  status        rsvp_status default 'offen',
  gelaendefahig boolean,
  personen_anzahl int default 1,
  hund          boolean default false,
  hunderasse    text,
  uebernachtung boolean default false,
  schiessnachweis boolean,
  notizen       text,
  -- Zugewiesener Stand
  stand_id      uuid references driven_hunt_stands(id),
  responded_at  timestamptz,
  created_at    timestamptz default now()
);


-- ============================================================
-- REVIERZENTRALE: Wildbretvermarktung
-- ============================================================

create table game_meat_customers (
  id            uuid primary key default uuid_generate_v4(),
  owner_id      uuid not null references profiles(id),
  name          text not null,
  phone         text,
  email         text,
  address       text,
  notes         text,
  created_at    timestamptz default now()
);

create table game_meat_invoices (
  id            uuid primary key default uuid_generate_v4(),
  owner_id      uuid not null references profiles(id),
  customer_id   uuid not null references game_meat_customers(id),
  kill_id       uuid references kills(id),  -- welches Stück
  -- Rechnungsdaten
  invoice_nr    text,
  wild_art      wild_art,
  gewicht_kg    float,
  preis_pro_kg  float,
  betrag        float,                    -- gewicht × preis
  bezahlt       boolean default false,
  pdf_url       text,
  created_at    timestamptz default now()
);


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Alle Tabellen: RLS aktivieren
alter table profiles enable row level security;
alter table districts enable row level security;
alter table map_objects enable row level security;
alter table zones enable row level security;
alter table hunts enable row level security;
alter table hunt_participants enable row level security;
alter table positions enable row level security;
alter table positions_current enable row level security;
alter table messages enable row level security;
alter table kills enable row level security;
alter table tracking_requests enable row level security;
alter table observations enable row level security;
alter table hunt_groups enable row level security;
alter table hunt_group_members enable row level security;
alter table shooting_plans enable row level security;
alter table hunting_licenses enable row level security;
alter table driven_hunts enable row level security;
alter table driven_hunt_stands enable row level security;
alter table driven_hunt_rsvps enable row level security;
alter table game_meat_customers enable row level security;
alter table game_meat_invoices enable row level security;

-- === PROFILES ===
create policy "profiles_select_own"  on profiles for select using (auth.uid() = id);
create policy "profiles_update_own"  on profiles for update using (auth.uid() = id);
create policy "profiles_insert_own"  on profiles for insert with check (auth.uid() = id);

-- Andere Teilnehmer in derselben Jagd sehen dürfen
create policy "profiles_select_co_hunters" on profiles for select using (
  id in (
    select hp.user_id from hunt_participants hp
    where hp.hunt_id in (
      select hp2.hunt_id from hunt_participants hp2
      where hp2.user_id = auth.uid()
    )
  )
);

-- === DISTRICTS ===
create policy "districts_owner_all" on districts for all using (owner_id = auth.uid());
-- JES-Inhaber sehen das Revier (nur lesen)
create policy "districts_jes_select" on districts for select using (
  id in (select district_id from hunting_licenses where holder_id = auth.uid() and status = 'aktiv')
);

-- === HUNTS ===
-- Creator kann alles
create policy "hunts_creator_all" on hunts for all using (creator_id = auth.uid());
-- Teilnehmer können lesen
create policy "hunts_participant_select" on hunts for select using (
  id in (select hunt_id from hunt_participants where user_id = auth.uid())
);

-- === HUNT_PARTICIPANTS ===
create policy "participants_hunt_member" on hunt_participants for select using (
  hunt_id in (select hunt_id from hunt_participants where user_id = auth.uid())
);
create policy "participants_creator_all" on hunt_participants for all using (
  hunt_id in (select id from hunts where creator_id = auth.uid())
);

-- === POSITIONS + POSITIONS_CURRENT ===
-- Alle Teilnehmer derselben Jagd sehen alle Positionen
create policy "positions_hunt_member" on positions for select using (
  hunt_id in (select hunt_id from hunt_participants where user_id = auth.uid())
);
create policy "positions_insert_own" on positions for insert with check (
  participant_id in (select id from hunt_participants where user_id = auth.uid())
);
create policy "positions_current_hunt_member" on positions_current for select using (
  hunt_id in (select hunt_id from hunt_participants where user_id = auth.uid())
);
create policy "positions_current_upsert_own" on positions_current for all using (
  participant_id in (select id from hunt_participants where user_id = auth.uid())
);

-- === MESSAGES ===
create policy "messages_hunt_member" on messages for select using (
  hunt_id in (select hunt_id from hunt_participants where user_id = auth.uid())
);
create policy "messages_insert_member" on messages for insert with check (
  hunt_id in (select hunt_id from hunt_participants where user_id = auth.uid())
);

-- === KILLS ===
create policy "kills_reporter" on kills for all using (reporter_id = auth.uid());
create policy "kills_district_owner" on kills for select using (
  district_id in (select id from districts where owner_id = auth.uid())
);

-- === MAP_OBJECTS, ZONES ===
create policy "map_objects_district_owner" on map_objects for all using (
  district_id in (select id from districts where owner_id = auth.uid())
);
create policy "zones_district_owner" on zones for all using (
  district_id in (select id from districts where owner_id = auth.uid())
);
-- Jagd-Teilnehmer sehen Kartenobjekte des verknüpften Reviers
create policy "map_objects_hunt_member" on map_objects for select using (
  district_id in (
    select h.district_id from hunts h
    join hunt_participants hp on hp.hunt_id = h.id
    where hp.user_id = auth.uid() and h.district_id is not null
  )
);

-- === Restliche Tabellen: Owner-basiert ===
create policy "hunt_groups_owner" on hunt_groups for all using (owner_id = auth.uid());
create policy "hunt_group_members_owner" on hunt_group_members for all using (
  group_id in (select id from hunt_groups where owner_id = auth.uid())
);
create policy "shooting_plans_owner" on shooting_plans for all using (
  district_id in (select id from districts where owner_id = auth.uid())
);
create policy "hunting_licenses_issuer" on hunting_licenses for all using (issuer_id = auth.uid());
create policy "hunting_licenses_holder" on hunting_licenses for select using (holder_id = auth.uid());
create policy "driven_hunts_creator" on driven_hunts for all using (creator_id = auth.uid());
create policy "driven_hunt_stands_creator" on driven_hunt_stands for all using (
  driven_hunt_id in (select id from driven_hunts where creator_id = auth.uid())
);
create policy "driven_hunt_rsvps_select" on driven_hunt_rsvps for select using (
  driven_hunt_id in (select id from driven_hunts where creator_id = auth.uid())
);
-- RSVP: Gäste können ihre eigene Antwort einfügen/ändern (anon-Zugriff über rsvp_code)
create policy "driven_hunt_rsvps_anon_insert" on driven_hunt_rsvps for insert with check (true);
create policy "driven_hunt_rsvps_anon_update" on driven_hunt_rsvps for update using (true);
create policy "game_meat_customers_owner" on game_meat_customers for all using (owner_id = auth.uid());
create policy "game_meat_invoices_owner" on game_meat_invoices for all using (owner_id = auth.uid());
create policy "observations_reporter" on observations for all using (reporter_id = auth.uid());
create policy "observations_district_owner" on observations for select using (
  district_id in (select id from districts where owner_id = auth.uid())
);
create policy "tracking_requests_reporter" on tracking_requests for all using (reporter_id = auth.uid());
create policy "tracking_requests_handler" on tracking_requests for select using (handler_id = auth.uid());
create policy "tracking_requests_district_owner" on tracking_requests for select using (
  district_id in (select id from districts where owner_id = auth.uid())
);


-- ============================================================
-- SUPABASE REALTIME
-- ============================================================

-- Nur die Tabellen die Echtzeit brauchen
alter publication supabase_realtime add table positions_current;
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table kills;
alter publication supabase_realtime add table tracking_requests;
alter publication supabase_realtime add table hunts;  -- Status-Änderungen (Angeblasen/Abgeblasen)


-- ============================================================
-- INDEXES
-- ============================================================

-- QuickHunt: Schnelle Abfragen während aktiver Jagd
create index idx_positions_current_hunt on positions_current(hunt_id);
create index idx_positions_hunt_time on positions(hunt_id, recorded_at desc);
create index idx_messages_hunt_time on messages(hunt_id, created_at desc);
create index idx_participants_hunt on hunt_participants(hunt_id);
create index idx_participants_user on hunt_participants(user_id);
create index idx_hunts_invite_code on hunts(invite_code);
create index idx_hunts_creator on hunts(creator_id);
create index idx_hunts_status on hunts(status) where status = 'active';

-- Revierzentrale: Statistik-Abfragen
create index idx_kills_district on kills(district_id);
create index idx_kills_hunt on kills(hunt_id);
create index idx_kills_reporter on kills(reporter_id);
create index idx_kills_wild_art on kills(wild_art);
create index idx_kills_erlegt_am on kills(erlegt_am desc);
create index idx_observations_district on observations(district_id);
create index idx_tracking_district on tracking_requests(district_id);

-- Geo-Indexes
create index idx_positions_geo on positions using gist(location);
create index idx_positions_current_geo on positions_current using gist(location);
create index idx_kills_geo on kills using gist(position);
create index idx_map_objects_geo on map_objects using gist(position);
create index idx_observations_geo on observations using gist(position);
create index idx_districts_geo on districts using gist(boundary);

-- JES
create index idx_jes_district on hunting_licenses(district_id);
create index idx_jes_holder on hunting_licenses(holder_id);
create index idx_jes_invite_code on hunting_licenses(invite_code);


-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Profil automatisch bei Registrierung anlegen
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, phone, display_name)
  values (
    new.id,
    new.phone,
    coalesce(new.raw_user_meta_data->>'display_name', 'Jäger')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Einladungscode generieren (8 Zeichen, alphanumerisch)
create or replace function generate_invite_code()
returns text as $$
declare
  code text;
  exists boolean;
begin
  loop
    code := upper(substr(md5(random()::text), 1, 8));
    select count(*) > 0 into exists from hunts where invite_code = code;
    if not exists then
      return code;
    end if;
  end loop;
end;
$$ language plpgsql;

-- Abschussplan: Ist berechnen
create or replace function get_shooting_plan_actual(plan_id uuid)
returns int as $$
  select count(*)::int from kills k
  join shooting_plans sp on sp.id = plan_id
  where k.district_id = sp.district_id
    and k.wild_art = sp.wild_art
    and (sp.geschlecht is null or k.geschlecht = sp.geschlecht)
    and (sp.altersklasse is null or k.altersklasse = sp.altersklasse)
    and k.erlegt_am >= (sp.jagdjahr || '-04-01')::date  -- Jagdjahr ab 1. April
    and k.erlegt_am < ((left(sp.jagdjahr, 4)::int + 1)::text || '-04-01')::date;
$$ language sql stable;

-- Trichinen-Pflicht automatisch setzen
create or replace function set_trichinen_pflicht()
returns trigger as $$
begin
  if new.wild_art in ('keiler', 'bache', 'ueberlaeufer', 'frischling') then
    new.trichinen_pflicht := true;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_kills_trichinen
  before insert or update on kills
  for each row execute function set_trichinen_pflicht();

-- updated_at automatisch setzen
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

create trigger trg_profiles_updated  before update on profiles for each row execute function update_updated_at();
create trigger trg_districts_updated before update on districts for each row execute function update_updated_at();
create trigger trg_hunts_updated     before update on hunts for each row execute function update_updated_at();
create trigger trg_kills_updated     before update on kills for each row execute function update_updated_at();
create trigger trg_jes_updated       before update on hunting_licenses for each row execute function update_updated_at();
create trigger trg_driven_updated    before update on driven_hunts for each row execute function update_updated_at();

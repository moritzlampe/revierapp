-- RevierApp Initial Schema
-- Requires PostGIS extension enabled in Supabase

create extension if not exists "uuid-ossp";
create extension if not exists "postgis";

-- Enum Types
create type objekt_type as enum ('hochsitz', 'kanzel', 'drueckjagdstand', 'parkplatz', 'kirrung', 'salzlecke', 'wildkamera', 'sonstiges');
create type zone_type as enum ('jagdzone', 'ruhezone', 'wildschaden');
create type jes_status as enum ('aktiv', 'pausiert', 'entzogen', 'abgelaufen');
create type jagdart_type as enum ('ansitz', 'pirsch', 'drueckjagd', 'beides');
create type strecke_status as enum ('gemeldet', 'bestaetigt');
create type drueckjagd_status as enum ('entwurf', 'einladung', 'aktiv', 'abgeschlossen');
create type rsvp_status as enum ('offen', 'zugesagt', 'abgesagt');

-- Tables
create table profiles (
  id uuid references auth.users primary key,
  name text not null,
  jagdschein_nr text,
  jagdschein_behoerde text,
  telefon text,
  created_at timestamptz default now()
);

create table reviere (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  owner_id uuid references profiles(id) not null,
  boundary geography(Polygon, 4326),
  area_ha float,
  bundesland text,
  settings jsonb default '{}',
  created_at timestamptz default now()
);

create table zonen (
  id uuid default uuid_generate_v4() primary key,
  revier_id uuid references reviere(id) on delete cascade not null,
  type zone_type not null,
  name text not null,
  polygon geography(Polygon, 4326) not null,
  color text default '#6B9F3A',
  created_at timestamptz default now()
);

create table revier_objekte (
  id uuid default uuid_generate_v4() primary key,
  revier_id uuid references reviere(id) on delete cascade not null,
  type objekt_type not null,
  name text not null,
  position geography(Point, 4326) not null,
  description text,
  photo_url text,
  zone_id uuid references zonen(id),
  created_at timestamptz default now()
);

create table jes (
  id uuid default uuid_generate_v4() primary key,
  revier_id uuid references reviere(id) on delete cascade not null,
  inhaber_id uuid references profiles(id) not null,
  erstellt_von uuid references profiles(id) not null,
  gueltig_von date not null,
  gueltig_bis date not null,
  zone_ids uuid[] default '{}',
  wildarten jsonb not null default '[]',
  jagdart jagdart_type default 'beides',
  entgeltlich boolean default false,
  betrag float,
  auflagen text,
  kfz_kennzeichen text,
  status jes_status default 'aktiv',
  qr_code text,
  created_at timestamptz default now()
);

create table strecke (
  id uuid default uuid_generate_v4() primary key,
  revier_id uuid references reviere(id) on delete cascade not null,
  jaeger_id uuid references profiles(id) not null,
  jes_id uuid references jes(id),
  wildart text not null,
  geschlecht text not null,
  altersklasse text,
  gewicht_kg float,
  foto_url text,
  position geography(Point, 4326),
  zeitstempel timestamptz,
  hochsitz_id uuid references revier_objekte(id),
  jagdart jagdart_type not null,
  nachsuche boolean default false,
  verbleib text,
  status strecke_status default 'gemeldet',
  created_at timestamptz default now()
);

create table beobachtungen (
  id uuid default uuid_generate_v4() primary key,
  revier_id uuid references reviere(id) on delete cascade not null,
  melder_id uuid references profiles(id) not null,
  type text not null,
  position geography(Point, 4326) not null,
  beschreibung text,
  foto_url text,
  created_at timestamptz default now()
);

create table drueckjagden (
  id uuid default uuid_generate_v4() primary key,
  revier_id uuid references reviere(id) on delete cascade not null,
  name text not null,
  datum date not null,
  zeitplan jsonb default '{}',
  status drueckjagd_status default 'entwurf',
  created_at timestamptz default now()
);

create table treiben (
  id uuid default uuid_generate_v4() primary key,
  drueckjagd_id uuid references drueckjagden(id) on delete cascade not null,
  name text not null,
  polygon geography(Polygon, 4326),
  start_zeit time,
  end_zeit time,
  sort_order integer default 0
);

create table staende (
  id uuid default uuid_generate_v4() primary key,
  treiben_id uuid references treiben(id) on delete cascade not null,
  name text not null,
  position geography(Point, 4326) not null,
  schuetze_id uuid references profiles(id),
  sort_order integer default 0
);

create table dj_einladungen (
  id uuid default uuid_generate_v4() primary key,
  drueckjagd_id uuid references drueckjagden(id) on delete cascade not null,
  gast_id uuid references profiles(id),
  gast_name text,
  gast_email text,
  gast_telefon text,
  rsvp_status rsvp_status default 'offen',
  gelaendefahig boolean,
  personen_anzahl integer default 1,
  hund boolean default false,
  hunderasse text,
  uebernachtung boolean default false,
  schiessnachweis boolean default false,
  stand_id uuid references staende(id),
  notizen text,
  rsvp_code text unique default encode(gen_random_bytes(12), 'hex'),
  created_at timestamptz default now()
);

-- Row Level Security
alter table profiles enable row level security;
alter table reviere enable row level security;
alter table revier_objekte enable row level security;
alter table zonen enable row level security;
alter table jes enable row level security;
alter table strecke enable row level security;
alter table beobachtungen enable row level security;
alter table drueckjagden enable row level security;
alter table treiben enable row level security;
alter table staende enable row level security;
alter table dj_einladungen enable row level security;

-- RLS Policies: Reviere
create policy "Eigene Reviere sehen" on reviere for select using (owner_id = auth.uid());
create policy "Reviere erstellen" on reviere for insert with check (owner_id = auth.uid());
create policy "Eigene Reviere bearbeiten" on reviere for update using (owner_id = auth.uid());
create policy "Eigene Reviere loeschen" on reviere for delete using (owner_id = auth.uid());

-- RLS: Revier-Objekte
create policy "Objekte im eigenen Revier sehen" on revier_objekte for select
  using (revier_id in (select id from reviere where owner_id = auth.uid()));
create policy "Objekte erstellen" on revier_objekte for insert
  with check (revier_id in (select id from reviere where owner_id = auth.uid()));
create policy "Objekte bearbeiten" on revier_objekte for update
  using (revier_id in (select id from reviere where owner_id = auth.uid()));
create policy "Objekte loeschen" on revier_objekte for delete
  using (revier_id in (select id from reviere where owner_id = auth.uid()));

-- RLS: Zonen
create policy "Zonen sehen" on zonen for select
  using (revier_id in (select id from reviere where owner_id = auth.uid()));
create policy "Zonen erstellen" on zonen for insert
  with check (revier_id in (select id from reviere where owner_id = auth.uid()));

-- RLS: JES
create policy "Paechter sieht JES" on jes for select
  using (revier_id in (select id from reviere where owner_id = auth.uid()));
create policy "JES-Inhaber sieht eigene" on jes for select
  using (inhaber_id = auth.uid());
create policy "Paechter erstellt JES" on jes for insert
  with check (revier_id in (select id from reviere where owner_id = auth.uid()));
create policy "Paechter bearbeitet JES" on jes for update
  using (revier_id in (select id from reviere where owner_id = auth.uid()));

-- RLS: Strecke
create policy "Paechter sieht Strecke" on strecke for select
  using (revier_id in (select id from reviere where owner_id = auth.uid()));
create policy "Jaeger sieht eigene Strecke" on strecke for select
  using (jaeger_id = auth.uid());
create policy "Strecke melden" on strecke for insert
  with check (jaeger_id = auth.uid());

-- RLS: Beobachtungen
create policy "Paechter sieht Beobachtungen" on beobachtungen for select
  using (revier_id in (select id from reviere where owner_id = auth.uid()));
create policy "Eigene Beobachtungen sehen" on beobachtungen for select
  using (melder_id = auth.uid());
create policy "Beobachtung eintragen" on beobachtungen for insert
  with check (melder_id = auth.uid());

-- RLS: Drueckjagden
create policy "Paechter sieht Drueckjagden" on drueckjagden for select
  using (revier_id in (select id from reviere where owner_id = auth.uid()));
create policy "Paechter erstellt Drueckjagd" on drueckjagden for insert
  with check (revier_id in (select id from reviere where owner_id = auth.uid()));
create policy "Paechter bearbeitet Drueckjagd" on drueckjagden for update
  using (revier_id in (select id from reviere where owner_id = auth.uid()));

-- RLS: Treiben
create policy "Treiben ueber Drueckjagd sehen" on treiben for select
  using (drueckjagd_id in (
    select id from drueckjagden where revier_id in (
      select id from reviere where owner_id = auth.uid()
    )
  ));
create policy "Treiben erstellen" on treiben for insert
  with check (drueckjagd_id in (
    select id from drueckjagden where revier_id in (
      select id from reviere where owner_id = auth.uid()
    )
  ));

-- RLS: Staende
create policy "Staende sehen" on staende for select
  using (treiben_id in (
    select id from treiben where drueckjagd_id in (
      select id from drueckjagden where revier_id in (
        select id from reviere where owner_id = auth.uid()
      )
    )
  ));

-- RLS: DJ-Einladungen
create policy "Paechter sieht Einladungen" on dj_einladungen for select
  using (drueckjagd_id in (
    select id from drueckjagden where revier_id in (
      select id from reviere where owner_id = auth.uid()
    )
  ));
create policy "Gast sieht eigene Einladung" on dj_einladungen for select
  using (gast_id = auth.uid());
create policy "Paechter erstellt Einladung" on dj_einladungen for insert
  with check (drueckjagd_id in (
    select id from drueckjagden where revier_id in (
      select id from reviere where owner_id = auth.uid()
    )
  ));

-- Indexes
create index idx_reviere_owner on reviere(owner_id);
create index idx_objekte_revier on revier_objekte(revier_id);
create index idx_zonen_revier on zonen(revier_id);
create index idx_jes_revier on jes(revier_id);
create index idx_jes_inhaber on jes(inhaber_id);
create index idx_strecke_revier on strecke(revier_id);
create index idx_strecke_jaeger on strecke(jaeger_id);
create index idx_beobachtungen_revier on beobachtungen(revier_id);
create index idx_drueckjagden_revier on drueckjagden(revier_id);
create index idx_treiben_drueckjagd on treiben(drueckjagd_id);
create index idx_staende_treiben on staende(treiben_id);
create index idx_einladungen_drueckjagd on dj_einladungen(drueckjagd_id);
create index idx_einladungen_rsvp_code on dj_einladungen(rsvp_code);

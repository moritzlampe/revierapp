-- Migration 025: map_object_photos Tabelle
-- Mehrere Fotos pro Revier-Objekt (Hochsitz, Kirrung, etc.)
-- Ersetzt die bisherige ungenutzte map_objects.photo_url Spalte.

create table if not exists map_object_photos (
  id            uuid primary key default uuid_generate_v4(),
  map_object_id uuid not null references map_objects(id) on delete cascade,
  url           text not null,
  storage_path  text not null,
  uploaded_by   uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index map_object_photos_object_idx
  on map_object_photos(map_object_id, created_at desc);

alter table map_object_photos enable row level security;

-- Lesen: Wer das map_object sehen darf, darf auch Fotos sehen.
create policy "map_object_photos_read"
  on map_object_photos for select
  using (map_object_id in (select id from map_objects));

-- Insert: Eigene Uploads auf map_objects, die sichtbar sind.
create policy "map_object_photos_insert"
  on map_object_photos for insert
  with check (
    uploaded_by = auth.uid()
    and map_object_id in (select id from map_objects)
  );

-- Löschen: Eigene Fotos ODER Revier-Owner.
create policy "map_object_photos_delete"
  on map_object_photos for delete
  using (
    uploaded_by = auth.uid()
    or map_object_id in (
      select mo.id from map_objects mo
      join districts d on d.id = mo.district_id
      where d.owner_id = auth.uid()
    )
  );

-- map_objects.photo_url bleibt als deprecated-Spalte stehen.
-- Wird vom Code nicht mehr beschrieben oder gelesen.
-- Wenn Phase 0 count > 0 ergab, HIER eine INSERT-Anweisung ergänzen,
-- die photo_url in map_object_photos kopiert (nach Rücksprache).

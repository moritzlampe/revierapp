-- Link-Vorschauen Cache-Tabelle
CREATE TABLE IF NOT EXISTS link_previews (
  url TEXT PRIMARY KEY,
  title TEXT,
  description TEXT,
  image_url TEXT,
  favicon_url TEXT,
  site_name TEXT,
  og_type TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fetch_failed BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_link_previews_fetched_at ON link_previews(fetched_at);

ALTER TABLE link_previews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "link_previews_read_all" ON link_previews
  FOR SELECT TO authenticated USING (true);

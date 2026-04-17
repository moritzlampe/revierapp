export type KillStatus = 'harvested' | 'wounded'

export type KillVisibility =
  | 'all'
  | 'leader_only'
  | 'leader_and_groupleader'

export type Geschlecht = 'maennlich' | 'weiblich' | 'unbekannt'

export type Jagdart = 'ansitz' | 'pirsch' | 'drueckjagd' | 'erntejagd'

export type Verbleib =
  | 'eigenverbrauch'
  | 'wildhandel'
  | 'verkauf_privat'
  | 'tierfund'
  | 'unfall'
  | 'sonstiges'

export interface Kill {
  id: string
  hunt_id: string | null
  district_id: string | null
  participant_id: string | null
  reporter_id: string
  // Pflichtfelder
  wild_art: string            // wird auf WildArt eingegrenzt in species-config
  geschlecht: Geschlecht | null
  altersklasse: string | null
  status: KillStatus
  // Optionale Felder
  gewicht_kg: number | null
  jagdart: Jagdart | null
  foto_url: string | null
  position: unknown           // PostGIS geometry — wird als GeoJSON oder {lat,lng} gelesen
  hochsitz_id: string | null
  waffe: string | null
  kaliber: string | null
  nachsuche: boolean
  verbleib: Verbleib | null
  wildmarke_nr: string | null
  // Abschussplan-Referenz
  shooting_plan_id: string | null
  // Wildbret-Status
  trichinen_pflicht: boolean
  trichinen_ergebnis: string | null
  freigabe_verkauf: boolean
  // Zeitstempel
  erlegt_am: string           // ISO timestamptz
  created_at: string
  updated_at: string
}

// Client-seitig gruppierte Erlegungen (Multi-Tap-Batch)
// Heuristik: gleicher reporter_id + created_at-Differenz <2s.
// Gruppierung passiert im Client (Option B — siehe Recon §2.2),
// keine DB-Spalte batch_id nötig.
export interface KillBatch {
  id: string              // Erste Kill-ID des Batches als stabiler React-Key
  reporter_id: string
  first_at: string        // created_at des ersten Kills (ISO)
  last_at: string         // created_at des letzten Kills (ISO) — für Streaming-Updates
  kills: Kill[]           // Sortiert ASC nach created_at
}

// Für INSERT — nur Pflichtfelder required, Rest optional
export interface KillInsert {
  hunt_id?: string | null
  district_id?: string | null
  participant_id?: string | null
  reporter_id: string
  wild_art: string
  geschlecht?: Geschlecht | null
  altersklasse?: string | null
  status?: KillStatus
  gewicht_kg?: number | null
  jagdart?: Jagdart | null
  foto_url?: string | null
  position?: unknown
  hochsitz_id?: string | null
  waffe?: string | null
  kaliber?: string | null
  nachsuche?: boolean
  verbleib?: Verbleib | null
  wildmarke_nr?: string | null
  shooting_plan_id?: string | null
  erlegt_am?: string
}

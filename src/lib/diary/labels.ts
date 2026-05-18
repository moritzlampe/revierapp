/**
 * Enum-Label-Lookups für die Tagebuch-Detailseite.
 * Werte aus dem DB-Enum (src/lib/supabase/database.types.ts), nicht geraten.
 */

// kills.hit_location-Enum (Migration 044)
export const HIT_LOCATION_LABEL: Record<string, string> = {
  kammer: 'Kammer',
  blattschuss: 'Blattschuss',
  traeger: 'Träger',
  weidwund: 'Weidwund',
  krellschuss: 'Krellschuss',
  lauf: 'Lauf',
  sonstige: 'Sonstige',
}

// kills.geschlecht-Enum: "maennlich" | "weiblich" | "unbekannt"
export const GESCHLECHT_LABEL: Record<string, string> = {
  maennlich: 'männlich',
  weiblich: 'weiblich',
  unbekannt: 'unbekannt',
}

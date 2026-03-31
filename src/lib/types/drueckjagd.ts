export type DrueckjagdStatus = "entwurf" | "einladung" | "aktiv" | "abgeschlossen";
export type RsvpStatus = "offen" | "zugesagt" | "abgesagt";

export type Drueckjagd = {
  id: string;
  revier_id: string;
  name: string;
  datum: string;
  zeitplan: Record<string, unknown>;
  status: DrueckjagdStatus;
  created_at: string;
};

export type Treiben = {
  id: string;
  drueckjagd_id: string;
  name: string;
  polygon: GeoJSON.Polygon | null;
  start_zeit: string | null;
  end_zeit: string | null;
  sort_order: number;
};

export type Stand = {
  id: string;
  treiben_id: string;
  name: string;
  position: { lat: number; lng: number };
  schuetze_id: string | null;
  sort_order: number;
};

export type DjEinladung = {
  id: string;
  drueckjagd_id: string;
  gast_id: string | null;
  gast_name: string | null;
  gast_email: string | null;
  gast_telefon: string | null;
  rsvp_status: RsvpStatus;
  gelaendefahig: boolean | null;
  personen_anzahl: number;
  hund: boolean;
  hunderasse: string | null;
  uebernachtung: boolean;
  schiessnachweis: boolean;
  stand_id: string | null;
  notizen: string | null;
  rsvp_code: string;
  created_at: string;
};

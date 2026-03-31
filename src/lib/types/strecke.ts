export type JagdartType = "ansitz" | "pirsch" | "drueckjagd" | "beides";
export type StreckeStatus = "gemeldet" | "bestaetigt";

export type Strecke = {
  id: string;
  revier_id: string;
  jaeger_id: string;
  jes_id: string | null;
  wildart: string;
  geschlecht: string;
  altersklasse: string | null;
  gewicht_kg: number | null;
  foto_url: string | null;
  position: { lat: number; lng: number } | null;
  zeitstempel: string | null;
  hochsitz_id: string | null;
  jagdart: JagdartType;
  nachsuche: boolean;
  verbleib: string | null;
  status: StreckeStatus;
  created_at: string;
};

export type Beobachtung = {
  id: string;
  revier_id: string;
  melder_id: string;
  type: string;
  position: { lat: number; lng: number };
  beschreibung: string | null;
  foto_url: string | null;
  created_at: string;
};

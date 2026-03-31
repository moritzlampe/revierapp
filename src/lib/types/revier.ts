export type ObjektType = "hochsitz" | "kanzel" | "drueckjagdstand" | "parkplatz" | "kirrung" | "salzlecke" | "wildkamera" | "sonstiges";
export type ZoneType = "jagdzone" | "ruhezone" | "wildschaden";

export type Revier = {
  id: string;
  name: string;
  owner_id: string;
  boundary: GeoJSON.Polygon | null;
  area_ha: number | null;
  bundesland: string | null;
  settings: Record<string, unknown>;
  created_at: string;
};

export type Zone = {
  id: string;
  revier_id: string;
  type: ZoneType;
  name: string;
  polygon: GeoJSON.Polygon;
  color: string;
  created_at: string;
};

export type RevierObjekt = {
  id: string;
  revier_id: string;
  type: ObjektType;
  name: string;
  position: { lat: number; lng: number };
  description: string | null;
  photo_url: string | null;
  zone_id: string | null;
  created_at: string;
};

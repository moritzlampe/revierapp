export type POIType = "hochsitz" | "kanzel" | "parkplatz";

export type POI = {
  name: string;
  type: POIType;
  detail: string;
  lat: number;
  lng: number;
};

export const DEMO_POIS: POI[] = [
  { name: "Eicheneck", type: "hochsitz", detail: "Ansitzleiter · Waldrand Ost", lat: 53.2665, lng: 10.3505 },
  { name: "Fuchsbau", type: "hochsitz", detail: "Geschlossene Kanzel · Südhang", lat: 53.2618, lng: 10.358 },
  { name: "Birkenweg", type: "hochsitz", detail: "Ansitzleiter · Nordrand", lat: 53.268, lng: 10.346 },
  { name: "Südblick", type: "kanzel", detail: "Drückjagdkanzel · Schneise", lat: 53.264, lng: 10.362 },
  { name: "Moorkante", type: "hochsitz", detail: "Ansitzleiter · Feuchtwiese", lat: 53.259, lng: 10.348 },
  { name: "Waldrand", type: "hochsitz", detail: "Ansitzleiter · Feldrand", lat: 53.2695, lng: 10.356 },
  { name: "Lichtung", type: "kanzel", detail: "Kanzel · Lichtung West", lat: 53.263, lng: 10.344 },
  { name: "Parkplatz Nord", type: "parkplatz", detail: "3 Stellplätze · Forstweg", lat: 53.265, lng: 10.349 },
  { name: "Parkplatz Süd", type: "parkplatz", detail: "2 Stellplätze · Kreisstraße", lat: 53.2595, lng: 10.356 },
];

export function getMarkerColor(type: POIType) {
  switch (type) {
    case "hochsitz": return "#E65100";
    case "kanzel": return "#4A7C2E";
    case "parkplatz": return "#1565C0";
  }
}

export function getEmoji(type: POIType) {
  switch (type) {
    case "hochsitz": return "🪵";
    case "kanzel": return "🏠";
    case "parkplatz": return "🅿️";
  }
}

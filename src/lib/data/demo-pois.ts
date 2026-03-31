import type { ObjektType, ZoneType } from "@/lib/types/revier";

// ── Backward compat for guest pages (will be replaced with DB queries) ──
export type POI = {
  name: string;
  type: ObjektType;
  detail: string;
  lat: number;
  lng: number;
};

export const DEMO_POIS: POI[] = [
  { name: "Eicheneck", type: "hochsitz", detail: "Ansitzleiter \u00B7 Waldrand Ost", lat: 53.2665, lng: 10.3505 },
  { name: "Fuchsbau", type: "hochsitz", detail: "Geschlossene Kanzel \u00B7 S\u00FCdhang", lat: 53.2618, lng: 10.358 },
  { name: "Birkenweg", type: "hochsitz", detail: "Ansitzleiter \u00B7 Nordrand", lat: 53.268, lng: 10.346 },
  { name: "S\u00FCdblick", type: "kanzel", detail: "Dr\u00FCckjagdkanzel \u00B7 Schneise", lat: 53.264, lng: 10.362 },
  { name: "Moorkante", type: "hochsitz", detail: "Ansitzleiter \u00B7 Feuchtwiese", lat: 53.259, lng: 10.348 },
  { name: "Waldrand", type: "hochsitz", detail: "Ansitzleiter \u00B7 Feldrand", lat: 53.2695, lng: 10.356 },
  { name: "Lichtung", type: "kanzel", detail: "Kanzel \u00B7 Lichtung West", lat: 53.263, lng: 10.344 },
  { name: "Parkplatz Nord", type: "parkplatz", detail: "3 Stellpl\u00E4tze \u00B7 Forstweg", lat: 53.265, lng: 10.349 },
  { name: "Parkplatz S\u00FCd", type: "parkplatz", detail: "2 Stellpl\u00E4tze \u00B7 Kreisstra\u00DFe", lat: 53.2595, lng: 10.356 },
];

export function getMarkerColor(type: ObjektType): string {
  switch (type) {
    case "hochsitz": return "#E65100";
    case "kanzel": return "#4A7C2E";
    case "parkplatz": return "#1565C0";
    case "kirrung": return "#795548";
    case "salzlecke": return "#B0BEC5";
    case "wildkamera": return "#757575";
    case "drueckjagdstand": return "#C62828";
    case "sonstiges": return "#9E9E9E";
  }
}

export function getEmoji(type: ObjektType): string {
  switch (type) {
    case "hochsitz": return "\u{1FAB5}";
    case "kanzel": return "\u{1F3E0}";
    case "parkplatz": return "\u{1F17F}\uFE0F";
    case "kirrung": return "\u{1F33D}";
    case "salzlecke": return "\u{1F9C2}";
    case "wildkamera": return "\u{1F4F7}";
    case "drueckjagdstand": return "\u{1F3AF}";
    case "sonstiges": return "\u{1F4CD}";
  }
}

export function getIconBg(type: ObjektType): string {
  switch (type) {
    case "hochsitz": return "bg-orange-50";
    case "kanzel": return "bg-green-50";
    case "parkplatz": return "bg-blue-50";
    case "kirrung": return "bg-amber-50";
    case "salzlecke": return "bg-gray-50";
    case "wildkamera": return "bg-gray-100";
    case "drueckjagdstand": return "bg-red-50";
    case "sonstiges": return "bg-gray-50";
  }
}

export function getTypLabel(type: ObjektType): string {
  switch (type) {
    case "hochsitz": return "Hochsitz";
    case "kanzel": return "Kanzel";
    case "parkplatz": return "Parkplatz";
    case "kirrung": return "Kirrung";
    case "salzlecke": return "Salzlecke";
    case "wildkamera": return "Wildkamera";
    case "drueckjagdstand": return "Dr\u00FCckjagdstand";
    case "sonstiges": return "Sonstiges";
  }
}

export function getZoneColor(type: ZoneType): string {
  switch (type) {
    case "jagdzone": return "#6B9F3A";
    case "ruhezone": return "#C62828";
    case "wildschaden": return "#E65100";
  }
}

export function getZoneLabel(type: ZoneType): string {
  switch (type) {
    case "jagdzone": return "Jagdzone";
    case "ruhezone": return "Ruhezone";
    case "wildschaden": return "Wildschadengebiet";
  }
}

"use client";

import { MapContainer, TileLayer, Polygon, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LatLngExpression } from "leaflet";
import { DEMO_POIS, getMarkerColor, getEmoji } from "@/lib/data/demo-pois";
import type { POI } from "@/lib/data/demo-pois";

const BROCKWINKEL_CENTER: LatLngExpression = [53.264, 10.354];

const REVIER_BOUNDARY: LatLngExpression[] = [
  [53.27, 10.342],
  [53.2705, 10.352],
  [53.269, 10.362],
  [53.2665, 10.365],
  [53.262, 10.364],
  [53.258, 10.36],
  [53.257, 10.352],
  [53.2575, 10.344],
  [53.26, 10.339],
  [53.264, 10.338],
  [53.268, 10.34],
  [53.27, 10.342],
];

function createPinIcon(poi: POI) {
  const color = getMarkerColor(poi.type);
  const emoji = getEmoji(poi.type);
  return L.divIcon({
    className: "",
    iconSize: [30, 42],
    iconAnchor: [15, 42],
    popupAnchor: [0, -42],
    html: `
      <div style="position:relative;width:30px;height:42px;">
        <div style="
          width:30px;height:30px;
          background:${color};
          border:2.5px solid white;
          border-radius:50% 50% 50% 0;
          transform:rotate(-45deg);
          box-shadow:0 2px 8px rgba(0,0,0,0.3);
          display:flex;align-items:center;justify-content:center;
        ">
          <span style="transform:rotate(45deg);font-size:14px;line-height:1;">${emoji}</span>
        </div>
        <div style="
          position:absolute;top:-6px;left:36px;
          white-space:nowrap;
          font-size:11px;font-weight:600;
          color:#111;
          text-shadow:0 0 3px white,0 0 3px white,0 0 3px white;
        ">${poi.name}</div>
      </div>
    `,
  });
}

export default function GuestMap({ highlightPOI }: { highlightPOI?: string }) {
  const pois = DEMO_POIS;
  const highlighted = highlightPOI
    ? pois.find(
        (p) =>
          p.name
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/ü/g, "ue")
            .replace(/ö/g, "oe")
            .replace(/ä/g, "ae")
            .replace(/ß/g, "ss") === highlightPOI
      )
    : null;
  const center: LatLngExpression = highlighted
    ? [highlighted.lat, highlighted.lng]
    : BROCKWINKEL_CENTER;
  const zoom = highlighted ? 17 : 15;

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      className="w-full h-full"
      zoomControl={true}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      <Polygon
        positions={REVIER_BOUNDARY}
        pathOptions={{
          color: "#2D5016",
          weight: 3,
          fillColor: "#6B9F3A",
          fillOpacity: 0.06,
          dashArray: "10,6",
        }}
      />
      {pois.map((poi) => (
        <Marker
          key={poi.name}
          position={[poi.lat, poi.lng]}
          icon={createPinIcon(poi)}
        >
          <Popup>
            <div style={{ minWidth: 180, fontFamily: "system-ui, sans-serif" }}>
              <div
                style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}
              >
                {getEmoji(poi.type)} {poi.name}
              </div>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>
                {poi.detail}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "#999",
                  fontFamily: "monospace",
                  marginBottom: 8,
                }}
              >
                {poi.lat.toFixed(5)}, {poi.lng.toFixed(5)}
              </div>
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${poi.lat},${poi.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "block",
                  padding: "6px 8px",
                  fontSize: 11,
                  fontWeight: 600,
                  background: "#2D5016",
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  textAlign: "center",
                  textDecoration: "none",
                }}
              >
                Navigation starten
              </a>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

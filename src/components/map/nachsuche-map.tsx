"use client";

import { MapContainer, TileLayer, Marker, Popup, Circle } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LatLngExpression } from "leaflet";

function createAnschussIcon() {
  return L.divIcon({
    className: "",
    iconSize: [30, 42],
    iconAnchor: [15, 42],
    popupAnchor: [0, -42],
    html: `
      <div style="position:relative;width:30px;height:42px;">
        <div style="
          width:30px;height:30px;
          background:#c62828;
          border:2.5px solid white;
          border-radius:50% 50% 50% 0;
          transform:rotate(-45deg);
          box-shadow:0 2px 8px rgba(0,0,0,0.3);
          display:flex;align-items:center;justify-content:center;
        ">
          <span style="transform:rotate(45deg);font-size:14px;line-height:1;">&#x1F3AF;</span>
        </div>
        <div style="
          position:absolute;top:-6px;left:36px;
          white-space:nowrap;
          font-size:11px;font-weight:600;
          color:#c62828;
          text-shadow:0 0 3px white,0 0 3px white,0 0 3px white;
        ">Anschuss</div>
      </div>
    `,
  });
}

export default function NachsucheMap({
  lat,
  lng,
}: {
  lat: number;
  lng: number;
}) {
  const center: LatLngExpression = [lat, lng];

  return (
    <MapContainer
      center={center}
      zoom={17}
      className="w-full h-full"
      zoomControl={true}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      <Circle
        center={center}
        radius={80}
        pathOptions={{
          color: "#c62828",
          fillColor: "#c62828",
          fillOpacity: 0.08,
          weight: 2,
          dashArray: "6,4",
        }}
      />
      <Marker position={center} icon={createAnschussIcon()}>
        <Popup>
          <div style={{ minWidth: 160, fontFamily: "system-ui, sans-serif" }}>
            <div
              style={{
                fontWeight: 700,
                fontSize: 14,
                color: "#c62828",
                marginBottom: 4,
              }}
            >
              Anschuss-Position
            </div>
            <div
              style={{ fontSize: 11, color: "#999", fontFamily: "monospace" }}
            >
              {lat.toFixed(5)}, {lng.toFixed(5)}
            </div>
          </div>
        </Popup>
      </Marker>
    </MapContainer>
  );
}

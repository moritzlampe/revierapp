"use client";

import { useEffect, useRef, useCallback } from "react";
import { MapContainer, TileLayer, Polygon, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LatLngExpression } from "leaflet";
import { DEMO_POIS, getMarkerColor, getEmoji } from "@/lib/data/demo-pois";
import type { POI } from "@/lib/data/demo-pois";
import { useMapContext } from "./map-context";

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

function MapController() {
  const map = useMap();
  const { selectedPOI, registerFlyTo } = useMapContext();
  const markerRefs = useRef<Map<string, L.Marker>>(new Map());

  const flyTo = useCallback(
    (lat: number, lng: number) => {
      map.flyTo([lat, lng], 17, { duration: 0.8 });
    },
    [map]
  );

  useEffect(() => {
    registerFlyTo(flyTo);
  }, [registerFlyTo, flyTo]);

  useEffect(() => {
    if (selectedPOI) {
      const marker = markerRefs.current.get(selectedPOI.name);
      if (marker) {
        setTimeout(() => marker.openPopup(), 400);
      }
    }
  }, [selectedPOI]);

  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 150);
    return () => clearTimeout(timer);
  }, [map]);

  return null;
}

function setMarkerRef(name: string, ref: L.Marker | null, refs: React.MutableRefObject<Map<string, L.Marker>>) {
  if (ref) {
    refs.current.set(name, ref);
  } else {
    refs.current.delete(name);
  }
}

function POIMarkers() {
  const { selectPOI, openShareModal } = useMapContext();
  const markerRefs = useRef<Map<string, L.Marker>>(new Map());

  return (
    <>
      {DEMO_POIS.map((poi) => (
        <Marker
          key={poi.name}
          position={[poi.lat, poi.lng]}
          icon={createPinIcon(poi)}
          ref={(ref) => setMarkerRef(poi.name, ref, markerRefs)}
          eventHandlers={{
            click: () => selectPOI(poi),
          }}
        >
          <Popup>
            <div style={{ minWidth: 180, fontFamily: "system-ui, sans-serif" }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
                {getEmoji(poi.type)} {poi.name}
              </div>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>
                {poi.detail}
              </div>
              <div style={{ fontSize: 11, color: "#999", fontFamily: "monospace", marginBottom: 8 }}>
                {poi.lat.toFixed(5)}, {poi.lng.toFixed(5)}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => openShareModal(poi)}
                  style={{
                    flex: 1, padding: "6px 8px", fontSize: 11, fontWeight: 600,
                    background: "#2D5016", color: "white", border: "none",
                    borderRadius: 6, cursor: "pointer",
                  }}
                >
                  Gast einweisen
                </button>
                <button style={{
                  flex: 1, padding: "6px 8px", fontSize: 11, fontWeight: 600,
                  background: "#f3f4f6", color: "#374151", border: "none",
                  borderRadius: 6, cursor: "pointer",
                }}>
                  Bearbeiten
                </button>
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  );
}

function LayerManager() {
  const map = useMap();
  const { activeLayer } = useMapContext();
  const layerRef = useRef<L.TileLayer | null>(null);
  const wmsRef = useRef<L.TileLayer.WMS | null>(null);

  useEffect(() => {
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
    if (wmsRef.current) {
      map.removeLayer(wmsRef.current);
      wmsRef.current = null;
    }

    map.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) {
        map.removeLayer(layer);
      }
    });

    if (activeLayer === "osm" || activeLayer === "flur") {
      const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      });
      osm.addTo(map);
      layerRef.current = osm;
    }

    if (activeLayer === "aerial" || activeLayer === "hybrid") {
      const esri = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          attribution: "Tiles &copy; Esri",
        }
      );
      esri.addTo(map);
      layerRef.current = esri;
    }

    if (activeLayer === "flur" || activeLayer === "hybrid") {
      const wms = L.tileLayer.wms(
        "https://opendata.lgln.niedersachsen.de/doorman/noauth/alkis_wms",
        {
          layers: "adv_alkis_flurstuecke",
          format: "image/png",
          transparent: true,
          attribution: "LGLN Niedersachsen",
        }
      );
      wms.addTo(map);
      wmsRef.current = wms;
    }

    return () => {
      // cleanup on unmount
    };
  }, [activeLayer, map]);

  return null;
}

export default function RevierMap() {
  return (
    <MapContainer
      center={BROCKWINKEL_CENTER}
      zoom={15}
      className="w-full h-full"
      zoomControl={true}
    >
      <LayerManager />
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
      <POIMarkers />
      <MapController />
    </MapContainer>
  );
}

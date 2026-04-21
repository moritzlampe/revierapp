"use client";

import { useEffect, useRef, useCallback } from "react";
import { MapContainer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LatLngExpression } from "leaflet";
import { getMarkerColor, getEmoji, getTypLabel } from "@/lib/data/demo-pois";
import type { RevierObjekt, ObjektType } from "@/lib/types/revier";
import { useMapContext } from "./map-context";
import { useRevier } from "@/lib/context/revier-context";
import { BoundaryEditor } from "./boundary-editor";
import { GPXImporter } from "./gpx-importer";
import { MapToast } from "./map-toast";
import { ZoneEditor } from "./zone-editor";
import { ZoneLayers } from "./zone-layers";
import { createClient } from "@/lib/supabase/client";
import { useConfirmSheet } from "@/components/ui/ConfirmSheet";

const BROCKWINKEL_CENTER: LatLngExpression = [53.264, 10.354];

function createPinIcon(type: ObjektType, name: string) {
  const color = getMarkerColor(type);
  const emoji = getEmoji(type);
  const isLight = type === "salzlecke";
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
          border:2.5px solid ${isLight ? "#999" : "white"};
          border-radius:50% 50% 50% 0;
          transform:rotate(-45deg);
          box-shadow:0 2px 8px rgba(0,0,0,0.3);
          display:flex;align-items:center;justify-content:center;
        ">
          <span style="transform:rotate(45deg);font-size:14px;line-height:1;">${emoji}</span>
        </div>
        <div class="m-label" style="
          position:absolute;top:-6px;left:36px;
          white-space:nowrap;
          font-size:11px;font-weight:600;
          color:#111;
          text-shadow:0 0 3px white,0 0 3px white,0 0 3px white;
        ">${name}</div>
      </div>
    `,
  });
}

function MapController() {
  const map = useMap();
  const { registerFlyTo } = useMapContext();

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
    const timer = setTimeout(() => map.invalidateSize(), 150);
    return () => clearTimeout(timer);
  }, [map]);

  return null;
}

/** When hochsitz tool is active, map clicks open the objekt dialog */
function MapClickHandler() {
  const { activeTool, openObjektDialog } = useMapContext();

  useMapEvents({
    click(e) {
      if (activeTool === "hochsitz") {
        openObjektDialog({ position: { lat: e.latlng.lat, lng: e.latlng.lng } });
      }
    },
  });

  return null;
}

function POIMarkers() {
  const {
    objekte,
    selectedObjekt,
    selectObjekt,
    openShareModal,
    openObjektDialog,
    objektDialogState,
    updateObjektDialogPosition,
    loadObjekte,
    showToast,
  } = useMapContext();
  const confirmSheet = useConfirmSheet();
  const markerRefs = useRef<Map<string, L.Marker>>(new Map());

  // Open popup when selected from panel
  useEffect(() => {
    if (selectedObjekt) {
      const marker = markerRefs.current.get(selectedObjekt.id);
      if (marker) {
        setTimeout(() => marker.openPopup(), 400);
      }
    }
  }, [selectedObjekt]);

  const handleDelete = async (objekt: RevierObjekt) => {
    const ok = await confirmSheet({
      title: `„${objekt.name}" löschen?`,
      description: "Das Objekt wird endgültig entfernt.",
      confirmLabel: "Löschen",
      confirmVariant: "danger",
    });
    if (!ok) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("revier_objekte")
      .delete()
      .eq("id", objekt.id);
    if (error) {
      showToast("Fehler beim L\u00F6schen: " + error.message, "error");
      return;
    }
    showToast(`${objekt.name} gel\u00F6scht`, "success");
    await loadObjekte();
  };

  return (
    <>
      {objekte.map((objekt) => {
        const isEditing =
          objektDialogState.open && objektDialogState.objekt?.id === objekt.id;
        const pos =
          isEditing && objektDialogState.position
            ? objektDialogState.position
            : objekt.position;

        return (
          <Marker
            key={objekt.id}
            position={[pos.lat, pos.lng]}
            icon={createPinIcon(objekt.type, objekt.name)}
            draggable={isEditing}
            ref={(ref) => {
              if (ref) markerRefs.current.set(objekt.id, ref);
              else markerRefs.current.delete(objekt.id);
            }}
            eventHandlers={{
              click: () => selectObjekt(objekt),
              dragend: (e) => {
                if (isEditing) {
                  const ll = e.target.getLatLng();
                  updateObjektDialogPosition({ lat: ll.lat, lng: ll.lng });
                }
              },
            }}
          >
            <Popup>
              <div style={{ minWidth: 200, fontFamily: "system-ui, sans-serif" }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>
                  {getEmoji(objekt.type)} {objekt.name}
                </div>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 2 }}>
                  {getTypLabel(objekt.type)}
                </div>
                {objekt.description && (
                  <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>
                    {objekt.description}
                  </div>
                )}
                <div
                  style={{
                    fontSize: 11,
                    color: "#999",
                    fontFamily: "monospace",
                    marginBottom: 8,
                  }}
                >
                  {objekt.position.lat.toFixed(5)}, {objekt.position.lng.toFixed(5)}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={() =>
                      openShareModal({
                        name: objekt.name,
                        lat: objekt.position.lat,
                        lng: objekt.position.lng,
                      })
                    }
                    style={{
                      flex: 1,
                      padding: "6px 8px",
                      fontSize: 11,
                      fontWeight: 600,
                      background: "#2D5016",
                      color: "white",
                      border: "none",
                      borderRadius: 6,
                      cursor: "pointer",
                    }}
                  >
                    Gast einweisen
                  </button>
                  <button
                    onClick={() => openObjektDialog({ objekt })}
                    style={{
                      flex: 1,
                      padding: "6px 8px",
                      fontSize: 11,
                      fontWeight: 600,
                      background: "#f3f4f6",
                      color: "#374151",
                      border: "none",
                      borderRadius: 6,
                      cursor: "pointer",
                    }}
                  >
                    Bearbeiten
                  </button>
                </div>
                <button
                  onClick={() => handleDelete(objekt)}
                  style={{
                    width: "100%",
                    marginTop: 6,
                    padding: "5px 8px",
                    fontSize: 11,
                    fontWeight: 600,
                    background: "white",
                    color: "#DC2626",
                    border: "1px solid #FCA5A5",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  L\u00F6schen
                </button>
              </div>
            </Popup>
          </Marker>
        );
      })}
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
      const osm = L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }
      );
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

/** Load boundary from revier context into map context on mount */
function BoundaryLoader() {
  const { revier } = useRevier();
  const { setBoundary } = useMapContext();

  useEffect(() => {
    if (revier?.boundary) {
      setBoundary(revier.boundary);
    }
  }, [revier, setBoundary]);

  return null;
}

export default function RevierMap() {
  return (
    <>
      <MapContainer
        center={BROCKWINKEL_CENTER}
        zoom={15}
        className="w-full h-full"
        zoomControl={true}
      >
        <LayerManager />
        <BoundaryLoader />
        <BoundaryEditor />
        <GPXImporter />
        <ZoneLayers />
        <ZoneEditor />
        <POIMarkers />
        <MapClickHandler />
        <MapController />
      </MapContainer>
      <MapToast />
    </>
  );
}

"use client";

import { useRef, useCallback, useState } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import * as toGeoJSON from "@tmcw/togeojson";
import JSZip from "jszip";
import * as turf from "@turf/turf";
import { useMapContext } from "./map-context";
import { useRevier } from "@/lib/context/revier-context";
import { createClient } from "@/lib/supabase/client";
import { UploadSimple as Upload, Check, X } from "@phosphor-icons/react";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const PREVIEW_STYLE: L.PathOptions = {
  color: "#4A7C2E",
  weight: 2,
  fillColor: "#6B9F3A",
  fillOpacity: 0.12,
  dashArray: "6,4",
};

export function GPXImporter() {
  const map = useMap();
  const { setBoundary, showToast } = useMapContext();
  const { revier, setRevier } = useRevier();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewLayerRef = useRef<L.Polygon | null>(null);
  const [previewPolygon, setPreviewPolygon] = useState<GeoJSON.Polygon | null>(null);
  const [previewArea, setPreviewArea] = useState<number | null>(null);

  const clearPreview = useCallback(() => {
    if (previewLayerRef.current) {
      map.removeLayer(previewLayerRef.current);
      previewLayerRef.current = null;
    }
    setPreviewPolygon(null);
    setPreviewArea(null);
  }, [map]);

  const showPreview = useCallback(
    (polygon: GeoJSON.Polygon) => {
      clearPreview();
      const coords = polygon.coordinates[0];
      const latLngs = coords.map(([lng, lat]) => L.latLng(lat, lng));
      const layer = L.polygon(latLngs, PREVIEW_STYLE);
      layer.addTo(map);
      previewLayerRef.current = layer;

      const bounds = L.latLngBounds(latLngs);
      map.fitBounds(bounds, { padding: [40, 40] });

      const feature = turf.polygon(polygon.coordinates);
      const areaHa = Math.round((turf.area(feature) / 10000) * 10) / 10;
      setPreviewArea(areaHa);
      setPreviewPolygon(polygon);
    },
    [map, clearPreview]
  );

  const extractPolygon = useCallback((geojson: GeoJSON.FeatureCollection): GeoJSON.Polygon | null => {
    for (const feature of geojson.features) {
      const geom = feature.geometry;
      if (geom.type === "Polygon") {
        return geom as GeoJSON.Polygon;
      }
      if (geom.type === "MultiPolygon") {
        // Take the first polygon from MultiPolygon
        return {
          type: "Polygon",
          coordinates: (geom as GeoJSON.MultiPolygon).coordinates[0],
        };
      }
    }

    // Try to close a LineString into a Polygon
    for (const feature of geojson.features) {
      const geom = feature.geometry;
      if (geom.type === "LineString") {
        const coords = [...(geom as GeoJSON.LineString).coordinates];
        // Close the ring if not already closed
        const first = coords[0];
        const last = coords[coords.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) {
          coords.push([...first]);
        }
        if (coords.length >= 4) {
          return { type: "Polygon", coordinates: [coords] };
        }
      }
      if (geom.type === "MultiLineString") {
        const lines = (geom as GeoJSON.MultiLineString).coordinates;
        for (const line of lines) {
          const coords = [...line];
          const first = coords[0];
          const last = coords[coords.length - 1];
          if (first[0] !== last[0] || first[1] !== last[1]) {
            coords.push([...first]);
          }
          if (coords.length >= 4) {
            return { type: "Polygon", coordinates: [coords] };
          }
        }
      }
    }

    return null;
  }, []);

  const parseGPX = useCallback(
    (content: string) => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, "text/xml");
      const geojson = toGeoJSON.gpx(doc);
      return extractPolygon(geojson as GeoJSON.FeatureCollection);
    },
    [extractPolygon]
  );

  const parseKML = useCallback(
    (content: string) => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, "text/xml");
      const geojson = toGeoJSON.kml(doc);
      return extractPolygon(geojson as GeoJSON.FeatureCollection);
    },
    [extractPolygon]
  );

  const handleFile = useCallback(
    async (file: File) => {
      if (file.size > MAX_FILE_SIZE) {
        showToast("Datei zu groß (max. 10 MB)", "error");
        return;
      }

      const ext = file.name.toLowerCase().split(".").pop();

      try {
        let polygon: GeoJSON.Polygon | null = null;

        if (ext === "gpx") {
          const text = await file.text();
          polygon = parseGPX(text);
        } else if (ext === "kml") {
          const text = await file.text();
          polygon = parseKML(text);
        } else if (ext === "kmz") {
          const zip = await JSZip.loadAsync(file);
          // Find the first .kml file in the archive
          let kmlContent: string | null = null;
          for (const [name, entry] of Object.entries(zip.files)) {
            if (name.toLowerCase().endsWith(".kml") && !entry.dir) {
              kmlContent = await entry.async("string");
              break;
            }
          }
          if (!kmlContent) {
            showToast("Keine KML-Datei im KMZ-Archiv gefunden", "error");
            return;
          }
          polygon = parseKML(kmlContent);
        } else {
          showToast("Nicht unterstütztes Dateiformat. Bitte GPX, KML oder KMZ verwenden.", "error");
          return;
        }

        if (!polygon) {
          showToast("Keine Flächendaten in der Datei gefunden", "error");
          return;
        }

        showPreview(polygon);
      } catch (err) {
        console.error("Import error:", err);
        showToast("Datei konnte nicht gelesen werden: " + (err instanceof Error ? err.message : "Unbekannter Fehler"), "error");
      }
    },
    [parseGPX, parseKML, showPreview, showToast]
  );

  const confirmImport = useCallback(async () => {
    if (!previewPolygon || !revier) return;

    const supabase = createClient();
    const feature = turf.polygon(previewPolygon.coordinates);
    const areaHa = Math.round((turf.area(feature) / 10000) * 10) / 10;

    const { error } = await supabase
      .from("reviere")
      .update({ boundary: previewPolygon, area_ha: areaHa })
      .eq("id", revier.id);

    if (error) {
      showToast("Fehler beim Speichern: " + error.message, "error");
      return;
    }

    setBoundary(previewPolygon);
    setRevier({ ...revier, boundary: previewPolygon, area_ha: areaHa });
    clearPreview();
    showToast(`Reviergrenze importiert (${areaHa} ha)`, "success");
  }, [previewPolygon, revier, setRevier, setBoundary, clearPreview, showToast]);

  const cancelImport = useCallback(() => {
    clearPreview();
  }, [clearPreview]);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".gpx,.kml,.kmz"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          // Reset so same file can be selected again
          e.target.value = "";
        }}
      />

      {/* Export openFilePicker via a global ref so Toolbar can trigger it */}
      <GPXImportTrigger onTrigger={openFilePicker} />

      {/* Confirm/Cancel dialog overlay */}
      {previewPolygon && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] bg-white rounded-xl shadow-lg border border-gray-200 px-5 py-4 flex items-center gap-4">
          <div className="text-sm">
            <div className="font-semibold text-gray-900">Grenze übernehmen?</div>
            <div className="text-gray-500 text-xs mt-0.5">
              {previewArea} ha — aus {fileInputRef.current?.files?.[0]?.name || "Import"}
            </div>
          </div>
          <button
            onClick={confirmImport}
            className="h-8 px-3 rounded-lg bg-ra-green-700 text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-ra-green-600 transition-colors cursor-pointer border-none"
          >
            <Check className="w-3.5 h-3.5" />
            Übernehmen
          </button>
          <button
            onClick={cancelImport}
            className="h-8 px-3 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold flex items-center gap-1.5 hover:bg-gray-200 transition-colors cursor-pointer border-none"
          >
            <X className="w-3.5 h-3.5" />
            Abbrechen
          </button>
        </div>
      )}
    </>
  );
}

// Helper component to expose the file picker trigger to the toolbar via context
// We store the trigger function in a global ref that the toolbar can access
let gpxImportTriggerFn: (() => void) | null = null;

export function triggerGPXImport() {
  gpxImportTriggerFn?.();
}

function GPXImportTrigger({ onTrigger }: { onTrigger: () => void }) {
  gpxImportTriggerFn = onTrigger;
  return null;
}

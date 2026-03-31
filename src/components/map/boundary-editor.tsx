"use client";

import { useEffect, useRef, useCallback } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet-draw";
import "leaflet-draw/dist/leaflet.draw.css";
import { useMapContext } from "./map-context";
import { useRevier } from "@/lib/context/revier-context";
import { createClient } from "@/lib/supabase/client";
import * as turf from "@turf/turf";

// Configure leaflet-draw German translations
L.drawLocal.draw.toolbar.actions.title = "Zeichnen abbrechen";
L.drawLocal.draw.toolbar.actions.text = "Abbrechen";
L.drawLocal.draw.toolbar.finish.title = "Zeichnen beenden";
L.drawLocal.draw.toolbar.finish.text = "Fertig";
L.drawLocal.draw.toolbar.undo.title = "Letzten Punkt entfernen";
L.drawLocal.draw.toolbar.undo.text = "Rückgängig";
L.drawLocal.draw.handlers.polygon.tooltip.start = "Klicken um die Reviergrenze zu zeichnen";
L.drawLocal.draw.handlers.polygon.tooltip.cont = "Weiter klicken um Punkte hinzuzufügen";
L.drawLocal.draw.handlers.polygon.tooltip.end = "Ersten Punkt klicken oder Doppelklick zum Schließen";
L.drawLocal.edit.toolbar.actions.save.title = "Änderungen speichern";
L.drawLocal.edit.toolbar.actions.save.text = "Speichern";
L.drawLocal.edit.toolbar.actions.cancel.title = "Bearbeitung abbrechen";
L.drawLocal.edit.toolbar.actions.cancel.text = "Abbrechen";
L.drawLocal.edit.toolbar.actions.clearAll.title = "Alle Formen löschen";
L.drawLocal.edit.toolbar.actions.clearAll.text = "Alles löschen";
L.drawLocal.edit.toolbar.buttons.edit = "Grenze bearbeiten";
L.drawLocal.edit.toolbar.buttons.editDisabled = "Keine Grenze zum Bearbeiten";
L.drawLocal.edit.toolbar.buttons.remove = "Grenze löschen";
L.drawLocal.edit.toolbar.buttons.removeDisabled = "Keine Grenze zum Löschen";
L.drawLocal.edit.handlers.edit.tooltip.text = "Punkte verschieben zum Bearbeiten";
L.drawLocal.edit.handlers.edit.tooltip.subtext = "Auf Abbrechen klicken um Änderungen zu verwerfen";
L.drawLocal.edit.handlers.remove.tooltip.text = "Auf die Grenze klicken zum Löschen";

const BOUNDARY_STYLE: L.PathOptions = {
  color: "#2D5016",
  weight: 3,
  fillColor: "#6B9F3A",
  fillOpacity: 0.06,
  dashArray: "10,6",
};

const DRAW_STYLE: L.PathOptions = {
  color: "#2D5016",
  weight: 2,
  fillColor: "#6B9F3A",
  fillOpacity: 0.1,
  dashArray: "8,4",
};

export function BoundaryEditor() {
  const map = useMap();
  const { activeTool, boundary, setBoundary, showToast } = useMapContext();
  const { revier, setRevier } = useRevier();

  const featureGroupRef = useRef<L.FeatureGroup>(new L.FeatureGroup());
  const drawControlRef = useRef<L.Control.Draw | null>(null);
  const drawHandlerRef = useRef<L.Draw.Polygon | null>(null);
  const isDrawingRef = useRef(false);
  const editControlRef = useRef<L.Control.Draw | null>(null);
  const activeToolRef = useRef(activeTool);

  // Keep ref in sync so event handlers can check current tool
  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);

  // Convert GeoJSON Polygon to Leaflet LatLngs
  const geoJsonToLatLngs = useCallback((polygon: GeoJSON.Polygon): L.LatLng[] => {
    const coords = polygon.coordinates[0];
    return coords.map(([lng, lat]) => L.latLng(lat, lng));
  }, []);

  // Convert Leaflet layer to GeoJSON Polygon
  const layerToGeoJson = useCallback((layer: L.Polygon): GeoJSON.Polygon => {
    const latLngs = layer.getLatLngs()[0] as L.LatLng[];
    const coordinates = latLngs.map((ll) => [ll.lng, ll.lat]);
    // Close the ring
    if (coordinates.length > 0) {
      const first = coordinates[0];
      const last = coordinates[coordinates.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        coordinates.push([...first]);
      }
    }
    return { type: "Polygon", coordinates: [coordinates] };
  }, []);

  // Calculate area in hectares using turf
  const calculateArea = useCallback((polygon: GeoJSON.Polygon): number => {
    const feature = turf.polygon(polygon.coordinates);
    const areaM2 = turf.area(feature);
    return Math.round((areaM2 / 10000) * 10) / 10; // hectares, 1 decimal
  }, []);

  // Save boundary to Supabase
  const saveBoundary = useCallback(
    async (polygon: GeoJSON.Polygon | null) => {
      if (!revier) return;
      const supabase = createClient();
      const areaHa = polygon ? calculateArea(polygon) : null;

      const { error } = await supabase
        .from("reviere")
        .update({ boundary: polygon, area_ha: areaHa })
        .eq("id", revier.id);

      if (error) {
        showToast("Fehler beim Speichern der Grenze: " + error.message, "error");
        return;
      }

      setBoundary(polygon);
      setRevier({ ...revier, boundary: polygon, area_ha: areaHa });

      if (polygon) {
        showToast(`Reviergrenze gespeichert (${areaHa} ha)`, "success");
      } else {
        showToast("Reviergrenze gelöscht", "info");
      }
    },
    [revier, setRevier, setBoundary, showToast, calculateArea]
  );

  // Render boundary polygon on the feature group
  const renderBoundary = useCallback(
    (polygon: GeoJSON.Polygon) => {
      featureGroupRef.current.clearLayers();
      const latLngs = geoJsonToLatLngs(polygon);
      const layer = L.polygon(latLngs, BOUNDARY_STYLE);
      featureGroupRef.current.addLayer(layer);
    },
    [geoJsonToLatLngs]
  );

  // Add feature group to map on mount
  useEffect(() => {
    const fg = featureGroupRef.current;
    fg.addTo(map);
    return () => {
      map.removeLayer(fg);
    };
  }, [map]);

  // Render existing boundary when it changes
  useEffect(() => {
    if (boundary) {
      renderBoundary(boundary);
    } else {
      featureGroupRef.current.clearLayers();
    }
  }, [boundary, renderBoundary]);

  // Fit map to boundary
  useEffect(() => {
    if (boundary) {
      const latLngs = geoJsonToLatLngs(boundary);
      if (latLngs.length > 0) {
        const bounds = L.latLngBounds(latLngs);
        map.fitBounds(bounds, { padding: [40, 40] });
      }
    }
  }, [boundary, map, geoJsonToLatLngs]);

  // Handle draw/edit mode based on activeTool
  useEffect(() => {
    if (activeTool === "boundary") {
      if (boundary) {
        // Boundary exists: show edit control
        if (!editControlRef.current) {
          const editControl = new L.Control.Draw({
            position: "topright",
            draw: {
              polygon: false,
              polyline: false,
              circle: false,
              rectangle: false,
              marker: false,
              circlemarker: false,
            },
            edit: {
              featureGroup: featureGroupRef.current,
              edit: { selectedPathOptions: { color: "#4A7C2E", weight: 4, dashArray: "" } },
              remove: true,
            },
          });
          editControl.addTo(map);
          editControlRef.current = editControl;
        }
      } else {
        // No boundary: start drawing
        if (!isDrawingRef.current) {
          isDrawingRef.current = true;
          const handler = new L.Draw.Polygon(map as unknown as L.DrawMap, {
            shapeOptions: DRAW_STYLE,
            allowIntersection: false,
            showArea: true,
            metric: true,
          });
          handler.enable();
          drawHandlerRef.current = handler;
        }
      }
    } else {
      // Deactivate drawing/editing
      if (drawHandlerRef.current) {
        drawHandlerRef.current.disable();
        drawHandlerRef.current = null;
        isDrawingRef.current = false;
      }
      if (editControlRef.current) {
        map.removeControl(editControlRef.current);
        editControlRef.current = null;
      }
    }

    return () => {
      if (drawHandlerRef.current) {
        drawHandlerRef.current.disable();
        drawHandlerRef.current = null;
        isDrawingRef.current = false;
      }
      if (editControlRef.current) {
        map.removeControl(editControlRef.current);
        editControlRef.current = null;
      }
    };
  }, [activeTool, boundary, map]);

  // Listen for draw events
  useEffect(() => {
    const onCreated = (e: L.LeafletEvent) => {
      // Only handle if boundary tool is active (zone tool also fires CREATED)
      if (activeToolRef.current !== "boundary") return;
      const event = e as L.DrawEvents.Created;
      const layer = event.layer as L.Polygon;
      const geojson = layerToGeoJson(layer);
      // Don't add to featureGroup — saveBoundary will trigger re-render
      saveBoundary(geojson);
      isDrawingRef.current = false;
      drawHandlerRef.current = null;
    };

    const onEdited = (e: L.LeafletEvent) => {
      const event = e as L.DrawEvents.Edited;
      const layers = event.layers;
      layers.eachLayer((layer) => {
        const geojson = layerToGeoJson(layer as L.Polygon);
        saveBoundary(geojson);
      });
    };

    const onDeleted = () => {
      saveBoundary(null);
    };

    map.on(L.Draw.Event.CREATED, onCreated);
    map.on(L.Draw.Event.EDITED, onEdited);
    map.on(L.Draw.Event.DELETED, onDeleted);

    return () => {
      map.off(L.Draw.Event.CREATED, onCreated);
      map.off(L.Draw.Event.EDITED, onEdited);
      map.off(L.Draw.Event.DELETED, onDeleted);
    };
  }, [map, layerToGeoJson, saveBoundary]);

  return null;
}

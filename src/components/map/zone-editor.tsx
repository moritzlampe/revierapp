"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet-draw";
import { useMapContext } from "./map-context";

const ZONE_DRAW_STYLE: L.PathOptions = {
  color: "#6B9F3A",
  weight: 2,
  fillColor: "#6B9F3A",
  fillOpacity: 0.15,
  dashArray: "6,4",
};

export function ZoneEditor() {
  const map = useMap();
  const { activeTool, openZoneDialog, setActiveTool } = useMapContext();
  const drawHandlerRef = useRef<L.Draw.Polygon | null>(null);
  const isDrawingRef = useRef(false);
  const activeToolRef = useRef(activeTool);

  // Keep ref in sync with state
  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);

  // Start/stop polygon drawing based on active tool
  useEffect(() => {
    if (activeTool === "zone") {
      if (!isDrawingRef.current) {
        isDrawingRef.current = true;
        const handler = new L.Draw.Polygon(map as unknown as L.DrawMap, {
          shapeOptions: ZONE_DRAW_STYLE,
          allowIntersection: false,
          showArea: true,
          metric: true,
        });
        handler.enable();
        drawHandlerRef.current = handler;
      }
    } else {
      if (drawHandlerRef.current) {
        drawHandlerRef.current.disable();
        drawHandlerRef.current = null;
        isDrawingRef.current = false;
      }
    }

    return () => {
      if (drawHandlerRef.current) {
        drawHandlerRef.current.disable();
        drawHandlerRef.current = null;
        isDrawingRef.current = false;
      }
    };
  }, [activeTool, map]);

  // Listen for polygon creation
  useEffect(() => {
    const onCreated = (e: L.LeafletEvent) => {
      // Only handle if zone tool is active
      if (activeToolRef.current !== "zone") return;

      const event = e as L.DrawEvents.Created;
      const layer = event.layer as L.Polygon;
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

      const polygon: GeoJSON.Polygon = {
        type: "Polygon",
        coordinates: [coordinates],
      };

      // Remove the drawn layer (will render from DB after save)
      map.removeLayer(layer);

      // Open zone properties dialog
      openZoneDialog(polygon);

      isDrawingRef.current = false;
      drawHandlerRef.current = null;
      setActiveTool("select");
    };

    map.on(L.Draw.Event.CREATED, onCreated);
    return () => {
      map.off(L.Draw.Event.CREATED, onCreated);
    };
  }, [map, openZoneDialog, setActiveTool]);

  return null;
}

"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { useMapContext } from "./map-context";
import type { ZoneType } from "@/lib/types/revier";
import { getZoneColor } from "@/lib/data/demo-pois";

/** Inject SVG hatch pattern for ruhezonen into the map's SVG layer */
function injectHatchPattern(map: L.Map) {
  const container = map.getContainer();
  const svgEl = container.querySelector(".leaflet-overlay-pane svg");
  if (!svgEl) return;
  let defs = svgEl.querySelector("defs");
  if (!defs) {
    defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    svgEl.insertBefore(defs, svgEl.firstChild);
  }
  if (!defs.querySelector("#ruhezone-hatch")) {
    const pattern = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "pattern"
    );
    pattern.setAttribute("id", "ruhezone-hatch");
    pattern.setAttribute("width", "8");
    pattern.setAttribute("height", "8");
    pattern.setAttribute("patternTransform", "rotate(45)");
    pattern.setAttribute("patternUnits", "userSpaceOnUse");
    const rect = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "rect"
    );
    rect.setAttribute("width", "4");
    rect.setAttribute("height", "8");
    rect.setAttribute("fill", "rgba(198,40,40,0.35)");
    pattern.appendChild(rect);
    defs.appendChild(pattern);
  }
}

function getDefaultColor(type: ZoneType): string {
  return getZoneColor(type);
}

export function ZoneLayers() {
  const map = useMap();
  const { zonen } = useMapContext();
  const layersRef = useRef<L.FeatureGroup>(new L.FeatureGroup());

  // Add feature group to map
  useEffect(() => {
    const fg = layersRef.current;
    fg.addTo(map);
    return () => {
      map.removeLayer(fg);
    };
  }, [map]);

  // Render zones whenever they change
  useEffect(() => {
    layersRef.current.clearLayers();

    if (zonen.length === 0) return;

    // Inject SVG pattern for ruhezone hatching
    injectHatchPattern(map);

    zonen.forEach((zone) => {
      const coords = zone.polygon.coordinates[0].map(
        ([lng, lat]: number[]) => L.latLng(lat, lng)
      );

      const zoneColor = zone.color || getDefaultColor(zone.type);

      const style: L.PathOptions = {
        color: zoneColor,
        weight: 2,
        fillColor: zoneColor,
        fillOpacity: zone.type === "ruhezone" ? 0.12 : 0.2,
      };

      if (zone.type === "ruhezone") {
        style.dashArray = "8,4";
      }

      const polygon = L.polygon(coords, style);
      layersRef.current.addLayer(polygon);

      // Apply hatch pattern for ruhezonen after render
      if (zone.type === "ruhezone") {
        setTimeout(() => {
          const path = (polygon as unknown as { _path?: SVGPathElement })._path;
          if (path) {
            path.setAttribute("fill", "url(#ruhezone-hatch)");
          }
        }, 50);
      }

      // Label in center of zone
      const center = polygon.getBounds().getCenter();
      const label = L.marker(center, {
        icon: L.divIcon({
          className: "",
          html: `<div style="
            white-space:nowrap;font-size:12px;font-weight:600;
            color:${zoneColor};
            text-shadow:0 0 4px white,0 0 4px white,0 0 4px white;
            pointer-events:none;
            transform:translate(-50%,-50%);
          ">${zone.name}</div>`,
          iconSize: [0, 0],
        }),
        interactive: false,
      });
      layersRef.current.addLayer(label);
    });
  }, [zonen, map]);

  return null;
}

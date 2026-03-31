"use client";

import {
  MousePointer2,
  Triangle,
  LayoutGrid,
  MapPin,
  Image,
  Upload,
  Share2,
} from "lucide-react";
import { useMapContext, type Tool } from "@/components/map/map-context";
import { triggerGPXImport } from "@/components/map/gpx-importer";

type Layer = "osm" | "aerial" | "flur" | "hybrid";

export function Toolbar() {
  const { activeTool, setActiveTool, activeLayer, setActiveLayer, openShareModal } = useMapContext();
  const defaultShareTarget = { name: "Revier Brockwinkel", lat: 53.264, lng: 10.354 };

  const tools: { id: Tool; label: string; icon: React.ElementType; group: number }[] = [
    { id: "select", label: "Auswählen", icon: MousePointer2, group: 0 },
    { id: "boundary", label: "Grenze zeichnen", icon: Triangle, group: 0 },
    { id: "zone", label: "Zone", icon: LayoutGrid, group: 0 },
    { id: "hochsitz", label: "Hochsitz", icon: MapPin, group: 1 },
    { id: "photo", label: "Foto", icon: Image, group: 1 },
  ];

  const layers: { id: Layer; label: string }[] = [
    { id: "osm", label: "Karte" },
    { id: "aerial", label: "Luftbild" },
    { id: "flur", label: "Flurstücke" },
    { id: "hybrid", label: "Hybrid" },
  ];

  let lastGroup = -1;

  return (
    <div className="h-[50px] bg-white border-b border-gray-200 flex items-center px-3 gap-1 flex-shrink-0 z-5">
      {tools.map((tool) => {
        const showDivider = lastGroup !== -1 && tool.group !== lastGroup;
        lastGroup = tool.group;
        return (
          <div key={tool.id} className="flex items-center">
            {showDivider && (
              <div className="w-px h-5 bg-gray-200 mx-1.5" />
            )}
            <button
              onClick={() => setActiveTool(tool.id)}
              className={`h-[34px] px-2.5 rounded-[7px] border-none flex items-center gap-1.5 text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                activeTool === tool.id
                  ? "bg-ra-green-100 text-ra-green-800"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              <tool.icon className="w-4 h-4 flex-shrink-0" />
              {tool.label}
            </button>
          </div>
        );
      })}

      {/* GPX Import */}
      <div className="w-px h-5 bg-gray-200 mx-1.5" />
      <button
        onClick={() => triggerGPXImport()}
        className="h-[34px] px-2.5 rounded-[7px] border-none flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 whitespace-nowrap transition-all cursor-pointer"
      >
        <Upload className="w-4 h-4 flex-shrink-0" />
        GPX Import
      </button>

      <div className="flex-1" />

      {/* Layer Toggle */}
      <div className="flex bg-gray-100 rounded-[7px] p-0.5">
        {layers.map((layer) => (
          <button
            key={layer.id}
            onClick={() => setActiveLayer(layer.id)}
            className={`px-3 py-[5px] rounded-[5px] border-none text-[11px] font-semibold cursor-pointer transition-all ${
              activeLayer === layer.id
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {layer.label}
          </button>
        ))}
      </div>

      {/* Share Button */}
      <div className="w-px h-5 bg-gray-200 mx-1.5" />
      <button
        onClick={() => openShareModal(defaultShareTarget)}
        className="h-[34px] px-3 rounded-[7px] border-none bg-ra-green-800 text-white flex items-center gap-1.5 text-xs font-semibold hover:bg-ra-green-700 transition-all cursor-pointer whitespace-nowrap"
      >
        <Share2 className="w-4 h-4 flex-shrink-0" />
        Revier teilen
      </button>
    </div>
  );
}

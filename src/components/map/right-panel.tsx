"use client";

import { useState } from "react";
import { Share2, Pencil, Plus, Upload } from "lucide-react";
import { DEMO_POIS, getEmoji } from "@/lib/data/demo-pois";
import type { POI } from "@/lib/data/demo-pois";
import { useMapContext } from "./map-context";

type Tab = "hochsitze" | "parkplaetze" | "zonen";

function getIconBg(type: POI["type"]) {
  switch (type) {
    case "hochsitz": return "bg-orange-50";
    case "kanzel": return "bg-green-50";
    case "parkplatz": return "bg-blue-50";
  }
}

export function RightPanel() {
  const [activeTab, setActiveTab] = useState<Tab>("hochsitze");
  const { selectedPOI, selectPOI, openShareModal } = useMapContext();

  const tabs: { id: Tab; label: string }[] = [
    { id: "hochsitze", label: "Hochsitze" },
    { id: "parkplaetze", label: "Parkplätze" },
    { id: "zonen", label: "Zonen" },
  ];

  const filteredPois =
    activeTab === "hochsitze"
      ? DEMO_POIS.filter((p) => p.type === "hochsitz" || p.type === "kanzel")
      : activeTab === "parkplaetze"
        ? DEMO_POIS.filter((p) => p.type === "parkplatz")
        : [];

  const hochsitzCount = DEMO_POIS.filter((p) => p.type !== "parkplatz").length;
  const parkplatzCount = DEMO_POIS.filter((p) => p.type === "parkplatz").length;

  return (
    <div className="w-[300px] bg-white border-l border-gray-200 flex flex-col flex-shrink-0 z-5">
      {/* Header */}
      <div className="px-4 pt-3.5 pb-2.5 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
        <div className="text-sm font-semibold text-gray-900">Revierobjekte</div>
        <div className="text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-[10px]">
          {DEMO_POIS.length}
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-3 px-4 py-3 border-b border-gray-200 flex-shrink-0">
        <div className="text-center flex-1">
          <div className="text-lg font-bold text-ra-green-800">{hochsitzCount}</div>
          <div className="text-[10px] text-gray-500">Hochsitze</div>
        </div>
        <div className="text-center flex-1">
          <div className="text-lg font-bold text-ra-green-800">{parkplatzCount}</div>
          <div className="text-[10px] text-gray-500">Parkplätze</div>
        </div>
        <div className="text-center flex-1">
          <div className="text-lg font-bold text-ra-green-800">3</div>
          <div className="text-[10px] text-gray-500">Zonen</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 px-4 flex-shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`py-2.5 mr-4 text-xs font-semibold cursor-pointer border-b-2 transition-all ${
              activeTab === tab.id
                ? "text-ra-green-800 border-ra-green-600"
                : "text-gray-500 border-transparent hover:text-gray-900"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filteredPois.map((poi) => {
          const isSelected = selectedPOI?.name === poi.name;
          return (
            <div
              key={poi.name}
              onClick={() => selectPOI(poi)}
              className={`flex items-start gap-2.5 px-4 py-2.5 border-b border-gray-100 cursor-pointer transition-colors ${
                isSelected
                  ? "bg-ra-green-50 border-l-[3px] border-l-ra-green-600 pl-[13px]"
                  : "hover:bg-gray-50"
              }`}
            >
              <div
                className={`w-[34px] h-[34px] rounded-lg flex items-center justify-center text-[15px] flex-shrink-0 mt-0.5 ${getIconBg(poi.type)}`}
              >
                {getEmoji(poi.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-gray-900">{poi.name}</div>
                <div className="text-[11px] text-gray-500 mt-0.5">{poi.detail}</div>
                <div className="text-[10px] text-gray-300 mt-0.5 font-mono">
                  {poi.lat.toFixed(5)}, {poi.lng.toFixed(5)}
                </div>
              </div>
              <div className="flex gap-0.5 flex-shrink-0 mt-0.5">
                <button
                  onClick={(e) => { e.stopPropagation(); openShareModal(poi); }}
                  className="w-7 h-7 rounded-md flex items-center justify-center text-gray-500 hover:bg-ra-green-100 hover:text-ra-green-800 transition-all"
                >
                  <Share2 className="w-3.5 h-3.5" />
                </button>
                <button className="w-7 h-7 rounded-md flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-all">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
        {activeTab === "zonen" && (
          <div className="p-8 text-center text-sm text-gray-400">
            Noch keine Zonen angelegt.
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-gray-200 flex gap-2 flex-shrink-0">
        <button className="flex-1 py-[9px] rounded-lg bg-ra-green-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-ra-green-700 transition-colors cursor-pointer">
          <Plus className="w-4 h-4" />
          Hinzufügen
        </button>
        <button className="flex-1 py-[9px] rounded-lg bg-gray-100 text-gray-600 text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-gray-200 transition-colors cursor-pointer">
          <Upload className="w-4 h-4" />
          Import
        </button>
      </div>
    </div>
  );
}

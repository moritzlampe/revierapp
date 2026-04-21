"use client";

import { useState } from "react";
import { Share2, Pencil, Plus, Upload, Trash2 } from "lucide-react";
import { getEmoji, getIconBg, getTypLabel, getZoneLabel } from "@/lib/data/demo-pois";
import type { Zone } from "@/lib/types/revier";
import { useMapContext } from "./map-context";
import { createClient } from "@/lib/supabase/client";
import { useConfirmSheet } from "@/components/ui/ConfirmSheet";

type Tab = "hochsitze" | "parkplaetze" | "zonen";

export function RightPanel() {
  const confirmSheet = useConfirmSheet();
  const [activeTab, setActiveTab] = useState<Tab>("hochsitze");
  const {
    objekte,
    zonen,
    selectedObjekt,
    selectObjekt,
    openShareModal,
    openObjektDialog,
    setActiveTool,
    loadZonen,
    showToast,
    flyTo,
  } = useMapContext();

  const tabs: { id: Tab; label: string }[] = [
    { id: "hochsitze", label: "Hochsitze" },
    { id: "parkplaetze", label: "Parkpl\u00E4tze" },
    { id: "zonen", label: "Zonen" },
  ];

  const filteredObjekte =
    activeTab === "hochsitze"
      ? objekte.filter((o) =>
          ["hochsitz", "kanzel", "drueckjagdstand"].includes(o.type)
        )
      : activeTab === "parkplaetze"
        ? objekte.filter((o) => o.type === "parkplatz")
        : [];

  const hochsitzCount = objekte.filter((o) =>
    ["hochsitz", "kanzel", "drueckjagdstand"].includes(o.type)
  ).length;
  const parkplatzCount = objekte.filter(
    (o) => o.type === "parkplatz"
  ).length;

  const handleDeleteZone = async (zone: Zone) => {
    const ok = await confirmSheet({
      title: `Zone „${zone.name}" löschen?`,
      description: "Die Zone wird endgültig entfernt.",
      confirmLabel: "Löschen",
      confirmVariant: "danger",
    });
    if (!ok) return;
    const supabase = createClient();
    const { error } = await supabase.from("zonen").delete().eq("id", zone.id);
    if (error) {
      showToast("Fehler: " + error.message, "error");
      return;
    }
    showToast(`Zone "${zone.name}" gel\u00F6scht`, "success");
    await loadZonen();
  };

  const handleAdd = () => {
    if (activeTab === "zonen") {
      setActiveTool("zone");
      showToast("Klicken Sie auf die Karte, um eine Zone zu zeichnen", "info");
    } else {
      setActiveTool("hochsitz");
      showToast(
        "Klicken Sie auf die Karte, um ein Objekt zu platzieren",
        "info"
      );
    }
  };

  return (
    <div className="w-[300px] bg-white border-l border-gray-200 flex flex-col flex-shrink-0 z-5">
      {/* Header */}
      <div className="px-4 pt-3.5 pb-2.5 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
        <div className="text-sm font-semibold text-gray-900">
          Revierobjekte
        </div>
        <div className="text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-[10px]">
          {objekte.length}
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-3 px-4 py-3 border-b border-gray-200 flex-shrink-0">
        <div className="text-center flex-1">
          <div className="text-lg font-bold text-ra-green-800">
            {hochsitzCount}
          </div>
          <div className="text-[10px] text-gray-500">Hochsitze</div>
        </div>
        <div className="text-center flex-1">
          <div className="text-lg font-bold text-ra-green-800">
            {parkplatzCount}
          </div>
          <div className="text-[10px] text-gray-500">Parkpl\u00E4tze</div>
        </div>
        <div className="text-center flex-1">
          <div className="text-lg font-bold text-ra-green-800">
            {zonen.length}
          </div>
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
        {/* Objekte list (Hochsitze / Parkplätze tabs) */}
        {activeTab !== "zonen" &&
          filteredObjekte.map((objekt) => {
            const isSelected = selectedObjekt?.id === objekt.id;
            return (
              <div
                key={objekt.id}
                onClick={() => selectObjekt(objekt)}
                className={`flex items-start gap-2.5 px-4 py-2.5 border-b border-gray-100 cursor-pointer transition-colors ${
                  isSelected
                    ? "bg-ra-green-50 border-l-[3px] border-l-ra-green-600 pl-[13px]"
                    : "hover:bg-gray-50"
                }`}
              >
                <div
                  className={`w-[34px] h-[34px] rounded-lg flex items-center justify-center text-[15px] flex-shrink-0 mt-0.5 ${getIconBg(objekt.type)}`}
                >
                  {getEmoji(objekt.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-gray-900">
                    {objekt.name}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5">
                    {objekt.description || getTypLabel(objekt.type)}
                  </div>
                  <div className="text-[10px] text-gray-300 mt-0.5 font-mono">
                    {objekt.position.lat.toFixed(5)},{" "}
                    {objekt.position.lng.toFixed(5)}
                  </div>
                </div>
                <div className="flex gap-0.5 flex-shrink-0 mt-0.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openShareModal({
                        name: objekt.name,
                        lat: objekt.position.lat,
                        lng: objekt.position.lng,
                      });
                    }}
                    className="w-7 h-7 rounded-md flex items-center justify-center text-gray-500 hover:bg-ra-green-100 hover:text-ra-green-800 transition-all"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openObjektDialog({ objekt });
                    }}
                    className="w-7 h-7 rounded-md flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-all"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}

        {/* Empty states */}
        {activeTab !== "zonen" && filteredObjekte.length === 0 && (
          <div className="p-8 text-center text-sm text-gray-400">
            {activeTab === "hochsitze"
              ? "Noch keine Hochsitze angelegt."
              : "Noch keine Parkpl\u00E4tze angelegt."}
          </div>
        )}

        {activeTab === "zonen" && zonen.length === 0 && (
          <div className="p-8 text-center text-sm text-gray-400">
            Noch keine Zonen angelegt.
          </div>
        )}

        {/* Zonen list */}
        {activeTab === "zonen" &&
          zonen.map((zone) => (
            <div
              key={zone.id}
              onClick={() => {
                // Fly to zone center
                const coords = zone.polygon.coordinates[0];
                const lats = coords.map(([, lat]: number[]) => lat);
                const lngs = coords.map(([lng]: number[]) => lng);
                const centerLat =
                  (Math.min(...lats) + Math.max(...lats)) / 2;
                const centerLng =
                  (Math.min(...lngs) + Math.max(...lngs)) / 2;
                flyTo(centerLat, centerLng);
              }}
              className="flex items-start gap-2.5 px-4 py-2.5 border-b border-gray-100 cursor-pointer transition-colors hover:bg-gray-50"
            >
              <div
                className="w-[34px] h-[34px] rounded-lg flex-shrink-0 mt-0.5"
                style={{
                  background: zone.color,
                  opacity: 0.6,
                  borderRadius: 8,
                }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-gray-900">
                  {zone.name}
                </div>
                <div className="text-[11px] text-gray-500 mt-0.5">
                  {getZoneLabel(zone.type)}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteZone(zone);
                }}
                className="w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:bg-red-50 hover:text-red-600 transition-all flex-shrink-0 mt-0.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-gray-200 flex gap-2 flex-shrink-0">
        <button
          onClick={handleAdd}
          className="flex-1 py-[9px] rounded-lg bg-ra-green-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-ra-green-700 transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Hinzuf\u00FCgen
        </button>
        <button className="flex-1 py-[9px] rounded-lg bg-gray-100 text-gray-600 text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-gray-200 transition-colors cursor-pointer">
          <Upload className="w-4 h-4" />
          Import
        </button>
      </div>
    </div>
  );
}

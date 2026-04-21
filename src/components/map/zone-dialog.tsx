"use client";

import { useState, useEffect } from "react";
import { X } from "@phosphor-icons/react";
import { useMapContext } from "./map-context";
import { useRevier } from "@/lib/context/revier-context";
import { createClient } from "@/lib/supabase/client";
import type { ZoneType } from "@/lib/types/revier";

const ZONE_TYPES: { id: ZoneType; label: string; defaultColor: string }[] = [
  { id: "jagdzone", label: "Jagdzone", defaultColor: "#6B9F3A" },
  { id: "ruhezone", label: "Ruhezone", defaultColor: "#C62828" },
  { id: "wildschaden", label: "Wildschadengebiet", defaultColor: "#E65100" },
];

const COLOR_PRESETS = [
  "#6B9F3A",
  "#4A7C2E",
  "#2D5016",
  "#C62828",
  "#E65100",
  "#F57C00",
  "#1565C0",
  "#7B1FA2",
  "#795548",
];

export function ZoneDialog() {
  const { zoneDialogState, closeZoneDialog, loadZonen, showToast } =
    useMapContext();
  const { revier } = useRevier();
  const { open, polygon } = zoneDialogState;

  const [name, setName] = useState("");
  const [type, setType] = useState<ZoneType>("jagdzone");
  const [color, setColor] = useState("#6B9F3A");
  const [saving, setSaving] = useState(false);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setName("");
      setType("jagdzone");
      setColor("#6B9F3A");
    }
  }, [open]);

  // Update default color when type changes
  useEffect(() => {
    const found = ZONE_TYPES.find((t) => t.id === type);
    if (found) setColor(found.defaultColor);
  }, [type]);

  if (!open || !polygon) return null;

  const handleSave = async () => {
    if (!name.trim() || !revier) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("zonen").insert({
      revier_id: revier.id,
      name: name.trim(),
      type,
      polygon,
      color,
    });
    if (error) {
      showToast("Fehler: " + error.message, "error");
      setSaving(false);
      return;
    }
    showToast(`Zone "${name}" erstellt`, "success");
    setSaving(false);
    closeZoneDialog();
    await loadZonen();
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeZoneDialog();
      }}
    >
      <div className="bg-white rounded-2xl w-[400px] max-w-[90vw] p-6 shadow-xl relative">
        <button
          onClick={closeZoneDialog}
          className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-lg font-bold text-gray-900 mb-4">Neue Zone</h2>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-ra-green-600 focus:border-transparent"
              placeholder="z.B. Kernzone Nord"
              autoFocus
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Typ
            </label>
            <div className="grid grid-cols-3 gap-2">
              {ZONE_TYPES.map((z) => (
                <button
                  key={z.id}
                  onClick={() => setType(z.id)}
                  className={`py-2.5 px-2 rounded-lg border text-xs font-medium cursor-pointer transition-all ${
                    type === z.id
                      ? "border-ra-green-600 bg-ra-green-50 text-ra-green-800"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {z.label}
                </button>
              ))}
            </div>
          </div>

          {/* Color */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Farbe
            </label>
            <div className="flex gap-2 flex-wrap">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-lg border-2 cursor-pointer transition-all ${
                    color === c
                      ? "border-gray-900 scale-110"
                      : "border-gray-200"
                  }`}
                  style={{ background: c }}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-8 h-8 rounded-lg cursor-pointer border border-gray-200"
              />
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-2 mt-5">
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="flex-1 py-2.5 rounded-lg bg-ra-green-800 text-white text-sm font-semibold hover:bg-ra-green-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Speichern..." : "Zone erstellen"}
          </button>
          <button
            onClick={closeZoneDialog}
            className="px-4 py-2.5 rounded-lg bg-gray-100 text-gray-600 text-sm font-semibold hover:bg-gray-200 transition-colors cursor-pointer"
          >
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  );
}

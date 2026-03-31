"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { useMapContext } from "./map-context";
import { useRevier } from "@/lib/context/revier-context";
import { createClient } from "@/lib/supabase/client";
import { getEmoji, getTypLabel } from "@/lib/data/demo-pois";
import type { ObjektType } from "@/lib/types/revier";

const OBJEKT_TYPES: ObjektType[] = [
  "hochsitz",
  "kanzel",
  "drueckjagdstand",
  "parkplatz",
  "kirrung",
  "salzlecke",
  "wildkamera",
  "sonstiges",
];

export function ObjektDialog() {
  const { objektDialogState, closeObjektDialog, loadObjekte, showToast } =
    useMapContext();
  const { revier } = useRevier();
  const { open, position, objekt } = objektDialogState;

  const [name, setName] = useState("");
  const [type, setType] = useState<ObjektType>("hochsitz");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const isEdit = !!objekt;

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      if (objekt) {
        setName(objekt.name);
        setType(objekt.type);
        setDescription(objekt.description || "");
      } else {
        setName("");
        setType("hochsitz");
        setDescription("");
      }
    }
  }, [open, objekt]);

  if (!open) return null;

  const handleSave = async () => {
    if (!name.trim() || !revier) return;
    setSaving(true);
    const supabase = createClient();

    if (isEdit && objekt) {
      const updates: Record<string, unknown> = {
        name: name.trim(),
        type,
        description: description.trim() || null,
      };
      // Include dragged position if changed
      if (position) {
        updates.position = {
          type: "Point",
          coordinates: [position.lng, position.lat],
        };
      }
      const { error } = await supabase
        .from("revier_objekte")
        .update(updates)
        .eq("id", objekt.id);
      if (error) {
        showToast("Fehler: " + error.message, "error");
        setSaving(false);
        return;
      }
      showToast(`${name} aktualisiert`, "success");
    } else if (position) {
      const { error } = await supabase.from("revier_objekte").insert({
        revier_id: revier.id,
        name: name.trim(),
        type,
        description: description.trim() || null,
        position: {
          type: "Point",
          coordinates: [position.lng, position.lat],
        },
      });
      if (error) {
        showToast("Fehler: " + error.message, "error");
        setSaving(false);
        return;
      }
      showToast(`${name} hinzugef\u00FCgt`, "success");
    }

    setSaving(false);
    closeObjektDialog();
    await loadObjekte();
  };

  const displayPos = position || objekt?.position;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeObjektDialog();
      }}
    >
      <div className="bg-white rounded-2xl w-[400px] max-w-[90vw] p-6 shadow-xl relative">
        <button
          onClick={closeObjektDialog}
          className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-lg font-bold text-gray-900 mb-4">
          {isEdit ? "Objekt bearbeiten" : "Neues Objekt"}
        </h2>

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
              placeholder="z.B. Eicheneck"
              autoFocus
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Typ
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {OBJEKT_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`flex flex-col items-center gap-1 py-2 px-1 rounded-lg border text-xs cursor-pointer transition-all ${
                    type === t
                      ? "border-ra-green-600 bg-ra-green-50 text-ra-green-800"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  <span className="text-base">{getEmoji(t)}</span>
                  <span className="text-[10px] font-medium leading-tight text-center">
                    {getTypLabel(t)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Beschreibung
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-ra-green-600 focus:border-transparent resize-none"
              rows={2}
              placeholder="z.B. Ansitzleiter \u00B7 Waldrand Ost"
            />
          </div>

          {/* Position */}
          {displayPos && (
            <div className="text-xs text-gray-400 font-mono">
              Position: {displayPos.lat.toFixed(5)}, {displayPos.lng.toFixed(5)}
              {isEdit && (
                <span className="text-gray-300 ml-2">
                  (Marker ziehen zum Verschieben)
                </span>
              )}
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="flex gap-2 mt-5">
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="flex-1 py-2.5 rounded-lg bg-ra-green-800 text-white text-sm font-semibold hover:bg-ra-green-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving
              ? "Speichern..."
              : isEdit
                ? "Aktualisieren"
                : "Hinzuf\u00FCgen"}
          </button>
          <button
            onClick={closeObjektDialog}
            className="px-4 py-2.5 rounded-lg bg-gray-100 text-gray-600 text-sm font-semibold hover:bg-gray-200 transition-colors cursor-pointer"
          >
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  );
}

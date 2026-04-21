"use client";

import { useMapContext } from "./map-context";
import { CheckCircle, WarningCircle as AlertCircle, Info } from "@phosphor-icons/react";

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
};

const colors = {
  success: "bg-ra-green-700 text-white",
  error: "bg-red-600 text-white",
  info: "bg-gray-800 text-white",
};

export function MapToast() {
  const { toast } = useMapContext();

  if (!toast) return null;

  const Icon = icons[toast.type];

  return (
    <div className={`absolute top-4 left-1/2 -translate-x-1/2 z-[1000] ${colors[toast.type]} rounded-lg shadow-lg px-4 py-2.5 flex items-center gap-2 text-sm font-medium animate-in fade-in slide-in-from-top-2 duration-200`}>
      <Icon className="w-4 h-4 flex-shrink-0" />
      {toast.message}
    </div>
  );
}

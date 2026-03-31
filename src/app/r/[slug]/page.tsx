"use client";

import dynamic from "next/dynamic";
import { use } from "react";
import { Navigation } from "lucide-react";

const GuestMap = dynamic(() => import("@/components/map/guest-map"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 bg-gray-100 flex items-center justify-center text-gray-400">
      Karte wird geladen...
    </div>
  ),
});

export default function GuestRevierPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);

  const revierName =
    slug === "brockwinkel" || slug === "demo"
      ? "Revier Brockwinkel"
      : `Revier ${decodeURIComponent(slug)}`;

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="bg-ra-green-800 text-white px-4 py-3 flex items-center gap-2.5 shrink-0">
        <div className="w-7 h-7 rounded-lg bg-ra-green-500 flex items-center justify-center text-sm">
          🌲
        </div>
        <div>
          <div className="text-sm font-semibold">{revierName}</div>
          <div className="text-[11px] text-white/50">
            Gäste-Ansicht · Reppenstedt · ~280 ha
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <GuestMap />
      </div>

      {/* Bottom navigation banner */}
      <div className="bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between shrink-0">
        <div>
          <div className="text-[13px] font-semibold text-gray-900">
            Anfahrt zum Revier
          </div>
          <div className="text-[11px] text-gray-500">
            Parkplätze sind auf der Karte markiert
          </div>
        </div>
        <a
          href="https://www.google.com/maps/dir/?api=1&destination=53.264,10.354"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-[13px] font-semibold bg-ra-green-800 text-white hover:bg-ra-green-700 no-underline"
        >
          <Navigation className="w-4 h-4" />
          Navigation starten
        </a>
      </div>
    </div>
  );
}

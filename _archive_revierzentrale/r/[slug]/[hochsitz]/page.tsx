"use client";

import dynamic from "next/dynamic";
import { use } from "react";
import { Navigation, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { DEMO_POIS, getEmoji } from "@/lib/data/demo-pois";

const GuestMap = dynamic(() => import("@/components/map/guest-map"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 bg-gray-100 flex items-center justify-center text-gray-400">
      Karte wird geladen...
    </div>
  ),
});

export default function GuestHochsitzPage({
  params,
}: {
  params: Promise<{ slug: string; hochsitz: string }>;
}) {
  const { slug, hochsitz } = use(params);
  const decoded = decodeURIComponent(hochsitz);

  const poi = DEMO_POIS.find(
    (p) =>
      p.name
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/ü/g, "ue")
        .replace(/ö/g, "oe")
        .replace(/ä/g, "ae")
        .replace(/ß/g, "ss") === decoded
  );

  const poiName = poi?.name ?? decoded;
  const poiDetail = poi?.detail ?? "";
  const navLat = poi?.lat ?? 53.264;
  const navLng = poi?.lng ?? 10.354;

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="bg-ra-green-800 text-white px-4 py-3 flex items-center gap-2.5 shrink-0">
        <Link
          href={`/r/${slug}`}
          className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center hover:bg-white/25 transition-all"
        >
          <ArrowLeft className="w-4 h-4 text-white" />
        </Link>
        <div>
          <div className="text-sm font-semibold">
            {poi ? getEmoji(poi.type) : "🪵"} {poiName}
          </div>
          <div className="text-[11px] text-white/50">
            {poiDetail || `Revier ${slug}`}
          </div>
        </div>
      </div>

      {/* Map centered on specific Hochsitz */}
      <div className="flex-1 relative">
        <GuestMap highlightPOI={decoded} />
      </div>

      {/* Bottom navigation banner */}
      <div className="bg-white border-t border-gray-200 px-4 py-3 shrink-0">
        {poi && (
          <div className="text-[11px] text-gray-500 mb-2 font-mono">
            {poi.lat.toFixed(5)}, {poi.lng.toFixed(5)}
          </div>
        )}
        <div className="flex gap-2">
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${navLat},${navLng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-[13px] font-semibold bg-ra-green-800 text-white hover:bg-ra-green-700 no-underline"
          >
            <Navigation className="w-4 h-4" />
            Navigation starten
          </a>
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${DEMO_POIS.find((p) => p.type === "parkplatz")?.lat ?? navLat},${DEMO_POIS.find((p) => p.type === "parkplatz")?.lng ?? navLng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-[13px] font-semibold bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 no-underline"
          >
            🅿️ Parkplatz
          </a>
        </div>
      </div>
    </div>
  );
}

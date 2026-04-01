"use client";

import { use } from "react";
import dynamic from "next/dynamic";
import {
  Navigation,
  Phone,
  AlertTriangle,
  Clock,
  Crosshair,
} from "lucide-react";

const NachsucheMap = dynamic(() => import("@/components/map/nachsuche-map"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 bg-gray-100 flex items-center justify-center text-gray-400">
      Karte wird geladen...
    </div>
  ),
});

const DEMO_NACHSUCHE = {
  wildart: "Rehbock",
  zeitpunkt: "31.03.2026, 18:30",
  beschreibung:
    "Beschuss auf Rehbock, Flucht Richtung Südost, ca. 80m",
  pirschzeichen: "Schweiß auf Schnee, Kugelriss sichtbar",
  lat: 53.2665,
  lng: 10.3505,
  jaeger: "Moritz Lampe",
  telefon: "+49 170 1234567",
};

export default function NachsuchePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const data = DEMO_NACHSUCHE;

  return (
    <div className="h-screen flex flex-col">
      {/* Red Header */}
      <div className="bg-ra-red text-white px-4 py-3 flex items-center gap-2.5 shrink-0">
        <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center text-sm">
          🐕
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">Nachsuche angefordert</div>
          <div className="text-[11px] text-white/60 truncate">
            {data.wildart} · {data.zeitpunkt}
          </div>
        </div>
        <a
          href={`tel:${data.telefon}`}
          className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-all shrink-0"
        >
          <Phone className="w-4 h-4 text-white" />
        </a>
      </div>

      {/* Map */}
      <div className="flex-1 relative min-h-[35vh]">
        <NachsucheMap lat={data.lat} lng={data.lng} />
      </div>

      {/* Details */}
      <div className="bg-white border-t border-gray-200 overflow-y-auto shrink-0 max-h-[50vh]">
        <div className="px-4 py-4 space-y-3">
          {/* Urgency banner */}
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-100">
            <AlertTriangle className="w-4 h-4 text-ra-red shrink-0" />
            <div className="text-[12px] text-ra-red font-medium">
              Dringende Nachsuche — Bitte schnellstmöglich zum Anschuss
            </div>
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-gray-50 rounded-lg px-3 py-2.5">
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">
                Wildart
              </div>
              <div className="text-[13px] font-semibold text-gray-900">
                {data.wildart}
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg px-3 py-2.5">
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">
                Zeitpunkt
              </div>
              <div className="text-[13px] font-semibold text-gray-900 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                {data.zeitpunkt}
              </div>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg px-3 py-2.5">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">
              Beschreibung
            </div>
            <div className="text-[13px] text-gray-700">
              {data.beschreibung}
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg px-3 py-2.5">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">
              Pirschzeichen
            </div>
            <div className="text-[13px] text-gray-700">
              {data.pirschzeichen}
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg px-3 py-2.5">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">
              Anschuss-Position
            </div>
            <div className="text-[13px] text-gray-700 font-mono flex items-center gap-1">
              <Crosshair className="w-3.5 h-3.5 text-ra-red shrink-0" />
              {data.lat.toFixed(5)}, {data.lng.toFixed(5)}
            </div>
          </div>

          {/* Contact */}
          <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2.5">
            <div className="w-9 h-9 rounded-full bg-ra-green-100 flex items-center justify-center text-[13px] font-bold text-ra-green-800 shrink-0">
              ML
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-gray-900">
                {data.jaeger}
              </div>
              <div className="text-[11px] text-gray-500">{data.telefon}</div>
            </div>
            <a
              href={`tel:${data.telefon}`}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-ra-green-800 text-white no-underline hover:bg-ra-green-700 shrink-0"
            >
              <Phone className="w-3.5 h-3.5" />
              Anrufen
            </a>
          </div>
        </div>

        {/* Navigation button */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 py-3">
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${data.lat},${data.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-lg text-[13px] font-semibold bg-ra-red text-white no-underline hover:opacity-90 transition-all"
          >
            <Navigation className="w-4 h-4" />
            Navigation zum Anschuss starten
          </a>
        </div>
      </div>
    </div>
  );
}

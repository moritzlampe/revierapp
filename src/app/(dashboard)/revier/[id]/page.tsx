"use client";

import { Toolbar } from "@/components/layout/toolbar";
import dynamic from "next/dynamic";
import { RightPanel } from "@/components/map/right-panel";
import { MapProvider } from "@/components/map/map-context";
import { ShareModal } from "@/components/map/share-modal";
import { ObjektDialog } from "@/components/map/objekt-dialog";
import { ZoneDialog } from "@/components/map/zone-dialog";

const RevierMap = dynamic(() => import("@/components/map/revier-map"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 bg-gray-100 flex items-center justify-center text-gray-400">
      Karte wird geladen...
    </div>
  ),
});

export default function RevierKartePage() {
  return (
    <MapProvider>
      <Toolbar />
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 relative">
          <RevierMap />
        </div>
        <RightPanel />
      </div>
      <ShareModal />
      <ObjektDialog />
      <ZoneDialog />
    </MapProvider>
  );
}

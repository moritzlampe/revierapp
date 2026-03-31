"use client";

import { createContext, useContext, useState, useCallback, useRef } from "react";
import type { POI } from "@/lib/data/demo-pois";

type Layer = "osm" | "aerial" | "flur" | "hybrid";

type MapContextValue = {
  activeLayer: Layer;
  setActiveLayer: (layer: Layer) => void;
  selectedPOI: POI | null;
  selectPOI: (poi: POI | null) => void;
  registerFlyTo: (fn: (lat: number, lng: number) => void) => void;
  openShareModal: (poi: POI) => void;
  registerShareModal: (fn: (poi: POI) => void) => void;
};

const MapContext = createContext<MapContextValue | null>(null);

export function MapProvider({ children }: { children: React.ReactNode }) {
  const [activeLayer, setActiveLayer] = useState<Layer>("osm");
  const [selectedPOI, setSelectedPOI] = useState<POI | null>(null);
  const flyToRef = useRef<((lat: number, lng: number) => void) | null>(null);
  const shareModalRef = useRef<((poi: POI) => void) | null>(null);

  const selectPOI = useCallback((poi: POI | null) => {
    setSelectedPOI(poi);
    if (poi && flyToRef.current) {
      flyToRef.current(poi.lat, poi.lng);
    }
  }, []);

  const registerFlyTo = useCallback((fn: (lat: number, lng: number) => void) => {
    flyToRef.current = fn;
  }, []);

  const openShareModal = useCallback((poi: POI) => {
    if (shareModalRef.current) {
      shareModalRef.current(poi);
    }
  }, []);

  const registerShareModal = useCallback((fn: (poi: POI) => void) => {
    shareModalRef.current = fn;
  }, []);

  return (
    <MapContext.Provider
      value={{
        activeLayer,
        setActiveLayer,
        selectedPOI,
        selectPOI,
        registerFlyTo,
        openShareModal,
        registerShareModal,
      }}
    >
      {children}
    </MapContext.Provider>
  );
}

export function useMapContext() {
  const ctx = useContext(MapContext);
  if (!ctx) throw new Error("useMapContext must be used within MapProvider");
  return ctx;
}

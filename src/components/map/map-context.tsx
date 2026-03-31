"use client";

import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import type { RevierObjekt, Zone } from "@/lib/types/revier";
import { useRevier } from "@/lib/context/revier-context";
import { createClient } from "@/lib/supabase/client";

export type Tool = "select" | "boundary" | "zone" | "hochsitz" | "photo";
type Layer = "osm" | "aerial" | "flur" | "hybrid";

export type ShareTarget = { name: string; lat: number; lng: number };

type ObjektDialogState = {
  open: boolean;
  position?: { lat: number; lng: number };
  objekt?: RevierObjekt;
};

type ZoneDialogState = {
  open: boolean;
  polygon?: GeoJSON.Polygon;
};

type MapContextValue = {
  activeLayer: Layer;
  setActiveLayer: (layer: Layer) => void;
  activeTool: Tool;
  setActiveTool: (tool: Tool) => void;
  // Objekte from DB
  objekte: RevierObjekt[];
  loadObjekte: () => Promise<void>;
  selectedObjekt: RevierObjekt | null;
  selectObjekt: (o: RevierObjekt | null) => void;
  // Zonen from DB
  zonen: Zone[];
  loadZonen: () => Promise<void>;
  // Objekt dialog
  objektDialogState: ObjektDialogState;
  openObjektDialog: (opts: { position?: { lat: number; lng: number }; objekt?: RevierObjekt }) => void;
  closeObjektDialog: () => void;
  updateObjektDialogPosition: (pos: { lat: number; lng: number }) => void;
  // Zone dialog
  zoneDialogState: ZoneDialogState;
  openZoneDialog: (polygon: GeoJSON.Polygon) => void;
  closeZoneDialog: () => void;
  // Map navigation
  registerFlyTo: (fn: (lat: number, lng: number) => void) => void;
  flyTo: (lat: number, lng: number) => void;
  // Share
  openShareModal: (target: ShareTarget) => void;
  registerShareModal: (fn: (target: ShareTarget) => void) => void;
  // Boundary state
  boundary: GeoJSON.Polygon | null;
  setBoundary: (b: GeoJSON.Polygon | null) => void;
  // GPX import preview
  importPreview: GeoJSON.Polygon | null;
  setImportPreview: (p: GeoJSON.Polygon | null) => void;
  // Toast messages
  showToast: (msg: string, type?: "success" | "error" | "info") => void;
  toast: { message: string; type: "success" | "error" | "info" } | null;
};

/** Convert PostGIS GeoJSON Point to { lat, lng } */
function parsePosition(pos: unknown): { lat: number; lng: number } {
  if (pos && typeof pos === "object") {
    if ("coordinates" in (pos as Record<string, unknown>)) {
      const coords = (pos as { coordinates: number[] }).coordinates;
      return { lat: coords[1], lng: coords[0] };
    }
    if ("lat" in (pos as Record<string, unknown>)) {
      return pos as { lat: number; lng: number };
    }
  }
  if (typeof pos === "string") {
    try {
      const parsed = JSON.parse(pos);
      if (parsed.coordinates) {
        return { lat: parsed.coordinates[1], lng: parsed.coordinates[0] };
      }
    } catch {
      // WKB hex — not parseable client-side
    }
  }
  return { lat: 0, lng: 0 };
}

const MapContext = createContext<MapContextValue | null>(null);

export function MapProvider({ children }: { children: React.ReactNode }) {
  const { revier } = useRevier();
  const [activeLayer, setActiveLayer] = useState<Layer>("osm");
  const [activeTool, setActiveTool] = useState<Tool>("select");
  const [objekte, setObjekte] = useState<RevierObjekt[]>([]);
  const [zonen, setZonen] = useState<Zone[]>([]);
  const [selectedObjekt, setSelectedObjekt] = useState<RevierObjekt | null>(null);
  const [boundary, setBoundary] = useState<GeoJSON.Polygon | null>(null);
  const [importPreview, setImportPreview] = useState<GeoJSON.Polygon | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [objektDialogState, setObjektDialogState] = useState<ObjektDialogState>({ open: false });
  const [zoneDialogState, setZoneDialogState] = useState<ZoneDialogState>({ open: false });
  const flyToRef = useRef<((lat: number, lng: number) => void) | null>(null);
  const shareModalRef = useRef<((target: ShareTarget) => void) | null>(null);

  // ── Load data from Supabase ───────────────────────────────────────
  const loadObjekte = useCallback(async () => {
    if (!revier) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("revier_objekte")
      .select("*")
      .eq("revier_id", revier.id);
    if (error) {
      console.error("Failed to load objekte:", error);
      return;
    }
    if (data) {
      setObjekte(
        data.map((row: Record<string, unknown>) => ({
          ...row,
          position: parsePosition(row.position),
        })) as RevierObjekt[]
      );
    }
  }, [revier]);

  const loadZonen = useCallback(async () => {
    if (!revier) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("zonen")
      .select("*")
      .eq("revier_id", revier.id);
    if (error) {
      console.error("Failed to load zonen:", error);
      return;
    }
    if (data) {
      setZonen(data as Zone[]);
    }
  }, [revier]);

  useEffect(() => {
    loadObjekte();
    loadZonen();
  }, [loadObjekte, loadZonen]);

  // ── Selection & navigation ────────────────────────────────────────
  const selectObjekt = useCallback((objekt: RevierObjekt | null) => {
    setSelectedObjekt(objekt);
    if (objekt && flyToRef.current) {
      flyToRef.current(objekt.position.lat, objekt.position.lng);
    }
  }, []);

  const flyTo = useCallback((lat: number, lng: number) => {
    if (flyToRef.current) {
      flyToRef.current(lat, lng);
    }
  }, []);

  const registerFlyTo = useCallback((fn: (lat: number, lng: number) => void) => {
    flyToRef.current = fn;
  }, []);

  // ── Share modal ───────────────────────────────────────────────────
  const openShareModal = useCallback((target: ShareTarget) => {
    if (shareModalRef.current) {
      shareModalRef.current(target);
    }
  }, []);

  const registerShareModal = useCallback((fn: (target: ShareTarget) => void) => {
    shareModalRef.current = fn;
  }, []);

  // ── Toast ─────────────────────────────────────────────────────────
  const showToast = useCallback((message: string, type: "success" | "error" | "info" = "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // ── Objekt dialog ─────────────────────────────────────────────────
  const openObjektDialog = useCallback(
    (opts: { position?: { lat: number; lng: number }; objekt?: RevierObjekt }) => {
      setObjektDialogState({ open: true, ...opts });
    },
    []
  );

  const closeObjektDialog = useCallback(() => {
    setObjektDialogState({ open: false });
  }, []);

  const updateObjektDialogPosition = useCallback((pos: { lat: number; lng: number }) => {
    setObjektDialogState((prev) => ({ ...prev, position: pos }));
  }, []);

  // ── Zone dialog ───────────────────────────────────────────────────
  const openZoneDialog = useCallback((polygon: GeoJSON.Polygon) => {
    setZoneDialogState({ open: true, polygon });
  }, []);

  const closeZoneDialog = useCallback(() => {
    setZoneDialogState({ open: false });
  }, []);

  return (
    <MapContext.Provider
      value={{
        activeLayer,
        setActiveLayer,
        activeTool,
        setActiveTool,
        objekte,
        loadObjekte,
        selectedObjekt,
        selectObjekt,
        zonen,
        loadZonen,
        objektDialogState,
        openObjektDialog,
        closeObjektDialog,
        updateObjektDialogPosition,
        zoneDialogState,
        openZoneDialog,
        closeZoneDialog,
        registerFlyTo,
        flyTo,
        openShareModal,
        registerShareModal,
        boundary,
        setBoundary,
        importPreview,
        setImportPreview,
        showToast,
        toast,
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

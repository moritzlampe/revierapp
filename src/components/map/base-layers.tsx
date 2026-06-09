'use client'

import { useState } from 'react'
import { TileLayer, WMSTileLayer } from 'react-leaflet'

/**
 * Geteilte Basiskarten-Layer + Layer-Switcher für RevierMap.
 *
 * Bewusst aus der Hunt-Karte (components/hunt/MapContent.tsx) extrahiert, OHNE
 * MapContent zu berühren — kritischer Hunt-Code bleibt unverändert. Die dortige
 * Inline-Layer-Logik bleibt vorerst als Tech-Debt bestehen (kein Refactor in
 * diesem Sprint). Self-contained: kennt seine WMS-Endpunkte selbst, geht NICHT
 * über lib/map/tiles.ts (das kennt nur BKG TopPlus, keinen WMS-Param-Typ).
 *
 * Verwendung in RevierMap:
 *   <MapContainer>
 *     <BaseLayer activeLayer={baseLayer} />
 *     <CadastreOverlay enabled={cadastreEnabled} onUnavailable={...} />
 *   </MapContainer>
 *   <LayerSwitcher activeLayer={...} onLayerChange={...} ... />   // NEBEN dem Container
 */

// --- Basiskarten-Typen ---

export type BaseLayerKey = 'topo' | 'satellite'

export const LAYER_META: Record<BaseLayerKey, { label: string; icon: string; color: string }> = {
  topo: { label: 'Topo', icon: '🗺️', color: '#4CAF50' },
  satellite: { label: 'Luftbild', icon: '🛰️', color: '#1B5E20' },
}

// --- Basiskarten-Layer (genau einer aktiv; gehört IN den MapContainer) ---

export function BaseLayer({
  activeLayer,
  onWmsLoadingChange,
}: {
  activeLayer: BaseLayerKey
  /** Optional: meldet Lade-Zustand des Luftbild-WMS (z.B. für Lade-Indikator). */
  onWmsLoadingChange?: (loading: boolean) => void
}) {
  if (activeLayer === 'satellite') {
    return (
      <WMSTileLayer
        url="https://opendata.lgln.niedersachsen.de/doorman/noauth/dop_wms"
        params={{ layers: 'ni_dop20', format: 'image/jpeg' }}
        maxZoom={19}
        attribution='&copy; <a href="https://www.lgln.niedersachsen.de">LGLN</a> (2025) CC BY 4.0'
        eventHandlers={onWmsLoadingChange ? {
          loading: () => onWmsLoadingChange(true),
          load: () => onWmsLoadingChange(false),
          tileerror: () => onWmsLoadingChange(false),
        } : undefined}
      />
    )
  }
  // 'topo' (Default): BKG TopPlus, deutschlandweit
  return (
    <TileLayer
      url="https://sgx.geodatenzentrum.de/wmts_topplus_open/tile/1.0.0/web/default/WEBMERCATOR/{z}/{y}/{x}.png"
      attribution='&copy; <a href="https://www.bkg.bund.de">BKG</a> (2025) <a href="https://www.govdata.de/dl-de/by-2-0">dl-de/by-2-0</a>'
      maxZoom={18}
    />
  )
}

// --- Kataster/ALKIS-Overlay (gehört IN den MapContainer) ---

export function CadastreOverlay({
  enabled,
  onUnavailable,
}: {
  enabled: boolean
  /** Wird gerufen, wenn der ALKIS-WMS Tiles nicht liefert (z.B. außerhalb NI). */
  onUnavailable?: () => void
}) {
  if (!enabled) return null
  return (
    <WMSTileLayer
      url="https://opendata.lgln.niedersachsen.de/doorman/noauth/alkis_wms"
      params={{ layers: 'ALKIS', format: 'image/png', transparent: true }}
      maxZoom={19}
      opacity={0.7}
      attribution="&copy; LGLN dl-de/zero-2-0"
      eventHandlers={onUnavailable ? { tileerror: () => onUnavailable() } : undefined}
    />
  )
}

// --- Layer-Switcher (Button 🌐 + Panel; gehört NEBEN den MapContainer) ---

export function LayerSwitcher({
  activeLayer,
  onLayerChange,
  cadastreEnabled,
  onCadastreToggle,
  cadastreAvailable = true,
}: {
  activeLayer: BaseLayerKey
  onLayerChange: (layer: BaseLayerKey) => void
  cadastreEnabled: boolean
  onCadastreToggle: () => void
  cadastreAvailable?: boolean
}) {
  const [open, setOpen] = useState(false)

  function selectLayer(key: BaseLayerKey) {
    onLayerChange(key)
    setOpen(false)
  }

  return (
    <div style={{ position: 'absolute', top: '0.75rem', right: '0.75rem', zIndex: 1000 }}>
      <button className="map-btn" onClick={() => setOpen(!open)} style={{ position: 'relative' }}>
        🌐
      </button>

      {open && (
        <div className="layer-panel">
          <div className="layer-panel-section">
            <span className="layer-panel-label">Basiskarte</span>
            <div className="layer-panel-grid">
              {(Object.entries(LAYER_META) as [BaseLayerKey, { label: string; icon: string; color: string }][]).map(([key, cfg]) => (
                <button
                  key={key}
                  className={`layer-preview${key === activeLayer ? ' active' : ''}`}
                  onClick={() => selectLayer(key)}
                >
                  <div className="layer-preview-tile" style={{ background: cfg.color }}>
                    <span>{cfg.icon}</span>
                  </div>
                  <span className="layer-preview-label">{cfg.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="layer-panel-divider" />

          <div className="layer-panel-section">
            <div className="layer-panel-overlay">
              <span>🏛️ Kataster</span>
              <button
                className={`layer-toggle${cadastreEnabled ? ' on' : ''}${!cadastreAvailable ? ' disabled' : ''}`}
                onClick={cadastreAvailable ? onCadastreToggle : undefined}
                disabled={!cadastreAvailable}
              >
                <span className="layer-toggle-knob" />
              </button>
            </div>
            {!cadastreAvailable && (
              <span className="layer-panel-hint">Nicht verfügbar</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

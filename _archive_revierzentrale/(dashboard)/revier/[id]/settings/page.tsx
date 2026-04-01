"use client";

import { ContentHeader } from "@/components/layout/content-header";
import { useState } from "react";

function Toggle({ defaultOn = false }: { defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <button
      onClick={() => setOn(!on)}
      className={`w-[42px] h-6 rounded-xl relative cursor-pointer transition-colors ${on ? "bg-ra-green-500" : "bg-gray-300"}`}
    >
      <div className={`absolute w-5 h-5 rounded-full bg-white top-0.5 shadow-sm transition-transform ${on ? "translate-x-[18px] left-0.5" : "left-0.5"}`} />
    </button>
  );
}

function SettingRow({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-[18px] py-3.5 border-b border-gray-100 last:border-b-0">
      <div>
        <div className="text-[13px] text-gray-900">{label}</div>
        {desc && <div className="text-[11px] text-gray-500 mt-0.5">{desc}</div>}
      </div>
      <div className="text-[13px] text-gray-500 flex items-center gap-2">{children}</div>
    </div>
  );
}

function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-[10px] border border-gray-200 mb-5 overflow-hidden">
      <div className="px-[18px] py-3.5 text-[13px] font-semibold text-gray-900 border-b border-gray-200 bg-gray-50">
        {title}
      </div>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <ContentHeader
        title="Revier-Einstellungen"
        description="Konfiguration für Revier Brockwinkel"
      />

      <div className="px-8 py-6">
        <SettingsGroup title="Allgemein">
          <SettingRow label="Reviername" desc="Öffentlich sichtbar in geteilten Links">
            <input className="px-3 py-1.5 border border-gray-200 rounded-md text-[13px] w-[200px]" defaultValue="Revier Brockwinkel" />
          </SettingRow>
          <SettingRow label="Fläche" desc="Wird aus Reviergrenzen berechnet">
            ~280 ha (automatisch)
          </SettingRow>
          <SettingRow label="Bundesland">
            Niedersachsen
          </SettingRow>
        </SettingsGroup>

        <SettingsGroup title="Gäste-Links">
          <SettingRow label="Reviergrenze für Gäste anzeigen" desc="Gäste sehen die Reviergrenzen im geteilten Link">
            <Toggle defaultOn />
          </SettingRow>
          <SettingRow label="Alle Hochsitze anzeigen" desc="Oder nur den zugewiesenen Hochsitz">
            <Toggle />
          </SettingRow>
          <SettingRow label="Vorgefertigte WhatsApp-Nachricht" desc="Wird beim Teilen als Text vorgeschlagen">
            <input className="px-3 py-1.5 border border-gray-200 rounded-md text-[13px] w-[200px]" defaultValue="Waidmannsheil! Hier dein Ansitz:" />
          </SettingRow>
        </SettingsGroup>

        <SettingsGroup title="Karte & Daten">
          <SettingRow label="Standard-Kartenlayer">
            OpenStreetMap
          </SettingRow>
          <SettingRow label="Flurstück-Overlay aktivieren" desc="LGLN Niedersachsen WMS-Dienst (kostenlos, CC BY 4.0)">
            <Toggle defaultOn />
          </SettingRow>
          <SettingRow label="Offline-Karten vorladen" desc="Kartendaten für Feldnutzung ohne Internet cachen">
            <Toggle defaultOn />
          </SettingRow>
        </SettingsGroup>

        <SettingsGroup title="Account">
          <SettingRow label="Plan">
            <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-ra-green-100 text-ra-green-800">
              Free — 1 Revier
            </span>
          </SettingRow>
          <SettingRow label="Auf Premium upgraden" desc="Unbegrenzte Reviere, Drückjagd-Modus, erweiterte Exports">
            <button className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-ra-green-800 text-white hover:bg-ra-green-700">
              Upgrade
            </button>
          </SettingRow>
        </SettingsGroup>
      </div>
    </div>
  );
}

"use client";

import { ContentHeader } from "@/components/layout/content-header";
import { Plus, FileText } from "lucide-react";

const DEMO_JES = [
  { name: "H. Weber", js: "JS NI-2024-4829", avatar: "HW", zone: "Nordfeld", wildarten: "Rehwild (3), Schwarzwild (unbegr.)", kontingent: "2 / 3 Reh · 1 SW", bis: "31.03.2027", status: "Aktiv", color: "green" },
  { name: "K. Meier", js: "JS NI-2023-1182", avatar: "KM", zone: "Südwald", wildarten: "Schwarzwild (unbegr.), Fuchs (2)", kontingent: "3 SW · 1 / 2 Fuchs", bis: "31.03.2027", status: "Aktiv", color: "blue" },
  { name: "F. Schmidt", js: "JS SH-2022-7741", avatar: "FS", zone: "Nordfeld + Moor", wildarten: "Rehwild (2), Schwarzwild", kontingent: "1 / 2 Reh · 0 SW", bis: "15.04.2026", status: "Läuft ab", color: "orange" },
  { name: "T. Braun", js: "JS NI-2025-0092", avatar: "TB", zone: "Gesamtrevier", wildarten: "Schwarzwild (unbegr.)", kontingent: "2 SW", bis: "02.04.2026", status: "Kurz-JES", color: "green" },
];

const STATS = [
  { value: "4", label: "Aktive JES", change: "Alle gültig", up: true },
  { value: "1", label: "Läuft bald ab", change: "In 14 Tagen", down: true },
  { value: "18/24", label: "Gesamt Kontingent", change: "75% erfüllt" },
  { value: "2", label: "Kurz-JES (1-3 Tage)", change: "Diesen Monat" },
];

function avatarColor(c: string) {
  if (c === "green") return "bg-[#E8F5E9] text-[#2D5016]";
  if (c === "blue") return "bg-[#E3F2FD] text-[#1565C0]";
  return "bg-[#FFF3E0] text-[#E65100]";
}

function badgeStyle(status: string) {
  if (status === "Aktiv") return "bg-ra-green-100 text-ra-green-800";
  if (status === "Läuft ab") return "bg-orange-50 text-ra-orange";
  if (status === "Kurz-JES") return "bg-blue-50 text-ra-blue";
  return "bg-gray-100 text-gray-600";
}

export default function JesPage() {
  return (
    <div className="flex-1 overflow-y-auto bg-[#f5f7f3]">
      <ContentHeader
        title="Jagderlaubnisscheine"
        description="Begehungsscheine verwalten, Revierteilkarten zuweisen, Kontingente überwachen"
      >
        <button className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-ra-green-800 text-white hover:bg-ra-green-700 flex items-center gap-1.5">
          <Plus className="w-4 h-4" />
          JES ausstellen
        </button>
        <button className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200 flex items-center gap-1.5">
          <FileText className="w-4 h-4" />
          PDF generieren
        </button>
      </ContentHeader>

      <div className="grid grid-cols-4 gap-4 px-8 pt-6">
        {STATS.map((s) => (
          <div key={s.label} className="bg-white rounded-[10px] p-[18px] border border-[#e5e5e5] shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            <div className="text-[28px] font-bold text-ra-green-800">{s.value}</div>
            <div className="text-xs text-gray-500 mt-1">{s.label}</div>
            <div className={`text-[11px] font-semibold mt-2 ${s.up ? "text-ra-green-600" : s.down ? "text-ra-red" : "text-gray-500"}`}>
              {s.change}
            </div>
          </div>
        ))}
      </div>

      <div className="px-8 py-6">
        <table className="w-full border-collapse bg-white rounded-[10px] overflow-hidden border border-gray-200">
          <thead>
            <tr>
              {["Inhaber", "Zone", "Wildarten", "Kontingent", "Gültig bis", "Status", "Aktionen"].map((h) => (
                <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#888] uppercase tracking-wider bg-[#f9f9f9] border-b border-gray-200">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DEMO_JES.map((row) => (
              <tr key={row.name} className="hover:bg-[#f9faf8]">
                <td className="px-4 py-3 text-[13px] border-b border-gray-100">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${avatarColor(row.color)}`}>
                      {row.avatar}
                    </div>
                    <div>
                      <div className="font-semibold">{row.name}</div>
                      <div className="text-[11px] text-gray-500">{row.js}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-[13px] border-b border-gray-100">{row.zone}</td>
                <td className="px-4 py-3 text-[13px] border-b border-gray-100">{row.wildarten}</td>
                <td className="px-4 py-3 text-[13px] border-b border-gray-100">{row.kontingent}</td>
                <td className="px-4 py-3 text-[13px] border-b border-gray-100">{row.bis}</td>
                <td className="px-4 py-3 text-[13px] border-b border-gray-100">
                  <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${badgeStyle(row.status)}`}>
                    {row.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-[13px] border-b border-gray-100">
                  <div className="flex gap-1">
                    <button className="px-2.5 py-1 text-[11px] font-semibold bg-gray-100 text-gray-600 rounded-md border border-gray-200 hover:bg-gray-200">
                      Link senden
                    </button>
                    <button className="px-2.5 py-1 text-[11px] font-semibold bg-gray-100 text-gray-600 rounded-md border border-gray-200 hover:bg-gray-200">
                      ✏️
                    </button>
                    {row.status === "Läuft ab" && (
                      <button
                        className="px-2.5 py-1 text-[11px] font-semibold bg-orange-50 text-ra-orange rounded-md border border-orange-200 hover:bg-orange-100"
                        onClick={() => alert("JES verlängert bis 31.03.2027")}
                      >
                        ↻ Verlängern
                      </button>
                    )}
                    {row.status === "Kurz-JES" && (
                      <button
                        className="px-2.5 py-1 text-[11px] font-semibold bg-red-50 text-red-600 rounded-md border border-red-200 hover:bg-red-100"
                        onClick={() => alert("JES entzogen — " + row.name + " hat keinen Zugang mehr")}
                      >
                        Entziehen
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

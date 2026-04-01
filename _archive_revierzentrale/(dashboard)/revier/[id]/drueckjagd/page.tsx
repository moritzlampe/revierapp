import { ContentHeader } from "@/components/layout/content-header";
import { Plus } from "lucide-react";

export default function DrueckjagdPage() {
  return (
    <div className="flex-1 overflow-y-auto bg-[#f5f7f3]">
      <ContentHeader
        title="Drückjagd-Planung"
        description="Gesellschaftsjagden planen, einladen und durchführen"
      >
        <button className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-ra-green-800 text-white hover:bg-ra-green-700 flex items-center gap-1.5">
          <Plus className="w-4 h-4" />
          Drückjagd anlegen
        </button>
      </ContentHeader>

      <div className="px-8 py-6">
        {/* Event Card */}
        <div className="bg-white rounded-[10px] border border-gray-200 overflow-hidden mb-5">
          <div className="px-5 py-[18px] border-b border-gray-200 flex items-center justify-between">
            <div>
              <div className="text-base font-bold text-gray-900">Herbstdrückjagd Brockwinkel 2026</div>
              <div className="text-xs text-gray-500 mt-0.5">Samstag, 18. Oktober 2026 &middot; 08:00 – 15:00</div>
            </div>
            <span className="inline-block px-3.5 py-1.5 rounded-full text-xs font-semibold bg-orange-50 text-ra-orange">
              Planung
            </span>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-5 divide-x divide-gray-200">
            {[
              { val: "3", label: "Treiben" },
              { val: "24", label: "Stände" },
              { val: "18/24", label: "Zusagen" },
              { val: "6", label: "Hunde" },
              { val: "3", label: "Offen", highlight: true },
            ].map((s) => (
              <div key={s.label} className="py-3.5 text-center">
                <div className={`text-[22px] font-bold ${s.highlight ? "text-ra-orange" : "text-ra-green-800"}`}>{s.val}</div>
                <div className="text-[10px] text-gray-500">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="px-5 py-3.5 border-t border-gray-200 flex gap-2">
            <button className="px-3.5 py-[7px] rounded-lg text-xs font-semibold bg-ra-green-800 text-white hover:bg-ra-green-700">
              🗺️ Treiben planen
            </button>
            <button className="px-3.5 py-[7px] rounded-lg text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200">
              ✉️ Einladungen senden
            </button>
            <button className="px-3.5 py-[7px] rounded-lg text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200">
              👥 Stände zuweisen
            </button>
            <button className="px-3.5 py-[7px] rounded-lg text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200">
              📋 Teilnehmerliste
            </button>
            <button className="px-3.5 py-[7px] rounded-lg text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200">
              🕐 Zeitplan
            </button>
          </div>
        </div>

        {/* Treiben Table */}
        <div className="text-[13px] font-semibold text-gray-900 mb-3">Treiben-Übersicht</div>
        <table className="w-full border-collapse bg-white rounded-[10px] overflow-hidden border border-gray-200 mb-5">
          <thead>
            <tr>
              {["Treiben", "Zeitplan", "Stände", "Hundeführer", "Fläche", "Status"].map((h) => (
                <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#888] uppercase tracking-wider bg-[#f9f9f9] border-b border-gray-200">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { name: "Treiben 1 — Nordwald", zeit: "08:30 – 10:00", staende: "8 Stände", hunde: "2 Gespanne", flaeche: "~45 ha", status: "Fertig geplant", statusColor: "green" },
              { name: "Treiben 2 — Südfeld", zeit: "10:30 – 12:00", staende: "10 Stände", hunde: "3 Gespanne", flaeche: "~60 ha", status: "Fertig geplant", statusColor: "green" },
              { name: "Treiben 3 — Moorkante", zeit: "13:00 – 14:30", staende: "6 Stände", hunde: "1 Gespann", flaeche: "~30 ha", status: "Stände offen", statusColor: "orange" },
            ].map((row) => (
              <tr key={row.name} className="hover:bg-[#f9faf8]">
                <td className="px-4 py-3 text-[13px] font-semibold border-b border-gray-100">{row.name}</td>
                <td className="px-4 py-3 text-[13px] border-b border-gray-100">{row.zeit}</td>
                <td className="px-4 py-3 text-[13px] border-b border-gray-100">{row.staende}</td>
                <td className="px-4 py-3 text-[13px] border-b border-gray-100">{row.hunde}</td>
                <td className="px-4 py-3 text-[13px] border-b border-gray-100">{row.flaeche}</td>
                <td className="px-4 py-3 text-[13px] border-b border-gray-100">
                  <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                    row.statusColor === "green" ? "bg-ra-green-100 text-ra-green-800" : "bg-orange-50 text-ra-orange"
                  }`}>
                    {row.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* RSVP Table */}
        <div className="text-[13px] font-semibold text-gray-900 mb-3">RSVP-Übersicht</div>
        <table className="w-full border-collapse bg-white rounded-[10px] overflow-hidden border border-gray-200">
          <thead>
            <tr>
              {["Schütze", "Zusage", "Auto 4x4", "Hund", "Schießnachw.", "Übernachtung", "Stand"].map((h) => (
                <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#888] uppercase tracking-wider bg-[#f9f9f9] border-b border-gray-200">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { name: "H. Weber", status: "Zugesagt", sc: "green", auto: "Ja", hund: "DD — Bracke", sn: true, ueb: "Nein", stand: "Stand 3" },
              { name: "K. Meier", status: "Zugesagt", sc: "green", auto: "Ja (2 Pl.)", hund: "Nein", sn: true, ueb: "Ja", stand: "Stand 7" },
              { name: "F. Schmidt", status: "Zugesagt", sc: "green", auto: "Nein", hund: "Nein", sn: true, ueb: "Nein", stand: "—" },
              { name: "A. Müller", status: "Offen", sc: "orange", auto: "—", hund: "—", sn: false, ueb: "—", stand: "—" },
              { name: "J. Koch", status: "Abgesagt", sc: "gray", auto: "—", hund: "—", sn: false, ueb: "—", stand: "—" },
            ].map((row) => (
              <tr key={row.name} className="hover:bg-[#f9faf8]">
                <td className="px-4 py-3 text-[13px] font-semibold border-b border-gray-100">{row.name}</td>
                <td className="px-4 py-3 text-[13px] border-b border-gray-100">
                  <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                    row.sc === "green" ? "bg-ra-green-100 text-ra-green-800" : row.sc === "orange" ? "bg-orange-50 text-ra-orange" : "bg-gray-100 text-gray-600"
                  }`}>{row.status}</span>
                </td>
                <td className="px-4 py-3 text-[13px] border-b border-gray-100">{row.auto}</td>
                <td className="px-4 py-3 text-[13px] border-b border-gray-100">{row.hund}</td>
                <td className="px-4 py-3 text-[13px] border-b border-gray-100">{row.sn ? "✅" : "—"}</td>
                <td className="px-4 py-3 text-[13px] border-b border-gray-100">{row.ueb}</td>
                <td className="px-4 py-3 text-[13px] border-b border-gray-100">{row.stand}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

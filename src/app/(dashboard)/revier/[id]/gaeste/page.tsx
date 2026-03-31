import { ContentHeader } from "@/components/layout/content-header";
import { Plus } from "lucide-react";

const DEMO = [
  { name: "Heinrich Weber", js: "Jagdschein NI-2024-4829", avatar: "HW", telefon: "+49 171 234 5678", letzter: "15.03.2026", besuche: 6, strecke: "2 Stück" },
  { name: "Karl Meier", js: "Jagdschein NI-2023-1182", avatar: "KM", telefon: "+49 172 876 5432", letzter: "18.02.2026", besuche: 3, strecke: "1 Stück" },
  { name: "Frank Schmidt", js: "Jagdschein SH-2022-7741", avatar: "FS", telefon: "+49 160 112 3344", letzter: "10.01.2026", besuche: 1, strecke: "0 Stück" },
];

const AVATAR_COLORS = [
  "bg-[#E8F5E9] text-[#2D5016]",   // grün
  "bg-[#E3F2FD] text-[#1565C0]",   // blau
  "bg-[#FFF3E0] text-[#E65100]",   // orange
];

function avatarColor(index: number) {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

export default function GaestePage() {
  return (
    <div className="flex-1 overflow-y-auto bg-[#f5f7f3]">
      <ContentHeader
        title="Jagdgäste"
        description="Gäste verwalten und einweisen"
      >
        <button className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-ra-green-800 text-white hover:bg-ra-green-700 flex items-center gap-1.5">
          <Plus className="w-4 h-4" />
          Gast einladen
        </button>
      </ContentHeader>

      <div className="px-8 py-6">
        <table className="w-full border-collapse bg-white rounded-[10px] overflow-hidden border border-gray-200">
          <thead>
            <tr>
              {["Name", "Telefon", "Letzter Besuch", "Besuche", "Strecke", "Aktionen"].map((h) => (
                <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#888] uppercase tracking-wider bg-[#f9f9f9] border-b border-gray-200">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DEMO.map((row, i) => (
              <tr key={row.name} className="hover:bg-[#f9faf8]">
                <td className="px-4 py-3 text-[13px] border-b border-gray-100">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${avatarColor(i)}`}>
                      {row.avatar}
                    </div>
                    <div>
                      <div className="font-semibold">{row.name}</div>
                      <div className="text-[11px] text-gray-500">{row.js}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-[13px] border-b border-gray-100">{row.telefon}</td>
                <td className="px-4 py-3 text-[13px] border-b border-gray-100">{row.letzter}</td>
                <td className="px-4 py-3 text-[13px] border-b border-gray-100">{row.besuche}</td>
                <td className="px-4 py-3 text-[13px] border-b border-gray-100">{row.strecke}</td>
                <td className="px-4 py-3 text-[13px] border-b border-gray-100">
                  <button className="px-3 py-1.5 text-[11px] font-semibold bg-gray-100 text-gray-600 rounded-md border border-gray-200 hover:bg-gray-200">
                    Einweisen
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

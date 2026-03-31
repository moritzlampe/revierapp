import { ContentHeader } from "@/components/layout/content-header";
import { Plus, Download } from "lucide-react";

const DEMO_STRECKE = [
  { datum: "28.03.2026", wildart: "Rehbock", emoji: "🦌", geschlecht: "Männlich", gewicht: "14,2 kg", hochsitz: "Eicheneck", jaeger: "M. Lampe", status: "Gemeldet" },
  { datum: "22.03.2026", wildart: "Frischling", emoji: "🐗", geschlecht: "Weiblich", gewicht: "18,5 kg", hochsitz: "Fuchsbau", jaeger: "M. Lampe", status: "Gemeldet" },
  { datum: "15.03.2026", wildart: "Fuchs", emoji: "🦊", geschlecht: "Männlich", gewicht: "6,1 kg", hochsitz: "Moorkante", jaeger: "Gast: H. Weber", status: "Gemeldet" },
  { datum: "08.03.2026", wildart: "Ricke", emoji: "🦌", geschlecht: "Weiblich", gewicht: "16,8 kg", hochsitz: "Südblick", jaeger: "M. Lampe", status: "Gemeldet" },
  { datum: "01.03.2026", wildart: "Überläufer", emoji: "🐗", geschlecht: "Männlich", gewicht: "42,0 kg", hochsitz: "Birkenweg", jaeger: "M. Lampe", status: "Gemeldet" },
  { datum: "18.02.2026", wildart: "Bache", emoji: "🐗", geschlecht: "Weiblich", gewicht: "55,3 kg", hochsitz: "Lichtung", jaeger: "Gast: K. Meier", status: "Gemeldet" },
  { datum: "02.02.2026", wildart: "Rehbock", emoji: "🦌", geschlecht: "Männlich", gewicht: "15,1 kg", hochsitz: "Waldrand", jaeger: "M. Lampe", status: "Nachsuche" },
];

const STATS = [
  { value: "12", label: "Gesamt Saison 25/26", change: "+3 ggü. Vorjahr", up: true },
  { value: "5", label: "Rehwild", change: "Abschussplan: 8", up: true },
  { value: "4", label: "Schwarzwild", change: "Kein Limit" },
  { value: "3", label: "Raubwild", change: "2 Fuchs, 1 Marder" },
];

export default function StreckePage() {
  return (
    <div className="flex-1 overflow-y-auto bg-[#f5f7f3]">
      <ContentHeader
        title="Streckenbuch"
        description="Dokumentation aller erlegten Stücke im Revier Brockwinkel"
      >
        <button className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-ra-green-800 text-white hover:bg-ra-green-700 flex items-center gap-1.5">
          <Plus className="w-4 h-4" />
          Strecke melden
        </button>
        <button className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200 flex items-center gap-1.5">
          <Download className="w-4 h-4" />
          Export PDF
        </button>
      </ContentHeader>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4 px-8 pt-6">
        {STATS.map((s) => (
          <div key={s.label} className="bg-white rounded-[10px] p-[18px] border border-[#e5e5e5] shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            <div className="text-[28px] font-bold text-ra-green-800">{s.value}</div>
            <div className="text-xs text-gray-500 mt-1">{s.label}</div>
            <div className={`text-[11px] font-semibold mt-2 ${s.up ? "text-ra-green-600" : "text-gray-500"}`}>
              {s.change}
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="px-8 py-6">
        <table className="w-full border-collapse bg-white rounded-[10px] overflow-hidden border border-gray-200">
          <thead>
            <tr>
              {["Datum", "Wildart", "Geschlecht", "Gewicht", "Hochsitz", "Jäger", "Status"].map((h) => (
                <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#888] uppercase tracking-wider bg-[#f9f9f9] border-b border-gray-200">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DEMO_STRECKE.map((row, i) => (
              <tr key={i} className="hover:bg-[#f9faf8]">
                <td className="px-4 py-3 text-[13px] border-b border-gray-100">{row.datum}</td>
                <td className="px-4 py-3 text-[13px] border-b border-gray-100">
                  <span className="flex items-center gap-1.5">{row.emoji} {row.wildart}</span>
                </td>
                <td className="px-4 py-3 text-[13px] border-b border-gray-100">{row.geschlecht}</td>
                <td className="px-4 py-3 text-[13px] border-b border-gray-100">{row.gewicht}</td>
                <td className="px-4 py-3 text-[13px] border-b border-gray-100">{row.hochsitz}</td>
                <td className="px-4 py-3 text-[13px] border-b border-gray-100">{row.jaeger}</td>
                <td className="px-4 py-3 text-[13px] border-b border-gray-100">
                  <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                    row.status === "Nachsuche"
                      ? "bg-orange-50 text-ra-orange"
                      : "bg-ra-green-100 text-ra-green-800"
                  }`}>
                    {row.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

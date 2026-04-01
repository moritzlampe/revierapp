import { ContentHeader } from "@/components/layout/content-header";
import { Plus } from "lucide-react";

const DEMO = [
  { datum: "29.03.2026", typ: "Wildschaden", typColor: "orange", ort: "Feld Nordwest", beschreibung: "Schwarzwild-Schaden im Winterweizen, ca. 200m²", jaeger: "M. Lampe" },
  { datum: "26.03.2026", typ: "Wildwechsel", typColor: "blue", ort: "Waldrand Ost", beschreibung: "Regelmäßiger Rehwild-Wechsel zwischen Wald und Feld", jaeger: "M. Lampe" },
  { datum: "20.03.2026", typ: "Kirrung", typColor: "green", ort: "Fuchsbau Süd", beschreibung: "Kirrung aufgefrischt, 5 kg Mais", jaeger: "M. Lampe" },
  { datum: "14.03.2026", typ: "Wildwechsel", typColor: "blue", ort: "Moorkante", beschreibung: "Schwarzwild-Suhle entdeckt, frische Spuren", jaeger: "Gast: H. Weber" },
  { datum: "08.03.2026", typ: "Salzlecke", typColor: "gray", ort: "Lichtung West", beschreibung: "Salzleckstein erneuert", jaeger: "M. Lampe" },
];

function badgeStyle(color: string) {
  if (color === "orange") return "bg-orange-50 text-ra-orange";
  if (color === "blue") return "bg-blue-50 text-ra-blue";
  if (color === "green") return "bg-ra-green-100 text-ra-green-800";
  return "bg-gray-100 text-gray-600";
}

export default function BeobachtungenPage() {
  return (
    <div className="flex-1 overflow-y-auto bg-[#f5f7f3]">
      <ContentHeader
        title="Beobachtungen"
        description="Revierbeobachtungen, Wildwechsel, Schäden und Kirrungen"
      >
        <button className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-ra-green-800 text-white hover:bg-ra-green-700 flex items-center gap-1.5">
          <Plus className="w-4 h-4" />
          Beobachtung eintragen
        </button>
        <button className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200">
          Auf Karte anzeigen
        </button>
      </ContentHeader>

      <div className="px-8 py-6">
        <table className="w-full border-collapse bg-white rounded-[10px] overflow-hidden border border-gray-200">
          <thead>
            <tr>
              {["Datum", "Typ", "Ort", "Beschreibung", "Jäger"].map((h) => (
                <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#888] uppercase tracking-wider bg-[#f9f9f9] border-b border-gray-200">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DEMO.map((row, i) => (
              <tr key={i} className="hover:bg-[#f9faf8]">
                <td className="px-4 py-3 text-[13px] border-b border-gray-100">{row.datum}</td>
                <td className="px-4 py-3 text-[13px] border-b border-gray-100">
                  <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${badgeStyle(row.typColor)}`}>
                    {row.typ}
                  </span>
                </td>
                <td className="px-4 py-3 text-[13px] border-b border-gray-100">{row.ort}</td>
                <td className="px-4 py-3 text-[13px] border-b border-gray-100">{row.beschreibung}</td>
                <td className="px-4 py-3 text-[13px] border-b border-gray-100">{row.jaeger}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

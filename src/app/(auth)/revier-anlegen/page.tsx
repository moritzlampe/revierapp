"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const BUNDESLAENDER = [
  "Baden-Württemberg",
  "Bayern",
  "Berlin",
  "Brandenburg",
  "Bremen",
  "Hamburg",
  "Hessen",
  "Mecklenburg-Vorpommern",
  "Niedersachsen",
  "Nordrhein-Westfalen",
  "Rheinland-Pfalz",
  "Saarland",
  "Sachsen",
  "Sachsen-Anhalt",
  "Schleswig-Holstein",
  "Thüringen",
];

export default function RevierAnlegenPage() {
  const [name, setName] = useState("");
  const [bundesland, setBundesland] = useState("");
  const [flaeche, setFlaeche] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Nicht angemeldet. Bitte erneut einloggen.");
      setLoading(false);
      return;
    }

    const { data: revier, error: insertError } = await supabase
      .from("reviere")
      .insert({
        name,
        owner_id: user.id,
        bundesland: bundesland || null,
        area_ha: flaeche ? parseFloat(flaeche) : null,
        settings: {},
      })
      .select()
      .single();

    if (insertError) {
      setError("Revier konnte nicht angelegt werden: " + insertError.message);
      setLoading(false);
      return;
    }

    router.push(`/revier/${revier.id}`);
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-ra-green-500 flex items-center justify-center text-xl mx-auto mb-4">
            🌲
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            Revier anlegen
          </h1>
          <p className="text-sm text-gray-500 mt-2">
            Erstelle dein erstes Jagdrevier, um loszulegen
          </p>
        </div>
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl border border-gray-200 p-6"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reviername *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z.B. Revier Brockwinkel"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ra-green-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Bundesland
              </label>
              <select
                value={bundesland}
                onChange={(e) => setBundesland(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ra-green-500 focus:border-transparent bg-white"
              >
                <option value="">Bitte wählen...</option>
                {BUNDESLAENDER.map((bl) => (
                  <option key={bl} value={bl}>
                    {bl}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Geschätzte Fläche (ha)
              </label>
              <input
                type="number"
                value={flaeche}
                onChange={(e) => setFlaeche(e.target.value)}
                placeholder="z.B. 280"
                min="0"
                step="0.1"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ra-green-500 focus:border-transparent"
              />
            </div>
            {error && (
              <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-ra-green-800 text-white font-semibold text-sm hover:bg-ra-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Wird angelegt..." : "Revier anlegen"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

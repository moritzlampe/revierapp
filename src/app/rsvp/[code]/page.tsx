"use client";

import { use, useState } from "react";
import {
  CalendarDays,
  Clock,
  MapPin,
  Send,
  Check,
  Upload,
} from "lucide-react";

export default function RsvpPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const [submitted, setSubmitted] = useState(false);
  const [zusage, setZusage] = useState<"ja" | "nein" | "vielleicht" | null>(
    null
  );
  const [auto4x4, setAuto4x4] = useState<boolean | null>(null);
  const [hund, setHund] = useState<boolean | null>(null);
  const [schiessnachweis, setSchiessnachweis] = useState<boolean | null>(null);
  const [uebernachtung, setUebernachtung] = useState<boolean | null>(null);

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-xl border border-gray-200 p-6 text-center">
          <div className="w-12 h-12 rounded-xl bg-ra-green-100 flex items-center justify-center mx-auto mb-4">
            <Check className="w-6 h-6 text-ra-green-800" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            Antwort gesendet!
          </h1>
          <p className="text-sm text-gray-500">
            Deine Antwort für die Herbstdrückjagd Brockwinkel 2026 wurde
            übermittelt. Der Jagdleiter wird sich bei dir melden.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="bg-ra-green-800 text-white px-6 py-5 text-center">
          <div className="w-12 h-12 rounded-xl bg-ra-green-500 flex items-center justify-center text-xl mx-auto mb-3">
            🌲
          </div>
          <h1 className="text-lg font-bold">Drückjagd-Einladung</h1>
          <p className="text-sm text-white/60 mt-1">
            Du wurdest zur Drückjagd eingeladen
          </p>
        </div>

        {/* Event Details */}
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <div className="text-base font-bold text-gray-900 mb-2">
            Herbstdrückjagd Brockwinkel 2026
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <CalendarDays className="w-4 h-4 text-gray-400 shrink-0" />
              Samstag, 18. Oktober 2026
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Clock className="w-4 h-4 text-gray-400 shrink-0" />
              08:00 – 15:00 Uhr
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
              Revier Brockwinkel, Reppenstedt
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">
              Name
            </label>
            <input
              type="text"
              placeholder="Dein vollständiger Name"
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-ra-green-500 focus:border-transparent"
            />
          </div>

          {/* Zusage */}
          <div>
            <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">
              Teilnahme
            </label>
            <div className="flex gap-2">
              {(
                [
                  {
                    value: "ja" as const,
                    label: "Zusagen",
                    active: "bg-ra-green-800 text-white border-transparent",
                  },
                  {
                    value: "nein" as const,
                    label: "Absagen",
                    active: "bg-red-600 text-white border-transparent",
                  },
                  {
                    value: "vielleicht" as const,
                    label: "Vielleicht",
                    active: "bg-orange-500 text-white border-transparent",
                  },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setZusage(opt.value)}
                  className={`flex-1 py-2.5 rounded-lg text-[13px] font-semibold transition-all cursor-pointer border ${
                    zusage === opt.value
                      ? opt.active
                      : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Auto 4x4 */}
          <ToggleField
            label="Auto 4x4 verfügbar?"
            value={auto4x4}
            onChange={setAuto4x4}
          >
            {auto4x4 && (
              <input
                type="number"
                min={1}
                max={8}
                placeholder="Anzahl freie Plätze"
                className="mt-2 w-full px-3 py-2.5 rounded-lg border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-ra-green-500 focus:border-transparent"
              />
            )}
          </ToggleField>

          {/* Hund */}
          <ToggleField label="Hund dabei?" value={hund} onChange={setHund}>
            {hund && (
              <input
                type="text"
                placeholder="Rasse des Hundes"
                className="mt-2 w-full px-3 py-2.5 rounded-lg border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-ra-green-500 focus:border-transparent"
              />
            )}
          </ToggleField>

          {/* Schießnachweis */}
          <ToggleField
            label="Schießnachweis vorhanden?"
            value={schiessnachweis}
            onChange={setSchiessnachweis}
          >
            {schiessnachweis && (
              <label className="mt-2 flex items-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-gray-300 text-[13px] text-gray-500 cursor-pointer hover:bg-gray-50">
                <Upload className="w-4 h-4 shrink-0" />
                Nachweis hochladen (optional)
                <input
                  type="file"
                  className="hidden"
                  accept="image/*,.pdf"
                />
              </label>
            )}
          </ToggleField>

          {/* Übernachtung */}
          <ToggleField
            label="Übernachtung benötigt?"
            value={uebernachtung}
            onChange={setUebernachtung}
          />

          {/* Anmerkungen */}
          <div>
            <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">
              Anmerkungen
            </label>
            <textarea
              placeholder="Sonstige Hinweise..."
              rows={3}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-ra-green-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Submit */}
          <button
            type="button"
            onClick={() => setSubmitted(true)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-[13px] font-semibold bg-ra-green-800 text-white hover:bg-ra-green-700 transition-all cursor-pointer"
          >
            <Send className="w-4 h-4" />
            Antwort senden
          </button>
        </div>
      </div>
    </div>
  );
}

function ToggleField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">
        {label}
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`flex-1 py-2.5 rounded-lg text-[13px] font-semibold transition-all cursor-pointer border ${
            value === true
              ? "bg-ra-green-800 text-white border-transparent"
              : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
          }`}
        >
          Ja
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`flex-1 py-2.5 rounded-lg text-[13px] font-semibold transition-all cursor-pointer border ${
            value === false
              ? "bg-gray-200 text-gray-700 border-transparent"
              : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
          }`}
        >
          Nein
        </button>
      </div>
      {children}
    </div>
  );
}

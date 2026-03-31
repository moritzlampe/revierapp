"use client";

import { useState } from "react";
import { ContentHeader } from "@/components/layout/content-header";
import { Plus, CalendarDays, List, ChevronLeft, ChevronRight } from "lucide-react";

const DEMO = [
  { datum: "2026-04-04", display: "04.04.2026", typ: "Ansitz", typColor: "green", titel: "Abendansitz Rehwild", teilnehmer: "M. Lampe", bereich: "Eicheneck", status: "Geplant", statusColor: "blue" },
  { datum: "2026-04-12", display: "12.04.2026", typ: "Ansitz", typColor: "green", titel: "Morgenansitz", teilnehmer: "M. Lampe, H. Weber", bereich: "Fuchsbau, Südblick", status: "Geplant", statusColor: "blue" },
  { datum: "2026-10-18", display: "18.10.2026", typ: "Drückjagd", typColor: "orange", titel: "Herbstdrückjagd Brockwinkel", teilnehmer: "12 Schützen (offen)", bereich: "Gesamtrevier", status: "Entwurf", statusColor: "gray" },
  { datum: "2026-03-28", display: "28.03.2026", typ: "Ansitz", typColor: "green", titel: "Abendansitz Schwarzwild", teilnehmer: "M. Lampe", bereich: "Birkenweg", status: "Erledigt", statusColor: "green" },
];

function badgeStyle(color: string) {
  if (color === "green") return "bg-ra-green-100 text-ra-green-800";
  if (color === "orange") return "bg-orange-50 text-ra-orange";
  if (color === "blue") return "bg-blue-50 text-ra-blue";
  return "bg-gray-100 text-gray-600";
}

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MONTH_NAMES = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1; // Monday = 0
}

export default function KalenderPage() {
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [currentMonth, setCurrentMonth] = useState(3); // April (0-indexed)
  const [currentYear, setCurrentYear] = useState(2026);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);

  const eventsThisMonth = DEMO.filter((e) => {
    const d = new Date(e.datum);
    return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
  });

  const eventsByDay = new Map<number, typeof DEMO>();
  eventsThisMonth.forEach((e) => {
    const day = new Date(e.datum).getDate();
    if (!eventsByDay.has(day)) eventsByDay.set(day, []);
    eventsByDay.get(day)!.push(e);
  });

  const selectedEvents = selectedDate
    ? DEMO.filter((e) => e.datum === selectedDate)
    : [];

  function prevMonth() {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
    setSelectedDate(null);
  }

  function nextMonth() {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
    setSelectedDate(null);
  }

  const today = new Date();
  const isToday = (day: number) =>
    today.getFullYear() === currentYear && today.getMonth() === currentMonth && today.getDate() === day;

  return (
    <div className="flex-1 overflow-y-auto bg-[#f5f7f3]">
      <ContentHeader
        title="Jagdkalender"
        description="Ansitze planen, Drückjagden organisieren, Termine verwalten"
      >
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5 border border-gray-200">
          <button
            onClick={() => setView("calendar")}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors ${
              view === "calendar" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            Kalender
          </button>
          <button
            onClick={() => setView("list")}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors ${
              view === "list" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <List className="w-3.5 h-3.5" />
            Liste
          </button>
        </div>
        <button className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-ra-green-800 text-white hover:bg-ra-green-700 flex items-center gap-1.5">
          <Plus className="w-4 h-4" />
          Termin anlegen
        </button>
      </ContentHeader>

      <div className="px-8 py-6">
        {view === "calendar" ? (
          <div>
            {/* Month Navigation */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={prevMonth}
                className="p-1.5 rounded-lg hover:bg-white border border-gray-200 bg-white shadow-sm"
              >
                <ChevronLeft className="w-4 h-4 text-gray-600" />
              </button>
              <h2 className="text-[16px] font-bold text-gray-900">
                {MONTH_NAMES[currentMonth]} {currentYear}
              </h2>
              <button
                onClick={nextMonth}
                className="p-1.5 rounded-lg hover:bg-white border border-gray-200 bg-white shadow-sm"
              >
                <ChevronRight className="w-4 h-4 text-gray-600" />
              </button>
            </div>

            {/* Calendar Grid */}
            <div className="bg-white rounded-[10px] border border-[#e5e5e5] overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
              {/* Weekday Headers */}
              <div className="grid grid-cols-7 border-b border-gray-200">
                {WEEKDAYS.map((d) => (
                  <div key={d} className="text-center py-2.5 text-[11px] font-semibold text-[#888] uppercase tracking-wider bg-[#f9f9f9]">
                    {d}
                  </div>
                ))}
              </div>

              {/* Days */}
              <div className="grid grid-cols-7">
                {/* Empty cells for days before first day */}
                {Array.from({ length: firstDay }).map((_, i) => (
                  <div key={`empty-${i}`} className="min-h-[80px] border-b border-r border-gray-100 bg-gray-50/50" />
                ))}

                {/* Actual days */}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const dayEvents = eventsByDay.get(day) || [];
                  const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const isSelected = selectedDate === dateStr;
                  const hasEvents = dayEvents.length > 0;

                  return (
                    <div
                      key={day}
                      onClick={() => hasEvents ? setSelectedDate(isSelected ? null : dateStr) : undefined}
                      className={`min-h-[80px] border-b border-r border-gray-100 p-1.5 transition-colors ${
                        hasEvents ? "cursor-pointer hover:bg-[#f9faf8]" : ""
                      } ${isSelected ? "bg-[#E8F0E0]" : ""}`}
                    >
                      <div className={`text-[12px] font-medium mb-1 ${
                        isToday(day)
                          ? "w-6 h-6 rounded-full bg-ra-green-800 text-white flex items-center justify-center"
                          : "text-gray-700 pl-1"
                      }`}>
                        {day}
                      </div>
                      <div className="flex flex-col gap-0.5">
                        {dayEvents.map((e, ei) => (
                          <div
                            key={ei}
                            className={`text-[10px] font-medium px-1.5 py-0.5 rounded truncate ${
                              e.typColor === "green"
                                ? "bg-ra-green-100 text-ra-green-800"
                                : "bg-orange-50 text-ra-orange"
                            }`}
                          >
                            {e.titel}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Selected Day Details */}
            {selectedEvents.length > 0 && (
              <div className="mt-4 bg-white rounded-[10px] border border-[#e5e5e5] shadow-[0_1px_3px_rgba(0,0,0,0.08)] overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200 bg-[#f9f9f9]">
                  <div className="text-[13px] font-semibold text-gray-900">
                    Termine am {selectedEvents[0].display}
                  </div>
                </div>
                {selectedEvents.map((e, i) => (
                  <div key={i} className="px-4 py-3 border-b border-gray-100 last:border-b-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${badgeStyle(e.typColor)}`}>
                        {e.typ}
                      </span>
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${badgeStyle(e.statusColor)}`}>
                        {e.status}
                      </span>
                    </div>
                    <div className="text-[14px] font-semibold text-gray-900">{e.titel}</div>
                    <div className="text-[12px] text-gray-500 mt-0.5">
                      {e.teilnehmer} &middot; {e.bereich}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* List View */
          <table className="w-full border-collapse bg-white rounded-[10px] overflow-hidden border border-[#e5e5e5] shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            <thead>
              <tr>
                {["Datum", "Typ", "Titel", "Teilnehmer", "Hochsitz / Bereich", "Status"].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#888] uppercase tracking-wider bg-[#f9f9f9] border-b border-gray-200">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DEMO.map((row, i) => (
                <tr key={i} className="hover:bg-[#f9faf8]">
                  <td className="px-4 py-3 text-[13px] border-b border-gray-100">{row.display}</td>
                  <td className="px-4 py-3 text-[13px] border-b border-gray-100">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${badgeStyle(row.typColor)}`}>
                      {row.typ}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[13px] border-b border-gray-100">{row.titel}</td>
                  <td className="px-4 py-3 text-[13px] border-b border-gray-100">{row.teilnehmer}</td>
                  <td className="px-4 py-3 text-[13px] border-b border-gray-100">{row.bereich}</td>
                  <td className="px-4 py-3 text-[13px] border-b border-gray-100">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${badgeStyle(row.statusColor)}`}>
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

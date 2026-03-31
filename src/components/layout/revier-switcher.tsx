"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, Plus } from "lucide-react";

export function RevierSwitcher() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      {/* Dropdown (opens upward) */}
      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-1 mx-2 bg-[#1a3409] border border-white/10 rounded-lg shadow-lg overflow-hidden z-50">
          <button
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 w-full px-3.5 py-2.5 hover:bg-white/[0.06] transition-colors text-left"
          >
            <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-semibold text-white truncate">Revier Brockwinkel</div>
              <div className="text-[10px] text-white/35">Reppenstedt &middot; ~280 ha</div>
            </div>
            <Check className="w-3.5 h-3.5 text-ra-green-500 flex-shrink-0" />
          </button>
          <div className="border-t border-white/8">
            <button
              onClick={() => {
                setOpen(false);
                alert("Neues Revier anlegen — kommt in einer zukünftigen Version");
              }}
              className="flex items-center gap-2 w-full px-3.5 py-2.5 hover:bg-white/[0.06] transition-colors text-left"
            >
              <Plus className="w-3.5 h-3.5 text-white/40" />
              <span className="text-[12px] text-white/50 font-medium">Neues Revier anlegen</span>
            </button>
          </div>
        </div>
      )}

      {/* Trigger */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2.5 px-4 py-3.5 border-t border-white/8 hover:bg-white/[0.04] transition-colors cursor-pointer w-full text-left"
      >
        <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold truncate">
            Revier Brockwinkel
          </div>
          <div className="text-[11px] text-white/35">
            Reppenstedt &middot; ~280 ha
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-white/30 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
    </div>
  );
}

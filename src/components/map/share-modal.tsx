"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Copy, Check } from "@phosphor-icons/react";
import { useMapContext, type ShareTarget } from "./map-context";

export function ShareModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [target, setTarget] = useState<ShareTarget | null>(null);
  const [copied, setCopied] = useState(false);
  const { registerShareModal } = useMapContext();

  const openModal = useCallback((t: ShareTarget) => {
    setTarget(t);
    setIsOpen(true);
    setCopied(false);
  }, []);

  useEffect(() => {
    registerShareModal(openModal);
  }, [registerShareModal, openModal]);

  if (!isOpen || !target) return null;

  const slug = target.name.toLowerCase().replace(/\s+/g, "-").replace(/ü/g, "ue").replace(/ö/g, "oe").replace(/ä/g, "ae").replace(/ß/g, "ss");
  const link = `revierapp.de/r/brockwinkel/${slug}`;
  const message = `${target.name}\n\nHallo! Morgen Ansitz auf ${target.name}.\nHier findest du Anfahrt und Karte:\n${link}\n\nParkplatz ist markiert. Waidmannsheil!`;
  const waLink = `https://wa.me/?text=${encodeURIComponent(message)}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`https://${link}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) setIsOpen(false);
      }}
    >
      <div className="bg-white rounded-2xl w-[440px] max-w-[90vw] p-7 shadow-xl relative">
        {/* Close button */}
        <button
          onClick={() => setIsOpen(false)}
          className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Title */}
        <h2 className="text-lg font-bold text-gray-900 mb-1">
          Gast einweisen — {target.name}
        </h2>
        <p className="text-sm text-gray-500 mb-5">
          Teile Anfahrt und Kartenlink per WhatsApp oder kopiere den Link.
        </p>

        {/* Preview */}
        <div className="bg-gray-50 rounded-xl p-4 mb-5 border border-gray-100">
          <div className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">
            <strong>{target.name}</strong>
            {"\n\n"}Hallo! Morgen Ansitz auf {target.name}.
            {"\n"}Hier findest du Anfahrt und Karte:
            {"\n"}
            <span className="text-blue-600 underline">{link}</span>
            {"\n\n"}Parkplatz ist markiert. Waidmannsheil!
          </div>
        </div>

        {/* Buttons */}
        <div className="flex flex-col gap-2">
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-white font-semibold text-sm transition-all hover:opacity-90 no-underline"
            style={{ background: "#25D366" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Per WhatsApp teilen
          </a>
          <button
            onClick={handleCopy}
            className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-white text-gray-700 font-semibold text-sm border border-gray-200 hover:bg-gray-50 transition-all cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-green-600" />
                Link kopiert!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Link kopieren
              </>
            )}
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="py-2.5 px-4 text-sm text-gray-500 hover:text-gray-700 transition-all cursor-pointer bg-transparent border-none"
          >
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  );
}

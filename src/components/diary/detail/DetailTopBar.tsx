'use client'

import { useRouter } from 'next/navigation'

/**
 * Top-Bar der Tagebuch-Detailseite (Mockup V3 .topbar).
 * Back nutzt router.back(). Teilen/Mehr-Optionen sind v1 reine Stubs
 * ohne Handler (Phase 60.5+). CSS unter .tagebuch-surface .topbar.
 */
export function DetailTopBar({ title }: { title: string }) {
  const router = useRouter()
  return (
    <header className="topbar">
      <button
        type="button"
        className="chrome-btn"
        aria-label="Zurück"
        onClick={() => router.back()}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>
      <div className="top-title">{title}</div>
      <div className="right-actions">
        <button type="button" className="chrome-btn" aria-label="Teilen">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
            <path d="M12 16V4" />
            <path d="m8 8 4-4 4 4" />
          </svg>
        </button>
        <button
          type="button"
          className="chrome-btn"
          aria-label="Mehr Optionen"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="1" />
            <circle cx="12" cy="5" r="1" />
            <circle cx="12" cy="19" r="1" />
          </svg>
        </button>
      </div>
    </header>
  )
}

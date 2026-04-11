'use client'

// TODO: Vor Production loeschen — reine Test-Seite fuer PhotoCapture

import { useState } from 'react'
import PhotoCapture, {
  QUALITY_PRESETS,
  type PhotoQuality,
} from '@/components/photo/PhotoCapture'

interface TestResult {
  quality: PhotoQuality
  originalName: string
  sizeMB: string
  width: number
  height: number
  type: string
  timestamp: string
}

function PresetCard({ quality }: { quality: PhotoQuality }) {
  const [results, setResults] = useState<TestResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const preset = QUALITY_PRESETS[quality]

  const handleCapture = async (file: File) => {
    setError(null)

    const dimensions = await new Promise<{ width: number; height: number }>(
      (resolve) => {
        const img = new Image()
        img.onload = () => {
          resolve({ width: img.naturalWidth, height: img.naturalHeight })
          URL.revokeObjectURL(img.src)
        }
        img.onerror = () => {
          resolve({ width: 0, height: 0 })
          URL.revokeObjectURL(img.src)
        }
        img.src = URL.createObjectURL(file)
      },
    )

    setResults((prev) => [
      {
        quality,
        originalName: file.name,
        sizeMB: (file.size / 1024 / 1024).toFixed(3),
        width: dimensions.width,
        height: dimensions.height,
        type: file.type,
        timestamp: new Date().toLocaleTimeString('de-DE'),
      },
      ...prev,
    ])
  }

  const handleError = (err: Error) => {
    setError(err.message)
  }

  const labels: Record<PhotoQuality, string> = {
    chat: 'Chat',
    avatar: 'Avatar',
    documentation: 'Dokumentation',
  }

  return (
    <div
      style={{
        background: 'var(--surface)',
        borderRadius: 'var(--radius)',
        padding: '1rem',
        marginBottom: '1rem',
      }}
    >
      <h2
        style={{
          color: 'var(--green-bright)',
          fontSize: '1rem',
          fontWeight: 600,
          marginBottom: '0.25rem',
        }}
      >
        {labels[quality]}
      </h2>
      <p
        style={{
          color: 'var(--text-3)',
          fontSize: '0.8125rem',
          marginBottom: '0.75rem',
        }}
      >
        max {preset.maxWidthOrHeight}px · Q{preset.quality} · ≤{preset.maxSizeMB} MB
      </p>

      <PhotoCapture
        quality={quality}
        onCapture={handleCapture}
        onError={handleError}
      />

      {error && (
        <p
          style={{
            color: 'var(--red)',
            fontSize: '0.8125rem',
            marginTop: '0.5rem',
          }}
        >
          Fehler: {error}
        </p>
      )}

      {results.map((r, i) => (
        <div
          key={i}
          style={{
            marginTop: '0.5rem',
            padding: '0.625rem',
            background: 'var(--surface-2)',
            borderRadius: '0.5rem',
            fontSize: '0.8125rem',
            color: 'var(--text-2)',
            lineHeight: 1.6,
          }}
        >
          <div>
            <strong style={{ color: 'var(--text)' }}>{r.timestamp}</strong>{' '}
            — {r.originalName}
          </div>
          <div>
            {r.width}×{r.height}px · {r.sizeMB} MB · {r.type}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function PhotoCaptureTestPage() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'var(--bg)',
        color: 'var(--text)',
        padding: '1rem',
        fontFamily: 'var(--font-sans, "DM Sans", sans-serif)',
      }}
    >
      <h1
        style={{
          fontSize: '1.25rem',
          fontWeight: 700,
          marginBottom: '0.5rem',
        }}
      >
        PhotoCapture Test
      </h1>
      <p
        style={{
          color: 'var(--text-3)',
          fontSize: '0.8125rem',
          marginBottom: '1.5rem',
        }}
      >
        Waehle in jeder Karte ein Foto und pruefe Groesse + Dimensionen.
      </p>

      <PresetCard quality="chat" />
      <PresetCard quality="avatar" />
      <PresetCard quality="documentation" />
    </div>
  )
}

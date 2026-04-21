'use client'

import { useRef, useState, type ReactNode, type ChangeEvent } from 'react'
import { Camera, CircleNotch } from '@phosphor-icons/react'
import imageCompression from 'browser-image-compression'

// ============================================================
// Quality-Presets
// ============================================================

export type PhotoQuality = 'chat' | 'avatar' | 'documentation'

export const QUALITY_PRESETS: Record<
  PhotoQuality,
  { maxWidthOrHeight: number; quality: number; maxSizeMB: number }
> = {
  chat:          { maxWidthOrHeight: 1200, quality: 0.80, maxSizeMB: 0.5 },
  avatar:        { maxWidthOrHeight: 400,  quality: 0.85, maxSizeMB: 0.1 },
  documentation: { maxWidthOrHeight: 2000, quality: 0.85, maxSizeMB: 1.2 },
}

// ============================================================
// Props
// ============================================================

interface PhotoCaptureProps {
  quality: PhotoQuality
  onCapture: (file: File) => void | Promise<void>
  onError?: (error: Error) => void
  disabled?: boolean
  children?: ReactNode // Optionaler Custom-Trigger
  /** 'choose' = iOS-Auswahl (Kamera/Mediathek/Dateien), 'camera' = direkt Kamera */
  mode?: 'camera' | 'choose'
}

// ============================================================
// Hilfsfunktion: HEIC → JPEG konvertieren
// ============================================================

function istHeic(file: File): boolean {
  if (
    file.type === 'image/heic' ||
    file.type === 'image/heif'
  ) return true
  const name = file.name.toLowerCase()
  return name.endsWith('.heic') || name.endsWith('.heif')
}

async function konvertiereHeic(file: File): Promise<File> {
  const heic2any = (await import('heic2any')).default
  const blob = await heic2any({
    blob: file,
    toType: 'image/jpeg',
    quality: 0.92,
  })
  // heic2any kann ein Array oder einen einzelnen Blob zurueckgeben
  const result = Array.isArray(blob) ? blob[0] : blob
  const jpegName = file.name.replace(/\.(heic|heif)$/i, '.jpg')
  return new File([result], jpegName, { type: 'image/jpeg' })
}

// ============================================================
// Komponente
// ============================================================

export default function PhotoCapture({
  quality,
  onCapture,
  onError,
  disabled = false,
  children,
  mode = 'choose',
}: PhotoCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [verarbeitet, setVerarbeitet] = useState(false)

  const handleClick = () => {
    if (!disabled && !verarbeitet) {
      inputRef.current?.click()
    }
  }

  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setVerarbeitet(true)

    try {
      // Schritt 1: HEIC → JPEG falls noetig
      let input = file
      if (istHeic(file)) {
        input = await konvertiereHeic(file)
      }

      // Schritt 2: Komprimieren
      const preset = QUALITY_PRESETS[quality]
      const compressed = await imageCompression(input, {
        maxWidthOrHeight: preset.maxWidthOrHeight,
        maxSizeMB: preset.maxSizeMB,
        initialQuality: preset.quality,
        useWebWorker: true,
        fileType: 'image/jpeg',
      })

      // Komprimiertes Ergebnis als File-Objekt
      const resultFile = new File(
        [compressed],
        compressed.name.replace(/\.[^.]+$/, '.jpg'),
        { type: 'image/jpeg' },
      )

      await onCapture(resultFile)
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      if (onError) {
        onError(error)
      } else {
        console.error('[PhotoCapture] Fehler:', error)
      }
    } finally {
      setVerarbeitet(false)
      // Input zuruecksetzen damit dieselbe Datei nochmal ausgewaehlt werden kann
      if (inputRef.current) {
        inputRef.current.value = ''
      }
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif"
        {...(mode === 'camera' ? { capture: 'environment' } : {})}
        onChange={handleChange}
        style={{ display: 'none' }}
      />

      {children ? (
        // Custom-Trigger: children in klickbaren Wrapper packen
        <div
          onClick={handleClick}
          style={{ cursor: disabled || verarbeitet ? 'default' : 'pointer' }}
        >
          {children}
        </div>
      ) : (
        // Default-Button
        <button
          type="button"
          onClick={handleClick}
          disabled={disabled || verarbeitet}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.875rem 0.25rem',
            background: 'none',
            border: 'none',
            borderBottom: '1px solid var(--border)',
            cursor: disabled || verarbeitet ? 'default' : 'pointer',
            color: verarbeitet ? 'var(--text-2)' : 'var(--text)',
            fontSize: '0.9375rem',
            minHeight: '2.75rem',
            opacity: disabled ? 0.4 : 1,
          }}
        >
          {verarbeitet ? (
            <CircleNotch
              size={18}
              style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}
            />
          ) : (
            <Camera size={18} style={{ flexShrink: 0 }} />
          )}
          {verarbeitet ? 'Bild wird verarbeitet…' : 'Foto aufnehmen'}
        </button>
      )}
    </>
  )
}

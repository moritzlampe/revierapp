'use client'

// TODO: Vor Production loeschen — reine Test-Seite fuer PhotoCapture

import { useState } from 'react'
import PhotoCapture, {
  QUALITY_PRESETS,
  type PhotoQuality,
} from '@/components/photo/PhotoCapture'
import PhotoThumbnail from '@/components/photo/PhotoThumbnail'
import { uploadPhoto, type UploadPhotoResult } from '@/lib/photos/upload'
import { deletePhoto } from '@/lib/photos/delete'

const TEST_USER_ID = '7e88910e-1ca8-4868-9313-6c5207406d23'

interface TestResult {
  quality: PhotoQuality
  originalName: string
  sizeMB: string
  width: number
  height: number
  type: string
  timestamp: string
}

interface UploadedPhoto {
  url: string
  path: string
  timestamp: string
}

function PresetCard({ quality }: { quality: PhotoQuality }) {
  const [results, setResults] = useState<TestResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [lastFile, setLastFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadedPhotos, setUploadedPhotos] = useState<UploadedPhoto[]>([])
  const [uploadMsg, setUploadMsg] = useState<string | null>(null)

  const preset = QUALITY_PRESETS[quality]

  const handleCapture = async (file: File) => {
    setError(null)
    setLastFile(file)
    setUploadMsg(null)

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

  const handleUpload = async () => {
    if (!lastFile || uploading) return
    setUploading(true)
    setUploadMsg(null)
    setError(null)
    try {
      const result: UploadPhotoResult = await uploadPhoto({
        file: lastFile,
        userId: TEST_USER_ID,
        entityType: 'test',
        entityId: quality,
      })
      setUploadedPhotos((prev) => [
        {
          url: result.url,
          path: result.path,
          timestamp: new Date().toLocaleTimeString('de-DE'),
        },
        ...prev,
      ])
      setUploadMsg('Upload erfolgreich!')
      setLastFile(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload fehlgeschlagen')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (path: string) => {
    await deletePhoto(path)
    setUploadedPhotos((prev) => prev.filter((p) => p.path !== path))
    setUploadMsg('Bild geloescht!')
    setTimeout(() => setUploadMsg(null), 2000)
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

      {/* Upload-Button */}
      {lastFile && (
        <button
          onClick={handleUpload}
          disabled={uploading}
          style={{
            marginTop: '0.5rem',
            width: '100%',
            padding: '0.75rem',
            borderRadius: '0.5rem',
            border: 'none',
            background: 'var(--green)',
            color: '#fff',
            fontWeight: 600,
            fontSize: '0.875rem',
            cursor: uploading ? 'wait' : 'pointer',
            opacity: uploading ? 0.6 : 1,
            minHeight: '2.75rem',
          }}
        >
          {uploading ? 'Hochladen…' : 'Echt hochladen →  app-photos'}
        </button>
      )}

      {/* Status-Meldungen */}
      {uploadMsg && (
        <p
          style={{
            color: 'var(--green-bright)',
            fontSize: '0.8125rem',
            marginTop: '0.5rem',
          }}
        >
          {uploadMsg}
        </p>
      )}

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

      {/* Hochgeladene Thumbnails */}
      {uploadedPhotos.length > 0 && (
        <div
          style={{
            marginTop: '0.75rem',
            display: 'flex',
            gap: '0.75rem',
            flexWrap: 'wrap',
          }}
        >
          {uploadedPhotos.map((photo) => (
            <div key={photo.path} style={{ textAlign: 'center' }}>
              <PhotoThumbnail
                url={photo.url}
                alt={`Upload ${photo.timestamp}`}
                size={5}
                shape={quality === 'avatar' ? 'circle' : 'square'}
                onDelete={() => handleDelete(photo.path)}
              />
              <span
                style={{
                  display: 'block',
                  fontSize: '0.6875rem',
                  color: 'var(--text-3)',
                  marginTop: '0.25rem',
                }}
              >
                {photo.timestamp}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Capture-Ergebnisse */}
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
          marginBottom: '0.25rem',
        }}
      >
        Waehle in jeder Karte ein Foto und pruefe Groesse + Dimensionen.
      </p>
      <p
        style={{
          color: 'var(--orange)',
          fontSize: '0.8125rem',
          marginBottom: '1.5rem',
        }}
      >
        Hinweis: Fuer Upload bitte vorher einloggen unter /login
      </p>

      <PresetCard quality="chat" />
      <PresetCard quality="avatar" />
      <PresetCard quality="documentation" />
    </div>
  )
}

'use client'

import { useState } from 'react'
import { ImageOff, X } from 'lucide-react'

interface PhotoThumbnailProps {
  url: string
  alt?: string
  shape?: 'circle' | 'square'
  size?: number                    // in rem, default 5 (= 80px bei 16px base)
  onDelete?: () => void | Promise<void>
  onTap?: () => void
  className?: string
}

export default function PhotoThumbnail({
  url,
  alt = 'Foto',
  shape = 'square',
  size = 5,
  onDelete,
  onTap,
  className,
}: PhotoThumbnailProps) {
  const [loaded, setLoaded] = useState(false)
  const [errored, setErrored] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const borderRadius = shape === 'circle' ? '50%' : '0.75rem'

  const handleDelete = async (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (deleting || !onDelete) return
    setDeleting(true)
    try {
      await onDelete()
    } catch (err) {
      console.error('Loeschen fehlgeschlagen:', err)
      setDeleting(false)
    }
  }

  return (
    <div
      className={className}
      onClick={onTap}
      style={{
        position: 'relative',
        width: `${size}rem`,
        height: `${size}rem`,
        borderRadius,
        overflow: 'hidden',
        flexShrink: 0,
        cursor: onTap ? 'pointer' : 'default',
      }}
    >
      {/* Placeholder / Loading */}
      {!loaded && !errored && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'var(--surface-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'pulse-dot 1.5s ease-in-out infinite',
          }}
        />
      )}

      {/* Fehler-Fallback */}
      {errored && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'var(--surface-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ImageOff
            style={{
              width: `${size * 0.4}rem`,
              height: `${size * 0.4}rem`,
              color: 'var(--text-3)',
            }}
          />
        </div>
      )}

      {/* Bild */}
      {!errored && (
        <img
          src={url}
          alt={alt}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: loaded ? 'block' : 'none',
          }}
        />
      )}

      {/* Loesch-Button */}
      {onDelete && (
        <button
          onClick={handleDelete}
          disabled={deleting}
          aria-label="Foto loeschen"
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            // Unsichtbares Touch-Target: 2.75rem = 44px
            width: '2.75rem',
            height: '2.75rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            zIndex: 2,
          }}
        >
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '1.5rem',
              height: '1.5rem',
              borderRadius: '50%',
              background: 'rgba(0,0,0,0.6)',
            }}
          >
            <X
              style={{
                width: '0.875rem',
                height: '0.875rem',
                color: 'var(--text)',
                opacity: deleting ? 0.4 : 1,
              }}
            />
          </span>
        </button>
      )}

    </div>
  )
}

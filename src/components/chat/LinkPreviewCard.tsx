'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'

type LinkPreviewData = {
  title?: string
  description?: string
  image_url?: string
  favicon_url?: string
  site_name?: string
  og_type?: string
  error?: string
}

function getDomainFromUrl(url: string): string {
  try {
    const u = new URL(url)
    return u.hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Bestimmt das passende Typ-Icon basierend auf og_type und Domain */
function getTypeIcon(ogType: string | undefined, url: string): string {
  const domain = getDomainFromUrl(url)
  const videoDomains = ['youtube.com', 'youtu.be', 'vimeo.com', 'twitch.tv']
  const imageDomains = ['instagram.com', 'flickr.com', 'imgur.com']
  const musicDomains = ['spotify.com', 'soundcloud.com']

  if (ogType === 'video' || videoDomains.some(d => domain.includes(d))) return '🎥'
  if (ogType === 'image' || imageDomains.some(d => domain.includes(d))) return '📷'
  if (ogType === 'music' || musicDomains.some(d => domain.includes(d))) return '🎵'
  return '📰'
}

type LinkPreviewCardProps = {
  url: string
  compact: boolean
}

export default function LinkPreviewCard({ url, compact }: LinkPreviewCardProps) {
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<LinkPreviewData | null>(null)
  const [error, setError] = useState(false)
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function fetchPreview() {
      try {
        const { data: result, error: fetchError } = await supabase.functions.invoke(
          'fetch-link-preview',
          { body: { url } }
        )
        if (cancelled) return
        if (fetchError) {
          setError(true)
        } else {
          setData(result)
        }
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchPreview()
    return () => { cancelled = true }
  }, [url, supabase])

  // Skeleton während Laden
  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={{
          width: '2.5rem',
          height: '2.5rem',
          borderRadius: '0.5rem',
          background: 'var(--bg-tertiary)',
          flexShrink: 0,
          animation: 'linkpreview-pulse 1.5s infinite',
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            width: '70%',
            height: '0.75rem',
            borderRadius: '0.25rem',
            background: 'var(--bg-tertiary)',
            animation: 'linkpreview-pulse 1.5s infinite',
          }} />
          <div style={{
            width: '40%',
            height: '0.75rem',
            borderRadius: '0.25rem',
            background: 'var(--bg-tertiary)',
            marginTop: '0.375rem',
            animation: 'linkpreview-pulse 1.5s infinite',
          }} />
        </div>
        <style>{pulseKeyframes}</style>
      </div>
    )
  }

  // Bei Fehler oder fehlenden Daten: null (Parent rendert Plain-Link Fallback)
  if (error || data?.error || !data?.title) return null

  const description = data.description
    ? data.description.length > 80
      ? data.description.slice(0, 80) + '...'
      : data.description
    : null

  // Thumbnail bestimmen
  const renderThumbnail = () => {
    if (data.image_url && !imgError) {
      return (
        <img
          src={data.image_url}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => setImgError(true)}
        />
      )
    }
    if (data.favicon_url) {
      return (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          width: '100%',
          height: '100%',
        }}>
          <img src={data.favicon_url} alt="" style={{ width: '1rem', height: '1rem' }} />
        </div>
      )
    }
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        height: '100%',
        fontSize: '1.25rem',
      }}>
        📰
      </div>
    )
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={containerStyle}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.background = 'var(--bg-tertiary)'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.background = 'var(--bg-secondary)'
      }}
    >
      {/* Thumbnail */}
      <div style={{
        width: '2.5rem',
        height: '2.5rem',
        borderRadius: '0.5rem',
        overflow: 'hidden',
        flexShrink: 0,
        background: 'var(--bg-tertiary)',
      }}>
        {renderThumbnail()}
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontWeight: 600,
          fontSize: '0.875rem',
          color: 'var(--text-primary)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {data.title}
        </div>
        {!compact && description && (
          <div style={{
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {description}
          </div>
        )}
        <div style={{
          fontSize: '0.75rem',
          color: 'var(--text-secondary)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {getDomainFromUrl(url)}
        </div>
      </div>

      {/* Typ-Icon */}
      <div style={{
        width: '1.25rem',
        height: '1.25rem',
        flexShrink: 0,
        fontSize: '1.125rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {getTypeIcon(data.og_type, url)}
      </div>
    </a>
  )
}

const containerStyle: React.CSSProperties = {
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border-color)',
  borderRadius: '0.75rem',
  padding: '0.5rem',
  marginTop: '0.375rem',
  display: 'flex',
  gap: '0.625rem',
  alignItems: 'center',
  cursor: 'pointer',
  textDecoration: 'none',
  transition: 'background 0.15s',
}

const pulseKeyframes = `
@keyframes linkpreview-pulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}
`

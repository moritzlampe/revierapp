'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { parsePolygonHex } from '@/lib/geo-utils'
import type { MapObject } from '@/lib/types/revier'

const RevierMap = dynamic(() => import('@/components/revier/RevierMap'), { ssr: false })

type District = {
  id: string
  name: string
  owner_id: string
  boundary: unknown
  area_ha: number | null
  bundesland: string | null
}

type Props = {
  district: District
  objects: MapObject[]
  userId: string
}

/** Einfacher Centroid: Durchschnitt aller Punkte des ersten Rings */
function centroidFromBoundary(rings: [number, number][][]): [number, number] {
  const ring = rings[0]
  if (!ring || ring.length === 0) return [53.26, 10.35]
  const sumLat = ring.reduce((s, [lat]) => s + lat, 0)
  const sumLng = ring.reduce((s, [, lng]) => s + lng, 0)
  return [sumLat / ring.length, sumLng / ring.length]
}

export default function RevierContent({ district, objects }: Props) {
  const router = useRouter()

  const boundary = useMemo(
    () => parsePolygonHex(district.boundary),
    [district.boundary],
  )

  const center = useMemo<[number, number]>(
    () => boundary ? centroidFromBoundary(boundary) : [53.26, 10.35],
    [boundary],
  )

  return (
    <div className="fixed inset-0 flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 flex-shrink-0"
        style={{
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
          zIndex: 1000,
          minHeight: '3.5rem',
        }}
      >
        <button
          onClick={() => router.push('/app/du')}
          className="flex items-center justify-center rounded-lg"
          style={{
            color: 'var(--text-2)',
            background: 'var(--surface-2)',
            minWidth: '2.75rem',
            minHeight: '2.75rem',
            fontSize: '1.125rem',
          }}
        >
          ←
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold truncate">{district.name}</h1>
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>
            {objects.length} {objects.length === 1 ? 'Objekt' : 'Objekte'}
            {district.area_ha ? ` · ${Math.round(district.area_ha)} ha` : ''}
          </p>
        </div>
      </div>

      {/* Karte */}
      <div className="flex-1 relative" style={{ zIndex: 1 }}>
        <RevierMap
          center={center}
          zoom={14}
          objects={objects}
          boundary={boundary}
        />
      </div>
    </div>
  )
}

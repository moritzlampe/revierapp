'use client'

import dynamic from 'next/dynamic'
import type { GeolocationState } from '@/hooks/useGeolocation'
import type { ParticipantPosition } from '@/hooks/useHuntPositions'
import type { StandData } from './MapContent'

const MapContent = dynamic(() => import('./MapContent'), { ssr: false })

interface MapViewProps {
  geoState: GeolocationState
  participants: ParticipantPosition[]
  boundary?: [number, number][][] | null
  stands?: StandData[]
  participantStands?: Record<string, string>
  districtId?: string | null
  districtName?: string | null
  huntId?: string | null
  onStandsChanged?: () => void
  onBoundaryChanged?: () => void
}

export default function MapView({
  geoState,
  participants,
  boundary,
  stands,
  participantStands,
  districtId,
  districtName,
  huntId,
  onStandsChanged,
  onBoundaryChanged,
}: MapViewProps) {
  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      zIndex: 0,
    }}>
      <MapContent
        geoState={geoState}
        participants={participants}
        boundary={boundary}
        stands={stands}
        participantStands={participantStands}
        districtId={districtId}
        districtName={districtName}
        huntId={huntId}
        onStandsChanged={onStandsChanged}
        onBoundaryChanged={onBoundaryChanged}
      />
    </div>
  )
}

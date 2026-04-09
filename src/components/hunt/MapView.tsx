'use client'

import dynamic from 'next/dynamic'
import type { GeolocationState } from '@/hooks/useGeolocation'
import type { ParticipantPosition } from '@/hooks/useHuntPositions'
import type { StandData, StandsChangedCallback, FreePositionData } from './MapContent'

const MapContent = dynamic(() => import('./MapContent'), { ssr: false })

export interface HuntParticipantInfo {
  id: string
  user_id: string | null
  guest_name: string | null
  role: string
  tags: string[]
  profiles: { display_name: string } | null
}

export interface SeatAssignmentData {
  id: string
  user_id: string | null
  seat_id: string | null
  seat_type: string
  seat_name: string | null
  position_lat: number | null
  position_lng: number | null
  adhoc_subtype?: 'leiter' | 'hochsitz' | 'sitzstock' | null
}

interface MapViewProps {
  geoState: GeolocationState
  participants: ParticipantPosition[]
  boundary?: [number, number][][] | null
  stands?: StandData[]
  participantStands?: Record<string, string>
  freePositions?: FreePositionData[]
  standAssignedNames?: Record<string, string>
  districtId?: string | null
  districtName?: string | null
  huntId?: string | null
  huntParticipants?: HuntParticipantInfo[]
  seatAssignments?: SeatAssignmentData[]
  isJagdleiter?: boolean
  onStandsChanged?: StandsChangedCallback
  onBoundaryChanged?: () => void
  onSeatAssignmentsChanged?: (assignments: SeatAssignmentData[]) => void
}

export default function MapView({
  geoState,
  participants,
  boundary,
  stands,
  participantStands,
  freePositions,
  standAssignedNames,
  districtId,
  districtName,
  huntId,
  huntParticipants,
  seatAssignments,
  isJagdleiter,
  onStandsChanged,
  onBoundaryChanged,
  onSeatAssignmentsChanged,
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
        freePositions={freePositions}
        standAssignedNames={standAssignedNames}
        districtId={districtId}
        districtName={districtName}
        huntId={huntId}
        huntParticipants={huntParticipants}
        seatAssignments={seatAssignments}
        isJagdleiter={isJagdleiter}
        onStandsChanged={onStandsChanged}
        onBoundaryChanged={onBoundaryChanged}
        onSeatAssignmentsChanged={onSeatAssignmentsChanged}
      />
    </div>
  )
}

'use client'

import dynamic from 'next/dynamic'
import type { StandAssignmentMapProps } from './StandAssignmentMap'

const StandAssignmentMap = dynamic(() => import('./StandAssignmentMap'), { ssr: false })

export default function StandAssignmentMapView(props: StandAssignmentMapProps) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <StandAssignmentMap {...props} />
    </div>
  )
}

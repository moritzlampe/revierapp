'use client'

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useActiveHunt } from '@/hooks/useActiveHunt'

interface ErlegungSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ErlegungSheet({ open, onOpenChange }: ErlegungSheetProps) {
  const { activeHunt, loading } = useActiveHunt()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" showCloseButton={false}>
        <SheetHeader>
          <SheetTitle>Erlegung melden</SheetTitle>
        </SheetHeader>
        <div style={{ padding: '1rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-2)' }}>
            Wildart-Picker kommt mit 58.1d.
          </p>
          <p style={{ color: 'var(--text-3)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
            {loading
              ? 'Lade...'
              : activeHunt
                ? `Aktive Jagd: ${activeHunt.name}`
                : 'Keine aktive Jagd'}
          </p>
        </div>
      </SheetContent>
    </Sheet>
  )
}

import { Suspense } from 'react'
import { ChatCacheProvider } from '@/contexts/ChatCacheContext'
import { ActiveHuntProvider } from '@/contexts/ActiveHuntContext'
import BottomTabBar from '@/components/bottom-tab-bar'
import KeyboardOffset from '@/components/KeyboardOffset'
import { GlobalToast } from '@/components/erlegung/GlobalToast'
import { ConfirmSheetProvider } from '@/components/ui/ConfirmSheet'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    // Der Mobile-Wrapper lag bis 25.07.2026 im Root-Layout und galt damit für
    // JEDE Route. Er gehört hierher: nur die Feld-App ist eine Handy-Spalte.
    <div className="min-h-viewport app-mobile-wrapper" style={{
      margin: '0 auto',
      position: 'relative',
    }}>
      <ChatCacheProvider>
        <ActiveHuntProvider>
          <ConfirmSheetProvider>
            <KeyboardOffset />
            {children}
            <Suspense fallback={null}>
              <BottomTabBar />
            </Suspense>
            <GlobalToast />
          </ConfirmSheetProvider>
        </ActiveHuntProvider>
      </ChatCacheProvider>
    </div>
  )
}

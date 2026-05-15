import { Suspense } from 'react'
import { ChatCacheProvider } from '@/contexts/ChatCacheContext'
import { ActiveHuntProvider } from '@/contexts/ActiveHuntContext'
import BottomTabBar from '@/components/bottom-tab-bar'
import KeyboardOffset from '@/components/KeyboardOffset'
import { GlobalToast } from '@/components/erlegung/GlobalToast'
import { ConfirmSheetProvider } from '@/components/ui/ConfirmSheet'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
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
  )
}

import { Suspense } from 'react'
import { ChatCacheProvider } from '@/contexts/ChatCacheContext'
import BottomTabBar from '@/components/bottom-tab-bar'
import KeyboardOffset from '@/components/KeyboardOffset'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ChatCacheProvider>
      <KeyboardOffset />
      {children}
      <Suspense fallback={null}>
        <BottomTabBar />
      </Suspense>
    </ChatCacheProvider>
  )
}

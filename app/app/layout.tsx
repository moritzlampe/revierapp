import { Suspense } from 'react'
import { ChatCacheProvider } from '@/contexts/ChatCacheContext'
import BottomTabBar from '@/components/bottom-tab-bar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ChatCacheProvider>
      {children}
      <Suspense fallback={null}>
        <BottomTabBar />
      </Suspense>
    </ChatCacheProvider>
  )
}

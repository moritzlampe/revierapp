import { ChatCacheProvider } from '@/contexts/ChatCacheContext'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <ChatCacheProvider>{children}</ChatCacheProvider>
}

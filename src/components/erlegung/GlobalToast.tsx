'use client'

import { useState, useEffect, useCallback } from 'react'
import type { ToastDetail } from '@/lib/erlegung/toast'

export function GlobalToast() {
  const [toast, setToast] = useState<ToastDetail | null>(null)
  const [visible, setVisible] = useState(false)

  const dismiss = useCallback(() => {
    setVisible(false)
    setTimeout(() => setToast(null), 200)
  }, [])

  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent).detail as ToastDetail
      setToast(detail)
      setVisible(true)
    }
    window.addEventListener('quickhunt:toast', handler)
    return () => window.removeEventListener('quickhunt:toast', handler)
  }, [])

  useEffect(() => {
    if (!visible) return
    const timer = setTimeout(dismiss, 4000)
    return () => clearTimeout(timer)
  }, [visible, dismiss])

  if (!toast) return null

  const bgColor = toast.type === 'success'
    ? 'var(--green)'
    : toast.type === 'warning'
      ? 'var(--orange)'
      : 'var(--surface-3)'

  return (
    <div
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)',
        left: '50%',
        transform: `translateX(-50%) translateY(${visible ? '0' : '-1rem'})`,
        zIndex: 9999,
        background: bgColor,
        color: '#fff',
        borderRadius: 'var(--radius)',
        padding: '0.75rem 1.25rem',
        boxShadow: '0 0.25rem 1rem rgba(0,0,0,0.4)',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.2s, transform 0.2s',
        textAlign: 'center',
        maxWidth: '90vw',
        pointerEvents: visible ? 'auto' : 'none',
      }}
      onClick={dismiss}
    >
      <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>
        {toast.message}
      </div>
      {toast.subtext && (
        <div style={{ fontSize: '0.8125rem', opacity: 0.85, marginTop: '0.125rem' }}>
          {toast.subtext}
        </div>
      )}
    </div>
  )
}

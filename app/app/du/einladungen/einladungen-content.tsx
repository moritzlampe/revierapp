'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { EnvelopeSimple, MapPin, Star, Check, X } from '@phosphor-icons/react'

export type Invitation = {
  hunt_id: string
  name: string
  type: string
  kind: string
  started_at: string | null
  district_name: string | null
  creator_name: string | null
  invited_at: string | null
}

export default function EinladungenContent({ initialInvitations, userId }: { initialInvitations: Invitation[]; userId: string }) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [invitations, setInvitations] = useState<Invitation[]>(initialInvitations)
  const [processingId, setProcessingId] = useState<string | null>(null)

  function showToast(message: string) {
    window.dispatchEvent(new CustomEvent('quickhunt:toast', { detail: { message, type: 'warning' } }))
  }

  // 'each'-Push an den Jagdleiter (Sprint C). h wird VOR dem RPC geladen, weil
  // decline die eigene invited-Zeile löscht und die Jagd danach nicht mehr
  // lesbar ist. Best-effort: Fehler werden geschluckt (Push nur in Prod aktiv,
  // Service-Role-Key fehlt lokal).
  function notifyLeaderRsvp(
    h: { creator_id: string | null; notify_on_rsvp: string } | null,
    inv: Invitation,
    verb: string,
  ) {
    if (!h || h.notify_on_rsvp !== 'each' || !h.creator_id || h.creator_id === userId) return
    void fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'rsvp',
        recipientUserId: h.creator_id,
        senderUserId: userId,
        chatName: inv.name,
        messageText: verb,
        huntId: inv.hunt_id,
        url: `/app/hunt/${inv.hunt_id}`,
      }),
    }).catch(() => {})
  }

  // Annehmen: invited -> joined + Chat-Eintrag (RPC, Migration 049). Danach
  // greifen die Sprint-A-Policies → volle Jagd. router.refresh() invalidiert
  // den Server-Cache (C3-Pattern), dann direkt in die Jagd.
  async function handleAccept(inv: Invitation) {
    if (processingId) return
    setProcessingId(inv.hunt_id)
    // Jagdleiter-Daten vor dem RPC laden (für 'each'-Push).
    const { data: h } = await supabase
      .from('hunts')
      .select('creator_id, notify_on_rsvp')
      .eq('id', inv.hunt_id)
      .single()
    const { error } = await supabase.rpc('accept_hunt_invitation', { p_hunt_id: inv.hunt_id })
    if (error) {
      setProcessingId(null)
      showToast('Annehmen fehlgeschlagen')
      return
    }
    notifyLeaderRsvp(h, inv, 'hat zugesagt')
    router.refresh()
    router.push(`/app/hunt/${inv.hunt_id}`)
  }

  // Ablehnen: eigene invited-Zeile löschen (RPC). Kein Chat-Eintrag.
  async function handleDecline(inv: Invitation) {
    if (processingId) return
    setProcessingId(inv.hunt_id)
    // Jagdleiter-Daten vor dem RPC laden — decline löscht die eigene Zeile,
    // danach ist die Jagd nicht mehr lesbar.
    const { data: h } = await supabase
      .from('hunts')
      .select('creator_id, notify_on_rsvp')
      .eq('id', inv.hunt_id)
      .single()
    const { error } = await supabase.rpc('decline_hunt_invitation', { p_hunt_id: inv.hunt_id })
    if (error) {
      setProcessingId(null)
      showToast('Ablehnen fehlgeschlagen')
      return
    }
    notifyLeaderRsvp(h, inv, 'hat abgesagt')
    setInvitations(prev => prev.filter(i => i.hunt_id !== inv.hunt_id))
    setProcessingId(null)
    router.refresh()
  }

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: 'var(--bg)', paddingBottom: 'var(--bottom-bar-space)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: '1px solid var(--border-light)', paddingTop: 'calc(0.75rem + var(--safe-top))' }}>
        <button onClick={() => router.back()} className="flex items-center justify-center rounded-lg"
          style={{ color: 'var(--text-2)', background: 'var(--surface-2)', minWidth: '2.75rem', minHeight: '2.75rem', fontSize: '1.125rem' }}>←</button>
        <h1 className="text-lg font-bold">Einladungen</h1>
      </div>

      {invitations.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
          <EnvelopeSimple size={40} style={{ color: 'var(--text-3)', marginBottom: '0.75rem' }} />
          <p className="font-semibold mb-1">Keine offenen Einladungen</p>
          <p className="text-sm" style={{ color: 'var(--text-3)' }}>
            Wenn dich jemand zu einer Jagd einlädt, erscheint sie hier.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {invitations.map((inv) => {
            const busy = processingId === inv.hunt_id
            return (
              <div key={inv.hunt_id} className="rounded-2xl p-4"
                style={{ background: 'var(--surface)', border: '1px solid var(--blue)' }}>
                {/* Kicker */}
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
                  fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.08em',
                  textTransform: 'uppercase', color: 'var(--blue)', marginBottom: '0.25rem',
                }}>
                  <EnvelopeSimple size={13} weight="fill" />
                  Einladung
                </div>

                {/* Jagd-Name */}
                <div style={{
                  fontFamily: 'var(--font-display)', fontSize: '1.125rem', fontWeight: 500,
                  letterSpacing: '-0.01em', color: 'var(--text)', marginBottom: '0.5rem',
                }}>{inv.name}</div>

                {/* Meta: Ersteller + Revier */}
                <div className="flex flex-col gap-1 text-sm mb-3.5" style={{ color: 'var(--text-2)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
                    <Star size={13} weight="fill" color="var(--accent-gold)" />
                    Eingeladen von {inv.creator_name || 'Jagdleiter'}
                  </span>
                  {inv.district_name && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
                      <MapPin size={13} />
                      {inv.district_name}
                    </span>
                  )}
                </div>

                {/* Buttons */}
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleDecline(inv)}
                    disabled={busy}
                    className="font-semibold text-sm transition disabled:opacity-50"
                    style={{
                      height: '2.75rem', padding: '0 1rem', borderRadius: 'var(--radius)',
                      border: '1.5px solid rgba(239,83,80,0.3)', color: 'var(--red)',
                      background: 'transparent',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem',
                    }}
                  >
                    <X size={16} />
                    Ablehnen
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAccept(inv)}
                    disabled={busy}
                    className="flex-1 font-bold text-sm text-white transition disabled:opacity-50"
                    style={{
                      height: '2.75rem', borderRadius: 'var(--radius)', background: 'var(--green)',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem',
                    }}
                  >
                    <Check size={16} weight="bold" />
                    {busy ? 'Moment…' : 'Annehmen'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

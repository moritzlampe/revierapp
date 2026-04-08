'use client'

type ReplyMessage = {
  id: string
  content: string | null
  type?: string
  media_url?: string | null
}

type Props = {
  message: ReplyMessage
  senderName: string
  onCancel: () => void
}

function getPreviewText(msg: ReplyMessage): string {
  if (msg.type === 'photo' || (msg.media_url && !msg.content)) return '📷 Foto'
  if (msg.type === 'video') return '🎥 Video'
  return msg.content || ''
}

export function ReplyQuoteBar({ message, senderName, onCancel }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
        padding: '0.5rem 0.75rem',
        background: 'var(--surface-2)',
        borderTop: '1px solid var(--border-light)',
        minHeight: '3.5rem',
      }}
    >
      {/* Grüner Strich links */}
      <div
        style={{
          width: '0.25rem',
          alignSelf: 'stretch',
          background: 'var(--green)',
          borderRadius: '0.125rem',
          flexShrink: 0,
        }}
      />

      {/* Sender + Vorschau */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            color: 'var(--green)',
            fontWeight: 700,
            fontSize: '0.8rem',
            lineHeight: 1.3,
          }}
        >
          {senderName}
        </div>
        <div
          style={{
            color: 'var(--text-2)',
            fontSize: '0.85rem',
            lineHeight: 1.3,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {getPreviewText(message)}
        </div>
      </div>

      {/* ✕-Button */}
      <button
        onClick={onCancel}
        style={{
          width: '2.5rem',
          height: '2.5rem',
          minWidth: '2.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'none',
          border: 'none',
          color: 'var(--text-2)',
          fontSize: '1.1rem',
          cursor: 'pointer',
          padding: 0,
          flexShrink: 0,
        }}
        aria-label="Antwort abbrechen"
      >
        ✕
      </button>
    </div>
  )
}

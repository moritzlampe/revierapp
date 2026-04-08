'use client'

type QuoteMessage = {
  id: string
  content: string | null
  type?: string
  media_url?: string | null
}

type Props = {
  repliedMessage: QuoteMessage | null
  senderName: string
  onTap: () => void
  isMine: boolean
}

function getPreviewText(msg: QuoteMessage): string {
  if (msg.type === 'photo' || (msg.media_url && !msg.content)) return '📷 Foto'
  if (msg.type === 'video') return '🎥 Video'
  return msg.content || ''
}

export function InlineQuoteBox({ repliedMessage, senderName, onTap, isMine }: Props) {
  const isUnavailable = !repliedMessage

  return (
    <div
      onClick={(e) => {
        e.stopPropagation()
        if (!isUnavailable) onTap()
      }}
      style={{
        display: 'flex',
        gap: '0.4rem',
        padding: '0.4rem 0.6rem',
        marginBottom: '0.35rem',
        backgroundColor: 'rgba(0,0,0,0.15)',
        borderRadius: '0.5rem',
        cursor: isUnavailable ? 'default' : 'pointer',
        opacity: isUnavailable ? 0.6 : 1,
        maxWidth: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Grüner Strich links */}
      <div
        style={{
          width: '0.1875rem',
          alignSelf: 'stretch',
          background: 'var(--green)',
          borderRadius: '0.125rem',
          flexShrink: 0,
        }}
      />

      {/* Sender + Vorschau */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {isUnavailable ? (
          <div
            style={{
              color: 'var(--text-2)',
              fontSize: '0.75rem',
              lineHeight: 1.3,
              fontStyle: 'italic',
            }}
          >
            Nachricht nicht verfügbar
          </div>
        ) : (
          <>
            <div
              style={{
                color: 'var(--green)',
                fontWeight: 700,
                fontSize: '0.7rem',
                lineHeight: 1.3,
              }}
            >
              {senderName}
            </div>
            <div
              style={{
                color: isMine ? 'rgba(255,255,255,0.7)' : 'var(--text-2)',
                fontSize: '0.75rem',
                lineHeight: 1.3,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {getPreviewText(repliedMessage)}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

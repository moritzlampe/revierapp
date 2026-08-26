'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { StandData } from './MapContent'
import type { HuntParticipantInfo, SeatAssignmentData } from './MapView'
import { getAvatarColor } from '@/lib/avatar-color'
import { StandZustand, type StandZustandProps } from '@/components/revier/StandZustand'
import { Star, UsersThree, Dog } from '@phosphor-icons/react'

// --- Types ---

export interface StandDetailSheetProps {
  stand: StandData
  huntId: string
  isJagdleiter: boolean
  currentUserId: string
  huntParticipants: HuntParticipantInfo[]
  seatAssignments: SeatAssignmentData[]
  onClose: () => void
  onAssign: (stand: StandData) => void
  onEdit: (stand: StandData) => void
  onDeleted: (stand: StandData) => void
  onMovePosition: (stand: StandData) => void
  onOpenChat: (userId: string) => void
  onRenamed: (standId: string, newName: string) => void
  /**
   * Der Standzustand — anzeigen und eintragen (Konzept Standzustand §2.2).
   *
   * **Als EIN Bündel und nicht als sechs Einzel-Props**, damit die Fassung
   * dieses Sheets nicht von der des mobilen Revier-Editors abdriften kann: der
   * Typ gehört der Komponente, die ihn rendert.
   *
   * **`null` heißt: an diesem Stand gibt es nichts zu prüfen.** Das ist genau
   * ein Fall, der Adhoc-Stand — er ist eine Zeile in
   * `hunt_seat_assignments` und kein `map_objects`-Eintrag; ein Prüflog ohne
   * Kartenobjekt kann es nicht geben (`map_object_checks.map_object_id` ist
   * NOT NULL mit Fremdschlüssel). Er verschwindet mit der Jagd, ein
   * Wartungszustand wäre an ihm sinnlos.
   */
  zustand: StandZustandProps | null
}

// --- Hilfsfunktionen ---

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
}

function pName(p: HuntParticipantInfo): string {
  return p.profiles?.display_name || p.guest_name || 'Unbekannt'
}

// --- Komponente ---

export default function StandDetailSheet({
  stand,
  huntId,
  isJagdleiter,
  currentUserId,
  huntParticipants,
  seatAssignments,
  onClose,
  onAssign,
  onEdit,
  onDeleted,
  onMovePosition,
  onOpenChat,
  onRenamed,
  zustand,
}: StandDetailSheetProps) {
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editNameValue, setEditNameValue] = useState(stand.name)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  // Wer sitzt auf diesem Stand?
  const assignee = useMemo(() => {
    const assignment = seatAssignments.find(a =>
      (a.seat_type === 'assigned' && a.seat_id === stand.id) ||
      (a.seat_type === 'adhoc' && a.id === stand.id)
    )
    if (!assignment?.user_id) return null

    const participant = huntParticipants.find(p => p.user_id === assignment.user_id)
    if (!participant) return null

    return {
      userId: assignment.user_id,
      name: pName(participant),
      role: participant.role,
      tags: participant.tags,
    }
  }, [stand, seatAssignments, huntParticipants])

  const isOccupied = !!assignee
  const isAdhoc = stand.type === 'adhoc'

  // --- Adhoc-Stand löschen ---
  async function handleDelete() {
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('hunt_seat_assignments').delete().eq('id', stand.id)
    if (error) {
      console.error('Fehler beim Löschen:', error)
      setSaving(false)
      setShowConfirmDelete(false)
      return
    }
    onDeleted(stand)
  }

  // --- Adhoc-Stand umbenennen ---
  async function handleRename() {
    const newName = editNameValue.trim()
    if (!newName || newName === stand.name) {
      setIsEditing(false)
      return
    }
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('hunt_seat_assignments')
      .update({ seat_name: newName })
      .eq('id', stand.id)
    if (error) {
      console.error('Fehler beim Umbenennen:', error)
      setSaving(false)
      return
    }
    onRenamed(stand.id, newName)
  }

  return (
    <>
      {/* Overlay */}
      <div className="map-object-sheet-overlay" onClick={onClose} />

      {/* Sheet */}
      <div
        className="map-object-sheet"
        /**
         * **70dvh statt der früheren 50vh.** Der Zustandsblock unten kann zu
         * einem Textfeld mit drei Knöpfen aufklappen; bei 50vh stünde der
         * Melden-Knopf im Zweifel unter der Kante. `dvh` und nicht `vh`, weil
         * die Adressleiste mobiler Browser die Höhe während des Scrollens
         * ändert. Gescrollt wird ohnehin (`overflow-y: auto` an
         * `.map-object-sheet`).
         */
        style={{ maxHeight: '70dvh', paddingBottom: '1rem' }}
      >
        <div className="sheet-handle" />

        {/* --- Header: Avatar + Name --- */}
        <div style={{
          padding: '0.75rem 1rem 0',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
        }}>
          {isOccupied ? (
            <div style={{
              width: '3rem',
              height: '3rem',
              borderRadius: '50%',
              background: getAvatarColor(assignee.userId),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.125rem',
              fontWeight: 700,
              color: 'white',
              flexShrink: 0,
            }}>
              {getInitials(assignee.name)}
            </div>
          ) : (
            <div style={{
              width: '3rem',
              height: '3rem',
              borderRadius: '50%',
              background: 'var(--surface-3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.25rem',
              flexShrink: 0,
            }}>
              🪑
            </div>
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            {isOccupied ? (
              <>
                <p style={{
                  fontSize: '1rem',
                  fontWeight: 700,
                  color: 'var(--text)',
                  margin: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {assignee.name}
                  {assignee.role === 'jagdleiter' && (
                    <Star size={12} weight="fill" style={{ marginLeft: '0.375rem', color: 'var(--accent-gold)', display: 'inline' }} />
                  )}
                  {assignee.tags?.includes('gruppenleiter') && (
                    <UsersThree size={12} style={{ marginLeft: '0.25rem', color: 'var(--text-secondary)', display: 'inline' }} />
                  )}
                  {assignee.tags?.includes('hundefuehrer') && (
                    <Dog size={12} style={{ marginLeft: '0.25rem', color: 'var(--text-secondary)', display: 'inline' }} />
                  )}
                </p>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-2)', margin: 0 }}>
                  {stand.name}
                </p>
              </>
            ) : (
              <>
                <p style={{
                  fontSize: '1rem',
                  fontWeight: 700,
                  color: 'var(--text)',
                  margin: 0,
                }}>
                  {stand.name}
                </p>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-3)', margin: 0 }}>
                  Dieser Platz ist frei
                </p>
              </>
            )}
          </div>
        </div>

        {/* --- Primär-Aktion --- */}
        <div style={{ padding: '0.75rem 1rem 0' }}>
          {isOccupied && assignee.userId !== currentUserId ? (
            <button
              onClick={() => onOpenChat(assignee.userId)}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: 'var(--radius)',
                background: 'var(--green)',
                color: 'white',
                fontWeight: 600,
                fontSize: '0.875rem',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              💬 Chat mit {assignee.name.split(' ')[0]}
            </button>
          ) : isOccupied && assignee.userId === currentUserId ? (
            <div style={{
              padding: '0.625rem 0.75rem',
              borderRadius: 'var(--radius)',
              background: 'rgba(107,159,58,0.1)',
              border: '1px solid var(--green-dim)',
              textAlign: 'center',
              fontSize: '0.8125rem',
              color: 'var(--accent-primary)',
              fontWeight: 600,
            }}>
              ✓ Dein Stand
            </div>
          ) : isJagdleiter ? (
            <button
              onClick={() => onAssign(stand)}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: 'var(--radius)',
                background: 'var(--green)',
                color: 'white',
                fontWeight: 600,
                fontSize: '0.875rem',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Schütze zuweisen
            </button>
          ) : (
            <div style={{
              padding: '0.625rem 0.75rem',
              borderRadius: 'var(--radius)',
              background: 'var(--surface-2)',
              textAlign: 'center',
              fontSize: '0.8125rem',
              color: 'var(--text-3)',
            }}>
              Nicht besetzt
            </div>
          )}
        </div>

        {/* --- Jagdleiter-Aktionen --- */}
        {isJagdleiter && (
          <div style={{
            margin: '0.75rem 1rem 0',
            borderTop: '1px solid var(--border)',
            paddingTop: '0.625rem',
          }}>
            <p style={{
              fontSize: '0.6875rem',
              fontWeight: 600,
              color: 'var(--text-3)',
              margin: '0 0 0.375rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              Jagdleiter
            </p>

            {/* Umbesetzen — nur wenn belegt */}
            {isOccupied && (
              <button onClick={() => onAssign(stand)} style={jlButtonStyle}>
                <span style={{ width: '1.25rem', textAlign: 'center' }}>🔄</span>
                Stand umbesetzen
              </button>
            )}

            {/* Position wechseln — nur bei Adhoc */}
            {isAdhoc && (
              <button onClick={() => onMovePosition(stand)} style={jlButtonStyle}>
                <span style={{ width: '1.25rem', textAlign: 'center' }}>📍</span>
                Position wechseln
              </button>
            )}

            {/* Stand bearbeiten */}
            {isAdhoc && isEditing ? (
              /* Inline-Edit für Adhoc-Stände */
              <div style={{
                display: 'flex',
                gap: '0.5rem',
                padding: '0.5rem 0',
                borderBottom: '1px solid var(--border)',
              }}>
                <input
                  ref={inputRef}
                  type="text"
                  value={editNameValue}
                  onChange={(e) => setEditNameValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setIsEditing(false) }}
                  disabled={saving}
                  style={{
                    flex: 1,
                    padding: '0.5rem 0.625rem',
                    borderRadius: 'var(--radius)',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                    fontSize: '0.8125rem',
                    outline: 'none',
                  }}
                />
                <button
                  onClick={handleRename}
                  disabled={saving || !editNameValue.trim()}
                  style={{
                    padding: '0.5rem 0.75rem',
                    borderRadius: 'var(--radius)',
                    background: 'var(--green)',
                    border: 'none',
                    color: 'white',
                    fontWeight: 600,
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    opacity: saving || !editNameValue.trim() ? 0.5 : 1,
                  }}
                >
                  ✓
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  if (isAdhoc) {
                    setEditNameValue(stand.name)
                    setIsEditing(true)
                  } else {
                    onEdit(stand)
                  }
                }}
                style={jlButtonStyle}
              >
                <span style={{ width: '1.25rem', textAlign: 'center' }}>✏️</span>
                Stand bearbeiten
              </button>
            )}

            {/* Stand löschen — nur Adhoc */}
            {isAdhoc ? (
              <button
                onClick={() => setShowConfirmDelete(true)}
                style={{ ...jlButtonStyle, color: 'var(--red)', borderBottom: 'none' }}
              >
                <span style={{ width: '1.25rem', textAlign: 'center' }}>🗑️</span>
                Stand löschen
              </button>
            ) : (
              <button
                disabled
                style={{ ...jlButtonStyle, opacity: 0.35, cursor: 'default', borderBottom: 'none' }}
                title="Permanente Hochsitze werden in den Revier-Einstellungen verwaltet"
              >
                <span style={{ width: '1.25rem', textAlign: 'center' }}>🗑️</span>
                Stand löschen
              </button>
            )}
          </div>
        )}

        {/* --- Standzustand ---

            **Er steht UNTEN, und das ist eine übernommene Rangfolge, keine
            Platzfrage.** Die Feld-App begründet sie an derselben Stelle:
            *„während einer Jagd ist ‚ich bin da' die Handlung, die Prüfung die
            Nebensache. Vor der Jagd — wenn der Bezug gar nicht angeboten wird —
            rückt sie von selbst nach oben."* Auf der Revierkarte ist es
            umgekehrt, dort tippt man einen Stand an, um ihn anzusehen; deshalb
            sitzt der Block im mobilen Revier-Editor direkt unter dem Namen.

            **Dass eine SPERRE trotzdem nicht untergeht, hängt nicht an dieser
            Stelle**, sondern am Einteilen-Sheet: dort steht sie über den
            Schützen, bevor jemand zuweist (`MapContent.tsx`, `StandAssignSheet`).
            Ein Zustand, der nur im Detail-Sheet steht, wäre eine Auskunft für
            den, der ohnehin schon hinsieht. */}
        {zustand && (
          <>
            <div style={{ margin: '0.75rem 1rem 0', borderTop: '1px solid var(--border)' }} />
            <StandZustand {...zustand} />
          </>
        )}
      </div>

      {/* Bestätigungsdialog: Stand löschen */}
      {showConfirmDelete && (
        <div className="confirm-overlay">
          <div className="confirm-dialog">
            <p><strong>{stand.name}</strong> wirklich löschen?</p>
            <div className="confirm-actions">
              <button
                onClick={() => setShowConfirmDelete(false)}
                style={{
                  flex: 1, padding: '0.625rem', borderRadius: 'var(--radius)',
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  color: 'var(--text-2)', fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer',
                }}
              >
                Abbrechen
              </button>
              <button
                onClick={handleDelete}
                disabled={saving}
                style={{
                  flex: 1, padding: '0.625rem', borderRadius: 'var(--radius)',
                  background: 'var(--red)', border: 'none',
                  color: 'white', fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer',
                  opacity: saving ? 0.5 : 1,
                }}
              >
                🗑️ Löschen
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// --- Shared Style für Jagdleiter-Buttons ---

const jlButtonStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: '0.625rem',
  padding: '0.625rem 0',
  background: 'transparent',
  border: 'none',
  borderBottom: '1px solid var(--border)',
  color: 'var(--text)',
  fontSize: '0.8125rem',
  fontWeight: 500,
  cursor: 'pointer',
  textAlign: 'left',
}

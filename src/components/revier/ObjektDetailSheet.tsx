'use client'

import { useState, useRef, useCallback } from 'react'
import type { MapObject, ObjektType } from '@/lib/types/revier'

const TYPE_LABELS: Record<ObjektType, string> = {
  hochsitz: 'Hochsitz',
  kanzel: 'Kanzel',
  drueckjagdstand: 'Drückjagdbock',
  parkplatz: 'Parkplatz',
  kirrung: 'Kirrung',
  salzlecke: 'Salzlecke',
  wildkamera: 'Wildkamera',
  sonstiges: 'Sonstiges',
}

type Props = {
  object: MapObject
  onClose: () => void
  onPositionChange: () => void
  onDelete: () => void
  onUpdate: (changes: Partial<MapObject>) => Promise<void>
}

export default function ObjektDetailSheet({ object, onClose, onPositionChange, onDelete, onUpdate }: Props) {
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(object.name)
  const [savingName, setSavingName] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)

  const [showNotiz, setShowNotiz] = useState(!!object.description)
  const [editingNotiz, setEditingNotiz] = useState(false)
  const [notizValue, setNotizValue] = useState(object.description || '')
  const [savingNotiz, setSavingNotiz] = useState(false)
  const notizRef = useRef<HTMLTextAreaElement>(null)

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // --- Name inline-edit ---

  const startNameEdit = useCallback(() => {
    setEditingName(true)
    setTimeout(() => nameInputRef.current?.focus(), 50)
  }, [])

  const saveName = useCallback(async () => {
    const trimmed = nameValue.trim()
    if (!trimmed || trimmed === object.name) {
      setNameValue(object.name)
      setEditingName(false)
      return
    }
    setSavingName(true)
    await onUpdate({ name: trimmed })
    setSavingName(false)
    setEditingName(false)
  }, [nameValue, object.name, onUpdate])

  const handleNameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      ;(e.target as HTMLInputElement).blur()
    }
    if (e.key === 'Escape') {
      setNameValue(object.name)
      setEditingName(false)
    }
  }, [object.name])

  // --- Notiz inline-edit ---

  const startNotizEdit = useCallback(() => {
    setShowNotiz(true)
    setEditingNotiz(true)
    setTimeout(() => notizRef.current?.focus(), 50)
  }, [])

  const saveNotiz = useCallback(async () => {
    const trimmed = notizValue.trim()
    if (trimmed === (object.description || '')) {
      setEditingNotiz(false)
      if (!trimmed) setShowNotiz(false)
      return
    }
    setSavingNotiz(true)
    await onUpdate({ description: trimmed || null })
    setSavingNotiz(false)
    setEditingNotiz(false)
    if (!trimmed) setShowNotiz(false)
  }, [notizValue, object.description, onUpdate])

  const clearNotiz = useCallback(async () => {
    setSavingNotiz(true)
    await onUpdate({ description: null })
    setSavingNotiz(false)
    setNotizValue('')
    setEditingNotiz(false)
    setShowNotiz(false)
  }, [onUpdate])

  // --- Löschen ---

  const handleDelete = useCallback(async () => {
    setDeleting(true)
    onDelete()
  }, [onDelete])

  const typeLabel = TYPE_LABELS[object.type] || object.type

  return (
    <>
      <div className="map-object-sheet-overlay" onClick={onClose} />
      <div className="map-object-sheet" style={{ paddingBottom: '1rem', maxHeight: '70dvh' }}>
        <div className="sheet-handle" />

        <div style={{ padding: '0.75rem 1rem 0' }}>
          {/* Name — Inline-Edit */}
          {editingName ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                ref={nameInputRef}
                type="text"
                value={nameValue}
                onChange={e => setNameValue(e.target.value)}
                onBlur={saveName}
                onKeyDown={handleNameKeyDown}
                disabled={savingName}
                style={{
                  flex: 1,
                  padding: '0.375rem 0.5rem',
                  background: 'var(--bg)',
                  border: '1px solid var(--green)',
                  borderRadius: '0.5rem',
                  color: 'var(--text)',
                  fontSize: '1.25rem',
                  fontWeight: 700,
                }}
              />
              <span style={{ color: 'var(--green)', fontSize: '1.125rem' }}>✓</span>
            </div>
          ) : (
            <button
              onClick={startNameEdit}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
              }}
            >
              <h2 style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: 'var(--text)',
                margin: 0,
                lineHeight: 1.3,
              }}>
                {object.name}
              </h2>
            </button>
          )}

          {/* Typ-Label */}
          <p style={{
            fontSize: '0.8125rem',
            color: 'var(--text-3)',
            margin: '0.25rem 0 0',
          }}>
            {typeLabel}
          </p>
        </div>

        {/* Notiz-Bereich */}
        <div style={{ padding: '0.75rem 1rem 0' }}>
          {!showNotiz ? (
            <button
              onClick={startNotizEdit}
              style={{
                background: 'none',
                border: 'none',
                padding: '0.25rem 0',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                color: 'var(--text-3)',
                fontSize: '0.8125rem',
              }}
            >
              <span style={{ fontSize: '0.875rem' }}>+</span>
              Notiz hinzufügen
            </button>
          ) : editingNotiz ? (
            <div>
              <textarea
                ref={notizRef}
                value={notizValue}
                onChange={e => setNotizValue(e.target.value)}
                onBlur={saveNotiz}
                disabled={savingNotiz}
                placeholder="Notiz eingeben…"
                rows={3}
                style={{
                  width: '100%',
                  padding: '0.625rem 0.75rem',
                  background: 'var(--bg)',
                  border: '1px solid var(--green)',
                  borderRadius: '0.625rem',
                  color: 'var(--text)',
                  fontSize: '0.875rem',
                  resize: 'none',
                }}
              />
            </div>
          ) : (
            <div style={{
              position: 'relative',
              background: 'var(--surface-2)',
              borderRadius: '0.625rem',
              padding: '0.625rem 0.75rem',
            }}>
              <button
                onClick={() => {
                  setEditingNotiz(true)
                  setTimeout(() => notizRef.current?.focus(), 50)
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                  color: 'var(--text-2)',
                  fontSize: '0.875rem',
                  lineHeight: 1.5,
                }}
              >
                {notizValue}
              </button>
              <button
                onClick={clearNotiz}
                disabled={savingNotiz}
                style={{
                  position: 'absolute',
                  top: '0.375rem',
                  right: '0.375rem',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-3)',
                  fontSize: '0.75rem',
                  padding: '0.25rem',
                  lineHeight: 1,
                }}
                title="Notiz entfernen"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Trennlinie */}
        <div style={{
          margin: '0.75rem 1rem',
          height: '1px',
          background: 'var(--border)',
        }} />

        {/* Aktions-Liste */}
        <div style={{ padding: '0 1rem' }}>
          <button
            onClick={onPositionChange}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.875rem 0.25rem',
              background: 'none',
              border: 'none',
              borderBottom: '1px solid var(--border)',
              cursor: 'pointer',
              color: 'var(--text)',
              fontSize: '0.9375rem',
              minHeight: '2.75rem',
            }}
          >
            <span style={{ fontSize: '1.125rem' }}>📍</span>
            Position ändern
          </button>

          <button
            onClick={() => setConfirmDelete(true)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.875rem 0.25rem',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--red)',
              fontSize: '0.9375rem',
              minHeight: '2.75rem',
            }}
          >
            <span style={{ fontSize: '1.125rem' }}>🗑</span>
            Löschen
          </button>
        </div>

        {/* Lösch-Bestätigung (Stufe 2) */}
        {confirmDelete && (
          <div style={{
            margin: '0.5rem 1rem 0',
            padding: '0.75rem',
            background: 'rgba(239, 83, 80, 0.1)',
            borderRadius: 'var(--radius)',
            border: '1px solid rgba(239, 83, 80, 0.25)',
          }}>
            <p style={{
              fontSize: '0.8125rem',
              color: 'var(--text-2)',
              margin: '0 0 0.625rem',
              lineHeight: 1.4,
            }}>
              Wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{
                  flex: 1,
                  padding: '0.625rem',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--text-2)',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  minHeight: '2.75rem',
                }}
              >
                Abbrechen
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  flex: 1,
                  padding: '0.625rem',
                  background: 'var(--red)',
                  border: 'none',
                  borderRadius: 'var(--radius)',
                  color: 'white',
                  fontSize: '0.8125rem',
                  fontWeight: 700,
                  cursor: deleting ? 'default' : 'pointer',
                  opacity: deleting ? 0.6 : 1,
                  minHeight: '2.75rem',
                }}
              >
                {deleting ? 'Lösche…' : 'Endgültig löschen'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

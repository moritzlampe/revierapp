'use client'

import { useState, useCallback } from 'react'

export interface DrawPoint {
  lat: number
  lng: number
}

export function useBoundaryEditor() {
  const [editMode, setEditMode] = useState(false)
  const [drawPoints, setDrawPoints] = useState<DrawPoint[]>([])

  /** Edit-Mode starten — optional bestehendes Polygon laden */
  const startEditing = useCallback((existingBoundary?: [number, number][][] | null) => {
    if (existingBoundary && existingBoundary.length > 0) {
      const ring = existingBoundary[0]
      // Letzter Punkt = erster Punkt (geschlossen) → weglassen
      const pts = ring.length > 1
        && ring[0][0] === ring[ring.length - 1][0]
        && ring[0][1] === ring[ring.length - 1][1]
        ? ring.slice(0, -1)
        : ring
      setDrawPoints(pts.map(p => ({ lat: p[0], lng: p[1] })))
    } else {
      setDrawPoints([])
    }
    setEditMode(true)
  }, [])

  /** Edit-Mode beenden (drawPoints bleiben lesbar bis nächster Start) */
  const stopEditing = useCallback(() => {
    setEditMode(false)
  }, [])

  /** drawPoints zurücksetzen (nach Speichern aufrufen) */
  const reset = useCallback(() => {
    setDrawPoints([])
  }, [])

  /** Neuen Punkt hinzufügen (Karten-Klick) */
  const addPoint = useCallback((latlng: DrawPoint) => {
    setDrawPoints(prev => [...prev, latlng])
  }, [])

  /** Letzten Punkt entfernen */
  const undo = useCallback(() => {
    setDrawPoints(prev => prev.slice(0, -1))
  }, [])

  /** Alle Punkte löschen */
  const clearAll = useCallback(() => {
    setDrawPoints([])
  }, [])

  /** Vertex verschieben (Drag) */
  const dragVertex = useCallback((index: number, latlng: DrawPoint) => {
    setDrawPoints(prev => {
      const next = [...prev]
      next[index] = latlng
      return next
    })
  }, [])

  /** Vertex löschen (Minimum 3 Punkte bleiben) */
  const deleteVertex = useCallback((index: number) => {
    setDrawPoints(prev => {
      if (prev.length <= 3) return prev
      return prev.filter((_, i) => i !== index)
    })
  }, [])

  /** Neuen Vertex zwischen afterIndex und afterIndex+1 einfügen */
  const insertMidpoint = useCallback((afterIndex: number, latlng: DrawPoint) => {
    setDrawPoints(prev => {
      const next = [...prev]
      next.splice(afterIndex + 1, 0, latlng)
      return next
    })
  }, [])

  return {
    editMode,
    drawPoints,
    startEditing,
    stopEditing,
    reset,
    addPoint,
    undo,
    clearAll,
    dragVertex,
    deleteVertex,
    insertMidpoint,
  }
}

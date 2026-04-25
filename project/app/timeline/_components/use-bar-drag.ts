"use client"

import { useEffect, useState, useRef } from "react"
import type { Project } from "@/database/db"

type DragType = "resize-start" | "resize-end" | "move"

type DragState = {
  type: DragType
  projectId: number
  originalStart: string
  originalEnd: string
  currentStart: string
  currentEnd: string
  moveOffsetDays: number
}

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function parseDate(str: string): Date {
  const [y, m, d] = str.split("-").map(Number)
  return new Date(y, m - 1, d)
}

function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export function useBarDrag(
  dayWidth: number,
  displayStart: Date,
  totalDays: number,
  onSave: (id: number, newStart: string, newEnd: string) => void,
) {
  const [dragState, setDragState] = useState<DragState | null>(null)
  const dragStateRef = useRef<DragState | null>(null)
  const hasMoved = useRef(false)
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null)

  // dayWidth は drag 中も最新値を参照できるよう ref で持つ
  const dayWidthRef = useRef(dayWidth)
  useEffect(() => {
    dayWidthRef.current = dayWidth
  }, [dayWidth])

  function clientXToDayIndex(clientX: number, scrollEl: HTMLElement): number {
    const rect = scrollEl.getBoundingClientRect()
    return Math.floor((clientX - rect.left + scrollEl.scrollLeft) / dayWidthRef.current)
  }

  function startDrag(
    type: DragType,
    project: Project,
    e: React.MouseEvent,
    scrollEl: HTMLElement,
    onNoMove?: () => void,
  ) {
    if (e.button !== 0) return
    if (!project.start_date || !project.end_date) {
      onNoMove?.()
      return
    }
    e.preventDefault()
    e.stopPropagation()
    hasMoved.current = false

    const originalStart = project.start_date
    const originalEnd = project.end_date

    let moveOffsetDays = 0
    if (type === "move") {
      const startDayIdx = diffDays(displayStart, parseDate(originalStart))
      const mouseDayIdx = clientXToDayIndex(e.clientX, scrollEl)
      moveOffsetDays = mouseDayIdx - startDayIdx
    }

    const state: DragState = {
      type,
      projectId: project.id,
      originalStart,
      originalEnd,
      currentStart: originalStart,
      currentEnd: originalEnd,
      moveOffsetDays,
    }

    dragStateRef.current = state
    setDragState({ ...state })

    // ドラッグ中はページ全体で grabbing カーソルを適用
    const prevCursor = document.body.style.cursor
    document.body.style.cursor = type === "move" ? "grabbing" : "ew-resize"
    document.body.style.userSelect = "none"

    function onMouseMove(ev: MouseEvent) {
      const ds = dragStateRef.current
      if (!ds) return
      hasMoved.current = true
      setMousePos({ x: ev.clientX, y: ev.clientY })

      const rawIdx = clientXToDayIndex(ev.clientX, scrollEl)
      const clampedIdx = Math.max(0, Math.min(totalDays - 1, rawIdx))

      let newStart: string
      let newEnd: string

      if (ds.type === "resize-start") {
        const endIdx = diffDays(displayStart, parseDate(ds.originalEnd))
        const newStartIdx = Math.max(0, Math.min(clampedIdx, endIdx - 1))
        newStart = toYMD(addDays(displayStart, newStartIdx))
        newEnd = ds.originalEnd
      } else if (ds.type === "resize-end") {
        const startIdx = diffDays(displayStart, parseDate(ds.originalStart))
        const newEndIdx = Math.min(totalDays - 1, Math.max(clampedIdx, startIdx + 1))
        newStart = ds.originalStart
        newEnd = toYMD(addDays(displayStart, newEndIdx))
      } else {
        // move: 期間を保持したまま平行移動
        const duration = diffDays(parseDate(ds.originalStart), parseDate(ds.originalEnd))
        const newStartIdx = rawIdx - ds.moveOffsetDays
        const clampedStart = Math.max(0, Math.min(totalDays - 1 - duration, newStartIdx))
        newStart = toYMD(addDays(displayStart, clampedStart))
        newEnd = toYMD(addDays(displayStart, clampedStart + duration))
      }

      const updated: DragState = { ...ds, currentStart: newStart, currentEnd: newEnd }
      dragStateRef.current = updated
      setDragState(updated)
    }

    function onMouseUp() {
      const ds = dragStateRef.current
      if (ds && hasMoved.current) {
        onSave(ds.projectId, ds.currentStart, ds.currentEnd)
      } else if (!hasMoved.current) {
        onNoMove?.()
      }
      dragStateRef.current = null
      setDragState(null)
      setMousePos(null)
      hasMoved.current = false
      document.body.style.cursor = prevCursor
      document.body.style.userSelect = ""
      document.removeEventListener("mousemove", onMouseMove)
      document.removeEventListener("mouseup", onMouseUp)
    }

    document.addEventListener("mousemove", onMouseMove)
    document.addEventListener("mouseup", onMouseUp)
  }

  function getBarOverride(projectId: number): { start_date: string; end_date: string } | null {
    if (!dragState || dragState.projectId !== projectId) return null
    return { start_date: dragState.currentStart, end_date: dragState.currentEnd }
  }

  return {
    startDrag,
    getBarOverride,
    isDragging: dragState !== null,
    draggingId: dragState?.projectId ?? null,
    mousePos,
    dragType: dragState?.type ?? null,
    dragCurrentStart: dragState?.currentStart ?? null,
    dragCurrentEnd: dragState?.currentEnd ?? null,
  }
}

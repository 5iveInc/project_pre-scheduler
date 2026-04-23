"use client"

import { useState, useRef } from "react"
import type { Project } from "@/database/db"

type MonthViewMonth = { year: number; month: number; label: string; startDate: Date; endDate: Date }
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

function clientXToDate(
  clientX: number,
  scrollEl: HTMLElement,
  monthColWidth: number,
  months: MonthViewMonth[],
): Date {
  const rect = scrollEl.getBoundingClientRect()
  const absoluteX = clientX - rect.left + scrollEl.scrollLeft
  const rawMonthIndex = Math.floor(absoluteX / monthColWidth)
  const monthIndex = Math.max(0, Math.min(months.length - 1, rawMonthIndex))
  const fraction = Math.max(0, Math.min(1, (absoluteX - monthIndex * monthColWidth) / monthColWidth))
  const mv = months[monthIndex]
  const daysInMonth = mv.endDate.getDate()
  const day = Math.max(1, Math.min(daysInMonth, Math.floor(fraction * daysInMonth) + 1))
  return new Date(mv.year, mv.month, day)
}

export function useMonthBarDrag(
  monthColWidth: number,
  months: MonthViewMonth[],
  onSave: (id: number, newStart: string, newEnd: string) => void,
) {
  const [dragState, setDragState] = useState<DragState | null>(null)
  const dragStateRef = useRef<DragState | null>(null)
  const hasMoved = useRef(false)
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null)

  const monthColWidthRef = useRef(monthColWidth)
  monthColWidthRef.current = monthColWidth

  const monthsRef = useRef(months)
  monthsRef.current = months

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
      const mouseDate = clientXToDate(e.clientX, scrollEl, monthColWidthRef.current, monthsRef.current)
      moveOffsetDays = diffDays(parseDate(originalStart), mouseDate)
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

    const prevCursor = document.body.style.cursor
    document.body.style.cursor = type === "move" ? "grabbing" : "ew-resize"
    document.body.style.userSelect = "none"

    function onMouseMove(ev: MouseEvent) {
      const ds = dragStateRef.current
      if (!ds) return
      hasMoved.current = true
      setMousePos({ x: ev.clientX, y: ev.clientY })

      const ms = monthsRef.current
      const mouseDate = clientXToDate(ev.clientX, scrollEl, monthColWidthRef.current, ms)
      const firstDate = ms[0].startDate
      const lastDate = ms[ms.length - 1].endDate

      let newStart: string
      let newEnd: string

      if (ds.type === "resize-start") {
        const endDate = parseDate(ds.originalEnd)
        const clamped = new Date(
          Math.max(firstDate.getTime(), Math.min(addDays(endDate, -1).getTime(), mouseDate.getTime())),
        )
        newStart = toYMD(clamped)
        newEnd = ds.originalEnd
      } else if (ds.type === "resize-end") {
        const startDate = parseDate(ds.originalStart)
        const clamped = new Date(
          Math.max(addDays(startDate, 1).getTime(), Math.min(lastDate.getTime(), mouseDate.getTime())),
        )
        newStart = ds.originalStart
        newEnd = toYMD(clamped)
      } else {
        const duration = diffDays(parseDate(ds.originalStart), parseDate(ds.originalEnd))
        const rawStart = addDays(mouseDate, -ds.moveOffsetDays)
        const clampedStart = new Date(
          Math.max(firstDate.getTime(), Math.min(addDays(lastDate, -duration).getTime(), rawStart.getTime())),
        )
        newStart = toYMD(clampedStart)
        newEnd = toYMD(addDays(clampedStart, duration))
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

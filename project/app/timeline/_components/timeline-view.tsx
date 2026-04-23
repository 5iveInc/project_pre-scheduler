"use client"

import { useState, useTransition, useEffect, useRef, useMemo } from "react"
import { createPortal } from "react-dom"
import type { Project, User } from "@/database/db"
import { addProjectTimelineAction, saveCustomHolidaysAction, saveUserPaidLeavesAction, updateProjectDatesAction, quickAddChildTaskAction } from "@/app/timeline/actions"
import { useBarDrag } from "./use-bar-drag"
import { useMonthBarDrag } from "./use-month-bar-drag"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu"
import { Settings2Icon, PlusIcon, Trash2Icon, ArrowUpDownIcon, ArrowUpIcon, ArrowDownIcon, CheckIcon, ListFilterIcon, ChevronRightIcon } from "lucide-react"
import { ProjectEditModal, ChildTaskModal, ProjectFormFields } from "@/components/modal/project-edit-modal"
import { deleteProjectsAction } from "@/app/project/actions"

type SortKey = "id" | "volume" | "start_date" | "end_date"

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "id", label: "登録順" },
  { key: "volume", label: "レベル（ボリューム）" },
  { key: "start_date", label: "開始日" },
  { key: "end_date", label: "終了日" },
]

const SORT_LABEL_MAP = new Map(SORT_OPTIONS.map(({ key, label }) => [key, label]))

// ── 定数 ───────────────────────────────────────────────────
const DEFAULT_DAY_WIDTH = 32
const MIN_DAY_WIDTH = 17
const MAX_DAY_WIDTH = 55
const ROW_HEIGHT = 48
const MONTH_HEADER_HEIGHT = 30
const DAY_HEADER_HEIGHT = 44
const LEFT_COL_WIDTH = 200

const VOLUME_PARENT_COLORS: Record<number, string> = {
  1: "#bbf7d0", // green-200
  2: "#86efac", // green-300
  3: "#4ade80", // green-400
  4: "#22c55e", // green-500
  5: "#16a34a", // green-600
}

const VOLUME_COLORS: Record<number, string> = {
  1: "#bfdbfe", // blue-200
  2: "#93c5fd", // blue-300
  3: "#60a5fa", // blue-400
  4: "#3b82f6", // blue-500
  5: "#2563eb", // blue-600
}

function barColorFromVolume(volume: number | null): string {
  return volume !== null ? (VOLUME_COLORS[volume] ?? VOLUME_COLORS[3]) : VOLUME_COLORS[3]
}

function barColorFromParentVolume(volume: number | null): string {
  return volume !== null ? (VOLUME_PARENT_COLORS[volume] ?? VOLUME_PARENT_COLORS[3]) : VOLUME_PARENT_COLORS[3]
}

function barColorFromProject(p: Project, ignoreChildren = false): string {
  if (p.status === "相談中") return "#d1d5db" // gray-300
  if (p.parent_id !== null) {
    if (p.assignee_type === "client") return "#f87171" // red-400
    if (p.assignee_type === "stakeholder") {
      return p.stakeholder_assignee_ids.length === 0 ? "#000000" : "#fde047" // black : yellow-300
    }
  }
  if (!ignoreChildren && p.has_children) return barColorFromParentVolume(p.volume)
  return barColorFromVolume(p.volume)
}

// ── 日付ユーティリティ ──────────────────────────────────────

function parseLocalDate(str: string): Date {
  const [y, m, d] = str.split("-").map(Number)
  return new Date(y, m - 1, d)
}

function dayDiff(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function calcQuickChildDates(
  parent: Project,
  children: Project[],
): { startDate: string; endDate: string } | null {
  if (!parent.start_date) return null

  let startDate: string
  const childrenWithEnd = children.filter((c) => c.end_date !== null)

  if (children.length === 0 || childrenWithEnd.length < children.length) {
    startDate = parent.start_date
  } else {
    const latestEnd = childrenWithEnd.reduce((latest, c) =>
      c.end_date! > latest ? c.end_date! : latest, "")
    const d = parseLocalDate(latestEnd)
    d.setDate(d.getDate() + 1)
    startDate = toYMD(d)
  }

  const start = parseLocalDate(startDate)
  const end = new Date(start)
  end.setDate(end.getDate() + 29)
  return { startDate, endDate: toYMD(end) }
}

function getDisplayRange(projects: Project[]): { start: Date; end: Date } {
  const today = new Date()
  let start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  let end = new Date(today.getFullYear(), today.getMonth() + 3, 0)

  for (const p of projects) {
    if (p.start_date) {
      const d = parseLocalDate(p.start_date)
      const monthStart = new Date(d.getFullYear(), d.getMonth(), 1)
      if (monthStart < start) start = monthStart
    }
    if (p.end_date) {
      const d = parseLocalDate(p.end_date)
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0)
      if (monthEnd > end) end = monthEnd
    }
  }

  return { start, end }
}

function getDates(start: Date, end: Date): Date[] {
  const dates: Date[] = []
  const cur = new Date(start)
  while (cur <= end) {
    dates.push(new Date(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

type MonthGroup = { label: string; days: number }
type MonthViewMonth = { year: number; month: number; label: string; startDate: Date; endDate: Date }

function getMonthGroups(dates: Date[]): MonthGroup[] {
  const groups: MonthGroup[] = []
  let currentLabel = ""
  let count = 0

  for (const d of dates) {
    const label = `${d.getFullYear()}年${d.getMonth() + 1}月`
    if (label !== currentLabel) {
      if (currentLabel) groups.push({ label: currentLabel, days: count })
      currentLabel = label
      count = 1
    } else {
      count++
    }
  }
  if (currentLabel) groups.push({ label: currentLabel, days: count })
  return groups
}

function keyDateToCenterPct(d: Date, months: MonthViewMonth[]): number | null {
  const n = months.length
  const firstMonth = months[0]
  const monthOffset = (d.getFullYear() - firstMonth.year) * 12 + (d.getMonth() - firstMonth.month)
  if (monthOffset < 0 || monthOffset >= n) return null
  const daysInMonth = months[monthOffset].endDate.getDate()
  return ((monthOffset + (d.getDate() - 0.5) / daysInMonth) / n) * 100
}

function calcMonthViewBar(
  p: { start_date: string | null; end_date: string | null },
  months: MonthViewMonth[],
): { leftPct: number; widthPct: number } | null {
  if (!p.start_date || !p.end_date) return null
  const sd = parseLocalDate(p.start_date)
  const ed = parseLocalDate(p.end_date)
  const n = months.length
  const firstMonth = months[0]
  const lastMonth = months[n - 1]

  if (ed < firstMonth.startDate || sd > lastMonth.endDate) return null

  // 日付をコンテナ幅に対するパーセンテージに変換する
  // isEnd=false: 日の開始位置（day-1）、isEnd=true: 日の終端位置（day）
  function dateToPct(d: Date, isEnd: boolean): number {
    const monthOffset = (d.getFullYear() - firstMonth.year) * 12 + (d.getMonth() - firstMonth.month)
    if (monthOffset < 0) return 0
    if (monthOffset >= n) return 100
    const daysInMonth = months[monthOffset].endDate.getDate()
    const dayOffset = isEnd ? d.getDate() : d.getDate() - 1
    return ((monthOffset + dayOffset / daysInMonth) / n) * 100
  }

  const leftPct = dateToPct(sd, false)
  const rightPct = dateToPct(ed, true)
  if (rightPct <= leftPct) return null

  return { leftPct, widthPct: rightPct - leftPct }
}

// ── 子タスクの行パッキング ──────────────────────────────────────
// 期間が重ならない子タスクを同じ行にまとめて返す
function packChildTasks(children: Project[]): Project[][] {
  const rows: Project[][] = []
  for (const child of children) {
    let placed = false
    for (const row of rows) {
      const overlaps = row.some((r) => {
        if (!r.start_date || !r.end_date || !child.start_date || !child.end_date) return false
        return !(child.end_date < r.start_date || child.start_date > r.end_date)
      })
      if (!overlaps) {
        row.push(child)
        placed = true
        break
      }
    }
    if (!placed) rows.push([child])
  }
  return rows
}

// ── 行背景（グリッド線 + 休日バンド）──────────────────────────────
function buildRowBg(dates: Date[], dayWidth: number, isRest: (d: Date) => boolean): string {
  const gridLine = `repeating-linear-gradient(to right, transparent, transparent ${dayWidth - 1}px, #e5e7eb ${dayWidth - 1}px, #e5e7eb ${dayWidth}px)`
  const bands = dates
    .map((d, i) => {
      if (!isRest(d)) return null
      const l = i * dayWidth
      const r = l + dayWidth
      return `linear-gradient(to right, transparent ${l}px, #d1d5db ${l}px, #d1d5db ${r}px, transparent ${r}px)`
    })
    .filter(Boolean)
    .join(", ")
  return bands ? `${gridLine}, ${bands}` : gridLine
}

// ── 空き日範囲の計算（担当タブ用）──────────────────────────────
// 本日以降で案件が1つも入っていない日のインデックス範囲を返す
function computeEmptyRanges(
  assignments: Array<{ project: Project; lane: number }>,
  startDate: Date,
  totalDays: number,
  todayIndex: number,
  dates: Date[],
  holidaySet: Set<string>,
): Array<{ fromIdx: number; toIdx: number }> {
  function toYMD(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  }
  function isRest(d: Date) {
    return d.getDay() === 0 || d.getDay() === 6 || holidaySet.has(toYMD(d))
  }

  const covered = new Uint8Array(totalDays)
  for (const { project: p } of assignments) {
    if (!p.start_date || !p.end_date) continue
    const si = Math.max(todayIndex, dayDiff(startDate, parseLocalDate(p.start_date)))
    const ei = Math.min(totalDays - 1, dayDiff(startDate, parseLocalDate(p.end_date)))
    for (let i = si; i <= ei; i++) covered[i] = 1
  }
  const ranges: Array<{ fromIdx: number; toIdx: number }> = []
  let i = Math.max(0, todayIndex)
  while (i < totalDays) {
    // 休日はハイライト対象外（スキップ）
    if (isRest(dates[i]) || covered[i]) {
      i++
    } else {
      const from = i
      while (i < totalDays && !covered[i] && !isRest(dates[i])) i++
      ranges.push({ fromIdx: from, toIdx: i - 1 })
    }
  }
  return ranges
}

// ── レーン割り当て（担当タブ用）──────────────────────────────
// 重なる案件を別レーンに振り分ける（最小レーン数でグリーディ割り当て）
function calcLanes(projectList: Project[]): {
  assignments: Array<{ project: Project; lane: number }>
  laneCount: number
} {
  const withDates = [...projectList]
    .filter((p) => p.start_date && p.end_date)
    .sort((a, b) => a.start_date!.localeCompare(b.start_date!))

  const laneEnds: string[] = [] // 各レーンの最後の案件の終了日
  const assignments: Array<{ project: Project; lane: number }> = []

  for (const p of withDates) {
    let placed = false
    for (let i = 0; i < laneEnds.length; i++) {
      // 前の案件の終了日が現在の開始日より前なら同じレーンに配置可能
      if (laneEnds[i] < p.start_date!) {
        laneEnds[i] = p.end_date!
        assignments.push({ project: p, lane: i })
        placed = true
        break
      }
    }
    if (!placed) {
      assignments.push({ project: p, lane: laneEnds.length })
      laneEnds.push(p.end_date!)
    }
  }

  return { assignments, laneCount: Math.max(1, laneEnds.length) }
}

// ── 営業日計算 ─────────────────────────────────────────────
function calcBusinessDays(startDate: string, endDate: string, offDaySet: Set<string>): number {
  const s = parseLocalDate(startDate)
  const e = parseLocalDate(endDate)
  let count = 0
  const cur = new Date(s)
  while (cur <= e) {
    if (cur.getDay() !== 0 && cur.getDay() !== 6) {
      const ymd = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`
      if (!offDaySet.has(ymd)) count++
    }
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"]

function formatDateJP(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  const date = new Date(y, m - 1, d)
  return `${m}月${d}日（${DAY_LABELS[date.getDay()]}）`
}

function DragDateTooltip({
  mouseX,
  mouseY,
  dragType,
  currentStart,
  currentEnd,
}: {
  mouseX: number
  mouseY: number
  dragType: "resize-start" | "resize-end" | "move"
  currentStart: string | null
  currentEnd: string | null
}) {
  if (!currentStart || !currentEnd) return null

  const label =
    dragType === "resize-start"
      ? formatDateJP(currentStart)
      : dragType === "resize-end"
        ? formatDateJP(currentEnd)
        : `${formatDateJP(currentStart)} 〜 ${formatDateJP(currentEnd)}`

  const OFFSET = 10
  const estWidth = dragType === "move" ? 260 : 130
  const vw = typeof window !== "undefined" ? window.innerWidth : 1920

  let left: number
  let top: number

  if (dragType === "resize-start") {
    left = mouseX - estWidth - OFFSET
    top = mouseY - 32
  } else if (dragType === "resize-end") {
    left = mouseX + OFFSET
    top = mouseY - 32
  } else {
    left = mouseX - estWidth / 2
    top = mouseY - 40
  }

  left = Math.max(4, Math.min(left, vw - estWidth - 4))

  return (
    <div
      className="fixed z-[60] pointer-events-none px-2.5 py-1.5 rounded-md bg-gray-900 text-white text-xs font-medium whitespace-nowrap shadow-lg"
      style={{ left, top }}
    >
      {label}
    </div>
  )
}

function BarHoverCardContent({ project, offDaySet }: { project: Project; offDaySet: Set<string> }) {
  const assigneeDisplay = project.assignee_names.length > 0 ? project.assignee_names.join("、") : "未設定"
  const businessDays = project.start_date && project.end_date
    ? calcBusinessDays(project.start_date, project.end_date, offDaySet)
    : null
  return (
    <div className="space-y-1.5 text-xs">
      <div>
        <span className="font-semibold">担当者：</span>
        <span>{assigneeDisplay}</span>
      </div>
      {businessDays !== null && (
        <div>
          <span className="font-semibold">営業日：</span>
          <span>{businessDays}日</span>
        </div>
      )}
      {project.memo && (
        <div>
          <div className="font-semibold">メモ：</div>
          <div className="whitespace-pre-line mt-0.5">{project.memo}</div>
        </div>
      )}
    </div>
  )
}

// ── タイムラインビュー ──────────────────────────────────────

export function TimelineView({
  projects,
  users,
  holidays,
  customHolidays,
  userPaidLeaves,
}: {
  projects: Project[]
  users: User[]
  holidays: string[]
  customHolidays: string[]
  userPaidLeaves: Record<number, string[]>
}) {
  const holidaySet = new Set([...holidays, ...customHolidays])
  const { start, end } = getDisplayRange(projects)
  const dates = getDates(start, end)
  const monthGroups = getMonthGroups(dates)
  const totalDays = dates.length

  const todayLocal = new Date()
  todayLocal.setHours(0, 0, 0, 0)
  const todayIndex = dayDiff(start, todayLocal)
  const showTodayLine = todayIndex >= 0 && todayIndex < totalDays

  const scrollRef = useRef<HTMLDivElement>(null)
  const assignScrollRef = useRef<HTMLDivElement>(null)
  const projectHeaderScrollRef = useRef<HTMLDivElement>(null)
  const assignHeaderScrollRef = useRef<HTMLDivElement>(null)

  // ── 表示モード（月 / 日）──
  const [viewMode, setViewMode] = useState<"month" | "day">("day")

  function handleViewMode(mode: "month" | "day") {
    setViewMode(mode)
  }

  function handleScrollToToday() {
    if (viewMode === "day") {
      if (activeTab === "project") {
        if (scrollRef.current) scrollRef.current.scrollLeft = todayIndex * dayWidth
        if (projectHeaderScrollRef.current) projectHeaderScrollRef.current.scrollLeft = todayIndex * dayWidth
      } else {
        if (assignScrollRef.current) assignScrollRef.current.scrollLeft = todayIndex * dayWidth
        if (assignHeaderScrollRef.current) assignHeaderScrollRef.current.scrollLeft = todayIndex * dayWidth
      }
    } else {
      const colWidth = monthColWidth
      if (monthViewScrollRef.current) monthViewScrollRef.current.scrollLeft = 1 * colWidth
      if (monthViewHeaderScrollRef.current) monthViewHeaderScrollRef.current.scrollLeft = 1 * colWidth
    }
  }

  // ── 月ビュー：列幅（1画面に6ヶ月）──
  const monthViewScrollRef = useRef<HTMLDivElement>(null)
  const monthViewHeaderScrollRef = useRef<HTMLDivElement>(null)
  const [monthColWidth, setMonthColWidth] = useState(160)
  const monthViewScrollInitialized = useRef(false)

  // ── 日幅（ドラッグで可変）──
  const [dayWidth, setDayWidth] = useState(DEFAULT_DAY_WIDTH)
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)

  const totalWidth = totalDays * dayWidth

  useEffect(() => {
    if (scrollRef.current && todayIndex > 0) {
      scrollRef.current.scrollLeft = todayIndex * dayWidth
      if (projectHeaderScrollRef.current) projectHeaderScrollRef.current.scrollLeft = todayIndex * dayWidth
    }
    if (assignScrollRef.current && todayIndex > 0) {
      assignScrollRef.current.scrollLeft = todayIndex * dayWidth
      if (assignHeaderScrollRef.current) assignHeaderScrollRef.current.scrollLeft = todayIndex * dayWidth
    }
    // dayWidth 変化時は再スクロールしない（意図した表示位置を保持）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayIndex])

  function handleDayHeaderMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    const startX = e.clientX
    dragRef.current = { startX, startWidth: dayWidth }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const clickedDayIdx = Math.floor((e.clientX - rect.left) / dayWidth)
    let didDrag = false

    function onMouseMove(ev: MouseEvent) {
      if (!dragRef.current) return
      const delta = ev.clientX - dragRef.current.startX
      if (Math.abs(delta) >= 3) {
        didDrag = true
        const next = Math.min(MAX_DAY_WIDTH, Math.max(MIN_DAY_WIDTH, dragRef.current.startWidth + delta * 0.3))
        setDayWidth(next)
      }
    }

    function onMouseUp() {
      if (!didDrag && clickedDayIdx >= 0 && clickedDayIdx < totalDays) {
        setHighlightedDateIndices((prev) => {
          const next = new Set(prev)
          if (next.has(clickedDayIdx)) next.delete(clickedDayIdx)
          else next.add(clickedDayIdx)
          return next
        })
      }
      dragRef.current = null
      document.removeEventListener("mousemove", onMouseMove)
      document.removeEventListener("mouseup", onMouseUp)
    }

    document.addEventListener("mousemove", onMouseMove)
    document.addEventListener("mouseup", onMouseUp)
  }

  const [highlightedDateIndices, setHighlightedDateIndices] = useState<Set<number>>(new Set())

  const [activeTab, setActiveTab] = useState("project")

  useEffect(() => {
    if (todayIndex <= 0) return
    if (activeTab === "project" && scrollRef.current) {
      scrollRef.current.scrollLeft = todayIndex * dayWidth
      if (projectHeaderScrollRef.current) projectHeaderScrollRef.current.scrollLeft = todayIndex * dayWidth
    }
    if (activeTab === "assign" && assignScrollRef.current) {
      assignScrollRef.current.scrollLeft = todayIndex * dayWidth
      if (assignHeaderScrollRef.current) assignHeaderScrollRef.current.scrollLeft = todayIndex * dayWidth
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  useEffect(() => {
    monthViewScrollInitialized.current = false
    const el = monthViewScrollRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const colWidth = Math.floor(entry.contentRect.width / 6)
      setMonthColWidth(colWidth)
      if (!monthViewScrollInitialized.current) {
        monthViewScrollInitialized.current = true
        // monthViewMonths[0] = 前月、[1] = 現在月 なので index=1 にスクロール
        el.scrollLeft = 1 * colWidth
        if (monthViewHeaderScrollRef.current) monthViewHeaderScrollRef.current.scrollLeft = 1 * colWidth
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [viewMode, activeTab])

  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    setExpandedProjectIds((prev) => {
      const next = new Set(prev)
      for (const id of prev) {
        const project = projects.find((p) => p.id === id)
        if (!project || !project.has_children) next.delete(id)
      }
      return next
    })
  }, [projects])

  function toggleExpand(id: number) {
    setExpandedProjectIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const [editProject, setEditProject] = useState<Project | null>(null)
  const [deleteConfirmTask, setDeleteConfirmTask] = useState<Project | null>(null)
  const [barHoverCard, setBarHoverCard] = useState<{ project: Project; x: number; y: number; offDaySet: Set<string> } | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [customDates, setCustomDates] = useState<string[]>(customHolidays)
  const [userPaidLeaveMap, setUserPaidLeaveMap] = useState<Record<number, string[]>>(userPaidLeaves)
  const [userSettingsUserId, setUserSettingsUserId] = useState<number | null>(null)
  const [userSettingsDates, setUserSettingsDates] = useState<string[]>([])
  const [isPending, startTransition] = useTransition()

  const barDrag = useBarDrag(dayWidth, start, totalDays, (id, newStart, newEnd) => {
    startTransition(async () => {
      await updateProjectDatesAction(id, newStart, newEnd)
    })
  })

  function handleAdd(formData: FormData) {
    startTransition(async () => {
      await addProjectTimelineAction(formData)
      setAddOpen(false)
    })
  }

  const [sortKey, setSortKey] = useState<SortKey | null>("start_date")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc")
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const sortMenuRef = useRef<HTMLDivElement>(null)

  // 案件タブ絞り込み（受注済のみ表示）
  const [showOrderedOnly, setShowOrderedOnly] = useState(false)

  // 担当タブ 空きハイライト
  const [showAvailabilityHighlight, setShowAvailabilityHighlight] = useState(false)

  // 担当タブ 親バー非表示
  const [hideParentBars, setHideParentBars] = useState(false)

  // 案件タブ絞り込み（hiddenProjectUserIds に含まれるユーザーの案件は非表示）
  const [hiddenProjectUserIds, setHiddenProjectUserIds] = useState<Set<number>>(new Set())
  const [showUnassigned, setShowUnassigned] = useState(true)
  const [projectFilterOpen, setProjectFilterOpen] = useState(false)
  const projectFilterRef = useRef<HTMLDivElement>(null)

  // 担当タブ絞り込み（hiddenUserIds に含まれるユーザーは非表示）
  const [hiddenUserIds, setHiddenUserIds] = useState<Set<number>>(new Set())
  const [assignFilterOpen, setAssignFilterOpen] = useState(false)
  const assignFilterRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!sortMenuOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setSortMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [sortMenuOpen])

  useEffect(() => {
    if (!projectFilterOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (projectFilterRef.current && !projectFilterRef.current.contains(e.target as Node)) {
        setProjectFilterOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [projectFilterOpen])

  useEffect(() => {
    if (!assignFilterOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (assignFilterRef.current && !assignFilterRef.current.contains(e.target as Node)) {
        setAssignFilterOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [assignFilterOpen])

  const sortedProjects = useMemo(() => {
    if (!sortKey) return projects
    return [...projects].sort((a, b) => {
      if (sortKey === "id") {
        return sortOrder === "asc" ? a.id - b.id : b.id - a.id
      }
      if (sortKey === "volume") {
        const av = a.volume ?? -1
        const bv = b.volume ?? -1
        if (av === -1 && bv === -1) return 0
        if (av === -1) return 1
        if (bv === -1) return -1
        return sortOrder === "asc" ? av - bv : bv - av
      }
      const aDate = sortKey === "start_date" ? a.start_date : a.end_date
      const bDate = sortKey === "start_date" ? b.start_date : b.end_date
      if (!aDate && !bDate) return 0
      if (!aDate) return 1
      if (!bDate) return -1
      const cmp = aDate.localeCompare(bDate)
      return sortOrder === "asc" ? cmp : -cmp
    })
  }, [projects, sortKey, sortOrder])

  const visibleProjects = useMemo(
    () => showOrderedOnly ? sortedProjects.filter((p) => p.status === "受注済") : sortedProjects,
    [sortedProjects, showOrderedOnly],
  )

  const isProjectFilterActive = hiddenProjectUserIds.size > 0 || !showUnassigned

  // 案件タブ絞り込み用: 全ユーザーを表示
  const projectTabAssigneeUsers = users

  // 案件ビュー専用: 子タスクを除外（フィルタ未使用時の通常表示用）
  const projectTabProjects = useMemo(
    () => visibleProjects.filter((p) => p.parent_id === null),
    [visibleProjects],
  )

  // フィルタ使用時: 該当する子タスクを親ごとにパックして列挙
  const filteredChildRows = useMemo(() => {
    if (!isProjectFilterActive) return []
    const rows: Array<{ packedRow: Project[]; parentName: string }> = []
    for (const parent of visibleProjects.filter((p) => p.parent_id === null && p.has_children)) {
      const children = projects.filter((c) => c.parent_id === parent.id)
      const matched = children.filter((child) => {
        if (child.assignee_type === "client" || child.assignee_type === "stakeholder") return false
        if (child.assignee_ids.length === 0) return showUnassigned
        return child.assignee_ids.some((id) => !hiddenProjectUserIds.has(id))
      })
      if (matched.length === 0) continue
      for (const packedRow of packChildTasks(matched)) {
        rows.push({ packedRow, parentName: parent.name })
      }
    }
    return rows
  }, [isProjectFilterActive, visibleProjects, projects, hiddenProjectUserIds, showUnassigned])

  function handleSortOption(key: SortKey) {
    if (sortKey === key) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortOrder("asc")
    }
    setSortMenuOpen(false)
  }

  function handleSettingsSave() {
    const valid = customDates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    startTransition(async () => {
      await saveCustomHolidaysAction(valid)
      setSettingsOpen(false)
    })
  }

  function addCustomDate() {
    const today = new Date()
    const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
    setCustomDates((prev) => [...prev, ymd])
  }

  function updateCustomDate(index: number, value: string) {
    setCustomDates((prev) => prev.map((d, i) => (i === index ? value : d)))
  }

  function removeCustomDate(index: number) {
    setCustomDates((prev) => prev.filter((_, i) => i !== index))
  }

  function openUserSettings(userId: number) {
    setUserSettingsUserId(userId)
    setUserSettingsDates(userPaidLeaveMap[userId] ?? [])
  }

  function handleUserSettingsSave() {
    if (userSettingsUserId === null) return
    const valid = userSettingsDates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    const uid = userSettingsUserId
    startTransition(async () => {
      await saveUserPaidLeavesAction(uid, valid)
      setUserPaidLeaveMap((prev) => ({ ...prev, [uid]: valid }))
      setUserSettingsUserId(null)
    })
  }

  function addUserSettingsDate() {
    const ymd = toYMD(new Date())
    setUserSettingsDates((prev) => [...prev, ymd])
  }

  function updateUserSettingsDate(index: number, value: string) {
    setUserSettingsDates((prev) => prev.map((d, i) => (i === index ? value : d)))
  }

  function removeUserSettingsDate(index: number) {
    setUserSettingsDates((prev) => prev.filter((_, i) => i !== index))
  }

  function toYMD(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  }

  function isRestDay(d: Date): boolean {
    return d.getDay() === 0 || d.getDay() === 6 || holidaySet.has(toYMD(d))
  }

  // 縦グリッド線 + 休日列（土日・祝日）の背景を background-image で合成
  const rowBg = buildRowBg(dates, dayWidth, isRestDay)
  const totalMonthWidth = monthColWidth * 12

  const monthViewMonths = useMemo<MonthViewMonth[]>(() => {
    const today = new Date()
    const baseYear = today.getFullYear()
    const baseMonth = today.getMonth() - 1
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(baseYear, baseMonth + i, 1)
      return {
        year: d.getFullYear(),
        month: d.getMonth(),
        label: `${d.getFullYear()}年${d.getMonth() + 1}月`,
        startDate: d,
        endDate: new Date(d.getFullYear(), d.getMonth() + 1, 0),
      }
    })
  }, [])

  const monthBarDrag = useMonthBarDrag(monthColWidth, monthViewMonths, (id, newStart, newEnd) => {
    startTransition(async () => {
      await updateProjectDatesAction(id, newStart, newEnd)
    })
  })

  const TABS = [
    { id: "project", label: "案件" },
    { id: "assign", label: "担当" },
  ]

  return (
    <TooltipProvider>
      {/* ── タブ ── */}
      <div className="border-b mb-4">
        <div className="flex gap-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={[
                "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "project" && (
      <>
      {/* ── ツールバー ── */}
      <div className="flex justify-end gap-2 mb-2">
        {/* 月/日 切り替えボタングループ */}
        <div className="inline-flex items-center gap-2 mr-auto">
          <div className="inline-flex">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleViewMode("month")}
              className={[
                "rounded-r-none border-r-0",
                viewMode === "month" ? "bg-muted text-foreground" : "",
              ].join(" ")}
            >
              月
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleViewMode("day")}
              className={[
                "rounded-l-none",
                viewMode === "day" ? "bg-muted text-foreground" : "",
              ].join(" ")}
            >
              日
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={handleScrollToToday}>
            今日
          </Button>
        </div>
        {/* ソートボタン */}
        <div ref={sortMenuRef} className="relative">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortMenuOpen((prev) => !prev)}
            className={sortKey ? "border-primary text-primary" : ""}
          >
            {sortKey ? (
              sortOrder === "asc" ? <ArrowUpIcon className="size-4" /> : <ArrowDownIcon className="size-4" />
            ) : (
              <ArrowUpDownIcon className="size-4" />
            )}
            {sortKey ? SORT_LABEL_MAP.get(sortKey) : "並び替え"}
          </Button>
          {sortMenuOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 w-52 rounded-md border bg-background shadow-md py-1">
              {SORT_OPTIONS.map(({ key, label }) => (
                <div key={key}>
                  <button
                    type="button"
                    className={[
                      "w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted transition-colors",
                      sortKey === key ? "text-primary font-medium" : "text-foreground",
                    ].join(" ")}
                    onClick={() => handleSortOption(key)}
                  >
                    <span>{label}</span>
                    {sortKey === key ? (
                      sortOrder === "asc" ? (
                        <ArrowUpIcon className="size-3.5 shrink-0" />
                      ) : (
                        <ArrowDownIcon className="size-3.5 shrink-0" />
                      )
                    ) : (
                      <ArrowUpDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                </div>
              ))}
              {sortKey && (
                <>
                  <div className="my-1 border-t" />
                  <button
                    type="button"
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
                    onClick={() => { setSortKey(null); setSortMenuOpen(false) }}
                  >
                    <CheckIcon className="size-3.5" />
                    並び替えをリセット
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        {/* 絞り込みボタン（案件タブ） */}
        <div ref={projectFilterRef} className="relative">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setProjectFilterOpen((prev) => !prev)}
            className={hiddenProjectUserIds.size > 0 || !showUnassigned ? "border-primary text-primary" : ""}
          >
            <ListFilterIcon className="size-4" />
            絞り込み
          </Button>
          {projectFilterOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-md border bg-background shadow-md py-1">
              <div className="flex items-center justify-between px-3 py-1.5 border-b">
                <span className="text-xs font-semibold text-muted-foreground">表示する担当者</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => { setHiddenProjectUserIds(new Set()); setShowUnassigned(true) }}
                  >
                    すべて表示
                  </button>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:underline"
                    onClick={() => { setHiddenProjectUserIds(new Set(projectTabAssigneeUsers.map((u) => u.id))); setShowUnassigned(false) }}
                  >
                    すべて非表示
                  </button>
                </div>
              </div>
              <div className="max-h-60 overflow-y-auto">
                <label className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted cursor-pointer border-b">
                  <input
                    type="checkbox"
                    checked={showUnassigned}
                    onChange={(e) => setShowUnassigned(e.target.checked)}
                    className="size-4 rounded border-input accent-primary shrink-0"
                  />
                  <span className="truncate text-muted-foreground">未アサイン</span>
                </label>
                {projectTabAssigneeUsers.map((u) => (
                  <label
                    key={u.id}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={!hiddenProjectUserIds.has(u.id)}
                      onChange={(e) => {
                        setHiddenProjectUserIds((prev) => {
                          const next = new Set(prev)
                          if (e.target.checked) next.delete(u.id)
                          else next.add(u.id)
                          return next
                        })
                      }}
                      className="size-4 rounded border-input accent-primary shrink-0"
                    />
                    <span className="truncate">{u.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showOrderedOnly}
            onChange={(e) => setShowOrderedOnly(e.target.checked)}
            className="size-4 rounded border-input accent-primary"
          />
          受注済のみ
        </label>
        <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
          <Settings2Icon className="size-4" />
          設定
        </Button>
      </div>

      {viewMode === "month" ? (
        /* ── 月ビュー（案件タブ） ── */
        <div className="rounded-lg border [overflow:clip] bg-background">
          {/* ── Sticky ヘッダー ── */}
          <div className="sticky top-0 z-20 flex bg-background">
            <div
              style={{ width: LEFT_COL_WIDTH, minWidth: LEFT_COL_WIDTH }}
              className="shrink-0 border-r bg-background"
            >
              <div
                style={{ height: MONTH_HEADER_HEIGHT + DAY_HEADER_HEIGHT }}
                className="border-b bg-muted/40 flex items-end px-3 pb-2 text-xs font-semibold text-muted-foreground"
              >
                案件名
              </div>
            </div>
            {/* 右ヘッダー（横スクロールなし・ボディとJS同期） */}
            <div ref={monthViewHeaderScrollRef} className="overflow-x-hidden flex-1">
              <div style={{ width: totalMonthWidth, minWidth: totalMonthWidth }}>
                <div className="flex border-b" style={{ height: MONTH_HEADER_HEIGHT + DAY_HEADER_HEIGHT }}>
                  {monthViewMonths.map((m) => (
                    <div
                      key={m.label}
                      style={{ width: monthColWidth, minWidth: monthColWidth }}
                      className="border-r last:border-r-0 flex items-center justify-center px-2 text-xs font-semibold bg-muted/40 text-foreground"
                    >
                      {m.label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── ボディ ── */}
          <div className="flex">
            <div
              style={{ width: LEFT_COL_WIDTH, minWidth: LEFT_COL_WIDTH }}
              className="shrink-0 border-r bg-background z-10"
            >
              {isProjectFilterActive ? (
                filteredChildRows.length === 0 ? (
                  <div style={{ height: ROW_HEIGHT }} className="flex items-center px-3 text-sm text-muted-foreground">
                    案件なし
                  </div>
                ) : (
                  filteredChildRows.map(({ parentName }, rowIdx) => (
                    <div
                      key={`${parentName}-${rowIdx}`}
                      style={{ height: ROW_HEIGHT }}
                      className="w-full border-b flex items-center px-3 bg-muted/20"
                    >
                      <span className="text-sm font-medium truncate">{parentName}</span>
                    </div>
                  ))
                )
              ) : projectTabProjects.length === 0 ? (
                <div style={{ height: ROW_HEIGHT }} className="flex items-center px-3 text-sm text-muted-foreground">
                  案件なし
                </div>
              ) : (
                projectTabProjects.flatMap((p) => {
                  const isExpanded = expandedProjectIds.has(p.id)
                  const childTasks = p.has_children ? projects.filter((c) => c.parent_id === p.id) : []
                  const packedRows = isExpanded ? packChildTasks(childTasks) : []
                  return [
                    <button
                      key={p.id}
                      type="button"
                      style={{ height: ROW_HEIGHT }}
                      className="w-full border-b flex items-center gap-2 px-3 text-left hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => p.has_children ? toggleExpand(p.id) : setEditProject(p)}
                      title={p.has_children ? `${p.name}（クリックで子タスクを展開）` : `${p.name}（クリックで編集）`}
                    >
                      {p.has_children && (
                        <ChevronRightIcon
                          className={`shrink-0 size-3.5 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}
                        />
                      )}
                      <span className="text-sm font-medium truncate">{p.name}</span>
                    </button>,
                    ...packedRows.map((_, rowIdx) => (
                      <div
                        key={`child-row-${p.id}-${rowIdx}`}
                        style={{ height: ROW_HEIGHT }}
                        className="w-full border-b flex items-center gap-2 pl-8 pr-3 bg-muted/20"
                      >
                        {rowIdx === 0 && (
                          <span className="text-xs font-medium text-muted-foreground">子タスク</span>
                        )}
                      </div>
                    )),
                  ]
                })
              )}
            </div>
            <div
              ref={monthViewScrollRef}
              className="overflow-x-auto flex-1"
              onScroll={(e) => {
                if (monthViewHeaderScrollRef.current) {
                  monthViewHeaderScrollRef.current.scrollLeft = e.currentTarget.scrollLeft
                }
              }}
            >
              <div style={{ width: totalMonthWidth, minWidth: totalMonthWidth }}>
                {isProjectFilterActive ? (
                  filteredChildRows.length === 0 ? (
                    <div style={{ height: ROW_HEIGHT }} className="flex items-center justify-center text-sm text-muted-foreground">
                      案件がありません。
                    </div>
                  ) : (
                    filteredChildRows.map(({ packedRow, parentName }, rowIdx) => (
                      <div
                        key={`${parentName}-${rowIdx}`}
                        style={{ height: ROW_HEIGHT, width: totalMonthWidth, position: "relative" }}
                        className="flex border-b bg-muted/20"
                      >
                        {monthViewMonths.map((m) => (
                          <div key={m.label} style={{ width: monthColWidth, minWidth: monthColWidth, flexShrink: 0 }} className="border-r last:border-r-0 h-full" />
                        ))}
                        {packedRow.map((c) => {
                          const override = monthBarDrag.getBarOverride(c.id)
                          const barInfo = calcMonthViewBar(override ?? c, monthViewMonths)
                          if (!barInfo) return null
                          const barColor = barColorFromProject(c, true)
                          const isDark = c.assignee_type === "stakeholder" && c.stakeholder_assignee_ids.length > 0
                          const isThisDragging = monthBarDrag.draggingId === c.id
                          return (
                            <ContextMenu key={c.id}>
                              <ContextMenuTrigger
                                className={`group absolute rounded-md transition-opacity flex items-center overflow-hidden shadow-sm ${isThisDragging ? "opacity-80 z-10 cursor-grabbing" : "hover:opacity-80 cursor-grab"}`}
                                style={{ left: `${barInfo.leftPct}%`, width: `${barInfo.widthPct}%`, top: 10, bottom: 10, backgroundColor: barColor }}
                                onMouseDown={(e) => { if (!monthViewScrollRef.current) return; monthBarDrag.startDrag("move", c, e, monthViewScrollRef.current) }}
                                onMouseEnter={(e) => setBarHoverCard({ project: c, x: e.clientX, y: e.clientY, offDaySet: holidaySet })}
                                onMouseLeave={() => setBarHoverCard(null)}
                              >
                                <div className={`absolute left-[3px] top-1/2 -translate-y-1/2 h-[80%] w-[3px] rounded-[999px] opacity-0 group-hover:opacity-100 transition-opacity cursor-ew-resize ${isDark ? "bg-black/30" : "bg-white/60"}`} onMouseDown={(e) => { if (!monthViewScrollRef.current) return; monthBarDrag.startDrag("resize-start", c, e, monthViewScrollRef.current) }} />
                                <span className={`px-2 text-xs font-medium truncate leading-none ${isDark ? "text-gray-800" : "text-white"}`}>{c.name}</span>
                                <div className={`absolute right-[3px] top-1/2 -translate-y-1/2 h-[80%] w-[3px] rounded-[999px] opacity-0 group-hover:opacity-100 transition-opacity cursor-ew-resize ${isDark ? "bg-black/30" : "bg-white/60"}`} onMouseDown={(e) => { if (!monthViewScrollRef.current) return; monthBarDrag.startDrag("resize-end", c, e, monthViewScrollRef.current) }} />
                              </ContextMenuTrigger>
                              <ContextMenuContent>
                                <ContextMenuItem onClick={() => setEditProject(c)}>編集する</ContextMenuItem>
                                <ContextMenuItem variant="destructive" onClick={() => setDeleteConfirmTask(c)}>子タスクを削除</ContextMenuItem>
                              </ContextMenuContent>
                            </ContextMenu>
                          )
                        })}
                      </div>
                    ))
                  )
                ) : projectTabProjects.length === 0 ? (
                  <div style={{ height: ROW_HEIGHT }} className="flex items-center justify-center text-sm text-muted-foreground">
                    案件がありません。「案件一覧」から登録してください。
                  </div>
                ) : (
                  projectTabProjects.flatMap((p) => {
                    const isExpanded = expandedProjectIds.has(p.id)
                    const childTasks = p.has_children ? projects.filter((c) => c.parent_id === p.id) : []
                    const packedRows = isExpanded ? packChildTasks(childTasks) : []

                    const parentOverride = monthBarDrag.getBarOverride(p.id)
                    const parentBarInfo = calcMonthViewBar(parentOverride ?? p, monthViewMonths)
                    const isParentDragging = monthBarDrag.draggingId === p.id
                    const parentBarColor = isExpanded ? (p.status === "相談中" ? "#d1d5db" : barColorFromParentVolume(p.volume)) : barColorFromProject(p, true)
                    // 親 + 全子タスクの key_dates を親行に常に集約して表示
                    const parentKeyDates = Object.entries(
                      [...p.key_dates, ...childTasks.flatMap((c) => c.key_dates)].reduce<Record<string, string[]>>((acc, kd) => {
                        if (!kd.date) return acc
                        ;(acc[kd.date] ??= []).push(kd.label || kd.date)
                        return acc
                      }, {}),
                    )

                    return [
                      // 親案件行
                      <div
                        key={p.id}
                        style={{ height: ROW_HEIGHT, width: totalMonthWidth, position: "relative" }}
                        className="flex border-b"
                      >
                        {monthViewMonths.map((m) => (
                          <div key={m.label} style={{ width: monthColWidth, minWidth: monthColWidth, flexShrink: 0 }} className="border-r last:border-r-0 h-full" />
                        ))}
                        {parentBarInfo && (
                          <ContextMenu>
                            <ContextMenuTrigger
                              className={`group absolute rounded-md transition-opacity flex items-center overflow-hidden shadow-sm ${isParentDragging ? "opacity-80 z-10 cursor-grabbing" : "hover:opacity-80 cursor-grab"}`}
                              style={{
                                left: `${parentBarInfo.leftPct}%`,
                                width: `${parentBarInfo.widthPct}%`,
                                top: 10,
                                bottom: 10,
                                backgroundColor: parentBarColor,
                              }}
                              onMouseDown={(e) => { if (!monthViewScrollRef.current) return; monthBarDrag.startDrag("move", p, e, monthViewScrollRef.current) }}
                              onMouseEnter={(e) => setBarHoverCard({ project: p, x: e.clientX, y: e.clientY, offDaySet: holidaySet })}
                              onMouseLeave={() => setBarHoverCard(null)}
                            >
                              <div className="absolute left-[3px] top-1/2 -translate-y-1/2 h-[80%] w-[3px] rounded-[999px] bg-white/60 opacity-0 group-hover:opacity-100 transition-opacity cursor-ew-resize" onMouseDown={(e) => { if (!monthViewScrollRef.current) return; monthBarDrag.startDrag("resize-start", p, e, monthViewScrollRef.current) }} />
                              <span className="px-2 text-xs text-white font-medium truncate leading-none">{p.name}</span>
                              <div className="absolute right-[3px] top-1/2 -translate-y-1/2 h-[80%] w-[3px] rounded-[999px] bg-white/60 opacity-0 group-hover:opacity-100 transition-opacity cursor-ew-resize" onMouseDown={(e) => { if (!monthViewScrollRef.current) return; monthBarDrag.startDrag("resize-end", p, e, monthViewScrollRef.current) }} />
                            </ContextMenuTrigger>
                            <ContextMenuContent>
                              <ContextMenuItem onClick={() => setEditProject(p)}>編集する</ContextMenuItem>
                              {p.parent_id === null && <ContextMenuItem onClick={() => {
                                const dates = calcQuickChildDates(p, projects.filter((c) => c.parent_id === p.id))
                                if (!dates) return
                                setExpandedProjectIds((prev) => new Set(prev).add(p.id))
                                startTransition(async () => { await quickAddChildTaskAction(p.id, p.status, dates.startDate, dates.endDate) })
                              }}>子タスクを追加</ContextMenuItem>}
                            </ContextMenuContent>
                          </ContextMenu>
                        )}
                        {parentKeyDates.map(([date, labels]) => {
                          const centerPct = keyDateToCenterPct(parseLocalDate(date), monthViewMonths)
                          if (centerPct === null) return null
                          return (
                            <Tooltip key={date}>
                              <TooltipTrigger
                                className="absolute rounded-full z-10 cursor-default"
                                style={{ left: `calc(${centerPct}% - 5px)`, top: ROW_HEIGHT / 2 - 5, width: 10, height: 10, backgroundColor: "#ef4444" }}
                              />
                              <TooltipContent><span className="whitespace-pre-line">{labels.join("\n")}</span></TooltipContent>
                            </Tooltip>
                          )
                        })}
                      </div>,
                      // 子タスクパック行
                      ...packedRows.map((rowChildren, rowIdx) => (
                        <div
                          key={`child-row-${p.id}-${rowIdx}`}
                          style={{ height: ROW_HEIGHT, width: totalMonthWidth, position: "relative" }}
                          className="flex border-b bg-muted/20"
                        >
                          {monthViewMonths.map((m) => (
                            <div key={m.label} style={{ width: monthColWidth, minWidth: monthColWidth, flexShrink: 0 }} className="border-r last:border-r-0 h-full" />
                          ))}
                          {rowChildren.map((c) => {
                            const override = monthBarDrag.getBarOverride(c.id)
                            const barInfo = calcMonthViewBar(override ?? c, monthViewMonths)
                            if (!barInfo) return null
                            const barColor = barColorFromProject(c, true)
                            const isDark = c.assignee_type === "stakeholder" && c.stakeholder_assignee_ids.length > 0
                            const isThisDragging = monthBarDrag.draggingId === c.id
                            return (
                              <ContextMenu key={c.id}>
                                <ContextMenuTrigger
                                  className={`group absolute rounded-md transition-opacity flex items-center overflow-hidden shadow-sm ${isThisDragging ? "opacity-80 z-10 cursor-grabbing" : "hover:opacity-80 cursor-grab"}`}
                                  style={{
                                    left: `${barInfo.leftPct}%`,
                                    width: `${barInfo.widthPct}%`,
                                    top: 10,
                                    bottom: 10,
                                    backgroundColor: barColor,
                                  }}
                                  onMouseDown={(e) => { if (!monthViewScrollRef.current) return; monthBarDrag.startDrag("move", c, e, monthViewScrollRef.current) }}
                                  onMouseEnter={(e) => setBarHoverCard({ project: c, x: e.clientX, y: e.clientY, offDaySet: holidaySet })}
                                  onMouseLeave={() => setBarHoverCard(null)}
                                >
                                  <div className={`absolute left-[3px] top-1/2 -translate-y-1/2 h-[80%] w-[3px] rounded-[999px] opacity-0 group-hover:opacity-100 transition-opacity cursor-ew-resize ${isDark ? "bg-black/30" : "bg-white/60"}`} onMouseDown={(e) => { if (!monthViewScrollRef.current) return; monthBarDrag.startDrag("resize-start", c, e, monthViewScrollRef.current) }} />
                                  <span className={`px-2 text-xs font-medium truncate leading-none ${isDark ? "text-gray-800" : "text-white"}`}>{c.name}</span>
                                  <div className={`absolute right-[3px] top-1/2 -translate-y-1/2 h-[80%] w-[3px] rounded-[999px] opacity-0 group-hover:opacity-100 transition-opacity cursor-ew-resize ${isDark ? "bg-black/30" : "bg-white/60"}`} onMouseDown={(e) => { if (!monthViewScrollRef.current) return; monthBarDrag.startDrag("resize-end", c, e, monthViewScrollRef.current) }} />
                                </ContextMenuTrigger>
                                <ContextMenuContent>
                                  <ContextMenuItem onClick={() => setEditProject(c)}>編集する</ContextMenuItem>
                                  <ContextMenuItem variant="destructive" onClick={() => setDeleteConfirmTask(c)}>子タスクを削除</ContextMenuItem>
                                </ContextMenuContent>
                              </ContextMenu>
                            )
                          })}
                        </div>
                      )),
                    ]
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ── 日ビュー（案件タブ） ── */
        <div className="rounded-lg border [overflow:clip] bg-background">
          {/* ── Sticky ヘッダー（月・日行） ── */}
          <div className="sticky top-0 z-20 flex bg-background">
            {/* 左ヘッダー */}
            <div
              style={{ width: LEFT_COL_WIDTH, minWidth: LEFT_COL_WIDTH }}
              className="shrink-0 border-r bg-background"
            >
              <div style={{ height: MONTH_HEADER_HEIGHT }} className="border-b bg-muted/40" />
              <div
                style={{ height: DAY_HEADER_HEIGHT }}
                className="border-b bg-muted/40 flex items-center px-3 text-xs font-semibold text-muted-foreground"
              >
                案件名
              </div>
            </div>
            {/* 右ヘッダー（横スクロールなし・ボディとJS同期） */}
            <div ref={projectHeaderScrollRef} className="overflow-x-hidden flex-1">
              <div style={{ width: totalWidth, minWidth: totalWidth }}>
                {/* 月ヘッダー */}
                <div className="flex" style={{ height: MONTH_HEADER_HEIGHT }}>
                  {monthGroups.map((mg, i) => (
                    <div
                      key={i}
                      style={{ width: mg.days * dayWidth, minWidth: mg.days * dayWidth }}
                      className="border-b border-r last:border-r-0 flex items-center px-2 text-xs font-semibold bg-muted/40 text-foreground"
                    >
                      {mg.label}
                    </div>
                  ))}
                </div>
                {/* 日ヘッダー */}
                <div
                  className="flex border-b select-none cursor-ew-resize"
                  style={{ height: DAY_HEADER_HEIGHT }}
                  onMouseDown={handleDayHeaderMouseDown}
                >
                  {dates.map((d, i) => {
                    const isToday = i === todayIndex
                    const isHighlighted = highlightedDateIndices.has(i)
                    return (
                      <div
                        key={i}
                        style={{ width: dayWidth, minWidth: dayWidth }}
                        className={[
                          "border-r last:border-r-0 flex flex-col items-center justify-center text-[10px] font-medium leading-tight overflow-hidden",
                          isToday
                            ? "bg-green-500 text-white"
                            : isHighlighted
                            ? "bg-yellow-300 text-foreground"
                            : isRestDay(d)
                            ? "bg-gray-300 text-muted-foreground"
                            : "text-muted-foreground",
                        ].join(" ")}
                      >
                        <span>{d.getDate()}</span>
                        {dayWidth >= 24 && (
                          <span>{["(日)", "(月)", "(火)", "(水)", "(木)", "(金)", "(土)"][d.getDay()]}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* ── ボディ ── */}
          <div className="flex">
            {/* ── 左固定列 ── */}
            <div
              style={{ width: LEFT_COL_WIDTH, minWidth: LEFT_COL_WIDTH }}
              className="shrink-0 border-r bg-background z-10"
            >
              {/* 案件行 */}
              {isProjectFilterActive ? (
                filteredChildRows.length === 0 ? (
                  <div style={{ height: ROW_HEIGHT }} className="flex items-center px-3 text-sm text-muted-foreground">
                    案件なし
                  </div>
                ) : (
                  filteredChildRows.map(({ parentName }, rowIdx) => (
                    <div
                      key={`${parentName}-${rowIdx}`}
                      style={{ height: ROW_HEIGHT }}
                      className="w-full border-b border-black flex items-center px-3 bg-muted/20"
                    >
                      <span className="text-sm font-medium truncate">{parentName}</span>
                    </div>
                  ))
                )
              ) : projects.length === 0 ? (
                <div
                  style={{ height: ROW_HEIGHT }}
                  className="flex items-center px-3 text-sm text-muted-foreground"
                >
                  案件なし
                </div>
              ) : (
                projectTabProjects.flatMap((p) => {
                  const isExpanded = expandedProjectIds.has(p.id)
                  const childTasks = p.has_children ? projects.filter((c) => c.parent_id === p.id) : []
                  const packedRows = isExpanded ? packChildTasks(childTasks) : []
                  return [
                    <button
                      key={p.id}
                      type="button"
                      style={{ height: ROW_HEIGHT }}
                      className={`w-full border-b ${!isExpanded ? "border-black" : ""} flex items-center gap-2 px-3 text-left hover:bg-muted/50 transition-colors cursor-pointer`}
                      onClick={() => p.has_children ? toggleExpand(p.id) : setEditProject(p)}
                      title={p.has_children ? `${p.name}（クリックで子タスクを展開）` : `${p.name}（クリックで編集）`}
                    >
                      {p.has_children && (
                        <ChevronRightIcon
                          className={`shrink-0 size-3.5 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}
                        />
                      )}
                      <span className="text-sm font-medium truncate">{p.name}</span>
                    </button>,
                    ...packedRows.map((_, rowIdx) => (
                      <div
                        key={`child-left-${p.id}-${rowIdx}`}
                        style={{ height: ROW_HEIGHT }}
                        className={`w-full border-b ${rowIdx === packedRows.length - 1 ? "border-black" : ""} flex items-center pl-8 pr-3 bg-muted/20`}
                      >
                        {rowIdx === 0 && (
                          <span className="text-xs font-medium text-muted-foreground">子タスク</span>
                        )}
                      </div>
                    )),
                  ]
                })
              )}
            </div>

            {/* ── 右スクロール領域 ── */}
            <div
              ref={scrollRef}
              className="overflow-x-auto flex-1"
              onScroll={(e) => {
                if (projectHeaderScrollRef.current) {
                  projectHeaderScrollRef.current.scrollLeft = e.currentTarget.scrollLeft
                }
              }}
            >
              <div style={{ width: totalWidth, minWidth: totalWidth }}>

                {/* 案件行 */}
                {isProjectFilterActive ? (
                  filteredChildRows.length === 0 ? (
                    <div style={{ height: ROW_HEIGHT }} className="flex items-center justify-center text-sm text-muted-foreground">
                      案件がありません。
                    </div>
                  ) : (
                    filteredChildRows.map(({ packedRow, parentName }, rowIdx) => (
                      <div
                        key={`${parentName}-${rowIdx}`}
                        style={{ height: ROW_HEIGHT, width: totalWidth, position: "relative", backgroundImage: rowBg }}
                        className="border-b border-black bg-muted/20"
                      >
                        {showTodayLine && (
                          <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: todayIndex * dayWidth, width: dayWidth, backgroundColor: "rgba(74,222,128,0.3)" }} />
                        )}
                        {Array.from(highlightedDateIndices).map((idx) => (
                          <div key={idx} className="absolute top-0 bottom-0 pointer-events-none" style={{ left: idx * dayWidth, width: dayWidth, backgroundColor: "rgba(234,179,8,0.2)" }} />
                        ))}
                        {packedRow.map((c) => {
                          const override = barDrag.getBarOverride(c.id)
                          const effStart = override?.start_date ?? c.start_date
                          const effEnd = override?.end_date ?? c.end_date
                          if (!effStart || !effEnd) return null
                          const clampedStart = Math.max(0, dayDiff(start, parseLocalDate(effStart)))
                          const clampedEnd = Math.min(totalDays - 1, dayDiff(start, parseLocalDate(effEnd)))
                          if (clampedStart > clampedEnd) return null
                          const barLeft = clampedStart * dayWidth + 3
                          const barWidth = (clampedEnd - clampedStart + 1) * dayWidth - 6
                          const barColor = barColorFromProject(c, true)
                          const isThisDragging = barDrag.draggingId === c.id
                          const isDark = c.assignee_type === "stakeholder" && c.stakeholder_assignee_ids.length > 0
                          return (
                            <ContextMenu key={c.id}>
                              <ContextMenuTrigger
                                className={`group absolute rounded-md transition-opacity flex items-center overflow-hidden shadow-sm ${isThisDragging ? "opacity-80 z-10 cursor-grabbing" : "hover:opacity-80 cursor-grab"}`}
                                style={{ left: barLeft, width: barWidth, top: 10, bottom: 10, backgroundColor: barColor }}
                                onMouseDown={(e) => { if (!scrollRef.current) return; barDrag.startDrag("move", c, e, scrollRef.current) }}
                                onMouseEnter={(e) => setBarHoverCard({ project: c, x: e.clientX, y: e.clientY, offDaySet: holidaySet })}
                                onMouseLeave={() => setBarHoverCard(null)}
                              >
                                <div className={`absolute left-[3px] top-1/2 -translate-y-1/2 h-[80%] w-[3px] rounded-[999px] opacity-0 group-hover:opacity-100 transition-opacity cursor-ew-resize ${isDark ? "bg-black/30" : "bg-white/60"}`} onMouseDown={(e) => { if (!scrollRef.current) return; barDrag.startDrag("resize-start", c, e, scrollRef.current) }} />
                                <span className={`px-2 text-xs font-medium truncate leading-none ${isDark ? "text-gray-800" : "text-white"}`}>{c.name}</span>
                                <div className={`absolute right-[3px] top-1/2 -translate-y-1/2 h-[80%] w-[3px] rounded-[999px] opacity-0 group-hover:opacity-100 transition-opacity cursor-ew-resize ${isDark ? "bg-black/30" : "bg-white/60"}`} onMouseDown={(e) => { if (!scrollRef.current) return; barDrag.startDrag("resize-end", c, e, scrollRef.current) }} />
                              </ContextMenuTrigger>
                              <ContextMenuContent>
                                <ContextMenuItem onClick={() => setEditProject(c)}>編集する</ContextMenuItem>
                                <ContextMenuItem variant="destructive" onClick={() => setDeleteConfirmTask(c)}>子タスクを削除</ContextMenuItem>
                              </ContextMenuContent>
                            </ContextMenu>
                          )
                        })}
                      </div>
                    ))
                  )
                ) : projects.length === 0 ? (
                  <div
                    style={{ height: ROW_HEIGHT }}
                    className="flex items-center justify-center text-sm text-muted-foreground"
                  >
                    案件がありません。「案件一覧」から登録してください。
                  </div>
                ) : (
                  projectTabProjects.flatMap((p) => {
                    const isExpanded = expandedProjectIds.has(p.id)
                    const childTasks = p.has_children ? projects.filter((c) => c.parent_id === p.id) : []
                    const packedRows = isExpanded ? packChildTasks(childTasks) : []

                    const parentOverride = barDrag.getBarOverride(p.id)
                    const parentEffStart = parentOverride?.start_date ?? p.start_date
                    const parentEffEnd = parentOverride?.end_date ?? p.end_date
                    let parentBarLeft: number | null = null
                    let parentBarWidth: number | null = null
                    if (parentEffStart && parentEffEnd) {
                      const sd = parseLocalDate(parentEffStart)
                      const ed = parseLocalDate(parentEffEnd)
                      const clampedStart = Math.max(0, dayDiff(start, sd))
                      const clampedEnd = Math.min(totalDays - 1, dayDiff(start, ed))
                      if (clampedStart <= clampedEnd) {
                        parentBarLeft = clampedStart * dayWidth + 3
                        parentBarWidth = (clampedEnd - clampedStart + 1) * dayWidth - 6
                      }
                    }
                    const parentBarColor = isExpanded ? (p.status === "相談中" ? "#d1d5db" : barColorFromParentVolume(p.volume)) : barColorFromProject(p, true)
                    const isParentDragging = barDrag.draggingId === p.id
                    // 親 + 全子タスクの key_dates を親行に常に集約して表示
                    const allKeyDatesForParentDay = Object.entries(
                      [...p.key_dates, ...childTasks.flatMap((c) => c.key_dates)].reduce<Record<string, string[]>>((acc, kd) => {
                        if (!kd.date) return acc
                        ;(acc[kd.date] ??= []).push(kd.label || kd.date)
                        return acc
                      }, {}),
                    )

                    return [
                      // 親案件行
                      <div
                        key={p.id}
                        style={{ height: ROW_HEIGHT, width: totalWidth, position: "relative", backgroundImage: rowBg }}
                        className={`border-b ${!isExpanded ? "border-black" : ""}`}
                      >
                        {showTodayLine && (
                          <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: todayIndex * dayWidth, width: dayWidth, backgroundColor: "rgba(74,222,128,0.3)" }} />
                        )}
                        {Array.from(highlightedDateIndices).map((idx) => (
                          <div key={idx} className="absolute top-0 bottom-0 pointer-events-none" style={{ left: idx * dayWidth, width: dayWidth, backgroundColor: "rgba(234,179,8,0.2)" }} />
                        ))}
                        {parentBarLeft !== null && parentBarWidth !== null && (
                          <ContextMenu>
                            <ContextMenuTrigger
                              className={`group absolute rounded-md transition-opacity flex items-center overflow-hidden shadow-sm ${isParentDragging ? "opacity-80 z-10 cursor-grabbing" : "hover:opacity-80 cursor-grab"}`}
                              style={{ left: parentBarLeft, width: parentBarWidth, top: 10, bottom: 10, backgroundColor: parentBarColor }}
                              onMouseDown={(e) => { if (!scrollRef.current) return; barDrag.startDrag("move", p, e, scrollRef.current) }}
                              onMouseEnter={(e) => setBarHoverCard({ project: p, x: e.clientX, y: e.clientY, offDaySet: holidaySet })}
                              onMouseLeave={() => setBarHoverCard(null)}
                            >
                              <div className="absolute left-[3px] top-1/2 -translate-y-1/2 h-[80%] w-[3px] rounded-[999px] bg-white/60 opacity-0 group-hover:opacity-100 transition-opacity cursor-ew-resize" onMouseDown={(e) => { if (!scrollRef.current) return; barDrag.startDrag("resize-start", p, e, scrollRef.current) }} />
                              <span className="px-2 text-xs text-white font-medium truncate leading-none">{p.name}</span>
                              <div className="absolute right-[3px] top-1/2 -translate-y-1/2 h-[80%] w-[3px] rounded-[999px] bg-white/60 opacity-0 group-hover:opacity-100 transition-opacity cursor-ew-resize" onMouseDown={(e) => { if (!scrollRef.current) return; barDrag.startDrag("resize-end", p, e, scrollRef.current) }} />
                            </ContextMenuTrigger>
                            <ContextMenuContent>
                              <ContextMenuItem onClick={() => setEditProject(p)}>編集する</ContextMenuItem>
                              {p.parent_id === null && <ContextMenuItem onClick={() => {
                                const dates = calcQuickChildDates(p, projects.filter((c) => c.parent_id === p.id))
                                if (!dates) return
                                setExpandedProjectIds((prev) => new Set(prev).add(p.id))
                                startTransition(async () => { await quickAddChildTaskAction(p.id, p.status, dates.startDate, dates.endDate) })
                              }}>子タスクを追加</ContextMenuItem>}
                            </ContextMenuContent>
                          </ContextMenu>
                        )}
                        {allKeyDatesForParentDay.map(([date, labels]) => {
                          const kdIdx = dayDiff(start, parseLocalDate(date))
                          if (kdIdx < 0 || kdIdx >= totalDays) return null
                          return (
                            <Tooltip key={date}>
                              <TooltipTrigger className="absolute rounded-full z-10 cursor-default" style={{ left: kdIdx * dayWidth + dayWidth / 2 - 5, top: ROW_HEIGHT / 2 - 5, width: 10, height: 10, backgroundColor: "#ef4444" }} />
                              <TooltipContent><span className="whitespace-pre-line">{labels.join("\n")}</span></TooltipContent>
                            </Tooltip>
                          )
                        })}
                      </div>,
                      // 子タスクパック行
                      ...packedRows.map((rowChildren, rowIdx) => (
                        <div
                          key={`child-row-${p.id}-${rowIdx}`}
                          style={{ height: ROW_HEIGHT, width: totalWidth, position: "relative", backgroundImage: rowBg }}
                          className={`border-b ${rowIdx === packedRows.length - 1 ? "border-black" : ""} bg-muted/20`}
                        >
                          {showTodayLine && (
                            <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: todayIndex * dayWidth, width: dayWidth, backgroundColor: "rgba(74,222,128,0.3)" }} />
                          )}
                          {Array.from(highlightedDateIndices).map((idx) => (
                            <div key={idx} className="absolute top-0 bottom-0 pointer-events-none" style={{ left: idx * dayWidth, width: dayWidth, backgroundColor: "rgba(234,179,8,0.2)" }} />
                          ))}
                          {rowChildren.map((c) => {
                            const override = barDrag.getBarOverride(c.id)
                            const effStart = override?.start_date ?? c.start_date
                            const effEnd = override?.end_date ?? c.end_date
                            if (!effStart || !effEnd) return null
                            const clampedStart = Math.max(0, dayDiff(start, parseLocalDate(effStart)))
                            const clampedEnd = Math.min(totalDays - 1, dayDiff(start, parseLocalDate(effEnd)))
                            if (clampedStart > clampedEnd) return null
                            const barLeft = clampedStart * dayWidth + 3
                            const barWidth = (clampedEnd - clampedStart + 1) * dayWidth - 6
                            const barColor = barColorFromProject(c, true)
                            const isThisDragging = barDrag.draggingId === c.id
                            const isDark = c.assignee_type === "stakeholder" && c.stakeholder_assignee_ids.length > 0
                            return (
                              <ContextMenu key={c.id}>
                                <ContextMenuTrigger
                                  className={`group absolute rounded-md transition-opacity flex items-center overflow-hidden shadow-sm ${isThisDragging ? "opacity-80 z-10 cursor-grabbing" : "hover:opacity-80 cursor-grab"}`}
                                  style={{ left: barLeft, width: barWidth, top: 10, bottom: 10, backgroundColor: barColor }}
                                  onMouseDown={(e) => { if (!scrollRef.current) return; barDrag.startDrag("move", c, e, scrollRef.current) }}
                                  onMouseEnter={(e) => setBarHoverCard({ project: c, x: e.clientX, y: e.clientY, offDaySet: holidaySet })}
                                  onMouseLeave={() => setBarHoverCard(null)}
                                >
                                  <div className={`absolute left-[3px] top-1/2 -translate-y-1/2 h-[80%] w-[3px] rounded-[999px] opacity-0 group-hover:opacity-100 transition-opacity cursor-ew-resize ${isDark ? "bg-black/30" : "bg-white/60"}`} onMouseDown={(e) => { if (!scrollRef.current) return; barDrag.startDrag("resize-start", c, e, scrollRef.current) }} />
                                  <span className={`px-2 text-xs font-medium truncate leading-none ${isDark ? "text-gray-800" : "text-white"}`}>{c.name}</span>
                                  <div className={`absolute right-[3px] top-1/2 -translate-y-1/2 h-[80%] w-[3px] rounded-[999px] opacity-0 group-hover:opacity-100 transition-opacity cursor-ew-resize ${isDark ? "bg-black/30" : "bg-white/60"}`} onMouseDown={(e) => { if (!scrollRef.current) return; barDrag.startDrag("resize-end", c, e, scrollRef.current) }} />
                                </ContextMenuTrigger>
                                <ContextMenuContent>
                                  <ContextMenuItem onClick={() => setEditProject(c)}>編集する</ContextMenuItem>
                                  <ContextMenuItem variant="destructive" onClick={() => setDeleteConfirmTask(c)}>子タスクを削除</ContextMenuItem>
                                </ContextMenuContent>
                              </ContextMenu>
                            )
                          })}
                        </div>
                      )),
                    ]
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      </>
      )}

      {/* ── 担当タブ ── */}
      {activeTab === "assign" && (() => {
        const filteredProjects = projects
          .filter((p) => !showOrderedOnly || p.status === "受注済")
          .filter((p) => !hideParentBars || !p.has_children)
          .filter((p) => p.parent_id === null || p.assignee_type === "5ive")
        const assigneeUsers = users.filter((u) =>
          filteredProjects.some((p) => p.assignee_ids.includes(u.id))
        )
        const visibleAssigneeUsers = assigneeUsers.filter((u) => !hiddenUserIds.has(u.id))
        // ユーザーごとにレーン割り当てを事前計算
        // 親表示中は親を上段・子を下段に分離。親非表示時はフラットに計算
        const userLaneData = visibleAssigneeUsers.map((u) => {
          const userProjects = filteredProjects.filter((p) => p.assignee_ids.includes(u.id))
          if (hideParentBars) {
            const { assignments, laneCount } = calcLanes(userProjects)
            return { user: u, assignments, laneCount, rowHeight: laneCount * ROW_HEIGHT, parentLaneCount: 0 }
          }
          const parentProjects = userProjects.filter((p) => p.parent_id === null)
          const childProjects = userProjects.filter((p) => p.parent_id !== null)
          const { assignments: parentAssignments, laneCount: parentLaneCount } = calcLanes(parentProjects)
          const { assignments: childAssignmentsRaw, laneCount: childLaneCount } = calcLanes(childProjects)
          const childAssignments = childAssignmentsRaw.map((a) => ({ ...a, lane: a.lane + parentLaneCount }))
          const assignments = [...parentAssignments, ...childAssignments]
          const laneCount = parentLaneCount + (childProjects.length > 0 ? childLaneCount : 0)
          return { user: u, assignments, laneCount, rowHeight: laneCount * ROW_HEIGHT, parentLaneCount }
        })

        return (
          <>
            {/* ツールバー（絞り込み・設定） */}
            <div className="flex justify-end gap-2 mb-2">
              {/* 月/日 切り替えボタングループ */}
              <div className="inline-flex items-center gap-2 mr-auto">
                <div className="inline-flex">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleViewMode("month")}
                    className={[
                      "rounded-r-none border-r-0",
                      viewMode === "month" ? "bg-muted text-foreground" : "",
                    ].join(" ")}
                  >
                    月
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleViewMode("day")}
                    className={[
                      "rounded-l-none",
                      viewMode === "day" ? "bg-muted text-foreground" : "",
                    ].join(" ")}
                  >
                    日
                  </Button>
                </div>
                <Button variant="outline" size="sm" onClick={handleScrollToToday}>
                  今日
                </Button>
              </div>
              {/* 受注済のみ（担当タブ） */}
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showOrderedOnly}
                  onChange={(e) => setShowOrderedOnly(e.target.checked)}
                  className="size-4 rounded border-input accent-primary"
                />
                受注済のみ
              </label>
              {/* 親を非表示（担当タブ） */}
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hideParentBars}
                  onChange={(e) => setHideParentBars(e.target.checked)}
                  className="size-4 rounded border-input accent-primary"
                />
                親を非表示
              </label>
              {/* 空きハイライト（担当タブ） */}
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showAvailabilityHighlight}
                  onChange={(e) => setShowAvailabilityHighlight(e.target.checked)}
                  className="size-4 rounded border-input accent-primary"
                />
                空きハイライト
              </label>
              {/* 絞り込みボタン（担当タブ） */}
              <div ref={assignFilterRef} className="relative">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAssignFilterOpen((prev) => !prev)}
                  className={hiddenUserIds.size > 0 ? "border-primary text-primary" : ""}
                >
                  <ListFilterIcon className="size-4" />
                  絞り込み
                </Button>
                {assignFilterOpen && (
                  <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-md border bg-background shadow-md py-1">
                    <div className="flex items-center justify-between px-3 py-1.5 border-b">
                      <span className="text-xs font-semibold text-muted-foreground">表示する担当者</span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline"
                          onClick={() => setHiddenUserIds(new Set())}
                        >
                          すべて表示
                        </button>
                        <button
                          type="button"
                          className="text-xs text-muted-foreground hover:underline"
                          onClick={() => setHiddenUserIds(new Set(assigneeUsers.map((u) => u.id)))}
                        >
                          すべて非表示
                        </button>
                      </div>
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                      {assigneeUsers.map((u) => (
                        <label
                          key={u.id}
                          className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={!hiddenUserIds.has(u.id)}
                            onChange={(e) => {
                              setHiddenUserIds((prev) => {
                                const next = new Set(prev)
                                if (e.target.checked) next.delete(u.id)
                                else next.add(u.id)
                                return next
                              })
                            }}
                            className="size-4 rounded border-input accent-primary shrink-0"
                          />
                          <span className="truncate">{u.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
                <Settings2Icon className="size-4" />
                設定
              </Button>
            </div>

            {viewMode === "month" ? (
              /* ── 月ビュー（担当タブ） ── */
              <div className="rounded-lg border [overflow:clip] bg-background">
                {/* ── Sticky ヘッダー ── */}
                <div className="sticky top-0 z-20 flex bg-background">
                  <div
                    style={{ width: LEFT_COL_WIDTH, minWidth: LEFT_COL_WIDTH }}
                    className="shrink-0 border-r bg-background"
                  >
                    <div
                      style={{ height: MONTH_HEADER_HEIGHT + DAY_HEADER_HEIGHT }}
                      className="border-b bg-muted/40 flex items-end px-3 pb-2 text-xs font-semibold text-muted-foreground"
                    >
                      担当者
                    </div>
                  </div>
                  {/* 右ヘッダー（横スクロールなし・ボディとJS同期） */}
                  <div ref={monthViewHeaderScrollRef} className="overflow-x-hidden flex-1">
                    <div style={{ width: totalMonthWidth, minWidth: totalMonthWidth }}>
                      <div className="flex border-b" style={{ height: MONTH_HEADER_HEIGHT + DAY_HEADER_HEIGHT }}>
                        {monthViewMonths.map((m) => (
                          <div
                            key={m.label}
                            style={{ width: monthColWidth, minWidth: monthColWidth }}
                            className="border-r last:border-r-0 flex items-center justify-center px-2 text-xs font-semibold bg-muted/40 text-foreground"
                          >
                            {m.label}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── ボディ ── */}
                <div className="flex">
                  <div
                    style={{ width: LEFT_COL_WIDTH, minWidth: LEFT_COL_WIDTH }}
                    className="shrink-0 border-r bg-background z-10"
                  >
                    {userLaneData.length === 0 ? (
                      <div style={{ height: ROW_HEIGHT }} className="flex items-center px-3 text-sm text-muted-foreground">
                        担当者なし
                      </div>
                    ) : (
                      userLaneData.map(({ user: u, rowHeight }) => (
                        <div
                          key={u.id}
                          style={{ height: rowHeight }}
                          className="w-full border-b border-black last:border-b-0 flex items-center px-3 gap-1"
                        >
                          <span className="text-sm font-medium truncate flex-1">{u.name}</span>
                          <button
                            type="button"
                            className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                            onClick={() => openUserSettings(u.id)}
                          >
                            <Settings2Icon className="size-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                  <div
                    ref={monthViewScrollRef}
                    className="overflow-x-auto flex-1"
                    onScroll={(e) => {
                      if (monthViewHeaderScrollRef.current) {
                        monthViewHeaderScrollRef.current.scrollLeft = e.currentTarget.scrollLeft
                      }
                    }}
                  >
                    <div style={{ width: totalMonthWidth, minWidth: totalMonthWidth }}>
                      {userLaneData.length === 0 ? (
                        <div style={{ height: ROW_HEIGHT }} className="flex items-center justify-center text-sm text-muted-foreground">
                          担当者が割り当てられた案件がありません。
                        </div>
                      ) : (
                        userLaneData.map(({ user: u, assignments, rowHeight, laneCount, parentLaneCount }) => (
                          <div
                            key={u.id}
                            style={{ height: rowHeight, width: totalMonthWidth, position: "relative" }}
                            className="flex border-b border-black last:border-b-0"
                          >
                            {monthViewMonths.map((m) => (
                              <div key={m.label} style={{ width: monthColWidth, minWidth: monthColWidth, flexShrink: 0 }} className="border-r last:border-r-0 h-full" />
                            ))}
                            {/* 親/子セクション区切り線 */}
                            {parentLaneCount > 0 && parentLaneCount < laneCount && (
                              <div
                                className="absolute left-0 right-0 pointer-events-none z-10"
                                style={{ top: parentLaneCount * ROW_HEIGHT - 1, height: 1, backgroundColor: "#6b7280", opacity: 0.4 }}
                              />
                            )}
                            {assignments.map(({ project: p, lane }) => {
                              const override = monthBarDrag.getBarOverride(p.id)
                              const barInfo = calcMonthViewBar(override ?? p, monthViewMonths)
                              if (!barInfo) return null
                              const isThisDragging = monthBarDrag.draggingId === p.id
                              const barTop = lane * ROW_HEIGHT + 10
                              const barHeight = ROW_HEIGHT - 20
                              const keyDateEntries = Object.entries(
                                p.key_dates.reduce<Record<string, string[]>>((acc, kd) => {
                                  if (!kd.date) return acc
                                  ;(acc[kd.date] ??= []).push(kd.label || kd.date)
                                  return acc
                                }, {}),
                              )
                              return (
                                <div key={p.id}>
                                  <ContextMenu>
                                    <ContextMenuTrigger
                                      className={`group absolute rounded-md transition-opacity flex items-center overflow-hidden shadow-sm ${isThisDragging ? "opacity-80 z-10 cursor-grabbing" : "hover:opacity-80 cursor-grab"}`}
                                      style={{
                                        left: `${barInfo.leftPct}%`,
                                        width: `${barInfo.widthPct}%`,
                                        top: barTop,
                                        height: barHeight,
                                        backgroundColor: barColorFromProject(p),
                                      }}
                                      onMouseDown={(e) => { if (!monthViewScrollRef.current) return; monthBarDrag.startDrag("move", p, e, monthViewScrollRef.current) }}
                                      onMouseEnter={(e) => setBarHoverCard({ project: p, x: e.clientX, y: e.clientY, offDaySet: new Set([...holidaySet, ...(userPaidLeaveMap[u.id] ?? [])]) })}
                                      onMouseLeave={() => setBarHoverCard(null)}
                                    >
                                      <div className="absolute left-[3px] top-1/2 -translate-y-1/2 h-[80%] w-[3px] rounded-[999px] bg-white/60 opacity-0 group-hover:opacity-100 transition-opacity cursor-ew-resize" onMouseDown={(e) => { if (!monthViewScrollRef.current) return; monthBarDrag.startDrag("resize-start", p, e, monthViewScrollRef.current) }} />
                                      <span className="px-2 text-xs text-white font-medium truncate leading-none">
                                        {p.parent_id !== null && projects.find((pp) => pp.id === p.parent_id) && `${projects.find((pp) => pp.id === p.parent_id)!.name} -> `}{p.name}
                                      </span>
                                      <div className="absolute right-[3px] top-1/2 -translate-y-1/2 h-[80%] w-[3px] rounded-[999px] bg-white/60 opacity-0 group-hover:opacity-100 transition-opacity cursor-ew-resize" onMouseDown={(e) => { if (!monthViewScrollRef.current) return; monthBarDrag.startDrag("resize-end", p, e, monthViewScrollRef.current) }} />
                                    </ContextMenuTrigger>
                                    <ContextMenuContent>
                                      <ContextMenuItem onClick={() => setEditProject(p)}>編集する</ContextMenuItem>
                                      {p.parent_id === null && <ContextMenuItem onClick={() => {
                                        const dates = calcQuickChildDates(p, projects.filter((c) => c.parent_id === p.id))
                                        if (!dates) return
                                        startTransition(async () => { await quickAddChildTaskAction(p.id, p.status, dates.startDate, dates.endDate, [u.id]) })
                                      }}>子タスクを追加</ContextMenuItem>}
                                      {p.parent_id !== null && <ContextMenuItem variant="destructive" onClick={() => setDeleteConfirmTask(p)}>子タスクを削除</ContextMenuItem>}
                                    </ContextMenuContent>
                                  </ContextMenu>
                                  {keyDateEntries.map(([date, labels]) => {
                                    const centerPct = keyDateToCenterPct(parseLocalDate(date), monthViewMonths)
                                    if (centerPct === null) return null
                                    return (
                                      <Tooltip key={date}>
                                        <TooltipTrigger
                                          className="absolute rounded-full z-10 cursor-default"
                                          style={{
                                            left: `calc(${centerPct}% - 5px)`,
                                            top: lane * ROW_HEIGHT + ROW_HEIGHT / 2 - 5,
                                            width: 10,
                                            height: 10,
                                            backgroundColor: "#ef4444",
                                          }}
                                        />
                                        <TooltipContent>
                                          <span className="whitespace-pre-line">{labels.join("\n")}</span>
                                        </TooltipContent>
                                      </Tooltip>
                                    )
                                  })}
                                </div>
                              )
                            })}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* ── 日ビュー（担当タブ） ── */
              <div className="rounded-lg border [overflow:clip] bg-background">
                {/* ── Sticky ヘッダー（月・日行） ── */}
                <div className="sticky top-0 z-20 flex bg-background">
                  {/* 左ヘッダー */}
                  <div
                    style={{ width: LEFT_COL_WIDTH, minWidth: LEFT_COL_WIDTH }}
                    className="shrink-0 border-r bg-background"
                  >
                    <div style={{ height: MONTH_HEADER_HEIGHT }} className="border-b bg-muted/40" />
                    <div
                      style={{ height: DAY_HEADER_HEIGHT }}
                      className="border-b bg-muted/40 flex items-center px-3 text-xs font-semibold text-muted-foreground"
                    >
                      担当者
                    </div>
                  </div>
                  {/* 右ヘッダー（横スクロールなし・ボディとJS同期） */}
                  <div ref={assignHeaderScrollRef} className="overflow-x-hidden flex-1">
                    <div style={{ width: totalWidth, minWidth: totalWidth }}>
                      {/* 月ヘッダー */}
                      <div className="flex" style={{ height: MONTH_HEADER_HEIGHT }}>
                        {monthGroups.map((mg, i) => (
                          <div
                            key={i}
                            style={{ width: mg.days * dayWidth, minWidth: mg.days * dayWidth }}
                            className="border-b border-r last:border-r-0 flex items-center px-2 text-xs font-semibold bg-muted/40 text-foreground"
                          >
                            {mg.label}
                          </div>
                        ))}
                      </div>
                      {/* 日ヘッダー */}
                      <div
                        className="flex border-b select-none cursor-ew-resize"
                        style={{ height: DAY_HEADER_HEIGHT }}
                        onMouseDown={handleDayHeaderMouseDown}
                      >
                        {dates.map((d, i) => {
                          const isToday = i === todayIndex
                          const isHighlighted = highlightedDateIndices.has(i)
                          return (
                            <div
                              key={i}
                              style={{ width: dayWidth, minWidth: dayWidth }}
                              className={[
                                "border-r last:border-r-0 flex flex-col items-center justify-center text-[10px] font-medium leading-tight overflow-hidden",
                                isToday
                                  ? "bg-green-500 text-white"
                                  : isHighlighted
                                  ? "bg-yellow-300 text-foreground"
                                  : isRestDay(d)
                                  ? "bg-gray-300 text-muted-foreground"
                                  : "text-muted-foreground",
                              ].join(" ")}
                            >
                              <span>{d.getDate()}</span>
                              {dayWidth >= 24 && (
                                <span>{["(日)", "(月)", "(火)", "(水)", "(木)", "(金)", "(土)"][d.getDay()]}</span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── ボディ ── */}
                <div className="flex">
                  {/* 左固定列 */}
                  <div
                    style={{ width: LEFT_COL_WIDTH, minWidth: LEFT_COL_WIDTH }}
                    className="shrink-0 border-r bg-background z-10"
                  >
                    {userLaneData.length === 0 ? (
                      <div style={{ height: ROW_HEIGHT }} className="flex items-center px-3 text-sm text-muted-foreground">
                        担当者なし
                      </div>
                    ) : (
                      userLaneData.map(({ user: u, rowHeight }) => (
                        <div
                          key={u.id}
                          style={{ height: rowHeight }}
                          className="w-full border-b border-black last:border-b-0 flex items-center px-3 gap-1"
                        >
                          <span className="text-sm font-medium truncate flex-1">{u.name}</span>
                          <button
                            type="button"
                            className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                            onClick={() => openUserSettings(u.id)}
                          >
                            <Settings2Icon className="size-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  {/* 右スクロール領域 */}
                  <div
                    ref={assignScrollRef}
                    className="overflow-x-auto flex-1"
                    onScroll={(e) => {
                      if (assignHeaderScrollRef.current) {
                        assignHeaderScrollRef.current.scrollLeft = e.currentTarget.scrollLeft
                      }
                    }}
                  >
                    <div style={{ width: totalWidth, minWidth: totalWidth }}>

                      {/* 担当者行 */}
                      {userLaneData.length === 0 ? (
                        <div
                          style={{ height: ROW_HEIGHT }}
                          className="flex items-center justify-center text-sm text-muted-foreground"
                        >
                          担当者が割り当てられた案件がありません。
                        </div>
                      ) : (
                        userLaneData.map(({ user: u, assignments, rowHeight, laneCount, parentLaneCount }) => {
                          const userPaidLeaveSet = new Set(userPaidLeaveMap[u.id] ?? [])
                          const userIsRest = (d: Date) => isRestDay(d) || userPaidLeaveSet.has(toYMD(d))
                          const userHolidaySet = userPaidLeaveSet.size > 0
                            ? new Set([...holidaySet, ...userPaidLeaveSet])
                            : holidaySet
                          const userRowBg = userPaidLeaveSet.size > 0
                            ? buildRowBg(dates, dayWidth, userIsRest)
                            : rowBg
                          const coveredRanges = showAvailabilityHighlight
                            ? computeEmptyRanges(assignments, start, totalDays, todayIndex, dates, userHolidaySet)
                            : []
                          return (
                          <div
                            key={u.id}
                            style={{ height: rowHeight, width: totalWidth, position: "relative", backgroundImage: userRowBg }}
                            className="border-b border-black last:border-b-0"
                          >
                            {/* 親/子セクション区切り線 */}
                            {parentLaneCount > 0 && parentLaneCount < laneCount && (
                              <div
                                className="absolute left-0 right-0 pointer-events-none z-10"
                                style={{ top: parentLaneCount * ROW_HEIGHT - 1, height: 1, backgroundColor: "#6b7280", opacity: 0.4 }}
                              />
                            )}
                            {/* 空きハイライト（オレンジ） */}
                            {coveredRanges.map(({ fromIdx, toIdx }) => (
                              <div
                                key={fromIdx}
                                className="absolute top-0 bottom-0 pointer-events-none"
                                style={{
                                  left: fromIdx * dayWidth,
                                  width: (toIdx - fromIdx + 1) * dayWidth,
                                  backgroundColor: "rgba(251,146,60,0.35)",
                                }}
                              />
                            ))}
                            {/* 今日のカラムハイライト */}
                            {showTodayLine && (
                              <div
                                className="absolute top-0 bottom-0 pointer-events-none"
                                style={{
                                  left: todayIndex * dayWidth,
                                  width: dayWidth,
                                  backgroundColor: "rgba(74,222,128,0.3)",
                                }}
                              />
                            )}
                            {/* クリックハイライト列 */}
                            {Array.from(highlightedDateIndices).map((idx) => (
                              <div
                                key={idx}
                                className="absolute top-0 bottom-0 pointer-events-none"
                                style={{
                                  left: idx * dayWidth,
                                  width: dayWidth,
                                  backgroundColor: "rgba(234,179,8,0.2)",
                                }}
                              />
                            ))}
                            {/* 案件バー（レーンごとに縦位置を計算） */}
                            {assignments.map(({ project: p, lane }) => {
                              const override = barDrag.getBarOverride(p.id)
                              const effStart = override?.start_date ?? p.start_date!
                              const effEnd = override?.end_date ?? p.end_date!
                              const sd = parseLocalDate(effStart)
                              const ed = parseLocalDate(effEnd)
                              const startIdx = dayDiff(start, sd)
                              const endIdx = dayDiff(start, ed)
                              const clampedStart = Math.max(0, startIdx)
                              const clampedEnd = Math.min(totalDays - 1, endIdx)
                              if (clampedStart > clampedEnd) return null
                              const barLeft = clampedStart * dayWidth + 3
                              const barWidth = (clampedEnd - clampedStart + 1) * dayWidth - 6
                              const barTop = lane * ROW_HEIGHT + 10
                              const barHeight = ROW_HEIGHT - 20
                              const isThisDragging = barDrag.draggingId === p.id
                              return (
                                <div key={p.id}>
                                  <ContextMenu>
                                    <ContextMenuTrigger
                                      className={`group absolute rounded-md transition-opacity flex items-center overflow-hidden shadow-sm ${isThisDragging ? "opacity-80 z-10 cursor-grabbing" : "hover:opacity-80 cursor-grab"}`}
                                      style={{
                                        left: barLeft,
                                        width: barWidth,
                                        top: barTop,
                                        height: barHeight,
                                        backgroundColor: barColorFromProject(p),
                                      }}
                                      onMouseDown={(e) => {
                                        if (!assignScrollRef.current) return
                                        barDrag.startDrag("move", p, e, assignScrollRef.current)
                                      }}
                                      onMouseEnter={(e) => setBarHoverCard({ project: p, x: e.clientX, y: e.clientY, offDaySet: new Set([...holidaySet, ...(userPaidLeaveMap[u.id] ?? [])]) })}
                                      onMouseLeave={() => setBarHoverCard(null)}
                                    >
                                      <div
                                        className="absolute left-[3px] top-1/2 -translate-y-1/2 h-[80%] w-[3px] rounded-[999px] bg-white/60 opacity-0 group-hover:opacity-100 transition-opacity cursor-ew-resize"
                                        onMouseDown={(e) => {
                                          if (!assignScrollRef.current) return
                                          barDrag.startDrag("resize-start", p, e, assignScrollRef.current)
                                        }}
                                      />
                                      <span className="px-2 text-xs text-white font-medium truncate leading-none">
                                        {p.parent_id !== null && projects.find((pp) => pp.id === p.parent_id) && `${projects.find((pp) => pp.id === p.parent_id)!.name} -> `}{p.name}
                                      </span>
                                      <div
                                        className="absolute right-[3px] top-1/2 -translate-y-1/2 h-[80%] w-[3px] rounded-[999px] bg-white/60 opacity-0 group-hover:opacity-100 transition-opacity cursor-ew-resize"
                                        onMouseDown={(e) => {
                                          if (!assignScrollRef.current) return
                                          barDrag.startDrag("resize-end", p, e, assignScrollRef.current)
                                        }}
                                      />
                                    </ContextMenuTrigger>
                                    <ContextMenuContent>
                                      <ContextMenuItem onClick={() => setEditProject(p)}>編集する</ContextMenuItem>
                                      {p.parent_id === null && <ContextMenuItem onClick={() => {
                                        const dates = calcQuickChildDates(p, projects.filter((c) => c.parent_id === p.id))
                                        if (!dates) return
                                        startTransition(async () => { await quickAddChildTaskAction(p.id, p.status, dates.startDate, dates.endDate, [u.id]) })
                                      }}>子タスクを追加</ContextMenuItem>}
                                      {p.parent_id !== null && <ContextMenuItem variant="destructive" onClick={() => setDeleteConfirmTask(p)}>子タスクを削除</ContextMenuItem>}
                                    </ContextMenuContent>
                                  </ContextMenu>
                                  {/* 日付メモの赤丸 */}
                                  {Object.entries(
                                    p.key_dates.reduce<Record<string, string[]>>((acc, kd) => {
                                      if (!kd.date) return acc
                                      ;(acc[kd.date] ??= []).push(kd.label || kd.date)
                                      return acc
                                    }, {}),
                                  ).map(([date, labels]) => {
                                    const kdIdx = dayDiff(start, parseLocalDate(date))
                                    if (kdIdx < 0 || kdIdx >= totalDays) return null
                                    return (
                                      <Tooltip key={date}>
                                        <TooltipTrigger
                                          className="absolute rounded-full z-10 cursor-default"
                                          style={{
                                            left: kdIdx * dayWidth + dayWidth / 2 - 5,
                                            top: lane * ROW_HEIGHT + ROW_HEIGHT / 2 - 5,
                                            width: 10,
                                            height: 10,
                                            backgroundColor: "#ef4444",
                                          }}
                                        />
                                        <TooltipContent>
                                          <span className="whitespace-pre-line">{labels.join("\n")}</span>
                                        </TooltipContent>
                                      </Tooltip>
                                    )
                                  })}
                                </div>
                              )
                            })}
                          </div>
                        )})
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )
      })()}

      {/* 編集モーダル */}
      {editProject !== null && editProject.parent_id !== null ? (
        <ChildTaskModal
          parentProject={projects.find((p) => p.id === editProject.parent_id)!}
          childTask={editProject}
          users={users}
          open={true}
          onOpenChange={(open) => !open && setEditProject(null)}
        />
      ) : (
        <ProjectEditModal
          project={editProject}
          users={users}
          allProjects={projects}
          open={editProject !== null}
          onOpenChange={(open) => !open && setEditProject(null)}
        />
      )}

      {/* 子タスク削除確認モーダル */}
      {deleteConfirmTask !== null && (
        <Dialog open={true} onOpenChange={(open) => { if (!open) setDeleteConfirmTask(null) }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>子タスクを削除</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">「{deleteConfirmTask.name}」を削除しますか？この操作は元に戻せません。</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteConfirmTask(null)}>キャンセル</Button>
              <Button variant="destructive" onClick={() => {
                const id = deleteConfirmTask.id
                setDeleteConfirmTask(null)
                startTransition(async () => { await deleteProjectsAction([id]) })
              }}>削除する</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── 設定モーダル ── */}
      <Dialog open={settingsOpen} onOpenChange={(open) => { if (!open) setSettingsOpen(false) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>設定</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* 休日セクション */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">休日</h3>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">カスタム休日</Label>
                <div className="space-y-2">
                  {customDates
                    .map((date, i) => ({ date, i }))
                    .filter(({ date }) => date >= toYMD(new Date()))
                    .map(({ date, i }) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input
                          type="date"
                          value={date}
                          onChange={(e) => updateCustomDate(i, e.target.value)}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeCustomDate(i)}
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2Icon className="size-4" />
                        </Button>
                      </div>
                    ))}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addCustomDate}>
                  <PlusIcon className="size-4" />
                  日付を追加
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={handleSettingsSave} disabled={isPending}>
              保存する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── ユーザー個人設定モーダル ── */}
      <Dialog open={userSettingsUserId !== null} onOpenChange={(open) => { if (!open) setUserSettingsUserId(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {users.find((u) => u.id === userSettingsUserId)?.name ?? ""}の個人設定
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">休み設定</h3>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">設定した日は担当別で休日扱いになります</Label>
                <div className="space-y-2">
                  {userSettingsDates
                    .map((date, i) => ({ date, i }))
                    .filter(({ date }) => date >= toYMD(new Date()))
                    .map(({ date, i }) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input
                          type="date"
                          value={date}
                          onChange={(e) => updateUserSettingsDate(i, e.target.value)}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeUserSettingsDate(i)}
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2Icon className="size-4" />
                        </Button>
                      </div>
                    ))}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addUserSettingsDate}>
                  <PlusIcon className="size-4" />
                  日付を追加
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleUserSettingsSave} disabled={isPending}>
              保存する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 案件追加モーダル ── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-300 max-h-[95dvh] overflow-auto">
          <DialogHeader>
            <DialogTitle>案件を追加</DialogTitle>
          </DialogHeader>
          <form key={String(addOpen)} action={handleAdd} className="space-y-4">
            <ProjectFormFields users={users} />
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                追加する
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {mounted && createPortal(
        <>
          {/* ── FAB：案件を追加 ── */}
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="fixed z-50 flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg border border-primary hover:bg-white hover:text-primary transition-colors transition-background-color cursor-pointer"
            style={{ width: 60, height: 60, right: 12, bottom: 12 }}
            aria-label="案件を追加"
          >
            <PlusIcon className="size-7" />
          </button>
          {barHoverCard && !barDrag.isDragging && !monthBarDrag.isDragging && (
            <div
              className="fixed z-50 pointer-events-none w-64 rounded-lg bg-popover p-2.5 text-popover-foreground shadow-md ring-1 ring-foreground/10"
              style={{
                left: Math.min(barHoverCard.x + 12, (typeof window !== "undefined" ? window.innerWidth : 1920) - 256 - 12),
                top: barHoverCard.y + 16,
              }}
            >
              <BarHoverCardContent project={barHoverCard.project} offDaySet={barHoverCard.offDaySet} />
            </div>
          )}
          {barDrag.isDragging && barDrag.mousePos && barDrag.dragType && (
            <DragDateTooltip
              mouseX={barDrag.mousePos.x}
              mouseY={barDrag.mousePos.y}
              dragType={barDrag.dragType}
              currentStart={barDrag.dragCurrentStart}
              currentEnd={barDrag.dragCurrentEnd}
            />
          )}
          {monthBarDrag.isDragging && monthBarDrag.mousePos && monthBarDrag.dragType && (
            <DragDateTooltip
              mouseX={monthBarDrag.mousePos.x}
              mouseY={monthBarDrag.mousePos.y}
              dragType={monthBarDrag.dragType}
              currentStart={monthBarDrag.dragCurrentStart}
              currentEnd={monthBarDrag.dragCurrentEnd}
            />
          )}
        </>,
        document.body
      )}
    </TooltipProvider>
  )
}

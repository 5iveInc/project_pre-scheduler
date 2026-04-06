"use client"

import { useState, useTransition, useEffect, useRef, useMemo } from "react"
import type { Project, User } from "@/database/db"
import { addProjectTimelineAction, saveCustomHolidaysAction } from "@/app/timeline/actions"
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
import { Settings2Icon, PlusIcon, Trash2Icon, ArrowUpDownIcon, ArrowUpIcon, ArrowDownIcon, CheckIcon, ListFilterIcon } from "lucide-react"
import { ProjectEditModal, ProjectFormFields } from "@/components/modal/project-edit-modal"

type SortKey = "id" | "volume" | "start_date" | "end_date"

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "id", label: "登録順" },
  { key: "volume", label: "レベル（ボリューム）" },
  { key: "start_date", label: "開始日" },
  { key: "end_date", label: "終了日" },
]

// ── 定数 ───────────────────────────────────────────────────
const DEFAULT_DAY_WIDTH = 32
const MIN_DAY_WIDTH = 17
const MAX_DAY_WIDTH = 55
const ROW_HEIGHT = 48
const MONTH_HEADER_HEIGHT = 30
const DAY_HEADER_HEIGHT = 44
const LEFT_COL_WIDTH = 200

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

function barColorFromProject(p: Project): string {
  if (p.status === "相談中") return "#d1d5db" // gray-300
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

// ── タイムラインビュー ──────────────────────────────────────

export function TimelineView({
  projects,
  users,
  holidays,
  customHolidays,
}: {
  projects: Project[]
  users: User[]
  holidays: string[]
  customHolidays: string[]
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

  // ── 表示モード（月 / 日）──
  const [viewMode, setViewMode] = useState<"month" | "day">("day")

  function handleViewMode(mode: "month" | "day") {
    setViewMode(mode)
  }

  // ── 月ビュー：列幅（1画面に6ヶ月）──
  const monthViewScrollRef = useRef<HTMLDivElement>(null)
  const [monthColWidth, setMonthColWidth] = useState(160)
  const monthViewScrollInitialized = useRef(false)

  // ── 日幅（ドラッグで可変）──
  const [dayWidth, setDayWidth] = useState(DEFAULT_DAY_WIDTH)
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)

  const totalWidth = totalDays * dayWidth

  useEffect(() => {
    if (scrollRef.current && todayIndex > 0) {
      scrollRef.current.scrollLeft = todayIndex * dayWidth
    }
    if (assignScrollRef.current && todayIndex > 0) {
      assignScrollRef.current.scrollLeft = todayIndex * dayWidth
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
    }
    if (activeTab === "assign" && assignScrollRef.current) {
      assignScrollRef.current.scrollLeft = todayIndex * dayWidth
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
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [viewMode, activeTab])

  const [editProject, setEditProject] = useState<Project | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [customDates, setCustomDates] = useState<string[]>(customHolidays)
  const [isPending, startTransition] = useTransition()

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

  function toYMD(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  }

  function isRestDay(d: Date): boolean {
    return d.getDay() === 0 || d.getDay() === 6 || holidaySet.has(toYMD(d))
  }

  // 縦グリッド線 + 休日列（土日・祝日）の背景を background-image で合成
  const gridLine = `repeating-linear-gradient(to right, transparent, transparent ${dayWidth - 1}px, #e5e7eb ${dayWidth - 1}px, #e5e7eb ${dayWidth}px)`
  const restBands = dates
    .map((d, i) => {
      if (!isRestDay(d)) return null
      const l = i * dayWidth
      const r = l + dayWidth
      return `linear-gradient(to right, transparent ${l}px, #d1d5db ${l}px, #d1d5db ${r}px, transparent ${r}px)`
    })
    .filter(Boolean)
    .join(", ")
  const rowBg = restBands ? `${gridLine}, ${restBands}` : gridLine
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

  const TABS = [
    { id: "project", label: "案件" },
    { id: "assign", label: "担当" },
  ]

  return (
    <>
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
        <div className="inline-flex mr-auto">
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
            {sortKey ? SORT_OPTIONS.find((o) => o.key === sortKey)?.label : "並び替え"}
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
        <div className="rounded-lg border overflow-hidden bg-background">
          <div className="flex">
            <div
              style={{ width: LEFT_COL_WIDTH, minWidth: LEFT_COL_WIDTH }}
              className="shrink-0 border-r bg-background z-10"
            >
              <div
                style={{ height: MONTH_HEADER_HEIGHT + DAY_HEADER_HEIGHT }}
                className="border-b bg-muted/40 flex items-end px-3 pb-2 text-xs font-semibold text-muted-foreground"
              >
                案件名
              </div>
              {visibleProjects.length === 0 ? (
                <div style={{ height: ROW_HEIGHT }} className="flex items-center px-3 text-sm text-muted-foreground">
                  案件なし
                </div>
              ) : (
                visibleProjects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    style={{ height: ROW_HEIGHT }}
                    className="w-full border-b last:border-b-0 flex items-center gap-2 px-3 text-left hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => setEditProject(p)}
                    title={`${p.name}（クリックで編集）`}
                  >
                    {p.volume !== null && (
                      <span className="shrink-0 text-[10px] font-semibold text-muted-foreground bg-muted rounded px-1 py-0.5 leading-none">
                        Lv.{p.volume}
                      </span>
                    )}
                    <span className="text-sm font-medium truncate">{p.name}</span>
                  </button>
                ))
              )}
            </div>
            <div ref={monthViewScrollRef} className="overflow-x-auto flex-1">
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
                {visibleProjects.length === 0 ? (
                  <div style={{ height: ROW_HEIGHT }} className="flex items-center justify-center text-sm text-muted-foreground">
                    案件がありません。「案件一覧」から登録してください。
                  </div>
                ) : (
                  visibleProjects.map((p) => {
                    const barInfo = calcMonthViewBar(p, monthViewMonths)
                    const barColor = barColorFromProject(p)
                    const keyDateEntries = Object.entries(
                      p.key_dates.reduce<Record<string, string[]>>((acc, kd) => {
                        if (!kd.date) return acc
                        ;(acc[kd.date] ??= []).push(kd.label || kd.date)
                        return acc
                      }, {}),
                    )
                    return (
                      <div
                        key={p.id}
                        style={{ height: ROW_HEIGHT, width: totalMonthWidth, position: "relative" }}
                        className="flex border-b last:border-b-0"
                      >
                        {monthViewMonths.map((m) => (
                          <div key={m.label} style={{ width: monthColWidth, minWidth: monthColWidth, flexShrink: 0 }} className="border-r last:border-r-0 h-full" />
                        ))}
                        {barInfo && (
                          <div
                            className="absolute rounded-md cursor-pointer hover:opacity-80 transition-opacity flex items-center overflow-hidden shadow-sm"
                            style={{
                              left: `${barInfo.leftPct}%`,
                              width: `${barInfo.widthPct}%`,
                              top: 10,
                              bottom: 10,
                              backgroundColor: barColor,
                            }}
                            onClick={() => setEditProject(p)}
                            title={`${p.name}（クリックで編集）`}
                          >
                            <span className="px-2 text-xs text-white font-medium truncate leading-none">
                              {p.name}
                            </span>
                          </div>
                        )}
                        {keyDateEntries.map(([date, labels]) => {
                          const centerPct = keyDateToCenterPct(parseLocalDate(date), monthViewMonths)
                          if (centerPct === null) return null
                          return (
                            <TooltipProvider key={date}>
                              <Tooltip>
                                <TooltipTrigger
                                  className="absolute rounded-full z-10 cursor-default"
                                  style={{
                                    left: `calc(${centerPct}% - 5px)`,
                                    top: ROW_HEIGHT / 2 - 5,
                                    width: 10,
                                    height: 10,
                                    backgroundColor: "#ef4444",
                                  }}
                                />
                                <TooltipContent>
                                  <span className="whitespace-pre-line">{labels.join("\n")}</span>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )
                        })}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ── 日ビュー（案件タブ） ── */
        <div className="rounded-lg border overflow-hidden bg-background">
          <div className="flex">
            {/* ── 左固定列 ── */}
            <div
              style={{ width: LEFT_COL_WIDTH, minWidth: LEFT_COL_WIDTH }}
              className="shrink-0 border-r bg-background z-10"
            >
              {/* 月ヘッダー行の高さ合わせ */}
              <div
                style={{ height: MONTH_HEADER_HEIGHT }}
                className="border-b bg-muted/40"
              />
              {/* 日ヘッダー行の高さ合わせ */}
              <div
                style={{ height: DAY_HEADER_HEIGHT }}
                className="border-b bg-muted/40 flex items-center px-3 text-xs font-semibold text-muted-foreground"
              >
                案件名
              </div>
              {/* 案件行 */}
              {projects.length === 0 ? (
                <div
                  style={{ height: ROW_HEIGHT }}
                  className="flex items-center px-3 text-sm text-muted-foreground"
                >
                  案件なし
                </div>
              ) : (
                visibleProjects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    style={{ height: ROW_HEIGHT }}
                    className="w-full border-b last:border-b-0 flex items-center gap-2 px-3 text-left hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => setEditProject(p)}
                    title={`${p.name}（クリックで編集）`}
                  >
                    {p.volume !== null && (
                      <span className="shrink-0 text-[10px] font-semibold text-muted-foreground bg-muted rounded px-1 py-0.5 leading-none">
                        Lv.{p.volume}
                      </span>
                    )}
                    <span className="text-sm font-medium truncate">{p.name}</span>
                  </button>
                ))
              )}
            </div>

            {/* ── 右スクロール領域 ── */}
            <div ref={scrollRef} className="overflow-x-auto flex-1">
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

                {/* 日ヘッダー（←→ドラッグで日幅を変更） */}
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

                {/* 案件行 */}
                {projects.length === 0 ? (
                  <div
                    style={{ height: ROW_HEIGHT }}
                    className="flex items-center justify-center text-sm text-muted-foreground"
                  >
                    案件がありません。「案件一覧」から登録してください。
                  </div>
                ) : (
                  visibleProjects.map((p) => {
                    let barLeft: number | null = null
                    let barWidth: number | null = null

                    if (p.start_date && p.end_date) {
                      const sd = parseLocalDate(p.start_date)
                      const ed = parseLocalDate(p.end_date)
                      const startIdx = dayDiff(start, sd)
                      const endIdx = dayDiff(start, ed)
                      const clampedStart = Math.max(0, startIdx)
                      const clampedEnd = Math.min(totalDays - 1, endIdx)
                      if (clampedStart <= clampedEnd) {
                        barLeft = clampedStart * dayWidth + 3
                        barWidth = (clampedEnd - clampedStart + 1) * dayWidth - 6
                      }
                    }

                    const barColor = barColorFromProject(p)

                    return (
                      <div
                        key={p.id}
                        style={{
                          height: ROW_HEIGHT,
                          width: totalWidth,
                          position: "relative",
                          backgroundImage: rowBg,
                        }}
                        className="border-b last:border-b-0"
                      >
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

                        {/* バー */}
                        {barLeft !== null && barWidth !== null && (
                          <div
                            className="absolute rounded-md cursor-pointer hover:opacity-80 transition-opacity flex items-center overflow-hidden shadow-sm"
                            style={{
                              left: barLeft,
                              width: barWidth,
                              top: 10,
                              bottom: 10,
                              backgroundColor: barColor,
                            }}
                            onClick={() => setEditProject(p)}
                            title={`${p.name}（クリックで編集）`}
                          >
                            <span className="px-2 text-xs text-white font-medium truncate leading-none">
                              {p.name}
                            </span>
                          </div>
                        )}

                        {/* 日付メモの赤丸（同日はまとめて1つに） */}
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
                            <TooltipProvider key={date}>
                              <Tooltip>
                                <TooltipTrigger
                                  className="absolute rounded-full z-10 cursor-default"
                                  style={{
                                    left: kdIdx * dayWidth + dayWidth / 2 - 5,
                                    top: ROW_HEIGHT / 2 - 5,
                                    width: 10,
                                    height: 10,
                                    backgroundColor: "#ef4444",
                                  }}
                                />
                                <TooltipContent>
                                  <span className="whitespace-pre-line">{labels.join("\n")}</span>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )
                        })}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setAddOpen(true)}
        className="mt-2 w-full rounded-lg border border-dashed border-input py-2 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors cursor-pointer"
      >
        <PlusIcon className="inline-block size-4 mr-1 align-text-bottom" />
        案件を追加
      </button>
      </>
      )}

      {/* ── 担当タブ ── */}
      {activeTab === "assign" && (() => {
        const filteredProjects = showOrderedOnly ? projects.filter((p) => p.status === "受注済") : projects
        const assigneeUsers = users.filter((u) =>
          filteredProjects.some((p) => p.assignee_ids.includes(u.id))
        )
        const visibleAssigneeUsers = assigneeUsers.filter((u) => !hiddenUserIds.has(u.id))
        // ユーザーごとにレーン割り当てを事前計算
        const userLaneData = visibleAssigneeUsers.map((u) => {
          const userProjects = filteredProjects.filter((p) => p.assignee_ids.includes(u.id))
          const { assignments, laneCount } = calcLanes(userProjects)
          return { user: u, assignments, laneCount, rowHeight: laneCount * ROW_HEIGHT }
        })

        return (
          <>
            {/* ツールバー（絞り込み・設定） */}
            <div className="flex justify-end gap-2 mb-2">
              {/* 月/日 切り替えボタングループ */}
              <div className="inline-flex mr-auto">
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
              <div className="rounded-lg border overflow-hidden bg-background">
                <div className="flex">
                  <div
                    style={{ width: LEFT_COL_WIDTH, minWidth: LEFT_COL_WIDTH }}
                    className="shrink-0 border-r bg-background z-10"
                  >
                    <div
                      style={{ height: MONTH_HEADER_HEIGHT + DAY_HEADER_HEIGHT }}
                      className="border-b bg-muted/40 flex items-end px-3 pb-2 text-xs font-semibold text-muted-foreground"
                    >
                      担当者
                    </div>
                    {userLaneData.length === 0 ? (
                      <div style={{ height: ROW_HEIGHT }} className="flex items-center px-3 text-sm text-muted-foreground">
                        担当者なし
                      </div>
                    ) : (
                      userLaneData.map(({ user: u, rowHeight }) => (
                        <div
                          key={u.id}
                          style={{ height: rowHeight }}
                          className="w-full border-b border-black last:border-b-0 flex items-center px-3"
                        >
                          <span className="text-sm font-medium truncate">{u.name}</span>
                        </div>
                      ))
                    )}
                  </div>
                  <div ref={monthViewScrollRef} className="overflow-x-auto flex-1">
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
                      {userLaneData.length === 0 ? (
                        <div style={{ height: ROW_HEIGHT }} className="flex items-center justify-center text-sm text-muted-foreground">
                          担当者が割り当てられた案件がありません。
                        </div>
                      ) : (
                        userLaneData.map(({ user: u, assignments, rowHeight }) => (
                          <div
                            key={u.id}
                            style={{ height: rowHeight, width: totalMonthWidth, position: "relative" }}
                            className="flex border-b border-black last:border-b-0"
                          >
                            {monthViewMonths.map((m) => (
                              <div key={m.label} style={{ width: monthColWidth, minWidth: monthColWidth, flexShrink: 0 }} className="border-r last:border-r-0 h-full" />
                            ))}
                            {assignments.map(({ project: p, lane }) => {
                              const barInfo = calcMonthViewBar(p, monthViewMonths)
                              if (!barInfo) return null
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
                                  <div
                                    className="absolute rounded-md cursor-pointer hover:opacity-80 transition-opacity flex items-center overflow-hidden shadow-sm"
                                    style={{
                                      left: `${barInfo.leftPct}%`,
                                      width: `${barInfo.widthPct}%`,
                                      top: barTop,
                                      height: barHeight,
                                      backgroundColor: barColorFromProject(p),
                                    }}
                                    onClick={() => setEditProject(p)}
                                    title={`${p.name}（クリックで編集）`}
                                  >
                                    <span className="px-2 text-xs text-white font-medium truncate leading-none">
                                      {p.name}
                                    </span>
                                  </div>
                                  {keyDateEntries.map(([date, labels]) => {
                                    const centerPct = keyDateToCenterPct(parseLocalDate(date), monthViewMonths)
                                    if (centerPct === null) return null
                                    return (
                                      <TooltipProvider key={date}>
                                        <Tooltip>
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
                                      </TooltipProvider>
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
              <div className="rounded-lg border overflow-hidden bg-background">
                <div className="flex">
                  {/* 左固定列 */}
                  <div
                    style={{ width: LEFT_COL_WIDTH, minWidth: LEFT_COL_WIDTH }}
                    className="shrink-0 border-r bg-background z-10"
                  >
                    <div style={{ height: MONTH_HEADER_HEIGHT }} className="border-b bg-muted/40" />
                    <div
                      style={{ height: DAY_HEADER_HEIGHT }}
                      className="border-b bg-muted/40 flex items-center px-3 text-xs font-semibold text-muted-foreground"
                    >
                      担当者
                    </div>
                    {userLaneData.length === 0 ? (
                      <div style={{ height: ROW_HEIGHT }} className="flex items-center px-3 text-sm text-muted-foreground">
                        担当者なし
                      </div>
                    ) : (
                      userLaneData.map(({ user: u, rowHeight }) => (
                        <div
                          key={u.id}
                          style={{ height: rowHeight }}
                          className="w-full border-b border-black last:border-b-0 flex items-center px-3"
                        >
                          <span className="text-sm font-medium truncate">{u.name}</span>
                        </div>
                      ))
                    )}
                  </div>

                  {/* 右スクロール領域 */}
                  <div ref={assignScrollRef} className="overflow-x-auto flex-1">
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

                      {/* 日ヘッダー（←→ドラッグで日幅を変更） */}
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

                      {/* 担当者行 */}
                      {userLaneData.length === 0 ? (
                        <div
                          style={{ height: ROW_HEIGHT }}
                          className="flex items-center justify-center text-sm text-muted-foreground"
                        >
                          担当者が割り当てられた案件がありません。
                        </div>
                      ) : (
                        userLaneData.map(({ user: u, assignments, rowHeight }) => {
                          const coveredRanges = showAvailabilityHighlight
                            ? computeEmptyRanges(assignments, start, totalDays, todayIndex, dates, holidaySet)
                            : []
                          return (
                          <div
                            key={u.id}
                            style={{ height: rowHeight, width: totalWidth, position: "relative", backgroundImage: rowBg }}
                            className="border-b border-black last:border-b-0"
                          >
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
                              const sd = parseLocalDate(p.start_date!)
                              const ed = parseLocalDate(p.end_date!)
                              const startIdx = dayDiff(start, sd)
                              const endIdx = dayDiff(start, ed)
                              const clampedStart = Math.max(0, startIdx)
                              const clampedEnd = Math.min(totalDays - 1, endIdx)
                              if (clampedStart > clampedEnd) return null
                              const barLeft = clampedStart * dayWidth + 3
                              const barWidth = (clampedEnd - clampedStart + 1) * dayWidth - 6
                              const barTop = lane * ROW_HEIGHT + 10
                              const barHeight = ROW_HEIGHT - 20
                              return (
                                <div key={p.id}>
                                  <div
                                    className="absolute rounded-md cursor-pointer hover:opacity-80 transition-opacity flex items-center overflow-hidden shadow-sm"
                                    style={{
                                      left: barLeft,
                                      width: barWidth,
                                      top: barTop,
                                      height: barHeight,
                                      backgroundColor: barColorFromProject(p),
                                    }}
                                    onClick={() => setEditProject(p)}
                                    title={`${p.name}（クリックで編集）`}
                                  >
                                    <span className="px-2 text-xs text-white font-medium truncate leading-none">
                                      {p.name}
                                    </span>
                                  </div>
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
                                      <TooltipProvider key={date}>
                                        <Tooltip>
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
                                      </TooltipProvider>
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
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="mt-2 w-full rounded-lg border border-dashed border-input py-2 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors cursor-pointer"
            >
              <PlusIcon className="inline-block size-4 mr-1 align-text-bottom" />
              案件を追加
            </button>
          </>
        )
      })()}

      {/* 編集モーダル */}
      <ProjectEditModal
        project={editProject}
        users={users}
        open={editProject !== null}
        onOpenChange={(open) => !open && setEditProject(null)}
      />

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
                  {customDates.map((date, i) => (
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

      {/* ── 案件追加モーダル ── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-300">
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
    </>
  )
}

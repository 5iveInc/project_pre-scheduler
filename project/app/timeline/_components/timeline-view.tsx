"use client"

import { useState, useTransition, useEffect, useRef } from "react"
import type { Project, User } from "@/database/db"
import { updateProjectTimelineAction } from "@/app/timeline/actions"
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

// ── 定数 ───────────────────────────────────────────────────
const DAY_WIDTH = 32
const ROW_HEIGHT = 48
const MONTH_HEADER_HEIGHT = 30
const DAY_HEADER_HEIGHT = 44
const LEFT_COL_WIDTH = 200

const BAR_COLORS = [
  "#60a5fa", // blue-400
  "#4ade80", // green-400
  "#c084fc", // purple-400
  "#fb923c", // orange-400
  "#f472b6", // pink-400
  "#2dd4bf", // teal-400
  "#f87171", // red-400
  "#facc15", // yellow-400
  "#818cf8", // indigo-400
  "#34d399", // emerald-400
]

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

// ── チェックボックスグループ ────────────────────────────────

function UserCheckboxGroup({
  users,
  name,
  checkedIds,
  onChange,
}: {
  users: User[]
  name: string
  checkedIds: Set<number>
  onChange: (id: number, checked: boolean) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-input p-3">
      {users.map((u) => (
        <label key={u.id} className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            name={name}
            value={u.id}
            checked={checkedIds.has(u.id)}
            onChange={(e) => onChange(u.id, e.target.checked)}
            className="size-4 rounded border-input accent-primary"
          />
          {u.name}
        </label>
      ))}
    </div>
  )
}

// ── プロジェクトフォーム ────────────────────────────────────

function ProjectFormFields({
  users,
  defaultValues,
}: {
  users: User[]
  defaultValues?: {
    name?: string
    assigneeIds?: number[]
    supportIds?: number[]
    startDate?: string | null
    endDate?: string | null
  }
}) {
  const [name, setName] = useState(defaultValues?.name ?? "")
  const [startDate, setStartDate] = useState(defaultValues?.startDate ?? "")
  const [endDate, setEndDate] = useState(defaultValues?.endDate ?? "")
  const [assigneeIds, setAssigneeIds] = useState<Set<number>>(
    new Set(defaultValues?.assigneeIds ?? []),
  )
  const [supportIds, setSupportIds] = useState<Set<number>>(
    new Set(defaultValues?.supportIds ?? []),
  )

  function toggle(setter: typeof setAssigneeIds) {
    return (id: number, checked: boolean) =>
      setter((prev) => {
        const next = new Set(prev)
        if (checked) next.add(id)
        else next.delete(id)
        return next
      })
  }

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="name">案件名</Label>
        <Input
          id="name"
          name="name"
          placeholder="プロジェクト名"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      <div className="flex gap-1">
        <div className="space-y-1.5 w-full">
          <Label>アサイン</Label>
          <UserCheckboxGroup
            users={users}
            name="assigneeId"
            checkedIds={assigneeIds}
            onChange={toggle(setAssigneeIds)}
          />
        </div>
        <div className="space-y-1.5 w-full">
          <Label>サポート</Label>
          <UserCheckboxGroup
            users={users}
            name="supportId"
            checkedIds={supportIds}
            onChange={toggle(setSupportIds)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="startDate">開始日</Label>
          <Input
            id="startDate"
            name="startDate"
            type="date"
            value={startDate ?? ""}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="endDate">終了日</Label>
          <Input
            id="endDate"
            name="endDate"
            type="date"
            value={endDate ?? ""}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>
    </>
  )
}

// ── タイムラインビュー ──────────────────────────────────────

export function TimelineView({
  projects,
  users,
  holidays,
}: {
  projects: Project[]
  users: User[]
  holidays: string[]
}) {
  const holidaySet = new Set(holidays)
  const { start, end } = getDisplayRange(projects)
  const dates = getDates(start, end)
  const monthGroups = getMonthGroups(dates)
  const totalDays = dates.length
  const totalWidth = totalDays * DAY_WIDTH

  const todayLocal = new Date()
  todayLocal.setHours(0, 0, 0, 0)
  const todayIndex = dayDiff(start, todayLocal)
  const showTodayLine = todayIndex >= 0 && todayIndex < totalDays

  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current && todayIndex > 0) {
      scrollRef.current.scrollLeft = todayIndex * DAY_WIDTH
    }
  }, [todayIndex])

  const [editProject, setEditProject] = useState<Project | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSave(formData: FormData) {
    if (!editProject) return
    const name = (formData.get("name") as string).trim()
    const assigneeIds = formData.getAll("assigneeId").map(Number).filter(Boolean)
    const supportIds = formData.getAll("supportId").map(Number).filter(Boolean)
    const startDate = (formData.get("startDate") as string) || null
    const endDate = (formData.get("endDate") as string) || null
    startTransition(async () => {
      await updateProjectTimelineAction(
        editProject.id,
        name,
        assigneeIds,
        supportIds,
        startDate,
        endDate,
      )
      setEditProject(null)
    })
  }

  function toYMD(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  }

  function isRestDay(d: Date): boolean {
    return d.getDay() === 0 || d.getDay() === 6 || holidaySet.has(toYMD(d))
  }

  // 縦グリッド線 + 休日列（土日・祝日）の背景を background-image で合成
  const gridLine = `repeating-linear-gradient(to right, transparent, transparent ${DAY_WIDTH - 1}px, #e5e7eb ${DAY_WIDTH - 1}px, #e5e7eb ${DAY_WIDTH}px)`
  const restBands = dates
    .map((d, i) => {
      if (!isRestDay(d)) return null
      const l = i * DAY_WIDTH
      const r = l + DAY_WIDTH
      return `linear-gradient(to right, transparent ${l}px, #d1d5db ${l}px, #d1d5db ${r}px, transparent ${r}px)`
    })
    .filter(Boolean)
    .join(", ")
  const rowBg = restBands ? `${gridLine}, ${restBands}` : gridLine

  return (
    <>
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
              projects.map((p) => (
                <div
                  key={p.id}
                  style={{ height: ROW_HEIGHT }}
                  className="border-b last:border-b-0 flex items-center px-3 text-sm font-medium truncate"
                  title={p.name}
                >
                  {p.name}
                </div>
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
                    style={{ width: mg.days * DAY_WIDTH, minWidth: mg.days * DAY_WIDTH }}
                    className="border-b border-r last:border-r-0 flex items-center px-2 text-xs font-semibold bg-muted/40 text-foreground"
                  >
                    {mg.label}
                  </div>
                ))}
              </div>

              {/* 日ヘッダー */}
              <div className="flex border-b" style={{ height: DAY_HEADER_HEIGHT }}>
                {dates.map((d, i) => {
                  const isToday = i === todayIndex
                  return (
                    <div
                      key={i}
                      style={{ width: DAY_WIDTH, minWidth: DAY_WIDTH }}
                      className={[
                        "border-r last:border-r-0 flex flex-col items-center justify-center text-[10px] select-none font-medium leading-tight",
                        isToday
                          ? "bg-blue-500 text-white"
                          : isRestDay(d)
                          ? "bg-gray-300 text-muted-foreground"
                          : "text-muted-foreground",
                      ].join(" ")}
                    >
                      <span>{d.getDate()}</span>
                      <span>{["(日)", "(月)", "(火)", "(水)", "(木)", "(金)", "(土)"][d.getDay()]}</span>
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
                projects.map((p, pi) => {
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
                      barLeft = clampedStart * DAY_WIDTH + 3
                      barWidth = (clampedEnd - clampedStart + 1) * DAY_WIDTH - 6
                    }
                  }

                  const barColor = BAR_COLORS[pi % BAR_COLORS.length]

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
                            left: todayIndex * DAY_WIDTH,
                            width: DAY_WIDTH,
                            backgroundColor: "rgba(59,130,246,0.08)",
                          }}
                        />
                      )}

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
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 編集モーダル */}
      <Dialog open={editProject !== null} onOpenChange={(open) => !open && setEditProject(null)}>
        <DialogContent className="sm:max-w-300">
          <DialogHeader>
            <DialogTitle>案件を編集</DialogTitle>
          </DialogHeader>
          {editProject && (
            <form key={editProject.id} action={handleSave} className="space-y-4">
              <ProjectFormFields
                users={users}
                defaultValues={{
                  name: editProject.name,
                  assigneeIds: editProject.assignee_ids,
                  supportIds: editProject.support_ids,
                  startDate: editProject.start_date,
                  endDate: editProject.end_date,
                }}
              />
              <DialogFooter>
                <Button type="submit" disabled={isPending}>
                  保存する
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

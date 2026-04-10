"use client"

import { useState, useTransition } from "react"
import { ArchiveIcon, ArchiveRestoreIcon, GitForkIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  updateProjectAction,
  archiveProjectsAction,
  unarchiveProjectsAction,
  addChildProjectAction,
} from "@/app/project/actions"
import type { Project, User } from "@/database/db"

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

// ── フォームフィールド ──────────────────────────────────────
// 編集・追加モーダル両方から使用するためexport

export function ProjectFormFields({
  users,
  defaultValues,
  hideStatus = false,
  parentDateRange,
  childTasks,
  onChildTaskClick,
}: {
  users: User[]
  defaultValues?: {
    name?: string
    status?: "相談中" | "受注済"
    assigneeIds?: number[]
    supportIds?: number[]
    startDate?: string | null
    endDate?: string | null
    memo?: string | null
    volume?: number | null
    keyDates?: { date: string; label: string }[]
  }
  hideStatus?: boolean
  parentDateRange?: { startDate: string | null; endDate: string | null }
  childTasks?: Project[]
  onChildTaskClick?: (task: Project) => void
}) {
  const [name, setName] = useState(defaultValues?.name ?? "")
  const [status, setStatus] = useState<"相談中" | "受注済">(hideStatus ? "受注済" : (defaultValues?.status ?? "相談中"))
  const [startDate, setStartDate] = useState(defaultValues?.startDate ?? "")
  const [endDate, setEndDate] = useState(defaultValues?.endDate ?? "")
  const [memo, setMemo] = useState(defaultValues?.memo ?? "")
  const [volume, setVolume] = useState<number | null>(defaultValues?.volume ?? 3)
  const [keyDates, setKeyDates] = useState<{ date: string; label: string }[]>(
    defaultValues?.keyDates ?? [],
  )
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

      <div className="flex gap-6">
        <div className="flex-grow flex flex-col gap-4">
          {hideStatus ? (
            <input type="hidden" name="status" value="受注済" />
          ) : (
            <div className="space-y-1.5">
              <Label>ステータス</Label>
              <input type="hidden" name="status" value={status} />
              <div className="flex rounded-md border border-input overflow-hidden w-fit">
                {(["相談中", "受注済"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={[
                      "px-4 py-1.5 text-sm font-medium transition-colors",
                      status === s
                        ? "bg-primary text-primary-foreground"
                        : "bg-background text-muted-foreground hover:bg-muted",
                    ].join(" ")}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

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

          {parentDateRange && (
            <div className="space-y-1.5">
              <Label>親案件の期間</Label>
              <p className="text-sm text-muted-foreground">
                {parentDateRange.startDate ?? "—"} 〜 {parentDateRange.endDate ?? "—"}
              </p>
            </div>
          )}

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
                onFocus={() => {
                  if (!endDate && startDate) setEndDate(startDate)
                }}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>日付メモ</Label>
            <input type="hidden" name="keyDatesJson" value={JSON.stringify(keyDates)} />
            <div className="space-y-2">
              {keyDates.map((kd, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    type="text"
                    placeholder="ラベル"
                    value={kd.label}
                    className="w-[25%]"
                    onChange={(e) =>
                      setKeyDates((prev) => prev.map((d, j) => (j === i ? { ...d, label: e.target.value } : d)))
                    }
                  />
                  <Input
                    type="date"
                    value={kd.date}
                    className="w-[25%]"
                    onChange={(e) =>
                      setKeyDates((prev) => prev.map((d, j) => (j === i ? { ...d, date: e.target.value } : d)))
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setKeyDates((prev) => prev.filter((_, j) => j !== i))}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setKeyDates((prev) => [...prev, { date: "", label: "" }])}
            >
              <PlusIcon className="size-4" />
              日付を追加
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label>ボリューム</Label>
            <input type="hidden" name="volume" value={volume ?? ""} />
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVolume(volume === v ? null : v)}
                  className={[
                    "flex size-8 items-center justify-center rounded-md border text-sm font-medium transition-colors",
                    volume === v
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background text-muted-foreground hover:bg-muted",
                  ].join(" ")}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="memo">メモ</Label>
            <textarea
              id="memo"
              name="memo"
              rows={4}
              placeholder="自由記述"
              value={memo ?? ""}
              onChange={(e) => setMemo(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          </div>
        </div>
        {childTasks && childTasks.length > 0 && (
          <div className="w-[30%] shrink-0 space-y-1.5">
            <Label>子タスク一覧</Label>
            <div className="flex flex-col gap-2 rounded-lg border border-input p-3 h-[500px] overflow-auto">
              {childTasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => onChildTaskClick?.(task)}
                  className="text-left rounded-md px-2 py-1.5 hover:bg-muted transition-colors"
                >
                  <p className="text-sm font-medium leading-snug">{task.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {task.start_date ?? "—"} 〜 {task.end_date ?? "—"}
                  </p>
                  {task.assignee_names.length > 0 && (
                    <p className="text-xs text-muted-foreground">{task.assignee_names.join(", ")}</p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ── 子タスクモーダル ────────────────────────────────────────

export function ChildTaskModal({
  parentProject,
  childTask = null,
  users,
  open,
  onOpenChange,
}: {
  parentProject: Project
  childTask?: Project | null
  users: User[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [isPending, startTransition] = useTransition()

  function handleSave(formData: FormData) {
    startTransition(async () => {
      if (childTask) {
        const name = (formData.get("name") as string).trim()
        const assigneeIds = formData.getAll("assigneeId").map(Number).filter(Boolean)
        const supportIds = formData.getAll("supportId").map(Number).filter(Boolean)
        const startDate = (formData.get("startDate") as string) || null
        const endDate = (formData.get("endDate") as string) || null
        const memo = (formData.get("memo") as string) || null
        const volume = Number(formData.get("volume")) || null
        const rawStatus = formData.get("status") as string | null
        const status = rawStatus === "受注済" ? "受注済" : "相談中"
        let keyDates: { date: string; label: string }[] = []
        try {
          const raw = formData.get("keyDatesJson") as string | null
          if (raw) keyDates = JSON.parse(raw)
        } catch { /* ignore */ }
        await updateProjectAction(childTask.id, name, assigneeIds, supportIds, startDate, endDate, memo, volume, keyDates, status)
      } else {
        await addChildProjectAction(parentProject.id, formData)
      }
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-300 max-h-[95dvh] overflow-auto">
        <DialogHeader>
          <DialogTitle>
            {childTask ? "子タスクを編集" : "子タスクを追加"}
            <span className="ml-2 text-sm font-normal text-muted-foreground">({parentProject.name})</span>
          </DialogTitle>
        </DialogHeader>
        <form key={childTask?.id ?? `child-of-${parentProject.id}`} action={handleSave} className="space-y-4">
          <ProjectFormFields
            users={users}
            hideStatus
            parentDateRange={{ startDate: parentProject.start_date, endDate: parentProject.end_date }}
            defaultValues={childTask ? {
              name: childTask.name,
              assigneeIds: childTask.assignee_ids,
              supportIds: childTask.support_ids,
              startDate: childTask.start_date,
              endDate: childTask.end_date,
              memo: childTask.memo,
              volume: childTask.volume,
              keyDates: childTask.key_dates,
            } : undefined}
          />
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {childTask ? "保存する" : "追加する"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── 編集モーダル ────────────────────────────────────────────

export function ProjectEditModal({
  project,
  users,
  allProjects = [],
  open,
  onOpenChange,
}: {
  project: Project | null
  users: User[]
  allProjects?: Project[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [childModalOpen, setChildModalOpen] = useState(false)
  const [editingChildTask, setEditingChildTask] = useState<Project | null>(null)

  const childTasks = project ? allProjects.filter((p) => p.parent_id === project.id) : []

  function handleSave(formData: FormData) {
    if (!project) return
    const name = (formData.get("name") as string).trim()
    const assigneeIds = formData.getAll("assigneeId").map(Number).filter(Boolean)
    const supportIds = formData.getAll("supportId").map(Number).filter(Boolean)
    const startDate = (formData.get("startDate") as string) || null
    const endDate = (formData.get("endDate") as string) || null
    const memo = (formData.get("memo") as string) || null
    const volume = Number(formData.get("volume")) || null
    const rawStatus = formData.get("status") as string | null
    const status = rawStatus === "受注済" ? "受注済" : "相談中"
    let keyDates: { date: string; label: string }[] = []
    try {
      const raw = formData.get("keyDatesJson") as string | null
      if (raw) keyDates = JSON.parse(raw)
    } catch { /* ignore */ }
    startTransition(async () => {
      await updateProjectAction(project.id, name, assigneeIds, supportIds, startDate, endDate, memo, volume, keyDates, status)
      onOpenChange(false)
    })
  }

  function handleArchiveToggle() {
    if (!project) return
    startTransition(async () => {
      if (project.archived) {
        await unarchiveProjectsAction([project.id])
      } else {
        await archiveProjectsAction([project.id])
      }
      onOpenChange(false)
    })
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-300 max-h-[95dvh] overflow-auto">
        <DialogHeader>
          <DialogTitle>案件を編集</DialogTitle>
        </DialogHeader>
        {project && (
          <form key={project.id} action={handleSave} className="space-y-4">
            <ProjectFormFields
              users={users}
              childTasks={childTasks}
              onChildTaskClick={(task) => setEditingChildTask(task)}
              defaultValues={{
                name: project.name,
                status: project.status,
                assigneeIds: project.assignee_ids,
                supportIds: project.support_ids,
                startDate: project.start_date,
                endDate: project.end_date,
                memo: project.memo,
                volume: project.volume,
                keyDates: project.key_dates,
              }}
            />
            <DialogFooter>
              <div className="flex gap-2 justify-between w-full">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleArchiveToggle}
                    disabled={isPending}
                  >
                    {project.archived ? (
                      <><ArchiveRestoreIcon className="mr-1" />作業中へ戻す</>
                    ) : (
                      <><ArchiveIcon className="mr-1" />アーカイブ</>
                    )}
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => setChildModalOpen(true)}
                  >
                    <GitForkIcon className="mr-1" />子タスクを作成
                  </Button>
                  <Button type="submit" disabled={isPending}>
                    保存する
                  </Button>
                </div>
              </div>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
    {project && (
      <ChildTaskModal
        parentProject={project as Project}
        users={users}
        open={childModalOpen}
        onOpenChange={setChildModalOpen}
      />
    )}
    {project && editingChildTask && (
      <ChildTaskModal
        parentProject={project as Project}
        childTask={editingChildTask}
        users={users}
        open={true}
        onOpenChange={(open) => { if (!open) setEditingChildTask(null) }}
      />
    )}
  </>
  )
}

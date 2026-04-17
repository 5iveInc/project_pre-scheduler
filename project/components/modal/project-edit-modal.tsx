"use client"

import { useState, useTransition } from "react"
import { ArchiveIcon, ArchiveRestoreIcon, GitForkIcon, Trash2Icon } from "lucide-react"
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
  deleteProjectsAction,
  addStakeholderAction,
  removeStakeholderAction,
} from "@/app/project/actions"
import type { Project, User, ProjectLink, Stakeholder } from "@/database/db"

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
  hideLinks = false,
  hideClientName = false,
  parentDateRange,
  childTasks,
  onChildTaskClick,
  onChildTaskDelete,
  stakeholderProjectId,
  initialStakeholders,
}: {
  users: User[]
  defaultValues?: {
    name?: string
    status?: "相談中" | "受注済"
    clientName?: string | null
    assigneeIds?: number[]
    startDate?: string | null
    endDate?: string | null
    memo?: string | null
    volume?: number | null
    keyDates?: { date: string; label: string }[]
    links?: ProjectLink[]
  }
  hideStatus?: boolean
  hideClientName?: boolean
  hideLinks?: boolean
  parentDateRange?: { startDate: string | null; endDate: string | null }
  childTasks?: Project[]
  onChildTaskClick?: (task: Project) => void
  onChildTaskDelete?: (task: Project) => void
  stakeholderProjectId?: number
  initialStakeholders?: Stakeholder[]
}) {
  const [name, setName] = useState(defaultValues?.name ?? "")
  const [clientName, setClientName] = useState(defaultValues?.clientName ?? "")
  const [status, setStatus] = useState<"相談中" | "受注済">(hideStatus ? "受注済" : (defaultValues?.status ?? "相談中"))
  const [startDate, setStartDate] = useState(defaultValues?.startDate ?? "")
  const [endDate, setEndDate] = useState(defaultValues?.endDate ?? "")
  const [memo, setMemo] = useState(defaultValues?.memo ?? "")
  const [volume, setVolume] = useState<number | null>(defaultValues?.volume ?? 3)
  const [keyDates, setKeyDates] = useState<{ date: string; label: string }[]>(
    defaultValues?.keyDates ?? [],
  )
  const [links, setLinks] = useState<ProjectLink[]>(defaultValues?.links ?? [])
  const [newLinkLabel, setNewLinkLabel] = useState("")
  const [newLinkUrl, setNewLinkUrl] = useState("")
  const [editingLinkIndex, setEditingLinkIndex] = useState<number | null>(null)
  const [confirmDeleteLinkIndex, setConfirmDeleteLinkIndex] = useState<number | null>(null)
  const [assigneeIds, setAssigneeIds] = useState<Set<number>>(
    new Set(defaultValues?.assigneeIds ?? []),
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
          {!hideClientName && (
            <div className="space-y-1.5">
              <Label htmlFor="clientName">クライアント名</Label>
              <Input
                id="clientName"
                name="clientName"
                placeholder="クライアント名"
                value={clientName ?? ""}
                onChange={(e) => setClientName(e.target.value)}
              />
            </div>
          )}

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

          <div className="flex gap-4">
            <div className="space-y-1.5 flex-1">
              <Label>アサイン</Label>
              <UserCheckboxGroup
                users={users}
                name="assigneeId"
                checkedIds={assigneeIds}
                onChange={toggle(setAssigneeIds)}
              />
            </div>
            {stakeholderProjectId !== undefined && initialStakeholders !== undefined && (
              <div className="flex-1">
                <StakeholderSection
                  projectId={stakeholderProjectId}
                  initialStakeholders={initialStakeholders}
                />
              </div>
            )}
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

          {!hideLinks && (
          <div className="space-y-2">
            <Label>リンク集（＋で追加後、最後に保存ボタンを押してください。）</Label>
            <input type="hidden" name="linksJson" value={JSON.stringify(links)} />
            {links.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {links.map((link, i) => (
                  confirmDeleteLinkIndex === i ? (
                    <div key={i} className="flex items-center gap-1.5 rounded-full border border-destructive/50 bg-destructive/10 px-3 py-1.5">
                      <span className="text-xs text-destructive">削除しますか？</span>
                      <button
                        type="button"
                        onClick={() => {
                          setLinks((prev) => prev.filter((_, j) => j !== i))
                          setConfirmDeleteLinkIndex(null)
                          if (editingLinkIndex === i) {
                            setEditingLinkIndex(null)
                            setNewLinkLabel("")
                            setNewLinkUrl("")
                          }
                        }}
                        className="text-xs font-medium text-destructive hover:underline"
                      >
                        OK
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteLinkIndex(null)}
                        className="text-xs text-muted-foreground hover:underline"
                      >
                        キャンセル
                      </button>
                    </div>
                  ) : (
                    <div
                      key={i}
                      className={[
                        "group relative inline-flex items-center rounded-full border overflow-hidden transition-colors duration-150",
                        editingLinkIndex === i ? "border-primary bg-primary/10" : "border-input bg-muted/40",
                      ].join(" ")}
                    >
                      {link.url && (
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="absolute inset-0 z-0 group-hover:bg-black transition-colors duration-150"
                        />
                      )}
                      <span
                        className={[
                          "relative z-[1] pointer-events-none px-3 py-2 text-sm leading-none transition-colors duration-150",
                          link.url ? "text-primary group-hover:text-white" : "text-muted-foreground",
                        ].join(" ")}
                      >
                        {link.label || link.url || "（URLなし）"}
                      </span>
                      <div className="relative z-[2] flex items-center gap-1 w-0 overflow-hidden group-hover:w-[3.25rem] transition-[width] duration-200 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingLinkIndex(i)
                            setNewLinkLabel(link.label)
                            setNewLinkUrl(link.url)
                          }}
                          className="flex items-center justify-center size-5 rounded-full text-white hover:bg-white hover:text-black transition-colors shrink-0"
                        >
                          <span className="text-[10px]">✎</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteLinkIndex(i)}
                          className="flex items-center justify-center size-5 rounded-full text-white hover:bg-white hover:text-destructive transition-colors shrink-0"
                        >
                          <Trash2Icon className="size-3" />
                        </button>
                        <span className="w-1.5 shrink-0" />
                      </div>
                    </div>
                  )
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Input
                type="text"
                placeholder="ラベル"
                value={newLinkLabel}
                className="w-[30%]"
                onChange={(e) => setNewLinkLabel(e.target.value)}
              />
              <Input
                type="url"
                placeholder="https://..."
                value={newLinkUrl}
                className="flex-1"
                onChange={(e) => setNewLinkUrl(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => {
                  if (!newLinkLabel && !newLinkUrl) return
                  if (editingLinkIndex !== null) {
                    setLinks((prev) => prev.map((l, j) => j === editingLinkIndex ? { label: newLinkLabel, url: newLinkUrl } : l))
                    setEditingLinkIndex(null)
                  } else {
                    setLinks((prev) => [...prev, { label: newLinkLabel, url: newLinkUrl }])
                  }
                  setNewLinkLabel("")
                  setNewLinkUrl("")
                }}
                className="shrink-0"
              >
                +
              </Button>
            </div>
            {editingLinkIndex !== null && (
              <p className="text-xs text-muted-foreground">
                編集中: 変更を反映するには <span className="font-medium">+</span> を押してください
                <button
                  type="button"
                  onClick={() => { setEditingLinkIndex(null); setNewLinkLabel(""); setNewLinkUrl("") }}
                  className="ml-2 hover:underline"
                >
                  キャンセル
                </button>
              </p>
            )}
          </div>
          )}

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
                <div key={task.id} className="flex items-start gap-1 rounded-md hover:bg-muted transition-colors">
                  <button
                    type="button"
                    onClick={() => onChildTaskClick?.(task)}
                    className="flex-1 text-left px-2 py-1.5 min-w-0"
                  >
                    <p className="text-sm font-medium leading-snug">{task.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {task.start_date ?? "—"} 〜 {task.end_date ?? "—"}
                    </p>
                    {task.assignee_names.length > 0 && (
                      <p className="text-xs text-muted-foreground">{task.assignee_names.join(", ")}</p>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onChildTaskDelete?.(task)}
                    className="shrink-0 p-1.5 mt-0.5 text-muted-foreground hover:text-destructive transition-colors rounded"
                  >
                    <Trash2Icon className="size-3.5" />
                  </button>
                </div>
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
        let links: ProjectLink[] = []
        try {
          const raw = formData.get("linksJson") as string | null
          if (raw) links = JSON.parse(raw)
        } catch { /* ignore */ }
        await updateProjectAction(childTask.id, name, assigneeIds, null, startDate, endDate, memo, volume, keyDates, status, links)
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
            hideLinks
            hideClientName
            parentDateRange={{ startDate: parentProject.start_date, endDate: parentProject.end_date }}
            defaultValues={childTask ? {
              name: childTask.name,
              assigneeIds: childTask.assignee_ids,
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

// ── 関係者セクション（親案件専用）────────────────────────────

function StakeholderSection({
  projectId,
  initialStakeholders,
}: {
  projectId: number
  initialStakeholders: Stakeholder[]
}) {
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>(initialStakeholders)
  const [inputName, setInputName] = useState("")
  const [isPending, startTransition] = useTransition()

  function handleAdd() {
    const name = inputName.trim()
    if (!name) return
    startTransition(async () => {
      const added = await addStakeholderAction(projectId, name)
      setStakeholders((prev) => [...prev, added])
      setInputName("")
    })
  }

  function handleRemove(id: number) {
    startTransition(async () => {
      await removeStakeholderAction(id)
      setStakeholders((prev) => prev.filter((s) => s.id !== id))
    })
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Label className="shrink-0">関係者</Label>
        <div className="flex flex-1 gap-2">
        <Input
          type="text"
          placeholder="名前を入力"
          value={inputName}
          onChange={(e) => setInputName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault()
              handleAdd()
            }
          }}
          disabled={isPending}
        />
        <Button
          type="button"
          variant="outline"
          onClick={handleAdd}
          disabled={isPending || !inputName.trim()}
          className="shrink-0"
        >
          追加
        </Button>
        </div>
      </div>
      <div className="rounded-lg border border-input p-3 min-h-[4rem] max-h-40 overflow-y-auto">
        {stakeholders.length === 0 ? (
          <p className="text-muted-foreground/50" style={{ fontSize: 12 }}>なし</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {stakeholders.map((s) => (
              <span
                key={s.id}
                className="inline-flex items-center gap-1 rounded-full border border-input bg-muted/60 px-2.5 py-1"
                style={{ fontSize: 12 }}
              >
                {s.name}
                <button
                  type="button"
                  onClick={() => handleRemove(s.id)}
                  disabled={isPending}
                  className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                >
                  <Trash2Icon className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
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
  const [confirmDeleteTask, setConfirmDeleteTask] = useState<Project | null>(null)

  const childTasks = project ? allProjects.filter((p) => p.parent_id === project.id) : []

  function handleDeleteChildTask() {
    if (!confirmDeleteTask) return
    startTransition(async () => {
      await deleteProjectsAction([confirmDeleteTask.id])
      setConfirmDeleteTask(null)
    })
  }

  function handleSave(formData: FormData) {
    if (!project) return
    const name = (formData.get("name") as string).trim()
    const assigneeIds = formData.getAll("assigneeId").map(Number).filter(Boolean)
    const clientName = (formData.get("clientName") as string) || null
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
    let links: ProjectLink[] = []
    try {
      const raw = formData.get("linksJson") as string | null
      if (raw) links = JSON.parse(raw)
    } catch { /* ignore */ }
    startTransition(async () => {
      await updateProjectAction(project.id, name, assigneeIds, clientName, startDate, endDate, memo, volume, keyDates, status, links)
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
              onChildTaskDelete={(task) => setConfirmDeleteTask(task)}
              defaultValues={{
                name: project.name,
                status: project.status,
                clientName: project.client_name,
                assigneeIds: project.assignee_ids,
                startDate: project.start_date,
                endDate: project.end_date,
                memo: project.memo,
                volume: project.volume,
                keyDates: project.key_dates,
                links: project.links,
              }}
              hideClientName={project.parent_id !== null}
              {...(project.parent_id === null && {
                stakeholderProjectId: project.id,
                initialStakeholders: project.stakeholders,
              })}
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
    <Dialog open={confirmDeleteTask !== null} onOpenChange={(open) => { if (!open) setConfirmDeleteTask(null) }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>子タスクを削除</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          「{confirmDeleteTask?.name}」を削除しますか？この操作は取り消せません。
        </p>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setConfirmDeleteTask(null)} disabled={isPending}>
            キャンセル
          </Button>
          <Button variant="destructive" onClick={handleDeleteChildTask} disabled={isPending}>
            削除する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
  )
}

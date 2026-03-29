"use client"

import { useState, useTransition } from "react"
import { ArchiveIcon, ArchiveRestoreIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  addProjectAction,
  updateProjectAction,
  deleteProjectsAction,
  archiveProjectsAction,
  unarchiveProjectsAction,
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

// ── 共通フォームフィールド ──────────────────────────────────

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
    memo?: string | null
    volume?: number | null
  }
}) {
  const [name, setName] = useState(defaultValues?.name ?? "")
  const [startDate, setStartDate] = useState(defaultValues?.startDate ?? "")
  const [endDate, setEndDate] = useState(defaultValues?.endDate ?? "")
  const [memo, setMemo] = useState(defaultValues?.memo ?? "")
  const [volume, setVolume] = useState<number | null>(defaultValues?.volume ?? 3)
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
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="endDate">終了日</Label>
          <Input
            id="endDate"
            name="endDate"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
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
    </>
  )
}

// ── テーブル列のアサイン表示ラベル ─────────────────────────

function buildAssigneeLabel(project: Project): string | null {
  const names = project.assignee_names
  const supportCount = project.support_ids.length

  if (names.length === 0 && supportCount === 0) return null

  const namesPart = names.join(", ")
  const supportPart = supportCount > 0 ? `他${supportCount}名` : ""

  if (namesPart && supportPart) return `${namesPart} ${supportPart}`
  return namesPart || supportPart
}

// ── 行（読み取り専用 + 編集モーダル） ─────────────────────────

function ProjectRow({
  project,
  users,
  checked,
  onCheckedChange,
}: {
  project: Project
  users: User[]
  checked: boolean
  onCheckedChange: () => void
}) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSave(formData: FormData) {
    const name = (formData.get("name") as string).trim()
    const assigneeIds = formData.getAll("assigneeId").map(Number).filter(Boolean)
    const supportIds = formData.getAll("supportId").map(Number).filter(Boolean)
    const startDate = (formData.get("startDate") as string) || null
    const endDate = (formData.get("endDate") as string) || null
    const memo = (formData.get("memo") as string) || null
    const volume = Number(formData.get("volume")) || null
    startTransition(async () => {
      await updateProjectAction(project.id, name, assigneeIds, supportIds, startDate, endDate, memo, volume)
      setOpen(false)
    })
  }

  function handleArchiveToggle() {
    startTransition(async () => {
      if (project.archived) {
        await unarchiveProjectsAction([project.id])
      } else {
        await archiveProjectsAction([project.id])
      }
      setOpen(false)
    })
  }

  const label = buildAssigneeLabel(project)

  return (
    <>
      <TableRow
        className="cursor-pointer"
        data-state={checked ? "selected" : undefined}
        onClick={() => setOpen(true)}
      >
        <TableCell className="pl-6" onClick={(e) => e.stopPropagation()}>
          <Checkbox checked={checked} onCheckedChange={onCheckedChange} />
        </TableCell>
        <TableCell className="font-medium">{project.name}</TableCell>
        <TableCell className="text-muted-foreground">
          {label ?? <span className="text-muted-foreground/50">未アサイン</span>}
        </TableCell>
        <TableCell className="text-muted-foreground">
          {project.start_date ?? <span className="text-muted-foreground/50">—</span>}
        </TableCell>
        <TableCell className="pr-6 text-muted-foreground">
          {project.end_date ?? <span className="text-muted-foreground/50">—</span>}
        </TableCell>
      </TableRow>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-300">
          <DialogHeader>
            <DialogTitle>案件を編集</DialogTitle>
          </DialogHeader>
          <form key={String(open)} action={handleSave} className="space-y-4">
            <ProjectFormFields
              users={users}
              defaultValues={{
                name: project.name,
                assigneeIds: project.assignee_ids,
                supportIds: project.support_ids,
                startDate: project.start_date,
                endDate: project.end_date,
                memo: project.memo,
                volume: project.volume,
              }}
            />
            <DialogFooter>
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
              <Button type="submit" disabled={isPending}>
                保存する
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ── テーブル ────────────────────────────────────────────────

type Tab = "active" | "archived"

export function ProjectTable({
  projects,
  users,
}: {
  projects: Project[]
  users: User[]
}) {
  const [tab, setTab] = useState<Tab>("active")
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set())
  const [addOpen, setAddOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const activeProjects = projects.filter((p) => !p.archived)
  const archivedProjects = projects.filter((p) => p.archived)
  const visibleProjects = tab === "active" ? activeProjects : archivedProjects

  function toggleCheck(id: number) {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function switchTab(next: Tab) {
    setTab(next)
    setCheckedIds(new Set())
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteProjectsAction(Array.from(checkedIds))
      setCheckedIds(new Set())
    })
  }

  function handleArchive() {
    startTransition(async () => {
      await archiveProjectsAction(Array.from(checkedIds))
      setCheckedIds(new Set())
    })
  }

  function handleUnarchive() {
    startTransition(async () => {
      await unarchiveProjectsAction(Array.from(checkedIds))
      setCheckedIds(new Set())
    })
  }

  function handleAdd(formData: FormData) {
    startTransition(async () => {
      await addProjectAction(formData)
      setAddOpen(false)
    })
  }

  return (
    <Card>
      <CardHeader className="pb-0">
        {/* タブ */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            <button
              type="button"
              onClick={() => switchTab("active")}
              className={[
                "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                tab === "active"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              作業中
              <Badge variant="secondary" className="text-xs">{activeProjects.length}</Badge>
            </button>
            <button
              type="button"
              onClick={() => switchTab("archived")}
              className={[
                "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                tab === "archived"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              アーカイブ
              <Badge variant="secondary" className="text-xs">{archivedProjects.length}</Badge>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {checkedIds.size > 0 && tab === "active" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleArchive}
                  disabled={isPending}
                >
                  <ArchiveIcon />
                  アーカイブ ({checkedIds.size})
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDelete}
                  disabled={isPending}
                >
                  <Trash2Icon />
                  削除 ({checkedIds.size})
                </Button>
              </>
            )}
            {checkedIds.size > 0 && tab === "archived" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleUnarchive}
                  disabled={isPending}
                >
                  <ArchiveRestoreIcon />
                  戻す ({checkedIds.size})
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDelete}
                  disabled={isPending}
                >
                  <Trash2Icon />
                  削除 ({checkedIds.size})
                </Button>
              </>
            )}
            {tab === "active" && (
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <PlusIcon />
                案件を追加
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0 pt-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 pl-6" />
              <TableHead>案件名</TableHead>
              <TableHead className="w-56">アサイン / サポート</TableHead>
              <TableHead className="w-36">開始日</TableHead>
              <TableHead className="w-36 pr-6">終了日</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleProjects.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  {tab === "active"
                    ? "案件がありません。「案件を追加」から登録してください。"
                    : "アーカイブされた案件はありません。"}
                </TableCell>
              </TableRow>
            ) : (
              visibleProjects.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  users={users}
                  checked={checkedIds.has(project.id)}
                  onCheckedChange={() => toggleCheck(project.id)}
                />
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>

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
    </Card>
  )
}

"use client"

import { useState, useTransition } from "react"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
} from "@/app/project/actions"
import type { Project, User } from "@/database/db"

// ── 共通フォームフィールド ──────────────────────────────────

function ProjectFormFields({
  users,
  defaultValues,
}: {
  users: User[]
  defaultValues?: {
    name?: string
    assigneeIds?: number[]
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

  function toggleAssignee(id: number, checked: boolean) {
    setAssigneeIds((prev) => {
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

      <div className="space-y-1.5">
        <Label>アサイン</Label>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-input p-3">
          {users.map((u) => (
            <label
              key={u.id}
              className="flex cursor-pointer items-center gap-2 text-sm"
            >
              <input
                type="checkbox"
                name="assigneeId"
                value={u.id}
                checked={assigneeIds.has(u.id)}
                onChange={(e) => toggleAssignee(u.id, e.target.checked)}
                className="size-4 rounded border-input accent-primary"
              />
              {u.name}
            </label>
          ))}
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
    </>
  )
}

// ── 行（読み取り専用 + 編集モーダル） ─────────────────────────

function assigneeLabel(project: Project, users: User[]): string | null {
  if (project.assignee_ids.length === 0) return null
  const first = users.find((u) => u.id === project.assignee_ids[0])?.name ?? null
  if (project.assignee_ids.length === 1) return first
  return first ? `${first}　他${project.assignee_ids.length - 1}名` : `${project.assignee_ids.length}名`
}

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
    const startDate = (formData.get("startDate") as string) || null
    const endDate = (formData.get("endDate") as string) || null
    startTransition(async () => {
      await updateProjectAction(project.id, name, assigneeIds, startDate, endDate)
      setOpen(false)
    })
  }

  const label = assigneeLabel(project, users)

  return (
    <>
      <TableRow
        className="cursor-pointer"
        data-state={checked ? "selected" : undefined}
        onClick={() => setOpen(true)}
      >
        <TableCell
          className="pl-6"
          onClick={(e) => e.stopPropagation()}
        >
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>案件を編集</DialogTitle>
          </DialogHeader>
          <form key={String(open)} action={handleSave} className="space-y-4">
            <ProjectFormFields
              users={users}
              defaultValues={{
                name: project.name,
                assigneeIds: project.assignee_ids,
                startDate: project.start_date,
                endDate: project.end_date,
              }}
            />
            <DialogFooter>
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

export function ProjectTable({
  projects,
  users,
}: {
  projects: Project[]
  users: User[]
}) {
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set())
  const [addOpen, setAddOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function toggleCheck(id: number) {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteProjectsAction(Array.from(checkedIds))
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
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div className="flex items-center gap-3">
          <CardTitle className="text-base font-medium">案件リスト</CardTitle>
          <Badge variant="secondary">{projects.length} 件</Badge>
        </div>
        <div className="flex items-center gap-2">
          {checkedIds.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={isPending}
            >
              <Trash2Icon />
              削除 ({checkedIds.size})
            </Button>
          )}
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <PlusIcon />
            案件を追加
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 pl-6" />
              <TableHead>案件名</TableHead>
              <TableHead className="w-48">アサイン</TableHead>
              <TableHead className="w-36">開始日</TableHead>
              <TableHead className="w-36 pr-6">終了日</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  案件がありません。「案件を追加」から登録してください。
                </TableCell>
              </TableRow>
            ) : (
              projects.map((project) => (
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

      {/* 追加モーダル */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
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

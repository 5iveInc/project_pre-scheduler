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
  deleteProjectsAction,
  archiveProjectsAction,
  unarchiveProjectsAction,
} from "@/app/project/actions"
import { ProjectEditModal, ProjectFormFields } from "@/components/modal/project-edit-modal"
import type { Project, User } from "@/database/db"

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

      <ProjectEditModal
        project={project}
        users={users}
        open={open}
        onOpenChange={setOpen}
      />
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

  const activeProjects = projects.filter((p) => !p.archived && p.parent_id === null)
  const archivedProjects = projects.filter((p) => p.archived && p.parent_id === null)
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

      {/* 案件追加モーダル */}
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
    </Card>
  )
}

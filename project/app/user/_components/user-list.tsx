"use client"

import { useState, useTransition } from "react"
import { PlusIcon, Trash2Icon, PencilIcon } from "lucide-react"
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
  DialogTrigger,
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
import { addUserAction, updateUserAction, deleteUsersAction } from "@/app/user/actions"
import type { User } from "@/database/db"

// ── 編集行 ──────────────────────────────────────────────────

function EditUserForm({ user, onSave }: { user: User; onSave: (formData: FormData) => void }) {
  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email)

  return (
    <form action={onSave} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="edit-name">名前</Label>
        <Input
          id="edit-name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="edit-email">メールアドレス</Label>
        <Input
          id="edit-email"
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <DialogFooter>
        <Button type="submit">保存する</Button>
      </DialogFooter>
    </form>
  )
}

function UserRow({
  user,
  checked,
  onCheckedChange,
}: {
  user: User
  checked: boolean
  onCheckedChange: () => void
}) {
  const [open, setOpen] = useState(false)
  const [, startTransition] = useTransition()

  function handleEdit(formData: FormData) {
    startTransition(async () => {
      await updateUserAction(user.id, formData)
      setOpen(false)
    })
  }

  return (
    <>
      <TableRow data-state={checked ? "selected" : undefined}>
        <TableCell className="pl-6">
          <Checkbox checked={checked} onCheckedChange={onCheckedChange} />
        </TableCell>
        <TableCell className="font-medium">{user.name}</TableCell>
        <TableCell className="text-muted-foreground">{user.email}</TableCell>
        <TableCell className="text-right text-muted-foreground">
          {user.created_at.slice(0, 10).replace(/-/g, "/")}
        </TableCell>
        <TableCell className="pr-6 text-right">
          <Button variant="ghost" size="icon-sm" onClick={() => setOpen(true)}>
            <PencilIcon />
          </Button>
        </TableCell>
      </TableRow>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ユーザーを編集</DialogTitle>
          </DialogHeader>
          {open && <EditUserForm key={user.id} user={user} onSave={handleEdit} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

// ── リスト ──────────────────────────────────────────────────

export function UserList({ users }: { users: User[] }) {
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set())
  const [dialogOpen, setDialogOpen] = useState(false)
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
      await deleteUsersAction(Array.from(checkedIds))
      setCheckedIds(new Set())
    })
  }

  function handleAdd(formData: FormData) {
    startTransition(async () => {
      await addUserAction(formData)
      setDialogOpen(false)
    })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div className="flex items-center gap-3">
          <CardTitle className="text-base font-medium">ユーザーリスト</CardTitle>
          <Badge variant="secondary">{users.length} 人</Badge>
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

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger render={<Button size="sm" />}>
              <PlusIcon />
              ユーザーを追加
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>ユーザーを追加</DialogTitle>
              </DialogHeader>
              <form action={handleAdd} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name">名前</Label>
                  <Input id="name" name="name" placeholder="田中 太郎" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">メールアドレス</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="taro@example.com"
                    required
                  />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={isPending}>
                    追加する
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 pl-6" />
              <TableHead>名前</TableHead>
              <TableHead>メールアドレス</TableHead>
              <TableHead className="text-right">登録日時</TableHead>
              <TableHead className="w-12 pr-6" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                checked={checkedIds.has(user.id)}
                onCheckedChange={() => toggleCheck(user.id)}
              />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

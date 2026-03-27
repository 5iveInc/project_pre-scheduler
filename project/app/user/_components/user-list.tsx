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
import { addUserAction, deleteUsersAction } from "@/app/user/actions"
import type { User } from "@/database/db"

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
              <TableHead className="pr-6 text-right">登録日時</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow
                key={user.id}
                data-state={checkedIds.has(user.id) ? "selected" : undefined}
              >
                <TableCell className="pl-6">
                  <Checkbox
                    checked={checkedIds.has(user.id)}
                    onCheckedChange={() => toggleCheck(user.id)}
                  />
                </TableCell>
                <TableCell className="font-medium">{user.name}</TableCell>
                <TableCell className="text-muted-foreground">{user.email}</TableCell>
                <TableCell className="pr-6 text-right text-muted-foreground">
                  {user.created_at.slice(0, 10).replace(/-/g, "/")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

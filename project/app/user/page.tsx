import { getUsers } from "@/database/db"
import { UserList } from "@/app/user/_components/user-list"

export default function UserPage() {
  const users = getUsers()

  return (
    <div className="main">
      <div className="bg-background p-8">
        <div className="mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">ユーザー一覧</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              登録済みユーザーの一覧です。
            </p>
          </div>

          <UserList users={users} />
        </div>
      </div>
    </div>
  )
}

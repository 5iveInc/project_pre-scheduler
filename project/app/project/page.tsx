import { getProjects, getUsers } from "@/database/db"
import { ProjectTable } from "@/app/project/_components/project-table"

export default function ProjectPage() {
  const projects = getProjects()
  const users = getUsers()

  return (
    <main>
      <div className="bg-background p-8">
        <div className="mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">案件一覧</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              案件の登録・編集・削除ができます。各セルはクリックして直接編集できます。
            </p>
          </div>

          <ProjectTable projects={projects} users={users} />
        </div>
      </div>
    </main>
  )
}

import { getProjects, getUsers } from "@/database/db"
import { TimelineView } from "@/app/timeline/_components/timeline-view"

export default function TimelinePage() {
  const projects = getProjects()
  const users = getUsers()

  return (
    <div className="main">
      <div className="bg-background p-8">
        <div className="mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">タイムライン</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              案件のスケジュールをタイムラインで確認できます。バーをクリックすると編集できます。
            </p>
          </div>

          <TimelineView projects={projects} users={users} />
        </div>
      </div>
    </div>
  )
}
